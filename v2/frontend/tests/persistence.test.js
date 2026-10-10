import { DATABASE_NAME, openPlanningStore } from "../js/persistence/planning-store.js";
import { getTaskPlanningTotals, getPlannedFocusItem, getPlannedBreak } from "../js/domain/task-planning.js";

const checks = [];
const states = [];
const connections = new Set();
const sentinel = { tasks: '{"version":1,"data":[{"id":"v1-sentinel"}]}', settings: "v1-settings", statistics: "v1-statistics" };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);
async function test(name, run) { await run(); checks.push(`PASS ${name}`); }
async function rejects(run, name) {
  let error;
  try { await run(); } catch (caught) { error = caught; }
  assert(error && (!name || error.name === name), `Expected ${name ?? "failure"}, got ${error?.name}`);
}
async function open() {
  const store = await openPlanningStore({ onStatus: ({ state }) => states.push(state) });
  connections.add(store);
  return store;
}
function closeAll() { for (const store of connections) store.close(); connections.clear(); }
async function withUIStore(run) {
  const frame = document.createElement("iframe");
  frame.src = "/";
  const loaded = new Promise((resolve) => { frame.onload = resolve; });
  document.body.append(frame);
  let store;
  try {
    await loaded;
    store = await (await frame.contentWindow.eval('import("/js/app.js")')).planningStore;
    await run(store, frame.contentDocument.getElementById("v2-startup-status"), frame.contentWindow);
  } finally { store?.close(); frame.remove(); }
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function rawWrite(run) {
  const db = await requestResult(indexedDB.open(DATABASE_NAME, 1));
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["metadata", "scopes", "tasks"], "readwrite");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      run(tx);
    });
  } finally { db.close(); }
}
async function reset() {
  closeAll();
  // Only disposable test origin/profile fixtures; never used in application code.
  await requestResult(indexedDB.deleteDatabase(DATABASE_NAME));
}
function task(scopeId, id, fields = {}) {
  return {
    id, ownershipScopeId: scopeId, planDayId: "day-a", title: `Work ${id}`,
    classification: "extra", plannedStart: { time: "23:45", timezone: "Africa/Cairo" },
    planDay: { calendarDate: "2026-10-10", timezone: "Africa/Cairo" },
    sessionPlan: [{ id: `${id}-a`, activeMinutes: 25 }, { id: `${id}-b`, activeMinutes: 40 }],
    plannedBreaks: [{ id: `${id}-rest`, afterFocusItemId: `${id}-a`, beforeFocusItemId: `${id}-b`, breakMinutes: 5 }],
    note: "Private note", resources: [{ url: "https://example.org/reference", label: "Read" }],
    ...fields,
  };
}
const create = (record) => ({ type: "create", task: record });
const edit = (id, changes) => ({ type: "edit", taskId: id, changes });
function newWork(scopeId, id, fields = {}) {
  const record = task(scopeId, id, fields);
  // Split accepts only the existing domain's new-work planning fields.
  delete record.planDay;
  return record;
}

