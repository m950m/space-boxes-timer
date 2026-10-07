# Owner product decision register

Product policy consolidated from V2-002B and V2-002C, 2026-10-07. **OWNER APPROVED** records explicit supplied decisions, superseding conflicting V2-002 draft options. OD-001–OD-027 are **OWNER APPROVED** at their recorded scope. **CONFIRMED** earlier direction and **INHERITED V1 BEHAVIOR** remain distinct from owner approvals. IDs reference [v2-prd.md](v2-prd.md). Later affected areas identify dependencies only; they select no architecture.

Approved policy does not manufacture answers for unspecified details. Any broader product choice still requires owner input. Remote GitHub settings and historical baseline claims remain **UNVERIFIED** from committed evidence; no repository re-audit is performed here.

## OD-001 — Pause and focus reservation

**Decision question:** Does pause stop focus while retaining ownership?

**Current status:** OWNER APPROVED.

**Why it matters:** Preserves honest timing and deliberate continuation without allowing parallel focus. **INHERITED V1 BEHAVIOR:** The baseline paused lock is lost on reload; that limitation is superseded by this policy.

**Approved decision:** Pause is supported. Active focus accumulation stops and the same task retains the authoritative reservation across contexts; another task cannot become authoritative. The session remains paused until Resume or End Session. Record pause boundaries for later duration calculation with no 60-minute cap. Configured session duration means active focus time; pause does not consume it. A live pause timer may eventually be displayed.

**Remaining detail:** Blocking behavior while paused and exact pause presentation are not specified.

**Requirements blocked or affected:** FR-FOCUS-001, FR-SESSION-002, FR-ACTIVITY-001; AC-003, AC-013.

**Architecture areas affected later:** Session states, ownership continuity, timing, recovery.

## OD-002 — Scheduled start semantics

**Decision question:** Does a planned start automatically begin focus?

**Current status:** OWNER APPROVED.

**Why it matters:** Treats scheduling as intention while preserving user control.

**Approved decision:** Never automatically start a focus session at planned time. The task may become ready and the product may remind the user. Actual focus requires explicit user action; early and late starts are allowed. Keep planned_start conceptually distinct from actual_start.

**Remaining detail:** Notification infrastructure, exact readiness/reminder interaction, and overlapping-plan presentation are not chosen.

**Requirements blocked or affected:** FR-TASK-002, FR-VISUAL-002; AC-002.

**Architecture areas affected later:** Scheduling, time interpretation, reminders, initiation.

## OD-003 — Unfinished tasks

**Decision question:** What happens to unfinished work after its Plan Day?

**Current status:** OWNER APPROVED.

**Why it matters:** Preserves intent/history without silently changing the plan.

**Approved decision:** Keep unfinished tasks recorded against their original Plan Day; do not automatically roll them forward. The product may remind the user next day. Users may explicitly reschedule, replan, or split work.

**Remaining detail:** Exact reminder interaction is not specified; no total-task cap applies; the three-Primary maximum follows OD-023.

**Requirements blocked or affected:** FR-TASK-004, FR-ANALYTICS-001; AC-016.

**Architecture areas affected later:** Plan lifecycle, historical attribution, reminders.

## OD-004 — Plan Day definition

**Decision question:** What defines a Plan Day?

**Current status:** OWNER APPROVED.

**Why it matters:** Provides an understandable planning boundary while preserving flexible work.

**Approved decision:** Plan Day is the local calendar day in the user's active/system timezone. A Plan Day permits zero to three Primary tasks, plus Extra tasks/subtasks without a total-task cap (OD-023). Use timezone information, not precise GPS/location. Session attribution follows OD-017.

**Remaining detail:** Timestamp/storage representation is not chosen.

**Requirements blocked or affected:** FR-TASK-001, FR-TASK-005, FR-ANALYTICS-001; AC-017.

**Architecture areas affected later:** Time interpretation, planning boundaries, reporting.

## OD-005 — Timezone changes

