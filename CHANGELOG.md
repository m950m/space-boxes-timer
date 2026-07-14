# Changelog

## v1.0.0

Date

2026-07-14

Space Boxes Timer's first public release.

Added

- Local-first task creation, deletion, archiving, and restoration.
- One-active-task focus sessions with start, pause, resume, finish, and reload recovery.
- Versioned browser persistence for tasks, settings, and derived statistics.
- Session summaries with elapsed time, focus rating, and notes.
- Daily, weekly, and monthly focus totals, plus longest, average, and total-session metrics.
- Responsive desktop, tablet, and mobile layouts with keyboard-accessible modals and reduced-motion support.
- Public project documentation, architecture guidance, local setup instructions, and release screenshots.

Reliability

- Enforced one running task and one timer-update interval.
- Validated persisted task and session structures before restoration.
- Recovered safely from unavailable or invalid browser storage.
- Verified task creation, timer transitions, reload behavior, summaries, settings, statistics, reset, responsive layouts, and browser-console stability.

Release scope

- Ships as dependency-free HTML, CSS, and JavaScript through GitHub Pages.
- Stores all application data locally with no accounts, backend, analytics, tracking, or telemetry.

---

## v1.0.0-rc.2

Date

2026-07-14

Polished

- Reduced the sticky header height and tightened the overall vertical rhythm.
- Strengthened hero typography and supporting-copy readability.
- Compressed the desktop task composer into a single, efficient control row.
- Renamed the task submission action to “Launch Mission.”
- Enlarged the Energy Core timer, orbital rings, progress track, and ambient glow.
- Refined the empty-state scene, statistics grid spacing, and modal presentation.
- Improved desktop, tablet, and mobile sizing without changing DOM hooks.
- Added slow CSS-only core breathing, orbital, planet, and signal motion.

Verified

- Responsive presentation at 1920×1080, 1440×900, 1024×768, and 390×844.
- Create, start, pause, resume, finish, summary, settings, and statistics behavior.
- No application runtime errors, no horizontal overflow, and no JavaScript changes.
- Reduced-motion mode leaves no continuous decorative keyframes active.

---

## v1.0.0-rc.1

Date

2026-07-13

Refined

- Rebalanced the desktop hierarchy around the Energy Core and active timer.
- Reduced the task composer's height while preserving all fields and controls.
- Improved spacing between the hero, composer, active session, and task list.
- Reduced statistics-panel emphasis while keeping all values readable.
- Refined the empty-state scene, proportions, and copy spacing.
- Added slow CSS-only star drift and gentler active energy breathing.

Fixed

- Restored the intended single-column layout at tablet and mobile breakpoints.
- Prevented the statistics sidebar from overlapping main content at narrow widths.
- Matched focus-rating selected styles to the existing `aria-checked` state.

Verified

- Responsive presentation at 1920×1080, 1440×900, 1024×768, and 390×844.
- No horizontal overflow, no application console errors, and an unchanged create/start/pause/resume/finish lifecycle.
- Reduced-motion mode disables continuous decorative keyframe animation.

---

## v0.1.1

Date

2026-07-13

Stabilized the MVP through deterministic module tests and multi-reload browser testing.

Fixed

- Modal focus now wraps correctly when navigating backward from the dialog.
- Session summary closure now restores focus to a current, sensible task control after rerendering.
- Expected validation and state-guard errors no longer appear as unexpected console errors.
- Structurally corrupt persisted task records are rejected and recovered safely.

Verified

- Task creation, persistence, single-active-task enforcement, timer pause/resume intervals, reload restoration, summaries, statistics, task state operations, reset, keyboard behavior, and corrupted-storage recovery.
- One timer interval, one running task, no duplicate event effects, and no uncaught runtime errors.

---

## v0.1.0

Project Initialized

---

Future releases will be documented here.