async function suite() {
  for (const [key, value] of Object.entries(sentinel)) localStorage.setItem(`space-boxes-timer:${key}`, value);
  let store = await open();
  const scopeId = store.localScopeId;
  let current;
  await test("valid empty storage and stable local identity", async () => {
    equal(await store.load(), { ownershipScopeId: scopeId, revision: 0, tasks: [] }, "Empty store is not empty");
    store.close();
    store = await open();
    assert(store.localScopeId === scopeId, "Local identity changed");
  });
  await test("aggregate round trip, task ordering, scoped compound identities and derived totals", async () => {
    const history = [{ id: "actual-a", taskId: "z", plannedItemId: "z-a",
      startingSnapshot: { title: "Original", planDayId: "day-a", timezone: "Africa/Cairo", activeMinutes: 25 } }];
    const activity = [{ id: "evidence", sessionId: "actual-a", kind: "uncertain", origin: "tab-a" }];
    current = await store.commit(scopeId, 0, [create(task(scopeId, "z", { history, activity })), create(task(scopeId, "a", { parentTaskId: "z" }))]);
    equal(states.slice(-2), ["saving", "saved"], "Save state was not committed");
    equal(await store.load(), current, "Round trip changed aggregate or ordering");
    equal(getTaskPlanningTotals(current.tasks[0]), { sessionCount: 2, plannedFocusMinutes: 65 }, "Wrong projections");
    assert(!Object.hasOwn(current.tasks[0], "sessionCount") && !Object.hasOwn(current.tasks[0], "plannedFocusMinutes"), "Stored projections");
    await store.commit("other-local-scope", 0, [create(task("other-local-scope", "z", { title: "Other scope" }))]);
    equal(await store.load(), current, "Other scope overwrote same task id");
  });
  await test("repeated edits, retirement, rescheduling, parent, split and explicit decisions preserve history", async () => {
    const history = structuredClone(current.tasks[0].history);
    const activity = structuredClone(current.tasks[0].activity);
    for (let i = 0; i < 4; i++) current = await store.commit(scopeId, current.revision, [edit("z", { title: `Edit ${i}` })]);
    current = await store.commit(scopeId, current.revision, [
      edit("a", {
        sessionPlan: [...current.tasks[1].sessionPlan].reverse(),
        plannedBreaks: [{ ...current.tasks[1].plannedBreaks[0], afterFocusItemId: "a-b", beforeFocusItemId: "a-a" }],
      }),
      edit("z", { sessionPlan: [current.tasks[0].sessionPlan[1]], plannedBreaks: [], note: "Edited", resources: [] }),
      { type: "classify", taskId: "z", classification: "primary" },
      { type: "reschedule", taskId: "z", planDayId: "day-b", plannedStart: { time: "09:00", timezone: "Pacific/Honolulu" } },
      { type: "parent", taskId: "a", parentTaskId: null },
      { type: "split", taskId: "z", newWork: [newWork(scopeId, "split-one"), newWork(scopeId, "split-two", { parentTaskId: "split-one" })] },
      { type: "complete", taskId: "z", decidedAt: "owner-completed" },
      { type: "cancel", taskId: "z", decidedAt: "owner-cancelled" },
    ]);
    const loaded = (await store.load()).tasks[0];
    equal(loaded.history, history, "Rewrote session snapshots");
    equal(loaded.activity, activity, "Rewrote activity");
    equal(getPlannedFocusItem(loaded, "z-a"), { id: "z-a", activeMinutes: 25 }, "Retired focus lost");
    assert(getPlannedBreak(loaded, "z-rest").breakMinutes === 5, "Retired break lost");
    assert(loaded.completedAt === "owner-completed" && loaded.cancelledAt === "owner-cancelled", "Decisions lost");
    assert(current.tasks.slice(2).every((record) => !record.history && !record.activity), "Split copied historical credit");
    equal((await store.load()).tasks[1].sessionPlan.map((item) => item.id), ["a-b", "a-a"], "Reordered focus intent lost");
  });
  await test("multi-record quota, cycle, missing-parent, scope, planning and deletion attempts roll back", async () => {
    const baseline = await store.load();
    const invalid = [
      [create(task(scopeId, "p1", { classification: "primary" })), create(task(scopeId, "p2", { classification: "primary" })), create(task(scopeId, "p3", { classification: "primary" })), create(task(scopeId, "p4", { classification: "primary" }))],
      [{ type: "parent", taskId: "a", parentTaskId: "missing" }],
      [{ type: "parent", taskId: "split-one", parentTaskId: "split-two" }],
      [create(task("wrong-scope", "intruder"))],
      [edit("a", { sessionPlan: [] })],
      [edit("a", { sessionCount: 10 })],
      [edit("z", { history: [] })],
      [{ type: "delete", taskId: "z" }],
      [{ type: "split", taskId: "z", newWork: [newWork(scopeId, "first-valid"), newWork(scopeId, "bad", { sessionPlan: [] })] }],
    ];
    for (const commands of invalid) {
      await rejects(() => store.commit(scopeId, baseline.revision, [edit("a", { title: "Must rollback" }), ...commands]));
      equal(await store.load(), baseline, "Rejected batch partially persisted");
    }
    for (const commands of [undefined, null, [], {}]) {
      await rejects(() => store.commit(scopeId, baseline.revision, commands), "TypeError");
      equal(await store.load(), baseline, "Malformed command batch changed state");
    }
  });
  await test("simultaneous stale writers serialize revision read, validation and multi-record write", async () => {
    const second = await open();
    const baseline = await store.load();
    const writers = [store, second].map((writer, index) => writer.commit(scopeId, baseline.revision, [
      edit("a", { title: `Winner ${index}` }), edit("z", { note: `Winner ${index}` }),
    ]));
    const results = await Promise.allSettled(writers);
    assert(results.filter((result) => result.status === "fulfilled").length === 1, "Expected one stale writer");
    const loser = results.find((result) => result.status === "rejected");
    assert(loser.reason.name === "InvalidStateError", "Stale update not explicit");
    current = await store.load();
    assert(current.revision === baseline.revision + 1, "Stale writer advanced revision");
    assert(current.tasks[1].title === current.tasks[0].note, "Writers interleaved");
    second.close();
  });
  await test("structured clone failure is visible and previous committed state survives", async () => {
    const baseline = await store.load();
    await rejects(() => store.commit(scopeId, baseline.revision, [edit("a", { plannedStart: () => {} })]), "DataCloneError");
    assert(states.at(-1) === "error", "Serialization error hidden");
    equal(await store.load(), baseline, "Serialization failure changed data");
  });
  await test("request success followed by native transaction abort never reports saved", async () => {
    const baseline = await store.load();
    const original = IDBObjectStore.prototype.put;
    let succeeded = false;
    states.length = 0;
    try {
      IDBObjectStore.prototype.put = function (...args) {
        const request = original.apply(this, args);
        if (this.name === "tasks") request.onsuccess = () => { succeeded = true; this.transaction.abort(); };
        return request;
      };
      await rejects(() => store.commit(scopeId, baseline.revision, [edit("a", { title: "Abort" })]), "AbortError");
    } finally { IDBObjectStore.prototype.put = original; }
    assert(succeeded, "No successful request before abort");
    equal(states, ["saving", "error"], "Reported saved before abort");
    equal(await store.load(), baseline, "Abort left partial state");
  });
  await test("native request error after earlier writes rolls back all records and metadata", async () => {
    const baseline = await store.load();
    const original = IDBObjectStore.prototype.put;
    try {
      IDBObjectStore.prototype.put = function (...args) {
        return this.name === "tasks" && args[0].id === "a" ? this.add(...args) : original.apply(this, args);
      };
      await rejects(() => store.commit(scopeId, baseline.revision, [edit("a", { title: "Duplicate add" })]), "ConstraintError");
    } finally { IDBObjectStore.prototype.put = original; }
    assert(states.at(-1) === "error", "Request error hidden");
    equal(await store.load(), baseline, "Request error left earlier writes");
  });
  await test("deterministically injected quota failure after a queued write rolls back", async () => {
    const baseline = await store.load();
    const original = IDBObjectStore.prototype.put;
    try {
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "tasks" && args[0].id === "a") throw new DOMException("Injected quota", "QuotaExceededError");
        return original.apply(this, args);
      };
      await rejects(() => store.commit(scopeId, baseline.revision, [edit("a", { title: "Quota" })]), "QuotaExceededError");
    } finally { IDBObjectStore.prototype.put = original; }
    assert(states.at(-1) === "error", "Quota error hidden");
    equal(await store.load(), baseline, "Quota left queued writes");
  });
  await test("UI uses accessible existing status and displays committed/failed operations", () => withUIStore(async (uiStore, status) => {
    assert(status.getAttribute("role") === "status" && status.textContent.includes("Local plans loaded"), "Accessible startup status missing");
    const baseline = await uiStore.load();
    const saving = uiStore.commit(scopeId, baseline.revision, [edit("a", { title: "UI saved" })]);
    assert(status.textContent === "Saving…", "Pending status missing");
    await saving;
    assert(status.textContent === "Saved.", "Committed status missing");
    await rejects(() => uiStore.commit(scopeId, baseline.revision, [edit("a", { title: "Stale UI" })]), "InvalidStateError");
    assert(status.textContent.startsWith("Error:"), "UI failure hidden");
  }));
  await test("older save completion cannot report Saved while a newer transaction is pending", () => withUIStore(async (uiStore, status, browser) => {
    const baseline = await uiStore.load();
    const original = browser.IDBDatabase.prototype.transaction;
    let completed = 0;
    const completionStatuses = [];
    try {
      browser.IDBDatabase.prototype.transaction = function (...args) {
        const tx = original.apply(this, args);
        if (args[1] === "readwrite") tx.addEventListener("complete", () => {
          completionStatuses.push(status.textContent);
          completed++;
        });
        return tx;
      };
      const older = uiStore.commit(scopeId, baseline.revision, [edit("a", { title: "First overlapping save" })]);
      const newer = uiStore.commit(scopeId, baseline.revision + 1, [edit("a", { title: "Latest overlapping save" })]);
      // Attach both handlers immediately, including if a regression rejects a write.
      const results = Promise.allSettled([older, newer]);
      await older;
      const pendingStatus = status.textContent;
      const completedBeforeNewer = completed;
      const settled = await results;
      assert(pendingStatus === "Saving…", "Older completion overwrote newer pending status");
      assert(completedBeforeNewer === 1 && completed === 2, "Did not observe overlapping native transactions");
      equal(completionStatuses, ["Saving…", "Saving…"], "Saved appeared before the relevant transaction completed");
      assert(settled.every((result) => result.status === "fulfilled"), "Overlapping saves did not commit");
      assert(status.textContent === "Saved.", "Latest completed transaction was not reported Saved");
      equal(await uiStore.load(), settled[1].value, "Latest committed records were not persisted");
    } finally { browser.IDBDatabase.prototype.transaction = original; }
  }));
  await test("older save completion cannot overwrite a newer serialization failure", () => withUIStore(async (uiStore, status) => {
    const baseline = await uiStore.load();
    const older = uiStore.commit(scopeId, baseline.revision, [edit("a", { title: "Older committed" })]);
    await rejects(() => uiStore.commit(scopeId, baseline.revision, [edit("a", { plannedStart: () => {} })]), "DataCloneError");
    assert(status.textContent.startsWith("Error:"), "Newer failure was not displayed");
    const failureStatus = status.textContent;
    const committed = await older;
    assert(status.textContent === failureStatus, "Older completion overwrote newer failure");
    equal(await uiStore.load(), committed, "Older successful transaction did not persist");
  }));
  const expected = await store.load();
  sessionStorage.setItem("v2-reload-fixture", JSON.stringify(expected));
  sessionStorage.setItem("v2-checks", JSON.stringify(checks));
  closeAll();
  location.reload();
}

