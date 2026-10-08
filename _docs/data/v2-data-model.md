# Space Boxes Timer v2 conceptual/logical data model

Status: DOCUMENTATION DESIGN — OWNER-APPROVED MODELING PLAN IMPLEMENTED

Prepared 2026-10-08 for V2-005. This document implements the approved documentation plan; it does not assert implemented product behavior or approve a physical schema. The companion [ERD](v2-erd.md) shows logical relationships.

## 1. Sources and modeling decisions

Product policy comes from the approved [PRD](../product/v2-prd.md) and [owner decisions](../product/owner-decisions.md). Architecture comes from [architecture.md](../architecture/architecture.md), [ADR-003](../architecture/adr/003-persistence.md), [ADR-004](../architecture/adr/004-authentication.md), [ADR-005](../architecture/adr/005-local-cloud-sync.md), [ADR-006](../architecture/adr/006-focus-session-authority.md), and the existing [architecture diagrams](../architecture/diagrams.md). These are the eight source documents read; no v1 schema or lifecycle is inherited.

The owner selected these logical structures during planning:

| Decision | Selected structure and consequence |
| --- | --- |
| Historical planning context | Session-start snapshots; no full task-planning revision history. |
| Planned session identity | Independently identifiable logical planned focus items; actual sessions retain an unambiguous association to the item they started from through reordering/removal. No UUID, database key, table or storage representation is selected. |
| Task and Plan Day identity | Stable task with one current Plan Day; rescheduling changes future planning, not historical session attribution. |
| Subtask hierarchy | Optional single-parent task self-reference; no separate relationship entity or shared multi-parent subtask. |
| Active local-to-account connection | Pending association and preserved provenance; no separate connection aggregate or implicit account focus authority. |

Concepts below describe domain responsibilities and logical identity. They do not require one table per concept. Components without independent identity remain within their owning aggregate.

## 2. Ownership, calendar intent and planning

### Ownership and identity

An **Account** identifies an optional connected user and the account-access/recovery boundary. A **Local Data Scope** identifies account-free v2 data within one applicable browser origin/profile. Anonymous scopes cannot establish that two independent devices/profiles belong to the same person.

An **Ownership Scope** is the logical owner of plans, activity and reservations: either one account or one local data scope, never both. This is a conceptual alternative, not a required inheritance or storage design. Historical records also retain originating scope/context provenance, which can differ from their accepted account ownership after explicit connection.

Every persisted record must be attributable to one logical ownership scope, either directly or through its owning aggregate, with provenance where relevant. A task resource, reflection or plan item can inherit attribution from its owning aggregate; a separate ownership value on every component is not required.

Authentication-session references identify authorized account access. A controlling-focus-context reference identifies the accepted tab/device context controlling a particular focus session. Authentication, a device label, timer rendering, or observed input activity grants no focus ownership. Credential/recovery records are outside this productivity ERD; ADR-004 remains the authentication authority.

### Plan Day

A **Plan Day** is ownership-scoped local-calendar planning intent. Preserve its calendar date and the timezone context in which planning or session attribution was established. Actual activity instants are distinct from local planned date/time intent; a viewer's current timezone cannot redefine historical attribution. Time representation and same-date timezone reconciliation are not selected here.

Tasks have one current Plan Day. Actual sessions retain the Plan Day under which they began, plus frozen timezone context. Crossing midnight does not change that attribution; the user can explicitly start further sessions for the prior Plan Day. Timezone changes allow normal use and unobtrusive notice, without precise GPS. Future-plan adjustment behavior and differing active device timezones remain unspecified.

### Task aggregate

A **Task** has stable identity, required title, current Plan Day, user-selected planned start and a session plan. Optional components are a note, web resources and a parent-task reference. Any task or subtask can be focused. The hierarchy is distinct from Primary/Extra classification; parent references remain within the same ownership scope and cannot form cycles. No hierarchy-depth limit or automatic parent/child completion, duration rollup, or rescheduling is introduced.

