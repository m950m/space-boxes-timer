# WS-A / V2-012 implementation checkpoint

Recorded 2026-10-11 (Africa/Cairo). Status: **proposal; runtime implementation
blocked on owner decisions**. This document does not approve new product policy
or shared-file ownership.

Workstream: [#29](https://github.com/m950m/space-boxes-timer/issues/29).
Acceptance task: [#28](https://github.com/m950m/space-boxes-timer/issues/28).
Delivery index: [#11](https://github.com/m950m/space-boxes-timer/issues/11).
Supersedes the checkout blocker in the
[previous handoff](https://github.com/m950m/space-boxes-timer/issues/29#issuecomment-6112617412).

## Verified starting state and authority

- Checkout: `/home/mnabil/Learning/projects/Space_boxes_Codex_Focus`.
- Branch: `feature/ws-a-focus`; expected origin: `m950m/space-boxes-timer`.
- Starting local and verified GitHub head:
  `5d1848e179a49825a24fc9c11c5aa8c40185dd9a`; clean working tree.
- #29 permits owned-file implementation, tests, bounded repairs, checkpoint
  commits, pushes to this branch and checkpoint comments on #29.
- Focus-specific modules and tests are the authorized implementation boundary.
  Shared-file edits, other workstream files, PR creation, merge, release and
  branch cleanup remain outside that authorization.
- Only this Focus checkout was accessed. No runtime code or shared files changed.
  The published #29 comment will identify this document's verified commit SHA.

## Proposed implementation after policy approval

1. Pure lifecycle/evidence helpers under this directory. Separate actual session
   identity and its minimal frozen planning snapshot from running/paused
   reservation authority and historical activity evidence. Preserve session,
   task, item, scope, original Plan Day and timezone identities across midnight
   and later planning changes. Derive confirmed focus from evidence; keep pause,
   interruption, uncertainty and outcomes separate.
2. A focus-specific IndexedDB adapter using the existing V2 local scope and
   database. Serialize each reservation read/check/write and its session,
   evidence and authority-change writes in one readwrite transaction. Validate
   persisted planning identity when starting; reject stale control versions and
   stale planning selections. Resolve success only after transaction completion.
   Broadcasts refresh views and never confer authority or add focus evidence.
3. A focus-specific controller/view. Start, Pause, Resume and End require explicit
   actions. Only confirmed focus reaching the frozen target ends the session;
   neither task completion nor the next session starts automatically. Running
   and Paused both retain reservation. Observing tabs cannot independently start
   work or infer takeover from input activity. Show storage failure, pending
   recovery and original Plan Day attribution with labeled keyboard controls.
4. Add focus-specific browser fixtures/tests without changing shared runners.
   Integrate with the existing planner only after explicit shared-file ownership
   approval and a serial handoff. Review the actual diff before each milestone.

## Material decision request: recovery and reconciliation

[#28](https://github.com/m950m/space-boxes-timer/issues/28) requires stopping when
the exact recovery policy is unspecified. [OD-019](../../../../_docs/product/owner-decisions.md#od-019--idle-interruption-and-recovery)
leaves continuity thresholds, known-point determination and interruption
boundaries open. The [data model](../../../../_docs/data/v2-data-model.md#activity-evidence-and-reconciliation)
also leaves reconciliation arithmetic unspecified. These choices determine
recorded focus and session ending, so they require owner approval before code.

Proposed bounded policy for owner review (all values and interactions below are
**unapproved**):

- Request a durable running checkpoint every second. A checkpoint gap greater
  than five seconds, a wall/monotonic elapsed-time difference greater than one
  second, or a new document recovering a Running reservation marks the interval
  since the last committed trustworthy boundary uncertain. Do not infer loss of
  focus from missing keyboard/mouse input. Browser throttling may cause a
  conservative recovery prompt; these thresholds are not attention measures.
- Preserve that interval, retain exclusive reservation, and stop automatic focus
  credit until reconciliation. Offer explicit confirmation of continued work,
  explicit interruption, or a partial-work duration. Leaving it unresolved keeps
  the evidence and obligation; it never silently counts or discards time.
- Keep original observations and append the user's decision with provenance.
  Count each explicitly reconciled interruption episode once, rather than each
  storage fragment. Never convert an explicit pause into active focus.
- Credit confirmed work only up to the remaining configured active duration.
  Preserve any remaining uncertain evidence separately; never count it toward
  another session. Where clock changes prevent a trustworthy elapsed duration,
  ask for the elapsed/active durations and retain the uncertain original clock
  boundaries rather than inventing an exact ending instant.
- Recover a Paused reservation as Paused with no focus credit. A recovered or
  different controlling context must explicitly confirm control transfer;
  record the transfer and invalidate the old control version. Do not create a
  second session or release reservation on tab disappearance.

Owner may approve this bounded policy or supply replacement rules. Approval must
be recorded on #29 (or a linked authoritative decision); this proposal alone is
not an accepted implementation specification.

## Shared-file request and integration order

`../persistence/planning-store.js` opens database version 1 and validates an exact
three-store schema. Adding focus stores independently would make the current
planner reject the schema or fail its versioned open. A second disconnected
focus database would not provide the proposed atomic planning/authority boundary.

Request an explicit serial ownership window for WS-A to modify
`v2/frontend/js/persistence/planning-store.js`: a compatible V2 database upgrade,
shared open/schema handling and planning/focus transaction access. Preserve the
existing planning API, records and visible error behavior. No migration deletes
planning or V1 data. Coordinate any WS-B dependency before assigning the window.

After the engine checkpoint and WS-B's UI handoff, request exclusive WS-A access
to `v2/frontend/js/app.js` and `v2/frontend/index.html` for bounded focus mounting.
Prefer a new focus-specific stylesheet; no ownership of `planner.css`, existing
browser runners, Django routes/tests or README is requested. No shared file has
an approved WS-A writer yet; requests here do not transfer ownership.

## Validation and exact resume action

Executed at the starting SHA: repository/branch/status/origin preflight and live
GitHub comparison confirming that the checkpoint equals the remote branch.
This checkpoint is documentation only. Reviewed the complete new-file diff
against #28 and approved policy/ownership; checked local link targets and their
section anchors. Check staged whitespace and scope before commit. No runtime
tests have run and no #28 acceptance criterion is claimed implemented or
QA-passing. An optional inline Python link checker was blocked by lean-ctx;
manual link review and shell file-existence checks supplied the document check.

Required after implementation: real-Chrome Start/Pause/Resume/End, active versus
paused accounting, active-duration completion, reload/browser restart, two-tab
races/exclusivity, stale transitions, transaction/storage failures, uncertain
recovery/reconciliation, explicit control recovery, no auto-start/task completion,
V1 isolation, frozen planning identity and midnight attribution. Run relevant
existing planning/persistence regressions after approved integration changes.

Exact next action: read #29's latest handoff and owner decisions; verify this
checkpoint's remote SHA and current checkout scope. Once recovery policy is
approved, implement the pure focus lifecycle/evidence boundary and focus-specific
tests. Implement the shared database adapter and planner mount only during their
separately approved serial ownership windows. Preserve the existing commit/push
authority; obtain separate release authorization before creating a PR.
