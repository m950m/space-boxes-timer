import { validateTaskHierarchy, setTaskParent, splitTaskPlanningRecord } from "../js/domain/task-hierarchy.js";
import {
  createTaskPlanningRecord, updateTaskPlanningRecord, rescheduleTaskPlanningRecord,
  completeTaskPlanningRecord, getTaskPlanningTotals, getPlannedFocusItem,
} from "../js/domain/task-planning.js";
import { setTaskClassification } from "../js/domain/task-classification.js";

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function test(name, run) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}
function reject(input, run, errorType = TypeError, messagePart = "") {
  const before = JSON.stringify(input);
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof errorType, `Expected ${errorType.name}, got ${error}`);
  assert(error.message.includes(messagePart), `Unexpected error: ${error.message}`);
  assert(JSON.stringify(input) === before, "Rejected operation mutated input");
}
function task(id, fields = {}) {
  return createTaskPlanningRecord({
    id, ownershipScopeId: "local-a", planDayId: "day-a", classification: "extra",
    title: `Work ${id}`, plannedStart: "caller-start",
    sessionPlan: [{ id: `${id}-focus`, activeMinutes: 25 }], ...fields,
  });
}
function split(tasks, newWork, scope = "local-a", id = "source") {
  return splitTaskPlanningRecord(tasks, scope, id, newWork);
}

test("planning records accept one optional reference and reject invalid/self parents", () => {
  for (const parentTaskId of [undefined, null, "parent"]) {
    assert(task("child", { parentTaskId }).parentTaskId === parentTaskId, "Parent changed");
  }
  for (const parentTaskId of ["child", "", " ", [], ["a", "b"], {}, 0]) {
    reject(parentTaskId, () => task("child", { parentTaskId }));
  }
});

test("attach, replace and detach preserve identity and affect only the selected task", () => {
  const history = [{ taskId: "child", startingSnapshot: { parentTaskId: "old-parent" } }];
  const tasks = freeze([task("parent-a"), task("parent-b", { planDayId: "day-b" }),
    task("child", { history }), task("grandchild", { parentTaskId: "child" })]);
  const attached = setTaskParent(tasks, "local-a", "child", "parent-a");
  const replaced = setTaskParent(attached, "local-a", "child", "parent-b");
  equal(replaced[2], { ...tasks[2], parentTaskId: "parent-b" }, "Reparent changed planning");
  assert(replaced[2].history === history, "Historical parent snapshot changed");
  for (const index of [0, 1, 3]) assert(replaced[index] === tasks[index], "Related task changed");
  equal(setTaskParent(replaced, "local-a", "child", null)[2],
    { ...tasks[2], parentTaskId: null }, "Detach changed identity/planning");
});

test("missing, foreign-scope and wrong-scope targets/parents reject atomically", () => {
  const tasks = [task("child"), task("foreign", { ownershipScopeId: "account-b" })];
  for (const parent of ["missing", "foreign"]) {
    reject(tasks, () => setTaskParent(tasks, "local-a", "child", parent), RangeError, "same ownership");
  }
  for (const [scope, id] of [["account-b", "child"], ["local-a", "missing"]]) {
    reject(tasks, () => setTaskParent(tasks, scope, id, null), RangeError, "not found");
  }
  for (const [scope, id, parent] of [["", "child", null], ["local-a", "", null],
    ...[undefined, " ", [], ["a", "b"], {}].map((parent) => ["local-a", "child", parent])]) {
    reject(tasks, () => setTaskParent(tasks, scope, id, parent));
  }
});

test("self, immediate and indirect hierarchy cycles reject without mutation", () => {
  const tasks = freeze([task("root"), task("child", { parentTaskId: "root" }),
    task("leaf", { parentTaskId: "child" })]);
  for (const [id, parent] of [["root", "root"], ["root", "child"], ["root", "leaf"], ["child", "leaf"]]) {
    reject(tasks, () => setTaskParent(tasks, "local-a", id, parent), TypeError, "cycles");
  }
  const existingCycle = [{ ...task("a"), parentTaskId: "b" }, { ...task("b"), parentTaskId: "a" }];
  reject(existingCycle, () => validateTaskHierarchy(existingCycle), TypeError, "cycles");
});

test("duplicate IDs in different scopes resolve local parents and isolate changes", () => {
  const tasks = freeze([task("root"), task("child"),
    task("root", { ownershipScopeId: "account-b" }),
    task("child", { ownershipScopeId: "account-b", parentTaskId: "root" })]);
  const result = setTaskParent(tasks, "local-a", "child", "root");
  validateTaskHierarchy(result);
  assert(result[2] === tasks[2] && result[3] === tasks[3], "Other scope changed");
});

