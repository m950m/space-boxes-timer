# Character artwork preview — owner evaluation package

Status: **unapproved proposal for owner visual review; no production change**.
Branch `feature/v2-character-artwork` (from `origin/v2` at d85353b). This package
implements no policy: [OD-023/OD-027](_docs/product/owner-decisions.md) and
[ARTWORK-INTEGRATION.md](ARTWORK-INTEGRATION.md) remain authoritative. The
production page, its dormant artwork hooks and the existing tests are untouched.

## What this is

An original cartoon character system ("a warm gold head whose open crown holds a
physical kraft box") prototyped in five session states plus the active
Extra/subtask badge, and a self-contained preview page for inspecting the actual
states and how they fit the two prepared integration sites.

Inspired by, but deliberately distinct from, the owner's reference illustration:
front-facing rounded head (reads at small sizes better than a profile silhouette),
box nested inside a cut crown rim, and no galaxy stream — the space connection is
exactly one orbit ring and three sparkles in FOCUS only, so decoration never
competes with tasks.

## View the preview

```bash
cd v2/frontend && python3 -m http.server 8000
# open http://127.0.0.1:8000/artwork-preview.html
```

The page shows: the five states, the zero-to-three Primary compositions, a
keyboard-operable state switcher driving a replica of `#primary-artwork` /
`#extra-artwork` using the documented mounting recipe, palette notes, and the
open owner decisions.

## Asset inventory (original static SVG)

All files generated deterministically by [generate.py](assets/artwork/generate.py)
(committed; rerun with `python3 generate.py`). Intrinsic dimensions are declared
on each SVG root. No animation, scripts, external references or raster content.

| File | Size | States | SHA256 |
| --- | --- | --- | --- |
| `assets/artwork/sb-head-idle.svg` | 480×500 | IDLE | `aac1c6be…c7335b` |
| `assets/artwork/sb-head-planning-0.svg` | 480×500 | PLANNING, 0 planned | `2677f38a…c5be2dc` |
| `assets/artwork/sb-head-planning-1.svg` | 480×500 | PLANNING, 1 planned | `9f525dd6…59bd0b43` |
| `assets/artwork/sb-head-planning-2.svg` | 480×500 | PLANNING, 2 planned | `4de1e9cd…f68599` |
| `assets/artwork/sb-head-planning-3.svg` | 480×500 | PLANNING, 3 planned | `4a4b5e87…2748ff` |
| `assets/artwork/sb-head-focus.svg` | 480×500 | FOCUS | `afb1f9f0…2a7b` |
| `assets/artwork/sb-head-pause.svg` | 480×500 | PAUSE | `b0736812…cd1d83` |
| `assets/artwork/sb-head-complete.svg` | 480×500 | COMPLETE | `7dc9368f…93a7eab` |
| `assets/artwork/sb-extra-active.svg` | 360×236 | active Extra/subtask badge | `f414dc45…76061` |

Provenance: original creation for this repository, authored as vector geometry in
the committed generator script; no stock assets, no third-party or AI-generated
source imagery. License follows the repository license at integration time.

## Character states and their non-color cues

State never relies on color alone (OD-023); every state carries a shape cue:

| State | Composition | Shape cues |
| --- | --- | --- |
| IDLE | Box taped shut in the crown; calm face | closed box, neutral brows |
| PLANNING | Flaps open; three numbered slots; occupied slots show task-colored numbered cubes, free slots stay outlined | open flaps, cube numerals 1–3, dashed free slots |
| FOCUS | One cube released above the box with a single thin orbit ring and three sparkles; other planned work stays docked; focused half-lidded face | lifted cube, released-slot arrow, one raised brow |
| PAUSE | Front lid folds halfway over the docked work; resting face | half-closed lid, closed eyes, hand-drawn pause bars |
| COMPLETE | Box taped shut with a check; one star and two dots; cheerful face | check on tape, single star |

Slot numerals tie compositions to the existing ordered Primary cards (the same
displayed IDs/order per the session-to-image contract in ARTWORK-INTEGRATION.md);
the count of visible cubes follows the approved zero-to-three rule and no fourth
box ever appears. `sb-extra-active` is a targeted cube in a dashed reticle — a
clearly non-head representation for the Extra/subtask focus surface.

## Prepared mapping (not implemented)

Candidate mapping only, per the contract table in ARTWORK-INTEGRATION.md:
planning compositions map to `app.js` `renderTasks()`/`snapshot` Primary IDs;
the opening treatment maps only to the explicit successful Start transition in
`focus-view.js`; clock `data-state` phases (`running`, `paused`) would select
FOCUS/PAUSE only after exact approval. Deriving logic belongs to a future
integration task after owner approval; nothing here persists image state or
touches domain/persistence code.

## Requirements coverage in this preview

- Responsive: hosts keep the `task-artwork` boundary (max-inline-size 32rem,
  in-flow scaling); verified no horizontal overflow at 320/375/768/1280px with
  100%/200% root text.
- Reduced motion: static SVG only; no CSS transitions or animations anywhere in
  the preview; verified under `prefers-reduced-motion: reduce`.
- Keyboard: native radio/select/checkbox controls with visible focus from the
  planner stylesheet; verified via trusted key events (Tab traversal, arrow-key
  state switch).
- Non-color cues: shape cues per state (table above); decorative hosts remain
  `aria-hidden` with `alt=""` and `pointer-events: none`, so controls keep
  pointer and keyboard access; full-page computed text contrast meets AA.

## Tests executed (this branch, this working tree)

```bash
python3 v2/frontend/tests/run-artwork-preview-tests.py   # PASS 20 checks (new)
python3 v2/frontend/tests/run-artwork-integration-tests.py  # PASS 54 checks + 3 a11y/keyboard (production hooks still dormant)
python3 v2/frontend/tests/run-planner-tests.py           # PASS 65 checks
python3 v2/frontend/tests/run-focus-ui-tests.py          # PASS 92 checks
python3 v2/frontend/tests/run-visual-tests.py            # PASS 65 checks
python3 v2/frontend/tests/run-final-acceptance-tests.py --browser chrome  # PASS 54 checks
```

Unexecuted/unavailable: the axe audit (needs the locally supplied axe-core
bundle; runner never downloads it) and the Firefox acceptance runner (documented
as failing in this environment; requires a display). No production behavior was
changed, so no additional regression surface exists.

## Decisions needed from the owner

1. Approve or reject this character direction (metaphor, palette, expression style).
2. Approve per-state treatments or request changes (e.g., FOCUS ring density, PAUSE bars, COMPLETE restraint).
3. Confirm slot numerals 1–3 tied to card order as the task association.
4. Decide on the Extra/subtask badge concept (targeted cube) or request an alternative.
5. Decide whether COMPLETE artwork follows completed sessions only or any ended session.
6. After approval: choose integration scope (planner host only vs. both hosts) and authorize the follow-up integration task, including the test update ARTWORK-INTEGRATION.md reserves for that moment.
