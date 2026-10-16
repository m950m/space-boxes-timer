# Artwork v1 — approved character artwork record

Status: **Artwork v1 OWNER APPROVED 2026-10-17 and activated in the production
entry** (`index.html` → `js/artwork/registry.js` → `js/artwork/presentation.js`).
Branch `feature/v2-character-artwork`. [OD-023/OD-027](_docs/product/owner-decisions.md)
and the approval record in [ARTWORK-INTEGRATION.md](ARTWORK-INTEGRATION.md) are
authoritative.

## Owner-approved decisions (2026-10-17)

1. The original SVG character illustrations and visual direction as Artwork v1.
2. The real-application state mapping implemented in commit `07203ef`.
3. Primary slot numerals 1–3 follow the visible task-card order, with stable
   task-ID association.
4. The Extra/subtask active-focus badge, without introducing a fourth Primary box.
5. Artwork activation in BOTH the Planner and Focus presentation areas.
6. COMPLETE only after explicit task-completion decisions for all relevant
   Primary tasks; ending a focus session alone must not trigger COMPLETE.
7. Accessibility, reduced-motion and responsive requirements remain mandatory.

## Design gallery

```bash
cd v2/frontend && python3 -m http.server 8000
# Production application (artwork active): http://127.0.0.1:8000/index.html
# Design gallery:                          http://127.0.0.1:8000/artwork-preview.html
```

The production page mounts the idle composition on load and follows the real
plan/focus state; the gallery documents the approved states and compositions
side by side.

## Implemented production behavior

Derived inside the existing focus-view render from `snapshot`, `viewDay`,
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
| Session ended (completed or early) | planning-N — sessions never complete tasks | badge cleared |
| All shown-day Primary tasks explicitly decided complete | complete | — |
| Owned active Extra/subtask session | (day state as above) | active badge — never a fourth box |

Association rules: the released cube binds by saved task ID to the task's card
order slot; tasks missing from the current plan fall back to the day
composition; different Plan Days show their own composition; failed reads and
stale associations hide rather than guess. State is never persisted and never
relies on color alone (closed box, open slots, released cube, half-closed lid,
taped check, pause bars).

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

Full SHA256 values: `sha256sum v2/frontend/assets/artwork/*.svg`; regeneration:
`python3 v2/frontend/assets/artwork/generate.py`. Provenance: original creation
for this repository as committed vector geometry (generator committed alongside
the assets); no stock or third-party source imagery, no network dependencies.
License follows the repository license.

## Tests executed

```bash
python3 v2/frontend/tests/run-artwork-state-tests.py       # real-state mapping on the production page
python3 v2/frontend/tests/run-artwork-integration-tests.py # Artwork v1 activation + host boundary checks
python3 v2/frontend/tests/run-artwork-preview-tests.py     # design gallery
python3 v2/frontend/tests/run-planner-tests.py             # planner acceptance
python3 v2/frontend/tests/run-focus-ui-tests.py            # mounted Focus UI
python3 v2/frontend/tests/run-visual-tests.py              # presentation acceptance
python3 v2/frontend/tests/run-final-acceptance-tests.py --browser chrome  # final acceptance, Chrome
python3 v2/frontend/tests/run-focus-domain-tests.py        # domain + planning regressions
python3 v2/frontend/tests/run-focus-persistence-tests.py   # persistence + restart regressions
python3 v2/frontend/tests/run-connected-sync-tests.py      # connected sync regressions
```

Results for the activation commit are recorded in the delivery report. The
Firefox visible-focus criterion remains UNVERIFIED until actually validated in
a supported environment (the Firefox acceptance runner requires a display that
this environment lacks); it is not claimed as passing. The axe audit requires
the locally supplied axe-core bundle and was not run.

Human visual/AT/device verification evidence for the approved activation is a
separate acceptance step; this record does not claim it.