test("malformed collections, ambiguous identities and dangling ancestry reject", () => {
  for (const tasks of [null, {}, [null], [[]], [{ id: "a" }],
    [task("a"), task("a", { planDayId: "day-b" })],
    [{ ...task("a"), parentTaskId: [] }]]) {
    reject(tasks, () => validateTaskHierarchy(tasks));
  }
  const tasks = [task("a", { parentTaskId: "absent" }), task("target")];
  reject(tasks, () => setTaskParent(tasks, "local-a", "target", null), RangeError);
  validateTaskHierarchy([]);
});

test("deep hierarchy and many siblings have no selected depth/count cap", () => {
  const tasks = Array.from({ length: 12000 }, (_, index) => ({
    id: `task-${index}`, ownershipScopeId: "local-a",
    parentTaskId: index === 0 ? null : `task-${index - 1}`,
  }));
  // Leaf first forces traversal of the full chain before any ancestor is cached.
  validateTaskHierarchy([...tasks].reverse());
  const deep = setTaskParent([...tasks].reverse(), "local-a", "task-11999", "task-11998");
  assert(deep.length === 12000, "Hierarchy was truncated");
  reject(tasks, () => setTaskParent(tasks, "local-a", "task-0", "task-11999"), TypeError, "cycles");
  validateTaskHierarchy(tasks.map((item, index) => ({ ...item, parentTaskId: index ? "task-0" : null })));
});

test("hierarchy changes compose with editing, classification and explicit rescheduling", () => {
  const original = freeze([task("root"), task("child")]);
  let result = setTaskParent(original, "local-a", "child", "root");
  result = setTaskClassification(result, "local-a", "child", "primary");
  result[1] = updateTaskPlanningRecord(result[1], { title: "Replanned child" });
  result = rescheduleTaskPlanningRecord(result, "local-a", "child", "day-b", "later");
  validateTaskHierarchy(result);
  assert(result[1].id === "child" && result[1].parentTaskId === "root", "Identity/parent lost");
  assert(result[0] === original[0], "Parent was rescheduled/promoted");
  reject(result, () => updateTaskPlanningRecord(result[1], { parentTaskId: null }));
});

test("completion is explicit for every task and totals stay local to each focus target", () => {
  const tasks = freeze([task("root"), task("child", { parentTaskId: "root" })]);
  const childComplete = completeTaskPlanningRecord(tasks[1], "explicit-child-time");
  assert(!Object.hasOwn(tasks[0], "completedAt"), "Parent completed automatically");
  assert(!Object.hasOwn(childComplete, "actualStart"), "Focus began automatically");
  equal(getTaskPlanningTotals(tasks[0]), { sessionCount: 1, plannedFocusMinutes: 25 }, "Child rolled up");
  equal(getTaskPlanningTotals(childComplete), { sessionCount: 1, plannedFocusMinutes: 25 }, "Wrong child total");
  const parentComplete = completeTaskPlanningRecord(tasks[0], "explicit-parent-time");
  assert(!Object.hasOwn(tasks[1], "completedAt"), "Child completed automatically");
  assert(parentComplete.id === "root" && childComplete.id === "child", "Focus target identity changed");
});

test("splitting creates separate plans and leaves source snapshots, evidence and links intact", () => {
  const history = [{ id: "actual", taskId: "source", plannedItemId: "retired-focus",
    startingSnapshot: { title: "Original", parentTaskId: "root", planDayId: "old-day",
      timezone: "Africa/Cairo", plannedStart: "old-start", activeMinutes: 40 }, outcome: "ended-early" }];
  const activity = [{ id: "focus", sessionId: "actual", kind: "focus", minutes: 12 },
    { id: "pause", sessionId: "actual", kind: "pause", minutes: 75 },
    { id: "uncertain", sessionId: "actual", kind: "uncertain" }];
  const external = freeze({ history, activity });
  const source = task("source", { parentTaskId: "root", history, activity,
    retiredFocusItems: [{ id: "retired-focus", activeMinutes: 40 }],
    completedAt: "explicit-old-time" });
  const tasks = freeze([task("root"), source]);
  const before = JSON.stringify(external);
  const newWork = freeze([task("new-a", { planDayId: "day-b", plannedStart: "later" }),
    task("new-b", { parentTaskId: "source" })]);
  const result = split(tasks, newWork);
  assert(result[0] === tasks[0] && result[1] === source, "Source/relative was rewritten");
  assert(result[1].history === history && result[1].activity === activity, "Evidence copied/replaced");
  assert(JSON.stringify(external) === before, "External evidence rewritten");
  assert(getPlannedFocusItem(result[1], history[0].plannedItemId).id === "retired-focus", "History link lost");
  for (const added of result.slice(2)) {
    for (const field of ["history", "activity", "retiredFocusItems", "actualStart", "completedAt", "cancelledAt"]) {
      assert(!Object.hasOwn(added, field), `Split inherited ${field}`);
    }
    equal(getTaskPlanningTotals(added), { sessionCount: 1, plannedFocusMinutes: 25 }, "History counted in new plan");
  }
  assert(!Object.hasOwn(result[2], "parentTaskId"), "Implicit split lineage/parent introduced");
  assert(result[2].planDayId === "day-b", "Split lost explicit day intent");
});

