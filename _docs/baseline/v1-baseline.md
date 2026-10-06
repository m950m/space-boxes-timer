# Verified v1 engineering baseline

Inspected 2026-10-06 at commit `53a3a30584d86f6a5df09a9fb784af0126c17f98`, repository `m950m/space-boxes-timer`, branch `docs/v2-baseline`.

Evidence labels: **Source** means verified by committed implementation or tracked-file inventory; **Documentation** means verified as a statement in existing documentation; **Historical / UNVERIFIED** means the claimed outcome cannot be reproduced from committed evidence. This inspection did not execute browser workflows or historical tests. Implementation takes precedence over descriptive claims.

## 1. Repository structure

**Source:** The root contains `index.html`, `LICENSE`, and seven existing documents: `README.md`, `PROJECT_SPEC.md`, `TASKS.md`, `DEVLOG.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, and `AGENT_RULES.md`. Eight ES modules reside in `js/`; four stylesheets reside in `css/`. `assets/images/` and `assets/screenshots/` contain duplicate tracked copies of the same four screenshots: `hero-dashboard.png`, `active-session.png`, `completed-session.png`, and `session-summary.png`. README's tree lists only the screenshots directory, so it omits the tracked images directory. The two baseline documents are documentation additions to this inventory.

## 2. Current frontend architecture

**Source:** `index.html` loads `style.css`, `layout.css`, `animations.css`, then `modal.css`, and starts `js/app.js` with `type="module"`. There is one static document, native forms and templates, vanilla JavaScript classes/functions, and no committed dependency manifest, build system, router, framework, or server implementation. Application startup waits for DOM readiness when necessary. The browser owns runtime state and persistence; the application code contains no remote data transport.

## 3. Module responsibilities

**Source:**

| Module | Implemented responsibility |
| --- | --- |
| `js/app.js` | Bootstrap, service creation, restoration, action coordination, in-memory active-task ownership, settings normalization, persistence, error handling, and guarded timer interval. |
| `js/ui.js` | DOM queries, template-based task rendering, delegated task clicks, handler binding, timer/statistics/settings display, modal interaction, keyboard handling, and native alert/confirm calls. |
| `js/tasks.js` | Task validation, snapshot queries, lifecycle transitions, focus intervals, and single-running-task invariant. |
| `js/timer.js` | Independent elapsed-time state using an injectable clock; no DOM or storage. |
| `js/storage.js` | Versioned JSON envelopes through localStorage or an injected compatible backend. |
| `js/statistics.js` | Pure aggregation of session records with an optional reference timestamp. |
| `js/modal.js` | Serializable summary and confirmation data; modal DOM behavior actually belongs to `ui.js`. |
| `js/utils.js` | IDs, cloning, JSON parsing, validation, date/duration formatting, debounce, and throttle. |

CSS ownership: `style.css` defines tokens and base styles; `layout.css` defines component arrangement and responsive layouts; `animations.css` defines state-driven decorative motion; `modal.css` defines dialog presentation. Business modules do not manipulate DOM elements.

**Source — documentation/code hygiene:** The constructor comment in `js/storage.js` refers to storage being injected “for Electron adapters and tests.” The Electron-adapter reference is stale; it does not establish an implemented Electron adapter or a v2 requirement.

## 4. Task model and states

**Source:** `TaskManager.createTask()` produces `id`, `title`, `category`, `priority`, `estimatedDuration`, `status`, `createdAt`, `updatedAt`, `startedAt`, `finishedAt`, `totalElapsedTime`, `sessions`, `notes`, and `focusScore`. Durations are milliseconds; generated timestamps are ISO strings. New tasks are idle, have zero accumulated time and no sessions, empty/default notes, and null start/finish timestamps and focus score. Priorities are `low`, `normal`, or `high`; category is any nonempty string at the model boundary. The HTML offers deep-work, planning, learning, and personal categories. The model's default category is `general`.

States are `idle`, `running`, `paused`, `completed`, and `archived`. Start accepts idle; pause accepts running; resume accepts paused; stop accepts running/paused and returns idle. Completion closes a running interval and records finish time; the model also allows idle completion, whereas `app.js` permits finish only for running/paused tasks. Completed completion is idempotent. Archive/delete reject running tasks. Archive stores `archivedStatus`; restoration reinstates it and removes that field. Queries return clones; archived tasks are included by default, including in the rendered list and statistics input.

`ui.js` offers idle start/delete/archive, running pause/finish, paused resume/finish, completed delete/archive, and archived restore/delete. Model stop/update APIs have no corresponding task-edit/stop controls. The application requires a trimmed title and estimates of at least five minutes, converting minutes to milliseconds; HTML additionally uses `step="5"`. The model accepts nonnegative estimates and nullable integer focus scores from 1 to 5.

## 5. Focus-session model

**Source:** `TaskManager.#beginSession()` appends `{ id, startedAt, endedAt: null, duration: 0 }`. Pause or running completion closes the last open interval using `Date.now()` by default, stores its end timestamp and nonnegative duration, and adds the duration to `totalElapsedTime`. Resume creates a new interval; paused time is excluded. A task can therefore contain several statistical sessions before one task completion. Restoration validation requires exactly one open interval for running tasks and none for other states, unique task IDs, and unique session IDs within each task.

