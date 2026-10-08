# Agent Rules

> **Legacy v1 guidance:** This file primarily describes v1 implementation rules. For v2, [AGENTS.md](AGENTS.md) and the approved v2 product, architecture and data sources linked there, together with the [canonical v2 workflow](_docs/agents/v2-agent-workflow.md), take precedence. These rules apply only where compatible. The blanket STOP-on-any-ambiguity instruction below does not replace the workflow's material-policy versus implementation-detail boundary.

Before writing code always:

Read PROJECT_SPEC.md

Read TASKS.md

Follow these rules.

---

Never modify files outside the current task.

Never rename files.

Never delete code unless requested.

Never duplicate code.

Never duplicate CSS.

Never duplicate JavaScript.

Always reuse utilities.

Always explain your decisions.

Always list modified files.

Always keep modules independent.

Never mix UI with business logic.

Never use inline CSS.

Never use inline JavaScript.

Always write readable code.

Always prefer maintainability.

If requirements are unclear:

STOP

Ask questions.

Do not guess.