test("new plan containers are isolated from caller mutations", () => {
  const tasks = freeze([task("source")]);
  const supplied = task("new");
  const result = split(tasks, [supplied]);
  supplied.sessionPlan[0].activeMinutes = 999;
  equal(getTaskPlanningTotals(result[1]), { sessionCount: 1, plannedFocusMinutes: 25 }, "Caller changed new plan");
  assert(result[0] === tasks[0], "Source changed");
});

test("subtasks split without changing ancestry; batch parents may reference later new tasks", () => {
  const tasks = freeze([task("root"), task("source", { parentTaskId: "root" })]);
  const result = split(tasks, [task("new-child", { parentTaskId: "new-parent" }), task("new-parent")]);
  validateTaskHierarchy(result);
  assert(result[1] === tasks[1], "Original subtask/ancestry changed");
  assert(result[2].parentTaskId === "new-parent", "Explicit batch parent lost");
});

test("split task identities must be new and unambiguous within the source scope", () => {
  const tasks = [task("source"), task("existing")];
  for (const newWork of [[task("source")], [task("existing")], [task("new"), task("new")]]) {
    reject([tasks, newWork], () => split(tasks, newWork), TypeError, "unambiguous");
  }
  const otherScope = task("new", { ownershipScopeId: "account-b" });
  const result = split([...tasks, otherScope], [task("new")]);
  assert(result[2] === otherScope && result[3].ownershipScopeId === "local-a", "Other scope identity interfered");
});

test("invalid split parent, foreign scope and batch cycle reject atomically", () => {
  const tasks = freeze([task("source"), task("foreign", { ownershipScopeId: "account-b" })]);
  for (const parentTaskId of ["missing", "foreign"]) {
    const newWork = [task("new", { parentTaskId })];
    reject([tasks, newWork], () => split(tasks, newWork), RangeError, "same ownership");
  }
  const cycle = [task("a", { parentTaskId: "b" }), task("b", { parentTaskId: "a" })];
  reject([tasks, cycle], () => split(tasks, cycle), TypeError, "cycles");
  const foreign = [task("new", { ownershipScopeId: "account-b" })];
  reject([tasks, foreign], () => split(tasks, foreign), TypeError, "source ownership");
  reject(tasks, () => split(tasks, [task("new")], "account-b"), RangeError);
});

test("split reuses required planning and excludes historical/session/lifecycle input", () => {
  const tasks = freeze([task("source")]);
  for (const newWork of [null, {}, [], [null], [[]], new Array(1)]) {
    reject([tasks, newWork], () => split(tasks, newWork));
  }
  for (const field of ["title", "plannedStart", "sessionPlan", "planDayId", "id", "classification"]) {
    const record = { ...task("new") };
    delete record[field];
    reject([tasks, record], () => split(tasks, [record]));
  }
  for (const field of ["history", "activity", "retiredFocusItems", "retiredPlannedBreaks", "completedAt",
    "cancelledAt", "actualStart", "status", "sessionCount", "plannedFocusMinutes"]) {
    const record = { ...task("new"), [field]: [] };
    reject([tasks, record], () => split(tasks, [record]), TypeError, "new-work planning field");
  }
  const forged = { ...task("new"), [Symbol("history")]: [] };
  reject([tasks, forged], () => split(tasks, [forged]));
});

test("split enforces Primary capacity for every destination and all batch additions", () => {
  const tasks = freeze([task("source"), ...["p1", "p2", "p3"].map((id) => task(id, { classification: "primary" }))]);
  reject(tasks, () => split(tasks, [task("fourth", { classification: "primary" })]), RangeError, "three Primary");
  const result = split(tasks, [task("extra"), task("next-primary", { classification: "primary", planDayId: "day-b" })]);
  assert(result.length === 6 && result[0] === tasks[0], "Permissible split changed source");
  const batch = ["a", "b", "c", "d"].map((id) => task(id, { classification: "primary", planDayId: "day-b" }));
  reject([tasks, batch], () => split(tasks, batch), RangeError, "three Primary");
});

console.log(`${passed} tests passed.`);
