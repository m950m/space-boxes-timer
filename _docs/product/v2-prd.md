# Space Boxes Timer v2 product requirements

Product policy consolidated from V2-002B and V2-002C owner approvals, 2026-10-07. No implementation or architecture is authorized by this document.

## Evidence and status

- **CONFIRMED:** Earlier owner direction that remains applicable, or repository facts identified as facts about v1. Repository facts alone do not confirm a v2 rule.
- **OWNER APPROVED:** Explicit product decisions supplied in V2-002B and V2-002C; these supersede conflicting draft language.
- **INHERITED V1 BEHAVIOR:** Baseline behavior that has not independently been accepted as a v2 rule.
- **OWNER DECISION REQUIRED:** Unresolved policy; neutral options in [owner-decisions.md](owner-decisions.md) do not select an answer.

Earlier V2-002 sources: [v1 baseline](../baseline/v1-baseline.md), [known gaps](../baseline/known-gaps.md), [PROJECT_SPEC.md](../../PROJECT_SPEC.md), [README.md](../../README.md), and [AGENT_RULES.md](../../AGENT_RULES.md). V2-002B read the two product documents and AGENT_RULES.md; V2-002C reads only the two product documents; it does not re-audit those sources. Baseline historical claims and remote GitHub settings remain **UNVERIFIED** from committed evidence.

## 1. Product definition

**OWNER APPROVED:** Space Boxes Timer v2 supports local-first individual task planning and focus without a registration wall. It recommends three Primary focus tasks per Plan Day, permitting zero to three Primary tasks, represented by three visually central boxes in an original cartoon/cinematic person/head. Additional tasks and subtasks are permitted. Starting Primary focus visibly opens/releases its box; focused Extra tasks/subtasks receive a clear representation without a fourth Primary head box. One authoritative focus session exists per user at a time. Web resources, configurable session plans, and factual activity reports support the user's work. An optional connected account enables persistent cloud-associated history and cross-device continuity. Opt-in extension blocking is a planned productivity aid; it follows core public v2 in a later milestone (OD-020).

## 2. Product problem

**CONFIRMED:** The intended product supports deliberate planning, sustained focus, and useful self-review. The recorded v1 baseline lacks accounts, planned start times, account-associated persistence, administration, and extension integration. These are capability differences, not market validation or measured user outcomes. **OWNER APPROVED:** Three primary tasks provide guidance without restricting the user's total work; local entry removes the registration barrier while optional accounts provide longer-term continuity.

## 3. Target user and primary use case

**OWNER APPROVED:** An individual plans primary and additional tasks, chooses planned starts and session plans, explicitly starts focus, accesses web resources, and reviews activity. Local use does not require an account. **INHERITED V1 BEHAVIOR:** Technical learning, graduate study, and independent inquiry are the earlier documented audience, not an exclusive v2 audience decision. No demographic assumptions are made.

## 4. Product goals

**OWNER APPROVED:** Recommend three primary focus tasks while supporting flexible planning; distinguish planned and actual starts; preserve one authoritative session including pause; count active focus honestly; provide optional account continuity and long-term personal history; make web resources directly usable; provide useful factual reports; express focus through the original head/person metaphor; and provide narrow administration. **CONFIRMED:** Public deployment remains intended. Core public v2 releases first; the approved browser extension follows in a later milestone (OD-020).

## 5. Explicit non-goals for the first v2 release

**OWNER APPROVED:** Category/tag and a priority dropdown are not first-release requirements. V1 estimatedDuration is not a separate required concept alongside planned focus duration/session planning. Task resources are web URLs; file uploads are excluded. Parent/observer mode is outside first-v2 core scope; any future observer access would require separate permissioned read-only access rather than shared credentials. Optional passkeys/MFA may remain later enhancements. **CONFIRMED:** Deeper analytics are a later evolution and domain/name selection is separate. This does not defer the report metrics approved in OD-022. Core public v2 releases first; the approved browser extension follows in a later milestone (OD-020).

## 6. Relationship between v1 and v2

**CONFIRMED repository facts from the baseline:** V1 is browser-local, has no accounts/backend/extension, and uses the space-container/Energy Core presentation. Existing documentation remains a record of v1.

