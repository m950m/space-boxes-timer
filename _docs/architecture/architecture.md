# Approved v2 architecture

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

Prepared 2026-10-07 for V2-003. Product policy comes from [v2-prd.md](../product/v2-prd.md) and [owner-decisions.md](../product/owner-decisions.md). The completed authentication/security, persistence/synchronization, and extension-boundary analyses inform these recommendations. Owner technical approval records all eight reviewed architecture directions, subject to the corrections captured here. It does not authorize or establish completed implementation.

Evidence: **BASELINE** identifies previously documented committed-v1 facts, not a new source audit. **APPROVED DIRECTION** identifies owner-approved architecture, not implemented capability. Owner review verified the general architecture-level capabilities needed for these decisions. Specific software versions, browser compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted. Historical verification and remote GitHub settings also remain **UNVERIFIED**. No version, support matrix, benchmark or security certification is asserted.

## 1. Architecture goals

Use the approved architecture supporting immediate account-free use, secure optional accounts, durable connected-account history, one authoritative focus session, factual reports and later extension integration. Favor explicit module boundaries, testable domain decisions and a small operational footprint. Consistency and privacy take precedence over pretending disconnected clients possess shared authority.

## 2. Product constraints driving architecture

A Plan Day permits zero to three Primary tasks plus Extra tasks/subtasks; any may become authoritative focus. Classification changes preserve activity. Task planned focus is the sum of planned active session durations; sessions may differ. Planned time never starts focus. Session completion and explicit task completion are separate. Planned breaks, pause, interruption, active focus and distracting-site exposure remain separate measures.

Pause retains reservation until Resume or End Session without a 60-minute cap. Missing input does not prove lost focus. Uncertain continuity requires reconciliation rather than automatic counting or discarding. Session Plan Day attribution survives midnight and timezone changes. Local entry needs no account; connection must preserve both histories. V1 history remains separate without automatic migration. Core public v2 precedes the optional Chromium-first extension. Administration remains narrow; accessibility targets WCAG 2.2 AA without asserting conformance.

## 3. Relevant v1 technical baseline

**BASELINE:** [v1-baseline.md](../baseline/v1-baseline.md) describes a static Vanilla JavaScript ES-module application with separated DOM, task, timer, storage and statistics responsibilities. Browser localStorage holds versioned task/settings/statistics records. There is no backend, account system, committed automated suite or CI workflow.

[known-gaps.md](../baseline/known-gaps.md) records per-page running enforcement, loss of paused ownership after reload, whole-array persistence without cross-tab coordination, wall-clock reload recovery without uncertainty reconciliation and potentially stale statistics. These mechanisms cannot establish v2 authority or history integrity. Existing separation is useful; existing lifecycle/statistics semantics are not automatically v2 policy. V1 keys/data must remain untouched by first-v2 account connection.

## 4. Approved high-level architecture

**APPROVED DIRECTION:** A modular Django monolith uses cohesive domain modules and shared transactional boundaries where cross-module invariants require atomic consistency. Service extraction may be reconsidered only when real operational evidence demonstrates a need for independent deployment/scaling; no thresholds are selected. Django is approved by ADR-002 and connected persistence separately by ADR-003. The monolith owns connected domain operations, authentication, authorization, PostgreSQL persistence and reporting. An evolved Vanilla JavaScript client owns presentation, account-free domain behavior, browser-local persistence, timer display and synchronization coordination. Serve the first-party web application and account service within a same-origin security boundary; this is an architectural preference, not deployment configuration.

Local mode operates without server identity. Connected mode uses the server as canonical record and focus-authority owner, with a locally persisted browser cache and pending-work buffer. Scheduled report processing begins using the backend application codebase without an initial separate queue/broker platform. Choosing Django does not select a durable worker system; durable retry, deduplication, failure recording and recovery remain responsibilities. A future optional core-to-extension client capability adapter links the client to the extension; it is neither a separate core service nor a focus authority.

