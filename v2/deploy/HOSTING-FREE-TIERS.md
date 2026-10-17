# Free-tier hosting readiness — Render Free web service + Supabase Free PostgreSQL

Prepared for the owner's zero-cost constraint. **Nothing is deployed, no
account exists, and no cloud resource has been created by this delivery**;
[render.yaml](render.yaml) is a declaration that applies only when the owner
creates a Render Blueprint instance. All external limits below were checked
from official sources on **2026-10-17** and must be re-verified before
deployment because free plans change. The application behavior described here
was verified by the actual container rehearsal ([CONTAINERS.md](../CONTAINERS.md));
the provider wiring itself is **UNVERIFIED** until the owner tests connectivity.

## Selected split and why

| Concern | Choice | Reason |
| --- | --- | --- |
| Web application | Render **Free web service** (Docker runtime) | Runs the existing digest-pinned image unchanged; free Postgres on Render expires after ~30 days, so it is not used. |
| PostgreSQL | **Supabase Free** project | Free tier keeps data resident (500 MB limit); TLS required by default; session pooler included. |
| Static assets | WhiteNoise from the image (unchanged) | No CDN, no extra service, same-origin boundary preserved. |
| Email | None selected (owner gate) | Neither provider offers outbound SMTP; recovery mail needs an owner-chosen relay ([RELEASE.md](../RELEASE.md) environment table). |

Free plans are explicitly **not production-grade**: expect spin-down, cold
starts, restarts at any time, and possible suspension. This is acceptable for a
course demonstration of the connected product, not a hosting commitment.

## Verified free-plan facts (official sources, 2026-10-17)