**INHERITED V1 BEHAVIOR:** V1 categories, priorities, estimates, lifecycle states, interval counting, calendar calculations, automatic elapsed-time recovery, and archive/delete mechanics are not automatically v2 requirements. V1 pause/resume, notes, and ratings are reference behaviors; the approved v2 policies below define their new scope. The v1 paused lock disappears on reload and the running invariant is per page instance; v2 instead requires authoritative reservation across contexts and reconciliation of uncertain time. First v2 does not build or require automatic migration of historical v1 localStorage data. V1 remains separate from first-v2 data; later user-initiated import/history migration may be designed separately (OD-009).

## 7. Core product principles

**OWNER APPROVED:** User-controlled plans, optional accounts, one authoritative session, factual and non-punitive reporting, explicit consent for bounded distraction tracking, and accessible state communication. Lack of mouse/keyboard input does not prove lack of focus. **CONFIRMED:** AI-assisted engineering and DevOps support delivery; agents must not choose open owner policy.

## 8. Primary user journeys

| Journey | Product outcome | Remaining dependency |
| --- | --- | --- |
| Enter locally | Open the product, plan tasks, and run focus without registration. | V1 remains separate; no automatic migration in first v2 (OD-009). |
| Connect an account | Explicitly and understandably connect local work without overwriting local/account history; use recovery and cross-device continuity. | Exact conflict interaction remains unspecified. |
| Plan day | Choose zero to three Primary tasks, add extra tasks/subtasks, supply required planning data, edit/reschedule/remove/split work. | Exact planning interface remains unspecified. |
| Start and manage focus | Explicitly start early/on time/late; pause retains reservation; Resume or End Session leaves pause; active duration completes automatically or the user ends early. | Uncertain continuity is reconciled under OD-019. |
| Use resources | Directly open labeled web URLs; necessary resources on distracting domains permit a controlled exception with warning and exposure display. | Exact exception interaction remains unspecified. |
| Review work | View in-app daily and task totals with distinct focus/planned-break/pause/interruption/exposure and session outcomes; optionally reflect or opt into report delivery. | Peak/weak period definitions await testable criteria. |
| Enable distraction aid | Opt into Chromium-first blocking, edit suggested domains, and see whether blocking is active. | Following extension milestone under OD-020. |
| Administer product | Perform narrow authorized support/account-status/site operations without unrestricted private activity access. | Any broader visibility needs a later explicit decision. |

## 9. Functional requirements

Existing IDs are retained where their meaning fits. Decision references provide traceability to approved policy, not a claim that every referenced decision remains unresolved. Extension requirements apply to the milestone following core public v2 (OD-020).