## 5. Component responsibilities

| Component | Responsibility |
| --- | --- |
| Client presentation | Accessible forms, original Primary-box/Extra-focus representation, observable availability/sync status and explicit actions. |
| Client domain layer | Local planning/session rules, pure calculations, explicit completion, interval classification and reconciliation decisions separated from DOM. |
| Browser persistence/coordinator | Persistent local records, local reservation, cooperating-tab coordination, account-separated caches and pending evidence. |
| Connected domain service | Account-scoped validation, concurrent plan changes, accepted history and atomic focus-authority transitions. |
| Identity/authorization boundary | Login, verified recovery, revocation, sensitive reauthentication and deny-by-default ownership/administration checks. |
| PostgreSQL persistence | Canonical connected records, durable reservation and transaction boundaries; detailed modeling is later work. |
| Reporting/scheduled processing | Derive factual summaries, opt-in delivery, retries and duplicate suppression. |
| Future capability adapter | Minimal consented extension exchanges and independent blocking availability status. |

No component exposes database records directly as administrative authority. Domain rules remain explicit in local and connected modes; client checks may improve immediate UX, but connected security/concurrency/account invariants are enforced server-side. Client and server are not independent authoritative rule sets.

## 6. Local mode

**APPROVED DIRECTION:** IndexedDB stores v2 plans, history and persisted reservation independently of v1 storage. Reload and new cooperating tabs must respect an existing running or paused reservation. Coordinate transitions across cooperating tabs in the same origin/browser profile using a serialized local authority boundary. Broadcasts notify views; notification alone is not mutual exclusion. Reload reconstructs running/paused ownership from persisted state rather than selecting only running work.

Anonymous exclusivity is limited to that shared browser storage scope. Separate devices/profiles cannot be recognized as the same anonymous person without identity; do not claim global local-mode exclusivity. Local use requires no account and makes no account upload. Storage denial, quota failure or eviction must be visible; browser storage is not a guaranteed backup. Exact browser coordination primitive, fallback and support matrix are deferred.

## 7. Connected-account mode

**APPROVED DIRECTION:** PostgreSQL-backed server state becomes canonical only through explicit, understandable connection and durable acceptance. Preserve existing local and account histories; retain pending local evidence until acknowledged. Connection retries must not duplicate history or silently create two authoritative focus sessions. Mutable plan conflicts and historical evidence conflicts are separate categories; silent whole-history last-write-wins replacement is not permitted. Local pending evidence is cleared only after appropriate accepted/acknowledged synchronization. Account switching must isolate caches and pending work so one account's records cannot upload into another.

Connected clients may retain cached viewing and pending ordinary plan edits during outages, clearly distinguished from accepted account records. No independent disconnected authoritative start or takeover is allowed. Account association, concurrent-edit conflicts and connection during an active local reservation require later modeling; no silent overwrite or implicit parallel owner is permitted.

## 8. Authentication boundary

Use opaque server-side revocable authentication session state identified by a Secure/HttpOnly browser cookie for connected first-party accounts. The cookie identifies the session; server-side state owns the authentication session. Preserve HTTPS, Secure/HttpOnly attributes, an appropriate SameSite policy and explicit CSRF controls for mutations. Cookie protection does not prevent malicious script acting through a page; XSS prevention remains necessary. Session identity rotation, revocation and bounded lifetimes belong to the account-security design.

Verified-email recovery uses secure temporary single-use credentials and rate-limited attempts. Recommend generic recovery responses to limit account enumeration. Recovery must not bypass ordinary authorization. Sensitive-action reauthentication remains part of the approved security boundary; recent reauthentication is recommended for credential/recovery-channel changes and account deletion, not ordinary edits or routine cross-device access. Authentication sessions are distinct from focus-session authority. The rejected default is client-held bearer authentication in JavaScript-accessible storage, not JWT as a format. Other token/cookie arrangements have different threat models but no demonstrated need here; extension authentication remains undecided. No authentication library, identity provider or precise lifetime is selected here.

