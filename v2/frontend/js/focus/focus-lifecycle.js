import { requireReference } from "../domain/logical-reference.js";
import { createTaskPlanningRecord } from "../domain/task-planning.js";
import {
  requireDuration, requireInstant, validateEvidence, validateReconciliation, getSessionActivity,
} from "./activity-evidence.js";

export { getSessionActivity } from "./activity-evidence.js";

export function createFocusState(ownershipScopeId) {
  requireReference(ownershipScopeId, "ownershipScopeId");
  return { ownershipScopeId, revision: 0, reservation: null,
    sessions: [], evidence: [], reconciliations: [], authorityChanges: [] };
}

function unique(items, name) {
  if (!Array.isArray(items)) throw new TypeError(`${name} must be an array.`);
  const ids = new Set();
  for (const item of items) {
    requireReference(item?.id, `${name} id`);
    if (ids.has(item.id)) throw new TypeError(`Duplicate ${name} identity.`);
    ids.add(item.id);
  }
  return ids;
}

/** Validate the detached local aggregate before an adapter may persist a transition. */
export function validateFocusState(state) {
  requireReference(state?.ownershipScopeId, "ownershipScopeId");
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new TypeError("Invalid focus revision.");
  const sessionIds = unique(state.sessions, "session");
  const evidenceIds = unique(state.evidence, "evidence");
  unique(state.reconciliations, "reconciliation");
  unique(state.authorityChanges, "authority change");
  for (const session of state.sessions) {
    for (const name of ["taskId", "plannedItemId"]) requireReference(session[name], name);
    if (session.ownershipScopeId !== state.ownershipScopeId) throw new TypeError("Session scope mismatch.");
    requireDuration(session.targetMs, "targetMs");
    if (session.targetMs === 0) throw new RangeError("Active focus target must be positive.");
    requireInstant(session.actualStart, "actualStart");
    const snapshot = session.startingSnapshot;
    for (const name of ["title", "planDayId", "timezone"]) requireReference(snapshot?.[name], name);
    if (!["primary", "extra"].includes(snapshot.classification)
        || snapshot.plannedItemId !== session.plannedItemId
        || !Number.isFinite(snapshot.activeMinutes)
        || snapshot.activeMinutes * 60000 !== session.targetMs
        || snapshot.plannedStart === undefined || snapshot.plannedStart === null) {
      throw new TypeError("Invalid frozen planning context.");
    }
    if (snapshot.parentTaskId != null) requireReference(snapshot.parentTaskId, "parentTaskId");
    if (session.ending !== null) {
      if (!["completed", "ended-early"].includes(session.ending?.outcome)) throw new TypeError("Invalid ending outcome.");
      requireInstant(session.ending.recordedAt, "ending recordedAt");
      const point = session.ending.point;
      if (!evidenceIds.has(point?.evidenceId)) throw new TypeError("Ending evidence is missing.");
      const evidence = state.evidence.find((item) => item.id === point.evidenceId);
      if (evidence.sessionId !== session.id || evidence.endAt === null) throw new TypeError("Invalid ending evidence.");
      requireInstant(point.observedAt, "ending observedAt");
      if (point.at !== null) requireInstant(point.at, "ending at");
      if (point.offsetMs !== null) requireDuration(point.offsetMs, "ending offsetMs");
    }
  }
  for (const evidence of state.evidence) {
    validateEvidence(evidence);
    if (!sessionIds.has(evidence.sessionId) || evidence.controlVersion > state.revision) {
      throw new TypeError("Evidence has invalid session/control references.");
    }
  }
  const reconciled = new Set();
  for (const decision of state.reconciliations) {
    if (!evidenceIds.has(decision.evidenceId) || reconciled.has(decision.evidenceId)) {
      throw new TypeError("Missing or already reconciled evidence.");
    }
    validateReconciliation(state.evidence.find((item) => item.id === decision.evidenceId), decision);
    if (!Number.isSafeInteger(decision.controlVersion) || decision.controlVersion < 1
        || decision.controlVersion > state.revision) throw new TypeError("Invalid decision control version.");
    reconciled.add(decision.evidenceId);
  }
  const open = state.evidence.filter((item) => item.endAt === null);
  const unfinished = state.sessions.filter((item) => item.ending === null);
  const reservation = state.reservation;
  if (reservation === null) {
    if (open.length || unfinished.length) throw new TypeError("Unfinished session has no reservation.");
  } else {
    requireReference(reservation.controllerId, "controllerId");
    if (!["running", "paused"].includes(reservation.state)
        || !Number.isSafeInteger(reservation.controlVersion) || reservation.controlVersion < 1
        || reservation.controlVersion > state.revision
        || unfinished.length !== 1 || unfinished[0].id !== reservation.sessionId
        || open.length !== 1 || open[0].id !== reservation.evidenceId
        || open[0].sessionId !== reservation.sessionId
        || open[0].kind !== (reservation.state === "running" ? "focus" : "pause")
        || open[0].originContextId !== reservation.controllerId
        || open[0].controlVersion !== reservation.controlVersion) {
      throw new TypeError("Invalid authoritative reservation/open evidence.");
    }
  }
  if (state.authorityChanges.length !== state.revision) throw new TypeError("Missing focus authority history.");
  for (const [index, change] of state.authorityChanges.entries()) {
    if (!sessionIds.has(change.sessionId) || !Number.isSafeInteger(change.version)
        || change.version !== index + 1
        || !["start", "record", "pause", "resume", "end", "transfer", "reconcile"].includes(change.type)) {
      throw new TypeError("Invalid authority change.");
    }
    requireReference(change.originContextId, "authority originContextId");
    requireInstant(change.at, "authority at");
  }
  for (const session of state.sessions) {
    const timeline = state.evidence.filter((item) => item.sessionId === session.id);
    if (timeline.length === 0 || timeline[0].startAt !== session.actualStart) throw new TypeError("Missing starting evidence.");
    for (let index = 1; index < timeline.length; index++) {
      if (timeline[index - 1].endAt === null || timeline[index].startAt !== timeline[index - 1].endAt) {
        throw new TypeError("Evidence boundaries must form one non-overlapping observed timeline.");
      }
    }
    const activity = getSessionActivity(state, session.id);
    if (!Number.isFinite(activity.confirmedActiveMs) || !Number.isFinite(activity.pauseMs)
        || !Number.isFinite(activity.interruptionMs) || !Number.isFinite(activity.uncertainMs)
        || !Number.isFinite(activity.uncreditedFocusMs)) throw new RangeError("Activity duration overflow.");
    if (session.ending === null && activity.remainingMs === 0) throw new TypeError("Completed session still reserved.");
    if (session.ending?.outcome === "completed" && activity.remainingMs !== 0) {
      throw new TypeError("Recorded completion has insufficient confirmed focus.");
    }
  }
  return state;
}

