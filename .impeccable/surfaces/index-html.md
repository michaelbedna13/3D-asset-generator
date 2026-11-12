---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface brief: the editor (index.html)

Scope: the whole application shell – source rail, look switch, canvas and its
bar, the control panel. Visitor mode: Operate.

Audience and job: the owner at a desktop, turning a picture into a point cloud
or a shape raster and exporting it. Phone is secondary.

Constraints: every existing capability stays reachable; the preview is never
covered; nothing in the look may be reachable only after another action.

Unresolved: none.

## Direction contract

THESIS: A neutral dark editor where the only colour is the artwork. It refuses
the black-plus-neon, upper-case-monospace tool skin it replaces, and it refuses
one long scroll of accordions: the look is chosen first, and the panel shows
only what acts on the current look.

OWN-WORLD: Achromatic greys in four steps (surround, panel, control, hover),
light grey text, selection shown by lightness, one light primary button, a
muted red reserved for errors. One sans family at 12 px with tabular figures,
sentence-case labels, title-case group headers. Thin light slider tracks with a
round light thumb. Square-ish 4 px corners, dark hairline separators, no glow.

STORY: The owner sees both looks named in the top bar, a picture already
rendered as a point cloud, sources on the left, three tabs on the right. They
pick a look, nudge a few sliders, export.

FIRST VIEWPORT: 44 px top bar: wordmark left, the look switch beside it, undo /
redo and render stats right. Left rail 208 px: Open file, picture tiles, 3D
object list. Centre: the canvas on a neutral surround, with a bar under it for
frame format, camera view, zoom, play and surround tone. Right panel 340 px:
tabs Look / Motion / Export; the primary action of each tab is its light button.

FORM: The category standard played straight (the standing exit, chosen by the
owner; ranked outside the seven grounded candidates). Seed key d0646a08.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
