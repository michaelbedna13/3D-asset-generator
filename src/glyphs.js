// Interface icons: one authored set, 16 px grid, 1.5 px stroke, currentColor.
const svg = (body, filled = false) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" ` +
  (filled
    ? 'fill="currentColor"'
    : 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"') +
  `>${body}</svg>`;

export const GLYPHS = {
  undo: svg('<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a4 4 0 0 1 0 8H7"/>'),
  redo: svg('<path d="m10.5 3.5 3 3-3 3"/><path d="M13.5 6.5h-7a4 4 0 0 0 0 8H9"/>'),
  play: svg('<path d="M4.5 2.8v10.4L13 8z"/>', true),
  pause: svg('<path d="M4 3h3v10H4zM9 3h3v10H9z"/>', true),
  open: svg('<path d="M8 10.5v-8"/><path d="m4.8 5.4 3.2-3 3.2 3"/><path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  close: svg('<path d="m4 4 8 8M12 4l-8 8"/>'),
  // the two looks
  points: svg(
    '<circle cx="3" cy="11.5" r="1"/><circle cx="6.2" cy="6.8" r="1.3"/><circle cx="9.4" cy="10.6" r="1"/>' +
      '<circle cx="11.6" cy="4.2" r="1.3"/><circle cx="13.4" cy="12.4" r=".8"/><circle cx="6.6" cy="13" r=".7"/><circle cx="2.8" cy="4.4" r=".7"/>',
    true,
  ),
  raster: svg(
    '<rect x="2" y="2" width="3.2" height="3.2" rx=".6"/><circle cx="8" cy="3.6" r="1.1"/><rect x="10.8" y="2" width="3.2" height="3.2" rx=".6"/>' +
      '<circle cx="3.6" cy="8" r="1.1"/><rect x="6.4" y="6.4" width="3.2" height="3.2" rx=".6"/><circle cx="12.4" cy="8" r=".7"/>' +
      '<rect x="2" y="10.8" width="3.2" height="3.2" rx=".6"/><circle cx="8" cy="12.4" r=".7"/><circle cx="12.4" cy="12.4" r="1.1"/>',
    true,
  ),
};
