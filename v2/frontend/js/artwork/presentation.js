// Presentation-only artwork mapping for the prepared integration hosts
// (#primary-artwork, #extra-artwork). Derivation happens inside the existing
// focus-view render per ARTWORK-INTEGRATION.md; this module adds no timers,
// no persistence, no lifecycle control and never intercepts input.
//
// Assets resolve from globalThis.SpaceBoxesArtwork, registered by the
// production registry (js/artwork/registry.js, Artwork v1, owner-approved
// 2026-10-17) loaded before the app modules. With no registry — e.g. a host
// page that omits it — both hosts remain empty, hidden and aria-hidden.

const PRIMARY_HOST = "primary-artwork";
const EXTRA_HOST = "extra-artwork";
const TEMPLATE_ID = "task-artwork-image";

const registry = () => globalThis.SpaceBoxesArtwork?.assets ?? null;

function setImage(hostId, asset) {
  const host = document.getElementById(hostId);
  const template = document.getElementById(TEMPLATE_ID);
  if (!host || !template) return;
  if (!asset) return clearHost(hostId);
  // Mounting recipe from ARTWORK-INTEGRATION.md: src, intrinsic size and the
  // decorative empty alt are set before insertion; replaceChildren keeps a
  // single image layer.
  const image = template.content.firstElementChild.cloneNode(true);
  image.src = asset.src;
  image.width = asset.width;
  image.height = asset.height;
  image.alt = "";
  host.replaceChildren(image);
  host.hidden = false;
}

function clearHost(hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.replaceChildren();
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
}

// render() can run once per second while observing; skip DOM writes when the
// derived state is unchanged.
let applied = "";

/**
 * Derive both artwork hosts from the existing plan and focus projections.
 *
 * Primary host precedence: an owned running reservation on a shown-day Primary
 * task selects the focus variant for that task's slot (released cube bound to
 * the task, never a stale position); an owned paused reservation selects the
 * pause composition. Otherwise the day decides: no Primary tasks shows idle,
 * a day whose Primary tasks all carry an explicit completion decision shows
 * complete, and any other day shows the planning composition with one numbered
 * cube per planned task. Session endings are never completions: an ended or
 * ended-early session simply returns the day to its planning composition.
 * Reservations controlled elsewhere imply no local opening and keep the
 * planning composition. Extra/subtask focus is represented only by the badge
 * in #extra-artwork — never a fourth Primary box.
 */
export function renderPlanArtwork({ plan, day, focus }) {
  const assets = registry();
  if (!assets) return;
  const primaryTasks = (plan?.tasks ?? []).filter((task) => task.planDayId === day
    && task.classification === "primary");
  const reservation = focus?.state?.reservation ?? null;
  const session = reservation
    ? focus.state.sessions.find((item) => item.id === reservation.sessionId) ?? null
    : null;
  const snapshot = session?.startingSnapshot ?? null;
  const owned = Boolean(reservation && focus.contextId === reservation.controllerId);
  // The started task's id is a top-level session field; startingSnapshot keeps
  // the historical classification/parent context.
  const taskId = session?.taskId ?? null;
  const slot = taskId ? primaryTasks.findIndex((task) => task.id === taskId) : -1;

  let primary = null;
  if (owned && slot >= 0 && reservation.state === "running") {
    primary = assets.focus?.[slot]?.[primaryTasks.length - 1] ?? null;
  } else if (owned && slot >= 0 && reservation.state === "paused") {
    primary = assets.pause?.[primaryTasks.length - 1] ?? null;
  }
  primary ??= primaryTasks.length === 0
    ? assets.idle ?? null
    : primaryTasks.every((task) => task.completedAt)
      ? assets.complete ?? null
      : assets.planning?.[primaryTasks.length] ?? null;

  const extra = owned && snapshot && slot < 0
    && (snapshot.classification === "extra" || snapshot.parentTaskId != null)
    ? assets.extra ?? null
    : null;

  const key = `${primary?.src ?? "-"}|${extra?.src ?? "-"}`;
  if (key === applied) return;
  applied = key;
  setImage(PRIMARY_HOST, primary);
  setImage(EXTRA_HOST, extra);
}
