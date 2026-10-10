# V2 minimal runnable foundation

This foundation provides an isolated Vanilla JavaScript entry point and a local
Django project, plus the planning domain slices described below. The
page still displays only a status message. Browser-local IndexedDB persistence
is implemented for planning records; there are no accounts, backend database or
migrations. Existing V1 files and storage keys are unchanged.

## Setup

Use Python 3.14 with `venv` and pip available. Run all commands from the repository
root:

```bash
python3 -m venv v2/.venv
v2/.venv/bin/python -m pip install -r v2/requirements.txt
```

The sole direct dependency is pinned to Django 5.2.18 (5.2 LTS); pip resolves its
required transitive dependencies. Installation requires package-registry access.
There is no Node/npm dependency or frontend build step.

## Run through Django

```bash
v2/.venv/bin/python v2/backend/manage.py runserver 127.0.0.1:8000
```

Open <http://127.0.0.1:8000/>. Django serves the HTML and JavaScript on the same
origin. No database setup or `migrate` command is needed.
If port 8000 is occupied, use `127.0.0.1:8001` in the command and open
<http://127.0.0.1:8001/> instead.

## Run the frontend independently

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory v2/frontend
```

Open <http://127.0.0.1:8766/>. This mode needs neither Django nor the virtual
environment. In both modes, the initial “Starting V2 frontend…” message changes
to “V2 frontend ready. Local plans loaded.” after IndexedDB initialization and
validation. Storage failures display “Error” with the reason. Stop either server
with Ctrl+C.

## Verify

```bash
v2/.venv/bin/python -m pip check
v2/.venv/bin/python v2/backend/manage.py check
v2/.venv/bin/python v2/backend/manage.py test config
git diff --check
git diff --exit-code HEAD -- . ':(exclude)v2/**'
git status --short
```

The built-in Django runner uses `SimpleTestCase` without database setup. The
tests check the frontend document and module reference, JavaScript delivery,
404 responses for unknown routes, and disabled asset serving outside development
mode. They do not execute JavaScript.

For each startup mode, open its URL in a modern browser and confirm the ready
message, successful JavaScript loading in the Network panel, and no console
errors. Verify V1 still loads using its existing command:

```bash
python3 -m http.server 8765
```

Open <http://localhost:8765/>. Inspect all new files and confirm the task changes
are confined to `v2/`.

## Local planning persistence (V2-010, Issue #24)

`frontend/js/persistence/planning-store.js` uses native IndexedDB and structured
clone, with no new dependencies. `openPlanningStore({ onStatus })` resolves to
`{ localScopeId, load, commit, close }`. The page's `app.js` exports a
`planningStore` promise for this boundary; it adds no planner controls. The
existing `role="status"` area displays Loading, Saving, Saved or Error according
to actual operations. Initialization/load readiness is distinct from a save.
Status follows the latest operation started on that store; older completions
cannot replace its pending or failure message. Saved requires that operation's
transaction to complete.

Version 1 of the isolated `space-boxes-v2` database has these object stores:

| Store | Key | Value / index |
| --- | --- | --- |
| `metadata` | `key` | `{ key: "localScopeId", value: <random local identity> }` |
| `scopes` | `ownershipScopeId` | `{ ownershipScopeId, revision, taskIds }`; IDs retain task order |
| `tasks` | `[ownershipScopeId, id]` | Full existing Task aggregate; non-unique `scope` index on `ownershipScopeId` |

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
not add sessions, reservations, focus control, connected/account authority,
clock policy, retention, deletion, V1 import, export or synchronization.

Initialization validates the physical schema, local identity, ordering metadata
and all stored task collections. Invalid records, incomplete schema, denied
access and unsupported newer versions are errors, never empty-plan fallbacks.
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
The module has no DOM, backend or storage dependency and is not wired into the UI.

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
The module is not wired into
the UI and has no storage, backend, timer or session-execution dependency.

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
Tasks and subtasks share the same planning contract for later focus-session code;
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
normalization and direct opening remain later UI work under OD-021; this
in-memory contract does not certify that stored text is safe to navigate to.
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
local development only. The frontend uses IndexedDB for the planning records
described above and does not import V1 modules or access V1 storage.
Authentication, PostgreSQL, other domain behavior, synchronization, visual
design, CI, Docker, and production configuration remain future work.
