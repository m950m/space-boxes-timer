# Final visual acceptance and release verification

Checkpoint: 2026-10-15. **Presentation fixes verified locally; full Visual acceptance
and release readiness remain open.** This report supplements the historical
[Visual Experience checkpoint](VISUAL-EXPERIENCE.md). Authority remains the
[PRD](../../_docs/product/v2-prd.md), [OD-023/027](../../_docs/product/owner-decisions.md),
[workflow](../../_docs/agents/v2-agent-workflow.md) and
[Issue #11](https://github.com/m950m/space-boxes-timer/issues/11).

## Revision, ownership and scope

- Verified origin: `https://github.com/m950m/space-boxes-timer.git`.
- Initial base: `8f8443c211e96d48d0bb97d056f131a29e98beae`, merged PR #52.
  After PRs #53/#54 landed during testing, the final candidate was based on freshly
  verified `origin/v2` at `a05035741698611d9dc38964cb3375e859a8fab5`.
- Independent worktree: `~/Learning/projects/Space_boxes_Codex_VisualAcceptance`,
  branch `fix/v2-final-visual-acceptance`. The initial CI checkout stayed on
  `docs/v2-operations-handoff`; no existing worktree was switched or overwritten.
- Other worktrees were inspected. The former Visual writer explicitly handed
  ownership back in [Issue #11's checkpoint](https://github.com/m950m/space-boxes-timer/issues/11#issuecomment-6164882807).
  Active connected-product backend edits were preserved in their own checkout.
- Final implementation checkpoint: `8ddc412d129a54d48be12bcbe1fe967299433c4c`.
  Original implementation `a5fc560bf23b6f882ba0aa4c2221df9463956ded` and initial
  documentation are preserved on `fix/v2-final-visual-acceptance-initial`.
  The owned patch was cherry-picked onto the new base without rebasing, resetting,
  deleting branches or performing a merge. The final branch retains only scoped
  presentation changes relative to that base. Publication requires remote SHA
  verification; a local commit alone is not a GitHub checkpoint.
- Changes are limited to frontend views, presentation-only startup feedback,
  presentation tests and documentation. No backend, database, synchronization,
  domain, reports calculation or persistence logic changed.

## Confirmed defects repaired

| Trigger | Previous presentation | Corrected behavior |
| --- | --- | --- |
| Refresh Activity with keyboard focus on its button | Disabling the button during the read dropped focus to the document | Restore the button's focus after success/failure only if focus fell to the document; preserve focus if the user moved elsewhere |
| Automatic Focus completion or a failed Focus/reconciliation action | A disappearing control or failed action could leave keyboard focus without its interaction context | Focus the Focus heading when its focused control disappears; restore action context after failures as well as success; automatic completion preserves focus elsewhere in Planner |
| Storage startup fails | Activity stayed at Loading with an enabled inert refresh action; the timer still looked loading | Set settled error/busy states, hide the unavailable timer, disable the unavailable report action and explain page reload retry |

These changes do not change when a session completes, how recovery is decided,
what time counts, or how data is read/written.

## Executed evidence

Linux, Python 3.14; disposable test origins/profiles; Chrome 155.0.8059.79 and
Firefox 157.0. All results below are local. Screenshots are generated browser
images inspected by the agent, not physical-device or human usability testing.

| Check | Result and practical coverage |
| --- | --- |
| `run-planner-tests.py` | Passed again on the final implementation: Planner browser/restart coverage plus the expanded **58-check** CI-wired visual suite: trusted keyboard navigation, names/roles, long content, Primary/Extra/subtask focus, 320/375/768/1280px, 200% text, spacing, targets, computed contrast, forced colors, reduced motion and the new focus regressions |
| `run-final-acceptance-tests.py` with pinned axe and both browsers | **56 presentation checks passed again on the final implementation**; Chrome interaction/recovery/error coverage and Firefox initial/error/reflow smoke, described below |
| `run-focus-ui-tests.py` | **82 passed again on the final implementation**: real tabs, recovery, reconciliation, failures, reload and process restart |
| `run-focus-persistence-tests.py` | **48 passed locally on the initial base**; later-base coverage is from its green remote CI |
| `run-focus-domain-tests.py` | **127 passed on the initial base**, including reports/planning regressions; later domain changes are outside this patch and covered by the later base's CI |
| `run-browser-tests.py` | **21 passed on the initial base**, including after the startup-error presentation fix; later-base coverage is from its green CI |
| Python compilation and `git diff --check` | Passed |

The final Planner, Focus UI and final acceptance runs include the startup-error
fix and the latest base's Account UI. The new runner is an explicit acceptance
command; existing CI still invokes the 58-check visual
suite through Planner. No CI configuration or shared runner was changed.

The final Chrome flow tests invalid/save feedback, Start/Pause/End focus,
paused reload, explicit recovery, reconciliation errors and successful removal,
report failures/stale-output clearing, and storage denial. A MutationObserver
confirms that ordinary running checkpoints do not repeat the live status; the
clock has `aria-live="off"`. Pause and End update status text. These assertions
verify DOM behavior, not what a screen reader actually speaks.

Actual Chromium **layout zoom** used disposable browser Preferences at a fixed
1280px outer window; it did not use CSS zoom or pinch emulation:

| Zoom | `outerWidth` | `innerWidth` | Device pixel ratio | Visual viewport scale | Horizontal overflow |
| --- | --- | --- | --- | --- | --- |
| 100% | 1280 | 1280 | 1 | 1 | None |
| 200% | 1280 | 640 | 2 | 1 | None |
| 400% | 1280 | 320 | 4 | 1 | None |

Long titles and Focus controls also reflowed at each actual zoom level.
Recovery/reconciliation were separately checked at 320/375/768/1280 CSS pixels
and 200% root text at 320px. Long text remains readable through vertical
scrolling; extreme long titles at 200% text create substantial vertical length.
Review images include desktop Planner, 320px Reports/error/recovery,
200% text reconciliation, 400% zoom Focus and Firefox narrow Planner.

### axe results and limits

The optional local axe-core **4.10.3** bundle was hash-verified:
`880970c081707360e64f34cea25ff91892f5bc95675b0776925b9709dd8a68bb`.
Audits selected WCAG 2 A/AA, WCAG 2.1 AA, WCAG 2.2 AA and best-practice tags.

**14 state audits, zero violations:** 12 Chrome (initial, running, paused,
recovery, reconciliation, reconciliation error, Reports, Reports error, startup
error and 100/200/400% zoom); two Firefox (initial and startup error).
Eleven Chrome audits returned the same incomplete `color-contrast` rule for
empty `#task-note`. Computed-style contrast checks include this control and
passed; preserve the incomplete entries for manual review. Chrome startup error
and both Firefox audits had zero incomplete rules. Zero violations do not prove
WCAG conformance.

Firefox initial panels additionally passed the four viewport widths, 200% root
text at 320px, computed text contrast and startup-failure feedback. **Firefox
interactive keyboard acceptance is unverified:** two bounded automation repairs
did not resolve the headless skip-link focus-visible assertion. An isolated
trusted Tab probe traversed the link, but did not establish the full assertion
or its cause. The committed Firefox smoke deliberately makes no keyboard claim.
Manual Firefox keyboard reproduction is still needed; this is not classified
as either a confirmed product defect or a proven harness-only defect.

Raw local evidence is under `/tmp/space-boxes-final-visual/`: final candidate
logs `candidate-final.log`, `candidate-planner.log`, `candidate-focus-ui.log`,
and `candidate/*.json`, `candidate/*.png`, `candidate/manifest.json` (artifact
SHA256s). The earlier-base artifacts are separately retained under `final/`.
These temporary files are not published or committed; rerun the commands below
to produce durable review artifacts for the release candidate.

Local probe cleanup limitation: an early disposable Snap Firefox probe could
not be terminated after its BiDi connection closed (OS signal denied), leaving
task-owned PID 18635, debugging port 35185. Its disposable profile was removed;
no normal user browser profile was used. The final runner closes its owning
BiDi browser before releasing the connection and completed cleanup successfully.

## Remote CI and integration update

The original merged integration SHA `8f8443c211e96d48d0bb97d056f131a29e98beae` had a failed
[CI run 38641064040](https://github.com/m950m/space-boxes-timer/actions/runs/38641064040).
Django smoke and GJS/diff checks succeeded; the Real-Chrome job failed in Focus
persistence's schema-upgrade sequence with:

```text
InvalidStateError: Storage upgrade is blocked. Close other V2 tabs and reload.
```

The subsequent Focus UI CI step was skipped. All 48 local persistence checks
passed. No persistence/CI behavior was modified and no remote rerun was requested.
This failure is historical: during acceptance, PRs #53/#54 advanced `v2` to
`a05035741698611d9dc38964cb3375e859a8fab5`, with a successful
[CI run 38655156722](https://github.com/m950m/space-boxes-timer/actions/runs/38655156722).
An additional read-only audit of that unmodified revision passed 18 checks,
including the added Account panel's reflow/contrast and actual 100/200/400% zoom,
and four Chrome axe audits with zero violations. Its temporary artifacts are in
`/tmp/space-boxes-final-visual/current-a050357`.

The owner explicitly approved publication and shared-file handoff for this
independent workstream. Integration onto the new base and the three affected
candidate suites passed as recorded above. No full connected-product validation
is inferred from the presentation checks. The new PR still needs its own exact
head SHA checks; base CI does not prove the candidate's CI result.

## Repeatable release verification

From a clean, authorized candidate checkout, record the exact SHA and remote
branch before testing. Use installed Python and Chrome; Firefox is optional in
the runner and its absence is printed as a skip. For release evidence, record
that skip explicitly rather than claiming both engines ran.

```bash
git rev-parse HEAD
git status --short
python3 v2/frontend/tests/run-planner-tests.py
python3 v2/frontend/tests/run-focus-ui-tests.py
python3 v2/frontend/tests/run-focus-domain-tests.py
python3 v2/frontend/tests/run-focus-persistence-tests.py
python3 v2/frontend/tests/run-browser-tests.py

curl -fL https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js -o /tmp/space-boxes-axe-4.10.3.js
sha256sum /tmp/space-boxes-axe-4.10.3.js
python3 v2/frontend/tests/run-final-acceptance-tests.py \
  --axe-source /tmp/space-boxes-axe-4.10.3.js \
  --artifacts /tmp/space-boxes-release-visual
git diff --check
```

For Snap Firefox, add `--firefox-profile-parent "$HOME/snap/firefox/common"`;
its disposable profile must be accessible to the installed browser. The runner
does not download dependencies or alter normal browser profiles. `--browser chrome`
or `--browser firefox` permits targeted verification. Omitting `--axe-source`
skips axe explicitly and is not the full acceptance command. Preserve logs,
audits, screenshots, browser/OS versions and exact SHA alongside the release
review. Review axe incomplete findings, not just its exit status.

After approved artwork is integrated, repeat relevant automation and complete
the following human evidence on the exact candidate:

- Keyboard-only: create/edit Primary, Extra and child work; Start/Pause/End;
  completion while focusing a disappearing control; refresh success/failure;
  recovery, failed reconciliation and successful form removal. Check visible
  focus, sensible order, no trap and no unexpected focus theft. Reproduce the
  Firefox skip-link assertion using a normal browser window.
- Screen reader: exercise labels, required/invalid fields, saved/error/busy
  feedback, timer silence, action/outcome announcements, observer/recovery and
  reconciliation. Record actual browser/AT/OS versions and spoken results;
  suggested coverage includes NVDA/Firefox and VoiceOver/Safari, not an approved
  or already executed support matrix.
- Physical touch device: portrait/landscape, native date/time/select controls,
  reachable targets, long content, software keyboard and recovery forms.
  Browser viewport emulation does not satisfy this check.
- Human visual review: browser UI zoom at 200/400%, text enlargement/spacing,
  narrow layouts, light/dark platform controls as applicable, forced colors,
  reduced motion, keyboard outlines and every approved artwork state. Automated
  actual layout zoom above is evidence, not evidence of operating the zoom UI.

## Remaining decisions and readiness

The original head/three-box assets, Primary opening/release treatment and Extra/
subtask representation still need exact owner visual approval; see the prepared
[artwork integration brief](ARTWORK-INTEGRATION.md). No substitute was installed.
Human AT/touch acceptance and Firefox keyboard reproduction require evidence/work,
not invented approvals. Safari and human screen-reader
testing were unavailable in this environment. No full WCAG or public V2 release
claim is made; connected-product release validation belongs to its workstream.
In particular, the [tracked post-sync task-edit gap](https://github.com/m950m/space-boxes-timer/issues/11#issuecomment-6180699414)
prevents a claim that connected synchronization is fully complete; its repair
is outside this presentation patch.

Publication and handoff were explicitly approved by the owner in this session.
Merge, production release and deployment remain human
gates. A green PR plus this local report alone does not authorize release.
