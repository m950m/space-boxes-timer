# Course evidence and factual self-evaluation — 2026-10-17

Space Boxes V2 is intended for DataTalksClub AI Dev Tools Zoomcamp 2026. Product
policy remains governed by the approved PRD/owner decisions, independently of
course scoring. No score or passing result is claimed here.

## Verified requirements and submission boundary

The [official project overview](https://datatalksclub.github.io/docs/courses/ai-dev-tools-zoomcamp/project/)
links the [current final-project rubric](https://github.com/DataTalksClub/ai-dev-tools-zoomcamp/blob/660b0b2a89e2b045727e5dd1796f0b952f9cbf33/project/README.md).
The latter was fetched directly at course commit
`660b0b2a89e2b045727e5dd1796f0b952f9cbf33` (2026-10-16) and re-fetched with the
same result on 2026-10-17; its Git blob is
`30ad0a53dc634742b7c63b78f7b236743e32c065`. It has **12 criteria**, states
24 available points and 10 to pass, and requires three peer reviews. These are
source claims, not a project score. An older search-engine copy still has a draft
14-criterion rubric; that stale copy was not used for this evaluation.

The public [2026 Project 1 form](https://courses.datatalks.club/ai-dev-tools-2026/project/project1)
links that same project directory and shows October 26, 2026 at 23:00 with a
timezone-dependent notice. Its preview asks for a public repository and exact
commit, time spent and certificate name, with optional public-learning/FAQ links.
This links Project 1 to the final-project materials publicly. **No authenticated
course session is available to this execution**: saved submission state, any
account-specific instructions, deadline timezone/offset and peer-review schedule
remain to be confirmed in the owner's logged-in platform. Do not infer Cairo's
deadline offset from an anonymous page or submit automatically.

## Evidence against the current criteria

| Criterion | Existing evidence and limitation |
| --- | --- |
| Problem description | [V2 README](README.md) explains the local planner/focus and optional connected account. Root README still describes V1; reviewers need the V2 entry point. |
| Product specification | [PRD](../_docs/product/v2-prd.md), [owner decisions](../_docs/product/owner-decisions.md) and public [delivery tracker #11](https://github.com/m950m/space-boxes-timer/issues/11) with child acceptance tasks/checkpoints. Design approval is distinct from implementation. |
| Agent team specification | [Canonical workflow](../_docs/agents/v2-agent-workflow.md) defines implementation/review/QA and worktree ownership; tracker #11 records Focus, Planner and CI workstreams. This delivery used one engineer with a separate deliberate diff review, no subagents. |
| Context management | [AGENTS.md](../AGENTS.md) points to modular process/product/architecture/data documentation. Handoffs preserve exact revisions, scope, checks and approval gates. lean-ctx selected scoped context for this delivery. |
| Application | Vanilla JS frontend, Django API and PostgreSQL are implemented; connected/browser tests and the container HTTP rehearsal exercise their boundaries. One startup command works after explicit configuration/migration; first-time setup has deliberate operator steps. |
| Testing | [Backend tests](backend/) and [frontend tests](frontend/tests/) include domain and integration coverage. `verify-container.py --backend-tests` runs container HTTP and backend tests in one command; the complete frontend/backend matrix uses the existing CI workflow. No claim that all project suites use one command. Executed 2026-10-17: all container rehearsal groups plus the full Django suite inside the container, all 8 GJS suites, and the real-Chrome persistence/planner/focus/connected suites (see [the delivery record](TECHNICAL-COMPLETION.md)). |
| Containerization | [Dockerfile](Dockerfile), [Compose](compose.yaml), digest-pinned bases and hash-locked dependencies; [container guide](CONTAINERS.md) covers setup/readiness. The whole app/database starts with `up -d --wait` after initialization; migrations are never silently applied at startup. Verified by actual build, migration and HTTP rehearsal on 2026-10-17. |
| Deployment | No public full-stack V2 deployment is established. The V1 GitHub Pages URL is not V2 deployment evidence. Zero-cost provider preparation now exists as a Render Free Blueprint ([deploy/render.yaml](deploy/render.yaml)) and a limits/source-verified readiness guide ([deploy/HOSTING-FREE-TIERS.md](deploy/HOSTING-FREE-TIERS.md)); applying them, a public URL and a real deployment remain owner steps. |
| CI/CD | [V2 CI](../.github/workflows/v2-ci.yml) runs GJS, Chrome and Django checks on V2 PRs/pushes. Automated deployment/dev promotion is absent. Local checks are distinguished from remote checks. |
| Observability | Gunicorn error diagnostics and Docker readiness exist. No correlated user-journey metrics/traces/log UI is demonstrated. Do not count a health probe as observability-stack completion. |
| Alerting on user impact | No application-impact alert/trigger artifact is established by this scoped delivery. |
| On-call agent | No alert-triggered responder agent is established. Human approval boundaries in the workflow do not constitute an implemented on-call agent. |

The API contract and Docker artifacts are confirmed course expectations, even
though API Contract is not a separate row in the current 12-criterion rubric.
The contract describes existing behavior; no contract-first claim is made.
Public V2 deployment, delivery automation, telemetry/alerting/responder work and
the authenticated submission/peer reviews remain gaps. This record does not
authorize building those features or bypassing product/operations decisions.

## AI workflow and review evidence

The [workflow](../_docs/agents/v2-agent-workflow.md) and
[handoff template](../_docs/agents/handoff-template.md) specify how an agent reads
the current issue, verifies its assigned branch/worktree, limits context, works
within accepted criteria, reviews the diff, runs checks and requests gated writes.
The [connected-product checkpoint](../_docs/agents/checkpoints/2026-10-15-connected-product.md),
[sync-edit checkpoint](../_docs/agents/checkpoints/2026-10-15-sync-task-edits.md) and
[IndexedDB checkpoint](../_docs/agents/checkpoints/2026-10-16-idb-restart-stability.md)
record real delegation boundaries, findings, repairs and verification. The latter
separates a test synchronization fix from application behavior and preserves the
Firefox environment blocker. [PR #61](https://github.com/m950m/space-boxes-timer/pull/61),
[PR #62](https://github.com/m950m/space-boxes-timer/pull/62) and the artwork
activation [PR #63](https://github.com/m950m/space-boxes-timer/pull/63) are
verified merged release/browser/visual checkpoints; no review approval for this
new delivery is implied.

This delivery's owner brief authorized provider-independent API/container/docs
completion (from the preceding workstream's uncommitted work, integrated with
provenance), provider-specific zero-cost hosting preparation for Render Free
and Supabase Free, and a local scoped commit on an isolated branch; no push,
PR, merge, deployment or cloud-resource creation. Sources were limited to
applicable instructions, release decisions and implemented routes/tests.
AI-generated artifacts were checked against those sources, the OpenAPI
validator and actual containers; current validation is recorded in
[the delivery record](TECHNICAL-COMPLETION.md).
No prompts containing credentials, raw user history or private telemetry are
published. Automated checks and this engineer's review do not substitute for
owner review, original-artwork approval or human accessibility/device acceptance.
