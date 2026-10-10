import {
  createTaskPlanningRecord,
  updateTaskPlanningRecord,
  getTaskPlanningTotals,
  getPlannedFocusItem,
  rescheduleTaskPlanningRecord,
  cancelTaskPlanningRecord,
  completeTaskPlanningRecord,
} from "../js/domain/task-planning.js";
import { setTaskClassification } from "../js/domain/task-classification.js";
import { splitTaskPlanningRecord } from "../js/domain/task-hierarchy.js";

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
function reject(input, run) {
  const before = JSON.stringify(input);
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof TypeError, "Expected TypeError");
  assert(JSON.stringify(input) === before, "Rejected action changed input");
}
function task(fields = {}) {
  return {
    id: "task-a", ownershipScopeId: "local-a", planDayId: "day-a",
    title: "Planned work", classification: "extra", plannedStart: "chosen-start",
    sessionPlan: [{ id: "focus-a", activeMinutes: 25 }],
    ...fields,
  };
}

test("notes and resources are independently optional without implicit defaults", () => {
  for (const fields of [{}, { note: "Remember examples" },
    { resources: [{ url: "https://example.com" }] }, { note: null, resources: [] }]) {
    const supplied = freeze(task(fields));
    const record = createTaskPlanningRecord(supplied);
    equal(record, supplied, "Creation inserted defaults or changed annotations");
    assert(Object.hasOwn(record, "note") === Object.hasOwn(supplied, "note"),
      "Absent note became a stored field");
    assert(Object.hasOwn(record, "resources") === Object.hasOwn(supplied, "resources"),
      "Absent resources became a stored collection");
    equal(getTaskPlanningTotals(record), { sessionCount: 1, plannedFocusMinutes: 25 },
      "Annotations affected planned focus");
  }
});

test("note edits preserve exact text and allow explicit clearing", () => {
  const original = freeze(createTaskPlanningRecord(task()));
  for (const note of ["  ملاحظات\nRead examples  ", "", " ", null, undefined]) {
    const added = updateTaskPlanningRecord(original, { note: "Initial note" });
    const edited = updateTaskPlanningRecord(added, { note });
    assert(Object.hasOwn(edited, "note") && edited.note === note, "Note text was replaced");
    equal(edited, { ...original, note }, "Note edit changed other fields");
  }
});

test("URLs and optional readable labels retain caller text", () => {
  const url = "HTTP://example.com/a%20b?q=1&q=2#section";
  for (const labelFields of [{}, { label: "  Reference — مرجع  " },
    { label: "" }, { label: " " }, { label: null }, { label: undefined }]) {
    const resource = { url, ...labelFields };
    const record = createTaskPlanningRecord(task({ resources: [resource] }));
    equal(record.resources, [resource], "URL or label text was normalized");
    assert(Object.hasOwn(record.resources[0], "label") === Object.hasOwn(resource, "label"),
      "Label default was introduced");
    assert(record.resources[0].label === resource.label, "Optional label changed");
  }
});

test("resource add, URL/label edit and remove use atomic planning updates", () => {
  const original = freeze(createTaskPlanningRecord(task({ note: "Keep this" })));
  const first = freeze({ url: "https://example.com/reference", label: "Reference" });
  const second = freeze({ url: "https://example.org/guide" });
  const added = freeze(updateTaskPlanningRecord(original, { resources: [first] }));
  const appended = freeze(updateTaskPlanningRecord(added, {
    resources: [...added.resources, second],
  }));
  const edited = freeze(updateTaskPlanningRecord(appended, {
    resources: [{ url: "https://example.net/new", label: "New reference" }, second],
  }));
  const unlabelled = freeze(updateTaskPlanningRecord(edited, {
    resources: [{ url: edited.resources[0].url }, second],
  }));
  const removed = freeze(updateTaskPlanningRecord(unlabelled, {
    resources: unlabelled.resources.slice(1),
  }));
  equal(added.resources, [first], "Add failed");
  equal(appended.resources, [first, second], "Append changed existing resources");
  equal(edited.resources, [{ url: "https://example.net/new", label: "New reference" }, second],
    "Resource edit failed");
  assert(!Object.hasOwn(unlabelled.resources[0], "label"), "Label removal failed");
  equal(removed, { ...original, resources: [second] }, "Remove changed other fields");
  equal(updateTaskPlanningRecord(removed, { resources: [] }),
    { ...original, resources: [] }, "Clearing resources changed other fields");
});

