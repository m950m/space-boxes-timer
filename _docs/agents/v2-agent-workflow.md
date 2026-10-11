# Canonical v2 engineering workflow

This is the single detailed engineering-process source for Space Boxes Timer v2, used by humans and AI agents. [AGENTS.md](../../AGENTS.md) is the short repository entry point. Process stages describe how work progresses; they do not grant permission to perform writes. Approved product, architecture and domain/data decisions remain authoritative at their recorded scope; this workflow does not reopen them or claim they are implemented.

## 1. Authority and mandatory pre-flight

Use the cheapest reliable authoritative source. Read only sources relevant to the task, rather than every document on every run.

| Question | Authoritative source |
| --- | --- |
| Local working tree, uncommitted changes, current checkout | Local shell and Git |
| Remote branch, PR, checks and merge state | GitHub remote state |
| Product policy | [v2 PRD](../product/v2-prd.md) and [owner decisions](../product/owner-decisions.md) |
| Architecture | [approved architecture](../architecture/architecture.md), with relevant ADRs only when confirmation is needed |
| Domain/data model | [V2-005 data model](../data/v2-data-model.md) and [ERD](../data/v2-erd.md) |
| Engineering process | This document |
| Current external-library/tool behavior | Official documentation for the relevant version/tool |

Read the data-model documents only when work touches relevant domain entities, tasks, sessions, history, persistence, authority, synchronization or data lifecycle. Read applicable repository instructions and task-specific sources. Preserve distinctions between approved policy, design, implemented behavior and historical/unverified claims. A conflict between authoritative v2 sources requires resolution, not an agent-selected override.

Legacy `AGENT_RULES.md`, `CONTRIBUTING.md` and `PROJECT_SPEC.md` describe v1; use them for v2 only where compatible with the repository entry point and approved v2 sources. V1 setup/module conventions, validation limitations and implemented-only documentation rules do not override v2 design decisions. `TASKS.md` is historical v1 task history, not the canonical v2 work queue.

