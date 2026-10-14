import { buildConnectOps, buildSessionOps, planDayIds } from "../js/connected/payload.js";

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
    console.exit(1);
  }
}

const DAY = "2026-10-14";

function task(id, overrides = {}) {
  return {
    id, ownershipScopeId: "local-scope", planDayId: DAY, title: `Task ${id}`,
    plannedStart: "09:00", classification: "extra",
    sessionPlan: [{ id: `item-${id}`, activeMinutes: 25 }],
    ...overrides,
  };
}

function endedSession(id, overrides = {}) {
  return {
    id, taskId: "t1", plannedItemId: "item-t1",
    startingSnapshot: { planDayId: DAY, timezone: "UTC" },
    targetMs: 1500000, actualStart: 1760000000000,
    ending: { recordedAt: 1760001500000, outcome: "completed", point: null },
    ...overrides,
  };
}

function endedFocusState(sessions, extras = {}) {
  return {
    revision: 3, ownershipScopeId: "local-scope", reservation: null,
    sessions, evidence: [], authorityChanges: [], reconciliations: [],
    ...extras,
  };
}

test("planDayIds collects distinct calendar days", () => {
  equal(planDayIds([task("a"), task("b", { planDayId: "2026-10-15" }), task("a")]),
    [DAY, "2026-10-15"]);
});

test("buildConnectOps orders plan days, tasks and ended sessions", () => {
  const focus = endedFocusState([endedSession("s1")], {
    evidence: [{ id: "e1", sessionId: "s1", kind: "focus", startAt: 1760000000000,
      endAt: 1760001500000, elapsedMs: 1500000, continuity: "confirmed",
      originContextId: "ctx", controlVersion: 1 }],
  });
  const ops = buildConnectOps({ tasks: [task("t1")], focusState: { ...focus, timezone: "UTC" } });
  equal(ops.map((op) => op.kind), ["plan_day", "task", "session"]);
  equal(ops[0].record, { id: DAY, timezone: "UTC" });
  equal(ops[1].baseRevision, 0);
  equal(ops[2].record.id, "s1");
  equal(ops[2].record.evidence.length, 1);
  equal(ops[2].record.reconciliations.length, 0);
});

test("buildConnectOps refuses an active local session", () => {
  const focus = endedFocusState([endedSession("s1")], {
    reservation: { sessionId: "s1", state: "running", controllerId: "ctx" },
  });
  let message = "";
  try {
    buildConnectOps({ tasks: [task("t1")], focusState: focus });
  } catch (error) {
    message = error.message;
  }
  assert(message.includes("End the local focus session"), "active session must block connect");
});

test("buildConnectOps refuses open (unended) sessions", () => {
  const focus = endedFocusState([endedSession("s1", { ending: null })]);
  let message = "";
  try {
    buildConnectOps({ tasks: [], focusState: focus });
  } catch (error) {
    message = error.message;
  }
  assert(message.includes("End the local focus session"), "open session must block connect");
});

test("buildSessionOps groups evidence, decisions and authority per session", () => {
  const focus = endedFocusState([endedSession("s1"), endedSession("s2")], {
    evidence: [
      { id: "e1", sessionId: "s1", kind: "focus", startAt: 0, endAt: 1, elapsedMs: 1,
        continuity: "confirmed", originContextId: "ctx", controlVersion: 1 },
      { id: "e2", sessionId: "s2", kind: "pause", startAt: 1, endAt: 2, elapsedMs: 1,
        continuity: "confirmed", originContextId: "ctx", controlVersion: 2 },
    ],
    reconciliations: [
      { id: "d1", evidenceId: "e2", decidedAt: 3, originContextId: "ctx",
        controlVersion: 3, elapsedMs: 1, parts: [{ kind: "pause", elapsedMs: 1 }] },
    ],
    authorityChanges: [
      { id: "a1", sessionId: "s1", type: "start", at: 0, originContextId: "ctx", version: 1 },
      { id: "a2", sessionId: "s2", type: "start", at: 1, originContextId: "ctx", version: 2 },
    ],
  });
  const ops = buildSessionOps(focus);
  equal(ops.length, 2);
  equal(ops[0].record.evidence.map((item) => item.id), ["e1"]);
  equal(ops[0].record.authorityChanges.map((item) => item.id), ["a1"]);
  equal(ops[1].record.evidence.map((item) => item.id), ["e2"]);
  equal(ops[1].record.reconciliations.map((item) => item.id), ["d1"]);
});

test("invalid inputs are rejected", () => {
  for (const [tasks, focus] of [[null, endedFocusState([])], [undefined, null], [[], "x"]]) {
    let rejected = false;
    try {
      buildConnectOps({ tasks, focusState: focus });
    } catch {
      rejected = true;
    }
    assert(rejected, "invalid input must be rejected");
  }
});

console.log(`${passed} tests passed.`);
