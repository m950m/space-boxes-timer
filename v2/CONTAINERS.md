# V2 containers and API contract

The [release policy and environment table](RELEASE.md) still apply. This stack
selects no provider, provisions nothing, and binds HTTPS only to host loopback.
Hosting must remain zero-cost unless the owner explicitly changes that constraint.
It packages the Django monolith, Gunicorn, WhiteNoise and PostgreSQL without
changing authentication, schema or frontend behavior. V1 is excluded from the
build context. Linux amd64 is required by the existing release wheel lock.

## Build and local startup

Requirements: Docker Engine with Compose v2 or later, Python 3 and OpenSSL.
Run commands from the repository root. Generate **disposable local** configuration
in a new directory outside Git (the generator refuses existing directories):

```bash
python3 v2/scripts/prepare-container-local.py /private/space-boxes-local
docker compose --env-file /private/space-boxes-local/compose.env -p spaceboxes-local -f v2/compose.yaml build --pull
docker compose --env-file /private/space-boxes-local/compose.env -p spaceboxes-local -f v2/compose.yaml up -d --wait db
docker compose --env-file /private/space-boxes-local/compose.env -p spaceboxes-local -f v2/compose.yaml run --rm app v2/.venv/bin/python v2/backend/manage.py migrate --plan
# For this new local database only; review existing-data changes before migrating.
docker compose --env-file /private/space-boxes-local/compose.env -p spaceboxes-local -f v2/compose.yaml run --rm app v2/.venv/bin/python v2/backend/manage.py migrate --no-input
docker compose --env-file /private/space-boxes-local/compose.env -p spaceboxes-local -f v2/compose.yaml up -d --wait
curl --cacert /private/space-boxes-local/app.crt https://localhost:8443/
```

Once initialized, `up -d --wait` is the single startup command. Migrations remain
an explicit operator step; the launcher refuses pending migrations. The generated
self-signed certificates expire in two days and are for isolated local use only.
Use the generated certificate as a local trust anchor for curl/browser inspection;
certificate verification stays enabled. The placeholder SMTP host cannot send
mail: registration/login work, but real account recovery needs the owner's relay.

The Python and PostgreSQL base images are pinned by amd64 manifest digest;
runtime wheels are version/hash locked. Dependency installation occurs at build,
never at startup. The image contains no credentials. The application runs as UID
10001 with a read-only root, no Linux capabilities, private temporary files and
a disposable static collection mount. PostgreSQL has a project-scoped persistent
volume and no host port; TLS is required on its network connections, with
SCRAM passwords and `verify-full`/hostname verification in the application.
The app database role has schema ownership but no superuser/CREATEDB/CREATEROLE.

## Configuration

