import {
  createFocusState, transitionFocus, validateFocusState,
} from "../js/focus/focus-lifecycle.js";
import { getDayActivityReport, getTaskActivityReport } from "../js/reports/activity-reports.js";

const MIN = 60000;
let passed = 0;
let serial = 0;
function assert(condition, message = "Assertion failed") { if (!condition) throw new Error(message); }
function equal(actual, expected, message = "Unexpected value") {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function test(name, run) { run(); passed++; console.log(`PASS reports: ${name}`); }
function rejects(run, message) {
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof Error, `Expected rejection: ${message}`);
}
function task(fields = {}) {
  return { id: "task-a", ownershipScopeId: "local-a", title: "Study", classification: "primary",
    planDayId: "day-original", plannedStart: { localTime: "23:58", timezone: "Africa/Cairo" },
    sessionPlan: [{ id: "item-a", activeMinutes: 20 }],
    note: "private", resources: [{ url: "https://example.com/" }], ...fields };
}
function send(state, type, fields = {}) {
  const id = ++serial;
  return transitionFocus(freeze(state), { id: `command-${id}`, expectedRevision: state.revision,
    contextId: "tab-a", at: 0, type, evidenceId: `evidence-${id}`, ...fields });
}
function start(fields = {}, state = createFocusState("local-a")) {
  return send(state, "start", { sessionId: `session-${serial + 1}`, task: task(),
    plannedItemId: "item-a", timezone: "Africa/Cairo", ...fields });
}
function observe(state, type, elapsedMs, fields = {}) {
  const open = state.evidence.find((item) => item.id === state.reservation.evidenceId);
  const at = fields.at ?? open.startAt + (elapsedMs ?? 0);
  return send(state, type, { at, observation: { at, elapsedMs, certainty: "confirmed" }, ...fields });
}
function uncertain(state, elapsedMs, fields = {}) {
  const open = state.evidence.find((item) => item.id === state.reservation.evidenceId);
  const at = fields.at ?? open.startAt + (elapsedMs ?? 0);
  return observe(state, "record", elapsedMs, { at,
    observation: { at, elapsedMs, certainty: "uncertain", reason: "continuity-lost" }, ...fields });
}
function reconcile(state, evidence, parts, fields = {}) {
  return send(state, "reconcile", { at: evidence.endAt, evidenceId: evidence.id,
    elapsedMs: evidence.elapsedMs, parts, ...fields });
}
function dayTotals(report) {
  const { tasks, planDayId, ...totals } = report;
  return totals;
}

test("AC-007: pause and reconciled interruption never dilute or inflate active focus", () => {
  let state = start();
  state = observe(state, "record", 10 * MIN);
  // The pause observation ends the running focus interval at its checkpoint: no extra focus credit.
  state = observe(state, "pause", 0);
  state = observe(state, "resume", 5 * MIN);
  state = uncertain(state, 3 * MIN);
  const lost = state.evidence.find((item) => item.kind === "uncertain");
  state = reconcile(state, lost, [{ kind: "interruption", elapsedMs: 3 * MIN, episodeId: "episode-a" }]);
  state = observe(state, "record", 10 * MIN);
  equal(state.sessions[0].ending.outcome, "completed");
  const report = getDayActivityReport(state, "day-original");
  equal(report.tasks.map((item) => item.taskId), ["task-a"]);
  equal(report.tasks[0].title, "Study");
  equal(dayTotals(report), { sessionCount: 1, completedSessions: 1, endedEarlySessions: 0,
    unfinishedSessions: 0, plannedFocusMs: 20 * MIN, activeFocusMs: 20 * MIN, uncreditedFocusMs: 0,
    pauseMs: 5 * MIN, unknownPauseIntervals: 0, interruptionCount: 1, interruptionMs: 3 * MIN,
    uncertainMs: 0, unresolvedEvidenceCount: 0 });
});

test("unresolved uncertain evidence stays out of focus totals and is reported separately", () => {
  let state = start();
  state = observe(state, "record", 2 * MIN);
  state = uncertain(state, 3 * MIN);
  state = observe(state, "end", MIN);
  const report = getDayActivityReport(state, "day-original");
  equal(dayTotals(report), { sessionCount: 1, completedSessions: 0, endedEarlySessions: 1,
    unfinishedSessions: 0, plannedFocusMs: 20 * MIN, activeFocusMs: 3 * MIN, uncreditedFocusMs: 0,
    pauseMs: 0, unknownPauseIntervals: 0, interruptionCount: 0, interruptionMs: 0,
    uncertainMs: 3 * MIN, unresolvedEvidenceCount: 1 });
});

