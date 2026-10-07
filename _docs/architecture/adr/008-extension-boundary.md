# ADR-008 — Future extension boundary

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

The approved Chromium-first distraction aid ships after core public v2, is opt-in and must work as an optional capability rather than account/focus authority.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-EXT-001–003, FR-RESOURCE-001, FR-FOCUS-001/002, FR-LOCAL-001, FR-RELEASE-001; OD-012–014/018–020/024; AC-004/008/019.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Optional core-to-extension client capability adapter

**Pros:** Supports account-free local use, bounded exchanges and independent core delivery/availability.

**Cons:** Origin association, stale state, permissions and browser lifecycle require later security/compatibility design.

### Option B — Backend-mediated extension integration as the primary bridge

**Pros:** Could coordinate account-associated configuration where appropriate.

**Cons:** Adds account/network dependence for local capability and does not itself enforce browser blocking; unnecessary core coupling.

## Approved decision

**APPROVED DIRECTION:** A future optional core-to-extension client capability adapter consuming accepted session state and consented domain policy, separate from authentication authority and focus authority. It remains optional, Chromium-first, released after core public v2 and unnecessary for core planning/focus operation.

## Why

Core must remain useful without the extension. Local account-free work and privacy minimization favor a bounded client capability boundary without selecting a browser messaging mechanism.

## Consequences

Prepare conceptual session/configuration/exception/exposure/availability seams only. Validate expected source/origin where applicable, message shape, purpose, relevant association and freshness. A client message alone is not proof of authority. Use least-privilege permission design without selecting actual permissions. Exchange no credentials, private notes, page content or unrelated/full-URL browsing history. Blocking enforcement and exposure measurement are separate. A blocking-rule match is not proof of browsing duration, attention or interruption. Exposure is minimum configured-domain start/end/duration/session facts with permission; it is not automatically interruption. Avoid arbitrary-page content injection as the default because it broadens exposure. Server involvement follows ordinary account synchronization, not local blocking prerequisites.

## Risks

Connection can be mistaken for applied protection. Restart, transfer, revocation and stale rules need truthful status; controlled necessary-resource exceptions need warning, obvious exposure timing and non-color prolonged cues. Extension reachability/connection does not confirm active blocking protection. Exact browser API/permission behavior remains unselected and unasserted.

## What this decision explicitly does NOT decide

Browser APIs, messaging mechanism/payloads, exact permissions, manifest details, Chrome version matrix, distribution mechanism, extension authentication/credentials, pause/break blocking policy, exception durations or exposure aggregation.

## Requirements affected

FR-EXT-001–003, FR-RESOURCE-001, FR-FOCUS-001/002, FR-LOCAL-001, FR-RELEASE-001; OD-012–014/018–020/024; AC-004/008/019.

## Later work affected

Later extension design/security review, client capability integration, privacy validation and extension acceptance; core release stays independent.
