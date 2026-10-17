# V2 release preparation and local staging

Current React product candidate, executable gates and isolated staging inputs:
[RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md). The checkpoint below is historical;
current packaging requires the React build, and development mail uses a private
test backend rather than logging recovery tokens to the console.

For the subsequently added provider-independent Docker stack, TLS/container
rehearsal and implemented OpenAPI contract, see [CONTAINERS.md](CONTAINERS.md).
Prepared (not applied) zero-cost hosting configuration for Render Free and
Supabase Free, with operations and incident procedures, is in
[deploy/HOSTING-FREE-TIERS.md](deploy/HOSTING-FREE-TIERS.md). The current
[course evidence map](PROJECT-EVALUATION.md) and
[technical delivery record](TECHNICAL-COMPLETION.md) distinguish completed
artifacts from owner-only publication, course and production gates. The original
validation/checkpoint below is historical for its recorded revision; PR #61 and
the IndexedDB stabilization in PR #62 are now merged into the supplied
`d85353bf02f094c49c735be17598393871493398` integration baseline.

This prepares the existing Django monolith for a release candidate. It selects
no hosting provider and performs no deployment. Python **3.14**, Django **5.2.18**
and PostgreSQL retain the existing runtime choices; Gunicorn **26.2.0** runs WSGI and
WhiteNoise **6.12.0** serves collected assets. No frontend build is required.
Direct dependencies are pinned in `requirements.txt`. The release lock
`requirements-release.txt` also pins every transitive dependency and wheel hash
for **CPython 3.14, Linux x86_64, glibc >= 2.17**. Other platforms require a reviewed
artifact lock; this staging target does not select hosting.

The owner's bounded release-preparation task assigns this writer settings,
release startup/verification, tests and operations documentation in the existing
`Space_boxes_Codex_ReleaseEngineering` worktree, on
`feature/v2-release-engineering-delivery` from freshly fetched `origin/v2`
**2e9d73dab33ceedb4000f546c7317ee8ae36c56e**. The checkout was clean and no open
PR overlapped this scope. Earlier local release work at
`71f4e38c4c611c334c0776610357c3428878cce6` was preserved and cherry-picked as
`671838b004ea64f9f325f59325d6fa5f026c805c`. No other worktree is modified;
Zcode browser runners and Antigravity QA harnesses are outside this assignment.
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
v2/.venv/bin/pip install -r v2/requirements-release.txt
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
Direct WSGI startup defaults to release mode and requires release credentials;
development `runserver` still uses explicit/default development settings.

## Packaging

Package a committed revision, rather than the working directory. From the repo
root, choose an existing private output directory and an exact commit:

```bash
RELEASE_REF=$(git rev-parse HEAD)
git archive --format=tar --prefix=space-boxes-v2/ --output=/private/release/source.tar "$RELEASE_REF" v2
gzip -n /private/release/source.tar
sha256sum /private/release/source.tar.gz
v2/.venv/bin/pip download -r v2/requirements-release.txt --dest /private/release/wheels
# On the same Python/OS/architecture, install without registry access:
v2/.venv/bin/pip install --no-index --find-links=/private/release/wheels -r v2/requirements-release.txt
```

`git archive` includes only committed `v2/` files: no V1 files, local environment,
venv, collected assets or database dumps. `gzip -n` omits variable name/time
metadata. Preserve the commit, archive checksum, lock and wheels together;
collect static assets at startup. No registry service or container is required.

For dependency updates, review direct pins and resolved transitive versions in a
clean matching environment, download only wheels, and use `pip hash` on each
artifact to update the lock. Reinstall from that lock and run `pip check`, backend
tests and the staging rehearsal. Startup must not resolve unbounded dependencies.

## Reproducible local verification

Historical procedure below: `verify-staging.py` is retired. Use the disposable
React/PostgreSQL and HTTPS container gates in [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md).

With a reachable local PostgreSQL server, its client tools (`pg_dump` and
`pg_restore` matching the server version), OpenSSL and an isolated test role
with CREATEDB, export `SPACE_BOXES_DB_HOST/PORT/USER/PASSWORD` and, for a local
non-TLS database only, `SPACE_BOXES_DB_SSLMODE=disable`:

```bash
v2/.venv/bin/python v2/scripts/verify-staging.py \
  --rollback-ref 671838b004ea64f9f325f59325d6fa5f026c805c \
  --pg-bin /usr/lib/postgresql/16/bin
```

