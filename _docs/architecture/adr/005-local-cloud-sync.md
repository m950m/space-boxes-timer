# ADR-005 — Local and cloud synchronization

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

Optional connection must preserve both v2 local and account history while enabling connected continuity and meaningful concurrency handling.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-LOCAL-001, FR-PERSIST-001, FR-TASK-004/005, FR-ACTIVITY-001, FR-DATA-001, FR-FOCUS-001/002; OD-008/009/015–019.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Server-authoritative connected synchronization with locally persisted pending work

**Pros:** One canonical connected record/authority boundary supports integrity, retries and authorized cross-device continuity while retaining offline evidence.

**Cons:** Connection/conflicts need explicit handling; disconnected clients cannot independently acquire shared focus authority.

### Option B — Peer/eventual authority across devices

**Pros:** Allows independent disconnected writes and can prioritize availability.

**Cons:** Independent focus owners can conflict during partitions; silent last-write-wins cannot preserve the required history and session invariant.

### Option C — Cloud-only persistence

**Pros:** Centralizes account storage and reduces browser persistence responsibilities.

**Cons:** Violates approved immediate account-free local use; it cannot replace standalone browser-local authority.

## Approved decision

**APPROVED DIRECTION:** Before account connection, browser-local authority applies within its local scope. After successful explicit connection, server state is canonical account authority. Connected browsers hold account-isolated cache and locally persisted pending work/evidence.

## Why

The product requires non-destructive connection and one authoritative session. Those responsibilities cannot be delegated to unrelated offline copies.

## Consequences

Connection is explicit and preserves both histories. Local pending evidence is cleared only after appropriate accepted/acknowledged synchronization. Retries must not duplicate accepted history. Account switching preserves cache isolation. Mutable plan conflicts and historical evidence conflicts are different categories; neither permits silent whole-history last-write-wins replacement. Account connection must never silently create two authoritative focus sessions. During disconnection a connected client may retain pending work/evidence, but gains no new independent global focus authority. Previously accepted controller continuation/Resume evidence follows ADR-006.

## Risks

Interrupted connection, concurrent plan edits, account switching, pending deletion and active-session association can cause loss or duplication if unresolved. Availability limits must remain visible.

## What this decision explicitly does NOT decide

Detailed merge/deduplication algorithm, conflict UI, transport, identifiers, schema, timing or connection of an active local session.

## Requirements affected

FR-LOCAL-001, FR-PERSIST-001, FR-TASK-004/005, FR-ACTIVITY-001, FR-DATA-001, FR-FOCUS-001/002; OD-008/009/015–019.

## Later work affected

V2-005 connection/conflict/history modeling, later synchronization contracts, offline recovery and account isolation.