function addOpenEvidence(state, id, sessionId, kind, at, controllerId) {
  requireReference(id, "evidenceId");
  if (state.evidence.some((item) => item.id === id)) throw new TypeError("Evidence identity already used.");
  state.evidence.push({ id, sessionId, kind, startAt: at, endAt: null, elapsedMs: null,
    originContextId: controllerId, controlVersion: state.revision });
  state.reservation.evidenceId = id;
  state.reservation.controlVersion = state.revision;
}

function closeEvidence(state, observation, forceUncertain = false) {
  const evidence = state.evidence.find((item) => item.id === state.reservation.evidenceId);
  requireInstant(observation?.at);
  if (!["confirmed", "uncertain"].includes(observation.certainty)) throw new TypeError("Explicit continuity certainty is required.");
  if (observation.elapsedMs !== null) requireDuration(observation.elapsedMs);
  evidence.endAt = observation.at;
  evidence.elapsedMs = observation.elapsedMs;
  evidence.continuity = observation.certainty;
  if (observation.reason !== undefined) evidence.observedReason = observation.reason;
  if (evidence.kind === "focus" && (forceUncertain || observation.certainty === "uncertain")) {
    evidence.kind = "uncertain";
    evidence.reason = forceUncertain ? "explicit-control-recovery" : observation.reason;
  }
  validateEvidence(evidence);
  return evidence;
}

function endSession(state, session, at, evidence) {
  const activity = getSessionActivity(state, session.id);
  session.ending = { recordedAt: at, outcome: activity.completionPoint ? "completed" : "ended-early",
    point: activity.completionPoint ?? {
      evidenceId: evidence.id, decisionId: null, observedAt: at, at, offsetMs: evidence.elapsedMs,
    } };
  state.reservation = null;
}

function recordAuthority(state, command, sessionId, prior) {
  if (state.authorityChanges.some((item) => item.id === command.id)) throw new TypeError("Command identity already used.");
  state.authorityChanges.push({ id: command.id, sessionId, type: command.type,
    at: command.at, originContextId: command.contextId, version: state.revision,
    priorControlVersion: prior?.sessionId === sessionId ? prior.controlVersion : null,
    resultingControlVersion: state.reservation?.sessionId === sessionId
      ? state.reservation.controlVersion : null });
}

/**
 * Pure draft transition, not storage success or a cross-tab lock.
 * The adapter must load/check/write this aggregate in one serialized transaction.
 * No timers, input-idle inference, clock thresholds, persistence or DOM access.
 */
