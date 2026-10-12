import { requireReference } from "../domain/logical-reference.js";
import { requireInstant } from "./activity-evidence.js";

// Technical sampling resolution, not an idle/interruption policy. See IMPLEMENTATION.md.
export const SAMPLING = Object.freeze({ intervalMs: 1000, maxGapMs: 2500, clockToleranceMs: 250 });

/** Cooperating local controller. Storage owns authority; this clock only supplies observations. */
export function createBrowserFocus(store, {
  contextId = crypto.randomUUID(),
  clock = () => ({ at: Date.now(), monotonic: performance.now() }),
  onState = () => {}, onError = () => {},
} = {}) {
  requireReference(contextId, "contextId");
  let state;
  let boundary;
  let queue = Promise.resolve();
  let timer;
  let watching = false;
  const notify = (callback, value) => { try { callback(structuredClone(value)); } catch { /* presentation only */ } };
  function sample() {
    const value = clock();
    requireInstant(value.at);
    requireInstant(value.monotonic, "monotonic clock");
    return { ...value };
  }
  function observation(now) {
    if (!boundary || boundary.evidenceId !== state.reservation?.evidenceId) {
      return { at: now.at, elapsedMs: null, certainty: "uncertain", reason: "unobserved-recovery" };
    }
    const elapsed = now.monotonic - boundary.monotonic;
    const wall = now.at - boundary.at;
    const reliable = elapsed >= 0 && wall >= 0 && Math.abs(wall - elapsed) <= SAMPLING.clockToleranceMs;
    if (!reliable) return { at: now.at, elapsedMs: null, certainty: "uncertain", reason: "clock-discontinuity" };
    if (Math.max(elapsed, wall) > SAMPLING.maxGapMs) {
      return { at: now.at, elapsedMs: elapsed, certainty: "uncertain", reason: "sampling-gap" };
    }
    return { at: now.at, elapsedMs: elapsed, certainty: "confirmed" };
  }
  function accepted(next, now) {
    const previousEvidence = state?.reservation?.evidenceId;
    state = next;
    if (!state.reservation || state.reservation.controllerId !== contextId) boundary = undefined;
    else if (state.reservation.evidenceId !== previousEvidence) {
      boundary = { ...now, evidenceId: state.reservation.evidenceId };
    }
    notify(onState, state);
    return structuredClone(state);
  }
  function serial(run) {
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
  }
  function schedule() {
    clearTimeout(timer);
    if (!watching || !boundary || !state?.reservation || state.reservation.controllerId !== contextId) return;
    timer = setTimeout(async () => {
      try { await api.checkpoint(); schedule(); }
      catch (error) { watching = false; notify(onError, error); }
    }, SAMPLING.intervalMs);
  }
  function command(type, fields = {}) {
    // Detach before queuing so later caller mutations cannot change intent.
    const input = structuredClone(fields);
    return serial(async () => {
      if (!state) throw new DOMException("Load focus before acting.", "InvalidStateError");
      const now = sample();
      const intent = { ...input, type, id: crypto.randomUUID(), contextId,
        at: now.at, expectedRevision: state.revision };
      if (["record", "pause", "resume", "end", "transfer"].includes(type)) {
        intent.observation = observation(now);
      }
      if (["start", "record", "pause", "resume", "transfer"].includes(type)) intent.evidenceId = crypto.randomUUID();
      if (type === "start") intent.sessionId = crypto.randomUUID();
      const next = await store.commitFocus(intent);
      const result = accepted(next, now);
      schedule();
      return result;
    });
  }
  const api = {
    contextId,
    load: () => serial(async () => {
      const next = await store.loadFocus();
      // A reload/observer has no live sampling boundary and does not regain control.
      if (next.reservation?.evidenceId !== boundary?.evidenceId) boundary = undefined;
      state = next;
      notify(onState, state);
      schedule();
      return structuredClone(state);
    }),
    start: (input) => command("start", input),
    checkpoint: () => command("record"),
    pause: () => command("pause"),
    resume: () => command("resume"),
    end: () => command("end"),
    recover: ({ confirmed } = {}) => command("transfer", { confirmed }),
    reconcile: (input) => command("reconcile", input),
    watch: () => { watching = true; schedule(); },
    stop: () => { watching = false; clearTimeout(timer); },
  };
  return api;
}
