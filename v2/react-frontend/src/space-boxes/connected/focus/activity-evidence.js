import { requireReference } from "../domain/logical-reference.js";

export function requireDuration(value, name = "elapsedMs") {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be finite and non-negative.`);
}

export function requireInstant(value, name = "at") {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite observed instant.`);
}

/** Observations remain intact; decisions supply effective classifications separately. */
export function validateEvidence(evidence) {
  for (const name of ["id", "sessionId", "originContextId"]) requireReference(evidence[name], name);
  if (!["focus", "pause", "uncertain"].includes(evidence.kind)) throw new TypeError("Invalid evidence kind.");
  requireInstant(evidence.startAt, "startAt");
  if (!Number.isSafeInteger(evidence.controlVersion) || evidence.controlVersion < 1) {
    throw new TypeError("Invalid evidence control version.");
  }
  if (evidence.endAt === null) {
    if (evidence.elapsedMs !== null || evidence.kind === "uncertain") throw new TypeError("Invalid open evidence.");
    return;
  }
  requireInstant(evidence.endAt, "endAt");
  if (!["confirmed", "uncertain"].includes(evidence.continuity)) throw new TypeError("Invalid observed continuity.");
  if (evidence.elapsedMs !== null) requireDuration(evidence.elapsedMs);
  if (evidence.kind === "focus" && (evidence.elapsedMs === null || evidence.endAt < evidence.startAt
      || evidence.continuity !== "confirmed")) {
    throw new TypeError("Confirmed focus requires reliable duration and ordered boundaries.");
  }
  if (evidence.kind === "uncertain") requireReference(evidence.reason, "uncertainty reason");
}

export function validateReconciliation(evidence, decision) {
  const unknownPause = evidence.kind === "pause" && evidence.elapsedMs === null;
  if ((!unknownPause && evidence.kind !== "uncertain") || evidence.endAt === null) {
    throw new TypeError("Only closed uncertainty or unknown pause duration can be reconciled.");
  }
  for (const name of ["id", "evidenceId", "originContextId"]) requireReference(decision[name], name);
  if (decision.evidenceId !== evidence.id) throw new TypeError("Decision references different evidence.");
  requireInstant(decision.decidedAt, "decidedAt");
  requireDuration(decision.elapsedMs);
  if (evidence.elapsedMs !== null && evidence.elapsedMs !== decision.elapsedMs) {
    throw new RangeError("Reconciliation cannot replace reliable elapsed duration.");
  }
  if (!Array.isArray(decision.parts) || decision.parts.length === 0) throw new TypeError("Explicit interval parts are required.");
  let total = 0;
  for (const part of decision.parts) {
    if (!(unknownPause ? ["pause"] : ["focus", "interruption"]).includes(part.kind)) {
      throw new TypeError("Invalid reconciled classification; explicit pause is never focus.");
    }
    requireDuration(part.elapsedMs);
    if (part.kind === "interruption") requireReference(part.episodeId, "interruption episodeId");
    total += part.elapsedMs;
  }
  // Floating point addition tolerance, not a continuity or product threshold.
  const rounding = Number.EPSILON * Math.max(total, decision.elapsedMs) * decision.parts.length;
  if (!Number.isFinite(total) || Math.abs(total - decision.elapsedMs) > rounding) {
    throw new RangeError("Ordered parts must account for the entire uncertain interval.");
  }
}

/** Derive credit chronologically, never by decision arrival order or wall-clock sorting. */
export function getSessionActivity(state, sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) throw new RangeError("Unknown focus session.");
  let confirmedActiveMs = 0;
  let pauseMs = 0;
  let interruptionMs = 0;
  let uncreditedFocusMs = 0;
  let uncertainMs = 0;
  let unknownPauseIntervals = 0;
  let unknownUncertainIntervals = 0;
  let completionPoint = null;
  const unresolvedEvidenceIds = [];
  const unresolvedPauseEvidenceIds = [];
  const episodes = new Set();
  for (const evidence of state.evidence.filter((item) => item.sessionId === sessionId)) {
    if (evidence.endAt === null) continue;
    const decision = state.reconciliations.find((item) => item.evidenceId === evidence.id);
    if (evidence.kind === "pause") {
      const duration = decision?.elapsedMs ?? evidence.elapsedMs;
      if (duration === null) { unknownPauseIntervals++; unresolvedPauseEvidenceIds.push(evidence.id); }
      else pauseMs += duration;
      continue;
    }
    if (evidence.kind === "uncertain" && !decision) {
      unresolvedEvidenceIds.push(evidence.id);
      if (evidence.elapsedMs === null) unknownUncertainIntervals++;
      else uncertainMs += evidence.elapsedMs;
      continue;
    }
    const parts = decision?.parts ?? [{ kind: "focus", elapsedMs: evidence.elapsedMs }];
    const elapsedMs = decision?.elapsedMs ?? evidence.elapsedMs;
    let offsetMs = 0;
    for (const part of parts) {
      if (part.kind === "interruption") {
        interruptionMs += part.elapsedMs;
        if (part.elapsedMs > 0) episodes.add(part.episodeId);
      } else {
        const credit = Math.min(part.elapsedMs, session.targetMs - confirmedActiveMs);
        confirmedActiveMs += credit;
        uncreditedFocusMs += part.elapsedMs - credit;
        if (!completionPoint && confirmedActiveMs === session.targetMs) {
          const endingOffsetMs = offsetMs + credit;
          completionPoint = {
            evidenceId: evidence.id, decisionId: decision?.id ?? null,
            offsetMs: endingOffsetMs, observedAt: evidence.endAt,
            // Clock ambiguity has a known evidence-relative point, not a fabricated instant.
            at: evidence.elapsedMs !== null && evidence.endAt - evidence.startAt === elapsedMs
              ? evidence.startAt + endingOffsetMs : null,
          };
        }
      }
      offsetMs += part.elapsedMs;
    }
  }
  return {
    confirmedActiveMs, remainingMs: session.targetMs - confirmedActiveMs,
    pauseMs, unknownPauseIntervals, unresolvedPauseEvidenceIds,
    interruptionMs, interruptionCount: episodes.size,
    uncertainMs, unknownUncertainIntervals, unresolvedEvidenceIds, uncreditedFocusMs,
    completionPoint,
    // A later decision may correct effective outcome without overwriting the recorded ending.
    effectiveOutcome: completionPoint ? "completed" : session.ending?.outcome ?? null,
    endingPoint: completionPoint ?? session.ending?.point ?? null,
  };
}