| ID | Status | Required product outcome | Decision traceability |
| --- | --- | --- | --- |
| FR-TASK-001 | OWNER APPROVED | Permit zero to three Primary focus tasks per Plan Day, plus Extra tasks and subtasks without a total-task cap. Allow promotion/demotion subject to at most three simultaneous Primary tasks, preserving historical focus activity. Any task or subtask may become the authoritative active focus task. | OD-006, OD-007, OD-023, OD-025 |
| FR-TASK-002 | OWNER APPROVED | Require a user-selected planned start, distinguish planned_start from actual_start, and allow explicit early/late starts; never auto-start at the planned time. | OD-002, OD-004, OD-005 |
| FR-TASK-003 | OWNER APPROVED | Require title, Plan Day, planned start time, and a session plan containing count and each planned active focus duration. The session plan is the planning source of truth: task planned focus duration equals the sum of those durations (25 + 25 + 40 = 90 minutes). Durations may differ; changes to count/duration update the total without two independently editable conflicting totals. Resources, subtasks, and short note are optional. | OD-025 |
| FR-TASK-004 | OWNER APPROVED | Permit editing, rescheduling, removal/cancellation, extra tasks, subtasks, and splitting across the day while preserving historical focus activity. Unfinished tasks stay on their original Plan Day without automatic rollover. | OD-003, OD-006, OD-007 |
| FR-TASK-005 | OWNER APPROVED | Use active/system timezone and local calendar Plan Day without precise GPS; unobtrusively notify timezone changes and preserve historical Plan Day attribution. | OD-004, OD-005, OD-017 |
| FR-TASK-006 | OWNER APPROVED | Task completion is an explicit user decision, separate from session completion. Elapsed focus time or completing all planned sessions must not silently complete a task. The product may prompt Mark task complete or Keep task open; exact wording is not locked. | OD-019; V2-002C completion approval |
| FR-FOCUS-001 | OWNER APPROVED | Permit only one authoritative focus session per user; a paused task retains that reservation and prevents another authoritative focus task. | OD-001, OD-018 |
| FR-FOCUS-002 | OWNER APPROVED | Explicitly starting tab/device owns the session; other signed-in contexts may observe/mirror without duplicate time/entries. Offer explicit takeover/transfer confirmation; never infer ownership from input activity. | OD-018 |
| FR-RESOURCE-001 | OWNER APPROVED | Attach optional web URLs, optionally label them, and open them directly; do not impose an invented resource-count limit or include file uploads. | OD-021, OD-024 |
| FR-SESSION-001 | OWNER APPROVED | Users control session count, each active duration, and the final session/break plan. The session plan determines task planned focus duration. Optional Pomodoro-inspired focus/break suggestions are guidance without superiority claims. | OD-025 |
| FR-SESSION-002 | OWNER APPROVED | Pause stops active focus accumulation and preserves reservation until Resume or End Session. Record pause boundaries without a 60-minute duration cap; paused time does not consume configured focus duration. | OD-001 |
| FR-SESSION-003 | OWNER APPROVED | Automatically complete the session when configured active focus duration is reached; support End Session Early and retain planned duration, actual active duration, ending time/point, and ended-early outcome. | OD-019; V2-002B completion approval |
| FR-SESSION-004 | OWNER APPROVED | Mark uncertain continuity for reconciliation rather than automatic counting/discarding. Confirmed work may count; otherwise record interruption from the appropriate known point. Explicit pause never counts as focus. | OD-019 |
| FR-SESSION-005 | OWNER APPROVED | Attribute a session to the Plan Day under which it began across midnight; permit explicit further sessions for the previous Plan Day and make attribution understandable. | OD-017 |
| FR-SESSION-006 | OWNER APPROVED | May offer optional post-session rating/reflection after completion or early end, with clear Skip and no blocking of continued use; ratings are self-report. | OD-026 |
| FR-SESSION-007 | OWNER APPROVED | A planned break is deliberate rest between sessions, separate from active focus, pause within the preceding session, and interruption. It counts as none of those and never increases interruption counts or automatically starts the next session. An optional break timer may be offered; the next focus session requires explicit user action. | OD-025; V2-002C break approval |
| FR-LOCAL-001 | OWNER APPROVED | Allow opening, planning, and focus sessions locally without registration; connecting local data to an optional account is explicit, simple, understandable, and non-destructive. | OD-008 |
| FR-AUTH-001 | OWNER APPROVED | Offer optional account registration/login with verified email recovery, temporary single-use recovery code/link, rate-limited recovery attempts, and possible re-authentication for sensitive actions; ordinary edits/cross-device use do not require repeated email verification. | OD-008, OD-011 |
| FR-PERSIST-001 | OWNER APPROVED | Connected accounts provide persistent cloud-associated history, synchronization, cross-device continuity, recovery, and long-term reports beyond one browser; retain history until user deletion/account closure subject to later operational/legal constraints. | OD-008, OD-015; OD-009 |
| FR-DATA-001 | OWNER APPROVED | Account users can export productivity/activity data in a usable machine-readable form and access understandable data/account deletion controls; exact formats are not locked. | OD-016 |
| FR-ACTIVITY-001 | OWNER APPROVED | Record the user's own task/focus/session activity and distinguish active focus, pauses, interruptions, completed sessions, and ended-early sessions. Distinguish planned break duration where recorded from active focus, pause, interruption, and distracting-site exposure; breaks never increase interruption counts. | OD-001, OD-019, OD-022 |
| FR-ANALYTICS-001 | OWNER APPROVED | Provide in-app daily summaries including active focus, pause duration, interruption count/duration, completed/early-ended sessions, task focus totals, daily focus total, and configured distracting-site exposure when tracking is enabled. Distinguish planned break duration where recorded from active focus, pause, interruption, and distracting-site exposure; breaks never increase interruption counts. | OD-017, OD-022 |
| FR-ANALYTICS-002 | OWNER APPROVED | Offer opt-in daily/weekly/monthly report delivery through email and/or notifications; annual recap may be generated after calendar-year completion. Describe behavior only, without medical inference. | OD-022 |
| FR-EXT-001 | OWNER APPROVED — planned capability | Target Chromium-based browsers first for opt-in focus-session blocking; core planning/focus continues when extension is absent, disabled, or unavailable, with understandable blocking status. | OD-012, OD-013; following milestone OD-020 |
| FR-EXT-002 | OWNER APPROVED — planned capability | Offer editable suggested/common social-media domains; users add/remove domains or disable blocking. Suggestions are unenforced until opt-in; conceptual matching covers registered site/domain and relevant subdomains. | OD-024; following milestone OD-020 |
| FR-EXT-003 | OWNER APPROVED — planned capability | Permit controlled necessary-resource exceptions with clear warning, obvious exposure timer, and noticeable prolonged exposure without color-only cues or shame. Record only approved minimum configured-domain exposure facts with notice/permission. | OD-014, OD-024; following milestone OD-020 |
| FR-ADMIN-001 | OWNER APPROVED | Provide narrow account-status/support, site operational configuration, and necessary support actions without default unrestricted access to task content, private notes, or productivity history. | OD-010 |
| FR-VISUAL-001 | OWNER APPROVED | Use an original cartoon/cinematic person/head with at most three central Primary boxes, with Extra tasks/subtasks outside them and no fourth Primary head box. | OD-023; exact artwork awaits owner approval |
| FR-VISUAL-002 | OWNER APPROVED | Starting Primary focus visibly opens/releases its box. Extra tasks/subtasks receive a clear active-focus representation when focused without creating a fourth Primary head box; exact treatment remains later design. State never relies on color alone. | OD-023, OD-027 |
| FR-A11Y-001 | OWNER APPROVED | Target WCAG 2.2 AA for the web experience: keyboard-operable essentials, visible focus, non-color state cues, reduced-motion equivalent, and understandable screen-reader labels/states. | OD-027; validation later |
| FR-RELEASE-001 | CONFIRMED | Make the product publicly accessible, including local entry and optional accounts. | OD-008; extension follows core release OD-020; domain/name separate |

