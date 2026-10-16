# Original artwork integration brief

Status: **Artwork v1 owner-approved 2026-10-17 and activated in the production
entry** (see the approval record below and
[ARTWORK-PREVIEW.md](ARTWORK-PREVIEW.md)).
This implements no deferred policy. [OD-023 and OD-027](../../_docs/product/owner-decisions.md)
and [FR-VISUAL-001/002, AC-010/022](../../_docs/product/v2-prd.md) remain authoritative.

> **Approval record (2026-10-17).** The owner approved Artwork v1: the exact
> original SVG assets inventoried in [ARTWORK-PREVIEW.md](ARTWORK-PREVIEW.md),
> the real-application state mapping from commit `07203ef`, Primary slot
> numerals 1–3 bound to visible card order with stable task-ID association, the
> Extra/subtask active-focus badge (no fourth Primary box), activation in BOTH
> the Planner and Focus presentation areas, and completion semantics
> (COMPLETE only after explicit task-completion decisions for all relevant
> Primary tasks; ending a focus session alone never triggers COMPLETE).
> Accessibility, reduced-motion and responsive requirements remain mandatory.
> The pre-approval checkpoint text below is retained as history: its
> "no exact artwork approved / keep hosts empty" statements are superseded by
> this approval, while the placement, accessibility, mounting and verification
> requirements remain in force.

## One consolidated owner review

Review the exact original cartoon/cinematic person/head composition with up to
three central Primary boxes, its Primary opening/release treatment on explicit
Start, and the Extra/subtask active representation outside those boxes. Include
static/reduced-motion equivalents and narrow/zoomed compositions in the same
review package. Record approval of the actual asset versions/screens, not merely
approval of the general metaphor. Additional non-active-state artwork remains
undecided; do not invent it to complete an animation sheet.

No generated illustration, stock substitute, logo or placeholder is approved by
this brief. Asset creation can proceed only under the applicable artwork task
authority; integration must wait for exact visual approval. Record source,
creator/license or original-creation provenance, filenames/version hashes and
the owner's approval link with the eventual assets.

## Prepared integration boundary

`#primary-artwork` and `#extra-artwork` in `index.html` are empty, hidden and
`aria-hidden="true"`. Keep them that way until approved assets exist. These are
presentation hooks, not an implemented Primary opening/release experience.

### Placement and asset boundary (prepared 2026-10-16)

| Hook | Exact placement and responsibility |
| --- | --- |
| `#primary-artwork` | Inside `#task-list`, immediately before the Primary heading/cards. Holds the single approved head/Primary composition, with zero to three associated Primary task IDs. Existing cards remain the named, interactive task interface. |
| `#extra-artwork` | In `#focus-panel`, immediately after `#focus-task-title`, outside `#primary-tasks` and before the clock/controls. Reserved for the approved active Extra/subtask image; never a fourth head box. |
| `#task-artwork-image` | Inert HTML template after `main`. Clone its `img` only for an approved asset. Has no `src`, network request, visible placeholder or accessible image before mounting. |

The hosts stay in normal document flow with a maximum inline size of 32rem.
Their images scale down to available width while retaining intrinsic proportions;
they have no fixed height, absolute positioning or pointer interception. Hidden
hosts reserve no space. No script currently mounts an image or maps a session to
an asset. There is no approved asset inventory to wire in yet.

After approval, use local static SVG (rendered as `img`, not inline injected
markup) or raster files. Clone the template, set the approved `src`, intrinsic
`width`/`height` and `alt` **before** inserting it, then unhide the intended host.
Use `replaceChildren(image)` to avoid accumulated/duplicate state layers; clear
and hide the host when no approved treatment applies or an image fails to load.
Keep task titles in existing text nodes, never SVG/HTML interpolation. Do not add
external embeds, scripts, asset-driven actions or a second lifecycle controller.

Equivalent task/state text already exists, so the normal image is decorative:
retain host `aria-hidden="true"` and image `alt=""`. If an approved image conveys
essential information absent from that text, remove the host's `aria-hidden`
and supply a concise task/state alternative, e.g. `Primary task “Write summary”:
box open, focus running.` Review that exact alternative with the asset and ensure
equivalent text remains available when images fail or forced colors hide detail.
An informative `alt` inside an `aria-hidden` host is ineffective. Images are not
focusable and carry no live region; existing controls retain keyboard ownership.

The prepared boundary is static, including under reduced motion. Approved
opening/release may use a static open-box state after confirmed Start; do not
introduce animated SVG, GIF or video as the static asset. If motion is later
approved, record both moving and static versions, select the static source for
`prefers-reduced-motion: reduce` (including preference changes), and preserve the
same task/state meaning without requiring animation. No motion implementation is
authorized by approval of the general opening metaphor alone.

### Session-to-image contract for later approved integration

Derive presentation only in existing view rendering; do not persist image state.

