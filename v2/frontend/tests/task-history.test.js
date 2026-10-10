import {
  createTaskPlanningRecord,
  updateTaskPlanningRecord,
  rescheduleTaskPlanningRecord,
  cancelTaskPlanningRecord,
  completeTaskPlanningRecord,
  getTaskPlanningTotals,
  getPlannedFocusItem,
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
function reject(input, run, errorType = TypeError) {
  const before = JSON.stringify(input);
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof errorType, `Expected ${errorType.name}`);
  assert(JSON.stringify(input) === before, "Rejected action changed input");
}
function task(fields = {}) {
  return createTaskPlanningRecord({
    id: "task-a", ownershipScopeId: "local-a", planDayId: "day-a",
    title: "Original title", classification: "extra", plannedStart: "original-start",
    sessionPlan: [{ id: "focus-a", activeMinutes: 25 }, { id: "focus-b", activeMinutes: 40 }],
    ...fields,
  });
}
const history = freeze([
  {
    id: "actual-a", taskId: "task-a", ownershipScopeId: "local-a", plannedItemId: "focus-a",
    startingSnapshot: {
      title: "Original title", classification: "extra", planDayId: "day-a",
      timezone: "Africa/Cairo", plannedStart: "original-start", plannedItemId: "focus-a",
      activeMinutes: 25, parentTaskId: "parent-a",
    },
    actualStart: "before-midnight", endedAt: "after-midnight", outcome: "completed",
  },
  {
    id: "actual-b", taskId: "task-a", ownershipScopeId: "local-a", plannedItemId: "focus-b",
    startingSnapshot: { planDayId: "day-a", timezone: "Africa/Cairo", activeMinutes: 40 },
    outcome: "ended-early",
  },
]);
const activity = freeze([
  { id: "evidence-a", sessionId: "actual-a", kind: "focus", minutes: 25 },
  { id: "evidence-b", sessionId: "actual-b", kind: "pause", minutes: 75 },
  { id: "evidence-c", sessionId: "actual-b", kind: "interruption", minutes: 8 },
  { id: "evidence-d", sessionId: "actual-b", kind: "uncertain", origin: "context-a" },
]);

test("ordinary edits preserve identity, full starting snapshots and separate activity", () => {
  const original = freeze(task({ history, parentTaskId: "parent-a", note: "Private note" }));
  const before = JSON.stringify({ history, activity });
  const updated = updateTaskPlanningRecord(original, {
    title: "New title", plannedStart: "later-start",
    sessionPlan: [{ id: "focus-b", activeMinutes: 50 }],
  });
  equal(updated, { ...original, title: "New title", plannedStart: "later-start",
    sessionPlan: [{ id: "focus-b", activeMinutes: 50 }],
    retiredFocusItems: [original.sessionPlan[0]] }, "Edit changed unrelated facts");
  assert(updated.history === history, "History was replaced");
  assert(JSON.stringify({ history, activity }) === before, "Historical evidence changed");
  assert(getPlannedFocusItem(updated, history[0].plannedItemId).id === "focus-a", "Link lost");
});

test("explicit rescheduling changes only current day/start and keeps prior attribution", () => {
  const original = freeze(task({ history }));
  const sibling = freeze(task({ id: "child-a", parentTaskId: "task-a" }));
  const otherScope = freeze(task({ ownershipScopeId: "account-b" }));
  const tasks = freeze([original, sibling, otherScope]);
  const moved = rescheduleTaskPlanningRecord(tasks, "local-a", "task-a", "day-b", "new-start");
  equal(moved[0], { ...original, planDayId: "day-b", plannedStart: "new-start" }, "Wrong move");
  assert(moved[0].history === history, "Move rewrote history");
  assert(history.every((session) => session.startingSnapshot.planDayId === "day-a"), "Reattributed history");
  assert(moved[1] === sibling && moved[2] === otherScope, "Move cascaded to other tasks");
  equal(tasks[0], original, "Move mutated source");
});

