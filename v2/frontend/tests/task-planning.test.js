import {
  createTaskPlanningRecord,
  updateTaskPlanningRecord,
  getTaskPlanningTotals,
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

function task(fields = {}) {
  return {
    id: "task-a",
    ownershipScopeId: "local-a",
    planDayId: "day-a",
    classification: "extra",
    title: "Planned work",
    plannedStart: "caller-selected-start",
    sessionPlan: [
      { id: "focus-a", activeMinutes: 25 },
      { id: "focus-b", activeMinutes: 25 },
      { id: "focus-c", activeMinutes: 40 },
    ],
    ...fields,
  };
}

function rejectUnchanged(input, operation, messagePart) {
  const before = JSON.stringify(input);
  let error;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof TypeError, "Expected TypeError");
  assert(error.message.includes(messagePart), `Unexpected error: ${error.message}`);
  assert(JSON.stringify(input) === before, "Rejection changed input state");
}

test("required fields cannot be omitted on creation", () => {
  for (const key of ["id", "ownershipScopeId", "title", "planDayId", "plannedStart", "sessionPlan"]) {
    const record = task();
    delete record[key];
    rejectUnchanged(record, () => createTaskPlanningRecord(record), key);
  }
});

test("blank required metadata and incomplete plans reject", () => {
  for (const [key, values] of [
    ["id", [null, " ", 12]],
    ["ownershipScopeId", [null, " "]],
    ["planDayId", [null, " ", {}]],
    ["title", [null, " ", 12]],
    ["plannedStart", [null, " "]],
    ["sessionPlan", [null, {}, []]],
  ]) {
    for (const value of values) {
      const record = task({ [key]: value });
      rejectUnchanged(record, () => createTaskPlanningRecord(record), key);
    }
  }
  for (const record of [null, [], "task"]) {
    rejectUnchanged(record, () => createTaskPlanningRecord(record), "record");
  }
});

test("ordered independently identified items derive three sessions and 90 minutes", () => {
  const original = freeze(task());
  const record = createTaskPlanningRecord(original);
  equal(record, original, "Planning fields or order changed");
  assert(record !== original && record.sessionPlan !== original.sessionPlan,
    "Creation did not snapshot the plan");
  assert(record.sessionPlan.every((item, index) => item !== original.sessionPlan[index]),
    "Planned items were not copied");
  equal(getTaskPlanningTotals(record), { sessionCount: 3, plannedFocusMinutes: 90 },
    "Wrong aggregate totals");
  assert(!Object.hasOwn(record, "sessionCount") && !Object.hasOwn(record, "plannedFocusMinutes"),
    "Derived values were stored in the task");
});

test("missing or duplicate planned item identities reject", () => {
  for (const sessionPlan of [
    [null],
    [[]],
    [{ activeMinutes: 25 }],
    [{ id: " ", activeMinutes: 25 }],
    [{ id: "same", activeMinutes: 25 }, { id: "same", activeMinutes: 40 }],
    new Array(1),
  ]) {
    const record = task({ sessionPlan });
    rejectUnchanged(record, () => createTaskPlanningRecord(record), "");
  }
});

test("durations must support finite numeric arithmetic", () => {
  for (const activeMinutes of [undefined, null, "25", NaN, Infinity, -Infinity]) {
    const record = task({ sessionPlan: [{ id: "focus-a", activeMinutes }] });
    rejectUnchanged(record, () => createTaskPlanningRecord(record), "activeMinutes");
  }
  const overflow = task({ sessionPlan: [
    { id: "a", activeMinutes: Number.MAX_VALUE },
    { id: "b", activeMinutes: Number.MAX_VALUE },
  ] });
  rejectUnchanged(overflow, () => createTaskPlanningRecord(overflow), "total");
});

test("no duration rounding, defaults or arbitrary upper limits are introduced", () => {
  const record = createTaskPlanningRecord(task({ sessionPlan: [
    { id: "fraction", activeMinutes: 0.25 },
    { id: "long", activeMinutes: 1000000 },
  ] }));
  equal(getTaskPlanningTotals(record), { sessionCount: 2, plannedFocusMinutes: 1000000.25 },
    "Durations were capped, rounded or replaced");
});

test("editing a duration recalculates total without changing item identity", () => {
  const original = freeze(createTaskPlanningRecord(task()));
  const changes = freeze({ sessionPlan: original.sessionPlan.map((item) => (
    item.id === "focus-b" ? { ...item, activeMinutes: 35 } : item
  )) });
  const updated = updateTaskPlanningRecord(original, changes);
  equal(getTaskPlanningTotals(updated), { sessionCount: 3, plannedFocusMinutes: 100 },
    "Duration update did not recalculate total");
  equal(updated.sessionPlan.map((item) => item.id), ["focus-a", "focus-b", "focus-c"],
    "Duration edit replaced item identities");
  equal(getTaskPlanningTotals(original), { sessionCount: 3, plannedFocusMinutes: 90 },
    "Original totals changed");
});

test("adding and removing items recalculates count and total", () => {
  const original = freeze(createTaskPlanningRecord(task()));
  const added = freeze(updateTaskPlanningRecord(original, {
    sessionPlan: [...original.sessionPlan, { id: "focus-d", activeMinutes: 10 }],
  }));
  equal(getTaskPlanningTotals(added), { sessionCount: 4, plannedFocusMinutes: 100 },
    "Addition did not change aggregates");
  const removed = updateTaskPlanningRecord(added, {
    sessionPlan: added.sessionPlan.filter((item) => item.id !== "focus-b"),
  });
  equal(getTaskPlanningTotals(removed), { sessionCount: 3, plannedFocusMinutes: 75 },
    "Removal did not change aggregates");
});