The scope/Plan Day has zero to three simultaneous Primary task assignments, with no total-task cap. Promotion/demotion changes current classification while preserving activity. A subtask receives a clear focus representation without creating a fourth Primary head box; the visual treatment remains outside this model.

Explicit task completion has its own user-decision fact and time, separate from session state/outcome. Removal/cancellation changes planning availability and preserves historical task association; it is not destructive productivity-data deletion. No exact archive lifecycle is prescribed.

Rescheduling changes current planning under the same task identity. Unfinished work stays on its original Plan Day unless the user changes it. Splitting creates separately planned work/task identities as needed; already-recorded sessions remain associated with the task actually focused, rather than being redistributed or copied into the new work's totals. Split UI and lineage mechanics are deferred.

A **Task Resource** belongs to one task and contains a web URL and optional readable label. Resources are optional, directly openable and have no selected hard count limit. There are no file uploads or required resource snapshots in activity history.

### Session plan aggregate

Each task has one current **Session Plan**, containing ordered, independently identified **Planned Focus Items** with user-selected active durations. The user chooses count and each duration; count is represented by the items and total planned task focus is their sum. Neither count nor total is a competing independently editable source of truth. For example, 25 + 25 + 40 minutes yields three sessions and 90 planned focus minutes.

Future items can be edited, reordered, added or removed. Identity/history links for already-referenced items remain recoverable, while actual sessions retain frozen starting values. Item removal is not cascading session deletion. The model does not assume a one-to-one relationship between a planned item and actual sessions or prescribe retry/remaining-plan behavior after early ending.

**Planned Breaks** describe user-chosen deliberate rest between planned focus items, separate from focus durations. Planned focus items and planned breaks remain semantically distinct while participating in an intentional session-plan sequence. Each planned break retains enough logical position/adjacency context to identify where the user placed it between planned focus items. Exact storage representation remains deferred; no ordering column, PLAN_ITEM supertype, database representation or identifier/key encoding is selected. Suggestions are optional guidance. No duration limits, default lengths, or per-item planned start fields are invented; the required planned start remains the task's scheduling intent.

## 3. Actual focus and historical evidence

### Actual focus session aggregate

An **Actual Focus Session** belongs to one task and ownership scope, references the planned item it started from, and retains a minimal session-start snapshot containing task title, classification, Plan Day/timezone, planned start, planned-item association and configured active duration. Retain only a parent-task reference when needed to interpret historical subtask context. This is not a complete task copy: notes, resource collections, subtask inventories, full ancestry and the complete session/break plan are excluded. Planned start and actual start are different facts. Focus starts only through explicit action, including early/late or prior-Plan-Day starts.

The session holds stable session identity, frozen starting planning context, actual start, configured active-focus target and an ending time/point with completed or ended-early outcome. Actual active duration, if retained on the session, is an explicitly derived/reconciled summary of Activity Evidence. The session does not independently own authoritative running/paused control state or duplicate detailed Pause/Resume boundaries: those belong to Focus Reservation and Activity Evidence respectively. Timer/display state remains a projection only.

Configured duration is the frozen active-focus target, not wall-clock elapsed time. Authoritative confirmed/reconciled active focus reaching that target completes the session automatically; End Session Early preserves target, derived actual active duration and factual ending outcome. Any later correction is traceable reconciliation, not an ordinary planning edit.

Session completion never completes the task or starts another session. Optional **Reflection** is a session component with self-reported rating and/or note after either ending outcome. Absence/Skip is valid and cannot block continued use; no rating scale is selected.

### Activity evidence and reconciliation

**Activity Evidence** is the authoritative historical evidence/timeline for session-associated active focus, pause, interruption and uncertain continuity intervals and boundaries, including detailed Pause/Resume boundaries. It does not independently own current control state. Retain observed start/end or an open boundary, classification, origin/context, relevant accepted-control reference and continuity certainty. Preserve reliable duration evidence separately from uncertain clock boundaries where needed; a timestamp difference alone is not proof of active focus.

