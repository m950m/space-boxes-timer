# V2 release preparation and local staging

This prepares the existing Django monolith for a release candidate. It selects
no hosting provider and performs no deployment. Python **3.14**, Django **5.2.18**
and PostgreSQL remain the approved runtime; Gunicorn **26.2.0** runs WSGI and
WhiteNoise **6.12.0** serves collected assets. No frontend build is required.
Dependencies are pinned in `requirements.txt`; transitive dependencies resolve
through pip. Runtime selection does not provision infrastructure.

The owner's bounded release-preparation task assigns this writer settings,
release startup/verification, tests and operations documentation in the existing
`Space_boxes_Codex` worktree, on `feature/v2-release-preparation` from freshly
fetched `origin/v2` **9b55a12baab6619479f22fe151dddd2a03f3dccc**. The checkout was
clean and no open PR overlapped this scope. No other worktree is modified.
Local branch creation/commits are authorized; publication is not recorded for
this workstream. The [workflow](../_docs/agents/v2-agent-workflow.md),
[architecture](../_docs/architecture/architecture.md) (sections 4, 8, 9, 15–16),
[PRD](../_docs/product/v2-prd.md) and OD-011/015/016 govern this implementation.

The implementation plan is to keep local HTTP development usable, fail early on
missing release credentials, preserve same-origin session/CSRF behavior, collect
only application assets, and exercise the actual release process with disposable
databases. No schema, authentication flow or user-data policy changes are made.

## Environment

Start from [.env.example](.env.example). Environment files and collected assets
are ignored. Never commit live secrets. The application does not implicitly read
dotenv files: use an owner-controlled environment or export a trusted shell file:

```bash
set -a
. /absolute/private/path/space-boxes.env
set +a
```

| Variables | Behavior |
| --- | --- |
| `DJANGO_DEBUG` | `1` by default for development; release launcher forces `0`. Booleans accept `0/1/true/false`; typos fail. |
| `DJANGO_SECRET_KEY` | Required for release, at least 50 characters with adequate variety; generate privately with `openssl rand -base64 64`. Persist across restarts; replacement invalidates sessions/recovery signatures. |
| `DJANGO_ALLOWED_HOSTS` | Required comma-separated hosts in release; no `*`. Use hostnames/IPs without scheme/port. Local development defaults to loopback names. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Optional comma-separated full HTTPS origins (including port when needed); empty for the normal same-origin boundary. No wildcard, path, query or credentials. |
| `DJANGO_TRUST_PROXY_HTTPS` | Off by default. Enable only when requests come through a trusted proxy that strips/overwrites `X-Forwarded-Proto`; prevent direct public access to the backend. Gunicorn's automatic forwarded-header trust is disabled. |
| `SPACE_BOXES_DB_NAME/USER/PASSWORD/HOST` | Required explicitly for release. Development retains existing defaults. Application role needs schema privileges for migrations, not superuser/CREATEDB for normal operation. |
| `SPACE_BOXES_DB_PORT` | Default `5434`, matching existing local setup. |
| `SPACE_BOXES_DB_SSLMODE` | Release default `require`, development `prefer`. For verified database identity use libpq `verify-full` with a trusted `PGSSLROOTCERT`. `disable` is suitable only for an isolated local test connection. Connection timeout is five seconds. |
| `SPACE_BOXES_EMAIL_HOST`, `SPACE_BOXES_FROM_EMAIL` | Required in release, using Django SMTP rather than logging recovery codes to a console. No provider selected. |
| `SPACE_BOXES_EMAIL_PORT/USER/PASSWORD` | SMTP port defaults to `587`; credentials optional according to the chosen relay. |
| `SPACE_BOXES_EMAIL_USE_TLS/USE_SSL` | STARTTLS defaults on in release; implicit TLS defaults off. Never enable both; use the port required by the relay. Ten-second send timeout. |
| `SPACE_BOXES_BIND/WORKERS` | Launcher defaults to `127.0.0.1:8000`, two workers. Keep loopback binding until the owner configures a trusted network boundary. |
| `SPACE_BOXES_TLS_CERT/KEY` | Optional absolute certificate/key paths for direct TLS, both required together. Otherwise TLS termination must be provided by the operator. |

