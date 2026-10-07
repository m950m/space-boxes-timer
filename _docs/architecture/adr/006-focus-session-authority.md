# ADR-006 — Focus-session authority

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

The product requires one authoritative session per user, paused reservation across contexts, explicit confirmed takeover and no duplicate observer accounting.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-FOCUS-001/002, FR-SESSION-002/003/004/005, FR-TASK-006, FR-PERSIST-001; AC-003/013–017/023.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Serialized persisted local authority and connected server transactional authority

**Pros:** Matches anonymous browser scope and identified account scope; connected authority transitions have one accepted decision point.

**Cons:** Connected authority acquisition depends on server availability; local anonymity cannot link independent devices.

### Option B — Per-tab or independently offline client authority

**Pros:** Simple immediate responsiveness without a shared decision point.

**Cons:** Repeats v1 paused-reload/cross-tab limitations and permits multiple accepted-looking owners; cannot enforce the connected invariant.

## Approved decision

**APPROVED DIRECTION:** Local-only mode has one serialized persisted running-or-paused reservation within cooperating tabs in the same browser origin/profile scope. Connected mode has one account-scoped server-enforced authoritative running-or-paused reservation.

## Why

Identity and a reachable common authority are necessary to coordinate connected devices. Notifications/timer ticks alone are not mutual exclusion.

## Consequences

Connected new Start and takeover/transfer require server acceptance. The previously accepted controlling context may record offline continued/Resume activity locally as pending or uncertain evidence for later reconciliation; this neither creates independent global authority nor constitutes freshly accepted server authority. Another disconnected context cannot independently acquire global authority.

After confirmed takeover, reject stale authority-changing mutations from the former controller. Late historical evidence must not be silently discarded merely because ownership changed; preserve it for reconciliation where appropriate. Reload/new cooperating tabs respect existing running or paused local reservation. Pause retains reservation until Resume or End Session; Resume does not itself release exclusivity. Future heartbeat/inactivity mechanisms must not automatically free running/paused reservation merely because input activity disappeared. Session completion never silently completes tasks or starts another session.

## Risks

An offline old context may display stale ownership; server enforcement prevents two accepted authorities, not simultaneous human activity. Browser storage loss, clock changes and overlapping pending evidence require reconciliation. Exact browser coordination and compatibility remain deferred.

## What this decision explicitly does NOT decide

Locking SQL, local coordination primitive/fallback, ownership generations, heartbeat/lease thresholds, APIs, reconciliation arithmetic or authentication-expiry lifecycle.

## Requirements affected

FR-FOCUS-001/002, FR-SESSION-002/003/004/005, FR-TASK-006, FR-PERSIST-001; AC-003/013–017/023.

## Later work affected

V2-005 invariants/evidence modeling, concurrency implementation, takeover/security contracts and failure tests.
