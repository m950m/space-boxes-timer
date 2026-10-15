# V2 presentation checkpoint

Historical PR #52 evidence follows. The independent post-merge
[final acceptance report](FINAL-VISUAL-ACCEPTANCE.md) records later fixes,
actual browser zoom, axe/Firefox evidence, remaining human checks and the merged
revision's CI blocker. [Artwork integration preparation](ARTWORK-INTEGRATION.md)
does not approve or install original assets.

This work builds on `aeb98789192a63b4c69bb7e769cc5f17e1d7c168` under the
[owner's visual workstream authorization](https://github.com/m950m/space-boxes-timer/issues/11#issuecomment-6164448833).
The local-first planning, focus authority and report calculations already existed.
This checkpoint changes their presentation only.

## Acceptance coverage

| Approved requirement | Delivered presentation and evidence |
| --- | --- |
| Planner, FR-TASK-001/003, AC-001/002/012 | Consistent editor/plan panels; explicit three-Primary limit and textual classification; nested task headings; existing session totals, breaks, resource links, parent and split controls preserved. Planner browser suite covers quota, editing, keyboard, failures and reload/restart. |
| Focus, FR-SESSION-002/003/004, AC-013/014/015 | Prominent task title, countdown and progress from the existing clock projection. Running, paused, observer, outcome, recovery and reconciliation remain explicit text. Focus UI suite covers controls, transfer, uncertainty and endings. Extra/child focus has its own named active surface outside Primary cards. |
| Reports, FR-ANALYTICS-001, AC-007 | Reflowing metric groups with semantic term/value pairs, factual task totals, read busy state and retry guidance. A failed read clears previously rendered totals. Calculations and attribution are unchanged. Missing recorded breaks/exposure are not fabricated. |
| Accessibility, FR-A11Y-001, AC-022 | Native navigation to focusable headings and a skip link; visible outlines; labeled native controls; status/alert regions; non-color task/session text; responsive typography, forms and long-content wrapping. No decorative animation. Automated browser evidence is detailed below; manual acceptance remains open. |
| Visual metaphor, FR-VISUAL-001/002, AC-010 | **Artwork-dependent acceptance remains gated.** `#primary-artwork` is an empty hidden integration point next to Primary planning. No substitute head, fourth Primary box or unapproved artwork is displayed. |

## Executed validation

Local real-Chrome runs used Chrome 154.0.8037.97 and Python 3.14.4, disposable
profiles/origins and production forms. No user browser data was modified.

- `python3 v2/frontend/tests/run-planner-tests.py`: Planner end-to-end and process restart;
  this existing CI entrypoint also runs the visual acceptance suite.
- `python3 v2/frontend/tests/run-visual-tests.py`: trusted Tab/Enter navigation and actions;
  long unbroken titles, notes and resource URLs; editor/focus/report reflow at 320, 375,
  768 and 1280 CSS pixels; 200% text enlargement at 320px; increased text spacing;
  action target heights; actual computed text contrast in empty/running/paused/ended/error
  states; progress contrast; browser accessibility-tree names/roles; reduced motion;
  forced-colors focus; report read failure/retry; Primary, Extra and child focus.
- `python3 v2/frontend/tests/run-focus-ui-tests.py`: 82 checks, including cross-tab
  control/recovery, reconciliation, failures, outcomes, reflow and process restarts.
- `python3 v2/frontend/tests/run-focus-domain-tests.py`: 127 checks including reports
  and planning regressions.
- `python3 v2/frontend/tests/run-focus-persistence-tests.py`: 48 checks including
  schema upgrade, real transaction failures, cross-tab arbitration and process restarts.
- `python3 v2/frontend/tests/run-browser-tests.py`: 21 browser persistence checks.
- Python compilation and `git diff --check` passed. Actual UI diff and generated
  desktop/mobile browser screenshots were reviewed.

For review images, use `python3 v2/frontend/tests/run-visual-tests.py --screenshots /tmp/space-boxes-visual-review`.
The suite has no new package dependency and runs through the existing Planner CI command.

## Remaining gates and limits

The owner must approve the original head artwork, Primary box opening/release and
the artwork treatment of Extra/subtask focus before those portions are implemented.
The hidden integration point is not completion of FR-VISUAL-001/002.

Manual screen-reader interaction (including live announcements, recovery and
reconciliation), physical touch-device checks, actual browser zoom, and additional
browser/assistive-technology combinations remain unexecuted. The 320px viewport
exercises the reflow width corresponding to a 1280px viewport at 400% zoom;
it is not an actual browser zoom test. Computed text contrast and the Chrome
accessibility tree are targeted automation, not a complete WCAG audit.
No WCAG conformance/certification or full Visual-stage completion is claimed.
Merge and deployment remain human-controlled. Backend/connected-product validation
is outside this presentation task.
