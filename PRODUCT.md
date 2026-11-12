# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One designer, the owner, making graphics and loops for their own creative work.
They work mainly at a desktop computer with a mouse; a phone is secondary and
is used to check or tweak, not for long sessions. They know design vocabulary
(halftone, exposure, aspect ratio) but should not need to know how the renderer
works to get a result.

## Product Purpose

RASTR Studio turns a picture or a 3D model into a stylised graphic and exports
it as a still or a seamless loop. Success is: drop a picture in, pick a look,
tune a handful of controls, export a file that is ready to post.

The two jobs done most, in order:

1. Photo → point cloud: the picture becomes a cloud of glowing points with real
   depth that can scatter and gather.
2. Photo or logo → shape raster: the picture becomes a grid of dots, crosses,
   squares or the owner's own icons.

Secondary: 3D model → shape raster (the original use, kept working).

## Positioning

Everything runs in the browser on the owner's device: no upload, no account,
no server. Depth for the point cloud comes from a depth model that also runs
locally. Exports are deterministic loops rendered frame by frame, so a GIF or
MP4 never depends on preview speed.

## Operating Context

- Sources: a picture (PNG, JPG, WebP, SVG), a 3D model (.glb, .gltf, .obj,
  .stl), or one of nine built-in objects.
- Looks: shape raster, point cloud.
- Output: PNG, SVG (raster look only), GIF, MP4 in 1:1, 4:5, 9:16, 16:9.
- A session is short and iterative: load, look, nudge, export, repeat with the
  next picture.
- Hosted as a static site on GitHub Pages; also published as a single-file page
  inside a claude.ai artifact, where depth estimation is unavailable.

## Capabilities and Constraints

- Shape raster: cell size, margin, four tone levels with their own threshold,
  shape and size, custom uploaded icons, dither, edge fade, contact occlusion
  (models only), accent colour on one level, tone wave and shimmer.
- Point cloud: point count and size, depth range and direction, tone cutoff,
  static scatter, image or single colour, glow or solid, scatter-and-gather
  animation, drift, vignette, grain; depth guessed from brightness, estimated
  by the local model, or loaded as a depth map.
- Scene: five camera views, orbit, zoom, turntable / sway / tumble / float.
- Workflow: undo and redo, JSON presets, settings remembered between visits,
  keyboard shortcuts.
- The point cloud applies to pictures only, not to 3D models.
- The preview is the product: controls must never cover or shrink it without
  the owner asking.
- Labels are English, upper-case by current convention; the owner reads Czech
  and English.

## Brand Commitments

- Name: RASTR Studio ("rastr" is Czech for raster / halftone).
- Standing preference, chosen by the owner over two bolder directions: the
  conventional dark, neutral professional-editor look, in the family of
  Lightroom, Blender and dark Figma. Colour belongs to the artwork on the
  canvas, not to the interface. Future work keeps to this unless the owner
  asks otherwise.
- The owner called the first interface (black, one neon accent, upper-case
  monospace labels) cluttered and "AI slop"; that look is retired.

## Evidence on Hand

- Working implementation in `src/` with all features above.
- No user research beyond the owner's own feedback: the interface was hard to
  navigate, and the point-cloud look could not be found because it appeared
  only after a picture was loaded.
- No sample photographs ship with the tool; built-in sources are procedural 3D
  objects.

## Product Principles

1. The look is the first decision. What the tool can make must be visible
   before anything is loaded.
2. Show only the controls that act on what is on screen right now.
3. The picture leads; the interface is an instrument panel beside it.
4. A good default first, depth on demand: the few controls that matter most are
   in reach, the rest one step away.
5. Nothing leaves the device.