**Decision question:** How do timezone changes affect plans and history?

**Current status:** OWNER APPROVED.

**Why it matters:** Accommodates travel without rewriting historical attribution.

**Approved decision:** Use the user's active/system timezone and local calendar day, with unobtrusive notice when timezone changes. Continue normal operation; optionally suggest adjusting future planned tasks. Historical activity must not silently move to another Plan Day after a timezone change. Precise GPS is not required.

**Remaining detail:** Exact future-plan adjustment interaction and differing active timezones across devices are unspecified; no timestamp representation is selected.

**Requirements blocked or affected:** FR-TASK-002, FR-TASK-005, FR-PERSIST-001; AC-017.

**Architecture areas affected later:** Time interpretation, plan changes, historical attribution.

## OD-006 — Task removal and historical activity

**Decision question:** Can the user remove or cancel tasks without losing history?

**Current status:** OWNER APPROVED.

**Why it matters:** Allows plan correction without rewriting work that occurred; a fourth task is not rejected merely because three exist.

**Approved decision:** Users control their own plan: edit, reschedule, remove/cancel, create extra tasks/subtasks, and split work across the day. Ordinary plan editing must not erase focus activity already recorded. User-data/account deletion is separately governed by OD-016.

**Remaining detail:** Archive presentation and database deletion mechanics are not defined. There is no total-task cap; the three-Primary maximum follows OD-023.

**Requirements blocked or affected:** FR-TASK-001, FR-TASK-004, FR-ACTIVITY-001; AC-001, AC-016.

**Architecture areas affected later:** Task lifecycle, history, user data controls.

## OD-007 — Moving and editing plans

**Decision question:** May users edit, reschedule, and split their work?

**Current status:** OWNER APPROVED.

**Why it matters:** Planning follows the user's needs without erasing actual work.

**Approved decision:** Permit task editing, rescheduling, removal/cancellation, extra tasks, subtasks, and splitting/distribution across the day. Preserve historical focus activity through ordinary plan changes.

**Remaining detail:** Exact interactions for changing a plan during an open session and conflicting edits remain unspecified; the three-Primary maximum still applies.

**Requirements blocked or affected:** FR-TASK-001–005, FR-ACTIVITY-001; AC-016.

**Architecture areas affected later:** Plan changes, historical identity, concurrent editing.

## OD-008 — Local-first use and optional account

**Decision question:** Must the user register before core use?

**Current status:** OWNER APPROVED.

**Why it matters:** Removes entry friction while offering optional connected continuity. This does not decide v1 migration.

**Approved decision:** No account is required to open the product, plan tasks, or run focus sessions locally. Optional accounts enable persistent cloud-associated history, cross-device continuity, long-term reports, synchronization, recovery, and optional report delivery. Connecting local data is explicit, simple, understandable, and non-destructive; never silently overwrite local or account history.

**Remaining detail:** Exact local/account conflict interaction and local persistence guarantees are unspecified. OD-009 keeps v1 data separate in first v2.

**Requirements blocked or affected:** FR-LOCAL-001, FR-AUTH-001, FR-PERSIST-001; AC-005, AC-006, AC-011.

**Architecture areas affected later:** Local entry, identity association, connection, continuity.

## OD-009 — Existing v1 data

**Decision question:** Must first v2 migrate historical v1 localStorage data?

**Current status:** OWNER APPROVED.

**Why it matters:** Separates account connection from legacy import policy.

**Approved decision:** First v2 does not build or require automatic migration of historical v1 localStorage data. V1 remains separate from first-v2 data; later user-initiated import/history migration may be designed separately (OD-009).

**Remaining detail:** Later import scope/mapping may be designed separately; it does not block first v2.

**Requirements blocked or affected:** FR-PERSIST-001, FR-LOCAL-001, FR-TASK-003, FR-ANALYTICS-001.

**Architecture areas affected later:** Data separation, any separately approved future import.

## OD-010 — Initial administration scope

**Decision question:** What initial account/site authority is approved?