export function transitionFocus(input, command) {
  validateFocusState(input);
  if (command?.expectedRevision !== input.revision) throw new RangeError("Stale focus revision.");
  if (input.revision === Number.MAX_SAFE_INTEGER) throw new RangeError("Focus revision exhausted.");
  for (const name of ["id", "contextId", "type"]) requireReference(command[name], name);
  requireInstant(command.at);
  // Clone both state and intent: callers cannot mutate frozen context or observations later.
  const state = structuredClone(input);
  const intent = structuredClone(command);
  const prior = state.reservation ? { ...state.reservation } : null;
  state.revision++;

  if (intent.type === "start") {
    if (prior) throw new RangeError("A Running or Paused session already owns the reservation.");
    requireReference(intent.sessionId, "sessionId");
    if (state.sessions.some((item) => item.id === intent.sessionId)) throw new TypeError("Session identity already used.");
    const task = createTaskPlanningRecord(intent.task);
    if (task.ownershipScopeId !== state.ownershipScopeId) throw new TypeError("Task scope mismatch.");
    const item = task.sessionPlan.find((candidate) => candidate.id === intent.plannedItemId);
    if (!item) throw new RangeError("Choose a current planned focus item explicitly.");
    const targetMs = item.activeMinutes * 60000;
    requireDuration(targetMs, "active focus target");
    if (targetMs === 0) throw new RangeError("Active focus target must be positive.");
    requireReference(intent.timezone, "timezone");
    const startingSnapshot = {
      title: task.title, classification: task.classification, planDayId: task.planDayId,
      timezone: intent.timezone, plannedStart: structuredClone(task.plannedStart),
      plannedItemId: item.id, activeMinutes: item.activeMinutes,
    };
    if (task.parentTaskId != null) startingSnapshot.parentTaskId = task.parentTaskId;
    state.sessions.push({ id: intent.sessionId, ownershipScopeId: state.ownershipScopeId,
      taskId: task.id, plannedItemId: item.id, startingSnapshot,
      targetMs, actualStart: intent.at, ending: null });
    state.reservation = { sessionId: intent.sessionId, state: "running", controllerId: intent.contextId };
    addOpenEvidence(state, intent.evidenceId, intent.sessionId, "focus", intent.at, intent.contextId);
    recordAuthority(state, intent, intent.sessionId, prior);
    return validateFocusState(state);
  }

  if (intent.type === "reconcile") {
    const evidence = state.evidence.find((item) => item.id === intent.evidenceId);
    if (!evidence) throw new RangeError("Unknown evidence.");
    if (prior?.sessionId === evidence.sessionId && prior.controllerId !== intent.contextId) {
      throw new RangeError("Only the accepted controller may reconcile its reserved session.");
    }
    const decision = { id: intent.id, evidenceId: evidence.id, decidedAt: intent.at,
      originContextId: intent.contextId, controlVersion: state.revision,
      elapsedMs: intent.elapsedMs, parts: intent.parts };
    validateReconciliation(evidence, decision);
    if (state.reconciliations.some((item) => item.evidenceId === evidence.id)) {
      throw new RangeError("Evidence already reconciled; duplicate credit is rejected.");
    }
    state.reconciliations.push(decision);
    const session = state.sessions.find((item) => item.id === evidence.sessionId);
    if (session.ending === null && getSessionActivity(state, session.id).remainingMs === 0) {
      // Close the observed open boundary as uncertain, never silently lose the tail.
      closeEvidence(state, { at: intent.at, elapsedMs: null, certainty: "uncertain",
        reason: "completion-after-reconciliation" });
      endSession(state, session, intent.at, evidence);
    }
    recordAuthority(state, intent, session.id, prior);
    return validateFocusState(state);
  }

  if (!prior) throw new RangeError("No active reservation.");
  if (intent.type !== "transfer" && intent.contextId !== prior.controllerId) throw new RangeError("Stale or observing controller.");
  if (!["record", "pause", "resume", "end", "transfer"].includes(intent.type)) throw new TypeError("Unknown focus command.");
  if (intent.type === "pause" && prior.state !== "running") throw new RangeError("Session is already Paused.");
  if (intent.type === "resume" && prior.state !== "paused") throw new RangeError("Session is already Running.");
  if (intent.type === "transfer" && intent.confirmed !== true) throw new TypeError("Control transfer needs explicit confirmation.");
  if (intent.observation?.at !== intent.at) throw new TypeError("Observation must end at the command boundary.");
  const evidence = closeEvidence(state, intent.observation, intent.type === "transfer");
  const session = state.sessions.find((item) => item.id === prior.sessionId);
  if (intent.type === "end" || getSessionActivity(state, session.id).remainingMs === 0) {
    endSession(state, session, intent.at, evidence);
  } else {
    if (intent.type === "pause") state.reservation.state = "paused";
    if (intent.type === "resume") state.reservation.state = "running";
    if (intent.type === "transfer") state.reservation.controllerId = intent.contextId;
    addOpenEvidence(state, intent.evidenceId, session.id,
      state.reservation.state === "running" ? "focus" : "pause", intent.at, state.reservation.controllerId);
  }
  recordAuthority(state, intent, session.id, prior);
  return validateFocusState(state);
}