Use [RELEASE.md](RELEASE.md#environment) for the full Django/SMTP variables.
Compose deliberately fixes release mode, direct application TLS, internal DB
host/port, verified DB TLS and disabled proxy-header trust. Additional inputs:

| Input | Meaning |
| --- | --- |
| `SPACE_BOXES_TLS_DIR` | Absolute private directory containing `app.crt`, `app.key`, `db.crt`, `db.key`. App certificate SAN must cover `localhost` (or the configured health hostname); DB SAN must cover `db`. |
| `SPACE_BOXES_POSTGRES_PASSWORD` | Separate bootstrap superuser password, never passed to the app. |
| `SPACE_BOXES_IMAGE` | Local/reviewed image tag; use a unique tag per exact source commit for upgrades/rollback. Default `space-boxes-v2:local`. |
| `SPACE_BOXES_HTTPS_PORT` | Host loopback port, default 8443. Container Gunicorn uses port 8000 with TLS. |
| `SPACE_BOXES_HEALTH_HOST` | Name resolving inside the app container and present in certificate/allowed hosts, default `localhost`. |
| `SPACE_BOXES_WORKERS` | Gunicorn worker count, default 2. |

Choose explicit `DJANGO_ALLOWED_HOSTS`, strong persistent Django/DB secrets and
the SMTP variables before non-disposable use. Environment-file values use Compose
syntax; protect files with mode 0600 and avoid printing `compose config` (use
`config --quiet`). Docker administrators can inspect environment variables. Keep
Docker access restricted; do not attach environments or logs to public issues.
The local generator uses readable individual key mounts inside a host directory
of mode 0700 so UID 10001 can read its bind-mounted key; keep that parent private.
The DB wrapper copies its mounted key into a postgres-owned mode-0600 file.
Production secret storage/rotation and trusted certificates remain owner gates.
Changing environment passwords on a populated volume does not rotate database
roles; changing `POSTGRES_*` does not reinitialize it.

## Health, validation and shutdown

`docker compose ... ps` shows application readiness. The image health command
fetches the real HTTPS document with certificate verification and runs `SELECT 1`
over verified database TLS. It is a readiness probe, not telemetry or an alerting
service. No new HTTP health endpoint is claimed. `logs app` gives private stderr
diagnostics; request access logs remain disabled under the release policy.

```bash
# One command: disposable TLS stack, fresh migrations, actual HTTP workflows,
# restart persistence, account deletion, and full Django backend tests.
python3 v2/scripts/verify-container.py --backend-tests
# Optional tooling, separate from runtime requirements/image:
v2/.venv/bin/pip install -r v2/requirements-validation.txt
v2/.venv/bin/python v2/scripts/validate-openapi.py
# Use the captures path printed by the container rehearsal:
v2/.venv/bin/python v2/scripts/validate-openapi.py --captures /tmp/space-boxes-container-EXAMPLE/captures.json
```

The rehearsal uses a random Compose project, port and fresh volume. It removes
only that stack/volume in `finally`, preserving its private logs/captures/config
under the printed `/tmp` directory. Use only synthetic data there. With
`--backend-tests` it temporarily grants CREATEDB to its disposable role, then
revokes it; normal startup never grants this privilege. Required frontend CI
commands remain in [the existing workflow](../.github/workflows/v2-ci.yml).
Local equivalents do not prove a GitHub check passed on an unpublished commit.

For a persistent local stack, `docker compose ... down` stops it and preserves
the database volume. Never add `--volumes` for data you need to retain.
Shutdown uses Gunicorn's normal SIGTERM handling. Health failures do not
automatically restart containers; the operator must choose monitoring/response.

## Upgrades and safe rollback

Record the exact source commit, image ID/digest, lock, Compose project name,
database major and protected configuration. Before an upgrade, follow the
[backup/restore procedure](RELEASE.md#backup-and-rollback), using the pinned
database container's matching `pg_dump`/`pg_restore` tools if host tools differ.
For example, `docker compose ... exec -T db pg_dump -U postgres -Fc --no-owner
--no-acl space_boxes_v2 > /private/backup/v2.dump` writes a backup to a protected
host path (set `umask 077` first). Verify restoration into a **new isolated**
database with the matching code and grants before any traffic switch.

Build a separately tagged candidate from its exact commit, retain the previous
image/config, inspect `migrate --plan`, and apply only reviewed migrations.
Start with `up -d --wait` using the same explicit project name and verify health,
assets, sign-in and stored data. Do not upgrade the PostgreSQL major by changing
the image tag on an existing volume: plan and rehearse data conversion separately.

This delivery adds no migrations, so a compatible code rollback can stop the app,
select the retained previous image via `SPACE_BOXES_IMAGE`, and recreate **only
the app** with `up -d --no-build --force-recreate --wait app`. Preserve the same
DB volume, session secret and trusted TLS configuration. WhiteNoise assets are
recollected from that image at startup. Confirm old-code/schema compatibility
before reuse. Reverse migrations, live database restores and production cutover
remain human-gated; newer records, deletions and session revocations must be
reconciled. The rehearsal proves restart persistence, not arbitrary schema rollback.

## API maintenance

[openapi.json](openapi.json) is an OpenAPI 3.1 description of the implemented 14
Django routes, with account, sync, focus and export schemas. It is derived from
`backend/{accounts,productivity}/{urls,api}.py`, serialization/services and their
tests. It documents the actual CSRF HTML errors, session-cookie authentication,
method-decorator differences and per-operation batch failures. It introduces no
API route or Swagger server. Update it with implementation changes, validate the
document and route coverage, and replay the real HTTP captures. The contract was
written after the API; it is not evidence of contract-first development.

References: [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0),
[Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) and
[PostgreSQL image operations](https://hub.docker.com/_/postgres).
