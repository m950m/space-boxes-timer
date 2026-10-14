import { createFocusMirror, firstPullSince } from "../js/connected/focus-mirror.js";

let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FAIL: ${name}: ${error.message}`);
    throw error;
  }
}

const session = (id, overrides = {}) => ({
  id, taskId: "t1", plannedItemId: "item-t1", recordRevision: 1, revision: 5,
  startingSnapshot: { title: `S ${id}`, planDayId: "2026-10-15", timezone: "UTC" },
  targetMs: 1500000, actualStart: 1760000000000, ...overrides,
});
const evidence = (id, sessionId, overrides = {}) => ({
  id, sessionId, kind: "focus", startAt: 1760000000000, endAt: null,
  elapsedMs: null, originContextId: "ctx", controlVersion: 1, ...overrides,
});
const feed = (overrides = {}) => ({
  scopeRevision: 5, focusRevision: 2, ownershipScopeId: "account-scope-1",
  planDays: [], tasks: [],
  sessions: [session("s1")], evidence: [evidence("e1", "s1")],
  decisions: [], authorityChanges: [], breaks: [], exposure: [],
  reservation: null, ...overrides,
});

test("first pull consumes the whole account feed and exposes the aggregate", () => {
  const mirror = createFocusMirror();
  assert(mirror.cursor === null, "no cursor before the first pull");
  mirror.applyFeed(feed());
  const state = mirror.snapshot();
  equal(state.ownershipScopeId, "account-scope-1", "the feed declares the account scope");
  equal(state.revision, 2, "revision is the accepted focus authority version");
  equal(state.sessions.map((row) => row.id), ["s1"]);
  equal(state.evidence.map((row) => row.id), ["e1"]);
  equal(state.reservation, null);
  equal(mirror.cursor, 5, "cursor tracks the feed scope revision");
});

test("delta feeds replace changed rows by identity and append new ones", () => {
  const mirror = createFocusMirror();
  mirror.applyFeed(feed());
  mirror.applyFeed(feed({
    scopeRevision: 7, focusRevision: 3,
    sessions: [session("s1", { recordRevision: 2, revision: 7, ending: { recordedAt: 1760001500000, outcome: "completed", point: null } }), session("s2")],
    evidence: [evidence("e1", "s1", { endAt: 1760001500000, elapsedMs: 1500000, continuity: "confirmed" }), evidence("e2", "s2")],
    authorityChanges: [{ id: "a1", sessionId: "s1", type: "end", at: 1760001500000, originContextId: "ctx", version: 3, priorControlVersion: 2, resultingControlVersion: null }],
    reservation: { sessionId: "s2", state: "running", controllerId: "ctx-b", controlVersion: 3, evidenceId: "e2" },
  }));
  const state = mirror.snapshot();
  equal(state.sessions.map((row) => `${row.id}:${row.recordRevision}`), ["s1:2", "s2:1"]);
  equal(state.evidence.map((row) => row.endAt), [1760001500000, null]);
  equal(state.reservation?.sessionId, "s2", "reservation reflects the live account state");
  equal(state.authorityChanges.map((row) => row.version), [3]);
});

test("authority changes order by version regardless of feed delivery order", () => {
  const mirror = createFocusMirror();
  mirror.applyFeed(feed({ authorityChanges: [
    { id: "a2", sessionId: "s1", type: "pause", at: 2, originContextId: "ctx", version: 2, priorControlVersion: 1, resultingControlVersion: 2 },
  ] }));
  mirror.applyFeed(feed({ scopeRevision: 6, focusRevision: 3, authorityChanges: [
    { id: "a1", sessionId: "s1", type: "start", at: 1, originContextId: "ctx", version: 1, priorControlVersion: null, resultingControlVersion: 1 },
  ] }));
  equal(mirror.snapshot().authorityChanges.map((row) => row.id), ["a1", "a2"],
    "late-arriving earlier versions sort before newer ones");
});

test("snapshot copies are detached from mirror state", () => {
  const mirror = createFocusMirror();
  mirror.applyFeed(feed());
  const first = mirror.snapshot();
  first.sessions[0].recordRevision = 99;
  equal(mirror.snapshot().sessions[0].recordRevision, 1,
    "mutating a snapshot cannot corrupt the mirror");
});

test("firstPullSince starts the change feed from zero", () => {
  equal(firstPullSince, 0);
});

console.log(`${passed} tests passed.`);