The model enforces at most one **running** task, not at most one running-or-paused task. `app.js` separately retains `#activeTaskId` after pause, preventing another task from starting/resuming while that ownership remains. `#restoreState()` restores ownership only via `getRunningTask()`: paused task state and recorded time survive reload, but paused focus ownership does not. See [known gaps](known-gaps.md) for the exact consequences.

## 6. Timer behavior

**Source:** `TimerEngine` has idle/running/paused/stopped states and tracks accumulated milliseconds plus a live clock delta. Its default clock is `performance.now()`, falling back to `Date.now()`. Pause freezes accumulated time, resume starts another delta, stop retains time, and reset returns idle/zero. Display formatting floors to seconds as `HH:MM:SS`.

`app.js` clears any prior timer interval before installing a one-second update interval, stops updates on pause/finish, and resets/starts the timer from the task's accumulated time on application resume. Running reload restoration seeds elapsed time with recorded closed intervals plus wall-clock time since the open interval's start, including time while the page was closed. Session records themselves use wall-clock time, so the live monotonic display and persisted duration have different clock sources.

Estimate progress is capped at 100% and never ends a task automatically. `ui.js.renderActiveSession()` calculates progress during full renders; one-second `updateTimerDisplay()` updates only time text/attributes, so progress does not advance on timer ticks. Statistics also do not refresh on ticks.

## 7. localStorage schema and ownership

**Source:** `StorageService` owns exactly these keys, each serialized as `{ "version": 1, "data": ... }`:

| Key | Data and application owner |
| --- | --- |
| `space-boxes-timer:tasks` | Array of task/session records; `TaskManager` owns domain state and `app.js` saves changes. |
| `space-boxes-timer:settings` | `theme`, `soundEffects`, `notifications`; normalized by `app.js`, defaults `space`, false, false. |
| `space-boxes-timer:statistics` | Derived aggregate object calculated by `StatisticsEngine` and saved by `app.js`. |

Malformed JSON, incompatible schema versions, read failures, or wrong top-level data types fall back to empty arrays/objects. Structurally invalid task arrays cause application restoration to discard the entire array in memory and report an error. This is fallback recovery, not repair of individual records. Save failures leave in-memory changes intact and report that they could not be saved. Startup recalculates statistics from tasks rather than trusting the saved aggregate. Reset removes only the three owned keys and resets in-memory state. There is no committed migration, export/import, cross-tab synchronization, or remote persistence implementation.

## 8. Statistics calculations

**Source:** `calculateStatistics()` collects intervals from all tasks, including archived tasks. Open intervals end at the supplied `now`; closed intervals use stored duration for longest/average metrics, with timestamp subtraction as fallback. Invalid sessions are omitted. Today's, weekly, and monthly focus totals sum timestamp overlap with local midnight, local Monday midnight, and local first-of-month midnight respectively, ending at `now`. These are calendar periods, not rolling windows.

