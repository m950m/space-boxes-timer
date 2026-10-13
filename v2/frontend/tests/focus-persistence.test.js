import { DATABASE_NAME, DATABASE_VERSION, openPlanningStore } from "../js/persistence/planning-store.js";
import { createBrowserFocus, SAMPLING } from "../js/focus/browser-focus.js";
import { getSessionActivity } from "../js/focus/focus-lifecycle.js";

const checks = [];
const states = [];
const connections = new Set();
const assert = (value, message) => { if (!value) throw new Error(message); };
const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
async function test(name, run) { await run(); checks.push(`PASS ${name}`); }
async function rejects(run, name) {
  let failure;
  try { await run(); } catch (error) { failure = error; }
  assert(failure && (!name || failure.name === name), `Expected ${name ?? "failure"}, got ${failure?.name}`);
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function open() {
  const store = await openPlanningStore({ onStatus: ({ state }) => states.push(state) });
  connections.add(store);
  return store;
}
function closeAll() { for (const store of connections) store.close(); connections.clear(); }
async function reset() {
  closeAll();
  await requestResult(indexedDB.deleteDatabase(DATABASE_NAME));
}
async function rawWrite(run) {
  const db = await requestResult(indexedDB.open(DATABASE_NAME));
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], "readwrite");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      run(tx);
    });
  } finally { db.close(); }
}
const makeTask = (scope, id = "work") => ({
  id, ownershipScopeId: scope, title: `Original ${id}`, planDayId: "prior-day", classification: "extra",
  planDay: { calendarDate: "2026-10-11", timezone: "Africa/Cairo" },
  plannedStart: { time: "23:45", timezone: "Africa/Cairo" },
  sessionPlan: [{ id: `${id}-item`, activeMinutes: 25 }, { id: `${id}-next`, activeMinutes: 10 }],
  plannedBreaks: [], note: "Private", resources: [{ url: "https://example.org", label: "Private" }],
});
let serial = 0;
function startIntent(planning, revision = 0, contextId = "controller", taskId = "work") {
  const id = `start-${++serial}`;
  return { id, type: "start", contextId, at: 1000, expectedRevision: revision,
    expectedPlanningRevision: planning.revision, taskId, plannedItemId: `${taskId}-item`,
    sessionId: id, evidenceId: `${id}-evidence`, timezone: "Africa/Cairo" };
}
function control(state, type, { elapsedMs = 1000, certainty = "confirmed", reason, ...fields } = {}) {
  const at = (state.evidence.at(-1)?.startAt ?? 0) + (elapsedMs ?? 1000);
  return { id: `command-${++serial}`, type, contextId: state.reservation?.controllerId ?? "controller",
    at, expectedRevision: state.revision, evidenceId: `evidence-${serial}`,
    observation: { at, elapsedMs, certainty, ...(reason ? { reason } : {}) }, ...fields };
}

