# Original artwork integration brief

Status: **prepared for owner visual review; no exact artwork approved or installed**.
This implements no deferred policy. [OD-023 and OD-027](../../_docs/product/owner-decisions.md)
and [FR-VISUAL-001/002, AC-010/022](../../_docs/product/v2-prd.md) remain authoritative.

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

The existing `#primary-artwork` element in `index.html` is empty, hidden and
`aria-hidden="true"`. Keep it that way until approved assets exist. It is a
presentation hook, not an implemented Primary opening/release experience.

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
  [release verification](FINAL-VISUAL-ACCEPTANCE.md#repeatable-release-verification),
  updating the existing test that currently asserts unapproved artwork is absent
  only when the approval and implementation justify that change.
- Obtain human visual/AT/touch evidence. Record candidate SHA, approval link,
  asset provenance and results in the acceptance report; human merge/release
  authority remains separate.
