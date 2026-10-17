# Space Boxes V2 candidate

**Implemented and locally validated; not released.** Isolated public staging,
Supabase staging persistence and actual inbox delivery remain unverified.
Production `space-boxes-bdd48` and the current Supabase `space-boxes` project
have not been accessed or changed by this work.

## Feature parity

| Requirement | Implementation and local evidence |
| --- | --- |
| Single branded interface | Editable React builds into Django's image; `/classic` redirects `/`. Original character, three cubes and focus artwork retained. |
| Accounts | Registration → verification → login, resend, recovery, logout/all, export and password-confirmed deletion in the Account dialog. Real browser lifecycle with private file email; SMTP rollback and token races covered in Django tests. |
| Planning | Day/timezone, three primary slots, extras/subtasks, scheduling, notes, safe links, ordered sessions/breaks, editing, completion and cancellation in Planner. Shared IndexedDB services locally; Django revisions in accounts. |
| Focus | Canonical running/paused reservation, confirmed evidence, observer/recovery/transfer, explicit end and task completion. Reload and second tab/device coverage. Failed writes remain unconfirmed. |
| History/reports | Frozen starting snapshots, outcomes, confirmed/planned focus, pauses, interruptions, unknown/uncertain time, reconciliation and task/day totals. No wall-clock subtraction used as confirmed focus. |
| Settings/accessibility | Quiet/system reduced motion, saved browser session defaults, account report/domain preferences, visible mobile navigation and accessible dialogs. |
| Persistence/import | Explicit non-destructive local import, durable account-bound acknowledgements, revision conflicts, real PostgreSQL persistence and container restart checks. |

Backend fixes discovered through the real UI: closed evidence now advances its
sync revision; ended history can be reconciled; configuration/preferences return
their saved records; cancelled priorities free capacity. React imports the
existing planning, focus controller and evidence/report projections.

## PR #68 review

Its email implementation is integrated and hardened here; PR #68 was not merged
remotely. Migration `accounts.0002` is additive: existing active users are
grandfathered as verified, passwords and sessions survive, disabled users remain
disabled. Resend cannot activate a legacy disabled account. New accounts stay
inactive until a hashed, single-use, 24-hour token is redeemed; redemption does
not log in. User locks precede token locks. Verification URLs use fragments so
tokens do not enter access logs. A configured HTTPS `SPACE_BOXES_PUBLIC_WEB_URL`
is mandatory in release mode. SMTP registration failure rolls back the account;
resend/recovery remain neutral and failed sends do not consume valid tokens.
Provider exceptions and token/password values are not logged.

## Reproduce validation

Use Python 3.14, Node 22.14.0, PostgreSQL 18, Docker Compose and Chrome:

```sh
python3 -m venv v2/.venv
v2/.venv/bin/pip install -r v2/requirements-release.txt
v2/.venv/bin/pip install -r v2/requirements-validation.txt
npm --prefix v2/react-frontend ci
v2/.venv/bin/python v2/scripts/verify-local-product.py
v2/.venv/bin/python v2/scripts/verify-container.py
v2/.venv/bin/python v2/scripts/validate-openapi.py
```

Local results: **112 Django tests**, migration upgrade/legacy session and drift
checks, React typecheck/production build, **4 real browser tests**, **3 mocked
browser failure tests**, **5 mocked transport tests**, and HTTPS container
startup/security/restart/export/deletion checks passed. OpenAPI covers all 16
paths; 25 real HTTPS captures matched its request/response schemas. PostgreSQL
tests include racing focus starts, verification redemption and first throttles.
Existing browser suites also passed 128 domain, 48 persistence/restart and 17
mocked-sync checks; legacy presentation regressions run only as test fixtures.
Chrome/axe checks cover mobile layout, keyboard dialogs, reduced motion and
WCAG 2 A/AA and 2.1 AA rules on home/account/settings/planner.
Runtime `pip-audit` 2.10.1 and npm audit found no known dependency vulnerabilities
at this checkpoint; these checks are also in CI.

`.github/workflows/v2-product-ci.yml` repeats disposable validation and container
packaging without deployment. The obsolete mocked UI smoke harness is replaced
by separately labeled real and mocked tests. Generated assets/dependencies,
private mail, browser traces and credentials are not committed.
The pre-React `verify-staging.py` entry point is retired and fails before reading
database settings; use the disposable runners above. Its historical backup and
older-code rehearsal is not current V2 release evidence.

## Isolated staging setup and required inputs

One image contains React + Django/Gunicorn/WhiteNoise; PostgreSQL stays Supabase.
Use a **new, approved** SnapDeploy container and isolated Supabase staging project
or database with no production data. If another free SnapDeploy container is
unavailable, [render.yaml](deploy/render.yaml) prepares an isolated Render Free
web service with automatic deploys off. Its public JSON schema validates; no
provider resource has been created or synchronized.

The exact variable names, blank secret fields and safe defaults are in
[staging.env.example](deploy/staging.env.example). Generate a new Django secret
of at least 50 random characters. Set the staging HTTPS origin/hosts, isolated
database connection and staging-specific SMTP credentials in that container's
private runtime settings. Supply `PGSSLROOTCERT` with `verify-full` when the
database CA can be mounted. Keep the Supabase Data API disabled for this isolated
Django database, or explicitly exclude its tables from API grants; the browser
must not receive Supabase keys or database credentials.

Build from the exact reviewed commit:

```sh
docker build --platform linux/amd64 -f v2/Dockerfile -t space-boxes-v2:review v2
```

A manual packaging workflow publishes
an immutable `snapdeploy-<commit>` tag; record/use its resolved digest for staging.
Do not select its production promotion input. No current watched image tag is
updated automatically. On the **approved empty staging database only**, run
`manage.py migrate --plan`, review, then `migrate --noinput` using that exact image
and privately supplied staging environment. Startup refuses pending migrations
and never runs them automatically. A free Render service has no shell: run the
one-off migration from an approved machine using the same image. Start the image,
verify HTTPS/proxy behavior and secure cookies, then exercise the browser flow
with a designated test inbox. Verify actual verification/recovery receipt, login
from a second device, refresh/restart persistence, recovery/uncertainty, export
and deletion of **only synthetic staging accounts**. Record the image digest,
test outcomes and operational constraints before requesting production approval.

## Free-tier constraints and remaining risks

[Render Free](https://render.com/docs/free) sleeps after 15 idle minutes, can take
about a minute to wake, has ephemeral disk and 750 workspace instance hours/month.
It blocks SMTP ports 25/465/587. [Brevo supports STARTTLS on port
2525](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525),
which is prepared here but still needs real network/mail verification.
[Supabase Free](https://supabase.com/pricing) has a 500 MB database limit, two
projects and inactivity pausing; use its [session pooler on
5432](https://supabase.com/docs/guides/database/connecting-to-postgres) where IPv4
is required. Provider quotas and existing account entitlements must be checked
before provisioning. Do not enable paid plans, overages or additional capacity.

Public staging, external SMTP delivery, provider TLS/network boundaries and
production role/API-grant isolation are not established by local tests. No
approved test inbox or separate staging database currently exists. Browser
validation uses Chrome; human screen-reader, touch-device and other-browser
acceptance remain to be performed. Email report preferences are persisted, but
the existing backend has no report-delivery scheduler; no delivery is claimed.
Production migration/cutover requires separate explicit approval and a reviewed
backup/rollback plan; never reverse migrations or restore over current data.