test("resource count is uncapped and duplicate URLs have no invented uniqueness rule", () => {
  const resources = Array.from({ length: 2000 }, (_, index) => ({
    url: "https://example.com/reference", label: `Reference ${index}`,
  }));
  const original = createTaskPlanningRecord(task({ resources }));
  const updated = updateTaskPlanningRecord(original, {
    resources: [...resources, { url: "https://example.org/another" }],
  });
  equal(original.resources, resources, "Creation capped or deduplicated resources");
  assert(updated.resources.length === 2001, "Update capped resources");
});

test("invalid note types reject on creation and update without partial changes", () => {
  const original = freeze(createTaskPlanningRecord(task({ note: "Original" })));
  for (const note of [0, false, {}, [], Symbol("note")]) {
    const supplied = freeze(task({ note }));
    reject(supplied, () => createTaskPlanningRecord(supplied));
    const changes = freeze({ title: "Should not change", note });
    reject([original, changes], () => updateTaskPlanningRecord(original, changes));
  }
});

test("invalid resource collections and entries reject atomically", () => {
  const original = freeze(createTaskPlanningRecord(task({
    resources: [{ url: "https://example.com", label: "Original" }],
  })));
  for (const resources of [undefined, null, {}, "https://example.com", 1,
    [null], [[]], ["https://example.com"], new Array(1), [{}],
    ...[undefined, null, "", " \n ", 12, {}, false].map((url) => [{ url }]),
    ...[12, {}, [], false].map((label) => [{ url: "https://example.com", label }]),
    [{ url: "https://example.com", file: { name: "upload.pdf" } }],
    [{ url: "https://example.com", [Symbol("upload")]: true }],
  ]) {
    const supplied = freeze(task({ resources }));
    reject(supplied, () => createTaskPlanningRecord(supplied));
    const changes = freeze({ note: "Should not change", resources });
    reject([original, changes], () => updateTaskPlanningRecord(original, changes));
  }
});

test("created and updated resource snapshots isolate both sides of caller mutations", () => {
  const supplied = task({ resources: [{ url: "https://example.com", label: "Original" }] });
  const record = createTaskPlanningRecord(supplied);
  supplied.resources[0].url = "https://caller.example.org";
  supplied.resources.push({ url: "https://another.example.org" });
  equal(record.resources, [{ url: "https://example.com", label: "Original" }],
    "Caller changed created resources");
  const changes = { resources: [{ url: "https://example.net", label: "Updated" }] };
  const updated = updateTaskPlanningRecord(record, changes);
  changes.resources[0].label = "Caller mutation";
  changes.resources.length = 0;
  equal(updated.resources, [{ url: "https://example.net", label: "Updated" }],
    "Caller changed updated resources");
  updated.resources[0].url = "https://result.example.org";
  equal(record.resources, [{ url: "https://example.com", label: "Original" }],
    "Updated result changed original resources");
  const titleEdit = updateTaskPlanningRecord(record, { title: "New title" });
  titleEdit.resources[0].label = "Result mutation";
  titleEdit.resources.push({ url: "https://extra.example.org" });
  equal(record.resources, [{ url: "https://example.com", label: "Original" }],
    "Unrelated planning edit shared resource records");
});