test("aggregate projections cannot become conflicting editable values", () => {
  for (const key of ["sessionCount", "plannedFocusMinutes"]) {
    const record = task({ [key]: 999 });
    rejectUnchanged(record, () => createTaskPlanningRecord(record), "computed");
    const original = task();
    const changes = { [key]: 999 };
    rejectUnchanged([original, changes], () => updateTaskPlanningRecord(original, changes), key);
  }
  const original = createTaskPlanningRecord(task());
  const projection = getTaskPlanningTotals(original);
  projection.sessionCount = 999;
  projection.plannedFocusMinutes = 999;
  equal(getTaskPlanningTotals(original), { sessionCount: 3, plannedFocusMinutes: 90 },
    "Projection became a second source of truth");
});

test("planning edits preserve task identity, scope, Plan Day and historical evidence", () => {
  const original = freeze(task({
    actualStart: "historical-actual-start",
    status: "open",
    completedAt: null,
    parentTaskId: "parent-a",
    history: [{
      id: "actual-a",
      plannedItemId: "focus-a",
      startingSnapshot: { title: "Old title", planDayId: "old-day", activeMinutes: 25 },
      activity: [{ kind: "focus", minutes: 12 }, { kind: "pause", minutes: 75 }],
      outcome: "ended-early",
    }],
  }));
  const changes = freeze({
    title: "Updated work",
    plannedStart: { callerDefinedSchedulingIntent: "later" },
    sessionPlan: [{ id: "focus-b", activeMinutes: 30 }],
  });
  const updated = updateTaskPlanningRecord(original, changes);
  equal(updated, { ...original, ...changes }, "An unrelated field changed");
  assert(updated.history === original.history, "Historical evidence was rewritten");
  equal(updated.history, original.history, "Removed planned item lost historical association");
  equal(getTaskPlanningTotals(updated), { sessionCount: 1, plannedFocusMinutes: 30 },
    "Actual focus or pause was included in planned totals");
});

test("planned start is opaque intent and never initializes actual focus or completion", () => {
  for (const plannedStart of ["caller-defined", 0, { localIntent: "caller-defined" }]) {
    const original = freeze(task({ plannedStart }));
    const record = createTaskPlanningRecord(original);
    assert(record.plannedStart === plannedStart, "Planned start was interpreted or converted");
    const updated = updateTaskPlanningRecord(record, { plannedStart: "another-intent" });
    equal(updated, { ...record, plannedStart: "another-intent" }, "Edit added lifecycle state");
    assert(!Object.hasOwn(updated, "actualStart") && !Object.hasOwn(updated, "status"),
      "Planning initiated actual focus or task lifecycle");
  }
});

test("invalid updates cannot change input or bypass required fields", () => {
  const original = task();
  for (const changes of [
    null, [],
    { title: " " }, { plannedStart: undefined }, { sessionPlan: [] },
    { id: "other" }, { ownershipScopeId: "other" }, { planDayId: "other" },
    { history: [] }, { actualStart: "now" }, { classification: "primary" },
    { [Symbol("unexpected")]: true },
  ]) {
    rejectUnchanged([original, changes], () => updateTaskPlanningRecord(original, changes), "");
  }
  const incomplete = task({ title: null });
  rejectUnchanged(incomplete, () => updateTaskPlanningRecord(incomplete, { title: "Repaired" }), "title");
  rejectUnchanged(incomplete, () => getTaskPlanningTotals(incomplete), "title");
});

test("snapshots isolate current plan containers from caller mutations", () => {
  const supplied = task();
  const record = createTaskPlanningRecord(supplied);
  supplied.sessionPlan[0].activeMinutes = 500;
  supplied.sessionPlan.push({ id: "later", activeMinutes: 10 });
  equal(getTaskPlanningTotals(record), { sessionCount: 3, plannedFocusMinutes: 90 },
    "Caller mutated the created plan");
  const changes = { sessionPlan: [{ id: "replacement", activeMinutes: 15 }] };
  const updated = updateTaskPlanningRecord(record, changes);
  changes.sessionPlan[0].activeMinutes = 100;
  equal(getTaskPlanningTotals(updated), { sessionCount: 1, plannedFocusMinutes: 15 },
    "Caller mutated the updated plan");
});

test("planning and existing classification operations compose without changing either contract", () => {
  const original = freeze(createTaskPlanningRecord(task({ history: [{ id: "historical" }] })));
  const promoted = freeze(setTaskClassification([original], "local-a", "task-a", "primary")[0]);
  const updated = updateTaskPlanningRecord(promoted, { title: "New title" });
  assert(updated.classification === "primary", "Planning edit changed classification");
  assert(updated.history === original.history, "Composition rewrote history");
  equal(getTaskPlanningTotals(updated), { sessionCount: 3, plannedFocusMinutes: 90 },
    "Classification changed planning totals");
  const demoted = setTaskClassification([updated], "local-a", "task-a", "extra")[0];
  equal(demoted, { ...updated, classification: "extra" }, "Classification changed the planning record");
});

console.log(`${passed} tests passed.`);
