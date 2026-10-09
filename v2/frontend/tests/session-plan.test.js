import {
  createTaskPlanningRecord,
  updateTaskPlanningRecord,
  getTaskPlanningTotals,
  addPlannedFocusItem,
  editPlannedFocusItem,
  reorderPlannedFocusItems,
  removePlannedFocusItem,
  addPlannedBreak,
  editPlannedBreak,
  removePlannedBreak,
  getPlannedFocusItem,
  getPlannedBreak,
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
  return createTaskPlanningRecord({
    id: "task-a", ownershipScopeId: "local-a", planDayId: "day-a",
    classification: "extra", title: "Planned work", plannedStart: "chosen-start",
    sessionPlan: [
      { id: "a", activeMinutes: 25 },
      { id: "b", activeMinutes: 25 },
      { id: "c", activeMinutes: 40 },
    ],
    ...fields,
  });
}
function rest(fields = {}) {
  return { id: "rest-ab", breakMinutes: 5, afterFocusItemId: "a", beforeFocusItemId: "b",
    ...fields };
}
function totals(record, sessionCount, plannedFocusMinutes) {
  equal(getTaskPlanningTotals(record), { sessionCount, plannedFocusMinutes }, "Wrong totals");
}
function reject(input, run) {
  const before = JSON.stringify(input);
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof TypeError || error instanceof RangeError, "Expected validation error");
  equal(input, JSON.parse(before), "Rejection mutated input");
}

test("focus insertion, duration edit and reorder preserve caller-selected identities", () => {
  const original = freeze(task());
  const added = freeze(addPlannedFocusItem(original, { id: "d", activeMinutes: 10 }, 1));
  equal(added.sessionPlan.map((item) => item.id), ["a", "d", "b", "c"], "Wrong insertion");
  const edited = freeze(editPlannedFocusItem(added, "b", 35));
  const reordered = reorderPlannedFocusItems(edited, ["c", "b", "a", "d"]);
  equal(reordered.sessionPlan, [
    { id: "c", activeMinutes: 40 }, { id: "b", activeMinutes: 35 },
    { id: "a", activeMinutes: 25 }, { id: "d", activeMinutes: 10 },
  ], "Reorder changed identities/durations");
  totals(original, 3, 90);
  totals(added, 4, 100);
  totals(reordered, 4, 110);
});

test("focus insertion at both boundaries and fractional durations require no defaults", () => {
  const original = freeze(task());
  const first = addPlannedFocusItem(original, { id: "first", activeMinutes: 0.25 }, 0);
  const last = addPlannedFocusItem(first, { id: "last", activeMinutes: 1000000 }, 4);
  equal(last.sessionPlan.map((item) => item.id), ["first", "a", "b", "c", "last"], "Wrong order");
  totals(last, 5, 1000090.25);
});

test("removal keeps multiple external history references and frozen starting values recoverable", () => {
  const history = freeze([
    { id: "actual-1", plannedItemId: "a", startingSnapshot: { activeMinutes: 25 } },
    { id: "actual-2", plannedItemId: "a", startingSnapshot: { activeMinutes: 15 } },
  ]);
  const original = freeze(task({ history }));
  const edited = freeze(editPlannedFocusItem(original, "a", 30));
  const removed = freeze(removePlannedFocusItem(edited, "a"));
  const editedAgain = updateTaskPlanningRecord(removed, { title: "Later planning" });
  assert(editedAgain.history === history, "History container was rewritten");
  equal(history.map((session) => getPlannedFocusItem(editedAgain, session.plannedItemId).id),
    ["a", "a"], "Historical references no longer resolve");
  equal(getPlannedFocusItem(editedAgain, "a"), { id: "a", activeMinutes: 30 }, "Removed item lost");
  equal(history[0].startingSnapshot, { activeMinutes: 25 }, "Snapshot was rewritten by edit");
  totals(editedAgain, 2, 65);
});

test("removed identities accumulate even when history is stored separately", () => {
  const original = freeze(task());
  const first = freeze(removePlannedFocusItem(original, "a"));
  const second = removePlannedFocusItem(first, "b");
  equal(second.retiredFocusItems.map((item) => item.id), ["a", "b"], "Earlier identity was lost");
  equal(getPlannedFocusItem(second, "a"), original.sessionPlan[0], "External link cannot resolve");
  totals(second, 1, 40);
  reject(second, () => addPlannedFocusItem(second, { id: "a", activeMinutes: 99 }, 0));
  reject(second, () => removePlannedFocusItem(second, "c"));
});

