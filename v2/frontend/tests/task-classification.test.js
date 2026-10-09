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

function task(id, fields = {}) {
  return {
    id,
    ownershipScopeId: "local-a",
    planDayId: "day-a",
    classification: "extra",
    ...fields,
  };
}

function change(tasks, id, classification, scope = "local-a") {
  return setTaskClassification(tasks, scope, id, classification);
}

function rejectUnchanged(tasks, operation, errorType, messagePart) {
  const before = JSON.stringify(tasks);
  let error;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof errorType, `Expected ${errorType.name}`);
  assert(error.message.includes(messagePart), `Unexpected error: ${error.message}`);
  equal(tasks, JSON.parse(before), "Rejection changed input state");
}

test("zero through three Primary assignments are permitted", () => {
  let tasks = freeze([task("a"), task("b"), task("c")]);
  assert(tasks.every((item) => item.classification === "extra"), "Expected zero Primary");
  for (const [index, id] of ["a", "b", "c"].entries()) {
    tasks = freeze(change(tasks, id, "primary"));
    assert(tasks.filter((item) => item.classification === "primary").length === index + 1,
      "Wrong Primary count");
  }
});

test("a fourth promotion rejects without mutating unfrozen input", () => {
  const tasks = ["a", "b", "c"].map((id) => task(id, { classification: "primary" }));
  tasks.push(task("d", { history: [{ duration: 20 }] }));
  const target = tasks[3];
  const history = target.history;
  rejectUnchanged(tasks, () => change(tasks, "d", "primary"), RangeError, "three Primary");
  assert(tasks[3] === target && tasks[3].history === history, "Rejection replaced records");
});

test("Extra tasks have no count limit or Primary quota cost", () => {
  const tasks = freeze([
    ...["a", "b", "c"].map((id) => task(id, { classification: "primary" })),
    ...Array.from({ length: 1000 }, (_, index) => task(`extra-${index}`)),
  ]);
  const result = change(tasks, "extra-999", "extra");
  assert(result.length === 1003, "Extra tasks were dropped");
  assert(result.filter((item) => item.classification === "primary").length === 3,
    "Extra classification consumed capacity");
});

test("demotion releases capacity for a different task", () => {
  const tasks = freeze([
    ...["a", "b", "c"].map((id) => task(id, { classification: "primary" })),
    task("d"),
  ]);
  const demoted = freeze(change(tasks, "a", "extra"));
  const result = change(demoted, "d", "primary");
  equal(result.map((item) => item.classification), ["extra", "primary", "primary", "primary"],
    "Demotion did not release capacity");
  assert(tasks[0].classification === "primary", "Original classification was changed");
});

test("another Plan Day has independent capacity", () => {
  const tasks = freeze([
    ...["a", "b", "c"].map((id) => task(id, { classification: "primary" })),
    task("next-day", { planDayId: "day-b" }),
  ]);
  const result = change(tasks, "next-day", "primary");
  assert(result[3].classification === "primary", "Other day's quota blocked promotion");
  assert(result.slice(0, 3).every((item, index) => item === tasks[index]),
    "Other day's assignments changed");
});

test("ownership scope isolates quota and target identity", () => {
  const tasks = freeze([
    ...["a", "b", "c"].map((id) => task(id, { classification: "primary" })),
    task("a", { ownershipScopeId: "account-b" }),
  ]);
  const result = change(tasks, "a", "primary", "account-b");
  assert(result[3].classification === "primary", "Other scope blocked promotion");
  assert(result[0] === tasks[0], "Same task ID in another scope was changed");
});

test("repeated promotion at capacity does not count the task twice", () => {
  const tasks = freeze(["a", "b", "c"].map((id) => task(id, { classification: "primary" })));
  equal(change(tasks, "b", "primary"), tasks, "Repeated promotion changed the plan");
});

test("classification preserves identity, history and all unrelated fields", () => {
  const original = task("a", {
    title: "Existing work",
    parentTaskId: "parent",
    status: "open",
    actualStart: null,
    completedAt: null,
    sessionPlan: [{ id: "planned-a", activeMinutes: 25 }],
    history: [{
      id: "session-a",
      startingSnapshot: { classification: "extra", planDayId: "old-day" },
      activity: [{ kind: "pause", minutes: 75 }],
      outcome: "ended-early",
    }],
  });
  const tasks = freeze([original, task("b")]);
  const promoted = freeze(change(tasks, "a", "primary"));
  equal(promoted[0], { ...original, classification: "primary" }, "Unrelated fields changed");
  assert(promoted[0].id === original.id, "Task identity changed");
  assert(promoted[0].history === original.history, "History was rewritten");
  assert(promoted[0].sessionPlan === original.sessionPlan, "Session plan was rewritten");
  assert(promoted[1] === tasks[1], "Unrelated task was replaced");
  const demoted = change(promoted, "a", "extra");
  equal(demoted, tasks, "Promotion/demotion changed evidence or task/session lifecycle");
  assert(demoted[0].history === original.history, "Demotion rewrote history");
});

test("unknown or wrong-scope targets reject unchanged", () => {
  const tasks = [task("a")];
  rejectUnchanged(tasks, () => change(tasks, "missing", "primary"), RangeError, "not found");
  rejectUnchanged(tasks, () => change(tasks, "a", "primary", "account-b"), RangeError, "not found");
});

test("invalid requested classification rejects unchanged", () => {
  const tasks = [task("a")];
  for (const classification of ["Primary", "completed", "", null, undefined]) {
    rejectUnchanged(tasks, () => change(tasks, "a", classification), TypeError, "classification");
  }
});

test("malformed records and ambiguous task identity reject unchanged", () => {
  for (const invalid of [
    null,
    { ...task("a"), id: "" },
    { ...task("a"), ownershipScopeId: null },
    { ...task("a"), planDayId: " " },
    { ...task("a"), classification: "completed" },
  ]) {
    const tasks = [task("target"), invalid];
    rejectUnchanged(tasks, () => change(tasks, "target", "primary"), TypeError, "");
  }
  const duplicates = [task("a"), task("a", { planDayId: "day-b" })];
  rejectUnchanged(duplicates, () => change(duplicates, "a", "primary"), TypeError, "unambiguous");
});

test("invalid collection and target references reject unchanged", () => {
  rejectUnchanged({}, () => change({}, "a", "primary"), TypeError, "array");
  const tasks = [task("a")];
  rejectUnchanged(tasks, () => change(tasks, "", "primary"), TypeError, "taskId");
  rejectUnchanged(tasks, () => change(tasks, "a", "primary", ""), TypeError, "ownershipScopeId");
});

console.log(`${passed} tests passed.`);