test("unknown pause duration counts one interval without adding pause duration", () => {
  let state = start();
  state = observe(state, "pause", MIN);
  const open = state.evidence.find((item) => item.id === state.reservation.evidenceId);
  const at = open.startAt + 4 * MIN;
  state = send(state, "resume", { at, observation: { at, elapsedMs: null, certainty: "confirmed" } });
  state = observe(state, "end", 30_000);
  const report = getDayActivityReport(state, "day-original");
  equal(dayTotals(report), { sessionCount: 1, completedSessions: 0, endedEarlySessions: 1,
    unfinishedSessions: 0, plannedFocusMs: 20 * MIN, activeFocusMs: 90_000, uncreditedFocusMs: 0,
    pauseMs: 0, unknownPauseIntervals: 1, interruptionCount: 0, interruptionMs: 0,
    uncertainMs: 0, unresolvedEvidenceCount: 1 });
});

test("focus confirmed beyond the completed target is kept out of credited totals", () => {
  let state = start({ task: task({ sessionPlan: [{ id: "item-a", activeMinutes: 1 }] }) });
  state = uncertain(state, 90_000);
  const lost = state.evidence.find((item) => item.kind === "uncertain");
  state = reconcile(state, lost, [{ kind: "focus", elapsedMs: 90_000 }]);
  equal(state.sessions[0].ending.outcome, "completed");
  const report = getDayActivityReport(state, "day-original");
  equal(dayTotals(report), { sessionCount: 1, completedSessions: 1, endedEarlySessions: 0,
    unfinishedSessions: 0, plannedFocusMs: MIN, activeFocusMs: MIN, uncreditedFocusMs: 30_000,
    pauseMs: 0, unknownPauseIntervals: 0, interruptionCount: 0, interruptionMs: 0,
    uncertainMs: 0, unresolvedEvidenceCount: 1 });
});

test("task totals aggregate across Plan Days with per-day breakdowns", () => {
  let state = start();
  state = observe(state, "record", 10_000);
  state = observe(state, "end", 0);
  state = start({ task: task({ planDayId: "day-2", sessionPlan: [{ id: "item-a", activeMinutes: 1 }] }) }, state);
  state = observe(state, "record", MIN);
  equal(state.sessions.length, 2);
  const byTask = getTaskActivityReport(state, "task-a");
  equal(byTask.planDays, ["day-original", "day-2"]);
  const { planDays, ...taskTotals } = byTask;
  equal(taskTotals,
    { taskId: "task-a", sessionCount: 2, completedSessions: 1, endedEarlySessions: 1,
      unfinishedSessions: 0, plannedFocusMs: 21 * MIN, activeFocusMs: 70_000, uncreditedFocusMs: 0,
      pauseMs: 0, unknownPauseIntervals: 0, interruptionCount: 0, interruptionMs: 0,
      uncertainMs: 0, unresolvedEvidenceCount: 0 });
  equal(dayTotals(getDayActivityReport(state, "day-original")).activeFocusMs, 10_000);
  equal(dayTotals(getDayActivityReport(state, "day-2")), { sessionCount: 1, completedSessions: 1,
    endedEarlySessions: 0, unfinishedSessions: 0, plannedFocusMs: MIN, activeFocusMs: MIN,
    uncreditedFocusMs: 0, pauseMs: 0, unknownPauseIntervals: 0, interruptionCount: 0,
    interruptionMs: 0, uncertainMs: 0, unresolvedEvidenceCount: 0 });
});

test("unfinished reserved sessions are counted without an ending", () => {
  let state = start();
  state = observe(state, "record", 30_000);
  const report = getDayActivityReport(state, "day-original");
  equal(report.unfinishedSessions, 1);
  equal(report.completedSessions, 0);
  equal(report.endedEarlySessions, 0);
});

test("empty Plan Day reports zero totals with no tasks", () => {
  const state = start();
  const report = getDayActivityReport(state, "day-empty");
  equal(report.tasks, []);
  equal(report.sessionCount, 0);
  equal(report.activeFocusMs, 0);
});

test("reports are read-only projections and reject invalid input", () => {
  const state = start();
  const before = JSON.stringify(state);
  getDayActivityReport(state, "day-original");
  getTaskActivityReport(state, "task-a");
  equal(JSON.stringify(state), before, "Report derivation mutated focus state");
  rejects(() => getDayActivityReport(null, "day-original"), "null state");
  rejects(() => getDayActivityReport({ ownershipScopeId: "local-a" }, "day-original"), "missing arrays");
  rejects(() => getDayActivityReport(state, ""), "empty planDayId");
  rejects(() => getTaskActivityReport(state, ""), "empty taskId");
  validateFocusState(state);
});

console.log(`reports: ${passed} checks passed`);
