# Repository entry point

## Safety and authorization

Expected repository: `m950m/space-boxes-timer`. `master` is stable production/v1; `v2` is the v2 integration branch. Work only on an authorized `feature/*`, `docs/*` or `fix/*` task branch, never directly on `master` or `v2`.

Before modifying repository files, verify the repository, expected task branch and working-tree scope:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
git remote get-url origin
```

Stop on mismatch. Do not silently switch branches, clean the working tree or discard unrelated changes.

Stop for human decision when unresolved policy materially affects product behavior, architecture, security, privacy, persistence or user data. Follow the workflow's human gates before destructive, materially sensitive, paid-infrastructure or production operations.

Task authorization permits only scoped actions. Commits and local branch creation/deletion need task/user authorization; push, PR creation and other remote mutations need explicit authorization. Normal merge is human-controlled; production release/deployment remains explicitly gated.

## Read only relevant authoritative sources

- Process: [canonical v2 engineering workflow](_docs/agents/v2-agent-workflow.md).
- Product: [PRD](_docs/product/v2-prd.md) and [owner decisions](_docs/product/owner-decisions.md).
- Architecture: [approved architecture](_docs/architecture/architecture.md); individual ADRs only when needed.
- Domain/data: [V2-005 model](_docs/data/v2-data-model.md) and [ERD](_docs/data/v2-erd.md), only for relevant domain, persistence, authority, synchronization or data-lifecycle work.

Approved v2 sources and this entry point take precedence over incompatible legacy v1 guidance in `AGENT_RULES.md`, `CONTRIBUTING.md` and `PROJECT_SPEC.md`. Compatible guidance still applies. `TASKS.md` is historical v1 task history, not the v2 work queue; use Issues or equivalent task records. Do not invent missing policy or claim design documents describe implemented behavior.