**Current status:** OWNER APPROVED.

**Why it matters:** Provides operational support with bounded private-data access.

**Approved decision:** Initial administration is narrow: account-status/support operations, application/site operational configuration, and necessary support actions. Administrators do not receive default unrestricted access to task content, private notes, or personal productivity/activity history. Broader support visibility requires a later explicit decision.

**Remaining detail:** Exact actions/roles and review procedures remain unspecified; this does not authorize broader visibility.

**Requirements blocked or affected:** FR-ADMIN-001, FR-AUTH-001, FR-ACTIVITY-001; AC-009.

**Architecture areas affected later:** Administrative authority, support, private-data boundaries.

## OD-011 — Account recovery and security policy

**Decision question:** What recovery and verification policy applies to cloud accounts?

**Current status:** OWNER APPROVED.

**Why it matters:** Supports recovery while protecting sensitive account actions without adding friction to ordinary work.

**Approved decision:** Email is a verified recovery channel. Account/password recovery may use a secure temporary email code or link; credentials are temporary and single-use, and repeated attempts must be rate-limited. Sensitive actions may require re-authentication. Do not require repeated email verification for ordinary editing or normal cross-device use. Optional passkeys/MFA may remain later enhancements.

**Remaining detail:** Exact registration verification timing, expiry/rate limits, and authentication framework, credential/session mechanism, or identity provider are not chosen.

**Requirements blocked or affected:** FR-AUTH-001, FR-PERSIST-001; AC-005, AC-006.

**Architecture areas affected later:** Recovery, verification, sensitive actions.

## OD-012 — First extension browser

**Decision question:** Which browser family is targeted first?

**Current status:** OWNER APPROVED.

**Why it matters:** Establishes the first browser-family scope without choosing extension technology.

**Approved decision:** Target Chromium-based browsers first.

**Remaining detail:** Exact supported browser/version matrix and extension APIs remain unspecified. The extension follows core public v2 in a later milestone (OD-020).

**Requirements blocked or affected:** FR-EXT-001–003; AC-008.

**Architecture areas affected later:** Browser compatibility, distribution, validation.

## OD-013 — Optional distraction blocking

**Decision question:** Can core focus continue without working blocking?

**Current status:** OWNER APPROVED.

**Why it matters:** Preserves focus tracking independent of extension availability.

**Approved decision:** Blocking is opt-in and a productivity aid. Core task/focus use continues when extension is absent, disabled, or blocking is unavailable. Make it understandable whether blocking is currently active.

**Remaining detail:** Exact availability/status presentation and controlled exception mechanics are unspecified.

**Requirements blocked or affected:** FR-EXT-001, FR-FOCUS-001; AC-008.

**Architecture areas affected later:** Capability availability, session continuity, status communication.

## OD-014 — Distraction exposure privacy

**Decision question:** Which distraction data may be recorded?

**Current status:** OWNER APPROVED.

**Why it matters:** Allows bounded personal awareness without authorizing general browsing collection.

**Approved decision:** Do not collect general browsing history. With explicit tracking/blocking enablement and appropriate notice/permission, record only minimum approved exposure information for user-configured distracting domains: domain, exposure start/end, exposure duration, and related focus session. Do not collect page content, unrelated browsing, or silent surveillance.

**Remaining detail:** Technical browser permissions, data destination, and collection implementation are not designed here.

**Requirements blocked or affected:** FR-EXT-003, FR-ACTIVITY-001, FR-ANALYTICS-001; AC-019.

**Architecture areas affected later:** Collection boundaries, notice, permissions, exposure records.

## OD-015 — Long-term retention

**Decision question:** How long does connected productivity history remain available?

**Current status:** OWNER APPROVED.

**Why it matters:** Makes long-term history an intentional product capability.

**Approved decision:** Connected-account productivity history supports months/years of personal review and is retained until the user deletes it or closes the account, subject to later operational/legal constraints.

**Remaining detail:** No backup-retention period or operational/legal exception schedule is invented.

