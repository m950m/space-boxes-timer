# Changelog

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
