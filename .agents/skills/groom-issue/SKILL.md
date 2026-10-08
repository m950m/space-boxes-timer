---
name: groom-issue
description: "Groom an unclear Space Boxes Timer v2 issue into a reviewable task specification. Exclude implementation, completed-change review, and redundant grooming of executable tasks."
---

# Groom a v2 issue

Use [AGENTS.md](../../../AGENTS.md) and the [canonical v2 workflow](../../../_docs/agents/v2-agent-workflow.md), especially sections 1–3 and 6–7. The workflow remains authoritative; this Skill packages one stage.

Activation does not override the current operating mode or authorize edits, commits, GitHub mutations, or bypassing human gates. Do not automatically invoke another Skill. Default to no subagents.

## Inputs

Obtain the task text or accessible issue reference, intended outcome, constraints, and known authorization. Confirm an already executable task rather than repeating grooming unless its scope changed.

## Procedure

1. Establish the goal, accepted scope, explicit non-goals, and testable acceptance criteria before broad exploration.
2. Read only relevant authoritative sections. Consult the [PRD](../../../_docs/product/v2-prd.md) and [owner decisions](../../../_docs/product/owner-decisions.md) for affected product policy; consult architecture/ADRs or V2-005 sources only for affected boundaries, following workflow section 1.
3. Identify affected files/areas, proportionate validation, risks, missing decisions, and applicable human gates. Distinguish approved policy, design, implemented behavior, and historical/unverified claims.
4. Reuse unchanged sources and existing task records. Refresh mutable facts when relevant inputs change; do not repeat repository exploration without a reason.
5. Expose inaccessible or conflicting context. Stop before choosing an unresolved material product, architecture, security, privacy, persistence, or user-data policy; state the decision or context needed.

## Output and acceptance

Return a concise, reviewable specification containing:

- Goal, accepted scope/non-goals, authoritative source links, and testable acceptance criteria.
- Expected files/areas, validation approach, risks, missing decisions, human gates, and stop conditions.
- Whether the task is executable or blocked, with the next required decision/action.

Keep unresolved decisions explicit. Return text suitable for an Issue or equivalent task record; do not edit files or update GitHub automatically. Persist records only under separate applicable authorization.