Release cookies use Secure/HttpOnly/Lax sessions and Secure/Lax CSRF tokens.
HTTPS redirects, nosniff, DENY framing and same-origin referrer policy apply.
HSTS is one hour; subdomain/preload commitments are not made. Secure cookies and
redirects remain enabled in local staging, so use HTTPS there. Development's
plain HTTP `runserver` command and console email continue to work.

## Startup

From the repository root, using Python 3.14:

```bash
python3 -m venv v2/.venv
v2/.venv/bin/pip install -r v2/requirements.txt
v2/.venv/bin/pip check
# Export the environment above before these commands.
v2/.venv/bin/python v2/backend/manage.py check --deploy --fail-level ERROR
# Review the plan and obtain any applicable data-migration approval first.
v2/.venv/bin/python v2/backend/manage.py migrate --plan
v2/.venv/bin/python v2/backend/manage.py migrate --no-input
sh v2/scripts/start-staging.sh
```

The launcher runs deployment checks, refuses
pending migrations, collects assets and starts Gunicorn in the foreground. It
does not automatically migrate a database. Shell `set -eu`, Gunicorn preload and
stderr error logging make configuration, database, collection and worker boot
failures visible with nonzero status. Deployment errors are fatal. Django's
`security.W005` (HSTS subdomains) and `security.W021` (preload) advisories remain
visible, with no silenced checks: committing all subdomains/preload requires a
later domain decision. Configuration tests reject any other deployment finding.
No request access log is enabled. Review
server errors privately; they can contain application context. Stop with Ctrl+C
or SIGTERM and wait for shutdown.

The WSGI wrapper serves `/js/`, `/css/` and `/static/` from `v2/staticfiles`,
including admin CSS. It never mounts the frontend root or test directory;
Markdown is excluded during collection. Existing ES module URLs remain valid.
Assets revalidate (`max-age=0`) because their URLs are not fingerprinted. Startup
fails when essential collected assets are absent. The HTML and APIs pass through
Django security middleware; a hosting TLS boundary must also handle plain HTTP
and static requests. The release entrypoint is **WSGI**, not `config.asgi`.

## Reproducible local verification

With a reachable local PostgreSQL server, its client tools (`pg_dump` and
`pg_restore` matching the server version), OpenSSL and an isolated test role
with CREATEDB, export `SPACE_BOXES_DB_HOST/PORT/USER/PASSWORD` and, for a local
non-TLS database only, `SPACE_BOXES_DB_SSLMODE=disable`:

```bash
v2/.venv/bin/python v2/scripts/verify-staging.py
```

The verifier generates its own release secret and localhost TLS certificate,
creates two random databases, migrates an empty schema, checks model drift,
proves an unmigrated database prevents startup, and runs the shipped launcher.
It trusts only its generated certificate and exercises real HTTPS document,
module/admin asset, host, CSRF, registration and session requests. It then dumps
and restores the migrated account into the second database and verifies it.
It always removes its own databases; it never migrates an existing database.
Logs and synthetic backup/certificate artifacts remain in the printed private
`/tmp/space-boxes-release-*` directory. No SMTP delivery or production data is used.

Run the affected settings/session/API regressions with development defaults
against a PostgreSQL role allowed to create a test database:

```bash
DJANGO_DEBUG=1 v2/.venv/bin/python v2/backend/manage.py test config accounts productivity
git diff --check
```

Inspect the staging URL in a browser for a ready Planner/Focus panel and module
loading. Existing browser-domain suites run under the repository's CI; no
frontend behavior was changed here. Actual SMTP delivery, public DNS/TLS,
network boundaries and production credentials require validation in the owner's
chosen environment. These are not established by local staging.

## Backup and rollback

No backup service, retention period or storage location is selected (OD-015/016).
The operator must decide protected storage, encryption, access, retention and
deletion handling before production use. A browser cache is not a server backup.

Before a release involving persistent data, take a PostgreSQL custom-format dump
with matching client tools and privately configured `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD` (or a protected `.pgpass`) and `PGSSLMODE`. Keep passwords out of
command arguments. Choose the private backup path and database name explicitly:

```bash
umask 077
pg_dump --format=custom --no-owner --no-acl --file=/private/backup/v2.dump "$SPACE_BOXES_DB_NAME"
# Restore into a NEW, isolated empty database, never over a live database.
createdb space_boxes_restore_review
pg_restore --exit-on-error --no-owner --no-acl --dbname=space_boxes_restore_review /private/backup/v2.dump
```

Verify the restored migration ledger and expected records, then run deployment
checks and staging smoke with the matching application revision against that
database. Retain the exact code commit and a protected copy of the corresponding
configuration separately from the dump. `--no-owner/--no-acl` deliberately omits
role grants; the owner must separately preserve/reapply necessary roles and
privileges. The automated verifier exercises this dump/restore path locally.

This batch adds no migrations. For a code rollback, stop the candidate process,
prepare the last known compatible revision in an authorized separate checkout,
install its pinned dependencies, and use its matching startup procedure and
configuration. Recollect its assets and verify it before a human changes traffic.
Do not assume older code understands a later database schema; inspect migration
compatibility before using a shared database. Do not automatically reverse
migrations or restore into live data. Database rollback requires a reviewed
restore/cutover plan and explicit approval: it can lose newer work and resurrect
deleted accounts or revoked sessions. Reconcile deletion/revocation obligations
before exposing a restored instance. No retention or legal policy is invented.

## Remaining owner decisions and release gates

Hosting/runtime supervision, domain/TLS/proxy boundary, PostgreSQL credentials
and transport, recovery-mail relay and verified delivery, backup policy/storage
and recovery ownership remain operator/owner work. Report scheduling is still
unimplemented, as recorded in README; this batch does not supply infrastructure.
Original artwork and human accessibility/device/Firefox acceptance remain
governed by [the visual acceptance record](frontend/FINAL-VISUAL-ACCEPTANCE.md).
Local checks do not grant production readiness or deployment authorization.

## Executed validation — 2026-10-16

- Python 3.14.4, Django 5.2.18, PostgreSQL 16.15; Gunicorn 26.2.0 and
  WhiteNoise 6.12.0 installed from the pinned requirements. `pip check` passed.
- `manage.py test config accounts productivity`: **93 tests passed** (14
  configuration/HTTP smoke and release tests, 79 connected backend regressions).
  Log: `/tmp/space-boxes-release-tests.log`.
- `PATH="/usr/lib/postgresql/16/bin:$PATH" v2/.venv/bin/python
  v2/scripts/verify-staging.py`: **all seven verification groups passed**, including
  actual foreground Gunicorn/HTTPS, deployment checks, fresh migrations/no model
  drift, rejected unmigrated startup, collected assets/private-path exclusion,
  real account/session/CSRF/host enforcement, and dump/restore into a second
  isolated database. Both disposable databases were removed. Logs:
  `/tmp/space-boxes-release-staging.log` and
  `/tmp/space-boxes-release-7eaxccec/{commands,server}.log`.
- Deployment checks reported only the two documented HSTS domain advisories,
  `security.W005` and `security.W021`; zero checks silenced. A test asserts that
  these are the only deployment findings. No new domain policy was selected.
- `sh -n`, whitespace and V1 isolation checks passed. The actual diff was reviewed
  against release scope, security behavior, startup failures and documentation.
  All ten changed files are inside `v2/`; no frontend/domain/schema changes.
- Initial validation found missing clickjacking middleware; it was added and
  the affected tests passed afterward. The verifier's registration expectation
  was corrected to the API's existing **201** contract. The system's default
  PostgreSQL 18 dump client produced a restore-incompatible dump for the local
  PostgreSQL 16 server; selecting matching installed v16 clients resolved it on
  the next bounded attempt, without filtering SQL or weakening restore errors.
- No browser suite was repeated because frontend behavior is unchanged. Actual
  SMTP delivery, external TLS/proxy behavior, production restoration/cutover and
  the existing human visual/accessibility gates were not executed. No remote CI
  run is claimed for this unpublished branch.

Implementation references: [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
and [WhiteNoise WSGI API](https://whitenoise.readthedocs.io/en/stable/base.html).
