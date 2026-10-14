# V2 local Planner and Focus, with an optional connected account

V2 provides an isolated Vanilla JavaScript local Planner and Focus panel with a
local Django project. Plan tasks, run focus sessions and recover saved sessions
without an account, using native IndexedDB. An optional connected account adds
server-side PostgreSQL persistence: explicit non-destructive connection of the
local history, synchronization, machine-readable export and password-confirmed
account deletion. Existing V1 files and storage keys are unchanged.

## Setup

Use Python 3.14 with `venv` and pip available. Run all commands from the repository
root:

```bash
python3 -m venv v2/.venv
v2/.venv/bin/python -m pip install -r v2/requirements.txt
```

Dependencies are pinned: Django 5.2.18 (5.2 LTS) and psycopg 3.2.13 (PostgreSQL
driver); pip resolves their transitive dependencies. Installation requires
package-registry access. There is no Node/npm dependency or frontend build step.

Connected features need a reachable PostgreSQL server configured through
environment variables (defaults shown):

```bash
SPACE_BOXES_DB_NAME=space_boxes_v2
SPACE_BOXES_DB_USER=spaceboxes
SPACE_BOXES_DB_PASSWORD=
SPACE_BOXES_DB_HOST=127.0.0.1
SPACE_BOXES_DB_PORT=5434
```

Create the schema once per database:

```bash
v2/.venv/bin/python v2/backend/manage.py migrate
```

## Run through Django

```bash
v2/.venv/bin/python v2/backend/manage.py runserver 127.0.0.1:8000
```

Open <http://127.0.0.1:8000/>. Django serves the HTML and JavaScript on the same
origin. If port 8000 is occupied, use `127.0.0.1:8001` in the command and open
<http://127.0.0.1:8001/> instead.

