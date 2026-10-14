import { getSessionActivity } from "../focus/activity-evidence.js";
import { requireReference } from "../domain/logical-reference.js";

/** Replaceable derived projection: totals derive from evidence, never persist their own facts. */
function requireFocusState(state) {
  requireReference(state?.ownershipScopeId, "ownershipScopeId");
  for (const name of ["sessions", "evidence", "reconciliations"]) {
    if (!Array.isArray(state[name])) throw new TypeError(`Focus state ${name} must be an array.`);
  }
}

function emptyTotals() {
  return { sessionCount: 0, completedSessions: 0, endedEarlySessions: 0, unfinishedSessions: 0,
    plannedFocusMs: 0, activeFocusMs: 0, uncreditedFocusMs: 0,
    pauseMs: 0, unknownPauseIntervals: 0,
    interruptionCount: 0, interruptionMs: 0,
    uncertainMs: 0, unresolvedEvidenceCount: 0 };
}

/** Wall-clock spans never enter these sums; only confirmed/reconciled evidence classifications do. */
function accumulate(totals, state, session) {
  const activity = getSessionActivity(state, session.id);
  totals.sessionCount++;
  if (activity.effectiveOutcome === "completed") totals.completedSessions++;
  else if (activity.effectiveOutcome === "ended-early") totals.endedEarlySessions++;
  else totals.unfinishedSessions++;
  totals.plannedFocusMs += session.targetMs;
  totals.activeFocusMs += activity.confirmedActiveMs;
  totals.uncreditedFocusMs += activity.uncreditedFocusMs;
  totals.pauseMs += activity.pauseMs;
  totals.unknownPauseIntervals += activity.unknownPauseIntervals;
  totals.interruptionCount += activity.interruptionCount;
  totals.interruptionMs += activity.interruptionMs;
  totals.uncertainMs += activity.uncertainMs;
  totals.unresolvedEvidenceCount += activity.unresolvedEvidenceIds.length + activity.unresolvedPauseEvidenceIds.length;
  return totals;
}

/**
 * Daily factual summary grouped by frozen session Plan Day (OD-017): a session stays
 * with the Plan Day it was planned under even when work crosses midnight.
 */
export function getDayActivityReport(state, planDayId) {
  requireFocusState(state);
  requireReference(planDayId, "planDayId");
  const sessions = state.sessions.filter((item) => item.startingSnapshot.planDayId === planDayId);
  const report = { planDayId, ...emptyTotals(), tasks: [] };
  const grouped = new Map();
  for (const session of sessions) {
    accumulate(report, state, session);
    if (!grouped.has(session.taskId)) grouped.set(session.taskId, emptyTotals());
    accumulate(grouped.get(session.taskId), state, session);
  }
  for (const [taskId, totals] of grouped) {
    // Titles are frozen per start; the latest start shows the most recent known wording.
    const latest = sessions.filter((item) => item.taskId === taskId).at(-1);
    report.tasks.push({ taskId, title: latest.startingSnapshot.title, ...totals });
  }
  return report;
}

/** Task focus totals across Plan Days, keyed by the stable task identity sessions started from. */
export function getTaskActivityReport(state, taskId) {
  requireFocusState(state);
  requireReference(taskId, "taskId");
  const sessions = state.sessions.filter((item) => item.taskId === taskId);
  const report = { taskId, ...emptyTotals(), planDays: [] };
  const days = new Set();
  for (const session of sessions) {
    accumulate(report, state, session);
    days.add(session.startingSnapshot.planDayId);
  }
  report.planDays = [...days];
  return report;
}
