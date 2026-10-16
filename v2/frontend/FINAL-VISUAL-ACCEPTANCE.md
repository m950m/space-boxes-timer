# Final visual acceptance and release verification

## Current delivery — 2026-10-16

**Prepared integration boundary and Chrome regression complete; full Visual
Acceptance remains OPEN.** This section supersedes the engineering status below.
The historical results are retained with their original revision/limitations.

- Base: freshly fetched `origin/v2`, verified GitHub integration
  `b636fba7bd4679d43c6ade8c78e0fc0afd3b17c2` (merged PR #58).
- Branch: `feature/v2-final-visual-delivery`; checkout:
  `/home/mnabil/Learning/projects/Space_boxes_Codex_VisualAcceptance`, initially
  clean. Existing branches/worktrees were preserved. The delivery commit/PR is
  the containing revision; runtime checks below exercised its final HTML/CSS and
  new Chrome test, before documentation-only completion.
- [Ownership coordination for Zcode](https://github.com/m950m/space-boxes-timer/issues/11#issuecomment-6214424608)
  records the bounded writing window. Zcode's Firefox worktree and all existing
  acceptance runners remain untouched. No open PR overlapped this scope at
  preflight; previous Visual writes were released and PRs #57/#58 integrated.
- Changed files: `index.html`, `css/planner.css`,
  `tests/run-artwork-integration-tests.py`, this report and
  `ARTWORK-INTEGRATION.md`. No state, authority, data, account, sync or backend
  code changed. Publication is scoped to this branch/PR under the current owner
  mission; merge and production release remain human-controlled.

The Primary host stays in its existing place before Primary cards. A second
empty host follows the active task title in Focus for approved Extra/subtask
art. Both remain hidden and excluded from accessibility. The inert image
template requests no asset; responsive styles preserve intrinsic proportions,
normal flow and control access. There is no displayed placeholder, character,
animation or new user action. Completed screens retain their layout. The
[integration brief](ARTWORK-INTEGRATION.md) records exact placement, asset
provenance, semantic/static requirements and future session-to-image mapping.
The original head/box experience is still unimplemented pending exact approval.

### Current executed evidence

Linux, Python 3.14, **Chrome 155.0.8059.84**; disposable profiles/origins only.

| Check | Result on final presentation files |
| --- | --- |
| New Chrome artwork integration runner | **54 boundary checks + 3 image/accessibility/keyboard assertions passed.** Empty/hidden hosts, correct placement, no asset request, informative SVG alternative in the accessibility tree, decorative-image exclusion, unchanged 16-stop forward/visible-focus and reverse keyboard traversal; proportional geometry fixture in both hosts at 320/375/768/1280px with 100/200% text, reduced motion and forced colors. Fixtures are temporary rectangles, not product art. |
| Existing Chrome visual runner | **65 passed**: production Planner/Focus/Activity actions, keyboard, long content, responsive text/controls, computed contrast, reduced motion, forced colors and Reports request races. |
| Existing final acceptance runner, `--browser chrome` | **54 passed**, including recovery/reconciliation/errors, keyboard, live-status DOM behavior and actual 100/200/400% layout zoom. Fixed 1280px outer window gave 1280/640/320px inner widths, DPR 1/2/4, scale 1, no horizontal overflow. |
| Pinned axe 4.10.3 | **12 state audits, zero violations**. Eleven retain the note-field contrast incomplete; no rule disabled or finding suppressed. Bundle SHA256 is the pinned value below. |
| Screenshot review | Narrow reconciliation and 400% Focus reviewed: text wraps, controls remain in flow, visible focus remains discernible. Long content requires vertical scrolling. Production screenshots and zoom metrics were captured. |
| Static/diff checks | New Python runner compiles; `git diff --check` passes. Deliberate scope review confirms only the five files above; existing Firefox/shared runners are unchanged. |

Previously passing broad domain/persistence/backend suites were not repeated
locally for dormant markup/styles. The PR's configured CI gates must pass at its
published head; their remote results belong in the final PR/handoff. The new
Chrome-only runner is a separate local verification command, not a new CI job.
No current Firefox, human AT or physical-device pass is claimed.

### Contrast finding disposition

Reproduced axe's `#task-note` incomplete with both empty and populated text:
`elmPartiallyObscured` / background could not be determined. Rendered computed
foreground is `#182c3d` on opaque `#ffffff`, opacity 1: **14.32:1**, above the
4.5:1 normal-text threshold. Browser hit-tests at 10/50/90% of the field's
interior centerline returned the textarea as the topmost element. Existing
visible-text checks passed across interaction states. No actual contrast failure
was confirmed in this scope; no speculative color/layout change was made.
These sampled checks do not resolve every possible overlap. Keep the incomplete
for human visual/AT review; zero automated violations is not conformance.

### Owner-facing final acceptance checklist

| Acceptance item | Current disposition / required evidence |
| --- | --- |
| Integration architecture, hooks, static responsiveness and semantics | Prepared and Chrome-tested; review containing diff and the integration brief. No actual art installed. |
| Exact original artwork | **OWNER APPROVAL REQUIRED:** original head style, zero/one/two/three Primary compositions and empty slots; closed/open Primary and explicit Start release; active Extra/subtask outside the boxes; exact responsive/static/reduced-motion versions and any essential alternatives. Additional session-state art remains undecided. Record filename/hash, provenance/license, versions/screens and decision link together. |
| Artwork-dependent AC-010 | **BLOCKED ON ASSETS:** integrate only the approved versions, then verify actual Primary opening and Extra/child focus with existing identity/status/control semantics. Repeat affected visual, zoom, contrast and keyboard checks. Template tests do not satisfy AC-010. |
| Firefox keyboard | **ZCODE / OPEN:** reproduce and resolve strict skip-link/focus failure in its assigned worktree; record normal-window keyboard evidence on the integrated candidate. Smoke tests or Chrome success do not waive this. |
| Actual assistive technology | **HUMAN EVIDENCE REQUIRED:** labels/errors/busy state, Start/Pause/End, timer silence, automatic completion, observer/recovery, failed/corrected reconciliation, report retry and note-field contrast review. Record OS/browser/AT versions, candidate SHA and actual spoken outcomes. |
| Physical touch devices | **HUMAN EVIDENCE REQUIRED:** real hardware/OS/browser, portrait/landscape, native inputs, software keyboard, long content, targets and recovery/reconciliation; record candidate SHA. Viewport emulation is insufficient. |
| Final visual and release decision | Review actual approved assets plus zoom/spacing/forced-colors/static behavior. Record outstanding results on #11, confirm final-head CI, then use separate human merge/release authorization. No WCAG certification or production readiness is granted here. |

Current commands (no Firefox invocation):

```bash
python3 v2/frontend/tests/run-artwork-integration-tests.py
python3 v2/frontend/tests/run-visual-tests.py \
  --screenshots /tmp/space-boxes-final-visual-delivery/screenshots
python3 v2/frontend/tests/run-final-acceptance-tests.py --browser chrome \
  --axe-source /tmp/axe-4.10.3.js \
  --artifacts /tmp/space-boxes-final-visual-delivery/final
```

Local-only evidence: `/tmp/space-boxes-final-visual-delivery/` contains baseline
and final logs, `contrast-probe.log`, `evidence-summary.json`, screenshots/axe/zoom
JSON, and a SHA256 artifact manifest. These are not remotely published release
artifacts; repeatable commands and factual results are durable here. The supplied
axe bundle is hash-checked by the runner and never downloaded by it.

### Ownership release and next action

No further writes are planned after publication of this scoped delivery. Return
assignment control to the owner; account for the containing PR's unmerged files
before another writer edits them. Zcode continues Firefox independently. Owner
reviews the integration preparation, approves the exact artwork package and
assigns human AT/device acceptance. Those gates prevent full visual release;
there is no remaining confirmed independent presentation defect from these checks.

## Historical engineering checkpoint — 2026-10-15

Checkpoint: **2026-10-15, engineering repairs complete; full Visual Acceptance
remains OPEN.** This supersedes the PR #56 acceptance checkpoint for current
status. Its [historical evidence](https://github.com/m950m/space-boxes-timer/blob/ead59ab5bd3a98c8edf40d4501585c0aef45cbdd/v2/frontend/FINAL-VISUAL-ACCEPTANCE.md)
remains available. Authority: [PRD](../../_docs/product/v2-prd.md),
[OD-023/027](../../_docs/product/owner-decisions.md),
[workflow](../../_docs/agents/v2-agent-workflow.md),
[Issue #11](https://github.com/m950m/space-boxes-timer/issues/11).

## Revision, ownership and scope

- Repository/origin: `m950m/space-boxes-timer`,
  `https://github.com/m950m/space-boxes-timer.git`.
- Physical checkout: `/home/mnabil/Learning/projects/Space_boxes_Codex_VisualAcceptance`.
  Started clean on the merged PR #56 branch; preserved that branch and all other
  worktrees. Freshly fetched `origin/v2` and created
  `fix/v2-visual-acceptance-closure` from
  `a9315103cbac4a0e1c100ac5f4bdb38d072dca0e`.
- Implementation: `77255b69cf0d01f94998f0a954fbf0b0522db78c`.
  Documentation commits after this contain the same tested runtime/test files.
- The current owner assignment resumes the bounded Visual Acceptance workstream.
  PR #56 is merged, its prior writer handed off, the duration-repair worktree
  is clean, and no other inspected worktree has uncommitted changes in the owned
  views/tests. Connected backend edits and the separate integration runner were
  left untouched. This branch owns only the two view modules, three presentation
  runners and this report until its documented handoff.
- No backend, database, synchronization, controller, persistence, domain authority,
  report calculation, CI configuration or unrelated behavior changed. Local-first
  and connected stores still provide the same `loadFocus` / `commitFocus` boundary.
  Exact original artwork remains absent pending approval.

## Confirmed defects and regression evidence

| Trigger | Reproduction and repaired behavior |
| --- | --- |
| Switch Plan Day during a pending Reports read | The base drops the second request (`reads.length` is 1); a pre-switch snapshot can be displayed under the new day. Each requested day now reads fresh evidence. A captured day/request sequence permits only the latest success, failure and finalizer to update the view. Loading names the day and clears old output. |
| Clear Plan Day during a pending Reports read | The invalid day previously skipped refresh, allowing stale output/status. Clearing the day now invalidates pending results, shows the chooser instruction and settles controls immediately. |
| Submit reconciliation parts that do not sum to the interval | On the base this stops the controller, focuses the heading and requires Refresh. The form now uses the existing pure reconciliation validator before controller invocation, announces the input error and focuses the field. Correcting/resubmitting needs no Refresh. Storage/authority failures still use the existing recovery path. |
| Empty, negative, overflowing duration or no explicit parts | Native constraints and finite unit conversion are checked before submission. Inputs remain editable, errors describe the focused field, zero remains valid under existing domain rules, and original evidence stays intact. Tests resume sampling after invalid input, then correct and commit ordered parts. |
| Zero-duration Focus summaries | Focus used `0.0 seconds` while Reports used `0 seconds`; both now use `0 seconds`. Nonzero formatting is preserved. |

The CI-wired visual runner covers both stale-success/stale-failure completion
orders, current failure/retry, busy controls, cleared dates and output freshness.
The Focus runner covers controller usability, ongoing sampling, unchanged
reconciliation evidence on rejection, correction, explicit recovery and genuine
storage/authority failures. No acceptance assertion was relaxed to hide a failure.

## Executed browser and accessibility evidence

Linux, Python 3.14, **Chrome 155.0.8059.79**, **Firefox 157.0**. All local browser
profiles/origins and stored plans were disposable. Python stdlib and installed
browsers were sufficient; no runtime dependency or project tooling was added.

| Executed check | Result |
| --- | --- |
| `run-planner-tests.py` | Planner/restart passed; **65 visual checks** passed, including 7 new Reports race checks. |
| `run-focus-ui-tests.py` | **92 checks passed** on the final runtime code: trusted keyboard controls, input errors/correction without Refresh, continued sampling, tabs, reload, restart, recovery and storage failure. |
| `run-focus-domain-tests.py` | **127 checks passed**, including Focus/activity reports and six planning regression suites. These modules were not edited. |
| `run-connected-sync-tests.py` | **14 checks passed**: real IndexedDB with a stubbed network boundary, reload, edit upload, idempotent retry and surfaced conflicts. This is not a live backend or cross-device acceptance claim. |
| Final acceptance, Chrome | **54 checks passed** on the final runtime code, with pinned axe, interaction/reconciliation/error states, actual browser layout zoom and screenshots. |
| Final acceptance, Firefox smoke | **8 checks passed**: initial/startup-error audits, 320/375/768/1280px reflow, 200% root text at 320px and computed contrast. This does not include passing Firefox keyboard acceptance. |
| Additional Chrome focus-order probe | Trusted sequential Tab through 12 header/navigation, account and Focus controls, and Shift+Tab back: expected order, visible outlines, no trap. |
| Python compilation / `git diff --check` | Passed. Deliberate diff review found no edits outside the owned frontend boundary. |

Names/roles/labels, headings, error/busy/status semantics, focus restoration,
long text, 320/375/768/1280px, 200% text, text spacing, target sizes, computed text
contrast, forced colors and reduced motion were exercised by the visual suites.
Chrome recovery/reconciliation forms also reflow at all four widths and 200%
text at 320px. Start/Pause/End update semantic status; ordinary running checkpoints
do not repeatedly mutate the live status and the clock is `aria-live="off"`.
These are DOM/browser checks, **not observed screen-reader speech**.

At a fixed 1280px Chrome outer window, actual browser layout zoom produced
inner widths 1280/640/320 and DPR 1/2/4 for 100/200/400%, with viewport scale 1
and no horizontal overflow. This uses disposable browser Preferences, not CSS
zoom or pinch emulation. Human operation of the browser zoom UI is not claimed.
Reviewed images include narrow Firefox Planner, Chrome report error, and enlarged
reconciliation. Very long titles at narrow widths and 200% text remain vertically
lengthy; text and controls remain available through scrolling.

Pinned **axe-core 4.10.3** SHA256:
`880970c081707360e64f34cea25ff91892f5bc95675b0776925b9709dd8a68bb`.
**14 state audits: zero violations** (12 Chrome, two Firefox). Eleven Chrome
audits retain an incomplete `color-contrast` rule on empty `#task-note`; computed
style contrast passes separately. Preserve those incomplete findings for human
review. Zero violations do not establish WCAG conformance.

Historical passing persistence suites were not repeated locally because their
implementations and boundaries did not change. The PR's exact-head CI must still
run its full configured suites. Prior intermittent browser restart/upgrade CI
failures are recorded in the historical report and Issue #11; do not dismiss any
recurrence as proven flaky. The post-acknowledgement task-edit sync gap mentioned
in that old report was integrated by PR #55 before this base; it is not an open
repair assigned to this branch.

## Firefox keyboard blocker — reproduced, not waived

Actual Firefox 157 was exercised through WebDriver BiDi trusted key actions in
both headless mode and a normal window on the available display. Headless Tab
advanced from the task title to its date input, but `document.hasFocus()` was
false and `:focus-visible`/outline checks did not pass. A normal-window run of
the strict interaction suite also failed the first `.skip-link` focus assertion.
Changing the diagnostic traversal to forward Tab/backward Tab still left the
active element without the expected link identity. `browsingContext.activate`
was unsupported by the installed browser and was removed from the runner.

After two bounded keyboard-harness repair attempts, work on that blocker stopped
under the workflow. **Cause remains unresolved:** no claim of a browser product
defect, browser-window focus issue, or harness-only failure is proven. No CSS or
assertion was weakened. The optional `--firefox-headed` diagnostic retains the
strict assertion and currently fails here; default Firefox smoke passing does
not supersede it. Normal-window keyboard reproduction is still needed before
Firefox keyboard compatibility can be accepted.

### 2026-10-16 update — classified UNVERIFIED — ENVIRONMENT-BLOCKED

One further bounded investigation established the mechanism and the
classification; no application code changed.

- The strict assertion still fails in a headed Firefox 157 window with
  `document.activeElement` already on `.skip-link`; only the
  `:focus-visible`/solid-outline part cannot pass. Firefox suppresses
  `:focus` and `:focus-visible` styling whenever `document.hasFocus()` is
  false, and this machine never grants OS window focus to a window started by
  a non-interactive test process.
- Application focus behavior is correct: with trusted WebDriver BiDi key
  actions, Tab/Shift+Tab traversal repeatedly returns `activeElement` to
  `.skip-link` (headed Wayland, headed XWayland and headless alike). The app
  ships standard `:focus-visible`/`:focus` styles (`css/planner.css`: 3px
  solid outline, `transform: none`), consistent with WCAG 2.4.7; the identical
  strict check passes in Chrome.
- Environment evidence: `browsingContext.activate` is now supported by
  Firefox 157 (the earlier "unsupported" observation is stale) but does not
  move compositor keyboard focus; `window.focus()` is ineffective; Snap
  Firefox cannot open the X display (`MOZ_ENABLE_WAYLAND=0` fails with
  "cannot open display"), while a non-Snap Firefox 157.0 tarball with
  `GDK_BACKEND=x11` runs on XWayland; there `xdotool windowactivate` sets
  X-level active/focused state yet keyboard focus never moves, XTEST
  pointer/keyboard events do not grant focus, and sole-window-on-empty-desktop
  placement is still denied. No screen lock and no remote-desktop session were
  active (`LockedHint=no`, no RDP/VNC listener). GNOME Shell Eval is disabled,
  so shell state cannot be inspected or changed.
- Conclusion: the visible-keyboard-focus criterion for Firefox is
  **UNVERIFIED — ENVIRONMENT-BLOCKED** on this machine — neither passed nor
  failed. Real-user keyboard reproduction (a Firefox window that actually
  receives OS input focus) remains the acceptance gate. Reproduction commands
  and probe evidence: see the PR/commit message of
  `fix/v2-firefox-keyboard-environment-blocked`; run the strict diagnostic via

  ```bash
  python3 v2/frontend/tests/run-final-acceptance-tests.py --browser firefox \
    --firefox-headed --firefox-profile-parent "$HOME/snap/firefox/common"
  ```
- Regression guard added: the Firefox smoke suite now exercises trusted
  traversal to the skip link (`Firefox: trusted keyboard traversal returns to
  the skip link`), so a focus-order regression would be caught without OS
  window focus. It deliberately does not evaluate `:focus-visible`/outline and
  does not claim visible-focus acceptance; the strict headed assertion is
  unchanged. The smoke suite is now 9 checks.

## Repeatable verification and local artifacts

Commands from the owned checkout:

```bash
python3 v2/frontend/tests/run-planner-tests.py
python3 v2/frontend/tests/run-focus-ui-tests.py
python3 v2/frontend/tests/run-focus-domain-tests.py
python3 v2/frontend/tests/run-connected-sync-tests.py
python3 v2/frontend/tests/run-final-acceptance-tests.py \
  --axe-source /tmp/space-boxes-visual-closure/axe-4.10.3.js \
  --firefox-profile-parent "$HOME/snap/firefox/common" \
  --artifacts /tmp/space-boxes-visual-closure/final
```

The Snap profile-parent flag is environment-specific; omit it for a conventional
Firefox install. Supply the hash-verified axe bundle locally; the runner never
downloads it. Optional Firefox diagnostic (requires a display; currently fails):

```bash
python3 v2/frontend/tests/run-final-acceptance-tests.py --browser firefox \
  --firefox-headed --firefox-profile-parent "$HOME/snap/firefox/common" \
  --artifacts /tmp/space-boxes-firefox-keyboard
```

Local evidence: `/tmp/space-boxes-visual-closure/` contains baseline reproduction
logs, `planner.log`, `focus-ui.log`, `domain.log`, `connected-sync.log`,
`final.log` (both browsers), `final-chrome.log` (after the overflow-field focus
repair), `focus-order.json`, Firefox failure/probe logs, `final/*.json` and PNGs,
and a SHA256 `manifest.json`. Temporary artifacts are not published or committed;
the commands and results are durable here. Do not confuse local files with
remotely available release artifacts.

## Exact remaining human release gates

1. **Original artwork:** owner approves the actual original person/head and
   zero/one/three Primary compositions, explicit Primary opening/release,
   Extra/subtask active representation outside the three boxes, and static /
   reduced-motion / narrow / zoomed versions. Record exact asset hashes,
   provenance/license and approval link. Follow [ARTWORK-INTEGRATION.md](ARTWORK-INTEGRATION.md)
   before integration; a metaphor approval is not asset approval. Repeat affected
   presentation tests after approved assets are integrated.
2. **Actual assistive technology:** reviewers exercise required/invalid labels,
   save/error/busy feedback, Start/Pause/End, timer silence, automatic completion,
   observer/recovery, failed and corrected reconciliation, and Reports refresh
   success/failure. Record candidate SHA, browser/AT/OS versions and actual spoken
   results; e.g. NVDA/Firefox and VoiceOver/Safari are suggested, not an approved
   or already tested support matrix. Review axe incomplete contrast findings.
3. **Physical touch devices:** portrait/landscape, native date/time/select inputs,
   target reachability, long content, software keyboard, focus/recovery and
   reconciliation forms. Record real hardware, OS/browser and candidate SHA;
   emulated viewports do not satisfy this gate.
4. **Firefox keyboard:** resolve the exact strict-probe failure above and verify
   a normal browser window's visible focus, sensible order, no trap, task editing,
   Start/Pause/End, automatic completion, recovery/reconciliation and report retry.
   This is an unresolved verification blocker, not an artwork/product decision.

Human visual review of actual browser zoom/spacing/forced-colors/reduced-motion
and the final approved artwork remains part of release acceptance. Safari,
human screen-reader use and physical device testing were unavailable here.
No full Visual Acceptance, WCAG conformance, live connected-product release,
merge or deployment approval is inferred from this engineering checkpoint.