## 9. Persistence boundary

In local-only mode, IndexedDB is authoritative within the applicable browser origin/profile. In connected mode, server/PostgreSQL state is canonical account authority; connected IndexedDB may hold account-isolated cache and locally persisted pending work/evidence. Separate mutable plans from recorded history so editing/removal/classification changes do not rewrite prior focus. Deliberate user-data/account deletion follows its own authorized lifecycle.

Represent trustworthy instants independently from local calendar intent: preserve starting Plan Day and timezone context rather than deriving old attribution from a viewer's current timezone. Exact representations and schema are deferred to V2-005. Reports derive from accepted/reconciled activity facts; cached aggregates are replaceable outputs rather than historical authority. Long-term retention requires recovery procedures, export and deliberate deletion handling; no backup schedule is invented.

## 10. Focus-session authority model

Local authority persists and serializes the reservation within the browser storage scope. Connected authority belongs to the server, with account-scoped transactional enforcement of one running-or-paused reservation and an explicit controlling context. Connected new Start and confirmed takeover/transfer require server acceptance. The previously accepted controlling context may record offline continued/Resume activity as locally persisted pending or uncertain evidence for later reconciliation. This grants no new independent global authority and is not freshly accepted server authority; another disconnected context cannot independently acquire global authority. Pause retains reservation until Resume or End Session; Resume does not itself release exclusivity. Future heartbeat/inactivity mechanisms must not automatically free running/paused reservation merely because input activity disappeared.

Ownership transfer invalidates the old context's control authority; reject stale authority-changing mutations. Late historical evidence from it must not be silently discarded because ownership changed; preserve it for reconciliation where appropriate. The server prevents two accepted owners, not simultaneous human work or stale offline displays. During loss of trustworthy continuity, preserve last accepted ownership and pending evidence, show uncertainty and reconcile before counting unconfirmed time. Disconnected clients cannot independently reacquire control. No locking SQL, heartbeat threshold or transport contract is selected.

The timer display is a projection of session state, not authority. Active-duration completion ends the session; it never silently completes the task or starts the next session. Pauses and planned breaks do not consume configured active duration.

## 11. Multi-device conceptual model

The explicitly starting accepted context controls a session; other authorized contexts observe/mirror without accruing duplicate focus or report entries. Explicit confirmed transfer is checked against authoritative state. Client synchronization communicates accepted state and pending status; input activity does not select ownership. Cross-device freshness and transport are deferred without promising real-time latency.

During partition, preserve consistency by restricting authority-changing operations. An old context can display stale ownership until informed; its stale authority-changing mutations must be rejected. Pending evidence from a prior owner must not disappear merely because control changed; how to retain/reconcile overlapping evidence is V2-005 work.

## 12. Reporting/background-work direction

Use in-app calculations from local accepted facts in local mode and canonical connected facts in account mode. Keep active focus, recorded planned breaks, pause, interruption count/duration, session outcomes, task/daily totals and enabled exposure distinct. Breaks never increase interruption counts; wall-clock time is not active focus. Ratings are self-report and behavioral summaries are not medical inference.

Begin with scheduled backend processing using the monolith's application code and durable delivery state. Support opt-in daily/weekly/monthly delivery and annual recap after year completion, with retries, duplicate suppression, preference checks and visible operational failures. Recovery mail must not wait for a periodic report batch; its dispatch/retry responsibility remains separate. A separate broker/queue platform is not initially recommended; reconsider if latency, backlog, delivery volume or recovery requirements demonstrate need. Scheduler/provider, exact timing, worker count and delivery guarantees remain deferred.

## 13. Future extension integration boundary

Use the approved optional core-to-extension client capability adapter compatible with local account-free use. Core prepares conceptual access to authoritative session state, opted-in domain configuration, controlled resource exceptions, minimal exposure records and truthful capability status. It releases without extension installation, browser permissions or store approval.