Render ([Deploy for Free](https://render.com/docs/free), [Health checks](https://render.com/docs/health-checks)):
750 free instance hours per workspace per month; a free web service **spins
down after 15 minutes without inbound traffic** and the next request waits
roughly a minute; the filesystem is **ephemeral across restarts and
redeploys**; services may be **restarted at any time** and suspended for
unusually high outbound traffic; no SSH/shell on free; **rollbacks reach only
the two most recent previous deploys**. Render uses its own HTTP
`healthCheckPath` probe and **ignores the Dockerfile `HEALTHCHECK`
instruction** (ours targets the self-TLS loopback stack and is inert on
Render). Sources also report the free bandwidth allowance was reduced to
about 5 GB in 2026 — verify in the dashboard before public demos.

Supabase ([pricing](https://supabase.com/pricing)): two active free projects;
**500 MB database**; **projects pause automatically after one week of
inactivity** and must be restored from the dashboard; TLS required for
database connections; the Supavisor pooler offers **session mode on port
5432** and transaction mode on 6543; **no automated backups on the free plan**.

## Application wiring (Render)

[render.yaml](render.yaml) declares the service; during Blueprint setup the
owner points Render at this file's path (`v2/deploy/render.yaml`), since only
the root location is auto-detected. Its `dockerfilePath`/`dockerContext` are
repo-root-relative. Key mappings, all using the
existing [RELEASE.md](../RELEASE.md#environment) variables — no settings code
changed for hosting:

- **HTTPS and trusted hosts/origins.** TLS terminates at Render's edge. The
  container runs without `SPACE_BOXES_TLS_CERT/KEY`, so Gunicorn serves plain
  HTTP to the proxy; `DJANGO_TRUST_PROXY_HTTPS=1` sets
  `SECURE_PROXY_SSL_HEADER`, restoring Secure cookies and SSL redirects behind
  the proxy. Set `DJANGO_ALLOWED_HOSTS` and `DJANGO_CSRF_TRUSTED_ORIGINS` to
  the exact `*.onrender.com` host/origin. Per RELEASE.md this trust flag is
  valid **only while the Render proxy is the sole ingress**; no direct public
  route to the container exists on Render. `SECURE_SSL_REDIRECT` stays on from
  release settings.
- **Port.** `SPACE_BOXES_BIND=0.0.0.0:10000` matches Render's expected port.
- **Startup.** The image command runs deployment checks, refuses pending
  migrations, collects static assets (into the container's writable
  filesystem — fine because the app is stateless) and starts Gunicorn with
  preload. `healthCheckPath: /` gates deploys on the real document response.
- **Secrets.** `DJANGO_SECRET_KEY` uses Blueprint `generateValue`; all
  database/SMTP values are `sync: false` prompts, entered privately by the
  owner. No secret is committed.

## Database wiring (Supabase)

- **TLS.** `SPACE_BOXES_DB_SSLMODE=require` (release default). For verified
  server identity use `verify-full` with Supabase's CA certificate per
  [RELEASE.md](../RELEASE.md#environment); `require` alone does not authenticate the server.
- **Pooling.** Use the **session-mode pooler** (`aws-0-<region>.pooler.supabase.com:5432`,
  user form `<role>.<project-ref>`). Django's default `CONN_MAX_AGE=0` (no
  persistent connections) is already pooler-safe. Transaction mode (6543) is
  not recommended for Django here: psycopg's server-side prepared-statement
  reuse can conflict with transaction pooling; do not enable it without a
  tested basis. Exact pooler hostname/username format must be confirmed in the
  owner's Supabase dashboard — treat as UNVERIFIED.
- **Dedicated role.** Create an application role (e.g. `spaceboxes`) in the
  Supabase SQL editor with a SCRAM password, schema usage/create grants and no
  superuser/CREATEDB/CREATEROLE, mirroring the container stack's
  [deploy/database-init.sh](database-init.sh). Never point the app at the
  `postgres` role for routine operation.
- **Persistent user data.** All connected records, sessions and focus
  authority live in Supabase (canonical per architecture section 9). Render's
  ephemeral filesystem is safe for this split: spin-down/restart loses nothing
  but collected static files, which the launcher recollects at every start.
- **Migrations.** Never automatic. Because Render Free has no shell, apply
  reviewed migrations **from a local machine** using
  `v2/.venv/bin/python v2/backend/manage.py migrate --no-input` against the
  Supabase target (with `--plan` reviewed first), or from a temporary manual
  run of the same image; the launcher's `migrate --check` then passes at
  deploy time.

## Cold starts, pauses and free-plan behavior

- A spun-down service adds roughly a minute to the first request; browser
  flows simply wait. Sessions are server-side in PostgreSQL, so spin-down does
  not log users out. In-memory state is none; focus authority is transactional
  server state.
- A Supabase project that receives no API activity for a week pauses and the
  application then fails its database connections until the owner restores the
  project from the dashboard. Routine use or a scheduled owner check avoids
  this; there is no supported always-on workaround on free.
- 750 instance-hours covers one always-on free service; two concurrent free
  web services would exhaust it.

## SMTP and password recovery

Registration and login work without SMTP; recovery codes are sent by Django
SMTP using the [RELEASE.md](../RELEASE.md#environment) variables. On free
tiers there is no built-in relay: the owner must select and verify one
(deliverability, sender authentication, credentials) — an explicit owner gate
in RELEASE.md's decision table, unchanged here. Until then, recovery
endpoints behave correctly (generic responses) but cannot deliver mail.

## Backup and recovery

Supabase Free has **no automated backups**. Before any change involving
persistent data, take a custom-format dump from a trusted machine using the
[RELEASE.md backup/restore procedure](../RELEASE.md#backup-and-rollback) (or
`pg_dump` inside the local container stack against the same logical data),
restore only into a **new isolated database**, and verify before any cutover.
Supabase's dashboard pause/restore is a platform convenience, not a backup:
treat project deletion, quota changes and pause as potential data-loss events
and keep dumps outside both providers. Session revocation and deletion
obligations must be reconciled before exposing restored data, per RELEASE.md.

## Operations: logs, health, incidents

Consistent with the actual architecture — no Prometheus/Grafana/Sentry, no new
health endpoint, no telemetry service:

- **Logs.** The launcher sends Gunicorn error diagnostics to stdout/stderr
  (`--error-logfile - --capture-output`), visible in Render's **Logs** tab;
  request access logging stays disabled under release policy, so logs contain
  errors, not user traffic. Treat logs as private (they can contain
  application context; never paste them into public issues).
- **Health.** Render polls `healthCheckPath: /` during deploys and at runtime
  and restarts unhealthy instances; Docker health checks are ignored. This is
  liveness of the document path, **not** a database check — database failure
  appears as application errors in logs. The image's own health command (real
  HTTPS document + `SELECT 1` over verified TLS) remains available inside the
  container stack and as a manual probe (`docker compose exec` or local run),
  not as a hosted telemetry feature.
- **Bounded incident response.** (1) Read Render logs and service status; (2)
  distinguish deploy failure (build/deploy checks) from runtime failure
  (health probe restarts) from database failure (connection errors after a
  Supabase pause/quota event); (3) recover a bad deploy with Render's rollback
  (two most recent deploys) or a redeploy of the recorded good commit; (4)
  restore a paused Supabase project from its dashboard, then verify sign-in
  and data before announcing recovery; (5) for data-damaging events, stop,
  restore into a new database per the backup procedure and involve the owner
  before cutover. Escalate anything outside these steps to the owner — no
  automated remediation, no alerting infrastructure is claimed.
- **Security verification for this hosting path.** Before public use, re-run
  the container rehearsal against the deployed URL expectations, confirm
  Secure/HttpOnly/Lax cookie flags over the public HTTPS origin, confirm
  untrusted-Host requests fail (400), confirm `/tests/`, Markdown and settings
  paths are not served, and verify no secret appears in Render's dashboard
  logs. Browser suites and the OpenAPI captures remain local/CI evidence; a
  public URL does not by itself establish new functional coverage.

## Remaining owner gates (unchanged from RELEASE.md)

Provider account creation, Blueprint application, domain decision (or
accepting `*.onrender.com`), SMTP relay selection, secret storage/rotation,
first real migration against Supabase, a first backup, and the production
release/deployment authorization itself. This document prepares those steps;
it does not execute them.