test("whole-plan replacement also retains removed identities and prevents reuse", () => {
  const original = freeze(task());
  const replaced = freeze(updateTaskPlanningRecord(original, {
    sessionPlan: [{ id: "d", activeMinutes: 20 }],
  }));
  equal(replaced.retiredFocusItems, original.sessionPlan, "Replacement bypassed retention");
  reject(replaced, () => updateTaskPlanningRecord(replaced, {
    sessionPlan: [{ id: "a", activeMinutes: 100 }],
  }));
  for (const changes of [{ retiredFocusItems: [] }, { retiredPlannedBreaks: [] }]) {
    reject([replaced, changes], () => updateTaskPlanningRecord(replaced, changes));
  }
});

test("invalid focus operations reject atomically", () => {
  const original = freeze(task());
  for (const index of [-1, 4, 0.5, undefined, "1"]) {
    reject(original, () => addPlannedFocusItem(original, { id: "d", activeMinutes: 10 }, index));
  }
  for (const item of [null, {}, { id: "a", activeMinutes: 10 }, { id: "d" }]) {
    reject(original, () => addPlannedFocusItem(original, item, 1));
  }
  for (const order of [null, [], ["a", "b"], ["a", "a", "c"], ["a", "b", "unknown"],
    ["a", "b", undefined], new Array(3)]) {
    reject(original, () => reorderPlannedFocusItems(original, order));
  }
  for (const id of ["unknown", " ", null]) {
    reject(original, () => editPlannedFocusItem(original, id, 30));
    reject(original, () => removePlannedFocusItem(original, id));
    reject(original, () => getPlannedFocusItem(original, id));
  }
  for (const duration of [undefined, null, "30", Infinity]) {
    reject(original, () => editPlannedFocusItem(original, "a", duration));
  }
});

test("break placement is independent of focus totals, pauses, interruptions and execution", () => {
  const original = freeze(task({ history: [
    { kind: "focus", minutes: 12 }, { kind: "pause", minutes: 75 },
    { kind: "interruption", minutes: 8 },
  ] }));
  const added = freeze(addPlannedBreak(original, rest()));
  const edited = freeze(editPlannedBreak(added, "rest-ab", { breakMinutes: 1000000.25 }));
  const removed = removePlannedBreak(edited, "rest-ab");
  for (const record of [added, edited, removed]) {
    totals(record, 3, 90);
    assert(record.history === original.history, "Break changed recorded activity");
    for (const field of ["actualStart", "status", "completedAt", "interruptionCount", "focusReservation"]) {
      assert(!Object.hasOwn(record, field), `Break initialized ${field}`);
    }
  }
  equal(getPlannedBreak(removed, "rest-ab"), edited.plannedBreaks[0], "Removed rest was lost");
});

test("break references travel with intact adjacent focus pairs when reordered", () => {
  const original = freeze(task({ plannedBreaks: [rest()] }));
  const reordered = reorderPlannedFocusItems(original, ["c", "a", "b"]);
  equal(reordered.plannedBreaks, original.plannedBreaks, "Break silently moved to other items");
  equal(reordered.sessionPlan.map((item) => item.id), ["c", "a", "b"], "Wrong focus order");
  totals(reordered, 3, 90);
});

test("changes displacing a break require an explicit atomic placement/removal update", () => {
  const original = freeze(task({ plannedBreaks: [rest()] }));
  reject(original, () => reorderPlannedFocusItems(original, ["a", "c", "b"]));
  reject(original, () => removePlannedFocusItem(original, "a"));
  reject(original, () => addPlannedFocusItem(original, { id: "d", activeMinutes: 10 }, 1));
  const moved = freeze(updateTaskPlanningRecord(original, {
    sessionPlan: [original.sessionPlan[0], original.sessionPlan[2], original.sessionPlan[1]],
    plannedBreaks: [rest({ beforeFocusItemId: "c" })],
  }));
  equal(moved.plannedBreaks[0], rest({ beforeFocusItemId: "c" }), "Explicit placement failed");
  const removed = updateTaskPlanningRecord(moved, {
    sessionPlan: moved.sessionPlan.filter((item) => item.id !== "a"), plannedBreaks: [],
  });
  equal(getPlannedBreak(removed, "rest-ab"), moved.plannedBreaks[0], "Retired adjacency lost");
  equal(getPlannedFocusItem(removed, "a"), original.sessionPlan[0], "Retired focus lost");
  totals(removed, 2, 65);
});

test("break duration and placement edits preserve identity and recorded-break snapshots", () => {
  const history = freeze([{ id: "recorded-rest", plannedBreakId: "rest-ab", breakMinutes: 5 }]);
  const original = freeze(task({ plannedBreaks: [rest()], history }));
  const moved = freeze(editPlannedBreak(original, "rest-ab", {
    breakMinutes: 7, afterFocusItemId: "b", beforeFocusItemId: "c",
  }));
  const removed = removePlannedBreak(moved, "rest-ab");
  assert(removed.history === history, "Recorded rest was rewritten");
  assert(getPlannedBreak(removed, history[0].plannedBreakId).id === "rest-ab", "Link lost");
  assert(history[0].breakMinutes === 5, "Historical starting value changed");
  reject(removed, () => addPlannedBreak(removed, rest()));
});