Before modifying repository files, run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
git remote get-url origin
```

Confirm repository `m950m/space-boxes-timer`, the expected task checkout/branch and the understood working-tree scope. `master` is stable production/v1; `v2` is integration. Work occurs on authorized `feature/*`, `docs/*` or `fix/*` branches. Never implement directly on `master` or `v2`.

On repository/branch mismatch, stop and report it. Never automatically switch branches, silently clean/discard changes or rewrite history. Dirty files alone do not require stopping: preserve unrelated changes and proceed only when task ownership/scope is clear. Stop if overlapping changes cannot safely be separated. Recheck pre-flight if checkout or relevant working-tree conditions change.

## 2. Task grooming and durable work memory

Grooming converts a vague task into executable work before implementation. Establish, where relevant: goal, authoritative sources, accepted scope, acceptance criteria, expected files/areas, tests/validation, explicit non-goals, risks, human gates and stop conditions. Confirm existing executable tasks rather than repeating grooming; small tasks may use a short task record.

The ambiguity boundary is the effect of the choice:

- Stop for human decision if it materially changes or invents product behavior, architecture, security, privacy, persistence or user-data policy. An unspecified retention/deletion rule, broader administrator visibility or new synchronization authority is not an implementation detail. Approved direction does not authorize filling every deferred policy gap.
- Choose reasonable implementation details inside approved boundaries when alternatives preserve acceptance criteria and policy. Internal naming or organizing a helper may be decided locally. Document consequential choices where appropriate; report inaccessible context instead of inventing it.

Use GitHub Issues or equivalent durable task records for the goal, accepted scope/criteria, grooming decisions, blockers, relevant document/ADR links and implementation/PR result. Update records only within authorization. Chats are working context, not permanent project memory; important decisions belong in committed documentation, Issues or ADRs.

### Agent handoff protocol

For v2 workstream handoffs, GitHub Issues, pushed commits and approved repository specifications are the durable source of truth. Any coding agent can resume without earlier conversations; no particular model, chat application or tool is required. Use [#11](https://github.com/m950m/space-boxes-timer/issues/11) as the delivery index, [#29](https://github.com/m950m/space-boxes-timer/issues/29) for Focus Engine and [#30](https://github.com/m950m/space-boxes-timer/issues/30) for Planner Experience. Track acceptance-level work in the current child Issue; a tracker or checkpoint does not authorize execution.

**Checkpoint:** Prepare a concise [handoff record](handoff-template.md) at a reviewed milestone, before transferring the task or ending a session with unfinished work, and when a blocker changes the next action. Link approved specifications and decisions rather than copying them or relying on chat history. Report validation using section 5's evidence distinctions.

- Distinguish uncommitted edits, local commits and the last verified remote checkpoint. A local-only commit remains in the local repository; it is not a checkpoint available on GitHub. Record full commit SHAs and the actual state tested, including any uncommitted edits.
- For changed files, commit/push scoped work only when separately authorized under section 7, then verify the branch and exact SHA on GitHub. With explicit Issue-update authority, publish the handoff as a comment on the current Issue, linking the verified remote commit and any existing PR; link the comment from the workstream tracker when authorized. Identify the checkpoint's date and the record it supersedes. An Issue comment alone does not make local code available remotely.
- If commit, push or Issue-update authority is absent, leave a local handoff draft and report the unpublished state and last verified remote checkpoint (or none). Do not describe local-only work as transferred. Checkpoint publication is a remote mutation, not an exception to the gates in section 7; it grants no PR, merge, deployment or branch-deletion authority.

**Resume:**

1. Read the parent index, assigned workstream and current Issue, including comments, accepted criteria, approvals, blockers and dependencies. Find the latest published handoff for that Issue and its linked remote commit/PR; use current GitHub state, not a cached local remote-tracking ref or an old chat summary.
2. Read `AGENTS.md`, this workflow and only task-relevant approved specifications from section 1. A checkpoint records progress, not new product or architecture policy. Resolve conflicts or missing material decisions through the existing human gates.
3. Verify the checkpoint SHA exists on GitHub and inspect any later remote changes or merge state. Confirm the expected authorized task branch/checkout with section 1's pre-flight and compare its actual state with the checkpoint. Preserve local-only work. Stop on repository/branch mismatch, unexplained divergence or inseparable overlapping changes; do not silently switch, reset or discard work.
4. Confirm current execution authority and file ownership, then take the recorded exact next action only within accepted scope. Treat prior tests as historical evidence for their recorded revision; revalidate as section 5 requires. If no usable checkpoint exists, reconstruct status from remote code, Issues and approved specifications, explicitly report gaps and obtain any missing material decision or authorization before dependent writes.

**Isolation and shared-file ownership:** An isolated Git Worktree gives each authorized workstream its own checkout directory, working files and task branch while sharing repository history. Use separate worktrees for concurrent workstreams as required by their trackers; creating or changing branches/worktrees still requires applicable authorization. Work only in the assigned checkout and do not modify another workstream's worktree.

Worktrees isolate local edits, but changes to the same repository file can still conflict during integration. Record one approved writer per shared file, required interfaces, dependency Issues and the order of integration in the handoff. Use the workstream trackers for current boundaries rather than treating proposals as approved ownership. Changes to shared UI entrypoints, persistence, test runners or other shared files require the owner-approved serialized integration or scope reassignment recorded there. Transfer ownership explicitly before another writer starts; isolated branches do not permit concurrent ownership. Integrate through the existing QA/PR/human-merge flow, without bypassing section 7.

## 3. Flow, planning and focused sessions

Issue/task
→ Groom
→ Human review when required
→ Focused session
→ Pre-flight
→ Plan when warranted
→ Implement
→ Validate
→ Review
→ Repair if needed
→ QA
→ Authorized commit/push/PR
→ Remote verification
→ Human merge
→ Merge verification
→ Authorized cleanup

Human review before implementation is required only for unresolved material decisions or applicable human gates. Formal planning is normally unnecessary for obvious documentation corrections, small isolated bug fixes, simple tests, trivial renames and low-risk mechanical edits. Already groomed tasks skip repeated grooming; repair is needed only after a finding. Every change still gets proportionate validation, diff review and QA. A task without changes needs no commit/PR. Stop at the authorized stage rather than assuming the whole flow must execute.

Require a reviewable plan before implementation for architecture changes, authentication/security design, migrations, synchronization, concurrency, authority/locking, cross-cutting refactors, complex state-machine changes and risky or expensive reversals. Capture approach, affected boundaries, validation, risks and required decisions. Obtain human review where a gate or unresolved policy requires it; planning alone does not create a new approval requirement for ordinary work. Planning tools or UI modes are conveniences, not process dependencies.

Prefer one issue/task per focused conversation. A different issue normally starts a new conversation. Continue when solving the same bounded issue, recent context materially helps and stale investigation has not taken over. Compaction may support continued work on that issue; it is not a substitute for a clean session on another issue. Do not depend on changing UI commands.

## 4. Implementation discipline

Read applicable instructions and the groomed task; inspect only relevant files. Preserve unrelated changes. Make the smallest coherent change satisfying acceptance criteria, with one writer owning each file during the task. Avoid speculative refactoring, unrelated cleanup and changes to approved product policy. Report inaccessible context and blockers explicitly.

Choose tests and documentation according to changed behavior and acceptance criteria. Update relevant design/decision records only within task scope and authorization; an implementation agent must not silently replace approved decisions.

## 5. Validation, review, repair and QA

Use layered validation:

1. Cheapest relevant static/syntax checks.
2. Targeted tests for changed behavior.
3. Broader suites when shared behavior, risk or task/repository requirements justify them.
4. Manual validation where automation cannot cover acceptance criteria.

Do not rerun expensive successful checks unless relevant inputs or conditions changed. Documentation-only tasks use document consistency, links and diff checks; do not pretend runtime behavior was validated.

Report **executed checks** with results, **unexecuted checks** with reasons, **unavailable checks** with blockers and **historical claims** as historical rather than current evidence. Missing required validation prevents a passing QA claim; report the limitation and required context/decision instead of hiding it.

Separate implementation from review: after implementation, inspect the actual diff against acceptance criteria, authoritative sources, regressions, scope expansion, security/privacy, tests and documentation. A review must identify discrepancies or explain why the change meets the criteria; restating the implementation summary is insufficient. Non-trivial review must inspect the diff directly. A separate agent is optional; a deliberate review pass is required.

When tests/review identify a problem, fix the identified cause and rerun the smallest affected validation. Do not automatically restart broad investigation. After at most two bounded repair attempts on the same blocker, stop. Report the failure, attempts, evidence, likely cause and human decision or additional context needed. Do not reset the attempt count by renaming the same blocker.

Before commit/PR, non-trivial implementation passes a QA gate confirming:

- Acceptance criteria are satisfied and required relevant checks pass.
- Working-tree scope is understood, with no unrelated changes included in the task diff.
- Required documentation is updated.
- No unresolved blocker is hidden and no human gate is bypassed.

Documentation and small changes use a lighter equivalent: check the relevant criteria, consistency/links, actual diff, file scope, blockers and authorization. QA completion is distinct from permission to commit or publish.

## 6. Context economy, tools and subagents

- Know acceptance criteria before broad exploration. Read the smallest authoritative source set; search for the relevant symbol/section before opening large unrelated files. Do not perform repository-wide scans by default.
- Reuse committed PRDs, ADRs, data and workflow documents instead of restating them in prompts. Do not repeatedly reread unchanged sources without a reason. Preserve important decisions in durable project records.
- Prefer targeted validation; do not repeat expensive passing checks without changed relevant inputs. Apply the two-attempt repair limit. Token economy never overrides correctness or required validation.
- Use local tools for local facts and GitHub for remote facts. Do not use remote/MCP/external tools merely because available, repeat already verified unchanged information or hard-code product-specific MCP mechanics into policy. Consult official sources when current external behavior matters.

Subagents are optional; default to none for small focused tasks. Delegate only genuinely independent, bounded work cheaper or clearer to divide. Keep practical parallelism small, prefer read-only assignments, avoid duplicate investigation and enforce one writer per file. The root agent integrates findings and checks their fit against the task.

Appropriate examples: independent accessibility and security reviews of a prepared change, or separate read-only investigations of distinct boundaries. Inappropriate examples: several agents searching for the same bug, competing edits to one file, delegation of a quick lookup the root can do directly or a swarm created only because slots exist.

## 7. Human gates and write authorization

Stop for explicit human approval before destructive data migrations, authentication redesign, production data deletion, materially risky permission/authorization changes, paid provider activation/new paid infrastructure, domain/DNS changes, production release/deployment, sensitive privacy-policy/data-collection expansion or irreversible production operations. Also stop for genuinely unresolved approved product policy. Prepare a concrete reviewable proposal within safe authorized scope before requesting approval; do not execute the gated action while approval is pending. Existing explicit approval for the same scoped action remains valid. Ordinary low-risk work needs no additional gate.

Workflow stages do not automatically grant write authority:

| Action | Required authority |
| --- | --- |
| Scoped local edits, tests and review | Authorized task scope |
| Local commit | Task/user authorization including commits |
| Local branch creation/deletion or checkout changes | Task/user authorization covering the action; no automatic switching on mismatch |
| Push, PR creation, remote branch deletion or other remote mutation | Explicit authorization for the remote action |
| Normal merge | Human review/authorization; human-controlled merge |
| Production release/deployment | Explicit human-controlled release/deployment gate |

After QA, an agent may report **READY TO COMMIT**, **READY TO PUSH** or **READY TO OPEN PR** without performing the corresponding action. State what is completed, what remains and whether permission is absent. Do not infer remote-write authority from approval to edit locally or from the presence of the later stage in this workflow.

## 8. Branch lifecycle and remote verification

For new v2 work, when branch creation is authorized, establish current `v2` from verified integration state and create a focused `feature/*`, `docs/*` or `fix/*` branch. Respect an already prepared expected task branch. Perform checkout/branch actions deliberately within authorization, never as an automatic response to mismatch.

After QA and the applicable authorization, commit only focused task files, push the task branch and prepare a PR into `v2`. Include the problem/result, relevant decisions, validation evidence and limitations. Do not stage unrelated working-tree changes. Do not rewrite shared history to make it look cleaner or force-push integration/stable branches.

Verify GitHub remote state: intended head/base, pushed revision, PR status and applicable checks. Local success is not evidence of remote success; unavailable remote state must be reported. Recheck after relevant changes, not through redundant unchanged calls.

Normal merge remains human-controlled. After human merge, verify remotely that the intended PR/revision reached `v2`; then perform branch cleanup only if authorized and no unmerged work or unrelated changes would be lost. Remote deletion requires explicit authorization; local deletion/switching follows task/user authorization. If unauthorized, report ready for cleanup and leave branches intact.

Only when v2 is release-ready may it move toward `master` through an explicit human-controlled release process. Agents must not autonomously merge production releases or deploy production.

## 9. Future V2-007 Skills

V2-006 creates no Skills. V2-007 may package task grooming, scoped implementation, QA and release gates into Skills that reference this canonical workflow and enforce its source selection, pre-flight, ambiguity boundary, validation evidence, bounded repair and authorization rules. Do not duplicate the workflow or design full Skill instructions here. Skills cannot override approved project policy or grant missing write authority.