test("annotation edits preserve task identity, snapshots, decisions and separate evidence", () => {
  const history = freeze([
    { id: "actual-a", taskId: "task-a", plannedItemId: "retired-a",
      startingSnapshot: { title: "Old title", classification: "primary", planDayId: "prior-day",
        timezone: "Africa/Cairo", plannedStart: "prior-start", activeMinutes: 40 },
      outcome: "completed" },
    { id: "actual-b", taskId: "task-a", plannedItemId: "focus-a", outcome: "ended-early" },
  ]);
  const activity = freeze([
    { id: "focus-evidence", sessionId: "actual-a", kind: "focus", minutes: 40 },
    { id: "pause-evidence", sessionId: "actual-b", kind: "pause", minutes: 75 },
    { id: "interrupt-evidence", sessionId: "actual-b", kind: "interruption", minutes: 8 },
    { id: "uncertain-evidence", sessionId: "actual-b", kind: "uncertain", origin: "context-a" },
  ]);
  const before = JSON.stringify({ history, activity });
  for (const evidenceFields of [{ history, activity }, {}]) {
    const original = freeze(createTaskPlanningRecord(task({ ...evidenceFields,
      parentTaskId: "parent-a", completedAt: "complete-time", cancelledAt: "cancel-time",
      retiredFocusItems: [{ id: "retired-a", activeMinutes: 40 }], note: "Old note",
      resources: [{ url: "https://example.com/old", label: "Old label" }],
    })));
    let current = original;
    for (const changes of [{ note: "New note" },
      { resources: [...current.resources, { url: "https://example.org/new" }] },
      { resources: [{ url: "https://example.net/edited", label: "New label" }] },
      { note: null, resources: [] }]) {
      current = freeze(updateTaskPlanningRecord(current, changes));
      equal(current, { ...original, note: current.note, resources: current.resources },
        "Annotation edit changed non-annotation facts");
      assert(current.history === original.history && current.activity === original.activity,
        "Task-owned historical evidence was replaced");
      assert(JSON.stringify({ history, activity }) === before, "External evidence was rewritten");
      assert(getPlannedFocusItem(current, history[0].plannedItemId).id === "retired-a",
        "Retired historical association was lost");
    }
  }
});

test("annotation-only edits never start focus or complete an open task", () => {
  const original = freeze(createTaskPlanningRecord(task()));
  const edited = updateTaskPlanningRecord(original, {
    note: "Ready", resources: [{ url: "https://example.com", label: "Start here" }],
  });
  equal(edited, { ...original, note: "Ready",
    resources: [{ url: "https://example.com", label: "Start here" }] },
  "Annotations created lifecycle facts");
  equal(getTaskPlanningTotals(edited), getTaskPlanningTotals(original), "Focus totals changed");
});

test("annotations compose with classification, rescheduling and explicit decisions", () => {
  const original = freeze(createTaskPlanningRecord(task({
    note: "Keep", resources: [{ url: "https://example.com", label: "Reference" }],
  })));
  const promoted = setTaskClassification([original], "local-a", "task-a", "primary");
  const moved = rescheduleTaskPlanningRecord(promoted, "local-a", "task-a", "day-b", "later")[0];
  const completed = completeTaskPlanningRecord(moved, "complete-time");
  const cancelled = cancelTaskPlanningRecord(completed, "cancel-time");
  equal(cancelled, { ...original, classification: "primary", planDayId: "day-b",
    plannedStart: "later", completedAt: "complete-time", cancelledAt: "cancel-time" },
  "Composition changed annotations");
  assert(cancelled.resources !== moved.resources
    && cancelled.resources[0] !== moved.resources[0], "Decision shared resource containers");
});

test("split work accepts independent annotations without copying source history", () => {
  const source = freeze(createTaskPlanningRecord(task({ history: [{ id: "actual-a" }],
    note: "Source note", resources: [{ url: "https://example.com/source" }],
  })));
  const addition = freeze(task({ id: "task-b", parentTaskId: "task-a",
    note: "New note", resources: [{ url: "https://example.org/new", label: "New work" }],
  }));
  const tasks = freeze([source]);
  const split = splitTaskPlanningRecord(tasks, "local-a", "task-a", [addition]);
  assert(split[0] === source, "Split changed source task");
  equal(split[1], addition, "Split changed new annotations or copied history");
  assert(split[1].resources !== addition.resources
    && split[1].resources[0] !== addition.resources[0], "Split shared caller resource data");
  for (const fields of [{ note: {} }, { resources: [null] }]) {
    const invalid = freeze({ ...addition, ...fields });
    reject([tasks, invalid], () => splitTaskPlanningRecord(tasks, "local-a", "task-a", [invalid]));
  }
});

console.log(`${passed} tests passed.`);
