# WS-A / V2-012 implementation and handoff

Recorded 2026-10-12 (Africa/Cairo). **Independent domain package implemented;
persistence/browser controller/UI integration pending.**

Workstream [#29](https://github.com/m950m/space-boxes-timer/issues/29), acceptance
task [#28](https://github.com/m950m/space-boxes-timer/issues/28), delivery index
[#11](https://github.com/m950m/space-boxes-timer/issues/11). #29's owner decision
supersedes the unapproved recovery proposal at checkpoint
`6b6006792656f9f8b38156d320664ee3e4824d61`.

## Authority and boundaries

Checkout `/home/mnabil/Learning/projects/Space_boxes_Codex_Focus`, branch
`feature/ws-a-focus`, repository `m950m/space-boxes-timer`. Starting checkout was
clean and matched the live GitHub checkpoint. #29 authorizes owned implementation,
tests, review and verified checkpoint commits/pushes/comments.

Owner approved preserving observations/obligations, explicit continued,
interrupted or partial-work reconciliation, non-focus pause, no input-idle
inference, capped nonduplicate focus and retained Running/Paused authority.
**No checkpoint frequency or discontinuity thresholds are selected by this pure
domain package.** The previous 1-second/5-second/1-second proposal is not approved
fixed product policy. Browser sampling requires reasoning and deterministic tests.

Do not modify `planning-store.js` until Zcode explicitly acknowledges the exclusive
window and confirms no local unpushed or concurrent edits. Remote branch state
cannot establish that acknowledgement. Do not modify `app.js`, `index.html`,
other shared files or Planner-owned files. No PR, merge, deployment or deletion.

## Implemented domain contract

[focus-lifecycle.js](focus-lifecycle.js) exports `createFocusState(scopeId)`,
`validateFocusState(state)`, `transitionFocus(state, command)` and
`getSessionActivity(state, sessionId)`. [activity-evidence.js](activity-evidence.js)
validates evidence/decisions and derives factual activity projections.

A scope aggregate has a revision, one nullable Running/Paused reservation, actual
sessions with detached minimal starting snapshots, activity evidence,
reconciliation decisions and authority-change history. Only the reservation owns
current control; evidence owns interval boundaries. This domain representation
does not establish an IndexedDB schema, durable success or cross-tab locking.

Every command requires unique `id`, `type`, `contextId`, finite observed `at` in
milliseconds and `expectedRevision`. The accepted controller performs active
control actions. Caller state/intent are cloned, not mutated. Returning a draft
requires the adapter to serialize authoritative load/check/write before success.

| Command | Additional input and behavior |
| --- | --- |
| `start` | Explicit `sessionId`, `task`, current `plannedItemId`, `timezone`, new `evidenceId`. Captures original identity/title/classification/Plan Day/timezone/planned start/target and optional parent reference; excludes notes/resources/full plan. |
| `record` | Closes an observed interval and opens the next with a new `evidenceId`; confirmed active target ends the session. |
| `pause`, `resume` | Close current evidence and open pause/focus evidence under the same reservation; pause never adds focus and has no duration cap. |
| `end` | Closes evidence and releases reservation; preserves actual early duration, recorded outcome/ending and unresolved obligations. |
| `transfer` | Requires `confirmed: true` and new `evidenceId`; preserves session/mode, invalidates old controller, marks running recovery interval uncertain. |
| `reconcile` | Closed `evidenceId`, `elapsedMs`, ordered `parts` explicitly accounting for all duration. Preserves originals and appends decision provenance. |

Control interval commands require `observation: { at, elapsedMs, certainty }`
ending at command `at`. Certainty is `confirmed` or `uncertain`; running
uncertainty requires nonblank `reason`. `elapsedMs` is reliable measured duration
or `null` when unknown. Confirmed focus needs reliable duration and ordered
boundaries. Wall-clock differences alone do not prove focus; the browser adapter
must establish or deny continuity.

Reconciled parts use `{ kind: "focus", elapsedMs }` or
`{ kind: "interruption", elapsedMs, episodeId }`. Explicit episode IDs group
fragments without automatic interruption/arbitration rules. Unknown explicit
pause duration accepts only `pause` parts. Reliable duration cannot be replaced.
Parts account for the whole interval with relative machine-rounding tolerance;
duplicate decisions reject. Unknown duration requires explicit user input.

Projections credit in original evidence order, cap focus at the frozen target,
retain excess as `uncreditedFocusMs`, and separate pause, interruption and known/
unknown unresolved durations. Open evidence adds no credit. Completion preserves
an evidence-relative offset; exact absolute time is `null` if reliable clock/
duration mapping is unavailable. No task mutation or next-session auto-start.

Later decisions may correct `effectiveOutcome`/`endingPoint` while retaining the
original recorded ending. Completion during reconciliation retains an unobserved
running tail as uncertainty or unknown pause tail as pause. Reconciling old
history leaves a later reservation and its control references untouched.

## Verification and exact next action

Run `python3 v2/frontend/tests/run-focus-domain-tests.py`. The Focus-owned fixture
runs in installed Chrome using Python stdlib and an ephemeral origin/profile,
alongside six unchanged planning regression suites. No installs are required.
The published #29 checkpoint records results and tested revision. JSON round-trip
tests prove domain rehydration, **not disk persistence, browser-restart authority
or two-tab transaction serialization**.

Actual diff review covered accepted criteria, data-model integrity and ownership.
Repairs addressed unknown-pause reconciliation, historical control references,
relative duration rounding and absolute completion-time trust. A boundary-test
helper was corrected after the initial run. No shared files were modified.

Next: obtain Zcode's explicit persistence-window acknowledgement, then integrate
compatible IndexedDB upgrade/open/schema and atomic planning/focus transitions
while preserving planner API, records, visible failures and V1 data. Choose and
justify browser sampling at that stage; test throttling/restart/clock cases,
transactions, two tabs and storage failures plus existing persistence regressions.
Publish API/schema, verified SHA and end-of-window handoff on #29 before returning
ownership. Planner mounting remains separately gated; #28 is not fully delivered
or overall QA-passing at this independent-package checkpoint.
