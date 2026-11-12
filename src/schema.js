// What the control panel contains: three tabs, and in each only the groups that
// act on what is on the canvas right now (see panel.js for the control builders).
import { PAIRINGS, SHAPE_DEFAULTS, isPicture, isPointCloud } from './state.js';
import { SHAPE_OPTIONS } from './shapes.js';
import { el } from './panel.js';
import { GLYPHS } from './glyphs.js';

const cloud = isPointCloud;
const raster = (s) => !isPointCloud(s);
const picture = isPicture;
const model = (s) => !isPicture(s);

const shapeOptions = (s) => [...SHAPE_OPTIONS, ...s.icons.map((icon) => [`icon:${icon.id}`, `Icon: ${icon.name}`])];

// Colour pairings as swatches: the ground with a dot of ink on it.
function pairingSwatches(store) {
  const buttons = PAIRINGS.map((p, i) => {
    const name = p.name.toLowerCase().replace(' / ', ' on ');
    return el(
      'button',
      {
        type: 'button',
        class: 'swatch',
        title: name,
        'aria-label': `Pairing: ${name}`,
        style: `--ground:${p.bg};--ink:${p.ink}`,
        onclick: () => store.set({ pairing: i, ink: p.ink, bg: p.bg }),
      },
      [el('i')],
    );
  });
  const node = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour pairings' }, buttons);
  const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(store.state.pairing === i)));
  return { node, sync };
}

