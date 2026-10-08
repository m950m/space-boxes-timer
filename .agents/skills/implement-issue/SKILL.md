---
name: implement-issue
description: "Implement an authorized, groomed Space Boxes Timer v2 task within its accepted scope. Exclude ungroomed material decisions, standalone QA/release reviews, and execution prohibited by the current mode."
---

# Implement a v2 issue

Use [AGENTS.md](../../../AGENTS.md) and the [canonical v2 workflow](../../../_docs/agents/v2-agent-workflow.md), especially sections 1 and 3–7. The workflow remains authoritative; this Skill packages one stage.

Activation does not override the current operating mode or authorize edits, commits, GitHub mutations, or bypassing human gates. Do not automatically invoke another Skill. Default to no subagents.

## Inputs

Require an accepted task and criteria, expected task branch, authorized areas/actions, relevant decisions, and validation requirements. If missing information prevents safe scoped execution, report what is needed before editing.

## Procedure

1. Run the four-command preflight in workflow section 1 before edits. Confirm the repository, expected authorized task branch, and working-tree scope. Stop on mismatch or inseparable overlapping changes; never automatically switch branches or clean/discard work. Recheck when checkout or relevant working-tree conditions change.
2. Read the task, applicable instructions, and relevant source sections only. Use task-selected product, architecture, and data authorities under workflow section 1. Reuse unchanged context; distinguish approved policy/design from actual implementation and historical claims.
3. Plan when workflow section 3 requires it. Stop for unresolved material decisions or applicable human gates under section 7. Prepare a concrete proposal within safe authorized scope; never silently expand the task or change approved policy.
4. Make the smallest coherent authorized change satisfying the criteria. Preserve unrelated work, keep one writer per file, and avoid speculative refactoring or cleanup.
5. Follow layered, proportionate validation and deliberate review in section 5. Inspect the actual task diff, including new files, against criteria, regressions, scope, and required documentation. Documentation-only changes receive consistency/link/diff checks, not runtime claims.
6. Repair identified causes only within scope and authorization; rerun the smallest affected checks. After at most two unsuccessful repairs of the same blocker, stop and report attempts, evidence, likely cause, and required decision/context. Do not reset the count by renaming the blocker.

## Output and acceptance

Return the change summary, criteria coverage, actual file scope, validation evidence/limitations, blockers, repair attempts, and next authorized stage. Separate successful, failed, unavailable, and pending checks; explain unexecuted checks and label historical evidence.

Before reporting readiness, satisfy the proportionate QA requirements in workflow section 5. Readiness does not grant publishing authority: commits and branch operations require applicable task/user authorization; GitHub mutations require explicit authorization; merges and production actions remain human-controlled. Stop at the authorized stage.
