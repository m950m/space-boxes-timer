# Character artwork — evaluation package and integrated preview

Status: **direction approved, exact artwork unapproved — evaluation build, no
production activation**. Branch `feature/v2-character-artwork` (from `origin/v2`
at d85353b). [OD-023/OD-027](_docs/product/owner-decisions.md) and
[ARTWORK-INTEGRATION.md](ARTWORK-INTEGRATION.md) remain authoritative: the
production page, its dormant artwork hooks and the existing tests are unchanged,
and the artwork stays absent there until exact visual approval.

## What exists on this branch

1. **The character system** (proposal commit 0175b9e, extended here): one warm
   gold head whose cut crown rim holds a physical kraft box; original static
   SVG, generated deterministically by
   [generate.py](assets/artwork/generate.py). Shared geometry across every
   state, so asset swaps never shift layout.
2. **Functional state mapping** (`js/artwork/presentation.js`): derives both
   prepared hosts from the existing plan and focus projections inside the
   existing focus-view render — no new controller, timers, persistence or
   input handling. Dormant in production: assets resolve from
   `globalThis.SpaceBoxesArtwork`, which only evaluation entries register.
3. **Evaluation entries**: [artwork-preview.html](artwork-preview.html) (static
   design gallery) and [artwork-integrated.html](artwork-integrated.html) (the
   real application with the registry active). Production entry remains
   `index.html`.
4. **Tests**: `tests/run-artwork-preview-tests.py` (gallery) and
   `tests/run-artwork-state-tests.py` (real-state mapping on the production
   page with the registry injected).

## View the integrated experience

```bash
cd v2/frontend && python3 -m http.server 8000
# Design gallery:    http://127.0.0.1:8000/artwork-preview.html
# Live application:  http://127.0.0.1:8000/artwork-integrated.html
# Production page:   http://127.0.0.1:8000/index.html  (artwork dormant)
```

In the integrated entry, plan Primary/Extra tasks with real forms and start,
pause, end and complete sessions; the artwork follows the real state. Real-state
screenshots captured from this build are available in the delivery report and
reproducible with `tests/run-artwork-state-tests.py`.

## State mapping (implemented, evaluation-gated)

Derived in `focus-view.js render()` from `snapshot`, `viewDay`,
`state.reservation` and `startingSnapshot`; recomputed on every existing render
path (Start, pause/resume/end, planner edits via `setPlan`, reload/observer
polling, day switch). A change-key guard prevents redundant DOM writes.

| Condition | `#primary-artwork` | `#extra-artwork` |
| --- | --- | --- |
| No Primary tasks for the shown day | idle (closed box) | — |
| 1–3 Primary planned, none active | planning-N (N numbered cubes) | — |
| Owned running reservation on shown-day Primary task k | focus-k-of-n (that task's cube released) | — |
| Owned paused reservation on Primary task | pause-n (work tucked, resting) | — |
| Reservation controlled elsewhere | planning-N (implies no local control) | — |
| Session ended (completed or early) | planning-N — **sessions never complete tasks** | badge cleared |
| All shown-day Primary tasks carry the explicit completion decision | complete | — |
| Owned active Extra/subtask session | (day state as above) | active badge — never a fourth box |

Association rules: the released cube binds by saved task ID to the task's card
order slot; tasks missing from the current plan fall back to the day
composition; different Plan Days show their own composition; failed reads and
stale associations hide rather than guess. State is never persisted and never
relies on color alone (shape cues per state are listed in the gallery).

## Asset inventory (original static SVG, all 480×500 except the 360×236 badge)

| File | SHA256 (first 16) |
| --- | --- |
| `sb-head-idle.svg` | `aac1c6be11f36470` |
| `sb-head-planning-0.svg` | `2677f38a720042a0` |
| `sb-head-planning-1.svg` | `9f525dd6336f551d` |
| `sb-head-planning-2.svg` | `4de1e9cd490f406b` |
| `sb-head-planning-3.svg` | `4a4b5e87de2c442b` |
| `sb-head-focus-1-of-1.svg` | `5e03c96e9c6044b1` |
| `sb-head-focus-1-of-2.svg` | `a3ff1de5ca8617fc` |
| `sb-head-focus-1-of-3.svg` | `1f22a06b12c6e9d2` |
| `sb-head-focus-2-of-2.svg` | `5d3dd363829e15c0` |
| `sb-head-focus-2-of-3.svg` | `e4d27f67cfb34a34` |
| `sb-head-focus-3-of-3.svg` | `1fadaf3ed0eb04a2` |
| `sb-head-pause-1.svg` | `d308af3d3037dd65` |
| `sb-head-pause-2.svg` | `982b8793227c5117` |
| `sb-head-pause-3.svg` | `b07368124b011117` |
| `sb-head-complete.svg` | `7dc9368f967bc68d` |
| `sb-extra-active.svg` | `f414dc454b2758b6` |

Full SHA256 values are reproducible via `sha256sum assets/artwork/*.svg` and
regeneration via `python3 assets/artwork/generate.py`. Provenance: original
creation for this repository as committed vector geometry; no stock or
third-party source imagery; license follows the repository license at
integration time.

## Tests executed (this branch, this working tree)

```bash
python3 v2/frontend/tests/run-artwork-state-tests.py       # PASS 21 (new: real-state mapping)
python3 v2/frontend/tests/run-artwork-integration-tests.py # PASS 54 + 3 a11y/keyboard (production still dormant)
python3 v2/frontend/tests/run-artwork-preview-tests.py     # PASS 20
python3 v2/frontend/tests/run-planner-tests.py             # PASS 65
python3 v2/frontend/tests/run-focus-ui-tests.py            # PASS 92
python3 v2/frontend/tests/run-visual-tests.py              # PASS 65
python3 v2/frontend/tests/run-final-acceptance-tests.py --browser chrome  # PASS 54
python3 v2/frontend/tests/run-focus-domain-tests.py        # PASS 127
python3 v2/frontend/tests/run-focus-persistence-tests.py   # PASS 48
python3 v2/frontend/tests/run-connected-sync-tests.py      # PASS 16
```

Coverage in the new suite: idle/planning-2 on real saves; Extra badge without a
fourth box; badge retained while paused; early end clearing the badge without
completion; running Primary focus releasing the active task's own cube (2-of-2);
pause tuck; a fully observed session returning the day to planning; one
completed task keeping planning; all-completed showing the reaction; day switch
to idle; accessibility-tree exclusion, reduced motion, forced colors, 320–1280px
at 200% text, keyboard traversal, and an element-structure drift guard between
the evaluation copy and `index.html`.

Unexecuted/unavailable: the axe audit (needs the locally supplied axe-core
bundle) and the Firefox acceptance runner (documented environment failure;
requires a display). `app.js` is untouched; `focus-view.js` gains only the
import, a stored plan day, and the single derivation call.

## Decisions needed from the owner (consolidated)

1. Approve the exact character illustrations for integration (the files above,
   as rendered in the integrated entry and screenshots).
2. Approve the implemented state mapping, specifically: COMPLETE appears only
   when every shown-day Primary task carries the explicit completion decision;
   sessions (even fully observed ones) return the day to planning.
3. Confirm slot numerals 1–3 bound to card order as the task association.
4. Approve the Extra/subtask badge as the active-focus representation.
5. Choose the activation scope after approval: production `index.html` +
   registry registration (planner host only, or both hosts), and authorize the
   corresponding integration task, the asset-provenance record and the
   reserved test update in ARTWORK-INTEGRATION.md.
