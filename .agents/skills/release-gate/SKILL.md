---
name: release-gate
description: "Verify Space Boxes Timer v2 integration PR readiness, or explicitly requested production release readiness, using current remote evidence. Read-only; exclude executing pushes, PR creation, merges, deployment, or cleanup."
---

# Verify a v2 release gate

Use [AGENTS.md](../../../AGENTS.md) and the [canonical v2 workflow](../../../_docs/agents/v2-agent-workflow.md), especially sections 1 and 7–8. The workflow remains authoritative; this Skill packages verification only.

Activation does not override the current operating mode or authorize edits, commits, GitHub mutations, or bypassing human gates. Do not automatically invoke another Skill. Default to no subagents. Remain read-only.

## Inputs and review type

Identify the requested transition, task/PR reference, expected checkout/branch and base/head/revision, QA evidence, applicable check requirements, and approval evidence.

- **Integration PR readiness:** Review a task PR targeting `v2`.
- **Production release readiness:** Perform only when separately and explicitly requested, under approved production release requirements and applicable human approvals. Integration PASS never authorizes production release.

If the requested review type or transition is unclear, clarify before making a readiness claim. Do not invent production procedures, requirements, or approvals.

## Procedure

1. Inspect local repository, checkout/branch, and working-tree facts; compare them with the expected review context. Stop on mismatch or inseparable task scope. Never switch branches, clean files, or fetch/update local refs automatically.
2. Use actual GitHub remote state to verify intended head/base, pushed revision, PR status, and applicable checks. Compare remote evidence with the reviewed QA revision. Local success is not remote evidence; inaccessible or stale required evidence blocks readiness.
3. For integration, confirm the task PR targets `v2` and meets its applicable QA/check and approval requirements. Normal merge remains human-controlled.
4. For explicitly requested production review, verify the approved release requirements, intended refs/revision, current checks, and scoped human approvals. Missing requirements or approval evidence are blockers. Do not infer them from integration readiness or approval to edit locally.
5. Reuse unchanged sources and evidence; recheck after relevant revision, PR, check, requirement, or approval changes. Verify a human merge remotely only when requested; report cleanup readiness without performing it.

## Output and acceptance

Return **Integration PR readiness: PASS / BLOCKED** or **Production release readiness: PASS / BLOCKED** for the requested transition. Include local/remote revision evidence, PR base/head/status, applicable checks, approval status, boundaries, blockers, and remaining actions.

Separate successful, failed, unavailable, and pending checks; explain unexecuted checks and label historical evidence. Distinguish technical readiness from authority to act. PASS requires the requested transition's requirements and gates to be satisfied and grants no permission to publish, merge, deploy, or clean up.
