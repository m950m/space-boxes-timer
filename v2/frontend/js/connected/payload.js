/** Pure builders for the local-to-connected transition (data-model §5).
 *
 * No DOM, no fetch: this module is importable by GJS unit tests. It maps
 * local planning/focus records onto sync ops with client-generated identity
 * and provenance. The transition is non-destructive: it uploads, it never
 * mutates local records, and it refuses an active local session because the
 * connected execution behavior for connecting an active local session is
 * deferred (the server accepts no open evidence through sync).
 */

export function planDayIds(tasks) {
  const ids = new Set();
  for (const task of tasks) {
    if (typeof task.planDayId === "string" && task.planDayId.trim()) ids.add(task.planDayId);
  }
  return [...ids];
}

/** Sync ops for every ended session in a focus state (history upload). */
export function buildSessionOps(focusState) {
  if (focusState === undefined || focusState === null || typeof focusState !== "object") {
    throw new TypeError("focusState must be a record.");
  }
  const evidenceBySession = new Map();
  for (const item of focusState.evidence ?? []) {
    if (!evidenceBySession.has(item.sessionId)) evidenceBySession.set(item.sessionId, []);
    evidenceBySession.get(item.sessionId).push(item);
  }
  const decisionsByEvidence = new Map();
  for (const decision of focusState.reconciliations ?? []) {
    decisionsByEvidence.set(decision.evidenceId, decision);
  }
  const authorityBySession = new Map();
  for (const change of focusState.authorityChanges ?? []) {
    if (!authorityBySession.has(change.sessionId)) authorityBySession.set(change.sessionId, []);
    authorityBySession.get(change.sessionId).push(change);
  }
  const ops = [];
  for (const session of focusState.sessions ?? []) {
    if (!session.ending) {
      throw new RangeError(
        "End the local focus session before connecting; connecting an active session is not supported yet.",
      );
    }
    const sessionEvidence = evidenceBySession.get(session.id) ?? [];
    ops.push({
      kind: "session",
      record: {
        id: session.id,
        taskId: session.taskId,
        plannedItemId: session.plannedItemId,
        startingSnapshot: session.startingSnapshot,
        targetMs: session.targetMs,
        actualStart: session.actualStart,
        ending: session.ending,
        originScopeKey: session.originScopeKey,
        evidence: sessionEvidence.map((item) => ({ ...item })),
        authorityChanges: (authorityBySession.get(session.id) ?? []).map((item) => ({ ...item })),
        reconciliations: sessionEvidence
          .map((item) => decisionsByEvidence.get(item.id))
          .filter((decision) => decision !== undefined)
          .map((decision) => ({ ...decision })),
      },
    });
  }
  return ops;
}

/** The sync wire format keeps plannedStart as the planned clock string; the
 * local record's object form { time, timezone } flattens to its time. The
 * day-level timezone travels with the plan-day op, and pulled tasks carry the
 * string form the local reads already accept. */
export function wirePlannedStart(value) {
  if (value && typeof value === "object" && typeof value.time === "string") return value.time;
  return value;
}

/** Ordered, independent sync ops for one local scope. */
export function buildConnectOps({ tasks, focusState }) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array.");
  if (focusState === undefined || focusState === null || typeof focusState !== "object") {
    throw new TypeError("focusState must be a record.");
  }
  if (focusState.reservation) {
    throw new RangeError(
      "End the local focus session before connecting; connecting an active session is not supported yet.",
    );
  }
  const ops = [];
  for (const dayId of planDayIds(tasks)) {
    ops.push({ kind: "plan_day", record: { id: dayId, timezone: focusState.timezone } });
  }
  for (const task of tasks) {
    ops.push({ kind: "task", baseRevision: 0,
      record: { ...task, plannedStart: wirePlannedStart(task.plannedStart) } });
  }
  ops.push(...buildSessionOps(focusState));
  return ops;
}
