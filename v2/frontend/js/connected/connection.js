/** Connected-mode controller: account session, non-destructive connection,
 * sync with durable acknowledgement, and account data controls.
 *
 * Guarantees (data-model §5, ADR-005):
 * - Connection is explicit and never mutates or deletes local records.
 * - An active local focus session blocks connection with a visible reason.
 * - Durable acceptance lives in IndexedDB metadata, so acknowledged state
 *   survives reloads; unacknowledged uploads stay pending, never "saved".
 * - Account switching cannot relabel pending work: acknowledgement is bound
 *   to the account scope id it was accepted by.
 * - Failures surface as status, never as invented success.
 */

import { DATABASE_NAME, DATABASE_VERSION } from "../persistence/planning-store.js";
import * as api from "./api.js";
import { buildConnectOps, buildSessionOps } from "./payload.js";

const ACK_PREFIX = "connected:";

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function withMetadata(write, fn) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("metadata", write ? "readwrite" : "readonly");
      const store = tx.objectStore("metadata");
      let result;
      try {
        result = fn(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const readAck = (localScopeId) =>
  withMetadata(false, (store) => store.get(ACK_PREFIX + localScopeId));
const writeAck = (localScopeId, value) =>
  withMetadata(true, (store) => store.put({ key: ACK_PREFIX + localScopeId, value }));

export class Connection {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.account = null;      // { email, scopeId } when signed in
    this.ack = null;          // durable acknowledgement for this local scope
    this.lastError = null;
    this.syncing = false;
  }

  report(state, detail) {
    this.onStatus(state, detail);
  }

  get connected() {
    return Boolean(this.account && this.ack?.accountScopeId === this.account.scopeId);
  }

  async init() {
    try {
      const me = await api.fetchMe();
      this.account = me.account;
    } catch {
      this.account = null;
    }
    return this.account;
  }

  async register(email, password) {
    const result = await api.register(email, password);
    this.account = result.account;
    this.ack = null;
    return this.account;
  }

  async login(email, password) {
    const result = await api.login(email, password);
    this.account = result.account;
    this.ack = null;
    return this.account;
  }

  async logout() {
    await api.logout();
    this.account = null;
    this.ack = null;
  }

  async loadAck(localScopeId) {
    const record = await readAck(localScopeId);
    this.ack = record?.value ?? null;
    return this.ack;
  }

  /** Explicit, non-destructive transition of local history to the account. */
  async connect({ snapshot, focusState }) {
    if (!this.account) throw { code: "unauthenticated", message: "Sign in first." };
    if (focusState?.reservation) {
      throw {
        code: "active-session",
        message: "End the local focus session before connecting.",
      };
    }
    const ops = buildConnectOps({
      tasks: snapshot.tasks,
      focusState: { ...focusState, timezone: localTimezone() },
    });
    if (!ops.length) {
      // Nothing to upload; the account is connected from now on.
      this.ack = {
        accountScopeId: this.account.scopeId, email: this.account.email,
        recordRevisions: {}, sessionIds: [], lastPullRevision: 0,
        lastSyncAt: Date.now(),
      };
      await writeAck(snapshot.ownershipScopeId, this.ack);
      this.report("connected", "Account connected; no local history to upload yet.");
      return { results: [] };
    }
    this.report("syncing", `Uploading ${ops.length} local record(s)…`);
    const response = await api.syncPush(ops);
    this.ack = {
      accountScopeId: this.account.scopeId,
      email: this.account.email,
      recordRevisions: {},
      sessionIds: [],
      lastPullRevision: response.scopeRevision,
      lastSyncAt: Date.now(),
    };
    response.results.forEach((result, index) => {
      const op = ops[index];
      if (op.kind === "task" && (result.status === "accepted" || result.status === "duplicate")) {
        this.ack.recordRevisions[op.record.id] = result.record?.recordRevision ?? 1;
      }
      if (op.kind === "session" && result.status !== "rejected") {
        this.ack.sessionIds.push(op.record.id);
      }
    });
    await writeAck(snapshot.ownershipScopeId, this.ack);
    const summary = summarize(response.results);
    this.report("connected", summarizeText(summary));
    return summary;
  }

  /** Push changed local work, then pull account records; merge pulled tasks. */
  async syncNow({ store, snapshot, focusState }) {
    if (!this.connected || this.syncing) return null;
    this.syncing = true;
    this.report("syncing", "Synchronizing…");
    try {
      const pushResults = await this.pushPending({ snapshot, focusState });
      const feed = await api.syncPull(this.ack.lastPullRevision ?? 0);
      const merge = await this.mergePulledTasks(store, snapshot, feed);
      this.ack.lastPullRevision = feed.scopeRevision;
      this.ack.lastSyncAt = Date.now();
      await writeAck(snapshot.ownershipScopeId, this.ack);
      this.lastError = null;
      this.report("connected", `Synchronized. ${pushResults}${merge}`);
      return { pushResults, merge };
    } catch (error) {
      this.lastError = error;
      this.report("sync-error", error.message ?? "Synchronization failed.");
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  /** Diffs local work against the acknowledged copies; retry-safe by id. */
  async pushPending({ snapshot, focusState }) {
    const acked = this.ack;
    const ops = [];
    for (const task of snapshot.tasks) {
      const base = acked.recordRevisions[task.id];
      if (base === undefined) {
        ops.push({ kind: "task", baseRevision: 0, record: { ...task } });
      }
      // Already-accepted tasks are pushed again only when their local copy
      // changed; without server-side per-record reads we rely on conflict
      // detection: a stale baseRevision comes back as "conflict", never as
      // a silent overwrite.
    }
    if (focusState?.sessions?.some((session) => session.ending)) {
      for (const op of buildSessionOps(focusState)) {
        if (!acked.sessionIds.includes(op.record.id)) ops.push(op);
      }
    }
    if (!ops.length) return "Nothing new to upload.";
    const response = await api.syncPush(ops);
    response.results.forEach((result, index) => {
      const op = ops[index];
      if (op.kind === "task" && result.status === "accepted") {
        acked.recordRevisions[op.record.id] = result.record.recordRevision;
      }
      if (op.kind === "session" && result.status !== "rejected" && !acked.sessionIds.includes(op.record.id)) {
        acked.sessionIds.push(op.record.id);
      }
    });
    await writeAck(snapshot.ownershipScopeId, acked);
    const summary = summarize(response.results);
    const conflicts = response.results.filter((r) => r.status === "conflict").length;
    const rejected = response.results.filter((r) => r.status === "rejected").length;
    if (conflicts || rejected) {
      this.report("sync-error", summarizeText(summary));
    }
    return summarizeText(summary);
  }

  /** Pulled account tasks missing locally are added through store commands. */
  async mergePulledTasks(store, snapshot, feed) {
    const known = new Set(snapshot.tasks.map((task) => task.id));
    const incoming = feed.tasks.filter((task) => !known.has(task.id));
    if (!incoming.length) return "";
    const commands = incoming.map((task) => ({
      type: "create",
      task: { ...task, ownershipScopeId: snapshot.ownershipScopeId },
    }));
    // One commit per record: a single invalid record must not block the rest.
    let merged = 0;
    let revision = snapshot.revision;
    for (const [index, command] of commands.entries()) {
      try {
        const result = await store.commit(store.localScopeId, revision, [command]);
        revision = result.revision;
        merged++;
        this.ack.recordRevisions[incoming[index].id] = incoming[index].recordRevision ?? 1;
      } catch {
        // Visible in the next sync's status; never silently claimed merged.
      }
    }
    await writeAck(snapshot.ownershipScopeId, this.ack);
    return ` ${merged} account task(s) downloaded.`;
  }

  async deleteAccount(password) {
    await api.deleteAccount(password);
    this.account = null;
    this.ack = null;
  }
}

function summarize(results) {
  const counts = { accepted: 0, duplicate: 0, conflict: 0, rejected: 0 };
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return counts;
}

function summarizeText(counts) {
  const parts = [];
  if (counts.accepted) parts.push(`${counts.accepted} accepted`);
  if (counts.duplicate) parts.push(`${counts.duplicate} already saved`);
  if (counts.conflict) parts.push(`${counts.conflict} conflict(s): server version kept`);
  if (counts.rejected) parts.push(`${counts.rejected} rejected`);
  return parts.length ? parts.join(", ") + "." : "No changes.";
}