test("optional breaks have no defaults or per-gap count limit", () => {
  const original = freeze(task());
  assert(!Object.hasOwn(original, "plannedBreaks"), "An optional break default was added");
  const two = addPlannedBreak(addPlannedBreak(original, rest()), rest({ id: "another", breakMinutes: 0.25 }));
  equal(two.plannedBreaks.map((item) => item.id), ["rest-ab", "another"], "Break order lost");
  totals(two, 3, 90);
});

test("invalid break durations, identities and adjacency reject without input mutation", () => {
  const original = freeze(task({ plannedBreaks: [rest()] }));
  for (const plannedBreak of [null, {}, rest(), rest({ id: " " }),
    rest({ id: "new", breakMinutes: undefined }), rest({ id: "new", breakMinutes: "5" }),
    rest({ id: "new", breakMinutes: Infinity }), rest({ id: "new", afterFocusItemId: "unknown" }),
    rest({ id: "new", beforeFocusItemId: "a" }), rest({ id: "new", beforeFocusItemId: "c" }),
    rest({ id: "new", afterFocusItemId: "b", beforeFocusItemId: "a" })]) {
    reject(original, () => addPlannedBreak(original, plannedBreak));
  }
  for (const changes of [null, [], { id: "new" }, { activeMinutes: 5 }, { completed: true },
    { breakMinutes: null }, { beforeFocusItemId: "c" }, { [Symbol("unexpected")]: true }]) {
    reject([original, changes], () => editPlannedBreak(original, "rest-ab", changes));
  }
  for (const id of ["unknown", null]) {
    reject(original, () => editPlannedBreak(original, id, { breakMinutes: 5 }));
    reject(original, () => removePlannedBreak(original, id));
    reject(original, () => getPlannedBreak(original, id));
  }
});

test("creation and generic update validate breaks and retained identities", () => {
  const original = freeze(task());
  for (const plannedBreaks of [null, undefined, {}, new Array(1), [rest(), rest()],
    [rest({ beforeFocusItemId: "c" })]]) {
    reject(original, () => updateTaskPlanningRecord(original, { plannedBreaks }));
  }
  for (const fields of [
    { retiredFocusItems: null }, { retiredFocusItems: [original.sessionPlan[0]] },
    { retiredFocusItems: [{ id: "old", activeMinutes: 1 }, { id: "old", activeMinutes: 2 }] },
    { retiredPlannedBreaks: null },
    { plannedBreaks: [rest()], retiredPlannedBreaks: [rest()] },
  ]) {
    reject(fields, () => task(fields));
  }
});

test("returned plan and history-lookup snapshots isolate item containers", () => {
  const original = task();
  const suppliedBreak = rest();
  const added = addPlannedBreak(original, suppliedBreak);
  suppliedBreak.breakMinutes = 999;
  assert(added.plannedBreaks[0].breakMinutes === 5, "Break input leaked");
  const removed = removePlannedFocusItem(original, "a");
  removed.retiredFocusItems[0].activeMinutes = 999;
  assert(original.sessionPlan[0].activeMinutes === 25, "Retired item leaked to original");
  const focusLookup = getPlannedFocusItem(removed, "a");
  focusLookup.activeMinutes = 0;
  assert(getPlannedFocusItem(removed, "a").activeMinutes === 999, "Lookup exposed item container");
  const breakLookup = getPlannedBreak(added, "rest-ab");
  breakLookup.beforeFocusItemId = "unknown";
  assert(getPlannedBreak(added, "rest-ab").beforeFocusItemId === "b", "Lookup exposed break");
  const copied = createTaskPlanningRecord(added);
  copied.plannedBreaks[0].breakMinutes = 100;
  assert(added.plannedBreaks[0].breakMinutes === 5, "Creation shared break containers");
});

test("classification and item operations preserve task metadata and lifecycle", () => {
  const original = freeze(task({ actualStart: "historical-start", status: "open", completedAt: null,
    history: [{ plannedItemId: "a" }] }));
  const removed = removePlannedFocusItem(original, "a");
  const promoted = setTaskClassification([removed], "local-a", "task-a", "primary")[0];
  const updated = addPlannedBreak(promoted, rest({ afterFocusItemId: "b", beforeFocusItemId: "c" }));
  for (const field of ["id", "ownershipScopeId", "planDayId", "plannedStart", "actualStart", "status", "completedAt", "history"]) {
    assert(updated[field] === original[field], `${field} changed`);
  }
  assert(updated.classification === "primary", "Classification changed");
  assert(getPlannedFocusItem(updated, "a").id === "a", "Composition lost retired reference");
  totals(updated, 2, 65);
});

console.log(`${passed} tests passed.`);
