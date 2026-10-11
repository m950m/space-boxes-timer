# Agent handoff / checkpoint

Use with the [canonical handoff protocol](v2-agent-workflow.md#agent-handoff-protocol). Keep entries concise, link evidence and write `none` or `unknown` explicitly. A local draft is unpublished until an authorized GitHub update; local commits are not pushed checkpoints.

- **Recorded at / supersedes:** Date/time with timezone; previous checkpoint comment link or none.
- **Workstream and current Issue:** Workstream tracker, current acceptance-level Issue and parent tracker links.
- **Approved scope and authority:** Accepted criteria/specification and decision links; authorized actions, limits and approved file ownership. Identify any authorization still confined to this session and not recorded on GitHub.
- **Branch and last verified commit:** Repository, assigned checkout/worktree and task branch; full local HEAD SHA; last verified remote checkpoint SHA and GitHub commit link (or none), verification time and existing PR link if any.
- **Publication / local state:** Published checkpoint or unpublished draft; clean/dirty state, scoped uncommitted files, local-only commits and any difference from the remote checkpoint. State where unpublished work remains and whether another checkout can recover it.
- **Completed work:** Results and supporting commit/PR links; distinguish implementation, validation and merge status.
- **Remaining work:** Outstanding acceptance criteria and required validation.
- **Executed tests and results:** Exact checks, outcomes and tested SHA/state, including uncommitted edits; unexecuted/unavailable checks with reasons. Label older evidence historical.
- **Pending decisions and blockers:** Decision/Issue links, needed human input and what remains blocked (or none).
- **Shared-file dependencies:** Paths, approved writer/ownership evidence, interface or dependency Issues, integration order and any pending ownership transfer (or none).
- **Exact next action:** One concrete action, target Issue/files, prerequisites and authorization required; if blocked, state the decision needed before execution.