| Evidence | Meaning for counting |
| --- | --- |
| Confirmed active focus | Counts toward configured active duration and factual task/day focus totals. |
| Explicit pause | Non-focus; boundaries determine pause duration without a 60-minute cap. Never consumes focus duration. |
| Interruption | Non-focus; preserve boundaries and logical episode association sufficient for later count/duration calculation. Do not equate every stored fragment with one interruption. |
| Uncertain continuity | Unresolved evidence, not silently focus or discarded time. Retain the last trustworthy boundary/context and reconciliation obligation. |

A **Reconciliation Decision** references one or more affected Activity Evidence items and records the confirmation/classification, relevant known boundaries, decision provenance and resulting counted facts. Each evidence item may have zero or more reconciliation decisions. A decision may address multiple evidence fragments, including overlap from former/current controllers. Confirmed continued work may count; otherwise interruption is recorded from the appropriate known point. Lack of keyboard/mouse input alone is not evidence of non-focus. Explicit pause cannot be reconciled into focus.

Finalized observations are append-only in principle. Open evidence may acquire its closing boundary; decisions/corrections preserve original observations and their links. Effective locally authoritative/reconciled facts in local-only mode and server-accepted canonical/reconciled facts in connected mode must avoid duplicate or overlapping focus credit without selecting the reconciliation arithmetic or interruption-count policy here.

A **Recorded Break** is actual deliberate rest associated with its planned break and surrounding task/session context. Preserve actual boundaries/duration separately from the planned duration. A preceding-session association is historical context, not a pause of that session. Breaks add no active focus, pause, interruption duration or interruption count, and their end never starts focus automatically. Optional break timing does not acquire a running/paused focus reservation. Detailed break-report attribution beyond the approved session Plan Day rule remains deferred.

### Historical versus mutable state

| State | Change boundary |
| --- | --- |
| Current title, note, resources, Plan Day/start, classification, parent and future session/break plan | Mutable planning; cannot rewrite session-start snapshots or recorded activity. |
| Explicit task completion/removal facts | Separate user planning decisions; never inferred from session outcomes. |
| Session ending and derived/reconciled summaries, current reservation and unfinished evidence boundaries | Evolve through valid lifecycle/authority decisions; current running/paused control belongs only to the reservation, historical boundaries to evidence. |
| Session-start context, finalized activity, outcomes and accepted control-change history | Preserved historical evidence; reconcile/correct with traceability where necessary. |
| Optional reflection, preferences and configuration | User-authored annotations/settings, separate from measured activity. |
| Cached state, totals and report projections | Replaceable derived outputs; not historical or connected authority. |

## 4. Focus authority and persistence

| Mode | Authoritative owner | Browser persistence role |
| --- | --- | --- |
| Local-only | IndexedDB within the applicable browser origin/profile | Authoritative plans/history and one serialized persisted running-or-paused reservation respected by cooperating tabs/reload. |
| Connected | Account-scoped server/PostgreSQL state | Account-isolated cache and locally persisted pending work/evidence; no independent global authority. |

A **Focus Reservation** is the single authoritative source of current running-or-paused control state. It identifies scope, reserved actual session, authoritative running/paused state, controlling context and accepted authority version/reference within the applicable local or connected authority boundary. At most one running-or-paused reservation exists per scope. Activity Evidence owns the historical timeline; Actual Focus Session owns identity, frozen starting context, actual start, target, ending/outcome and explicitly derived/reconciled summaries, not a second current authority. **Authority Change** evidence records accepted Start, confirmed transfer/takeover and relevant lifecycle/control changes, including prior/resulting control references, contexts and decision provenance. Ended-session references remain historically available even after the active reservation is released.

The version/reference is a logical stale-action discriminator, not a choice of counters, tokens, generations, leases or locking. Authority-changing actions refer to the accepted control they depend on; historical evidence carries origin/control context for reconciliation rather than claiming present ownership.

