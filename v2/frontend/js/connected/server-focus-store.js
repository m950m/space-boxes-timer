/** Connected focus persistence: the server is the focus authority (ADR-006).
 *
 * Exposes the same loadFocus/commitFocus surface as the local planning store,
 * so the existing focus controller and projections work unchanged while the
 * account is connected. Commands post to the accepted-authority endpoint with
 * the client-generated intent identity the local engine already produces;
 * every accepted answer is followed by a change-feed refresh so the state the
 * UI renders is server-confirmed, never invented locally.
 *
 * Conflicts surface as errors (stale revision, stale controller); the caller
 * reloads and decides. A command whose delivery is unknown is never reported
 * as applied — the next refresh shows what the server accepted.
 */

import { createFocusMirror, firstPullSince } from "./focus-mirror.js";
import * as api from "./api.js";

// The server requires integer millisecond durations; the local clock supplies
// sub-millisecond float observations (performance.now()) and reconcile forms
// accept decimal seconds. Rounding is the transport adaptation, not new
// measurement semantics.
function integerDurations(intent) {
  const copy = { ...intent };
  if (copy.observation && Number.isFinite(copy.observation.elapsedMs)) {
    copy.observation = { ...copy.observation, elapsedMs: Math.round(copy.observation.elapsedMs) };
  }
  if (Number.isFinite(copy.elapsedMs)) copy.elapsedMs = Math.round(copy.elapsedMs);
  if (Array.isArray(copy.parts)) {
    copy.parts = copy.parts.map((part) => (Number.isFinite(part.elapsedMs)
      ? { ...part, elapsedMs: Math.round(part.elapsedMs) } : { ...part }));
  }
  return copy;
}

export function createServerFocusStore() {
  const mirror = createFocusMirror();

  async function refresh() {
    const feed = await api.syncPull(mirror.cursor ?? firstPullSince);
    mirror.applyFeed(feed);
    return mirror.snapshot();
  }

  return {
    /** Full account focus state: this device's and every other device's. */
    loadFocus: refresh,
    /** One authoritative command; the response is refreshed from the feed. */
    async commitFocus(intent) {
      await api.focusCommand(integerDurations(intent));
      return refresh();
    },
  };
}