## 10. Daily task planning requirements

**OWNER APPROVED:** Permit zero to three Primary focus tasks per Plan Day, plus Extra tasks and subtasks without a total-task cap. Allow promotion/demotion subject to at most three simultaneous Primary tasks, preserving historical focus activity. Any task or subtask may become the authoritative active focus task. FR-TASK-003 defines required planning data; planned focus duration and session planning replace a separate required v1 estimate concept. Users may distribute/split work, add subtasks, and change their plan. Ordinary edits/removal preserve work already recorded; data/account deletion is separate. Unfinished tasks remain on the original Plan Day with optional next-day reminder and explicit rescheduling/replanning/splitting.

Plan Day uses the active/system timezone's local calendar day, without precise GPS. Timezone changes receive unobtrusive notice; future-plan adjustments may be suggested, normal use continues, and history must not silently change Plan Day. Require title, Plan Day, planned start time, and a session plan containing count and each planned active focus duration. The session plan is the planning source of truth: task planned focus duration equals the sum of those durations (25 + 25 + 40 = 90 minutes). Durations may differ; changes to count/duration update the total without two independently editable conflicting totals. Resources, subtasks, and short note are optional. Exact time-adjustment interactions and validation limits remain unspecified.

## 11. Focus-session requirements

**OWNER APPROVED:** Planned time never starts focus automatically. A task may become ready or receive a reminder; the user explicitly starts and may do so early or late. Planned and actual starts remain distinct. Session suggestions are optional Pomodoro-inspired guidance; users choose count/duration/final plan.

Configured session duration means active focus only. Pause stops accumulation, retains authoritative reservation, and remains paused until Resume or End Session. Record boundaries so pause duration can be calculated without a 60-minute cap. A live pause timer may be added later; it is not implementation authorized here. Reaching configured active duration completes automatically; End Session Early preserves planned/actual duration, ending time, and factual outcome. Task completion is an explicit user decision, separate from session completion. Elapsed focus time or completing all planned sessions must not silently complete a task. The product may prompt Mark task complete or Keep task open; exact wording is not locked. A planned break is deliberate rest between sessions, separate from active focus, pause within the preceding session, and interruption. It counts as none of those and never increases interruption counts or automatically starts the next session. An optional break timer may be offered; the next focus session requires explicit user action.

