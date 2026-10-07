# ADR-003 — Persistence

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

Account-free work needs persistent local storage while connected histories must survive browsers and support reporting, recovery and concurrent operations.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-LOCAL-001, FR-PERSIST-001, FR-DATA-001, FR-TASK-003/004/005, FR-ACTIVITY-001, FR-ANALYTICS-001, FR-SESSION-005; OD-009.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — PostgreSQL plus IndexedDB

**Pros:** Relational connected persistence and transaction boundaries support shared invariants; browser-local structured persistence supports standalone work and pending evidence.

**Cons:** Two persistence environments need explicit adapters, failure handling and consistent rules; browser persistence is not guaranteed backup.

### Option B — PostgreSQL plus localStorage-style client persistence

**Pros:** Preserves canonical connected account authority with a familiar, simple browser persistence mechanism suitable for modest local data.

**Cons:** String-based persistence needs explicit structured-record/concurrency handling; synchronous storage and whole-snapshot approaches can complicate growing history and pending work. Local storage is not a guaranteed backup. These costs favor IndexedDB here without implying this option cannot support connected accounts.

### Option C — Browser-only persistence

**Pros:** Supports independent account-free use without server/database operation.

**Cons:** Cannot satisfy approved connected continuity, account recovery and cross-device authority; local browser data alone has no canonical account persistence.

## Approved decision

**APPROVED DIRECTION:** In local-only mode, IndexedDB is authoritative within the applicable browser origin/profile. In connected mode, server/PostgreSQL state is canonical account authority. Connected IndexedDB may hold account-isolated cache and locally persisted pending work/evidence. Browser-local storage is persistent local storage, not a guaranteed backup.

## Why

Local and connected modes have different authority scopes. Neither a browser cache nor a saved aggregate is authoritative connected history.

## Consequences

Separate mutable plans from historical activity; preserve Plan Day/timezone context and distinct interval facts. Ordinary task changes preserve history; deliberate data deletion is separate. Keep v1 data isolated without automatic migration.

## Risks

Browser quota/eviction, failed writes, conflicting history, unsafe account switching and clock changes need visible handling. Specific compatibility and configuration remain deferred.

## What this decision explicitly does NOT decide

Tables, columns, indexes, SQL, storage versions, browser support matrix, backup/deletion schedules or record serialization.

## Requirements affected

FR-LOCAL-001, FR-PERSIST-001, FR-DATA-001, FR-TASK-003/004/005, FR-ACTIVITY-001, FR-ANALYTICS-001, FR-SESSION-005; OD-009.

## Later work affected

V2-005 data modeling, storage adapters, recovery/export/deletion, synchronization and report calculations.