test("a full destination rejects a fourth Primary without demotion or history changes", () => {
  const tasks = freeze([task({ classification: "primary", history }),
    ...["b", "c", "d"].map((id) => task({ id, planDayId: "day-b", classification: "primary" }))]);
  reject(tasks, () => rescheduleTaskPlanningRecord(tasks, "local-a", "task-a", "day-b", "later"), RangeError);
  const extras = freeze([task({ history }), ...tasks.slice(1)]);
  const moved = rescheduleTaskPlanningRecord(extras, "local-a", "task-a", "day-b", "later");
  assert(moved[0].classification === "extra", "Move promoted an Extra");
});

test("Primary moves reuse scope/day limits and release source capacity", () => {
  const original = task({ classification: "primary" });
  const tasks = freeze([original,
    ...["source-b", "source-c"].map((id) => task({ id, classification: "primary" })),
    ...["b", "c"].map((id) => task({ id, planDayId: "day-b", classification: "primary" })),
    ...["x", "y", "z"].map((id) => task({ id, ownershipScopeId: "account-b",
      planDayId: "day-b", classification: "primary" })),
    task({ id: "source-extra" }),
  ]);
  const moved = rescheduleTaskPlanningRecord(tasks, "local-a", "task-a", "day-b", "later");
  const promoted = setTaskClassification(moved, "local-a", "source-extra", "primary");
  assert(promoted[0].classification === "primary", "Move changed classification");
  assert(promoted.at(-1).classification === "primary", "Source capacity unavailable");
  const sameDay = rescheduleTaskPlanningRecord(moved, "local-a", "task-a", "day-b", "even-later");
  assert(sameDay[0].plannedStart === "even-later", "Same-day explicit change rejected");
});

test("invalid reschedules reject atomically and enforce unambiguous scoped identity", () => {
  const tasks = freeze([task()]);
  for (const [scope, id, day, start] of [
    ["", "task-a", "day-b", "later"], ["local-a", null, "day-b", "later"],
    ["local-a", "task-a", " ", "later"],
    ...[undefined, null, " "].map((start) => ["local-a", "task-a", "day-b", start]),
  ]) {
    reject(tasks, () => rescheduleTaskPlanningRecord(tasks, scope, id, day, start));
  }
  for (const [scope, id] of [["account-b", "task-a"], ["local-a", "unknown"]]) {
    reject(tasks, () => rescheduleTaskPlanningRecord(tasks, scope, id, "day-b", "later"), RangeError);
  }
  reject(null, () => rescheduleTaskPlanningRecord(null, "local-a", "task-a", "day-b", "later"));
  const duplicates = freeze([task(), task({ planDayId: "day-c" })]);
  reject(duplicates, () => rescheduleTaskPlanningRecord(duplicates, "local-a", "task-a", "day-b", "later"));
  const invalid = freeze([task(), { id: "invalid" }]);
  reject(invalid, () => rescheduleTaskPlanningRecord(invalid, "local-a", "task-a", "day-b", "later"));
});

test("unfinished prior-day planning stays put through reads, edits and projections", () => {
  const original = freeze(task({ planDayId: "long-past-day", plannedStart: "long-past-start", history }));
  const read = createTaskPlanningRecord(original);
  getTaskPlanningTotals(read);
  getPlannedFocusItem(read, "focus-a");
  const edited = updateTaskPlanningRecord(read, { title: "Still unfinished" });
  assert(edited.planDayId === "long-past-day", "Unfinished task rolled forward");
  assert(edited.plannedStart === "long-past-start", "Past planning intent changed");
  assert(!Object.hasOwn(edited, "completedAt"), "Session outcome completed task");
  assert(!Object.hasOwn(edited, "cancelledAt"), "Past task cancelled automatically");
});