Only confirmed active focus counts. Reading, video/course study, thinking, and task-related offline work can be focus without input activity. If trustworthy continuity is lost due to idle state, sleep, disconnect, or unexpected closure, mark the uncertain interval for reconciliation. On return the product may ask whether work continued: confirmed work may count, otherwise record interruption from the appropriate known point. Do not treat lack of input alone as lost focus or invent abandonment thresholds. Explicit pause remains non-focus. Attribution stays with the Plan Day under which the session began, including explicit continuation of further sessions for that day after midnight. Optional reflection never blocks continuation.

## 12. Task-resource/link requirements

**OWNER APPROVED:** First-v2 resources are optional web URLs with optional readable labels and direct-open actions. No hard resource-count limit is selected. Necessary resources on distracting domains must not be silently blocked: provide warning/friction and a controlled exception with visible tracked exposure. Exact interface/opening destination is not designed here.

## 13. Account requirements

**OWNER APPROVED:** Core local use requires no account. Optional registration/login enables connected history, cross-device continuity, synchronization, recovery, long-term reports, and optional report delivery. Local-to-account connection must be explicit, simple, understandable, and non-destructive; neither history may silently overwrite the other.

For cloud accounts email is a verified recovery channel. Temporary single-use code/link recovery and rate-limited repeated attempts are required product policy; sensitive actions may require re-authentication. Repeated email verification is not required for ordinary task editing or normal cross-device use. Registration verification timing and technical authentication choices are unspecified; passkeys/MFA may be later enhancements.

## 14. Persistence requirements

**OWNER APPROVED:** Local entry and optional persistent cloud-associated accounts coexist. Connected history supports months/years of personal review until user deletion/account closure, subject to later operational/legal constraints. Users require machine-readable export usable outside the product, understandable deletion controls, and account deletion. No exact export format, backup retention, or deletion mechanics are selected. First v2 does not build or require automatic migration of historical v1 localStorage data. V1 remains separate from first-v2 data; later user-initiated import/history migration may be designed separately (OD-009).

## 15. Analytics and daily-summary requirements

**OWNER APPROVED:** Reports distinguish planned session duration, active focus duration, planned break duration where recorded, pause duration, interruption count/duration, configured distracting-site exposure where enabled, completed sessions, and ended-early sessions. Provide task focus totals and daily focus total under approved Plan Day attribution. Planned breaks never increase interruption counts. Wall-clock duration is not equated with focus duration when breaks, pauses, or interruptions exist. Reporting is factual and non-punitive; user ratings are self-report rather than measured cognition.

Reports are available in-app; optional periodic delivery may be daily, weekly, or monthly through email and/or notifications. Annual recap may be generated after the calendar year completes. Peak/weak working periods may be calculated only after their definitions become testable. Usage patterns must not infer or diagnose ADHD, psychiatric/cognitive disorders, or medical conditions. Exact freshness, empty-day presentation, interruption counting boundaries, and delivery scheduling remain unspecified. Approved base metrics are not deferred by the earlier deeper-analytics direction.

## 16. Browser-extension / distraction-blocking requirements

**OWNER APPROVED — planned capability:** Chromium-based browsers are first. Blocking is opt-in and its active status must be understandable. Core use continues if the extension is absent, disabled, or blocking is unavailable. Suggested/common social-media domains are editable and not enforced before enabling blocking; users add/remove domains or disable blocking. Matching conceptually covers registered site/domain and relevant subdomains.

For necessary task resources on distracting sites, provide clear warning/friction and a controlled exception. Deliberate allowed access during focus shows a clear warning and obvious exposure timer; prolonged exposure is noticeable through more than color alone. Visibly track exposure without shame or medical interpretation. Core public v2 releases first; the approved browser extension follows in a later milestone (OD-020). Later architecture must preserve an appropriate future integration boundary; this document does not design it. Technical matching, permissions, and exception mechanics are outside this task.

## 17. Administration requirements

**OWNER APPROVED:** Initial scope is narrow: account-status/support operations, site operational configuration, and necessary support actions. Administrators have no default unrestricted access to users' task content, private notes, or productivity/activity history. Broader visibility requires a later explicit decision; exact roles/actions and review processes are not invented.

## 18. Visual and interaction requirements

**OWNER APPROVED:** Original cartoon/cinematic person/head, three visually central primary focus boxes, zero to three Primary tasks with Extra tasks/subtasks outside those boxes, and opening/release of the selected primary box on explicit focus start. Extra tasks/subtasks receive a clear active-focus representation when focused without creating a fourth Primary head box; exact treatment remains later design. State does not rely on color alone. OD-023 concerns visual/state representation only; exact artwork and detailed representation of other task states still require later owner visual approval. No artwork or UI layout is created here.

