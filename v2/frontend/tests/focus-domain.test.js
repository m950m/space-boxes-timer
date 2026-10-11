import {
  createFocusState, transitionFocus, validateFocusState, getSessionActivity,
} from "../js/focus/focus-lifecycle.js";
import { updateTaskPlanningRecord, rescheduleTaskPlanningRecord } from "../js/domain/task-planning.js";

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
function test(name, run) { run(); passed++; console.log(`PASS focus: ${name}`); }
function rejects(state, run, message) {
  const before = JSON.stringify(state);
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof Error, `Expected rejection: ${message}`);
  equal(JSON.stringify(state), before, "Rejected transition mutated state");
}
function task(fields = {}) {
  return { id: "task-a", ownershipScopeId: "local-a", title: "Study", classification: "primary",
    planDayId: "day-original", plannedStart: { localTime: "23:58", timezone: "Africa/Cairo" },
    sessionPlan: [{ id: "item-a", activeMinutes: 1 }, { id: "item-b", activeMinutes: 2 }],
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
function activity(state, id = state.sessions[0].id) { return getSessionActivity(state, id); }

test("idle state and planning reads never start a session", () => {
  const state = freeze(createFocusState("local-a"));
  validateFocusState(state);
  equal(state.reservation, null); equal(state.sessions, []);
  rejects(state, () => send(state, "record"), "no automatic acquisition");
});

test("explicit early, on-time and late Start preserve planned versus actual start", () => {
  for (const at of [-60000, 0, 60000]) {
    const source = freeze(task());
    const state = start({ at, task: source });
    equal(state.sessions[0].actualStart, at);
    equal(state.sessions[0].startingSnapshot.plannedStart, source.plannedStart);
    equal(state.reservation.state, "running");
    equal(activity(state).confirmedActiveMs, 0);
    assert(!("completedAt" in source));
  }
});

test("Start freezes minimal context and stable task/item/session/scope identity", () => {
  const source = task({ parentTaskId: "parent-a" });
  const state = start({ task: source, sessionId: "actual-a" });
  source.plannedStart.localTime = "10:00"; source.sessionPlan[0].activeMinutes = 99;
  source.title = "Edited";
  equal(state.sessions[0], { id: "actual-a", ownershipScopeId: "local-a", taskId: "task-a",
    plannedItemId: "item-a", startingSnapshot: { title: "Study", classification: "primary",
      planDayId: "day-original", timezone: "Africa/Cairo",
      plannedStart: { localTime: "23:58", timezone: "Africa/Cairo" },
      plannedItemId: "item-a", activeMinutes: 1, parentTaskId: "parent-a" },
    targetMs: 60000, actualStart: 0, ending: null });
  assert(!("note" in state.sessions[0].startingSnapshot));
  assert(!("resources" in state.sessions[0].startingSnapshot));
});

test("Extra tasks and subtasks use the same lifecycle without changing classification", () => {
  const state = start({ task: task({ classification: "extra", parentTaskId: "parent-a" }) });
  equal(state.sessions[0].startingSnapshot.classification, "extra");
  equal(observe(state, "pause", 2000).reservation.state, "paused");
});

test("Running and Paused reserve exclusively against another task/tab", () => {
  const running = start();
  const paused = observe(running, "pause", 10000);
  for (const state of [running, paused]) {
    rejects(state, () => start({ contextId: "tab-b", task: task({ id: "task-b" }) }, state), "second start");
  }
});

test("confirmed checkpoints accumulate active time once and do not credit open display time", () => {
  let state = start();
  state = observe(state, "record", 5000);
  state = observe(state, "record", 7000);
  equal(activity(state).confirmedActiveMs, 12000);
  equal(activity(state).remainingMs, 48000);
  const before = JSON.stringify(state);
  for (let index = 0; index < 100; index++) activity(state);
  equal(JSON.stringify(state), before, "Display reads became authority");
});

test("Pause, long pause, Resume and End distinguish active, pause and wall duration", () => {
  let state = observe(start(), "pause", 10000);
  state = observe(state, "record", 75 * 60000);
  state = observe(state, "resume", 60000);
  state = observe(state, "end", 15000);
  equal(activity(state).confirmedActiveMs, 25000);
  equal(activity(state).pauseMs, 76 * 60000);
  equal(activity(state).interruptionMs, 0);
  equal(activity(state).effectiveOutcome, "ended-early");
  equal(state.reservation, null);
  equal(state.sessions[0].ending.recordedAt, 4585000);
});

test("End directly from Pause releases reservation and preserves actual early duration", () => {
  let state = observe(start(), "pause", 8000);
  state = observe(state, "end", 30000);
  equal(activity(state).confirmedActiveMs, 8000); equal(activity(state).pauseMs, 30000);
  equal(state.sessions[0].ending.outcome, "ended-early"); equal(state.reservation, null);
});

test("configured active duration completes exactly at its evidence-relative point", () => {
  let state = observe(start(), "record", 40000);
  state = observe(state, "record", 25000);
  equal(activity(state).confirmedActiveMs, 60000);
  equal(activity(state).uncreditedFocusMs, 5000);
  equal(state.sessions[0].ending.outcome, "completed"); equal(state.reservation, null);
  equal(state.sessions[0].ending.point.at, 60000);
  equal(state.sessions[0].ending.point.offsetMs, 20000);
  equal(state.sessions[0].ending.recordedAt, 65000);
});

test("Pause or End at the target reports completion instead of an early outcome", () => {
  for (const type of ["pause", "end"]) {
    const state = observe(start(), type, 60000);
    equal(state.sessions[0].ending.outcome, "completed"); equal(state.reservation, null);
  }
});

test("completion neither mutates task nor starts a second planned session", () => {
  const source = freeze(task());
  const state = observe(start({ task: source }), "record", 60000);
  equal(state.sessions.length, 1); equal(state.reservation, null);
  assert(!("completedAt" in source));
  const next = start({ plannedItemId: "item-b" }, state);
  equal(next.sessions.length, 2); equal(next.sessions[1].plannedItemId, "item-b");
  equal(next.sessions[1].targetMs, 120000);
  equal(activity(next, next.sessions[1].id).confirmedActiveMs, 0);
});

test("midnight, planning edits, retired items and timezone changes never rewrite history", () => {
  const source = freeze(task());
  const state = observe(start({ task: source, at: Date.parse("2026-10-11T20:59:55Z") }), "end", 10000);
  const edited = updateTaskPlanningRecord(source, { title: "New title",
    sessionPlan: [{ id: "item-b", activeMinutes: 9 }] });
  const moved = rescheduleTaskPlanningRecord([edited], "local-a", "task-a", "new-day", "new-start")[0];
  const next = start({ task: moved, plannedItemId: "item-b", timezone: "Europe/London" }, state);
  equal(next.sessions[0], state.sessions[0]);
  equal(next.sessions[0].startingSnapshot.planDayId, "day-original");
  equal(next.sessions[0].startingSnapshot.timezone, "Africa/Cairo");
  equal(next.sessions[0].plannedItemId, "item-a");
  equal(next.sessions[1].startingSnapshot.planDayId, "new-day");
});

test("uncertain continuity never silently counts or discards known elapsed time", () => {
  let state = observe(start(), "record", 10000);
  state = uncertain(state, 20000);
  equal(activity(state).confirmedActiveMs, 10000); equal(activity(state).uncertainMs, 20000);
  equal(activity(state).unresolvedEvidenceIds, [state.evidence[1].id]);
  equal(state.reservation.state, "running");
  equal(state.evidence[1].observedReason, "continuity-lost");
});

test("continued-work reconciliation counts once, retaining original uncertainty and provenance", () => {
  const initial = uncertain(start(), 20000);
  const evidence = initial.evidence[0];
  const state = reconcile(initial, evidence, [{ kind: "focus", elapsedMs: 20000 }]);
  equal(state.evidence[0], evidence);
  equal(activity(state).confirmedActiveMs, 20000); equal(activity(state).uncertainMs, 0);
  equal(state.reconciliations[0].originContextId, "tab-a");
  equal(state.reconciliations[0].evidenceId, evidence.id);
  rejects(state, () => reconcile(state, evidence, [{ kind: "focus", elapsedMs: 20000 }]), "duplicate credit");
});

test("interruption and partial work require explicit complete ordered classifications", () => {
  const initial = uncertain(start(), 30000);
  const evidence = initial.evidence[0];
  const state = reconcile(initial, evidence, [
    { kind: "focus", elapsedMs: 10000 },
    { kind: "interruption", elapsedMs: 15000, episodeId: "episode-a" },
    { kind: "focus", elapsedMs: 5000 },
  ]);
  equal(activity(state).confirmedActiveMs, 15000); equal(activity(state).interruptionMs, 15000);
  equal(activity(state).interruptionCount, 1); equal(activity(state).unresolvedEvidenceIds, []);
  const interrupted = reconcile(initial, evidence, [{ kind: "interruption", elapsedMs: 30000, episodeId: "episode-b" }]);
  equal(activity(interrupted).confirmedActiveMs, 0); equal(activity(interrupted).interruptionMs, 30000);
});

test("interruption fragments count explicit episode identities, not stored rows", () => {
  let state = uncertain(start(), 1000);
  state = uncertain(state, 2000);
  const [first, second] = state.evidence;
  state = reconcile(state, first, [{ kind: "interruption", elapsedMs: 1000, episodeId: "one-episode" }]);
  state = reconcile(state, second, [{ kind: "interruption", elapsedMs: 2000, episodeId: "one-episode" }]);
  equal(activity(state).interruptionMs, 3000); equal(activity(state).interruptionCount, 1);
});

test("uncertain clock reversal keeps observed boundaries and user-confirmed duration separate", () => {
  let state = uncertain(start({ at: 10000 }), null, { at: 5000 });
  const evidence = state.evidence[0];
  equal(activity(state).unknownUncertainIntervals, 1); equal(activity(state).confirmedActiveMs, 0);
  state = reconcile(state, evidence, [{ kind: "focus", elapsedMs: 10000 }], { elapsedMs: 10000, at: 6000 });
  equal(state.evidence[0].startAt, 10000); equal(state.evidence[0].endAt, 5000);
  equal(state.evidence[0].elapsedMs, null); equal(activity(state).confirmedActiveMs, 10000);
});

test("ambiguous completion preserves a relative ending point without inventing an instant", () => {
  let state = uncertain(start({ at: 10000 }), null, { at: 5000 });
  const evidence = state.evidence[0];
  state = reconcile(state, evidence, [{ kind: "focus", elapsedMs: 90000 }], { elapsedMs: 90000, at: 6000 });
  equal(activity(state).confirmedActiveMs, 60000); equal(activity(state).uncreditedFocusMs, 30000);
  equal(state.sessions[0].ending.point.at, null); equal(state.sessions[0].ending.point.offsetMs, 60000);
  equal(state.sessions[0].ending.recordedAt, 6000); equal(state.reservation, null);
  assert(activity(state).unresolvedEvidenceIds.length === 1, "Open recovery tail disappeared");
});

test("partial reconciliation completion uses ordered interruption/focus boundaries", () => {
  const initial = uncertain(start(), 100000);
  const state = reconcile(initial, initial.evidence[0], [
    { kind: "interruption", elapsedMs: 10000, episodeId: "first" },
    { kind: "focus", elapsedMs: 90000 },
  ]);
  equal(activity(state).confirmedActiveMs, 60000);
  equal(activity(state).completionPoint.at, 70000);
  equal(activity(state).interruptionMs, 10000);
});

test("reverse decision arrival preserves chronological credit and target cap", () => {
  let state = uncertain(start(), 40000);
  state = uncertain(state, 40000);
  const [first, second] = state.evidence;
  state = reconcile(state, second, [{ kind: "focus", elapsedMs: 40000 }]);
  state = reconcile(state, first, [{ kind: "focus", elapsedMs: 40000 }]);
  equal(activity(state).confirmedActiveMs, 60000); equal(activity(state).uncreditedFocusMs, 20000);
  equal(activity(state).completionPoint.evidenceId, second.id); equal(activity(state).completionPoint.at, 60000);
});

test("End preserves unresolved evidence, with traceable later correction of effective outcome", () => {
  let state = uncertain(start(), 70000);
  const evidence = state.evidence[0];
  state = observe(state, "end", 0);
  const originalEnding = structuredClone(state.sessions[0].ending);
  equal(originalEnding.outcome, "ended-early"); equal(state.reservation, null);
  equal(activity(state).uncertainMs, 70000);
  state = reconcile(state, evidence, [{ kind: "focus", elapsedMs: 70000 }], { at: 80000 });
  equal(state.sessions[0].ending, originalEnding);
  equal(activity(state).effectiveOutcome, "completed");
  equal(activity(state).confirmedActiveMs, 60000);
  assert(activity(state).completionPoint.decisionId !== null);
});

test("reconciling ended history leaves a later reserved session untouched", () => {
  let state = uncertain(start(), 70000);
  const evidence = state.evidence[0];
  state = observe(state, "end", 0);
  state = start({ at: 80000, plannedItemId: "item-b" }, state);
  const reservation = structuredClone(state.reservation);
  state = reconcile(state, evidence, [{ kind: "focus", elapsedMs: 70000 }], { at: 90000 });
  equal(state.reservation, reservation);
  equal(activity(state, reservation.sessionId).confirmedActiveMs, 0);
  equal(state.authorityChanges.at(-1).priorControlVersion, null);
  equal(state.authorityChanges.at(-1).resultingControlVersion, null);
});

test("explicit pause cannot be reconciled into focus, even with an uncertain clock", () => {
  let state = observe(start(), "pause", 5000);
  state = observe(state, "resume", null, { at: 1000,
    observation: { at: 1000, elapsedMs: null, certainty: "uncertain" } });
  equal(activity(state).unknownPauseIntervals, 1); equal(activity(state).confirmedActiveMs, 5000);
  rejects(state, () => reconcile(state, state.evidence[1], [{ kind: "focus", elapsedMs: 10000 }], { elapsedMs: 10000 }), "pause is authoritative");
});

test("unknown pause duration remains an obligation until explicitly confirmed as pause", () => {
  let state = observe(start(), "pause", 5000);
  state = observe(state, "resume", null, { at: 1000,
    observation: { at: 1000, elapsedMs: null, certainty: "uncertain" } });
  const evidence = state.evidence[1];
  equal(activity(state).unresolvedPauseEvidenceIds, [evidence.id]);
  state = reconcile(state, evidence, [{ kind: "pause", elapsedMs: 120000 }], { elapsedMs: 120000, at: 2000 });
  equal(state.evidence[1], evidence); equal(activity(state).confirmedActiveMs, 5000);
  equal(activity(state).pauseMs, 120000); equal(activity(state).unknownPauseIntervals, 0);
  equal(activity(state).unresolvedPauseEvidenceIds, []);
});

test("JSON rehydration preserves Running and Paused authority rather than acquiring anew", () => {
  const running = observe(start(), "record", 5000);
  const paused = observe(running, "pause", 5000);
  for (const initial of [running, paused]) {
    const recovered = JSON.parse(JSON.stringify(initial));
    validateFocusState(recovered); equal(recovered, initial);
    rejects(recovered, () => start({ contextId: "tab-b" }, recovered), "reload exclusivity");
    rejects(recovered, () => observe(recovered, "end", 1000, { contextId: "tab-b" }), "no implicit recovery takeover");
  }
});

test("confirmed explicit transfer preserves session and marks running recovery interval uncertain", () => {
  const before = observe(start(), "record", 5000);
  rejects(before, () => observe(before, "transfer", 1000, { contextId: "tab-b" }), "confirmation required");
  const state = observe(before, "transfer", 20000, { contextId: "tab-b", confirmed: true });
  equal(state.sessions, before.sessions);
  equal(state.reservation.controllerId, "tab-b"); equal(activity(state).confirmedActiveMs, 5000);
  equal(activity(state).uncertainMs, 20000);
  equal(state.evidence[1].originContextId, "tab-a"); equal(state.evidence[1].continuity, "confirmed");
  equal(state.evidence[1].reason, "explicit-control-recovery");
  rejects(state, () => observe(state, "end", 1000), "old controller invalidated");
  const ended = observe(state, "end", 1000, { contextId: "tab-b" });
  equal(activity(ended).confirmedActiveMs, 6000);
});

test("Paused transfer retains Pause and never counts recovery as focus", () => {
  const before = observe(start(), "pause", 10000);
  const state = observe(before, "transfer", 7200000, { contextId: "tab-b", confirmed: true });
  equal(state.reservation.state, "paused"); equal(activity(state).pauseMs, 7200000);
  equal(activity(state).confirmedActiveMs, 10000); equal(activity(state).uncertainMs, 0);
});

test("stale revision, non-controller, duplicate commands and ended transitions reject atomically", () => {
  const state = start();
  rejects(state, () => send(state, "pause", { expectedRevision: 0 }), "stale revision");
  rejects(state, () => observe(state, "pause", 1000, { contextId: "tab-b" }), "observer");
  rejects(state, () => observe(state, "pause", 1000, { id: state.authorityChanges[0].id }), "duplicate command");
  const ended = observe(state, "end", 1000);
  for (const type of ["pause", "resume", "end", "record", "transfer"]) {
    rejects(ended, () => send(ended, type), "ended reservation");
  }
});

test("invalid state transitions reject without mutating observations or history", () => {
  const running = start();
  const paused = observe(running, "pause", 1000);
  rejects(running, () => observe(running, "resume", 1000), "already running");
  rejects(paused, () => observe(paused, "pause", 1000), "already paused");
  rejects(running, () => observe(running, "dance", 1000), "unknown command");
});

test("Start validates scoped identity, selected item, target and required context", () => {
  const initial = createFocusState("local-a");
  for (const fields of [
    { task: task({ ownershipScopeId: "other-scope" }) }, { plannedItemId: "missing" }, { timezone: " " },
    { task: task({ classification: "fourth-box" }) }, { task: task({ title: " " }) },
    ...[0, -1, Infinity, NaN].map((activeMinutes) => ({ task: task({ sessionPlan: [{ id: "item-a", activeMinutes }] }) })),
  ]) rejects(initial, () => start(fields, initial), "invalid start");
  const ended = observe(start({ sessionId: "stable-id" }), "end", 1000);
  rejects(ended, () => start({ sessionId: "stable-id" }, ended), "identity reuse");
});

test("invalid observations cannot masquerade as confirmed focus", () => {
  const state = start({ at: 1000 });
  for (const observation of [
    { at: 2000, elapsedMs: null, certainty: "confirmed" },
    { at: 500, elapsedMs: 1000, certainty: "confirmed" },
    { at: 2000, elapsedMs: -1, certainty: "confirmed" },
    { at: 2000, elapsedMs: Infinity, certainty: "confirmed" },
    { at: 2000, elapsedMs: 1000 },
    { at: 2000, elapsedMs: 1000, certainty: "uncertain" },
  ]) rejects(state, () => send(state, "record", { at: observation.at, observation }), "invalid observation");
  rejects(state, () => send(state, "record", { at: 3000,
    observation: { at: 2000, elapsedMs: 1000, certainty: "confirmed" } }), "boundary mismatch");
});

test("invalid reconciliation cannot silently lose time or duplicate credit", () => {
  const state = uncertain(start(), 10000);
  const evidence = state.evidence[0];
  for (const parts of [[], [{ kind: "focus", elapsedMs: 9999 }],
    [{ kind: "focus", elapsedMs: 10001 }], [{ kind: "focus", elapsedMs: -1 }],
    [{ kind: "pause", elapsedMs: 10000 }], [{ kind: "interruption", elapsedMs: 10000 }],
  ]) rejects(state, () => reconcile(state, evidence, parts), "invalid partition");
  rejects(state, () => reconcile(state, evidence, [{ kind: "focus", elapsedMs: 10000 }], { elapsedMs: 20000 }), "duration overwrite");
  rejects(state, () => reconcile(state, evidence, [{ kind: "focus", elapsedMs: 10000 }], { contextId: "tab-b" }), "observer reconciliation");
  rejects(state, () => reconcile(state, state.evidence[1], [{ kind: "focus", elapsedMs: 0 }], { elapsedMs: 0 }), "open evidence");
});

test("fractional duration arithmetic permits only machine-rounding differences", () => {
  const state = uncertain(start(), 0.3);
  const resolved = reconcile(state, state.evidence[0], [
    { kind: "focus", elapsedMs: 0.1 }, { kind: "interruption", elapsedMs: 0.2, episodeId: "fractional" },
  ]);
  equal(activity(resolved).confirmedActiveMs, 0.1); equal(activity(resolved).interruptionMs, 0.2);
  const zero = uncertain(start(), 0);
  rejects(zero, () => reconcile(zero, zero.evidence[0], [{ kind: "focus", elapsedMs: Number.EPSILON }]), "zero elapsed cannot gain focus");
});

test("user-entered elapsed time cannot manufacture a reliable absolute completion instant", () => {
  let state = uncertain(start(), null, { at: 90000 });
  state = reconcile(state, state.evidence[0], [{ kind: "focus", elapsedMs: 90000 }], { elapsedMs: 90000 });
  equal(activity(state).confirmedActiveMs, 60000);
  equal(activity(state).completionPoint.offsetMs, 60000);
  equal(activity(state).completionPoint.at, null);
});

test("rehydration rejects orphan evidence, overlap, duplicate identities and missing reservation", () => {
  const initial = observe(start(), "record", 1000);
  for (const corrupt of [
    (state) => { state.evidence[0].sessionId = "missing"; },
    (state) => { state.evidence[1].startAt = 0; },
    (state) => { state.evidence.push(structuredClone(state.evidence[0])); },
    (state) => { state.reservation = null; },
    (state) => { state.reservation.controllerId = "another-context"; },
    (state) => { state.sessions[0].ownershipScopeId = "other-scope"; },
    (state) => { state.sessions[0].targetMs = Infinity; },
  ]) {
    const state = structuredClone(initial); corrupt(state);
    rejects(state, () => validateFocusState(state), "corrupt aggregate");
  }
});

test("evidence/session/decision references and caller data remain detached", () => {
  let state = uncertain(start(), 10000);
  const command = { id: "explicit-decision", type: "reconcile", expectedRevision: state.revision,
    contextId: "tab-a", at: 10000, evidenceId: state.evidence[0].id, elapsedMs: 10000,
    parts: [{ kind: "focus", elapsedMs: 10000 }] };
  state = transitionFocus(freeze(state), command);
  command.parts[0].elapsedMs = 99999;
  equal(state.reconciliations[0].parts[0].elapsedMs, 10000);
  equal(state.authorityChanges.at(-1).id, "explicit-decision");
});

test("rehydration rejects forged completion and missing accepted authority history", () => {
  const ended = observe(start(), "end", 1000);
  const forged = structuredClone(ended); forged.sessions[0].ending.outcome = "completed";
  rejects(forged, () => validateFocusState(forged), "completion without confirmed focus");
  const missing = structuredClone(ended); missing.authorityChanges.pop();
  rejects(missing, () => validateFocusState(missing), "missing accepted history");
});

test("bounded generated lifecycle traces match independent active/pause totals", () => {
  let seed = 29;
  for (let sample = 0; sample < 20; sample++) {
    let state = start({ task: task({ sessionPlan: [{ id: "item-a", activeMinutes: 100 }] }) });
    let expectedFocus = 0; let expectedPause = 0;
    for (let step = 0; step < 30; step++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const elapsedMs = seed % 20000;
      const running = state.reservation.state === "running";
      if (running) expectedFocus += elapsedMs; else expectedPause += elapsedMs;
      state = observe(state, seed % 3 === 0 ? "record" : running ? "pause" : "resume", elapsedMs);
      equal(activity(state).confirmedActiveMs, expectedFocus);
      equal(activity(state).pauseMs, expectedPause);
      equal(activity(state).interruptionMs, 0);
      validateFocusState(JSON.parse(JSON.stringify(state)));
    }
    const ended = observe(state, "end", 0);
    equal(activity(ended).confirmedActiveMs, expectedFocus); equal(ended.reservation, null);
  }
});

console.log(`${passed} focus domain tests passed.`);
