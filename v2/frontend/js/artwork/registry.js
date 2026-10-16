// Approved production artwork registry — Artwork v1.
// Owner approval recorded 2026-10-17; provenance, SHA256 inventory and the
// recorded approval decisions live in ../ARTWORK-PREVIEW.md and the approval
// record in ../ARTWORK-INTEGRATION.md. Loaded by index.html before the app
// modules; js/artwork/presentation.js resolves assets from
// globalThis.SpaceBoxesArtwork. Local static SVG only — no network or
// third-party assets.
(function () {
  "use strict";
  const art = (file, width = 480, height = 500) => (
    { src: `./assets/artwork/${file}`, width, height });
  globalThis.SpaceBoxesArtwork = {
    registry: "character-artwork/v1-approved",
    approved: "2026-10-17",
    assets: {
      idle: art("sb-head-idle.svg"),
      planning: [art("sb-head-planning-0.svg"), art("sb-head-planning-1.svg"),
        art("sb-head-planning-2.svg"), art("sb-head-planning-3.svg")],
      focus: [
        [art("sb-head-focus-1-of-1.svg"), art("sb-head-focus-1-of-2.svg"), art("sb-head-focus-1-of-3.svg")],
        [null, art("sb-head-focus-2-of-2.svg"), art("sb-head-focus-2-of-3.svg")],
        [null, null, art("sb-head-focus-3-of-3.svg")],
      ],
      pause: [art("sb-head-pause-1.svg"), art("sb-head-pause-2.svg"), art("sb-head-pause-3.svg")],
      complete: art("sb-head-complete.svg"),
      extra: art("sb-extra-active.svg", 360, 236),
    },
  };
}());
