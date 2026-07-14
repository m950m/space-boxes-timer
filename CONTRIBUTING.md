# Contributing to Space Boxes Timer

Thank you for considering a contribution. Space Boxes Timer is intentionally small, dependency-free, and local-first. Contributions should preserve that scope and the existing separation between application state and presentation.

## Before you begin

1. Read [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md), and [AGENT_RULES.md](AGENT_RULES.md).
2. Check existing issues before starting substantial work.
3. Keep each contribution focused on one problem or feature.
4. Do not include unrelated formatting, generated files, or architectural changes.

## Local setup

The project has no package dependencies or build step. Serve the repository root over HTTP so native ES modules load correctly:

```bash
python3 -m http.server 8765
```

Open [http://localhost:8765](http://localhost:8765) in a modern browser.

## Architecture

| Area | Owner |
| --- | --- |
| Application lifecycle and coordination | `js/app.js` |
| DOM rendering and browser interaction | `js/ui.js` |
| Task state and session intervals | `js/tasks.js` |
| Elapsed-time state | `js/timer.js` |
| Browser persistence | `js/storage.js` |
| Statistical aggregation | `js/statistics.js` |
| Summary and confirmation data | `js/modal.js` |
| Shared validation and formatting | `js/utils.js` |

Business logic must not manipulate the DOM. Rendering belongs in `ui.js`; persistence, timing, task state, statistics, and modal data must remain independently testable.

## Coding conventions

### JavaScript

- Use native ES modules and the existing public module APIs.
- Keep state transitions explicit and validate inputs at module boundaries.
- Return snapshots rather than exposing mutable internal state.
- Reuse utilities and injected dependencies instead of duplicating behavior.
- Do not introduce external dependencies without prior maintainer agreement.

### HTML and accessibility

- Preserve semantic structure, element IDs, ARIA relationships, templates, and JavaScript hooks.
- Keep controls keyboard-operable and maintain modal focus behavior.
- Use external scripts and styles; do not add inline JavaScript or CSS.

### CSS

- Reuse the tokens in `css/style.css` and existing component selectors.
- Keep layout, animation, and modal responsibilities in their current files.
- Preserve responsive behavior and `prefers-reduced-motion` support.
- Avoid duplicate declarations and unnecessary visual rewrites.

### Documentation

- Describe only implemented behavior.
- Keep version and roadmap statements consistent with [CHANGELOG.md](CHANGELOG.md) and [README.md](README.md).
- Update task or development records only when the contribution changes their documented state.

## Validation

There is currently no committed test runner. Validate the affected behavior in a local browser and report exactly what was checked.

For application changes, cover the relevant parts of this baseline:

- Fresh startup and task creation.
- Start, pause, resume, and finish transitions.
- Page reload while running and paused.
- Session summary and statistics updates.
- Delete, archive, restore, and reset operations.
- Keyboard navigation, modal focus, and reduced-motion behavior.
- Desktop, tablet, and mobile layouts when presentation changes.
- Browser console output and duplicate timer or event behavior.

## Pull requests

A pull request should include:

- A concise problem statement and the reason for the change.
- The implementation approach and affected files.
- Validation steps and results.
- Screenshots for user-visible changes.
- Any storage, compatibility, accessibility, or documentation impact.

Keep commits reviewable and avoid combining unrelated work. Maintainers may request a smaller scope when a change crosses module boundaries without a clear requirement.

By contributing, you agree that your work will be licensed under the project's [MIT License](LICENSE).
