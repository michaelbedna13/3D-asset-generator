---
name: RASTR Studio
description: A neutral dark editor where the only colour is the artwork.
colors:
  surround: "#141414"
  panel: "#232323"
  control: "#303030"
  control-hover: "#3b3b3b"
  selected: "#505050"
  line: "#141414"
  text: "#e6e6e6"
  text-secondary: "#adadad"
  text-tertiary: "#8f8f8f"
  primary: "#e8e8e8"
  primary-text: "#161616"
  danger: "#c9353b"
  focus: "#ffffff"
typography:
  body:
    fontFamily: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "normal"
  group-title:
    fontFamily: "'Inter Variable', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
  wordmark:
    fontFamily: "'Inter Variable', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "16px"
  body-phone:
    fontFamily: "'Inter Variable', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "18px"
rounded:
  sm: "3px"
  md: "4px"
  lg: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "26px"
    padding: "0 10px"
  button-hover:
    backgroundColor: "{colors.control-hover}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.md}"
    height: "26px"
    padding: "0 10px"
  segmented:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    height: "26px"
    padding: "2px"
  segmented-selected:
    backgroundColor: "{colors.selected}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
  field:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "26px"
    padding: "0 8px"
  tab-selected:
    textColor: "#ffffff"
    height: "36px"
---

# Design System: RASTR Studio

## Overview

**Creative North Star: "The only colour is the artwork."**

RASTR Studio is a tool for judging and exporting pictures, so its interface is
the conventional dark professional editor, played straight: the family of
Lightroom, Blender and dark Figma. The owner chose this over two bolder
directions. Familiarity is the feature. Nothing in the chrome competes with the
canvas, and nothing in it tints how the artwork's colours are read.

The look is chosen before anything else: both looks sit in the top bar at all
times. The panel then shows only the groups that act on what is on the canvas.

**Key Characteristics:**

- Achromatic greys in four steps; state is shown by lightness, never by hue.
- One sans family at 12 px with tabular figures; hierarchy by weight.
- Sentence-case labels, title-case group names, no upper-case tracking.
- Three zones with one job each: sources left, canvas centre, settings right.
- One light primary button per tab, at most.

## Colors

The palette is neutral on purpose. A tinted grey would shift how the artwork's
colours are perceived, which is the one thing an image tool must not do.

### Primary

`primary` is near-white and marks the single main action of the current tab
(Estimate depth, Export PNG) and a checked checkbox. It is not a brand colour.

### Neutral

- `surround` is the area around the canvas, the darkest surface. It can be
  switched to mid grey or light to judge the artwork against other grounds.
- `panel` carries the top bar, the source rail and the settings panel.
- `control` is every resting control; `control-hover` its hover; `selected` the
  chosen option of a segmented control, a pressed tile or list row.
- `line` separates zones and groups. It is darker than the panel, not lighter.
- `text`, `text-secondary` (labels, unselected options) and `text-tertiary`
  (notes, stats, bar labels). All three clear 4.5:1 on `panel`.
- `danger` is reserved for error toasts and the remove state of an icon chip.

### Named Rules

**The Neutral Chrome Rule.** No hue in the interface. Colour appears only in
the canvas, in thumbnails, and in swatches that show the artwork's own colours.

**The Lightness Rule.** Selection, hover and focus are steps of lightness.
A coloured state would be the first accent, and there is none.

## Typography

One family, Inter, self-hosted as a variable font with a system fallback.
`tnum` is on everywhere so values line up; `cv11` gives the single-storey a.

### Hierarchy

- `wordmark` 14 px / 600: the product name, once.
- `group-title` 12 px / 600: panel group names and rail headings.
- `body` 12 px / 400: labels, values, options, notes. Tabs and the look switch
  use weight 500.
- On phones everything steps up to `body-phone`, and editable fields to 16 px
  so the page does not zoom on focus.

### Named Rules

**The Weight Rule.** Hierarchy comes from weight and from the three text
colours, not from size. The scale is deliberately flat, as in the editors this
sits beside.

## Layout

A fixed three-column shell: top bar 44 px; source rail 208 px; canvas; settings
panel 344 px. Under the canvas, one bar holds what acts on the view itself:
frame format, camera view, zoom, play, surround tone.

- Rows are 26 px high with a 92 px label column; groups have 12 px side padding
  and 4 px between rows.
- At 1180 px and below the rail narrows to 168 px, the panel to 320 px, and the
  canvas bar drops its labels.
- At 860 px and below the page becomes one column: top bar with the look switch,
  the canvas pinned to the top, then sources as a horizontal strip, then the
  panel. Rows grow to 40 px.

## Elevation & Depth

Flat. Zones are separated by hairlines, not shadows. Only things that float
above the canvas cast a shadow: the toast and the progress card. The slider
thumb carries a small soft shadow so it reads as a handle.

## Shapes

Corners are 4 px on controls, 3 px on the inner segment of a segmented control,
6 px on the progress card. Slider thumbs and swatch dots are circles. No pills.

## Components

### Buttons

Resting buttons are `control` grey with `text`. The primary is light with dark
text and weight 600. Icon buttons are transparent until hovered. An export
button shows its keyboard shortcut at its right edge.

### Segmented control

Used wherever there are two to five exclusive options that should all be
visible: looks, frame format, point count, blend, scale. It is a radio group:
arrow keys move the choice. The chosen option is lifted to `selected` with
white text.

### Inputs / Fields

Selects, number fields and hex fields share the `field` surface. Sliders are a
2 px track, filled to the value in light grey, with a 12 px round thumb.
Double-clicking a slider's name resets it to its default.

### Navigation

The look switch in the top bar is the first decision. The panel has three tabs,
Look, Motion and Export, marked by a 2 px light underline. Groups inside a tab
collapse; groups that do not apply to the current look are hidden, not disabled.

### Levels table

The four tone levels are one table: where each level starts, its shape, its
size. One row per level replaces three separate controls.

### Pairing swatches

Colour pairings are shown as the ground with a dot of ink on it, so a pairing
is recognised without reading its name.

## Do's and Don'ts

### Do:

- Do keep every surface achromatic and show state by lightness.
- Do put a control where it acts: view controls under the canvas, look controls
  in the Look tab, file actions in Export.
- Do hide a group that does not apply to the current look.
- Do use a segmented control when all options fit on one line; use a select
  otherwise.
- Do write labels in sentence case and name a button by what it does.

### Don't:

- Don't add an accent colour, a gradient, a glow or a tinted grey.
- Don't set labels in upper case or in a monospace face.
- Don't give a tab more than one primary button.
- Don't make a look, a source or an export reachable only after another action.
- Don't cover the canvas with interface, except for progress and a toast.