test("cancellation preserves task identity, retained plan links and all focus history", () => {
  const original = freeze(task({ history, activity, completedAt: null,
    sessionPlan: [{ id: "focus-b", activeMinutes: 40 }],
    retiredFocusItems: [{ id: "focus-a", activeMinutes: 25 }] }));
  const cancelled = cancelTaskPlanningRecord(original, "user-cancellation-time");
  equal(cancelled, { ...original, cancelledAt: "user-cancellation-time" }, "Cancellation deleted facts");
  assert(cancelled.history === history && cancelled.activity === activity, "Cancellation rewrote evidence");
  assert(getPlannedFocusItem(cancelled, "focus-a").id === "focus-a", "Cancelled history link lost");
  const edited = updateTaskPlanningRecord(cancelled, { title: "Later metadata" });
  assert(edited.cancelledAt === cancelled.cancelledAt, "Edit restored cancelled availability");
});

test("explicit completion works with no sessions and never alters sessions or relatives", () => {
  for (const sessions of [[], history, history.map((session) => ({ ...session, outcome: "completed" }))]) {
    const original = freeze(task({ history: sessions, activity, completedAt: null, parentTaskId: "parent-a" }));
    const sibling = freeze(task({ id: "child-a", parentTaskId: "task-a" }));
    const completed = completeTaskPlanningRecord(original, "user-completion-time");
    equal(completed, { ...original, completedAt: "user-completion-time" }, "Completion changed other facts");
    assert(completed.history === sessions && completed.activity === activity, "Completion ended sessions");
    assert(!Object.hasOwn(sibling, "completedAt"), "Completion cascaded");
  }
});

test("all planned sessions completed still leaves task open until explicit action", () => {
  const original = freeze(task({ history: history.map((session) => ({ ...session, outcome: "completed" })) }));
  const updated = updateTaskPlanningRecord(original, { title: "More work remains" });
  equal(getTaskPlanningTotals(updated), { sessionCount: 2, plannedFocusMinutes: 65 }, "Wrong totals");
  const moved = rescheduleTaskPlanningRecord([updated], "local-a", "task-a", "day-b", "later")[0];
  assert(!Object.hasOwn(moved, "completedAt"), "Completed sessions implicitly completed task");
  assert(completeTaskPlanningRecord(moved, "explicit-time").completedAt === "explicit-time", "Explicit completion absent");
});

test("decision facts survive later planning, classification and rescheduling", () => {
  const completed = completeTaskPlanningRecord(task({ history, activity }), "complete-time");
  const cancelled = cancelTaskPlanningRecord(completed, "cancel-time");
  const edited = updateTaskPlanningRecord(cancelled, { title: "New planning title" });
  const promoted = setTaskClassification([edited], "local-a", "task-a", "primary");
  const moved = rescheduleTaskPlanningRecord(promoted, "local-a", "task-a", "day-b", "later")[0];
  equal(moved, { ...cancelled, title: "New planning title", classification: "primary",
    planDayId: "day-b", plannedStart: "later" }, "Composition changed evidence or decisions");
  assert(moved.history === history && moved.activity === activity, "Composition rewrote history");
});

test("repeated decisions retain their original times and require explicit time input", () => {
  for (const [operation, field] of [[cancelTaskPlanningRecord, "cancelledAt"],
    [completeTaskPlanningRecord, "completedAt"]]) {
    const original = freeze(task());
    for (const time of [undefined, null, " "]) {
      reject(original, () => operation(original, time));
    }
    for (const time of ["caller-time", 0, freeze({ callerDefinedTime: "instant" })]) {
      const decided = freeze(operation(original, time));
      equal(operation(decided, "later-time"), decided, "Repeated action rewrote first decision");
      assert(decided[field] === time, "Decision time was interpreted");
    }
    reject(null, () => operation(null, "time"));
    const incomplete = freeze({ ...task(), title: null });
    reject(incomplete, () => operation(incomplete, "time"));
  }
});

test("generic edits cannot forge decisions, reschedule or rewrite evidence", () => {
  const original = freeze(task({ history, activity }));
  for (const changes of [{ completedAt: "time" }, { cancelledAt: "time" },
    { planDayId: "day-b" }, { history: [] }, { activity: [] }, { status: "completed" }]) {
    reject([original, changes], () => updateTaskPlanningRecord(original, changes));
  }
});

console.log(`${passed} tests passed.`);