Pause retains reservation until Resume or End Session; Resume does not release exclusivity. Missing input, reload, tab lifetime and future inactivity mechanisms cannot automatically free running/paused ownership. Timer display is a projection of state and never establishes authority.

Connected new Start and confirmed takeover/transfer require server acceptance. Transfer concerns control of the reserved session, not automatic task completion or a new parallel session. It invalidates the former controller's authority-changing actions. Late history from that controller is preserved for appropriate reconciliation, even when stale control mutations are rejected. Observers mirror without creating duplicate activity/report records.

During disconnection, only the previously accepted controller may persist continuation/Resume evidence as pending or uncertain. This is not freshly accepted account authority. Another disconnected context cannot independently Start, take over or reacquire global control. Server authority prevents two accepted controllers, not simultaneous human activity or stale offline displays. Authentication expiry/logout versus ongoing focus remains later lifecycle work.

## 5. Pending evidence and non-destructive connection

Synchronization metadata is a component of records/pending work, not a mandated outbox or queue. Minimum logical information is record identity, owning/intended account scope, originating local scope/context, historical session/planned-item associations, applicable accepted-control reference, durable acceptance reference and local acknowledgement state. Ordinary pending plan edits also retain enough base accepted-state reference to distinguish a plan conflict from an evidence conflict, without selecting revision encoding.

Keep these dimensions separate:

| Dimension | Distinction |
| --- | --- |
| Local persistence | Unsaved/write failure versus durably local; failed writes are not reported as saved. |
| Account acceptance | Locally pending versus server-accepted canonical record. A server-accepted record may still be unacknowledged by its browser. |
| Browser acknowledgement | Appropriate durable acceptance known locally versus acknowledgement absent; absence preserves pending evidence. |
| Continuity certainty | Confirmed, uncertain or reconciled activity; acknowledgement alone does not confirm uncertain focus. Accepted records may retain unresolved evidence. |
| Account association | Account-free, unresolved explicit connection, or accepted association to a particular account. This is not focus authority. |

Explicit connection preserves both local and pre-existing account histories and their provenance. Matching titles or dates is not permission to merge identities or discard one history. Stable source/accepted record associations must support retrying without duplicate accepted history; no deduplication or conflict-resolution algorithm is selected. Neither plan nor evidence conflicts permit silent whole-history last-write-wins replacement.

An active local session retains its identity, evidence and unresolved intended account association until an appropriate accepted association is established. Existing local/account reservation references remain distinguishable. The model does not automatically map local control into account authority or silently create two account reservations; the execution behavior for connecting an active local session is deferred.

Only appropriately accepted/acknowledged pending evidence can be cleared as synchronized. This does not authorize deleting canonical history. Connected browser caches and pending work are permanently associated with their intended account while retained; switching accounts cannot relabel or upload the previous account's records into the next account. V1 data remains separate with no automatic migration.

## 6. Exposure, reporting and user data lifecycle

Optional **Domain Configuration** contains user-configured distracting domains and enablement/notice-permission context; suggestions are unenforced before opt-in. A minimal **Exposure Record** retains the configured domain at observation, exposure start/end/duration and related actual focus session. Later domain removal cannot silently change the observed domain. Uncertain exposure continuity stays distinguishable from confirmed exposure without adding browsing content.

Exposure is separate from interruption, pause, planned break and active focus; it may coexist with other facts and is not added to focus as a disjoint time category. A blocking-rule match proves neither duration nor lost focus. No page content, full browsing history, unrelated domains or page URLs enter exposure records. Task web URLs belong only to the resource concept. The extension is a later, optional milestone and owns neither authentication nor focus authority.

