---
name: qa-gate
description: "Review a prepared Space Boxes Timer v2 change against acceptance criteria and actual diff/validation evidence. Exclude implementation, speculative audits, and release authorization."
---

# Review a v2 QA gate

Use [AGENTS.md](../../../AGENTS.md) and the [canonical v2 workflow](../../../_docs/agents/v2-agent-workflow.md), especially sections 1 and 5–7. The workflow remains authoritative; this Skill packages one stage.

Activation does not override the current operating mode or authorize edits, commits, GitHub mutations, or bypassing human gates. Do not automatically invoke another Skill. Default to no subagents.

## Inputs

Require accepted criteria, an identified comparison base and reviewed revision/working-tree state, required checks, implementation evidence, and applicable decisions. Report missing or inaccessible inputs rather than assuming success.

## Procedure

1. Identify the actual task change and inspect its contents and diff. Include committed, staged, unstaged, and new task files as applicable; ordinary Git diffs omit untracked files. Separate unrelated changes and stop if ownership/scope cannot safely be established.
2. Map each criterion to inspected evidence. Review correctness, regressions, scope expansion, relevant security/privacy boundaries, tests, documentation, and human gates; do not merely repeat the implementation summary.
3. Read only authoritative sections relevant to the criteria or findings under workflow section 1. Reuse unchanged context, but refresh evidence after relevant changes. Distinguish approved policy/design, implemented behavior, and historical claims.
4. Assess validation under section 5. Run supported, proportionate checks when needed and permitted; reuse passing checks only when relevant inputs remain unchanged. Documentation-only tasks use the lighter consistency/link/diff review.
5. Separate successful, failed, unavailable, and pending checks. Give reasons for unexecuted checks and label historical evidence. Missing required validation, unsatisfied criteria, unresolved blockers, or bypassed gates prevent PASS.

## Output and acceptance

Return **PASS** or **BLOCKED** for the identified change, with:

- Criteria-to-evidence mapping and the reviewed base/revision/working-tree scope.
- Findings, regression/documentation assessment, validation results and limitations.
- Blockers and required next actions; explain why inspected evidence satisfies criteria when no discrepancies are found.

Remain review-only: do not repair files, stage, commit, or mutate GitHub automatically. PASS grants no permission to commit, publish, merge, or release. Return repair findings for a separately authorized implementation pass, subject to the canonical repair limit.
