# Verified gaps relevant to v2

Inspected 2026-10-06 at commit `53a3a30584d86f6a5df09a9fb784af0126c17f98` on `docs/v2-baseline`. Findings describe the committed v1 baseline, not new requirements or a proposed stack. **Source** denotes implementation/inventory evidence; **Documentation** denotes existing written statements. Missing external or historical evidence is marked **UNVERIFIED**. No browser reproduction was performed.

## Missing committed capabilities and verification infrastructure

| Gap | Verified evidence and limit |
| --- | --- |
| No automated test suite or runner | **Source:** Complete tracked inventory contains no tests, test configuration, runner, or dependency manifest. **Documentation:** CONTRIBUTING explicitly states no committed test runner. DEVLOG's 48 passing checks are historical and **UNVERIFIED** without their harness/results. |
| No CI workflow | **Source:** No tracked `.github/workflows/` files or other CI configuration. Externally configured checks are **UNVERIFIED**. |
| No backend | **Source:** Runtime consists of `index.html`, eight browser ES modules, and CSS; no server application or API implementation. README documents the same boundary. |
| No database beyond localStorage | **Source:** `storage.js` defaults to browser localStorage with three versioned records; no database integration exists. Injecting a storage-compatible object is an API seam, not a committed database adapter. |
| No authentication or accounts | **Source:** No identity, account records, login UI, token handling, or authentication integration in HTML/modules. README explicitly documents no accounts/authentication. |
| No multi-user authorization | **Source:** Tasks have no user/owner/role fields; all records are browser-local and no authorization checks exist. |
| No browser-extension integration | **Source:** No extension manifest, extension runtime integration, messaging bridge, or extension source in the tracked files. |
| No server-side domain enforcement | **Source:** Validation and the running-task invariant reside in browser `tasks.js`/`app.js`; no server exists to enforce them. They do not establish enforcement across clients. |
| Existing documentation is v1-oriented | **Documentation:** README/CHANGELOG describe v1.0.0, PROJECT_SPEC specifies the browser/localStorage architecture, TASKS tracks completed v1 work, and roadmaps discuss v1.1/v1.2. Existing files do not specify v2 behavior or acceptance criteria. |
| GitHub production/integration protections are not represented in repository configuration | **Source:** No tracked ruleset/protection configuration or workflows. Local master/v2 branch names do not establish their roles or required checks. Actual GitHub settings, protection status, and enforcement are **UNVERIFIED**; absence of files does not prove protections are disabled. |

## Paused focus ownership is not restored

**Source:** In `js/app.js`, `#pauseTask()` pauses the timer, closes the task interval, stops timer updates, and persists the paused state, but leaves `#activeTaskId` unchanged. `#startTask()` and `#resumeTask()` reject a different task when that in-memory ID is set. Thus pausing retains focus ownership in the current application instance.

At a new page load, `#activeTaskId` starts null. `#restoreState()` constructs `TaskManager` from saved records and calls only `getRunningTask()`. It restores the active ID and timer only when a running task exists; there is no paused-task selection or paused-timer restoration. `TaskManager.getRunningTask()`, `#assertNoOtherRunningTask()`, and `#assertRunningTaskInvariant()` in `js/tasks.js` consider only status `running`. Initial validation accepts paused records with no open interval and does not restrict their count.

Consequently, pause A and reload with no running task: A remains paused with its recorded intervals and accumulated time, but the Energy Core shows no active task. B can start while A remains paused. A can later resume when application ownership is free; it receives a new interval and timer seeded from its accumulated time. If B owns the active ID, resuming A is rejected. A paused task therefore does not reserve focus across reload, reopening, or independent page instances. This is loss of ownership, not loss of saved paused status/time. The same-instance reservation also ends if another supported operation clears ownership; it is not a persisted domain lock.

**Documentation discrepancy:** README promises preserved running/paused state across reload and CHANGELOG calls sessions “one-active-task” with reload recovery. Saved paused state does survive, but interpreting those statements as persistent exclusive ownership is unsupported. The model guarantees one running task per manager instance only, and does not prohibit several paused tasks.

## Related verified limitations

- **Source:** `app.js.#finishTask()` accepts any running/paused task without requiring active ownership, then unconditionally stops updates, clears the active ID, and resets the timer. After the A-paused/reload/B-running sequence above, A's visible Finish action can therefore clear B's application timer ownership while B remains marked running in `TaskManager`. This consequence follows from the handler paths; browser reproduction is **UNVERIFIED**.
- **Source:** There is no localStorage `storage` event handler, shared lock, or cross-tab coordination. Each page uses its own task snapshots and running-task invariant; changes are saved as whole arrays. Single-running enforcement is not global across tabs or devices.
- **Source:** `app.js.#updateTimerDisplay()` calls only `ui.updateTimerDisplay()`. Statistics do not recalculate on timer ticks or start/resume. Estimate progress changes only in `ui.renderActiveSession()`, so it remains unchanged between full renders despite elapsed display updates. No automatic finish occurs at the estimate.
- **Source:** Live timer deltas use `performance.now()` where available, while task interval closing/restoration and statistics use wall-clock timestamps. Clock adjustments can affect persisted durations and reload recovery; no reconciliation between those clocks exists.
- **Source:** `storage.js` rejects unsupported schema versions with fallback data; there is no migration path. `app.js` replaces a structurally invalid saved task array with an empty manager in memory, rather than salvaging valid tasks. Save errors preserve unsaved in-memory changes. README's “recover safely” claim does not establish record repair or durable recovery.
- **Source:** Sound/notification settings are stored booleans without sound playback or Notification API behavior. HTML settings copy says “Play focus-session sounds” and “Show focus-session notifications,” which overstates implementation; README accurately states these effects are absent. Only the dark-space theme is offered; export/import and application-level shortcuts are not implemented.
- **Source:** Paused task cards expose only Resume/Finish, even though model archive/delete APIs allow paused tasks. Model stop and editable-field APIs also have no matching UI controls. These API capabilities should not be described as available browser workflows.

## Repository hygiene observations

- **Source:** `assets/images/` and `assets/screenshots/` contain duplicate tracked copies of the same four screenshots: `hero-dashboard.png`, `active-session.png`, `completed-session.png`, and `session-summary.png`.
- **Source:** The constructor comment in `js/storage.js` contains a stale reference to Electron adapters. This is documentation/code hygiene, not evidence of an implemented adapter or a v2 requirement.

## Evidence boundaries

Historical headless checks, the 48-check result, responsive/runtime verification claims, current live deployment settings, remote release objects/tags, branch policy, and actual GitHub protections: **UNVERIFIED**. Accessibility mechanisms are visible in HTML/UI/CSS, but assistive-technology outcomes and formal conformance are **UNVERIFIED**. The committed screenshots do not supply a reproducible test suite. None of these gaps implies an approved v2 feature or technology decision.