**Requirements blocked or affected:** FR-PERSIST-001, FR-ACTIVITY-001, FR-ANALYTICS-001; AC-006.

**Architecture areas affected later:** History lifecycle, retention, closure.

## OD-016 — Export and deletion

**Decision question:** Which account data controls are required?

**Current status:** OWNER APPROVED.

**Why it matters:** Provides personal control over retained history separately from ordinary task edits.

**Approved decision:** Account users require export of productivity/activity data usable outside Space Boxes, machine-readable in principle, understandable data deletion controls, and account deletion.

**Remaining detail:** Exact export format is not locked; CSV/JSON may be evaluated later. Deletion mechanics, completion timing, and backup handling are not chosen.

**Requirements blocked or affected:** FR-DATA-001, FR-PERSIST-001; AC-018.

**Architecture areas affected later:** Export, data deletion, account closure.

## OD-017 — Crossing midnight

**Decision question:** Which Plan Day receives sessions across midnight?

**Current status:** OWNER APPROVED.

**Why it matters:** Keeps intentional plan attribution distinct from wall-clock calendar boundaries.

**Approved decision:** Attribute each session to the Plan Day under which it began; midnight does not automatically move it to the next day. Users starting late may explicitly continue further sessions belonging to the previous Plan Day after midnight. Make attribution understandable in the eventual UI.

**Remaining detail:** No storage representation or detailed attribution interface is selected.

**Requirements blocked or affected:** FR-TASK-005, FR-SESSION-005, FR-ANALYTICS-001; AC-017.

**Architecture areas affected later:** Session attribution, continuity, reporting.

## OD-018 — Multi-tab and multi-device authority

**Decision question:** Who controls a session across contexts?

**Current status:** OWNER APPROVED.

**Why it matters:** Allows continuity while protecting the single-session invariant and recorded totals.

**Approved decision:** Only one authoritative focus session exists per user. The tab/device explicitly starting it owns it; other signed-in contexts may observe/mirror/show timer/status without duplicate time/report entries or parallel authority. Moving control offers an explicit simple takeover/transfer confirmation. Never infer ownership from mouse/keyboard activity. Ordinary edits on another device do not require email confirmation; sensitive actions remain protected. Future observer access would use separate permissioned read-only access rather than shared credentials; parent/observer mode is not first-v2 core scope.

**Remaining detail:** Exact simultaneous-start arbitration, concurrent plan-edit resolution, synchronization timing, and takeover mechanics remain unspecified.

**Requirements blocked or affected:** FR-FOCUS-001/002, FR-PERSIST-001, FR-AUTH-001; AC-003, AC-006.

**Architecture areas affected later:** Session ownership, observation, transfer, record integrity.

## OD-019 — Idle, interruption, and recovery

**Decision question:** How is uncertain continuity reconciled?

**Current status:** OWNER APPROVED.

**Why it matters:** Preserves honest timing without treating inactive input as a measurement of cognition.

**Approved decision:** Only confirmed active focus counts. Lack of input does not prove lack of focus: reading, course/video viewing, thinking, and task-related offline work may be valid focus. If trustworthy continuity is lost due to idle state, sleep, disconnect, or unexpected closure, mark uncertain time for reconciliation rather than automatically counting/discarding it. On return the product may ask whether work continued: confirmed work may count; otherwise record interruption from the appropriate known point. Explicit pause is authoritative and never focus. Configured active duration auto-completes the session; End Session Early retains planned/actual active duration, ending time/point, and ended-early outcome with factual non-punitive wording.

Task completion is an explicit user decision, separate from session completion. Elapsed focus time or completing all planned sessions must not silently complete a task. The product may prompt Mark task complete or Keep task open; exact wording is not locked. Session end never auto-starts another session.

**Remaining detail:** Continuity thresholds, interruption counting boundaries, known-point determination, and idle-detection APIs are not selected.

