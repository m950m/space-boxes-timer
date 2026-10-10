import { requireReference } from "../domain/logical-reference.js";
import {
  createTaskPlanningRecord, updateTaskPlanningRecord, rescheduleTaskPlanningRecord,
  cancelTaskPlanningRecord, completeTaskPlanningRecord,
} from "../domain/task-planning.js";
import { setTaskClassification } from "../domain/task-classification.js";
import { validateTaskHierarchy, setTaskParent, splitTaskPlanningRecord } from "../domain/task-hierarchy.js";

export const DATABASE_NAME = "space-boxes-v2";
const STORES = ["metadata", "scopes", "tasks"];

function validateTasks(tasks, scopeId) {
  validateTaskHierarchy(tasks);
  const primaryCounts = new Map();
  for (const task of tasks) {
    createTaskPlanningRecord(task);
    if (task.ownershipScopeId !== scopeId) throw new TypeError("Task ownership does not match scope.");
    if (!["primary", "extra"].includes(task.classification)) throw new TypeError("Invalid classification.");
    if (task.classification === "primary") {
      const count = (primaryCounts.get(task.planDayId) ?? 0) + 1;
      if (count > 3) throw new RangeError("A Plan Day permits at most three Primary tasks per scope.");
      primaryCounts.set(task.planDayId, count);
    }
  }
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
    return rescheduleTaskPlanningRecord(tasks, scopeId, command.taskId, command.planDayId, command.plannedStart);
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
    try { tx = db.transaction(STORES, mode); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new DOMException("Transaction aborted.", "AbortError"));
    const guard = (run) => {
      try { run(); } catch (error) { failure = error; tx.abort(); }
    };
    guard(() => work(tx, (value) => { result = value; }, guard));
  });
}

/** Native local-only planning persistence. No focus authority or history lifecycle. */
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
      const request = indexedDB.open(DATABASE_NAME, 1);
      let failed = false;
      const fail = (error) => { failed = true; reject(error); };
      request.onblocked = () => fail(new DOMException("Storage upgrade is blocked. Close other V2 tabs and reload.", "InvalidStateError"));
      request.onerror = () => fail(request.error);
      request.onupgradeneeded = (event) => {
        try {
          if (event.oldVersion !== 0) throw new TypeError("Unsupported storage upgrade.");
          const connection = request.result;
          connection.createObjectStore("metadata", { keyPath: "key" })
            .add({ key: "localScopeId", value: crypto.randomUUID() });
          connection.createObjectStore("scopes", { keyPath: "ownershipScopeId" });
          connection.createObjectStore("tasks", { keyPath: ["ownershipScopeId", "id"] })
            .createIndex("scope", "ownershipScopeId");
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
      for (const [name, keyPath] of [["metadata", "key"], ["scopes", "ownershipScopeId"], ["tasks", ["ownershipScopeId", "id"]]]) {
        if (JSON.stringify(tx.objectStore(name).keyPath) !== JSON.stringify(keyPath)) throw new TypeError("Invalid storage key structure.");
      }
      const tasksStore = tx.objectStore("tasks");
      const scopeIndex = tasksStore.index("scope");
      if (scopeIndex.keyPath !== "ownershipScopeId" || scopeIndex.unique || scopeIndex.multiEntry) throw new TypeError("Invalid scope index.");
      const meta = tx.objectStore("metadata").get("localScopeId");
      const scopes = tx.objectStore("scopes").getAll();
      const tasks = tasksStore.getAll();
      tasks.onsuccess = () => guard(() => {
        requireReference(meta.result?.value, "local scope identity");
        const byScope = new Map(scopes.result.map((scope) => [scope.ownershipScopeId, scope]));
        for (const task of tasks.result) {
          if (!byScope.has(task.ownershipScopeId)) throw new TypeError("Task has no ownership metadata.");
        }
        for (const scope of scopes.result) {
          requireReference(scope.ownershipScopeId, "ownershipScopeId");
          hydrate(scope.ownershipScopeId, scope, tasks.result.filter((task) => task.ownershipScopeId === scope.ownershipScopeId));
        }
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
    status("ready", undefined, 0);
    return {
      localScopeId: initial,
      load: (scopeId = initial) => run(scopeId, false),
      commit: (scopeId, expectedRevision, commands) => run(scopeId, true, expectedRevision, commands),
      close: () => { closed = true; db.close(); },
    };
  } catch (error) { db?.close(); status("error", error, 0); throw error; }
}