## Run the frontend independently

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory v2/frontend
```

Open <http://127.0.0.1:8766/>. This mode needs neither Django nor the virtual
environment. In both modes, “Loading local plans…” changes to “Local plans
loaded.” after IndexedDB initialization, validation and task hydration. Storage
failures display “Error” with the reason. Stop either server
with Ctrl+C.

## Verify

```bash
v2/.venv/bin/python -m pip check
v2/.venv/bin/python v2/backend/manage.py check
v2/.venv/bin/python v2/backend/manage.py test config
v2/.venv/bin/python v2/backend/manage.py test accounts productivity  # needs PostgreSQL
git diff --check
git diff --exit-code HEAD -- . ':(exclude)v2/**'
git status --short
```

The `config` smoke tests use `SimpleTestCase` without database setup; they check
the frontend document and asset references, JavaScript/CSS delivery, 404
responses for unknown routes, and disabled asset serving outside development
mode. They do not execute JavaScript. The `accounts` and `productivity` suites
(73 tests) run against PostgreSQL through the `SPACE_BOXES_DB_*` settings above
and cover models/constraints, throttles, auth and recovery, synchronization
semantics and isolation, focus authority including concurrency, HTTP boundaries,
the narrow admin, export/deletion and account-scoped permissions.

For each startup mode, open its URL in a modern browser and confirm the ready
message, successful JavaScript loading in the Network panel, and no console
errors. Verify V1 still loads using its existing command:

```bash
python3 -m http.server 8765
```

Open <http://localhost:8765/>. Inspect all new files and confirm the task changes
are confined to `v2/`.

## Local test entrypoints and CI

Run from the repository root. The six pure planning suites require `gjs`:

```bash
gjs -m v2/frontend/tests/task-classification.test.js
gjs -m v2/frontend/tests/task-planning.test.js
gjs -m v2/frontend/tests/session-plan.test.js
gjs -m v2/frontend/tests/task-history.test.js
gjs -m v2/frontend/tests/task-hierarchy.test.js
gjs -m v2/frontend/tests/task-resources.test.js
```

The browser runners require Python stdlib and `google-chrome` or `chromium` on
`PATH`; no Django server, Node/npm or frontend build is needed. They serve their
own ephemeral localhost origins and use disposable browser profiles:

```bash
python3 v2/frontend/tests/run-browser-tests.py
python3 v2/frontend/tests/run-planner-tests.py
python3 v2/frontend/tests/run-focus-domain-tests.py
python3 v2/frontend/tests/run-focus-persistence-tests.py
python3 v2/frontend/tests/run-focus-ui-tests.py
```

| Runner | Coverage |
| --- | --- |
| `run-browser-tests.py` | Planning IndexedDB, atomic failures, status, reload and browser restart |
| `run-planner-tests.py` | Planner editing, hierarchy/split, breaks, resources, lifecycle controls, keyboard and narrow viewport |
| `run-focus-domain-tests.py` | Focus lifecycle/evidence/reconciliation plus all six planning domain suites |
| `run-focus-persistence-tests.py` | Planning persistence regressions, schema upgrade, serialized authority across tabs, clock/callback discontinuities, Running/Paused reload and process restart |
| `run-focus-ui-tests.py` | Mounted Start/Pause/Resume/End, recovery, reconciliation, outcomes/history, keyboard/status, tabs, reload and process restart |

[`V2 CI`](../.github/workflows/v2-ci.yml) runs for pull requests targeting `v2`
and pushes to `v2`, on `ubuntu-26.04`. Its four jobs run the six GJS suites plus
the connected-payload suite and diff hygiene; all five browser runners above on
real Chrome with Python 3.14; the Django `pip check`, system check and four HTTP
smoke tests shown in **Verify**; and the connected backend suite against a
PostgreSQL 18 service container (migrations included). Diff hygiene rejects
changes outside `v2/`, `_docs/` and `.github/` and checks whitespace. Missing
GJS/browser/PostgreSQL prerequisites fail rather than skip. The workflow uses
read-only repository permissions, job timeouts and no secrets or deployment
steps. Branch protection and required-check settings are separate owner
decisions.

Historical hosted evidence is recorded in [Issue #40's handoff](https://github.com/m950m/space-boxes-timer/issues/40#issuecomment-6155809486):
PR run `38365334807` passed all three Focus steps (119 domain, 47 persistence,
82 UI checks); post-merge push run `38471949209` passed all three jobs at
`d317bdbba9a0819da173c994b60c060fc4f2aa90`. That handoff's post-merge API evidence
did not expose individual steps. It records no demonstrated deliberate-failure
CI run: failure diagnostics are inspected behavior, not proof from an injected
red run. These historical results are not a fresh execution of the commands.

Browser checks cover keyboard, focus, labels and status behavior. Independent
manual screen-reader QA has not been performed; physical OS suspend and other
browser engines are not established by these suites. WCAG 2.2 AA remains the
target, not validated conformance or certification.

## Usable local planner (V2-011 and WS-B, Issues #26 and #30)

Choose a Plan Day in **Your plan** to see Primary and Extra tasks. Use the editor
to enter a title, Plan Day, chosen local start time and at least one focus
duration. Add, remove or move sessions to choose their order; count and total
focus minutes are derived from that plan. Durations have no new product bounds
or defaults. Note is optional. **Save task** commits the full change, then updates
the displayed list. **Edit task** loads existing details into the same editor.
Classification changes and moves use the existing domain operations, including
the maximum of three Primary tasks per scope/day. No focus starts automatically.

The UI uses the local calendar date (`YYYY-MM-DD`) as its opaque `planDayId` and
stores scheduling intent as `plannedStart: { time, timezone }`, with browser
local time text and IANA system timezone. It does not convert intent into an
actual UTC start or reinterpret historical values. Unchanged scheduling intent
keeps its saved context; explicit day/time edits use the current system timezone.
The page displays the current timezone, saved task timezone and a notice if the
system timezone changes while the page is open and refocused.

IndexedDB remains the local authority. The UI keeps a loaded projection and an
unsaved editor draft, never a separate persisted task collection. Saved appears
only after transaction commit. Failed validation/writes keep the draft and
previous saved list. Stale revisions are rejected; **Reload saved plans (discard
edits)** explicitly reloads the storage snapshot. Task/item identities, retired
items, unrelated metadata and recorded history pass through existing commands.
Use the optional parent selector to make a task a subtask; self/descendants are
excluded. While editing, **Split work** creates separately planned work with a
new identity and optional parent link to the source; the source is unchanged.
Each new task needs its own title, day/start and focus plan.

Add optional planned-break rows with duration and placement between adjacent
focus sessions. If a reorder breaks that adjacency, fix the placement or remove
the break before saving. Breaks are planning data only: no break timer or
recorded-break workflow is implemented, and breaks add no planned focus minutes.

Add optional resource URL/label rows. HTTP/HTTPS resources open directly in a
new tab with opener isolation; other stored schemes remain visible inert text.
**Mark complete** and **Cancel task** are explicit decisions that retain records
and history. Either decision disables both lifecycle controls; pre-existing
conflicting decisions are shown visibly. Session outcomes never decide tasks.
The day summary's planned-focus minutes include completed tasks and exclude
cancelled tasks, as its label states; these are planned minutes, not actual work.

Keyboard controls, focus outlines, labels, status and errors support the WCAG
2.2 AA target; this is not a conformance claim. Browser storage is not a backup.

Run the focused real-browser UI suite (installed Chrome/Chromium, Python stdlib):

```bash
python3 v2/frontend/tests/run-planner-tests.py
```

It covers create/save/reload/edit/classify/reload, browser process restart,
keyboard Tab/Enter/text input, day filtering and rescheduling, identity retention,
fourth-Primary rollback, invalid fields, quota failure and retry, stale-revision
recovery, status announcements and a narrow viewport. It uses a disposable origin
and profile. Run the existing persistence browser suite and domain regressions
below alongside it; Django smoke tests check the updated document and serving.

## Focus sessions and recovery (V2-012)

Save a task, choose its Plan Day in **Your plan**, then select an unfinished,
non-cancelled task's item in **Saved session for the shown Plan Day** and press
**Start session**. Unsaved editor changes are not the starting plan. Planned
time never starts a session automatically. The saved starting snapshot fixes
the title, classification, original Plan Day/timezone and target duration;
later planning edits do not rewrite that session or its evidence.

**Pause** stops focus accumulation and retains the reservation. **Resume**
continues that session; **End session** releases it and retains the actual
confirmed duration and outcome. Confirmed active focus reaching the frozen
target completes the session automatically. Neither ending marks the task
complete or starts another session; use the separate Planner decision or an
explicit **Start session**. Original Plan Day attribution survives midnight.
The live countdown projects between saved observations; it is not saved credit.
Confirmed focus, pause, interruption and unresolved time are shown separately.
Expand **Saved session history and outcomes** for retained starting context,
recorded/effective outcomes and ending time/point; an exact clock time can be
unknown.

Only one Running or Paused reservation exists in the shared local storage
scope. Other cooperating tabs observe it. After reload, browser restart or a
move to another tab, choose **Confirm recovery / move control here** to transfer
control explicitly. Loading or **Refresh saved focus** alone does not take
control. A paused session stays paused until **Resume** or **End session**;
the former controller's stale actions are rejected. Recovery retains unobserved
time for reconciliation rather than counting wall-clock time as focus.

For each closed uncertain interval, the panel offers an explicit decision:

- A reliable measured duration is fixed. If duration is unknown, enter seconds
  explicitly; the displayed clock boundaries do not supply a presumed duration.
- **All confirmed work** and **All interruption** prefill a single part. For a
  partial-work decision, use **Add part**, choose confirmed work/interruption and
  enter seconds in order. Parts must account for the entire interval. Reuse an
  interruption group for parts belonging to the same interruption.
- Press **Confirm decision** to save. If you cannot confirm, leave it unresolved;
  it contributes no confirmed focus. Unknown explicit-pause intervals accept
  pause duration only and can never become focus.

Decisions preserve original observations, avoid duplicate credit and cap focus
at the original target. Reconciliation can update the effective outcome while
retaining the recorded ending. It does not take control of a later session.

The browser samples roughly once a second; delayed callbacks and disagreeing
wall/monotonic clocks produce uncertain or unknown intervals. Current technical
settings are 1000 ms sampling, a 2500 ms maximum callback gap and 250 ms clock
tolerance, not product idle/abandonment rules. No keyboard/mouse inactivity is
used to infer lost focus. Browser clocks cannot prove attention or detect every
short suspend/clock change. Long-hidden tabs can accumulate many separate
reconciliation forms; no bulk resolution is implemented. See
[Focus implementation notes](frontend/js/focus/IMPLEMENTATION.md) for the timing
reasoning; historical counts/CI status there may predate the current workflow.

On a Focus storage/stale-action error, controls stop and the panel shows the
last confirmed state. Use **Refresh saved focus**, inspect reservation/recovery
and unresolved time, then retry deliberately. If Start rejected a stale plan,
reload saved plans and reselect the item. Failed writes are not reported saved.

## Local planning persistence (V2-010, Issue #24)

`frontend/js/persistence/planning-store.js` uses native IndexedDB and structured
clone, with no new dependencies. `openPlanningStore({ onStatus })` resolves to
`{ localScopeId, load, commit, close, loadFocus, commitFocus }`. The page's `app.js`
exports a `planningStore` promise for this boundary; the planner uses its commands.
The existing `role="status"` area displays Loading, Saving, Saved or Error according
to actual operations. Initialization/load readiness is distinct from a save.
Status follows the latest operation started on that store; older completions
cannot replace its pending or failure message. Saved requires that operation's
transaction to complete.

Version 2 of the isolated `space-boxes-v2` database retains the original planning
stores and adds Focus:

| Store | Key | Value / index |
| --- | --- | --- |
| `metadata` | `key` | `{ key: "localScopeId", value: <random local identity> }` |
| `scopes` | `ownershipScopeId` | `{ ownershipScopeId, revision, taskIds }`; IDs retain task order |
| `tasks` | `[ownershipScopeId, id]` | Full existing Task aggregate; non-unique `scope` index on `ownershipScopeId` |
| `focus` | `ownershipScopeId` | Local Focus aggregate: reservation, sessions, evidence, reconciliation and control history |

The v1-to-v2 IndexedDB upgrade validates the old schema and preserves planning
data while adding `focus`; it is distinct from Django migrations. `loadFocus()`
reads the local scope without acquiring control. `commitFocus(command)` loads
the saved plan and Focus state, checks revisions/authority and writes in one
serialized IndexedDB transaction. Strict durability is requested and success is
reported only on transaction completion. Focus writes do not rewrite plans.

Local identity is generated only in the initial schema transaction and persists
across reloads. Physical keys match the domain's opaque string scope/task
references; planned focus and break identities remain inside their Task.
Task records retain supplied Plan Day/calendar/timezone context, optional
historical payloads, activity associations and retired items through native
structured clone. The adapter does not generate or reinterpret these values.
Session count and planned focus totals remain domain projections.

`load(scopeId = localScopeId)` returns `{ ownershipScopeId, revision, tasks }`
from one consistent readonly transaction. A new empty scope has revision 0.
`commit(scopeId, expectedRevision, commands)` accepts a non-empty array of these
commands and returns the same shape only after transaction completion:

| `type` | Other command fields |
| --- | --- |
| `create` | `task` (existing planning record, including any supplied history/context) |
| `edit` | `taskId`, `changes` (existing domain's editable planning fields) |
| `classify` | `taskId`, `classification` |
| `reschedule` | `taskId`, `planDayId`, `plannedStart` |
| `parent` | `taskId`, `parentTaskId` (null detaches) |
| `split` | `taskId`, `newWork` (existing domain's allowed new-work fields) |
| `complete`, `cancel` | `taskId`, `decidedAt` (caller-supplied decision time) |

For example, after loading a scope, submit
`store.commit(store.localScopeId, loaded.revision, [{ type: "edit", taskId,
changes: { title: "Revised title" } }])`. Reads, the revision comparison, existing
domain commands, collection/quota/hierarchy validation, and all writes occur
within one readwrite transaction. Each command must leave a valid collection;
combined focus/break changes belong in one `edit`. The complete scope is written
atomically. Revision increments once per committed batch, so even unrelated
edits in the same scope can cause an explicit stale-revision rejection. The
caller must reload and decide whether to submit a new command; there is no
automatic retry, merging or silent last-write-wins.

Ordinary commands cannot delete tasks or rewrite historical fields. They reuse
the existing history-safe domain operations. Split creates separately planned
work without copying activity. Cancellation retains records. This adapter does
not add connected/account authority, retention/deletion controls, V1 import,
export or synchronization. Focus uses the separate commands described above.

Initialization validates the physical schema, local identity, ordering metadata,
stored task collections and Focus/task associations. Invalid records, incomplete
schema, denied access and unsupported newer versions are errors, never empty-plan fallbacks.
Only a new database gets schema initialization. Blocked/failed initialization
rejects; version changes close the connection and require reload. No reset,
repair, overwrite or destructive migration is attempted. Saving resolves on
`IDBTransaction.complete`, not request success. Aborts, request errors, quota
and serialization failures reject and preserve previous committed records.

Storage authority is limited to the browser origin/profile. Different server
ports have different origins. Browser storage may be denied, quota limited,
cleared or evicted and is not a backup. This slice requires native IndexedDB,
structured clone and `crypto.randomUUID` (localhost or another secure context).
It has no selected browser support matrix or silent persistence fallback.

Run the real-browser tests using installed Chrome/Chromium and Python stdlib:

```bash
python3 v2/frontend/tests/run-browser-tests.py
```

The runner creates a disposable profile and ephemeral localhost origin, reloads
the page and restarts the browser process with that profile. Only test fixtures
in that origin are reset. It exercises aggregate/ordering round trips, repeated
edits and history/retired links, atomic multi-record rejection, scoped identity,
concurrent stale writers, native request error/abort rollback, failure statuses,
schema/initialization failures, version changes and unchanged V1 sentinels.
The suite checks the actual page's accessible pending/saved/error status.
Overlapping-save regressions cover older completions after a newer failure and
while a newer transaction remains pending.

Quota, storage denial, blocked-open request selection and failed-upgrade
conditions use deterministic API fault injection around real IndexedDB
transactions. Native quota exhaustion, browser permission configuration,
eviction, crash/power-loss recovery and other browser engines are **not** covered
by this suite. These tests do not claim backup or focus-authority guarantees.
Retain the six GJS domain suites below and Django's four HTTP smoke tests.

## Primary/Extra classification domain slice (V2-009A, Issue #12)

`frontend/js/domain/task-classification.js` exports
`setTaskClassification(tasks, ownershipScopeId, taskId, classification)`.
It returns a new task array with the selected task's classification changed to
`"primary"` or `"extra"`. It does not mutate the input. At most three Primary
assignments are permitted per ownership scope/Plan Day; Extra tasks have no count
cap. Demotion releases capacity. Invalid input, an absent/ambiguous target or a
fourth Primary assignment throws without changing input state.

The operation accepts existing records with non-empty opaque string `id`,
`ownershipScopeId` and `planDayId` references, plus `classification`. Task identity
must be unique within its ownership scope. `planDayId` refers to the caller's
ownership-scoped Plan Day; this operation does not interpret dates or timezones.
These names define a small module contract, not a full Task creation API,
identifier-generation scheme or persistence schema. Other fields, including
historical activity and lifecycle state, pass through unchanged; nested data is
shared, not rewritten. There is no implicit task/session start or completion.
The module has no DOM, backend or storage dependency; the local planner invokes
it through the IndexedDB adapter.

Run the focused automated ES-module tests from the repository root:

```bash
gjs -m v2/frontend/tests/task-classification.test.js
```

GJS 1.88.0 was already available in the implementation environment and executes
the pure JavaScript tests without Node/npm, an added package or a build step.
GJS is only a test execution option; it is not a product runtime dependency.
The tests cover quota boundaries, demotion, day/scope isolation, invalid requests,
input immutability, history preservation and unchanged task/session lifecycle.
They do not validate browser UI, persistence or focus authority.

## Required planning records and totals (V2-009B, Issue #13)

`frontend/js/domain/task-planning.js` exports:

- `createTaskPlanningRecord(record)`: validate caller-supplied planning data and
  return a new record with copied plan items.
- `updateTaskPlanningRecord(record, changes)`: return a validated copy with
  changes limited to `title`, `plannedStart`, `sessionPlan` and optional
  `plannedBreaks`, `note` and `resources` (extended by V2-009C/F below).
- `getTaskPlanningTotals(record)`: compute `{ sessionCount, plannedFocusMinutes }`
  from the current items. These fields cannot be supplied as editable task data.

Records reuse the non-empty opaque `id`, `ownershipScopeId` and `planDayId`
references from 009A. They require a non-empty string `title`, a supplied
`plannedStart`, and a `sessionPlan` array containing focus items. Each item has a
non-empty `id`, unique within the task, and finite numeric `activeMinutes`.
Array order is the caller's intended order. Missing/empty plans are incomplete;
no duration defaults, integer requirement, or product duration/count limits are
selected. Numeric overflow rejects rather than returning an infinite total.
Three items of 25, 25 and 40 minutes yield count 3 and total 90 minutes. Editing
durations or replacing the item collection recalculates the projection; there is
no separately stored count, total or required V1 estimate.

`plannedStart` is opaque scheduling intent, checked only for presence (not null,
undefined or a blank string). The module chooses no timestamp encoding, parses
no dates and uses no clock. The caller supplies the ownership-scoped Plan Day
reference; its date/timezone representation remains outside this API. Identity,
scope, current Plan Day, classification, lifecycle fields and historical activity
pass through unchanged. Planning cannot initialize actual start or complete a
task. Historical data is shared without rewriting snapshots or item associations.
The classification operation remains separate; callers use 009A to validate and
change classification across their task collection.

This is an in-memory domain contract, not a persistence schema. Explicit Plan Day
rescheduling and task decisions are described in V2-009D below.
The local planner uses the module for derived totals and, through the IndexedDB
adapter, planning edits. The module has no storage, backend, timer or
session-execution dependency.

Run both domain suites with the existing GJS execution option:

```bash
gjs -m v2/frontend/tests/task-planning.test.js
gjs -m v2/frontend/tests/task-classification.test.js
```

Planning tests cover required fields, item identity, computed totals, duration
and count updates, invalid updates, input snapshots, stable identity/history,
opaque planned starts and compatibility with classification. No additional
dependency, test framework or build step is required.

## Ordered focus items and planned breaks (V2-009C, Issue #14)

The same `task-planning.js` module extends the existing focus-item array with
explicit operations. Each returns a validated task snapshot without mutating
inputs:

- `addPlannedFocusItem(record, item, index)` inserts a caller-identified item at
  an explicit zero-based position, including either boundary.
- `editPlannedFocusItem(record, id, activeMinutes)` changes duration under the
  same identity.
- `reorderPlannedFocusItems(record, ids)` accepts a complete permutation of
  current focus identities.
- `removePlannedFocusItem(record, id)` removes an item from current planning.
- `addPlannedBreak(record, plannedBreak)`, `editPlannedBreak(record, id, changes)`
  and `removePlannedBreak(record, id)` manage separate rest items. Break edits
  accept only duration and adjacency changes.
- `getPlannedFocusItem(record, id)` and `getPlannedBreak(record, id)` return item
  copies by identity, including retired items for historical associations.

Optional `plannedBreaks` contains records with non-empty opaque `id`, finite
numeric `breakMinutes`, and `afterFocusItemId`/`beforeFocusItemId` references to
adjacent current focus items in that order. Break identities are unique within
their own collection. Sequence follows the focus-item order, with breaks placed
between their referenced pair; multiple breaks in the same gap follow their
array order. There are no break defaults, duration limits, or per-gap count caps.
Break durations are excluded from both session count and planned-focus totals.

Reordering an intact pair preserves its breaks' adjacency. An insertion, removal
or reorder that displaces a break rejects without changes. Callers explicitly
move/remove the break first, or use `updateTaskPlanningRecord` to change focus
order and break placement together atomically. No operation silently moves a
break to a different pair or drops it.

Removed items accumulate in `retiredFocusItems` and `retiredPlannedBreaks`,
including when current collections are replaced through the generic update.
These are retained in-memory identity records, not database tables or an archive
lifecycle. Retention applies even when recorded history lives outside the task.
Retired identities cannot be reused in the current plan, and retained collections
cannot be edited through planning updates. Retired breaks keep their former
adjacency references even if the focus items are also retired. Actual sessions,
recorded breaks and their frozen starting values pass through unchanged; current
item lookup never replaces historical snapshots.

The existing required non-empty focus plan remains enforced. There is no break
completion/execution operation, automatic next-session start, timer, UI, storage
or backend integration. These operations only change planning data and cannot
create actual focus, pause, interruption or task-completion facts.

Run the additional focused suite with the existing GJS runner:

```bash
gjs -m v2/frontend/tests/session-plan.test.js
```

It covers focus order/duration changes, cumulative identity retention, unchanged
external and task-owned history, explicit break placement, break exclusion,
invalid operations, input isolation and composition with classification. Run the
two existing domain suites above for regression coverage. No dependencies were
added.

## History-safe planning changes (V2-009D, Issue #15)

`task-planning.js` adds three explicit operations:

- `rescheduleTaskPlanningRecord(tasks, ownershipScopeId, taskId, planDayId,
  plannedStart)` returns a task collection with only the scoped target's current
  day/start changed. It reuses classification validation to enforce the destination
  limit of three Primary assignments. A full destination rejects a fourth Primary
  without automatic demotion. Extras have no count cap; other tasks/scopes pass
  through unchanged. Parent/child plans do not move automatically.
- `cancelTaskPlanningRecord(record, cancelledAt)` records cancellation of planning
  availability through a separate `cancelledAt` decision fact. The task and all its
  plan identities/history remain available; there is no deletion or archive lifecycle.
- `completeTaskPlanningRecord(record, completedAt)` records the explicit user
  completion fact/time independently of actual sessions. It does not end sessions,
  require completed sessions, or complete related tasks.

Decision times are supplied by the caller and checked for presence, using the
same opaque-intent boundary as planned start. Repeated explicit decisions retain
the first recorded time. These facts are separate from classification and any
caller-owned lifecycle fields; no full task state machine, reopening policy or
automatic Primary reassignment is introduced. Later edits/rescheduling preserve
both facts. Generic planning updates cannot set decision times or change Plan Day.

Ordinary edits use the existing planning update API. Task identity, session-start
title/classification, original Plan Day/timezone, planned start, configured duration,
planned-item links and recorded activity remain unchanged. History may be owned
by the task or held separately; these operations neither reinterpret nor rewrite it.
Current-plan projections and metadata edits never roll unfinished tasks to another
day or infer completion from session outcomes. Only explicit rescheduling changes
current Plan Day; only explicit task completion records its decision.

The operations return validated planning copies without mutating inputs. They
use no clock, UI, persistence, backend, session engine or new dependency.

Run the focused suite, plus the three domain regression suites above:

```bash
gjs -m v2/frontend/tests/task-history.test.js
```

The tests cover unchanged historical snapshots/activity across edits, rescheduling,
cancellation and completion; retained links; no automatic rollover/completion;
explicit decision times; destination quotas; scope isolation; input immutability;
invalid actions and composition with the existing planning/classification APIs.

## Subtask hierarchy and split work (V2-009E, Issue #16)

`frontend/js/domain/task-hierarchy.js` exports:

- `validateTaskHierarchy(tasks)` checks a complete in-memory task collection for
  unambiguous scope-local identities, existing same-scope parents and cycles.
- `setTaskParent(tasks, ownershipScopeId, taskId, parentTaskId)` returns a new
  collection with only the selected task's current parent replaced. Pass `null`
  to detach. Identity, planning, classification, completion facts and history
  remain unchanged; historical parent snapshots are not rewritten.
- `splitTaskPlanningRecord(tasks, ownershipScopeId, taskId, newWork)` adds one or
  more caller-identified, separately planned tasks within the source scope. Each
  supplies its own required planning fields and classification. New identities
  must be unused within that scope. Destination Primary limits reuse 009A;
  required plans and plan snapshots reuse 009B/C.

The single optional `parentTaskId` is a non-empty logical reference or absent/null.
The planning-record factory checks its shape and rejects self-parenting; resolving
parents and detecting longer cycles requires the complete collection boundary.
Validate assembled collections before use, and change existing parent relationships
through `setTaskParent`, rather than generic planning edits. Parents may be on a
different current Plan Day within the same scope. Traversal is iterative with no
selected depth or child-count cap. Hierarchy does not change Primary/Extra rules,
complete relatives, move their plans or roll their durations into parent totals.
Tasks and subtasks share the same planning contract used by Focus;
these operations create no actual session or focus authority.

Splitting leaves every existing task untouched, including the source's current
plan, retained item identities, decisions, historical sessions and evidence.
New work accepts only planning fields (`id`, `ownershipScopeId`, `planDayId`,
`classification`, `title`, `plannedStart`, `sessionPlan`, optional `plannedBreaks`,
`parentTaskId`, `note` and `resources`). History, retired items and lifecycle fields
are rejected, preventing source-record cloning from carrying activity into new
work. Activity held separately keeps its original task/session associations.
Any desired source replanning uses existing explicit planning operations; there
is no implicit partition, lineage, parent assignment or session start. Batch
parents may refer to other new tasks, provided the final hierarchy is valid.
All rejection paths leave inputs unchanged. No UI, persistence, backend API or
dependency is added.

Run the focused suite and the four existing domain regression suites:

```bash
gjs -m v2/frontend/tests/task-hierarchy.test.js
gjs -m v2/frontend/tests/task-classification.test.js
gjs -m v2/frontend/tests/task-planning.test.js
gjs -m v2/frontend/tests/session-plan.test.js
gjs -m v2/frontend/tests/task-history.test.js
```

Tests cover single-parent replacement/detachment, invalid parents and cycles,
scope isolation, deep hierarchies, stable identities, split history preservation,
explicit new plans, destination capacity and composition with existing operations.
They validate the domain contract; UI, persistence and session lifecycle are outside
this slice.

## Optional notes and URL resources (V2-009F, Issue #17)

The existing planning factory and update API accept optional `note` and
`resources`. A note is a string; omission, `null`, `undefined` or an empty string
is valid. No numeric note-length limit is selected by the approved specifications.
Resources may be omitted or supplied as an array of `{ url, label? }` records.
The URL must be a non-blank string; labels may be omitted, `null`, `undefined`
or any string. Text is preserved exactly. URL parsing, scheme validation,
normalization and direct opening are outside this domain contract under OD-021;
the contract does not certify that stored text is safe to navigate to.
The Planner now applies HTTP/HTTPS-only direct opening as described above;
the domain still preserves non-web values without navigating to them.
Resource fields are limited to URL and label, with no upload data, generated
resource identities, uniqueness rule or resource-count cap.

Use `updateTaskPlanningRecord(record, { note })` to edit or clear the note.
Use `updateTaskPlanningRecord(record, { resources })` to add, edit or remove
resources by supplying the next collection; `[]` clears it. Resource arrays and
their records are copied on creation and every planning update, isolating caller
mutations. Invalid annotations reject without modifying inputs. These edits
preserve task identity, scope, planning, decisions, session-start snapshots and
recorded activity, including history held outside the task. They create no
session or completion facts and do not affect focus totals. Notes and resources
are current task annotations, not required history snapshots.

Run the focused suite and the five domain regression suites above:

```bash
gjs -m v2/frontend/tests/task-resources.test.js
```

Tests cover optionality, add/edit/remove, invalid shapes, input isolation, no
count cap, exact text preservation, unchanged history and composition with
classification, rescheduling and split work. This slice adds no UI, browser
navigation, domain exception/blocking behavior, storage, backend or dependency.

## Limits

Settings, the public development-only secret, and Django static serving are for
local development only. The frontend uses IndexedDB for local plans, session
evidence and reservations and does not import V1 modules or access V1 storage.
Use the same hostname, port and browser profile to return to local saved work:
Django and the standalone server use different origins and do not share local
plans or Focus authority. Without connecting an account, separate
profiles/devices have independent local reservations. Signed-in cross-device
behavior is described in the connected-account section above. Storage denial,
quota failures and corrupt/unsupported records are surfaced; there is no silent
fallback or destructive automatic reset. Clearing site data, profile loss or
browser eviction can lose local plans/history that was never connected.
Browser-local storage is not a backup, even when a write has been confirmed.

## Optional connected account (connected product slice)

The **Account** panel is additive; signed-out local use behaves exactly as
before. With an account you can register/sign in, connect this browser's local
history, synchronize, export data and delete the account.

Connection is explicit and non-destructive. **Connect local history** uploads
the local plan days, tasks (with their plan items, breaks, resources and
decisions) and ended focus sessions (with evidence, authority history and
reconciliation decisions) to the account scope. Every record keeps its
client-generated identity, so retries and re-connects are duplicate-free; the
upload preserves the originating local scope as provenance. An active local
focus session blocks connection with a visible reason: connecting an active
session is deferred, and the server accepts no open evidence through sync.
Nothing in local storage is modified or deleted by connecting.

**Sync now** uploads local work created since the last accepted
synchronization and downloads account tasks that are missing locally. Plan
edits carry the base revision they were made against; a stale edit is reported
as a conflict and the server's canonical record is kept — there is no silent
last-write-wins in either direction. Rejections and conflicts are listed in
the panel status, never claimed as saved. Durable acknowledgement lives in the
browser's IndexedDB metadata, bound to the account scope id, so acknowledged
state survives reloads and cannot be relabelled onto a different account.

The server enforces account-scoped authorization on every endpoint: records
are always resolved through the authenticated account's ownership scope, and
cross-account references are treated as nonexistent. Administration is narrow
(account status and support actions only); productivity models are not
registered in the admin, so administrators have no default route to task
content, notes or history (FR-ADMIN-001).

Security model (ADR-004, OD-011): opaque server-side sessions in a
Secure/HttpOnly `SameSite=Lax` cookie ( Secure only over HTTPS), CSRF
protection on every mutating request, session-key rotation at login, generic
credential/recovery responses, a failed-login throttle, and single-use
60-minute recovery codes delivered by email with per-account (5/hour) and
per-IP (10/hour) request limits and per-account confirmation limits
(10/hour). A password change revokes every session. Account deletion requires
the current password, removes the canonical productivity data and the account,
and revokes sessions; local browser data is intentionally untouched. No
backup-retention or external-copy promise is made.

Exports (`Export my data (JSON)`) are machine-readable documents preserving
plans, activity, uncertainty, provenance and relationships, usable outside the
product (OD-016; the format is `space-boxes-v2-export/1`).

Implemented boundaries worth knowing:

- Connected focus control is server-side and tested (single reservation per
  account, stale revision/controller rejection, confirmed takeover,
  auto-completion). The live focus panel continues to run on the local engine
  and uploads ended history; wiring the panel's Start/Pause/Resume/End and
  takeover UX to server acceptance is the next integration slice at the focus
  UI boundary.
- Cross-device synchronization covers tasks (download into the planner) and
  ended history; downloading another device's focus history into the local
  focus panel is not implemented yet.
- Report delivery preferences are stored but no delivery scheduler, email
  delivery or extension/blocking is implemented (OD-020 keeps the extension
  after core V2).

Settings, the public development-only secret, and Django static serving remain
local-development configuration. The connected deployment story (HTTPS
termination, SMTP, production secrets, Docker) remains owner-gated future
work. Approved [product requirements](../_docs/product/v2-prd.md),
[owner decisions](../_docs/product/owner-decisions.md),
[architecture](../_docs/architecture/architecture.md) and
[data model](../_docs/data/v2-data-model.md) describe broader approved scope;
they do not imply unimplemented capabilities are available.
