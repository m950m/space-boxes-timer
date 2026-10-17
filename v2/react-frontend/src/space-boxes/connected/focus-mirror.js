/** Pure assembly of the server's focus aggregate from sync change feeds.
 *
 * The connected account's focus history is a linear server-side authority
 * sequence (ADR-006), so pulled records replace or append by identity and
 * the mirror never rewrites versions locally. The assembled state has the
 * same shape the local focus engine produces, letting the existing focus
 * and report projections read server data unchanged.
 *
 * What the mirror deliberately does not do: write into the local IndexedDB
 * focus aggregate. Local records keep their own authority versions; mixing
 * histories would fabricate authority evidence.
 */

export function createFocusMirror() {
  const sessions = new Map();
  const evidence = new Map();
  const reconciliations = new Map();
  const authorityChanges = new Map();
  let reservation = null;
  let revision = 0;
  let ownershipScopeId = null;
  let cursor = null; // null until the first pull; sync feeds filter scope_revision > cursor.

  // Feed rows are JSON transport data, so a JSON round-trip detaches them in
  // every runtime (GJS has no structuredClone; the shape is plain JSON).
  const detach = (value) => JSON.parse(JSON.stringify(value));

  function mergeRows(map, incoming) {
    for (const row of incoming) map.set(row.id, detach(row));
  }

  /** Apply one sync pull feed; the same feed shape the task merge consumes. */
  function applyFeed(feed) {
    mergeRows(sessions, feed.sessions ?? []);
    mergeRows(evidence, feed.evidence ?? []);
    mergeRows(reconciliations, feed.decisions ?? []);
    mergeRows(authorityChanges, feed.authorityChanges ?? []);
    reservation = feed.reservation ?? null;
    revision = feed.focusRevision;
    ownershipScopeId = feed.ownershipScopeId ?? null;
    cursor = feed.scopeRevision;
  }

  /** The aggregate shape consumed by focus-view, reports and activity arithmetic. */
  function snapshot() {
    return detach({
      ownershipScopeId,
      revision,
      reservation,
      sessions: [...sessions.values()],
      evidence: [...evidence.values()],
      reconciliations: [...reconciliations.values()],
      authorityChanges: [...authorityChanges.values()]
        .sort((a, b) => a.version - b.version),
    });
  }

  return { applyFeed, snapshot, get cursor() { return cursor; } };
}

/** Since-cursor for the first pull: the change feed is scoped to the account. */
export const firstPullSince = 0;