Daily/task reports derive from locally authoritative/reconciled facts in local-only mode and server-accepted canonical/reconciled facts in connected mode. Local authority does not imply server acceptance. Preserve inputs for planned focus, actual active focus, pause duration, interruption episodes/duration, completed/early-ended session counts, recorded breaks and enabled exposure, grouped by stable task and frozen session Plan Day. Pending/unresolved work remains distinguishable from canonical totals. Wall-clock elapsed time is not active focus; breaks never increase interruption counts. Cached aggregates can be rebuilt.

Account **Report Preferences** record opt-in cadence (daily/weekly/monthly) and channel choices (email and/or notifications). A **Report Delivery Occurrence** retains account, report period/channel association, preference relevance, attempt/outcome references and failure state sufficient for durable retries and duplicate suppression. No delivery scheduler/provider or retry protocol is chosen. Delivery checks current preference/deletion state. Annual recap is eligible only after calendar-year completion; exact calendar scheduling is deferred. Ratings are self-report; no medical/psychological inference or undefined peak/weak metric is introduced.

Export must traverse account productivity plans/activity and their necessary ownership, attribution and historical relationships so the output is usable outside the product. Preserve distinctions between plan, actual activity, uncertainty and accepted facts. Exact export formats are deferred.

Conceptual deletion scope identifies canonical records, local cache/pending copies and in-product derived data, including stored report projections and in-product delivery state where applicable. Deleted productivity data must not return through later synchronization. External delivery, already-delivered reports, backup retention and deletion execution mechanics remain deferred; no recall or deletion promise is made for external copies. Ordinary task removal is not this deletion lifecycle. Connected history is retained until user deletion/account closure subject to later operational/legal constraints; no retention schedule is invented.

Account ownership permits authorized personal access, not default administrator access to task content, notes or productivity history. Administrative visibility stays narrow under FR-ADMIN-001 and the architecture.

## 7. Traceability and review scenarios

FR/AC identifiers link to the [PRD requirements and acceptance criteria](../product/v2-prd.md); OD identifiers link to the [owner decision register](../product/owner-decisions.md). ADR references below link to the approved authority/persistence decisions.

| Model decision | Requirements | Acceptance criteria | Approved decisions |
| --- | --- | --- | --- |
| Stable task, Primary cap, hierarchy, history-safe edits/removal/splits | FR-TASK-001/004/006 | AC-001/016/023 | OD-003/006/007/019/023; [ADR-003](../architecture/adr/003-persistence.md) |
| Required metadata, distinct starts, independent planned items and derived total | FR-TASK-002/003, FR-SESSION-001 | AC-002/012 | OD-002/025; [ADR-003](../architecture/adr/003-persistence.md) |
| Calendar intent and frozen historical attribution | FR-TASK-005, FR-SESSION-005 | AC-017 | OD-004/005/017; [ADR-003](../architecture/adr/003-persistence.md) |
| Optional labeled web resources | FR-RESOURCE-001 | AC-004 | OD-021/024 |
| Session lifecycle, pauses, outcomes, reflection and separate breaks | FR-SESSION-002/003/006/007, FR-TASK-006 | AC-007/013/014/021/023/024 | OD-001/019/025/026; [ADR-006](../architecture/adr/006-focus-session-authority.md) |
| Evidence and traceable continuity reconciliation | FR-SESSION-004, FR-ACTIVITY-001 | AC-007/015 | OD-019/022; [ADR-003](../architecture/adr/003-persistence.md), [ADR-006](../architecture/adr/006-focus-session-authority.md) |
| Account-free ownership versus optional identity/access | FR-LOCAL-001, FR-AUTH-001 | AC-005/006/011 | OD-008/011; [ADR-003](../architecture/adr/003-persistence.md), [ADR-004](../architecture/adr/004-authentication.md) |
| One reservation, explicit controller and confirmed transfer | FR-FOCUS-001/002 | AC-003/013 | OD-001/018; [ADR-004](../architecture/adr/004-authentication.md), [ADR-006](../architecture/adr/006-focus-session-authority.md) |
| Non-destructive connection, pending/acknowledged data and account isolation | FR-LOCAL-001, FR-PERSIST-001, FR-FOCUS-001/002 | AC-005/006 plus architecture failure scenarios | OD-008/009/015/018; [ADR-003](../architecture/adr/003-persistence.md), [ADR-005](../architecture/adr/005-local-cloud-sync.md), [ADR-006](../architecture/adr/006-focus-session-authority.md) |
| Factual reports, optional delivery and minimum exposure | FR-ANALYTICS-001/002, FR-ACTIVITY-001, FR-EXT-002/003 | AC-007/019/020/024 | OD-014/020/022/024; architecture §§12–13 |
| Export/deletion, long-term history and narrow access | FR-DATA-001, FR-PERSIST-001, FR-ADMIN-001 | AC-006/009/018 | OD-010/015/016; [ADR-003](../architecture/adr/003-persistence.md), [ADR-004](../architecture/adr/004-authentication.md), [ADR-005](../architecture/adr/005-local-cloud-sync.md) |