| Existing projection/event | Allowed mapping after exact approval |
| --- | --- |
| `app.js` `renderTasks()` / `snapshot` and `viewDay.value` | Reuse the same displayed Primary task IDs/order as the cards. Recompute on plan/day changes; bind boxes by task ID, not a stale position. Owner-approved zero/one/two/three arrangements decide empty space, not invented extra boxes. |
| `focus-view.js` `render()` / `state.reservation.sessionId` | Resolve the associated saved session/task ID. Only the successful explicit Start transition into the authoritative running reservation can select the approved opening treatment. Selection, scheduled time and ticks do not open a box. |
| `updateClock()` `data-state` (`running`, `paused`, `elsewhere`, `ended`, `none`, `loading`) | Reuse these factual distinctions; a clock phase alone is not a new Start. Reload/observer renders must not replay an opening or imply local control. Map a phase only if its exact asset/state treatment has approval. |
| Extra/child task association | Use the saved task ID and current plan relationship where available; preserve `startingSnapshot` text as historical context. Render the approved active image in `#extra-artwork` only. Do not guess classification/parent if the task is unavailable or silently recast historical data. |
| Different Plan Day, task removed/reclassified, failed read, recovery or unresolved time | Hide any stale or unapproved image; retain factual task/status/recovery text. No matching visible Primary card means no guessed box association. |

This contract is prepared architecture, not a claim that the mappings are
implemented. Their asset-dependent integration and affected regressions follow
owner approval. No domain, saved records, quotas or authority interfaces change.

## Exact owner decisions still open

General OD-023 direction is approved; **none of the exact artwork is approved**.
One owner review package must resolve:

1. The original character/head style and actual composition for zero, one, two
   and three Primary tasks, including unused slots and long-title association.
2. Exact closed/open Primary states and the explicit Start opening/release
   treatment; whether any motion is approved and its static equivalent.
3. The active Extra and subtask treatment outside the head boxes, including how
   parent context is retained. Text alone currently supplies this information.
4. Actual narrow, enlarged-text and zoomed layouts, reduced-motion/static
   versions, and any essential-image alternatives.
5. Any additional paused, observer, recovery, uncertain, completed or early-ended
   artwork. These are not required animation-sheet inventions; unapproved
   treatments stay absent while existing factual text continues to work.

For every approved version record: asset filename, SHA256, intrinsic dimensions,
creator/source and original-creation or license provenance, supported states and
task association, responsive/static variants, owner decision link/date and the
candidate screenshots reviewed. No filenames, images or approvals are invented
in this checkpoint. Human AT/device/Firefox verification are evidence gates,
separate from these artwork decisions.

| Existing surface | Integration constraint |
| --- | --- |
| Primary task cards (`article[data-task-id]`) | Preserve stable task identity, headings, classification, edit/outcome controls and the existing zero-to-three Primary rule. Never add a fourth central box. Empty-slot appearance requires approved visual design. |
| Existing Focus view/controller projection | Derive artwork state from the existing authoritative session projection and task association. Do not infer Start from a selected card, scheduled time, countdown tick or decorative click. |
| Extra/child active Focus surface | Keep its named task/classification and parent context. Approved artwork must distinguish it outside the Primary boxes without pretending it occupies a fourth slot. |
| Text status, progress, alerts and controls | Preserve accessible names, live status, timer silence, keyboard operation and recovery controls independently of the illustration. Decorative layers must not cover controls or intercept input. |
| Paused, observer, recovery, uncertain and ended states | Retain existing factual text. Map artwork only where that exact state treatment is approved; do not imply running/control ownership, recovered time, completion or restart without the existing projection saying so. |

Keep decorative artwork hidden from the accessibility tree while equivalent
text identifies the task and state. If approved art introduces an essential
interaction or information absent from that text, review its semantic markup
and keyboard behavior before integration. Avoid per-second live announcements.

Implement the visual layer in frontend markup/styles/view modules. Do not add
asset-derived fields to saved tasks/sessions, change quotas or identities, add
timers/authority, alter history attribution, or touch synchronization/persistence.
Retain task titles as text rather than injecting them into asset markup.

## Integration verification after approval

- Capture zero/one/three Primary compositions, long titles, explicit Primary
  Start/opening, Extra and child active treatment, and each additionally approved
  session state. Match images to recorded owner-approved versions.
- Repeat 320/375/768/1280px, 200% text and actual 200/400% layout zoom; artwork
  must not clip controls or require horizontal scrolling for essential actions.
- Check static/reduced-motion equivalence, forced colors, text/non-text contrast,
  unobscured keyboard focus, accessible names and no extra live-region noise.
- Run the Planner/visual and final acceptance commands in
  [release verification](FINAL-VISUAL-ACCEPTANCE.md#repeatable-verification-and-local-artifacts),
  updating the existing test that currently asserts unapproved artwork is absent
  only when the approval and implementation justify that change.
- Obtain human visual/AT/touch evidence. Record candidate SHA, approval link,
  asset provenance and results in the acceptance report; human merge/release
  authority remains separate.

The dormant template/placements can be verified independently now with
`python3 v2/frontend/tests/run-artwork-integration-tests.py`. It mounts only a
plain geometric SVG fixture in disposable Chrome, tests informative/decorative
semantics and both hosts at 320/375/768/1280px with 100/200% text, then removes it.
Its fixtures are not proposed product artwork or evidence of artwork acceptance.