async function afterReload() {
  checks.push(...JSON.parse(sessionStorage.getItem("v2-checks")));
  sessionStorage.removeItem("v2-checks");
  let store = await open();
  await test("actual page reload rehydrates identity, timezone, order, history and retired associations", async () => {
    const expected = JSON.parse(sessionStorage.getItem("v2-reload-fixture"));
    assert(store.localScopeId === expected.ownershipScopeId, "Reload scope changed");
    equal(await store.load(), expected, "Page reload changed committed aggregate");
  });
  await test("storage denial is an explicit loading failure without reset", async () => {
    const original = IDBFactory.prototype.open;
    try {
      IDBFactory.prototype.open = () => { throw new DOMException("Injected storage denial", "SecurityError"); };
      await rejects(open, "SecurityError");
    } finally { IDBFactory.prototype.open = original; }
    assert(states.at(-1) === "error", "Storage denial hidden");
    equal(await store.load(), JSON.parse(sessionStorage.getItem("v2-reload-fixture")), "Denial reset data");
  });
  await test("invalid stored plans, scope metadata and local identity fail without overwriting", async () => {
    closeAll();
    const baseline = JSON.parse(sessionStorage.getItem("v2-reload-fixture"));
    const scopeId = baseline.ownershipScopeId;
    const originalTask = baseline.tasks[0];
    const corrupt = { ...originalTask, sessionCount: 999 };
    await rawWrite((tx) => tx.objectStore("tasks").put(corrupt));
    await rejects(open, "TypeError");
    const raw = await requestResult(indexedDB.open(DATABASE_NAME, 1));
    equal(await requestResult(raw.transaction("tasks").objectStore("tasks").get([scopeId, originalTask.id])), corrupt, "Invalid record overwritten");
    raw.close();
    await rawWrite((tx) => {
      tx.objectStore("tasks").put(originalTask);
      tx.objectStore("scopes").put({ ownershipScopeId: scopeId, revision: baseline.revision, taskIds: [] });
    });
    await rejects(open, "TypeError");
    await rawWrite((tx) => {
      tx.objectStore("scopes").put({ ownershipScopeId: scopeId, revision: baseline.revision, taskIds: baseline.tasks.map((record) => record.id) });
      tx.objectStore("metadata").delete("localScopeId");
    });
    await rejects(open, "TypeError");
    await rawWrite((tx) => tx.objectStore("metadata").put({ key: "localScopeId", value: scopeId }));
    store = await open();
    equal(await store.load(), baseline, "Failed load destroyed existing records");
  });
  await test("version change closes old connection and newer schema is rejected non-destructively", async () => {
    const upgrade = indexedDB.open(DATABASE_NAME, 2);
    const newer = await requestResult(upgrade);
    assert(states.includes("error"), "Version change was hidden");
    await rejects(() => store.load(), "InvalidStateError");
    await rejects(open, "VersionError");
    assert(newer.version === 2 && newer.objectStoreNames.contains("tasks"), "Newer schema overwritten");
    newer.close();
  });
  await reset();
  await test("blocked initialization rejects promptly and closes a late successful connection", async () => {
    const blockerRequest = indexedDB.open(DATABASE_NAME); // deliberately create a version-1 empty test schema
    const blocker = await requestResult(blockerRequest);
    const original = IDBFactory.prototype.open;
    // Hold a real upgrade to v2 with the blocker; pass that request through the adapter's failure handling.
    try {
      IDBFactory.prototype.open = function (name) {
        const request = original.call(this, name, 2);
        // Let the real blocked request eventually succeed without invoking the
        // adapter's intentionally unsupported v1-to-v2 schema upgrade handler.
        request.addEventListener("upgradeneeded", (event) => event.stopImmediatePropagation());
        return request;
      };
      await rejects(open, "InvalidStateError");
    } finally { IDBFactory.prototype.open = original; blocker.close(); }
    // Queued open must close on eventual success, allowing deletion to finish.
    await reset();
  });
  await test("failed first upgrade aborts without leaving partial schema", async () => {
    const original = IDBDatabase.prototype.createObjectStore;
    try {
      IDBDatabase.prototype.createObjectStore = function (...args) {
        if (args[0] === "scopes") throw new DOMException("Injected upgrade failure", "UnknownError");
        return original.apply(this, args);
      };
      await rejects(open, "UnknownError");
    } finally { IDBDatabase.prototype.createObjectStore = original; }
    store = await open();
    equal((await store.load()).tasks, [], "Upgrade left partial schema");
  });
  await test("version-1 malformed physical schema fails without reset", async () => {
    await reset();
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sentinel");
    const db = await requestResult(request);
    db.close();
    await rejects(open, "TypeError");
    const unchanged = await requestResult(indexedDB.open(DATABASE_NAME, 1));
    equal([...unchanged.objectStoreNames], ["sentinel"], "Malformed schema reset");
    unchanged.close();
    await reset();
  });
  store = await open();
  const final = await store.commit(store.localScopeId, 0, [create(task(store.localScopeId, "restart"))]);
  localStorage.setItem("v2-test-restart", JSON.stringify(final));
  await test("V1 task/settings/statistics sentinel values remain byte-for-byte unchanged", async () => {
    for (const [key, value] of Object.entries(sentinel)) assert(localStorage.getItem(`space-boxes-timer:${key}`) === value, "V1 sentinel modified");
  });
  closeAll();
}

async function restart() {
  const store = await open();
  await test("new browser process with same profile reloads disk-persisted tasks and local identity", async () => {
    const expected = JSON.parse(localStorage.getItem("v2-test-restart"));
    assert(expected && store.localScopeId === expected.ownershipScopeId, "Restart local identity lost");
    equal(await store.load(), expected, "Browser process restart lost records");
    for (const [key, value] of Object.entries(sentinel)) assert(localStorage.getItem(`space-boxes-timer:${key}`) === value, "Restart changed V1 data");
  });
  closeAll();
}

try {
  if (location.search === "?restart") await restart();
  else if (sessionStorage.getItem("v2-checks")) await afterReload();
  else { await suite(); /* navigation completes the suite */ }
  if (checks.some((check) => check.includes("V1 task")) || location.search === "?restart") {
    document.getElementById("results").textContent = checks.join("\n");
    await fetch("/results", { method: "POST", body: JSON.stringify({ checks }) });
  }
} catch (error) {
  closeAll();
  document.getElementById("results").textContent = error.stack;
  await fetch("/results", { method: "POST", body: JSON.stringify({ checks, error: error.stack }) });
}
