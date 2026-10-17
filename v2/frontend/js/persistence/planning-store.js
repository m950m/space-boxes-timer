import { requireReference } from "../domain/logical-reference.js";
import {
  createTaskPlanningRecord, updateTaskPlanningRecord, rescheduleTaskPlanningRecord,
  cancelTaskPlanningRecord, completeTaskPlanningRecord,
} from "../domain/task-planning.js";
import { setTaskClassification } from "../domain/task-classification.js";
import { setTaskParent, splitTaskPlanningRecord } from "../domain/task-hierarchy.js";
import { createFocusState, validateFocusState, transitionFocus } from "../focus/focus-lifecycle.js";
import { BACKUP_FORMAT, BACKUP_VERSION, validateTasks, validateWorkspaceBackup } from "./backup-format.js";

export const DATABASE_NAME = "space-boxes-v2";
export const DATABASE_VERSION = 2;
const PLANNING_STORES = ["metadata", "scopes", "tasks"];
const STORES = [...PLANNING_STORES, "focus"];

function validateSchema(tx, names = STORES) {
  if (JSON.stringify([...tx.db.objectStoreNames]) !== JSON.stringify([...names].sort())) {
    throw new TypeError("Invalid storage schema.");
  }
  for (const [name, keyPath] of [["metadata", "key"], ["scopes", "ownershipScopeId"],
    ["tasks", ["ownershipScopeId", "id"]], ...(names.includes("focus") ? [["focus", "ownershipScopeId"]] : [])]) {
    if (JSON.stringify(tx.objectStore(name).keyPath) !== JSON.stringify(keyPath)) throw new TypeError("Invalid storage key structure.");
  }
  const index = tx.objectStore("tasks").index("scope");
  if (index.keyPath !== "ownershipScopeId" || index.unique || index.multiEntry) throw new TypeError("Invalid scope index.");
}

function hydrateFocus(record, scopeId, tasks) {
  const state = record === undefined ? createFocusState(scopeId) : validateFocusState(record);
  if (state.ownershipScopeId !== scopeId || state.sessions.some((session) => !tasks.some((task) => task.id === session.taskId))) {
    throw new TypeError("Invalid local focus/task association.");
  }
  return state;
}

function hydrate(scopeId, scope, records) {
  if (!scope) {
    if (records.length) throw new TypeError("Tasks have no scope metadata.");
    return { ownershipScopeId: scopeId, revision: 0, tasks: [] };
  }
  if (scope.ownershipScopeId !== scopeId || !Number.isSafeInteger(scope.revision)
      || scope.revision < 1 || !Array.isArray(scope.taskIds)
      || new Set(scope.taskIds).size !== scope.taskIds.length
      || scope.taskIds.length !== records.length) throw new TypeError("Invalid scope metadata.");
  const byId = new Map(records.map((task) => [task.id, task]));
  const tasks = scope.taskIds.map((id) => {
    requireReference(id, "task id");
    if (!byId.has(id)) throw new TypeError("Scope references a missing task.");
    return byId.get(id);
  });
  validateTasks(tasks, scopeId);
  return { ownershipScopeId: scopeId, revision: scope.revision, tasks };
}

function applyCommand(tasks, scopeId, command) {
  if (!command || typeof command !== "object") throw new TypeError("A planning command is required.");
  if (command.type === "create") {
    return [...tasks, createTaskPlanningRecord(command.task)];
  }
  if (command.type === "classify") {
    return setTaskClassification(tasks, scopeId, command.taskId, command.classification);
  }
  if (command.type === "reschedule") {
    return rescheduleTaskPlanningRecord(tasks, scopeId, command.taskId, command.planDayId, command.plannedStart, command.planDay);
  }
  if (command.type === "parent") return setTaskParent(tasks, scopeId, command.taskId, command.parentTaskId);
  if (command.type === "split") return splitTaskPlanningRecord(tasks, scopeId, command.taskId, command.newWork);
  requireReference(command.taskId, "taskId");
  const target = tasks.find((task) => task.id === command.taskId);
  if (!target) throw new RangeError("Task was not found in the requested scope.");
  let next;
  switch (command.type) {
    case "edit": next = updateTaskPlanningRecord(target, command.changes); break;
    case "cancel": next = cancelTaskPlanningRecord(target, command.decidedAt); break;
    case "complete": next = completeTaskPlanningRecord(target, command.decidedAt); break;
    default: throw new TypeError("Unknown planning command.");
  }
  return tasks.map((task) => task === target ? next : task);
}

// Resolve only on commit, including when requests succeeded before an abort.
function transaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    let tx;
    let result;
    let failure;
    try { tx = db.transaction(STORES, mode, { durability: "strict" }); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new DOMException("Transaction aborted.", "AbortError"));
    const guard = (run) => {
      try { run(); } catch (error) { failure = error; tx.abort(); }
    };
    guard(() => work(tx, (value) => { result = value; }, guard));
  });
}