Longest is the maximum interval duration; average is rounded total interval duration divided by interval count; total sessions counts intervals, including open and zero-duration intervals. Completed-task count includes only tasks currently marked completed, excluding archived completed tasks. Focus-score average uses all valid task ratings and rounds to two decimals. Current streak counts consecutive local dates backwards from today, marking each date from an interval's start through its end inclusively, including zero-duration intervals and an exact-midnight end date.

The UI exposes only today/week/month totals, longest/average interval, and interval count. Focus totals display floored hours/minutes; longest/average display zero, `<1m`, or rounded minutes. App recalculation occurs at startup, pause, finish, feedback, delete, archive, and restore; start/resume and timer ticks do not recalculate statistics. Thus displayed statistics can remain stale during active work.

## 9. Accessibility behavior

**Source:** HTML provides semantic regions/headings, labeled form controls, native buttons, time/progress elements, a polite live task-list region, a status empty state, labeled dialogs, and decorative `aria-hidden` elements. `ui.js` makes the application shell inert while a modal is open, focuses its dialog, wraps Tab/Shift+Tab, handles Escape, and restores focus to the trigger or a current task control/form fallback. Rating radios have roving tabindex and wrapping arrow-key selection. Settings toggles use `aria-pressed`. CSS provides focus-visible styling, responsive breakpoints, general reduced-motion overrides, and explicit removal of continuous decorative animations.

Browser/assistive-technology compatibility, contrast compliance, and formal accessibility conformance: **UNVERIFIED**. Source mechanisms do not establish an accessibility certification.

## 10. Deployment model

**Documentation:** README and CHANGELOG identify static GitHub Pages delivery at `https://m950m.github.io/space-boxes-timer/`. **Source:** Root-relative repository files can be served directly without a build; local history includes root relocation and commits named for Pages redeployment. No committed CI/deployment workflow or hosting configuration establishes current GitHub Pages settings. Current live deployment, source branch, deployment permissions, and production/integration protections: **UNVERIFIED**; no remote settings or live site were inspected.

## 11. Development workflow

**Documentation:** README/CONTRIBUTING prescribe `python3 -m http.server 8765`, then a modern browser at localhost:8765; HTTP is used for ES modules. Contributions use a focused branch, preserve module boundaries, report browser validation, and explain changes in pull requests. AGENT_RULES requires reading PROJECT_SPEC/TASKS and limits edits to the task. DEVLOG describes task records; TASKS marks Tasks 1–23 done. These are documented procedures/statuses, not evidence of each historical execution. No dependency installation, build command, or committed test runner is provided.

## 12. Testing evidence

**Source:** The tracked inventory contains no automated test files, test runner, test configuration, package manifest, or CI workflow. Injectable clocks, ID factories, storage backends, and UI document arguments enable isolated verification but do not constitute tests. **Documentation:** CONTRIBUTING explicitly acknowledges no committed runner and supplies a manual validation checklist.

**Historical / UNVERIFIED:** DEVLOG Sprint 4 claims a headless lifecycle test; Sprint 5 claims 48 passing checks (8 deterministic module checks and 40 multi-reload browser checks). DEVLOG/CHANGELOG also claim responsive checks at 1920×1080, 1440×900, 1024×768, and 390×844, no runtime errors/overflow, and lifecycle/accessibility/storage stabilization. The harness, assertions, results, browser versions, and invocation are not committed. Screenshots document appearance but cannot reproduce these checks. No new tests or runtime checks were performed for this documentation task.

## 13. Git and release structure

**Local Git evidence:** Origin is `https://github.com/m950m/space-boxes-timer.git`. At inspection, `docs/v2-baseline`, local `master`/`v2`, and remote-tracking `origin/master`/`origin/v2` all point to the inspected commit. These remote-tracking references are local observations; current remote state is **UNVERIFIED**. `git tag -n` returns no local tags. History includes sprint commits, v1 preparation, repository-root relocation, Pages deployment-named commits, screenshots, and final release documentation.

**Documentation:** CHANGELOG lists v0.1.0, v0.1.1, v1.0.0-rc.1, v1.0.0-rc.2, and v1.0.0, with v1.0.0 dated 2026-07-14; README advertises v1.0.0. Actual GitHub release objects, remote tags, branch roles, and protection rules are **UNVERIFIED**. Local branch names alone do not establish production/integration policy.
