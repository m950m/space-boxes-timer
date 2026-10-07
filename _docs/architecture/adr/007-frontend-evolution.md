# ADR-007 — Frontend evolution

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

V1 has separated Vanilla JavaScript domain, timer, storage and DOM modules, but its lifecycle/history/authority behavior differs from approved v2.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-TASK-001–006, FR-SESSION-001–007, FR-LOCAL-001, FR-FOCUS-001/002, FR-VISUAL-001/002, FR-A11Y-001, FR-ANALYTICS-001.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Evolve/refactor modular Vanilla JavaScript

**Pros:** Retains useful ES-module separation and limits migration/learning overhead; domain adapters and pure rules remain testable without a framework rewrite.

**Cons:** Growing state, synchronization and rendering require disciplined boundaries and evidence-based maintenance review.

### Option B — Rewrite into React or another SPA framework now

**Pros:** Component/state conventions and ecosystem tools may help a larger interface.

**Cons:** Adds tooling/learning/rewrite cost and risks replacing known separation before the product demonstrates that need; a framework does not enforce session authority.

## Approved decision

**APPROVED DIRECTION:** Evolve Vanilla JavaScript with explicit presentation, domain, persistence, synchronization and capability boundaries.

## Why

Current product size and existing separation support incremental evolution. Visual redesign and connected behavior require real changes, but do not independently justify a total framework rewrite.

## Consequences

Reuse only modules/utilities consistent with v2 semantics; replace incompatible v1 lifecycle, persistence, authority and statistics semantics rather than retaining them merely for reuse. Keep DOM outside domain logic. Accessible visual work handles Primary and Extra/subtask focus distinctly. Client checks may improve immediate UX, but connected security/concurrency/account invariants are enforced server-side; client and server are not independent authoritative rule sets. Major visual redesign is compatible with retaining Vanilla JavaScript. This choice does not prohibit package tooling, justified bundling, automated/browser testing or modular build tooling; selections remain later decisions. No tests are created by this task.

## Risks

Duplicated local/server rules may drift; custom state coordination may become expensive. Reconsider frontend-framework migration if implementation evidence shows manual rendering/state coordination has become a material correctness or maintenance problem; popularity alone is not a trigger. Browser accessibility and reduced-motion behavior require later validation, not assumed conformance.

## What this decision explicitly does NOT decide

UI layout/artwork, component inventory, bundler/package selection, routing, specific test tools or any application edits.

## Requirements affected

FR-TASK-001–006, FR-SESSION-001–007, FR-LOCAL-001, FR-FOCUS-001/002, FR-VISUAL-001/002, FR-A11Y-001, FR-ANALYTICS-001.

## Later work affected

Frontend implementation, visual/accessibility design, state-adapter contracts and later testing.
