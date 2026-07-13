# Changelog

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