The following are design-review scenarios for later implementation, not executable tests or claims of runtime validation:

| Scenario | Model acceptance check |
| --- | --- |
| Plan 25/25/40 minutes, then reorder/remove/edit an item | Count/total follow current items; existing actual associations/snapshots remain unchanged. |
| Promote/demote, rename, reschedule, split or remove after activity | No fourth simultaneous Primary; task/session identity, starting context and historical totals survive. |
| Explicit early/late Start; complete all planned sessions | Actual start differs from intent; task stays open until explicit completion. |
| 20 active minutes, 5 paused, 3 reconciled interruption minutes; separate break | Report 20 focus, 5 pause, 3 interruption; break remains separate and adds no interruption count. |
| Pause over 60 minutes, reload, Resume, then End Session Early | Reservation persists, full pause is retained, early outcome and actual/configured duration remain distinct. |
| Cross midnight, continue prior-day work, then change timezone | Starting Plan Day/timezone attribution remains; current viewer timezone cannot rewrite history. |
| Sleep/clock discontinuity/no input and later reconciliation | Uncertainty is retained; no-input reading is not automatically interruption; explicit pause never becomes focus. |
| Competing contexts, observer, confirmed takeover and late old-controller evidence | One accepted reservation; no observer duplication; stale control rejected, history retained for reconciliation. |
| Offline accepted controller resumes; another offline context requests Start | Pending evidence remains distinguishable; no new independent account authority. |
| Connection interrupted after server acceptance but before acknowledgement | Both histories survive; source association supports retry without duplicate credit; evidence remains locally unacknowledged. |
| Connect with local/account active reservations; switch accounts | Association remains explicit/unresolved as needed; no implicit parallel authority or cross-account pending upload. |
| Track exposure, remove configured domain, then review reports | Minimal observed domain/session facts survive without browsing content or inferred interruption. |
| Export/delete while pending data and scheduled reports exist | Relationships are exportable; canonical, local cache/pending and in-product derived data are identified within deletion scope without revival. Delivery checks current deletion/preferences; external copies and execution mechanics remain deferred. |

## 8. Deferred details

No unresolved structural choices remain after the owner selections in §1. Unspecified policy remains unspecified: hierarchy depth, rating scale, duration limits, interruption-count boundaries, future-plan timezone adjustment, break-report attribution, active-session connection behavior and authentication-expiry/logout lifecycle. These are not invitations to invent defaults.

Physical schemas/types/indexes/constraints, Django fields/migrations, identifiers such as UUIDs/database keys and their encoding/storage representation, APIs/serializers, authentication libraries/cookies, locking/generation algorithms, browser coordination primitives, sync transport/merge/deduplication/outbox technology, reconciliation arithmetic/thresholds, extension implementation/permissions, external delivery/already-delivered reports, delivery scheduling, export formats, deletion execution/backup retention, deployment, CI/CD and UI layout remain later work. This model authorizes none of those mechanisms.
