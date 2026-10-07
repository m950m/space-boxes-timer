# ADR-001 — Architecture style

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

The product needs local entry, optional accounts, shared session authority and future browser capability integration under solo/small-team constraints.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-LOCAL-001, FR-PERSIST-001, FR-FOCUS-001/002, FR-ADMIN-001, FR-ANALYTICS-001/002, FR-EXT-001–003.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Modular monolith

**Pros:** One domain deployment/codebase simplifies transactional account/session changes, testing and operation.

**Cons:** Boundaries require discipline; scaling and deployment are shared.

### Option B — Microservices

**Pros:** Independent deployment/scaling can serve genuinely independent mature workloads.

**Cons:** Adds network failures, cross-service consistency, credentials and operational burden before demonstrated need.

## Approved decision

**APPROVED DIRECTION:** A modular monolith with explicit planning, focus, identity, persistence, reporting and capability boundaries.

## Why

Account/session consistency matters now; independent service ownership and scaling are not established needs. Browser and future extension clients do not require backend microservices.

## Consequences

Use cohesive domain modules and shared transactional boundaries where cross-module invariants require atomic consistency. Scheduled work uses the same backend codebase; independent process scheduling is not a service decomposition.

## Risks

An unstructured monolith can erode boundaries. Service extraction may be reconsidered only when real operational evidence demonstrates a need for independent deployment/scaling; no extraction thresholds are selected.

## What this decision explicitly does NOT decide

Package layout, service extraction criteria, deployment topology, schemas, endpoints or implementation.

## Requirements affected

FR-LOCAL-001, FR-PERSIST-001, FR-FOCUS-001/002, FR-ADMIN-001, FR-ANALYTICS-001/002, FR-EXT-001–003.

## Later work affected

Backend organization, V2-005 domain modeling, testing boundaries and later operations.
