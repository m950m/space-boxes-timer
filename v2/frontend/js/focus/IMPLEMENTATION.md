# WS-A / V2-012 implementation and handoff

Recorded 2026-10-12 (Africa/Cairo); status updated 2026-10-13. **Domain, IndexedDB
persistence, browser controller and the mounted planner Focus panel are implemented
and validated locally (PR #43); the owner-gated #28 acceptance review remains.**

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

The owner-approved exclusive `planning-store.js` window was activated by
[Zcode's acknowledgement](https://github.com/m950m/space-boxes-timer/issues/29#issuecomment-6114151992):
no unpushed/concurrent shared-file work, WS-A sole writer until published handoff.
`app.js`, `index.html`, other shared files and Planner-owned files remained
outside that window. The separately authorized #42 integration (PR #43) later
mounted the panel in `app.js`/`index.html` and added [focus-view.js](focus-view.js).

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

## Implemented persistence and browser contract

[planning-store.js](../persistence/planning-store.js) keeps `openPlanningStore`,
`localScopeId`, `load`, `commit`, `close` and status callbacks compatible. Database
`space-boxes-v2` is now version **2**, adding only `focus` keyed by
`ownershipScopeId`. Existing `metadata`, `scopes`, `tasks`, keys/index and all
records are preserved. Upgrade from v1 validates its physical schema before
adding the store. Aborted upgrades roll back; malformed/future data fails visibly
without reset. V1 localStorage is untouched. Opening validates stored focus and
its task associations; corrupt authority never becomes an empty replacement.

- `loadFocus()` returns a detached aggregate for the single persisted local scope.
  It cannot acquire control. Other planning scopes remain supported by the planner
  API but cannot create independent focus authority through this local-only API.
- `commitFocus(command)` loads planning and focus, validates and writes in one
  IndexedDB read/write transaction spanning all stores. Native transaction
  serialization and `expectedRevision` reject competing/stale requests. Success
  and `saved` occur only on transaction completion, with strict durability requested.
- Storage Start takes `taskId`, `plannedItemId`, `expectedPlanningRevision` plus
  the domain command fields. Caller-supplied `task` snapshots are rejected. The
  adapter obtains the task and frozen context from the serialized persisted plan.
  Persisted `planDay.timezone` wins over viewer timezone; legacy opaque plans
  without that field require explicit `timezone`. Start cannot silently accept
  a plan revision different from the user's selected revision.
- Focus transitions do not write planning records. Planner changes cannot rewrite
  stored session snapshots/evidence; retired planned-item identities remain in
  existing planning records. No account/server or cross-device authority exists.

[browser-focus.js](browser-focus.js) exports `createBrowserFocus(store, options)`
and `SAMPLING`. The controller offers `load`, `start`, `checkpoint`, `pause`,
`resume`, `end`, explicit `recover({ confirmed: true })`, `reconcile`, `watch` and
`stop`. `watch` schedules persisted checkpoints only for accepted control;
`stop` stops sampling without releasing reservation. Call `load` before commands.
Default context IDs are fresh UUIDs per controller; an injected context ID must
not be reused to bypass recovery. `onState` reports detached accepted state,
`onError` reports automatic sampling failures and manual failures reject.
Observers may load/mirror, but Start/control requires persisted acceptance. UI
should use the returned controller identity and reservation to offer confirmed
recovery, and derive duration from `getSessionActivity`, never display ticks.

### Continuity reasoning and limits

The implementation samples every **1000 ms**, accepts callback gaps no larger
than **2500 ms**, and compares wall/monotonic deltas with **250 ms** tolerance.
These are technical sampling settings, not fixed product/idle policy. The cadence
bounds normal uncommitted evidence to roughly one tick; the gap allows ordinary
callback jitter but rejects delayed/throttled callbacks. Clock tolerance allows
sampling/clock granularity without accepting large wall-clock jumps. No keyboard,
mouse, visibility or cognitive-activity threshold is used.

Both clocks must advance nonnegatively and agree. A larger callback gap retains
its measured elapsed duration as uncertain, without credit. Negative/reversed or
inconsistent clocks retain observed boundaries and unknown elapsed duration;
the user supplies explicit reconciliation. New page/process/controller recovery
has no trustworthy live boundary and always closes the unobserved interval as
unknown, retaining Running/Paused mode and requiring confirmed transfer. Former
controllers and stale revisions cannot change state. Explicit pause remains
non-focus even when its duration is unknown.

Browser clocks cannot prove attention or detect every short suspend/compensating
clock change below this resolution. Only observed continuous callbacks qualify
for measured credit; no wall-clock-only recovery or guarantee against browser
storage eviction is claimed. Whole-scope aggregate/history validation and strict
writes are deliberately bounded initial implementation choices; growing history
or measured write latency warrants later profiling, not an invented retention cap.

## Verification and exact next action

- `python3 v2/frontend/tests/run-focus-domain-tests.py`: 119 real-Chrome checks
  (38 unchanged Focus domain + 81 unchanged planning domain regressions).
- `python3 v2/frontend/tests/run-focus-persistence-tests.py`: existing persistence
  checks plus Focus-specific migration, authority, two actual tabs, failures,
  no-input sampling, actual callback stall, deterministic forward/backward clocks,
  stopped/reset monotonic clock, reload and separate browser-process restarts for
  both Running and Paused. The published #29 checkpoint records final results.

Under the #42 authorization the shared persistence fixture
(`persistence.test.js`) now encodes schema v2 on disk: two raw reads open the
database unversioned and the future-version test uses v3; every original
test/assertion and the shared `run-browser-tests.py` remain untouched. Existing
malformed-v1, upgrade, UI status and V1-isolation checks run unmodified. The
Focus runner enables popups only in a disposable profile for actual two-tab
coverage. No dependencies are installed.

Diff review covers accepted scope, commit-only success, serialization, original
attribution and failure preservation. A test-harness popup block was repaired by
enabling popups in the disposable profile. The mounted panel
([focus-view.js](focus-view.js)) exposes explicit Start/Pause/Resume/End,
recovery, reconciliation, history and visible storage failures;
`run-focus-ui-tests.py` validates those #28 UI/keyboard/status/reconciliation
interactions in real Chrome (69 checks), including reload/process restarts and
two-tab authority. Clock/sleep discontinuities are tested deterministically; no
physical OS-suspend experiment or manual screen-reader audit is claimed (OD-027
keeps WCAG 2.2 AA a target, not a conformance claim).

Deferred, owner-gated items: reconciling a long-hidden period presents one form
per uncertain interval (Chrome throttles hidden tabs to roughly one timer per
minute after five minutes); uncertain time is never silently counted or
discarded. Whole-scope per-checkpoint validation and write cost grows with
session length and is profiled separately. The Focus suites are not yet in CI
(separately authorized workflow update). Next step: the owner's #28 acceptance
review of PR #43.

## UI delivery batch (local `feature/ws-a-focus-ui`, 2026-10-13)

Owner-approved presentation-only batch over the PR #43 base (`bd21b2d`), sole
writer for `app.js`/`index.html`/`planner.css` plus Focus UI files:
[focus-view.js](focus-view.js) and [index.html](../../index.html) add a prominent
live MM:SS countdown (`#focus-clock`, `role=timer`, `aria-live=off`) with a
focused/of-planned caption, a completed/ended-early outcome banner, and grouped
Start/Pause/Resume/End controls; [planner.css](../../css/planner.css) styles
them and keeps a 320px single-column fit. The clock projects only the open
interval of a Running reservation owned by this tab between confirmed
checkpoints, capped at the target, and observers show confirmed facts only —
it never writes evidence or changes credit/authority. Reconciliation keeps the
same explicit decision model with plainer copy, local observed times and
single-answer quick fills that only prefill the existing parts UI.
`run-focus-ui-tests.py` extends coverage accordingly; no domain, controller,
persistence or CI changes.