The extension handles blocking enforcement separately from exposure measurement; a blocking-rule match alone is not proof of browsing duration, attention or interruption. It remains separate from authentication authority and focus authority. Apply least-privilege permission design without selecting actual permissions. Validate expected source/origin where applicable, message shape, purpose, relevant association and freshness. A client message alone is not proof of authority; do not exchange account credentials, private task notes, page content, full browsing URLs or unrelated history. Only consented configured-domain start/end/duration/session facts cross the boundary. Backend involvement is limited to ordinary approved connected data responsibilities, not required for local blocking.

Extension availability/reachability or connection is not proof of active blocking protection. Restart, revocation, ownership transfer and disconnect require truthful blocking status and exposure uncertainty handling. Exposure is not automatically interruption or proof of lost focus. Exact messaging mechanism, permissions, browser versions, pause/break blocking policy and exposure aggregation await extension design; exact browser API/version and unselected permission behavior are not asserted.

## 14. Administration boundary

Use narrowly authorized account-status/support and site-operation capabilities. Deny private task, note and productivity-history visibility by default, including through a generic administration surface. Django administration is a proposed implementation tool, not permission to expose all models or grant routine unrestricted access. Separate application support authority from exceptional infrastructure/operator powers and document their risk; do not claim application permissions constrain database operators. Exact actions, roles and oversight procedures require later definition.

## 15. Privacy/security architecture principles

Authenticate and authorize connected operations server-side; never trust a client-supplied account identity as authority. Minimize exchanged/logged data, isolate account caches, protect credentials and make connection/tracking opt-in. Recovery and reporting have different urgency and access purposes. Report delivery must respect current preferences/deletion state. Browser compromise, email compromise and infrastructure access remain risks despite controls. No general browsing surveillance or medical inference is authorized.

## 16. Failure/recovery principles

Distinguish browser-local persistence from acknowledged server persistence; browser-local storage is not a guaranteed backup. Persist intent/evidence before reporting it saved where feasible; distinguish unsaved, pending and accepted state. Interrupted connection and retries must preserve data without duplicate accepted activity. Lost network/authentication does not silently grant a new owner or discard focus evidence. Storage failure must not be reported as successful saving. Sleep/closure/clock changes produce reconciliation obligations rather than automatic wall-clock focus recovery.

Retain paused reservation through restart. Reconstruct views from authoritative state; timer ticks and browser process lifetime do not define session validity. Recovery must preserve Plan Day and interval classifications. Account-session expiry/logout versus ongoing focus needs later explicit lifecycle design without bypassing revocation or reopening parallel authority.

## 17. Technology choices approved by ADRs

| ADR | Approved direction |
| --- | --- |
| [001](adr/001-architecture-style.md) | Modular monolith rather than microservices. |
| [002](adr/002-backend-stack.md) | Django rather than FastAPI for integrated account/admin/domain needs. |
| [003](adr/003-persistence.md) | PostgreSQL canonical connected data; IndexedDB local data/cache. |
| [004](adr/004-authentication.md) | Server-side revocable session state identified by Secure/HttpOnly cookie; no JavaScript-accessible bearer-storage default. |
| [005](adr/005-local-cloud-sync.md) | Server-authoritative connected synchronization with locally persisted pending work. |
| [006](adr/006-focus-session-authority.md) | Serialized persisted local authority; transactional server authority when connected. |
| [007](adr/007-frontend-evolution.md) | Evolve/refactor Vanilla JavaScript rather than immediate SPA rewrite. |
| [008](adr/008-extension-boundary.md) | Optional core-to-extension client capability adapter, extension after core release. |

All eight reviewed directions have owner technical approval. Approval is limited to architecture; implementation is neither authorized nor completed by this document. Specific versions and third-party packages are not selected.

## 18. Rejected complexity / explicit non-goals

Reject initial microservices, distributed event infrastructure, peer-authoritative account sessions, blanket last-write-wins history replacement, browser bearer-token storage by default, mandatory extension coupling and immediate framework rewrite. Each either complicates operation or weakens required integrity without demonstrated value. No separate queue/broker platform is required initially, but reliable report processing is not deferred away.

