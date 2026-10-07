# ADR-004 — Authentication

Status:
APPROVED — OWNER TECHNICAL APPROVAL RECORDED

## Context

The first-party web product offers optional secure accounts without imposing authentication on local planning/focus.

Owner technical approval records this architecture direction only; implementation is neither authorized nor completed by this decision. Owner review verified the general architecture-level capabilities needed for the decision. Specific versions, compatibility matrices, exact security configuration/API behavior, benchmarks, deployment guarantees and unselected extension permission behavior remain deferred and are not asserted here.

## Product requirements / constraints

FR-AUTH-001, FR-LOCAL-001, FR-ADMIN-001, FR-DATA-001, FR-PERSIST-001, FR-FOCUS-002.

Product policy remains unchanged. See [architecture.md](../architecture.md) and the approved [PRD](../../product/v2-prd.md).

## Options considered

### Option A — Server-side session state identified by a secure cookie

**Pros:** Opaque server-side sessions support revocation and keep the credential unavailable to ordinary page JavaScript when HttpOnly is used.

**Cons:** Requires CSRF protection and correct cookie/origin handling; XSS can still perform authenticated actions.

### Option B — Client-held bearer authentication in JavaScript-accessible storage

**Pros:** Can suit clients needing portable bearer credentials and independently verified tokens.

**Cons:** Browser-accessible storage exposes tokens to script compromise; expiry/refresh/revocation complexity remains and is unnecessary for this first-party web boundary.

## Approved decision

**APPROVED DIRECTION:** Use opaque server-side revocable session state identified by a Secure/HttpOnly browser cookie for connected first-party web accounts. The cookie identifies the session; server-side state owns the authentication session. Preserve HTTPS, appropriate SameSite, CSRF protection, server-side authorization, rotation/revocation, verified recovery, rate limiting and sensitive-action reauthentication.

## Why

This fits revocable web access and narrow administration without making bearer-token storage a default. The rejected default is JavaScript-accessible client-held bearer authentication, not JWT as a token format. Other token/cookie arrangements have different threat models but no demonstrated need for this first-party architecture at this stage. Authentication session and focus-session authority are separate; cross-device login does not grant focus ownership.

## Consequences

Enforce ownership/permissions server-side, rotate/revoke authentication sessions, use verified-email temporary single-use rate-limited recovery and consider generic recovery responses. Recommend recent reauthentication for credential/recovery-channel changes and account deletion; ordinary edits/cross-device use require no repeated email verification.

## Risks

Cookie attributes do not solve XSS or object authorization. Recovery/email compromise, operator access and logout versus ongoing focus require explicit handling. HttpOnly does not solve XSS.

## What this decision explicitly does NOT decide

Authentication library/provider, credential type, registration verification timing, numeric lifetimes/rate limits, precise cookie policy, extension authentication/credentials or endpoints.

## Requirements affected

FR-AUTH-001, FR-LOCAL-001, FR-ADMIN-001, FR-DATA-001, FR-PERSIST-001, FR-FOCUS-002.

## Later work affected

Identity/security implementation, authorization tests, recovery workflow and ongoing-session revocation design.