**Requirements blocked or affected:** FR-SESSION-003/004, FR-TASK-006, FR-ACTIVITY-001, FR-ANALYTICS-001; AC-007, AC-014, AC-015, AC-023.

**Architecture areas affected later:** Timing, reconciliation, lifecycle outcomes, reporting integrity.

## OD-020 — Extension release timing

**Decision question:** Must extension delivery block first public v2?

**Current status:** OWNER APPROVED.

**Why it matters:** Separates capability from release sequencing.

**Approved decision:** Core public v2 releases first; the approved browser extension follows in a later milestone (OD-020). Simultaneous extension delivery is not required. Later architecture must preserve an appropriate future integration boundary; this document does not design it.

**Remaining detail:** Exact milestone date and integration design remain unspecified; release order is decided.

**Requirements blocked or affected:** FR-EXT-001–003, FR-RELEASE-001; AC-008.

**Architecture areas affected later:** Future integration boundary, delivery sequencing, release acceptance.

## OD-021 — First-v2 task resources

**Decision question:** Which resource forms are supported?

**Current status:** OWNER APPROVED.

**Why it matters:** Provides task-related access with bounded first-release scope.

**Approved decision:** First v2 supports web URLs with optional user-readable label and direct-open action. Do not add file uploads or invent a hard resource-count limit. Necessary-resource exceptions follow OD-024.

**Remaining detail:** Exact opening destination, label interaction, and URL validation behavior remain unspecified.

**Requirements blocked or affected:** FR-RESOURCE-001, FR-EXT-003; AC-004.

**Architecture areas affected later:** Resource interaction, validation, direct access.

## OD-022 — Reports and analytics

**Decision question:** Which reports, measures, and delivery directions are approved?

**Current status:** OWNER APPROVED.

**Why it matters:** Supports factual personal review without punitive or medical interpretations.

**Approved decision:** Provide in-app reports with active focus duration, planned break duration where recorded, pause duration, interruption count/duration, sessions completed/ended early, task focus totals, daily focus total, and configured distracting-site exposure when enabled. Distinguish planned duration, active focus, planned breaks where recorded, pause, interruption, exposure, and completed/early-ended outcomes; planned breaks never increase interruption counts; wall-clock duration is not equal to focus when breaks, pauses, or interruptions exist. Peak/weak periods may be calculated once definitions become testable. Describe behavioral patterns only; do not infer or diagnose ADHD, psychiatric/cognitive disorders, or medical conditions. Users may opt into daily/weekly/monthly delivery by email and/or notifications; annual recap may be generated after calendar-year completion.

**Remaining detail:** Peak/weak definitions, interruption-count boundaries, summary freshness/empty-day presentation, and exact delivery scheduling are unspecified. Base approved metrics are not deferred as deeper analytics.

**Requirements blocked or affected:** FR-ACTIVITY-001, FR-ANALYTICS-001/002; AC-007, AC-020, AC-024.

**Architecture areas affected later:** Aggregation, attribution, reports, optional delivery.

## OD-023 — Visual and state representation

**Decision question:** What visual direction represents tasks and focus?

**Current status:** OWNER APPROVED.

**Why it matters:** Preserves the focus metaphor without a hard task limit. Accessibility target is separately OD-027.

**Approved decision:** Permit zero to three Primary focus tasks per Plan Day, plus Extra tasks and subtasks without a total-task cap. Allow promotion/demotion subject to at most three simultaneous Primary tasks, preserving historical focus activity. Any task or subtask may become the authoritative active focus task. Use an original cartoon/cinematic person/head with the central three-box Primary metaphor and Extra tasks/subtasks outside it. Explicitly starting Primary focus visibly opens/releases its box. Extra tasks/subtasks receive a clear active-focus representation when focused without creating a fourth Primary head box; exact treatment remains later design. State never relies on color alone.

**Remaining detail:** Exact artwork requires later owner visual approval; layout, motion, and representations of additional/non-active states are not designed here.

**Requirements blocked or affected:** FR-VISUAL-001/002, FR-TASK-001; AC-001, AC-010.