## 19. Accessibility expectations at product level

**OWNER APPROVED:** OD-027 establishes WCAG 2.2 AA as the web target, separately from visual direction. Essential actions must be keyboard-operable with visible focus, non-color-only state communication, reduced-motion equivalents, and understandable screen-reader labels/states for task/session interactions. This is a target, not a claim of validated conformance or certification. **INHERITED V1 BEHAVIOR:** Existing keyboard/label/focus/reduced-motion handling is reference evidence, not proof of v2 conformance.

## 20. Privacy/product-data principles

**OWNER APPROVED:** Do not collect general browsing history, page content, unrelated browsing, or silent surveillance. When distraction tracking/blocking is explicitly enabled, minimum approved facts may include configured distracting domain, exposure start/end/duration, and related focus session, with appropriate notice/permission. Account retention and export/deletion are governed by OD-015/OD-016; narrow administrator access by OD-010. Local entry does not silently connect/upload history. No legal/security certification, technical permission design, or backup-retention period is asserted.

## 21. Cross-device / multi-tab behavior

**OWNER APPROVED:** One authoritative focus session exists per user; the context explicitly starting it becomes owner. Other signed-in contexts may observe, mirror state, and display timer/status, without duplicate focus time, report entries, or parallel authoritative sessions. Moving control requires an explicit simple takeover/transfer confirmation. Input activity never selects ownership. Normal editing from another device does not require email confirmation; sensitive security actions remain separately protected. Future observers would use separate permissioned read-only access and are outside first-v2 core scope. Exact simultaneous-request arbitration, conflicting plan edits, and synchronization timing remain unspecified; no mechanism or latency target is chosen.

## 22. Product-level acceptance criteria

These scenarios guide later implementation review and do not claim v2 exists. Extension scenarios apply to the following extension milestone under OD-020; visual/conformance validation occurs later.