// A separate browsing context owns its connection and runs its own transactions.
if (location.search === "?peer") {
  let store;
  addEventListener("message", async (event) => {
    if (event.origin !== location.origin || event.source !== opener || !event.ports[0]) return;
    const port = event.ports[0];
    try {
      const { op, input } = event.data;
      if (op === "open") { store = await open(); port.postMessage({ value: store.localScopeId }); }
      else if (op === "close") { closeAll(); port.postMessage({ value: true }); }
      else if (["loadFocus", "commitFocus", "load", "commit"].includes(op)) {
        port.postMessage({ value: await store[op](...(input ?? [])) });
      } else throw new TypeError("Unknown peer operation.");
    } catch (error) { port.postMessage({ error: { name: error.name, message: error.message } }); }
  });
  opener.postMessage({ focusPeerReady: true }, location.origin);
} else {
  async function peer() {
    let tab;
    const loaded = new Promise((resolve) => {
      const ready = (event) => {
        if (event.origin === location.origin && event.source === tab && event.data?.focusPeerReady) {
          removeEventListener("message", ready); resolve();
        }
      };
      addEventListener("message", ready);
    });
    tab = window.open("./focus-persistence.html?peer", "_blank");
    assert(tab, "Chrome did not open second tab");
    await loaded;
    const call = (op, ...input) => new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => {
        channel.port1.close();
        if (data.error) reject(new DOMException(data.error.message, data.error.name));
        else resolve(data.value);
      };
      tab.postMessage({ op, input }, location.origin, [channel.port2]);
    });
    await call("open");
    return { call, close: async () => { await call("close"); tab.close(); } };
  }
  async function suite() {
    await reset();
    const sentinel = "v1-byte-for-byte";
    localStorage.setItem("space-boxes-timer:tasks", sentinel);
    await test("valid v1 upgrade preserves identity, all planning scopes, records and V1 data", async () => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("metadata", { keyPath: "key" }).add({ key: "localScopeId", value: "local" });
        const scopes = db.createObjectStore("scopes", { keyPath: "ownershipScopeId" });
        const tasks = db.createObjectStore("tasks", { keyPath: ["ownershipScopeId", "id"] });
        tasks.createIndex("scope", "ownershipScopeId");
        for (const scope of ["local", "other"]) {
          scopes.add({ ownershipScopeId: scope, revision: 1, taskIds: ["work"] });
          tasks.add(makeTask(scope));
        }
      };
      (await requestResult(request)).close();
      await test("failed additive v1 upgrade rolls back version and preserves existing stores", async () => {
        const original = IDBDatabase.prototype.createObjectStore;
        try {
          IDBDatabase.prototype.createObjectStore = function (...args) {
            if (args[0] === "focus") throw new DOMException("Injected additive upgrade failure", "UnknownError");
            return original.apply(this, args);
          };
          await rejects(open, "UnknownError");
        } finally { IDBDatabase.prototype.createObjectStore = original; }
        const unchanged = await requestResult(indexedDB.open(DATABASE_NAME, 1));
        assert(unchanged.version === 1 && !unchanged.objectStoreNames.contains("focus"), "Partial migration survived");
        equal(await requestResult(unchanged.transaction("tasks").objectStore("tasks").get(["local", "work"])), makeTask("local"), "Upgrade lost records");
        unchanged.close();
      });
      const store = await open();
      assert(store.localScopeId === "local", "Replaced identity");
      equal((await store.load()).tasks, [makeTask("local")], "Migration changed task");
      equal((await store.load("other")).tasks, [makeTask("other")], "Migration changed other scope");
      assert((await store.loadFocus()).revision === 0, "Upgrade started focus");
      const db = await requestResult(indexedDB.open(DATABASE_NAME));
      assert(db.version === DATABASE_VERSION && db.objectStoreNames.contains("focus"), "No compatible focus schema");
      db.close();
      assert(localStorage.getItem("space-boxes-timer:tasks") === sentinel, "Touched V1");
    });
    let store = await open();
    let planning = await store.load();
    let state;
    await test("Start uses persisted plan, rejects invented snapshots and stale planning atomically", async () => {
      await rejects(() => store.commitFocus({ ...startIntent(planning), task: makeTask("local") }), "TypeError");
      await rejects(() => store.commitFocus({ ...startIntent(planning), expectedPlanningRevision: 0 }), "InvalidStateError");
      await rejects(() => store.commitFocus(startIntent(planning, 0, "controller", "missing")), "RangeError");
      equal((await store.loadFocus()).sessions, [], "Invalid Start partially persisted");
      state = await store.commitFocus({ ...startIntent(planning), timezone: "Pacific/Honolulu" });
      assert(state.sessions[0].startingSnapshot.title === planning.tasks[0].title, "Not a persisted snapshot");
      assert(state.sessions[0].startingSnapshot.timezone === "Africa/Cairo", "Viewer timezone changed original attribution");
      assert(!Object.hasOwn(state.sessions[0].startingSnapshot, "note"), "Copied private annotations");
      equal(states.slice(-2), ["saving", "saved"], "No durable success");
    });
    await test("Running and Paused reservations reject independent Start in a second tab", async () => {
      const other = await peer();
      try {
        await rejects(() => other.call("commitFocus", startIntent(planning, state.revision, "observer")), "RangeError");
        state = await store.commitFocus(control(state, "pause"));
        await rejects(() => other.call("commitFocus", startIntent(planning, state.revision, "observer")), "RangeError");
        equal(await other.call("loadFocus"), state, "Other tab cannot observe reservation");
      } finally { await other.close(); }
    });
    await test("long pause, resume and early end retain activity without task completion", async () => {
      state = await store.commitFocus(control(state, "resume", { elapsedMs: 7200000 }));
      state = await store.commitFocus(control(state, "end", { elapsedMs: 2000 }));
      const activity = getSessionActivity(state, state.sessions[0].id);
      assert(activity.pauseMs === 7200000 && activity.confirmedActiveMs === 3000, "Pause counted as focus");
      assert(state.sessions[0].ending.outcome === "ended-early" && state.reservation === null, "Wrong early end");
      equal(await store.load(), planning, "Focus changed plan/task completion");
    });
    await test("two-tab simultaneous Start serializes to one accepted reservation", async () => {
      const other = await peer();
      try {
        const results = await Promise.allSettled([
          store.commitFocus(startIntent(planning, state.revision, "a")),
          other.call("commitFocus", startIntent(planning, state.revision, "b")),
        ]);
        assert(results.filter((result) => result.status === "fulfilled").length === 1, "Two winners");
        state = await store.loadFocus();
        assert(state.sessions.length === 2, "Two sessions persisted");
      } finally { await other.close(); }
    });
    await test("explicit transfer preserves session, marks recovery uncertain and rejects former controller", async () => {
      const former = state.reservation.controllerId;
      await rejects(() => store.commitFocus(control(state, "transfer", { contextId: "new", confirmed: false })), "TypeError");
      state = await store.commitFocus(control(state, "transfer", { contextId: "new", confirmed: true, elapsedMs: null, certainty: "uncertain" }));
      assert(state.evidence.at(-2).kind === "uncertain" && state.reservation.controllerId === "new", "Recovery counted focus");
      await rejects(() => store.commitFocus(control(state, "pause", { contextId: former })), "RangeError");
      state = await store.commitFocus(control(state, "pause"));
    });
    await test("planning edits and item retirement cannot rewrite focus history or reservation", async () => {
      const baseline = await store.loadFocus();
      planning = await store.commit("local", planning.revision, [{ type: "edit", taskId: "work",
        changes: { title: "Changed", sessionPlan: [planning.tasks[0].sessionPlan[1]] } }]);
      equal(await store.loadFocus(), baseline, "Planning rewrote focus");
      assert((await store.loadFocus()).sessions[0].startingSnapshot.title === "Original work", "Frozen title changed");
    });
    await test("failed focus write after request success rolls back and never reports saved", async () => {
      const baseline = await store.loadFocus();
      const original = IDBObjectStore.prototype.put;
      let succeeded = false;
      states.length = 0;
      try {
        IDBObjectStore.prototype.put = function (...args) {
          const request = original.apply(this, args);
          if (this.name === "focus") request.onsuccess = () => { succeeded = true; this.transaction.abort(); };
          return request;
        };
        await rejects(() => store.commitFocus(control(baseline, "resume")), "AbortError");
      } finally { IDBObjectStore.prototype.put = original; }
      assert(succeeded, "No actual request success");
      equal(states, ["saving", "error"], "False save");
      equal(await store.loadFocus(), baseline, "Abort changed focus");
    });
    await test("quota, clone, closed-connection and invalid write failures preserve durable state", async () => {
      const baseline = await store.loadFocus();
      const original = IDBObjectStore.prototype.put;
      try {
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "focus") throw new DOMException("Injected quota", "QuotaExceededError");
          return original.apply(this, args);
        };
        await rejects(() => store.commitFocus(control(baseline, "resume")), "QuotaExceededError");
      } finally { IDBObjectStore.prototype.put = original; }
      assert(states.at(-1) === "error", "Quota hidden");
      await rejects(() => store.commitFocus({ ...control(baseline, "resume"), unexpected: () => {} }), "DataCloneError");
      await rejects(() => store.commitFocus(), "TypeError");
      const closed = await open(); closed.close();
      await rejects(() => closed.commitFocus(control(baseline, "resume")), "InvalidStateError");
      equal(await store.loadFocus(), baseline, "Failure changed state");
    });
    await test("invalid persisted focus fails visibly without reset or authority loss", async () => {
      const baseline = await store.loadFocus();
      closeAll();
      const corrupt = { ...baseline, revision: -1 };
      await rawWrite((tx) => tx.objectStore("focus").put(corrupt));
      await rejects(open, "TypeError");
      await rawWrite((tx) => {
        const request = tx.objectStore("focus").get("local");
        request.onsuccess = () => { equal(request.result, corrupt, "Corrupt data overwritten"); tx.objectStore("focus").put(baseline); };
      });
      store = await open(); state = await store.loadFocus();
    });
    await test("explicit partial reconciliation survives reopen and cannot duplicate credit", async () => {
      const evidence = state.evidence.find((item) => item.kind === "uncertain");
      const decision = { id: `decision-${++serial}`, type: "reconcile", contextId: state.reservation.controllerId,
        expectedRevision: state.revision, at: state.evidence.at(-1).startAt,
        evidenceId: evidence.id, elapsedMs: 5000,
        parts: [{ kind: "focus", elapsedMs: 2000 }, { kind: "interruption", elapsedMs: 3000, episodeId: "episode" }] };
      const original = structuredClone(evidence);
      state = await store.commitFocus(decision);
      equal(state.evidence.find((item) => item.id === evidence.id), original, "Rewrote observations");
      await rejects(() => store.commitFocus({ ...decision, id: "duplicate", expectedRevision: state.revision }), "RangeError");
      store.close(); store = await open();
      equal(await store.loadFocus(), state, "Decision lost");
      assert(getSessionActivity(state, state.reservation.sessionId).interruptionMs === 3000, "Incorrect partial credit");
    });
    // Finish the earlier session; use a fresh current item for deterministic controller tests.
    state = await store.commitFocus(control(state, "end"));
    await test("concurrent planning edit and Start use one serialized original snapshot", async () => {
      const other = await peer();
      try {
        const before = await store.load();
        const originalTitle = before.tasks[0].title;
        const intent = { ...startIntent(before, state.revision), plannedItemId: "work-next" };
        const [editResult, startResult] = await Promise.allSettled([
          other.call("commit", "local", before.revision, [{ type: "edit", taskId: "work", changes: { title: "Race edit" } }]),
          store.commitFocus(intent),
        ]);
        assert(editResult.status === "fulfilled", "Valid concurrent edit failed");
        if (startResult.status === "fulfilled") {
          state = startResult.value;
          assert(state.sessions.at(-1).startingSnapshot.title === originalTitle, "Mixed plan snapshot");
          state = await store.commitFocus(control(state, "end"));
        } else assert(startResult.reason.name === "InvalidStateError", "Stale plan accepted or wrong rejection");
        planning = await store.load();
        assert(planning.revision === before.revision + 1 && planning.tasks[0].title === "Race edit", "Lost concurrent plan");
      } finally { await other.close(); }
    });
    await test("browser sampling reaches active target, caps credit and leaves next item/task explicit", async () => {
      const short = makeTask("local", "short");
      short.sessionPlan[0].activeMinutes = 0.01;
      planning = await store.commit("local", planning.revision, [{ type: "create", task: short }]);
      let tick = { at: 1000, monotonic: 1000 };
      const shortController = createBrowserFocus(store, { clock: () => tick });
      await shortController.load();
      await shortController.start({ taskId: "short", plannedItemId: "short-item", timezone: "Africa/Cairo", expectedPlanningRevision: planning.revision });
      tick = { at: 2000, monotonic: 2000 };
      state = await shortController.checkpoint();
      const activity = getSessionActivity(state, state.sessions.at(-1).id);
      assert(state.reservation === null && activity.confirmedActiveMs === 600 && activity.uncreditedFocusMs === 400, "Sampling missed/crossed target");
      equal(await store.load(), planning, "Sampler changed task/next item");
    });
    planning = await store.commit("local", planning.revision, [{ type: "create", task: makeTask("local", "clock") }]);
    let now = { at: Date.UTC(2026, 9, 11, 23, 59, 59), monotonic: 100 };
    const controller = createBrowserFocus(store, { contextId: "clock-tab", clock: () => now });
    await controller.load();
    await test("browser controller records continuous no-input focus across midnight", async () => {
      state = await controller.start({ taskId: "clock", plannedItemId: "clock-item", timezone: "Africa/Cairo", expectedPlanningRevision: planning.revision });
      now = { at: now.at + 1000, monotonic: now.monotonic + 1000 };
      state = await controller.checkpoint();
      assert(getSessionActivity(state, state.reservation.sessionId).confirmedActiveMs === 1000, "No-input work lost");
      assert(state.sessions.at(-1).startingSnapshot.planDayId === "prior-day", "Midnight changed attribution");
    });
    await test("throttled callbacks preserve known uncertain intervals for explicit reconciliation", async () => {
      const gap = SAMPLING.maxGapMs + 100;
      now = { at: now.at + gap, monotonic: now.monotonic + gap };
      state = await controller.checkpoint();
      assert(state.evidence.at(-2).kind === "uncertain" && state.evidence.at(-2).elapsedMs === gap, "Gap counted/discarded");
      assert(getSessionActivity(state, state.reservation.sessionId).confirmedActiveMs === 1000, "Gap auto-counted");
    });
    await test("documented gap and clock tolerance boundaries admit jitter and reject excess", async () => {
      now = { at: now.at + SAMPLING.maxGapMs, monotonic: now.monotonic + SAMPLING.maxGapMs };
      state = await controller.checkpoint();
      assert(state.evidence.at(-2).kind === "focus", "Exact max gap unexpectedly uncertain");
      now = { at: now.at + 1000 + SAMPLING.clockToleranceMs, monotonic: now.monotonic + 1000 };
      state = await controller.checkpoint();
      assert(state.evidence.at(-2).kind === "focus", "Allowed jitter lost");
      now = { at: now.at + 1001 + SAMPLING.clockToleranceMs, monotonic: now.monotonic + 1000 };
      state = await controller.checkpoint();
      assert(state.evidence.at(-2).kind === "uncertain" && state.evidence.at(-2).elapsedMs === null, "Excess clock skew accepted");
    });
    await test("forward/backward clock changes, stopped sleep clock and monotonic reset remain unknown", async () => {
      for (const [wall, mono] of [[10000, 1000], [-1000, 1000], [10000, 0], [1000, -10000]]) {
        now = { at: now.at + wall, monotonic: now.monotonic + mono };
        state = await controller.checkpoint();
        assert(state.evidence.at(-2).kind === "uncertain" && state.evidence.at(-2).elapsedMs === null, "Fabricated clock duration");
      }
    });
    await test("real browser main-thread stall becomes uncertainty at the last persisted boundary", async () => {
      const native = createBrowserFocus(store);
      await native.load();
      const baseline = await native.recover({ confirmed: true });
      const stopAt = performance.now() + SAMPLING.maxGapMs + 150;
      while (performance.now() < stopAt) { /* deliberately emulate a blocked/throttled callback */ }
      state = await native.checkpoint();
      const evidence = state.evidence.at(-2);
      assert(evidence.kind === "uncertain" && evidence.reason === "sampling-gap", "Stall auto-counted");
      assert(evidence.startAt === baseline.evidence.at(-1).startAt, "Lost last trustworthy boundary");
    });
    await test("automatic watch checkpoints persist and storage errors stop sampling visibly", async () => {
      const original = IDBObjectStore.prototype.put;
      let reported;
      const sampled = createBrowserFocus(store, { clock: () => now, contextId: "watch-tab", onError: (error) => { reported = error; } });
      await sampled.load(); await sampled.recover({ confirmed: true });
      const baseline = await store.loadFocus();
      sampled.watch();
      await new Promise((resolve) => setTimeout(resolve, SAMPLING.intervalMs + 250));
      assert((await store.loadFocus()).revision > baseline.revision, "Automatic checkpoint did not persist");
      try {
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "focus") throw new DOMException("Injected watch quota", "QuotaExceededError");
          return original.apply(this, args);
        };
        await new Promise((resolve) => setTimeout(resolve, SAMPLING.intervalMs + 250));
        assert(reported?.name === "QuotaExceededError", "Automatic write failure hidden");
      } finally { sampled.stop(); IDBObjectStore.prototype.put = original; }
      state = await store.loadFocus();
    });
    // Preserve a Running reservation for real navigation and process-restart recovery.
    localStorage.setItem("focus-expected", JSON.stringify(state));
    localStorage.setItem("focus-plan", JSON.stringify(planning));
    sessionStorage.setItem("focus-reload-checks", JSON.stringify(checks));
    closeAll(); location.reload();
  }
  async function afterReload() {
    checks.push(...JSON.parse(sessionStorage.getItem("focus-reload-checks")));
    sessionStorage.removeItem("focus-reload-checks");
    const store = await open();
    await test("actual page reload retains Running authority and uncertainty without automatic takeover", async () => {
      equal(await store.loadFocus(), JSON.parse(localStorage.getItem("focus-expected")), "Reload changed authority");
      const controller = createBrowserFocus(store);
      const state = await controller.load();
      await rejects(() => controller.pause(), "RangeError");
      equal(await store.loadFocus(), state, "Observer changed authority");
    });
    closeAll();
  }
  async function restart(paused) {
    const store = await open();
    let state = await store.loadFocus();
    await test(`new browser process preserves ${paused ? "Paused" : "Running"} reservation, facts and Plan Day`, async () => {
      equal(state, JSON.parse(localStorage.getItem("focus-expected")), "Restart changed focus");
      equal(await store.load(), JSON.parse(localStorage.getItem("focus-plan")), "Restart changed plan");
      assert(state.reservation.state === (paused ? "paused" : "running"), "Restart lost mode");
      assert(localStorage.getItem("space-boxes-timer:tasks") === "v1-byte-for-byte", "Restart touched V1");
    });
    const controller = createBrowserFocus(store);
    await controller.load();
    await test("restart recovery needs confirmation, retains evidence and rejects stale controls", async () => {
      const former = structuredClone(state);
      await rejects(() => controller.recover({ confirmed: false }), "TypeError");
      state = await controller.recover({ confirmed: true });
      assert(state.reservation.state === former.reservation.state, "Transfer changed mode");
      assert(state.evidence.at(-2).elapsedMs === null, "Restart inferred elapsed time");
      await rejects(() => store.commitFocus(control(former, "end")), "RangeError");
    });
    if (!paused) state = await controller.pause();
    else {
      state = await controller.resume();
      // Complete using trustworthy measured evidence at the storage boundary.
      state = await store.commitFocus(control(state, "record", { elapsedMs: 1500000 }));
      await test("duration completion releases reservation without completing task or starting next item", async () => {
        assert(state.reservation === null && state.sessions.at(-1).ending.outcome === "completed", "Target did not complete");
        equal(await store.load(), JSON.parse(localStorage.getItem("focus-plan")), "Task silently completed");
        assert(getSessionActivity(state, state.sessions.at(-1).id).confirmedActiveMs === 1500000, "Credit uncapped");
      });
    }
    localStorage.setItem("focus-expected", JSON.stringify(state));
    closeAll();
  }
  try {
    if (location.search === "?restart-running") await restart(false);
    else if (location.search === "?restart-paused") await restart(true);
    else if (sessionStorage.getItem("focus-reload-checks")) await afterReload();
    else { await suite(); /* navigation reports the suite */ }
    if (sessionStorage.getItem("focus-reload-checks") === null) {
      document.getElementById("results").textContent = checks.join("\n");
      await fetch("/results", { method: "POST", body: JSON.stringify({ checks }) });
    }
  } catch (error) {
    closeAll();
    await fetch("/results", { method: "POST", body: JSON.stringify({ checks, error: error.stack }) });
  }
}
