# V2 release engineering — technical completion record

Written 2026-10-17 for the branch
`feature/v2-release-delivery-zcode`, integrated on verified `origin/v2`
**`2f5be3d6c36d44dad14f68f76c6d238b70f46721`** (PR #63 merge; the handoff's
"last verified integration SHA"). This record distinguishes completed,
locally verified artifacts from owner-only publication, deployment and
production gates. No score, public deployment or production readiness is
claimed.

## Provenance and reuse

- **Reused from Codex (uncommitted, `Space_boxes_Codex_ReleaseEngineering`
  worktree on `feature/v2-release-engineering-delivery`, inspected 2026-10-17):
  `openapi.json`, `Dockerfile`, `.dockerignore`, `compose.yaml`, `CONTAINERS.md`,
  `PROJECT-EVALUATION.md`, `requirements-validation.txt`,
  `deploy/{database-entrypoint.sh,database-init.sh,pg_hba.conf}`,
  `scripts/{container-health.py,prepare-container-local.py,validate-openapi.py,verify-container.py}`
  and the `RELEASE.md` header addition. Copied byte-for-byte into this branch;
  the source worktree remains untouched with its uncommitted state.**
  Those artifacts were reviewed against the implemented backend, release
  settings and architecture before adoption; no defect required changes.
- Provenance of that Codex work per its own records: derived from
  `backend/{accounts,productivity}/{urls,api}.py` and their tests; the API
  contract was written after the API, not contract-first
  ([CONTAINERS.md](CONTAINERS.md#api-maintenance)).
- **Added by this delivery:** `deploy/render.yaml`,
  `deploy/HOSTING-FREE-TIERS.md` (Render Free + Supabase Free readiness,
  operations and incident procedures) and this record. `RELEASE.md` header
  and `PROJECT-EVALUATION.md` updated to reference them and the executed
  evidence below.
- Preserved and untouched: V1 (`master`/root), Artwork v1 (activated by PR
  #63, verified active below), the IndexedDB restart fixes (PR #62), all peer
  worktrees, and the existing connected backend behavior.

## Delivered artifacts

| Area | Files |
| --- | --- |
| OpenAPI 3.1 contract | [openapi.json](openapi.json) — implemented 14-route API with CSRF/session semantics, sync conflicts and error schemas |
| Containers | [Dockerfile](Dockerfile), [.dockerignore](.dockerignore), [compose.yaml](compose.yaml), [deploy/](deploy/) — digest-pinned, non-root, TLS/SCRAM stack |
| Validation tooling | [scripts/](scripts/) — container health, local config generator, OpenAPI validator, container rehearsal |
| Documentation | [RELEASE.md](RELEASE.md), [CONTAINERS.md](CONTAINERS.md), [deploy/HOSTING-FREE-TIERS.md](deploy/HOSTING-FREE-TIERS.md), [PROJECT-EVALUATION.md](PROJECT-EVALUATION.md) |
| Hosting declaration | [deploy/render.yaml](deploy/render.yaml) — Render Free Blueprint (applies nothing until the owner acts) |

## Executed validation — 2026-10-17, this branch and working tree

All commands were run locally on this delivery; Docker Engine 29.8.1 with
Compose v5.5.1, Python 3.14.4, gjs 1.88, Chrome 155. Evidence directory from
the container rehearsal: `/tmp/space-boxes-container-e2_u6l02`.

1. **OpenAPI**: `validate-openapi.py` — PASS: OpenAPI 3.1 document valid,
   exact coverage of the 14 implemented `/api/v2/` routes; with
   `--captures`, **23 real HTTP captures** from the container rehearsal match
   documented status, media type and schema.
2. **Containers**: `verify-container.py --backend-tests` — all five groups
   PASS: hash-locked image build and unmigrated-startup rejection; fresh
   PostgreSQL 18 migrations, no model drift, non-root Gunicorn/WhiteNoise
   startup with HTTPS and verified-TLS database readiness; real HTTP
   workflows (assets/private-path 404s, host/CSRF enforcement, sync partial
   success, focus stale-revision 409, export); container restart persistence,
   password-confirmed account deletion/session revocation, anonymous logout,
   generic recovery; **full `config`/`accounts`/`productivity` Django suites
   inside the container** (disposable role temporarily CREATEDB, then
   revoked). The rehearsal tore down only its own random project/volume.
3. **CI-equivalent frontend checks**: all **8 GJS suites** passed
   (task-classification, task-planning, session-plan, task-history,
   task-hierarchy, task-resources, connected-payload, connected-focus-mirror);
   real-Chrome suites passed: browser/persistence 21 checks, planner
   end-to-end + 65 visual acceptance checks, 127 focus/reports/planning domain
   checks, 48 focus-persistence checks, 92 Focus UI checks, 16 connected-sync
   checks, and **47 Artwork v1 activation checks** (plus 3 a11y/keyboard
   assertions) confirming **Artwork v1 remains active** through the
   production registry. V1 sentinel data remained byte-for-byte unchanged
   inside the persistence suites.
4. **Hygiene**: `git diff --check` clean (no whitespace errors); all changed
   files inside `v2/` per the V1-isolation CI rule; no unrelated working-tree
   changes; every Markdown link target in the new/edited documents exists.

## Unexecuted or unavailable checks (explicit limitations)

- **No remote CI run**: the branch is local-only; GitHub checks on this
  revision do not exist yet.
- **No real deployment**: Render/Supabase connectivity, actual cold-start
  behavior, SMTP delivery and the provider wiring in
  [HOSTING-FREE-TIERS.md](deploy/HOSTING-FREE-TIERS.md) are documented and
  source-verified for plan limits but **UNVERIFIED against live services**
  (creating accounts/resources is an owner gate).
- The container rehearsal proves the **local TLS/loopback stack**, not the
  proxy-terminated TLS mode `render.yaml` selects; that mode's settings path
  (`DJANGO_TRUST_PROXY_HTTPS`) is covered by existing settings tests, but no
  live proxy rehearsal exists yet.
- Firefox visible-focus acceptance remains environment-blocked and the
  IndexedDB restart intermittency remains tracked per the baseline's PR #60
  checkpoint; unchanged by this delivery.

## Remaining owner gates

Per [RELEASE.md](RELEASE.md#remaining-owner-decisions-and-release-gates),
unchanged: push/PR publication (request consolidated below), human review and
merge, provider account/Blueprint application, domain/TLS decisions, SMTP
relay selection and verified delivery, secret storage/rotation, first real
migration and backup against Supabase, and the production release/deployment
authorization. Zero spending was incurred; no cloud resource was created.
