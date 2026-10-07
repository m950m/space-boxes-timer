# ADR-002 — Backend stack

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

Optional accounts, narrow support administration, relational history, migrations and report processing need a maintainable backend.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-AUTH-001, FR-ADMIN-001, FR-PERSIST-001, FR-DATA-001, FR-FOCUS-001/002, FR-ANALYTICS-001/002.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Django

**Pros:** Its integrated account, authentication, authorization, administration, ORM/migration and application/testing facilities are a good fit for these needs; fewer independent components to assemble.

**Cons:** Framework conventions and customization require learning; generic administration must be restricted and report scheduling still needs design.

### Option B — FastAPI

**Pros:** API-oriented composition, type-driven validation and async options can suit a deliberately API-centric backend.

**Cons:** Authentication lifecycle, administration, ORM/migrations and background reliability require additional composition/choices; flexibility raises maintenance burden here.

## Approved decision

**APPROVED DIRECTION:** Django as the backend framework within the modular monolith. Connected persistence is decided separately by ADR-003.

## Why

The recommendation follows required account/admin/relational capabilities and small-team maintenance, not popularity. Async throughput is not a demonstrated deciding requirement.

## Consequences

Use Django domain/authorization boundaries rather than exposing every model in an admin UI. Begin report processing with scheduled processing using the backend application codebase; no separate queue/broker platform is initially required. Durable retry, deduplication, failure recording and recovery remain responsibilities. Choosing Django does not select a durable worker system. Separate recovery-mail dispatch from scheduled report batches.

## Risks

Framework security defaults are insufficient without correct configuration and object authorization. Scheduled jobs require durable state, monitoring and recovery.

## What this decision explicitly does NOT decide

Framework version, API toolkit, authentication libraries/provider, scheduler, mail vendor, queue library, job frequency, deployment or application scaffold.

## Requirements affected

FR-AUTH-001, FR-ADMIN-001, FR-PERSIST-001, FR-DATA-001, FR-FOCUS-001/002, FR-ANALYTICS-001/002.

## Later work affected

Backend implementation, authorization/security review, V2-005 modeling, report processing and operations.