**Architecture areas affected later:** Visual state representation, artwork, interaction.

## OD-024 — Distracting domains and resource exceptions

**Decision question:** How do domain configuration and necessary resources interact?

**Current status:** OWNER APPROVED.

**Why it matters:** Balances deliberate work access with awareness of configured distractions.

**Approved decision:** Provide suggested/common social-media domains as an editable initial configuration. Users add/remove domains or disable blocking; suggestions are not enforced until blocking is enabled. Conceptual matching covers registered domain/site and relevant subdomains. For necessary resources on distracting domains, do not silently block work: give clear warning/friction, permit a controlled exception, and visibly track exposure. Deliberate exception access shows clear warning, obvious exposure timer, and prolonged-exposure cues beyond color alone, without shame/medical interpretation.

**Remaining detail:** Exact common-domain list, exception duration/controls, and matching APIs are unspecified. Tracking remains bounded by OD-014 notice/permission.

**Requirements blocked or affected:** FR-EXT-002/003, FR-RESOURCE-001; AC-004, AC-008, AC-019.

**Architecture areas affected later:** Domain policy, configuration, exceptions, exposure display.

## OD-025 — Core task metadata

**Decision question:** Which planning fields and session controls are first-v2 requirements?

**Current status:** OWNER APPROVED.

**Why it matters:** Provides explicit planning without importing redundant v1 metadata or prescribing one work method.

**Approved decision:** Require title, Plan Day, planned start time, and a session plan containing count and each planned active focus duration. The session plan is the planning source of truth: task planned focus duration equals the sum of those durations (25 + 25 + 40 = 90 minutes). Durations may differ; changes to count/duration update the total without two independently editable conflicting totals. Resources, subtasks, and short note are optional. Do not retain v1 estimatedDuration as a separate required concept. Priority dropdown and category/tag are not first-release requirements. The product may suggest Pomodoro-inspired focus/break divisions as guidance only; users control session count, each duration, and the final session/break plan. A planned break is deliberate rest between sessions, separate from active focus, pause within the preceding session, and interruption. It counts as none of those and never increases interruption counts or automatically starts the next session. An optional break timer may be offered; the next focus session requires explicit user action. Do not claim universal superiority.

**Remaining detail:** Exact break lengths, validation limits, and UI remain unspecified; the task-duration sum rule is approved without implementation design.

**Requirements blocked or affected:** FR-TASK-003, FR-SESSION-001/007; AC-002, AC-012, AC-024.

**Architecture areas affected later:** Planning data, session guidance, user controls.

## OD-026 — Optional session reflection

**Decision question:** May reflection be offered after a session?

**Current status:** OWNER APPROVED.

**Why it matters:** Offers personal reflection without adding a mandatory exit step.

**Approved decision:** After completed or early-ended sessions, the product may offer optional focus rating (for example 1–5) and short note/reflection with clear Skip. Reflection must never block continued normal use. Rating is user self-report, not objective attention/cognition measurement.

**Remaining detail:** Exact scale and interface are not locked; offering reflection is optional.

**Requirements blocked or affected:** FR-SESSION-006; AC-021.

**Architecture areas affected later:** Reflection interaction, self-report presentation.

## OD-027 — Accessibility target

**Decision question:** Which web accessibility target and essential outcomes apply?

**Current status:** OWNER APPROVED.

**Why it matters:** Separates accessibility obligations from exact artwork approval in OD-023.

**Approved decision:** Target WCAG 2.2 AA for the web experience. Essential actions must be keyboard-operable, focus visible, states conveyed beyond color, reduced-motion presentation equivalent, and screen-reader labels/states understandable for essential task/session interactions. Do not claim validated conformance/certification before later testing.

**Remaining detail:** Later validation is required; no testing evidence or certification is asserted here.

**Requirements blocked or affected:** FR-A11Y-001, FR-VISUAL-002; AC-022.

**Architecture areas affected later:** Accessible interactions, state communication, validation.