This task creates no code, dependencies, detailed schemas, SQL, endpoints/contracts, diagrams, deployment/CI configuration or extension implementation. It does not change product rules or introduce automatic v1 import.

## 19. Architecture risks

Disconnected availability trades off against accepted global session exclusivity. Browser eviction, untrusted clocks, stale owners, conflicting plans and interrupted connection threaten integrity if boundaries are bypassed. Local and server rule implementations may drift. Vanilla JavaScript state coordination may grow costly. A frontend-framework migration may be reconsidered if implementation evidence shows manual rendering/state coordination has become a material correctness or maintenance problem; popularity alone is insufficient. Major visual redesign is compatible with Vanilla JavaScript. Package tooling, justified bundling, automated/browser testing and modular build tooling remain allowed later choices. Email delivery and durable scheduled retries add operational responsibilities even without a broker. Generic administration, cache leakage and overly broad extension permissions threaten privacy. Specific versions, compatibility, configuration and performance require later validation; no implementation certification is asserted.

## 20. Questions intentionally deferred

V2-005 must define concrete records, invariant enforcement, pending-evidence identity, account-connection mapping/conflicts, concurrent plan edits, historical corrections, timezone representations and reconciliation boundaries. Later API/security work defines transport, authentication libraries, registration verification timing, expiry/rate limits, authority generations and revocation/ongoing-session behavior. Later operations work defines backups, restoration, deletion propagation, scheduler/mail delivery and scaling triggers. Later extension work defines browser APIs/permissions, origin association, exception controls, pause/break blocking and exposure aggregation. Exact artwork, peak/weak definitions and broader admin visibility remain separate owner decisions.

These deferrals do not reopen approved product policy or imply technical implementation is authorized.

## 21. PRD traceability

| Requirements | Architectural responsibility |
| --- | --- |
| FR-TASK-001–006 | Local/server domain rules: Primary cap without total cap, explicit starts/completion, session-plan sum, history-safe edits and timezone-safe plans. |
| FR-FOCUS-001–002 | Persisted reservation, one accepted owner, explicit confirmed transfer, observers without duplicate accounting. |
| FR-RESOURCE-001 | Client URL actions; future capability boundary for consented necessary-resource exceptions. |
| FR-SESSION-001–007 | Domain/session boundary: user plans, pause, active completion/early outcome, uncertainty, attribution, optional reflection and distinct breaks. |
| FR-LOCAL-001 | Account-free local persistence and explicit non-destructive connection. |
| FR-AUTH-001 | Cookie/session, verified recovery, revocation, sensitive-action and authorization boundaries. |
| FR-PERSIST-001 | Canonical connected persistence, account isolation, continuity and long-term recovery responsibilities. |
| FR-DATA-001 | Deliberate export/deletion lifecycle separated from ordinary plan edits. |
| FR-ACTIVITY-001 | Preserved/reconciled historical facts and distinct interval classifications. |
| FR-ANALYTICS-001–002 | Derived factual totals and reliable opt-in scheduled delivery. |
| FR-EXT-001–003 | Future optional capability adapter; minimum exposure and independent availability. |
| FR-ADMIN-001 | Narrow deny-by-default administration, excluding unrestricted productivity content. |
| FR-VISUAL-001–002 | Client presentation independent of domain authority, with Extra/subtask focus representation. |
| FR-A11Y-001 | Keyboard, focus, non-color, reduced-motion and screen-reader presentation; later validation. |
| FR-RELEASE-001 | Public local entry and optional accounts; extension does not block core release. |

Later validation should exercise AC-001–024, especially paused reload, simultaneous starts, takeover/stale writes, disconnection, connection retries, conflicting edits, account switching, timezone/midnight, recovery, restricted administration and extension absence. These are review scenarios, not tests run or created by V2-003.