/** Native local-only planning and serialized focus persistence; success means commit. */
export async function openPlanningStore({ onStatus = () => {} } = {}) {
  let latestOperation = 0;
  // A status observer cannot change whether a storage operation committed.
  const status = (state, error, operation = latestOperation) => {
    if (operation !== latestOperation) return;
    try { onStatus({ state, error }); } catch { /* presentation only */ }
  };
  status("loading");
  let db;
  let closed = false;
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      let failed = false;
      const fail = (error) => { failed = true; reject(error); };
      request.onblocked = () => fail(new DOMException("Storage upgrade is blocked. Close other V2 tabs and reload.", "InvalidStateError"));
      request.onerror = () => fail(request.error);
      request.onupgradeneeded = (event) => {
        try {
          const connection = request.result;
          if (event.oldVersion === 0) {
            connection.createObjectStore("metadata", { keyPath: "key" })
              .add({ key: "localScopeId", value: crypto.randomUUID() });
            connection.createObjectStore("scopes", { keyPath: "ownershipScopeId" });
            connection.createObjectStore("tasks", { keyPath: ["ownershipScopeId", "id"] })
              .createIndex("scope", "ownershipScopeId");
          } else if (event.oldVersion === 1) {
            validateSchema(request.transaction, PLANNING_STORES);
          } else throw new TypeError("Unsupported storage upgrade.");
          connection.createObjectStore("focus", { keyPath: "ownershipScopeId" });
        } catch (error) { request.transaction.abort(); fail(error); }
      };
      request.onsuccess = () => {
        if (failed) request.result.close();
        else resolve(request.result);
      };
    });
    db.onversionchange = () => {
      closed = true;
      db.close();
      latestOperation++;
      status("error", new DOMException("Storage version changed. Reload V2.", "VersionError"));
    };
    db.onclose = () => { closed = true; latestOperation++; status("error", new DOMException("Storage connection closed.", "InvalidStateError")); };
    if (JSON.stringify([...db.objectStoreNames]) !== JSON.stringify([...STORES].sort())) {
      throw new TypeError("Invalid storage schema.");
    }
    const initial = await transaction(db, "readonly", (tx, done, guard) => {
      validateSchema(tx);
      const tasksStore = tx.objectStore("tasks");
      const meta = tx.objectStore("metadata").get("localScopeId");
      const scopes = tx.objectStore("scopes").getAll();
      const tasks = tasksStore.getAll();
      const focus = tx.objectStore("focus").getAll();
      focus.onsuccess = () => guard(() => {
        requireReference(meta.result?.value, "local scope identity");
        const byScope = new Map(scopes.result.map((scope) => [scope.ownershipScopeId, scope]));
        for (const task of tasks.result) {
          if (!byScope.has(task.ownershipScopeId)) throw new TypeError("Task has no ownership metadata.");
        }
        for (const scope of scopes.result) {
          requireReference(scope.ownershipScopeId, "ownershipScopeId");
          hydrate(scope.ownershipScopeId, scope, tasks.result.filter((task) => task.ownershipScopeId === scope.ownershipScopeId));
        }
        if (focus.result.length > 1) throw new TypeError("Multiple local focus aggregates.");
        for (const state of focus.result) hydrateFocus(state, meta.result.value,
          tasks.result.filter((task) => task.ownershipScopeId === meta.result.value));
        done(meta.result.value);
      });
    });
    async function run(scopeId, writing, expectedRevision, commands) {
      // Only the latest operation may report its outcome, even if it fails synchronously.
      const operation = ++latestOperation;
      status(writing ? "saving" : "loading", undefined, operation);
      try {
        requireReference(scopeId, "ownershipScopeId");
        if (closed) throw new DOMException("Storage connection closed. Reload V2.", "InvalidStateError");
        // Detach caller-owned data before an asynchronous read can observe mutations.
        const input = writing ? structuredClone(commands) : undefined;
        const result = await transaction(db, writing ? "readwrite" : "readonly", (tx, done, guard) => {
          const scopes = tx.objectStore("scopes");
          const tasks = tx.objectStore("tasks");
          const scope = scopes.get(scopeId);
          const records = tasks.index("scope").getAll(scopeId);
          records.onsuccess = () => guard(() => {
            const current = hydrate(scopeId, scope.result, records.result);
            if (!writing) { done(current); return; }
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) {
              throw new DOMException("Stale planning revision. Reload before retrying.", "InvalidStateError");
            }
            if (current.revision === Number.MAX_SAFE_INTEGER) throw new RangeError("Planning revision exhausted.");
            if (!Array.isArray(input) || input.length === 0) throw new TypeError("commands must be a non-empty array.");
            let next = current.tasks;
            for (const command of input) {
              next = applyCommand(next, scopeId, command);
              validateTasks(next, scopeId);
            }
            const revision = current.revision + 1;
            for (const task of next) tasks.put(task);
            scopes.put({ ownershipScopeId: scopeId, revision, taskIds: next.map((task) => task.id) });
            done({ ownershipScopeId: scopeId, revision, tasks: next });
          });
        });
        status(writing ? "saved" : "ready", undefined, operation);
        return result;
      } catch (error) { status("error", error, operation); throw error; }
    }
    async function runFocus(command) {
      const writing = command !== undefined;
      const operation = ++latestOperation;
      status(writing ? "saving" : "loading", undefined, operation);
      try {
        if (closed) throw new DOMException("Storage connection closed. Reload V2.", "InvalidStateError");
        const input = writing ? structuredClone(command) : undefined;
        const result = await transaction(db, writing ? "readwrite" : "readonly", (tx, done, guard) => {
          const scope = tx.objectStore("scopes").get(initial);
          const records = tx.objectStore("tasks").index("scope").getAll(initial);
          const focusStore = tx.objectStore("focus");
          const focus = focusStore.get(initial);
          focus.onsuccess = () => guard(() => {
            const planning = hydrate(initial, scope.result, records.result);
            const current = hydrateFocus(focus.result, initial, planning.tasks);
            if (!writing) { done(current); return; }
            if (!input || typeof input !== "object") throw new TypeError("A focus command is required.");
            if (Object.hasOwn(input, "task")) throw new TypeError("Start snapshots must come from persisted planning.");
            if (input.type === "start") {
              if (!Number.isSafeInteger(input.expectedPlanningRevision) || input.expectedPlanningRevision !== planning.revision) {
                throw new DOMException("Stale planning revision. Reload before Start.", "InvalidStateError");
              }
              requireReference(input.taskId, "taskId");
              input.task = planning.tasks.find((task) => task.id === input.taskId);
              if (!input.task) throw new RangeError("Task was not found in the local scope.");
              // Persisted Plan Day context outranks a viewer's current timezone.
              input.timezone = input.task.planDay?.timezone ?? input.timezone;
            }
            const next = transitionFocus(current, input);
            focusStore.put(next);
            done(next);
          });
        });
        status(writing ? "saved" : "ready", undefined, operation);
        return result;
      } catch (error) { status("error", error, operation); throw error; }
    }
    async function backupOperation(input) {
      const writing = input !== undefined;
      if (closed) throw new DOMException("Storage connection closed. Reload V2.", "InvalidStateError");
      // Validate and detach before opening a write transaction. Never partially import.
      const backup = writing ? validateWorkspaceBackup(structuredClone(input)) : null;
      if (backup) {
        backup.planning.ownershipScopeId = initial;
        for (const task of backup.planning.tasks) task.ownershipScopeId = initial;
        backup.focus.ownershipScopeId = initial;
        for (const session of backup.focus.sessions) session.ownershipScopeId = initial;
      }
      return transaction(db, writing ? "readwrite" : "readonly", (tx, done, guard) => {
        const scopes = tx.objectStore("scopes"), tasks = tx.objectStore("tasks"), focusStore = tx.objectStore("focus");
        const scope = scopes.get(initial), records = tasks.index("scope").getAll(initial), focus = focusStore.get(initial);
        focus.onsuccess = () => guard(() => {
          const planning = hydrate(initial, scope.result, records.result);
          const state = hydrateFocus(focus.result, initial, planning.tasks);
          if (!backup) {
            done({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), planning, focus: state });
            return;
          }
          if (state.reservation) throw new Error("End the current focus session before importing. Your data is unchanged.");
          if (JSON.stringify(planning.tasks) === JSON.stringify(backup.planning.tasks)
              && JSON.stringify(state) === JSON.stringify(backup.focus)) {
            done({ imported: false }); return;
          }
          if (planning.tasks.length || state.sessions.length) {
            throw new Error("Restore requires an empty local workspace. Use a separate browser profile or export your current data first. Existing data was not changed.");
          }
          // One serialized transaction checks emptiness and restores all related records.
          for (const task of backup.planning.tasks) tasks.add(task);
          scopes.put({ ownershipScopeId: initial, revision: Math.max(1, planning.revision + 1, backup.planning.revision), taskIds: backup.planning.tasks.map(task => task.id) });
          focusStore.put(backup.focus);
          done({ imported: true });
        });
      });
    }
    status("ready", undefined, 0);
    return {
      localScopeId: initial,
      load: (scopeId = initial) => run(scopeId, false),
      commit: (scopeId, expectedRevision, commands) => run(scopeId, true, expectedRevision, commands),
      loadFocus: () => runFocus(),
      exportBackup: () => backupOperation(),
      restoreBackup: (backup) => {
        if (backup === undefined) return Promise.reject(new TypeError("A backup is required."));
        return backupOperation(backup);
      },
      commitFocus: (command) => {
        // Undefined is invalid write intent, never a silently successful load.
        return runFocus(command === undefined ? null : command);
      },
      close: () => { closed = true; db.close(); },
    };
  } catch (error) { db?.close(); status("error", error, 0); throw error; }
}