// The four tone levels as one table: where each starts, its shape, its size.
function levelsTable(store) {
  const syncs = [];
  const rows = [1, 2, 3, 4].map((n) => {
    const startKey = `l${n}`;
    const sizeKey = `size${n}`;
    const shapeKey = `shape${n}`;

    const range = el('input', { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': `Level ${n} starts at` });
    const start = el('output', { class: 'level-start' });
    range.addEventListener('input', () => store.set({ [startKey]: Number(range.value) }));

    const select = el('select', { 'aria-label': `Level ${n} shape` });
    select.addEventListener('change', () => store.set({ [shapeKey]: select.value }));

    const size = el('input', { type: 'number', class: 'num', min: 0.1, max: 1.2, step: 0.05, 'aria-label': `Level ${n} size` });
    size.addEventListener('change', () => {
      const v = Number(size.value);
      if (Number.isFinite(v)) store.set({ [sizeKey]: Math.min(1.2, Math.max(0.1, v)) });
    });

    syncs.push(() => {
      const s = store.state;
      range.value = s[startKey];
      range.style.setProperty('--fill', `${s[startKey] * 100}%`);
      start.textContent = s[startKey].toFixed(2);
      const options = shapeOptions(s);
      const signature = options.map((o) => o.join('=')).join('|');
      if (select._signature !== signature) {
        select._signature = signature;
        select.replaceChildren(...options.map(([value, label]) => el('option', { value, text: label })));
      }
      select.value = s[shapeKey];
      if (document.activeElement !== size) size.value = s[sizeKey].toFixed(2);
    });

    return el('div', { class: 'level', role: 'row' }, [
      el('span', { class: 'level-n', role: 'rowheader', text: String(n) }),
      el('span', { class: 'level-range', role: 'cell' }, [range, start]),
      el('span', { class: 'select', role: 'cell' }, [select]),
      el('span', { role: 'cell' }, [size]),
    ]);
  });

  const head = el('div', { class: 'level level-head', role: 'row' }, [
    el('span', { role: 'columnheader', text: '' }),
    el('span', { role: 'columnheader', text: 'Starts at' }),
    el('span', { role: 'columnheader', text: 'Shape' }),
    el('span', { class: 'level-size', role: 'columnheader', text: 'Size' }),
  ]);
  const node = el('div', { class: 'levels', role: 'table', 'aria-label': 'Tone levels' }, [head, ...rows]);
  return { node, sync: () => syncs.forEach((fn) => fn()) };
}

// Uploaded cell icons: a thumbnail per icon (click to remove) and an add button.
function iconLibrary(store, actions) {
  const list = el('div', { class: 'icon-list' });
  const node = el('div', { class: 'row' }, [el('span', { class: 'label', text: 'Your icons' }), el('div', { class: 'ctl' }, [list])]);
  let signature = null;
  const sync = () => {
    const { icons } = store.state;
    const next = icons.map((icon) => icon.id).join(',');
    if (next === signature) return;
    signature = next;
    list.replaceChildren(
      ...icons.map((icon) =>
        el(
          'button',
          {
            type: 'button',
            class: 'icon-chip',
            title: `Remove ${icon.name}`,
            'aria-label': `Remove icon ${icon.name}`,
            onclick: () => actions.removeIcon(icon.id),
          },
          [el('img', { src: icon.data, alt: '' }), el('span', { class: 'icon-x', html: GLYPHS.close })],
        ),
      ),
      el('button', { type: 'button', class: 'btn icon-add', onclick: actions.addIcon }, [
        el('span', { class: 'glyph', html: GLYPHS.plus }),
        el('span', { text: 'Add' }),
      ]),
    );
  };
  return { node, sync };
}

function shortcutList() {
  const rows = [
    ['E', 'Export PNG'],
    ['S', 'Export SVG'],
    ['G', 'Export GIF'],
    ['M', 'Export MP4'],
    ['Space', 'Play or pause'],
    ['1 – 5', 'Camera views'],
    ['R', 'Reset the look'],
    ['Ctrl / ⌘ Z', 'Undo'],
    ['Shift Ctrl / ⌘ Z', 'Redo'],
  ];
  const node = el(
    'dl',
    { class: 'keys' },
    rows.flatMap(([key, what]) => [el('dt', {}, [el('kbd', { text: key })]), el('dd', { text: what })]),
  );
  return { node, sync() {} };
}

const exposure = (visible) => ({ type: 'slider', key: 'exposure', label: 'Exposure', min: 0.2, max: 3, step: 0.01, visible });

export function createSchema(store, actions) {
  const depthButtons = [
    ...(actions.estimateDepth
      ? [
          {
            label: 'Estimate depth',
            primary: true,
            onClick: actions.estimateDepth,
            title: 'Work out real depth with a depth model that runs in this browser',
          },
        ]
      : []),
    { label: 'Load map…', onClick: actions.loadDepthMap, title: 'Use a greyscale depth image of the same picture (white is near)' },
    { label: 'Save map', onClick: actions.saveDepthMap, title: 'Download the depth map in use as a PNG' },
    { label: 'Reset', onClick: actions.clearDepthMap, title: 'Go back to depth guessed from brightness' },
  ];

  return [
    {
      id: 'look',
      label: 'Look',
      groups: [
        {
          title: 'Colour',
          items: [
            { type: 'custom', build: pairingSwatches },
            { type: 'color', key: 'ink', label: 'Ink', onSet: () => ({ pairing: -1 }) },
            { type: 'color', key: 'bg', label: 'Ground', onSet: () => ({ pairing: -1 }) },
            {
              type: 'segment',
              key: 'ptColor',
              label: 'Point colour',
              visible: cloud,
              options: [
                ['image', 'Picture'],
                ['ink', 'Ink'],
              ],
            },
            {
              type: 'segment',
              key: 'ptBlend',
              label: 'Blend',
              visible: cloud,
              options: [
                ['auto', 'Auto'],
                ['glow', 'Glow'],
                ['solid', 'Solid'],
              ],
            },
            {
              type: 'select',
              key: 'accentLevel',
              label: 'Accent on',
              visible: raster,
              options: [
                [0, 'None'],
                [1, 'Level 1'],
                [2, 'Level 2'],
                [3, 'Level 3'],
                [4, 'Level 4'],
              ],
            },
            { type: 'color', key: 'accent', label: 'Accent', visible: (s) => raster(s) && s.accentLevel > 0 },
          ],
        },
        {
          title: 'Points',
          visible: cloud,
          items: [
            {
              type: 'segment',
              key: 'ptCount',
              label: 'Count',
              options: [
                [65000, '65k'],
                [130000, '130k'],
                [260000, '260k'],
                [520000, '520k'],
              ],
            },
            { type: 'slider', key: 'ptSize', label: 'Size', min: 0.1, max: 2.5, step: 0.01 },
            { type: 'slider', key: 'ptCut', label: 'Cutoff', min: 0, max: 0.9, step: 0.01 },
            { type: 'slider', key: 'ptScatter', label: 'Scatter', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'Depth',
          visible: cloud,
          items: [
            { type: 'slider', key: 'ptDepth', label: 'Amount', min: 0, max: 2, step: 0.01 },
            {
              type: 'segment',
              key: 'ptDepthDir',
              label: 'Near is',
              options: [
                ['bright', 'Bright'],
                ['dark', 'Dark'],
              ],
            },
            { type: 'buttons', columns: 2, buttons: depthButtons },
            {
              type: 'note',
              text: actions.estimateDepth
                ? 'Depth starts as a guess from brightness. Estimate depth runs a depth model in this browser: a 27 MB download the first time, and the picture stays on your device.'
                : 'Depth is guessed from brightness. For true depth, load a depth map of the same picture (white is near).',
            },
          ],
        },
        {
          title: 'Finish',
          visible: cloud,
          items: [
            exposure(),
            { type: 'slider', key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'Grid',
          visible: raster,
          items: [
            { type: 'slider', key: 'cell', label: 'Cell size', min: 4, max: 64, step: 1 },
            { type: 'slider', key: 'margin', label: 'Gap', min: 0, max: 0.6, step: 0.01 },
            { type: 'slider', key: 'density', label: 'Density', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'contrast', label: 'Contrast', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'Levels',
          visible: raster,
          items: [
            { type: 'custom', build: levelsTable },
            { type: 'custom', build: (s) => iconLibrary(s, actions) },
            {
              type: 'buttons',
              buttons: [
                {
                  label: 'Reset grid and levels',
                  onClick: () => store.reset(Object.keys(SHAPE_DEFAULTS)),
                  title: 'Put cell size, levels, shapes and fine tuning back to their defaults',
                },
              ],
            },
          ],
        },
        {
          title: 'Tone',
          visible: (s) => raster(s) && picture(s),
          items: [
            {
              type: 'segment',
              key: 'imageTone',
              label: 'Read as',
              options: [
                ['tone', 'Brightness'],
                ['solid', 'Solid shape'],
              ],
              titles: {
                tone: 'Light and dark parts of the picture become different levels',
                solid: 'Everything that is not transparent becomes full ink – for logos',
              },
            },
            exposure(),
          ],
        },
        {
          title: 'Lighting',
          visible: model,
          items: [
            {
              type: 'select',
              key: 'lighting',
              label: 'Rig',
              options: [
                ['studio', 'Studio'],
                ['soft', 'Soft'],
                ['top', 'Top'],
                ['side', 'Side'],
                ['rim', 'Rim'],
                ['flat', 'Flat'],
              ],
            },
            { type: 'slider', key: 'lightAngle', label: 'Angle', min: -180, max: 180, step: 1 },
            exposure(),
            { type: 'slider', key: 'ao', label: 'Occlusion', min: 0, max: 1, step: 0.01 },
            { type: 'check', key: 'shadows', label: 'Shadows' },
            {
              type: 'segment',
              key: 'material',
              label: 'Material',
              options: [
                ['clay', 'Clay'],
                ['original', 'Original'],
              ],
            },
            {
              type: 'segment',
              key: 'upAxis',
              label: 'Up axis',
              options: [
                ['y', 'Y'],
                ['z', 'Z'],
              ],
            },
          ],
        },
        {
          title: 'Fine tuning',
          open: false,
          visible: raster,
          items: [
            {
              type: 'segment',
              key: 'inkFrom',
              label: 'Ink from',
              options: [
                ['auto', 'Auto'],
                ['shadows', 'Shadows'],
                ['lights', 'Lights'],
              ],
            },
            { type: 'slider', key: 'dither', label: 'Dither', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'edge', label: 'Edge fade', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'banding', label: 'Banding', min: 0, max: 1, step: 0.01 },
          ],
        },
      ],
    },
    {
      id: 'motion',
      label: 'Motion',
      groups: [
        {
          title: 'Playback',
          items: [
            { type: 'check', key: 'play', label: 'Play' },
            { type: 'slider', key: 'loop', label: 'Loop length', min: 1, max: 20, step: 0.5 },
            { type: 'note', text: 'Everything loops seamlessly. One loop, in seconds, is one full cycle in the preview and in GIF and MP4 exports.' },
          ],
        },
        {
          title: 'Movement',
          items: [
            {
              type: 'select',
              key: 'motion',
              label: 'Type',
              options: [
                ['turntable', 'Turntable'],
                ['sway', 'Sway'],
                ['tumble', 'Tumble'],
                ['still', 'Still'],
              ],
            },
            {
              type: 'segment',
              key: 'dir',
              label: 'Direction',
              visible: (s) => s.motion !== 'still',
              options: [
                ['left', 'Left'],
                ['right', 'Right'],
              ],
            },
            {
              type: 'slider',
              key: 'sway',
              label: 'Sway angle',
              min: 0,
              max: 90,
              step: 1,
              visible: (s) => s.motion === 'sway' || s.motion === 'tumble',
            },
            { type: 'slider', key: 'float', label: 'Float', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'Scatter and gather',
          visible: cloud,
          items: [
            {
              type: 'segment',
              key: 'ptFx',
              label: 'Burst',
              options: [
                ['none', 'Off'],
                ['pulse', 'Pulse'],
                ['sweep', 'Sweep'],
              ],
              titles: {
                pulse: 'All points fly apart and gather again once per loop',
                sweep: 'The burst travels across the picture from left to right',
              },
            },
            { type: 'slider', key: 'ptBurst', label: 'Strength', min: 0, max: 1, step: 0.01, visible: (s) => s.ptFx !== 'none' },
            { type: 'slider', key: 'ptDrift', label: 'Drift', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'Tone effects',
          visible: raster,
          items: [
            { type: 'slider', key: 'wave', label: 'Wave', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'waveFreq', label: 'Wave count', min: 0.25, max: 6, step: 0.25, digits: 2, visible: (s) => s.wave > 0 },
            { type: 'slider', key: 'waveAngle', label: 'Wave angle', min: 0, max: 360, step: 1, visible: (s) => s.wave > 0 },
            { type: 'slider', key: 'shimmer', label: 'Shimmer', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'Light',
          visible: model,
          items: [{ type: 'check', key: 'lightOrbit', label: 'Orbit the light' }],
        },
      ],
    },
    {
      id: 'export',
      label: 'Export',
      groups: [
        {
          title: 'Still image',
          items: [
            {
              type: 'select',
              key: 'size',
              label: 'Short side',
              options: [
                [512, '512 px'],
                [1024, '1024 px'],
                [1080, '1080 px'],
                [2048, '2048 px'],
              ],
            },
            {
              type: 'segment',
              key: 'quality',
              label: 'Scale',
              options: [
                [1, '1×'],
                [2, '2×'],
                [3, '3×'],
              ],
            },
            { type: 'check', key: 'alpha', label: 'Transparent' },
            {
              type: 'buttons',
              columns: 2,
              visible: raster,
              buttons: [
                { label: 'Export PNG', primary: true, hint: 'E', onClick: () => actions.export('png') },
                { label: 'Export SVG', hint: 'S', onClick: () => actions.export('svg') },
              ],
            },
            {
              type: 'buttons',
              visible: cloud,
              buttons: [{ label: 'Export PNG', primary: true, hint: 'E', onClick: () => actions.export('png') }],
            },
          ],
        },
        {
          title: 'Loop',
          items: [
            {
              type: 'segment',
              key: 'gifFps',
              label: 'GIF frames/s',
              options: [10, 20, 25].map((v) => [v, String(v)]),
            },
            {
              type: 'segment',
              key: 'mp4Fps',
              label: 'MP4 frames/s',
              options: [24, 30, 60].map((v) => [v, String(v)]),
            },
            {
              type: 'segment',
              key: 'mp4Quality',
              label: 'MP4 quality',
              options: [
                ['low', 'Low'],
                ['medium', 'Medium'],
                ['high', 'High'],
              ],
            },
            {
              type: 'buttons',
              columns: 2,
              buttons: [
                { label: 'Export GIF', hint: 'G', onClick: () => actions.export('gif') },
                { label: 'Export MP4', hint: 'M', onClick: () => actions.export('mp4') },
              ],
            },
            { type: 'note', text: 'Loops are exported at the short side above, at 1× scale, and last one loop length (Motion tab).' },
          ],
        },
        {
          title: 'Preset',
          items: [
            {
              type: 'buttons',
              columns: 2,
              buttons: [
                { label: 'Save preset', onClick: actions.savePreset, title: 'Download every setting, with your icons, as a JSON file' },
                { label: 'Load preset…', onClick: actions.loadPreset, title: 'Load settings from a preset file' },
              ],
            },
          ],
        },
        {
          title: 'Shortcuts',
          open: false,
          items: [{ type: 'custom', build: shortcutList }],
        },
      ],
    },
  ];
}