The verifier generates its own release secret and localhost TLS certificate,
creates two random databases, migrates an empty schema, checks model drift,
proves an unmigrated database prevents startup, and runs the shipped launcher.
It trusts only its generated certificate and exercises real HTTPS document,
module/admin asset, host, CSRF, registration and session requests. It then dumps
and restores the migrated account into the second database. Finally it extracts
the specified ancestor revision into its private temporary directory, recollects
that revision's assets, starts its actual launcher against the restored database,
and verifies the recovered signed-in session and module bytes over HTTPS.
The rollback revision must contain the release launcher and use unchanged
runtime requirements; changed dependencies require a separately prepared
environment. This proves this compatible rollback pair, not arbitrary schema
reversals. Client majors are checked before database creation; `--pg-bin` is
optional when matching tools already appear on PATH.
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
privileges. The automated verifier exercises this dump/restore and previous-code
startup path locally, including persisted session validity. Its synthetic session
is intentionally retained; this does not approve restoring revoked real sessions.

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

| Decision/gate | Exact unresolved scope |
| --- | --- |
| Hosting and operations | Provider, region, budget, supervision/restarts, health monitoring, capacity, traffic switch and operational owner. No provider is selected or provisioned. |
| Domain and TLS | Domain, certificate renewal, trusted proxy/network boundary, HTTP/static redirects and HSTS subdomain/preload commitment. Preserve same-origin frontend/API. |
| Secrets and database | Secret creation/storage/rotation and access owners; dedicated V2 database/roles, endpoint/port, server version and verified TLS/root CA. Local tests use isolated databases. |
| Recovery mail | Relay/provider, sender/domain authentication, TLS/credentials and verified real delivery. These checks send no live mail. |
| Backup and recovery | Storage/encryption, schedule/retention, restore owner, RPO/RTO, role grants and deletion/revocation propagation before restored data serves users. No policy is invented. |
| Release acceptance | Exact candidate and release authorization; original artwork approval, human screen-reader and physical touch/device validation. Firefox visible-focus acceptance remains environment-blocked; IndexedDB restart intermittency remains open per the baseline's PR #60 checkpoint. |
| Report delivery | Preferences exist; scheduler, retry/deduplication operations, timing and delivery remain unimplemented. No queue/provider is selected. |

Visual gates remain governed by
[the visual acceptance record](frontend/FINAL-VISUAL-ACCEPTANCE.md) and current
[delivery tracker](https://github.com/m950m/space-boxes-timer/issues/11).
Local checks do not grant production readiness or deployment authorization.

## Executed validation — 2026-10-16, this delivery

- A fresh Python 3.14.4 venv installed all seven hash-checked release wheels
  without registry access; `pip check` passed. Runtime versions are recorded in
  the lock. PostgreSQL 16 was used with matching v16 client tools.
- `manage.py test config accounts productivity --noinput`: **95 tests passed**,
  including direct-WSGI fail-closed and explicit development regressions.
- The verifier command above: **all eight verification groups passed** with
  real Gunicorn/HTTPS, fresh migrations/no model drift, rejected unmigrated
  startup, asset/private-path boundaries, session/CSRF/host enforcement,
  PostgreSQL dump/restore, and older-code startup against restored data.
  Both disposable databases were removed. Private logs and synthetic artifacts:
  `/tmp/space-boxes-release-_3hpn4l0/{commands,server,rollback-server}.log`.
- Deployment checks reported only the two documented HSTS domain advisories,
  `security.W005` and `security.W021`; zero checks silenced. A test asserts that
  these are the only deployment findings. No new domain policy was selected.
- Python compilation, shell syntax, whitespace and V1 isolation checks passed.
  The actual diff was reviewed against release scope and security boundaries.
  All delivery files are inside `v2/`; no frontend/domain/schema changes or edits
  to other writers' runners are included.
- No browser suite was repeated because frontend behavior is unchanged. Actual
  SMTP delivery, external TLS/proxy behavior, production restoration/cutover and
  the existing human visual/accessibility gates were not executed. No remote CI
  run is claimed for this unpublished branch.

Implementation references: [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/),
[repeatable pip installs](https://pip.pypa.io/en/stable/topics/repeatable-installs/),
[PostgreSQL 16 pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)
and [WhiteNoise WSGI API](https://whitenoise.readthedocs.io/en/stable/base.html).

Implementation and local validation are complete; scoped ownership returns to
the owner for review/publication. Local commits are not a remote handoff. No
push/PR, merge, deployment or branch deletion is authorized by this record.