| ID | Scenario and expected outcome | Traceability |
| --- | --- | --- |
| AC-001 | Plan zero to three Primary tasks and add Extra tasks/subtasks without a total-task cap. Promotion cannot create a fourth simultaneous Primary; promotion/demotion preserves history. Any task/subtask may become authoritative focus. | FR-TASK-001, FR-VISUAL-001 |
| AC-002 | Plan a task with title, Plan Day, start time, planned focus duration, and session count/duration. Reaching planned time does not start focus; explicit early/late start records actual_start separately. | FR-TASK-002/003 |
| AC-003 | Start from one context, then attempt another task from another context while running or paused: only one authoritative session/reservation exists. Observers do not duplicate records; takeover requires confirmation. | FR-FOCUS-001/002, FR-SESSION-002 |
| AC-004 | Attach and directly open a labeled web URL; if it is a configured distracting site, warn and permit a controlled necessary-work exception rather than silent blocking. | FR-RESOURCE-001, FR-EXT-003 |
| AC-005 | Use planning/focus without an account; optionally register/login and connect local history without silent overwriting. Recover through verified email using temporary single-use credentials; repeated attempts are rate-limited. | FR-LOCAL-001, FR-AUTH-001 |
| AC-006 | Save connected history, then sign in elsewhere: history remains available for long-term review under the approved retention policy; normal editing requires no repeated email verification. | FR-PERSIST-001, FR-AUTH-001 |
| AC-007 | Review a session planned for 20 active minutes with 5 paused and 3 reconciled interruption minutes: at completion active focus is 20, pause is 5, interruption duration is 3; wall-clock time is not reported as focus. Show completed versus early-ended counts, task/daily totals, recorded planned breaks, and enabled exposure separately; breaks never increase interruption counts. | FR-ACTIVITY-001, FR-ANALYTICS-001, FR-SESSION-003/004; interruption-count boundary detail still unspecified |
| AC-008 | Enable Chromium-first blocking with edited suggested domains: configured site/subdomains follow blocking policy. An allowed exception displays warning/exposure timer/non-color prolonged cues; absence/disable/unavailability never prevents core focus use. | FR-EXT-001–003; timing OD-020 |
| AC-009 | Authorized narrow account/site operations are available; unauthorized operations are denied and administrators do not gain default unrestricted private content/history access. | FR-ADMIN-001 |
| AC-010 | Start Primary focus: its central head box opens/releases. Focus Extra work or a subtask: clear active-focus representation appears without a fourth Primary box and without color-only cues; exact treatment remains later design. | FR-VISUAL-001/002; exact artwork approval later |
| AC-011 | Reach the publicly released product and begin local planning/focus without a registration wall, with optional account entry available. | FR-RELEASE-001, FR-LOCAL-001 |
| AC-012 | Plan active sessions of 25, 25, and 40 minutes: task planned focus is 90 minutes. Change count/duration: the total reflects the plan without independently editable conflicting totals. Optional Pomodoro-inspired suggestions may include breaks; users control the final plan without superiority claims. | FR-SESSION-001, FR-TASK-003 |
| AC-013 | Pause an ongoing session: active duration stops, reservation persists, and pause remains until Resume or End Session. A pause over 60 minutes retains its full duration; paused time does not exhaust focus duration. | FR-SESSION-002, FR-FOCUS-001 |
| AC-014 | Reach configured active duration: session auto-completes. End another early: preserve planned/actual active duration, ending point/time, and ended-early outcome with non-punitive language. | FR-SESSION-003 |
| AC-015 | Lose trustworthy continuity, then return: uncertain time is reconciled rather than silently counted/discarded; confirmed work may count, otherwise interruption is recorded. Reading without input alone is not classified as non-focus; explicit pause never counts. | FR-SESSION-004 |
| AC-016 | Leave work unfinished: it stays on its original Plan Day, without automatic rollover. Edit/reschedule/remove/split it without erasing prior focus activity. | FR-TASK-004 |
| AC-017 | Cross midnight during focus or explicitly continue prior-day sessions; attribution remains the starting Plan Day. Change timezone: unobtrusive notice, normal operation, no silent historical Plan Day reassignment and no precise GPS requirement. | FR-TASK-005, FR-SESSION-005 |
| AC-018 | Export account productivity/activity data: usable machine-readable output is available outside the product. Understandable data deletion and account deletion controls are available. | FR-DATA-001 |
| AC-019 | Enable permitted exposure tracking: records stay within configured-domain start/end/duration/session scope with notice/permission; no unrelated browsing or page content is collected. | FR-EXT-003, OD-014 |
| AC-020 | Review reports in-app; optionally opt into daily/weekly/monthly delivery, and generate an annual recap only after year completion. Reports describe behavior without medical diagnosis. | FR-ANALYTICS-002 |
| AC-021 | Complete/end early and receive optional rating/note with clear Skip: skipping permits continued use; the rating is labeled as self-report. | FR-SESSION-006 |
| AC-022 | Validate essential task/session interactions with keyboard, visible focus, screen reader, non-color cues, and reduced motion against the WCAG 2.2 AA target; do not claim conformance before testing. | FR-A11Y-001 |
| AC-023 | Complete all planned sessions or reach planned focus time: the task remains open until explicitly marked complete. A completion/keep-open prompt may be offered without inferring completion. | FR-TASK-006 |
| AC-024 | Take a planned break: no active focus, preceding-session pause, interruption duration, or interruption count is added. Report its duration separately where recorded; the next session requires explicit action even after an optional break timer ends. | FR-SESSION-007, FR-ACTIVITY-001, FR-ANALYTICS-001 |

## 23. Out-of-scope items

This task excludes code, architecture decisions, diagrams, technology selection, schemas/contracts, deployment execution, and artwork creation. First-v2 file uploads and parent/observer core mode are excluded by owner policy. Domain/name selection is separate; deeper analytics beyond the approved base reports remain later evolution. No additional product capabilities are authorized by this specification. V1 cleanup findings are not v2 requirements.

## 24. Decision closure and remaining details

[owner-decisions.md](owner-decisions.md) records OD-001–OD-027, all **OWNER APPROVED** at their recorded scope. OD-009 keeps v1 data separate without automatic migration in first v2; OD-020 places the extension after core public v2. No OWNER DECISION REQUIRED entries remain. Unspecified details do not authorize new policy.

Later owner review remains required for exact artwork and broader administrator visibility. Testable peak/weak definitions, simultaneous-start arbitration, plan-edit conflict resolution, uncertain-time/counting thresholds, verification timing, and detailed interface/delivery behavior remain unspecified. These do not reopen approved product directions. No ambiguity prevented recording the supplied approvals.
