// Declarative description of the control panel (see panel.js for the builders).
import { PAIRINGS, SHAPE_DEFAULTS } from './state.js';
import { SHAPE_OPTIONS } from './shapes.js';

const shapeOptions = (s) => [
  ...SHAPE_OPTIONS,
  ...s.icons.map((icon) => [`icon:${icon.id}`, `ICON · ${icon.name.toUpperCase()}`]),
];

const levelRows = (n) => [
  { type: 'select', key: `shape${n}`, label: `L${n} SHAPE`, options: shapeOptions },
  { type: 'slider', key: `size${n}`, label: `L${n} SIZE`, min: 0.1, max: 1.2, step: 0.01 },
];

const isImage = (s) => s.object === 'image';
const isModel = (s) => s.object !== 'image';
const isPoints = (s) => s.object === 'image' && s.render === 'points';
const isRaster = (s) => !isPoints(s);
const isImageRaster = (s) => isImage(s) && isRaster(s);

// The library of uploaded cell icons: a thumbnail per icon (click to remove)
// and a button that opens the file picker.
function iconLibrary(actions) {
  return {
    type: 'custom',
    build(store, el) {
      const list = el('div', { class: 'icon-list' });
      const node = el('div', { class: 'icons' }, [el('span', { class: 'icons-title', text: 'YOUR ICONS' }), list]);
      let signature = null;
      const sync = () => {
        const { icons } = store.state;
        const next = icons.map((icon) => icon.id).join(',');
        if (next === signature) return;
        signature = next;
        list.replaceChildren(
          ...icons.map((icon) => {
            const img = el('img', { src: icon.data, alt: '' });
            return el(
              'button',
              {
                type: 'button',
                class: 'icon-chip',
                title: `Remove ${icon.name}`,
                'aria-label': `Remove icon ${icon.name}`,
                onclick: () => actions.removeIcon(icon.id),
              },
              [img, el('span', { class: 'icon-x', text: '×', 'aria-hidden': 'true' })],
            );
          }),
          el('button', { type: 'button', class: 'btn', text: '+ ADD ICON', onclick: actions.addIcon }),
        );
      };
      return { node, sync };
    },
  };
}

export function createSchema(store, actions) {
  return [
    {
      id: 'tool',
      label: 'TOOL',
      sections: [
        {
          title: 'COLOURS',
          items: [
            {
              type: 'select',
              key: 'pairing',
              label: 'PAIRING',
              options: (s) => [
                ...PAIRINGS.map((p, i) => [i, p.name]),
                ...(s.pairing === -1 ? [[-1, 'CUSTOM']] : []),
              ],
              onSelect: (i) => {
                if (PAIRINGS[i]) store.set({ pairing: i, ink: PAIRINGS[i].ink, bg: PAIRINGS[i].bg });
              },
            },
            { type: 'color', key: 'ink', label: 'HIGHLIGHT', onSet: () => ({ pairing: -1 }) },
            { type: 'color', key: 'bg', label: 'BACKGROUND', onSet: () => ({ pairing: -1 }) },
          ],
        },
        {
          title: 'IMAGE',
          visible: isImage,
          items: [
            {
              type: 'select',
              key: 'render',
              label: 'STYLE',
              options: [
                ['raster', 'SHAPE RASTER'],
                ['points', 'POINT CLOUD'],
              ],
              onSelect: actions.setRender,
            },
            {
              type: 'select',
              key: 'imageTone',
              label: 'IMAGE TONE',
              visible: isImageRaster,
              options: [
                ['tone', 'BRIGHTNESS'],
                ['solid', 'SOLID SHAPE'],
              ],
            },
            {
              type: 'select',
              key: 'ptCount',
              label: 'POINTS',
              visible: isPoints,
              options: [
                [65000, '65 K'],
                [130000, '130 K'],
                [260000, '260 K'],
                [520000, '520 K'],
              ],
            },
            { type: 'slider', key: 'ptSize', label: 'POINT SIZE', min: 0.1, max: 2.5, step: 0.01, visible: isPoints },
            { type: 'slider', key: 'ptDepth', label: 'DEPTH', min: 0, max: 2, step: 0.01, visible: isPoints },
            {
              type: 'select',
              key: 'ptDepthDir',
              label: 'NEAR IS',
              visible: isPoints,
              options: [
                ['bright', 'BRIGHT'],
                ['dark', 'DARK'],
              ],
            },
            { type: 'slider', key: 'ptCut', label: 'CUTOFF', min: 0, max: 0.9, step: 0.01, visible: isPoints },
            { type: 'slider', key: 'ptScatter', label: 'SCATTER', min: 0, max: 1, step: 0.01, visible: isPoints },
            {
              type: 'select',
              key: 'ptColor',
              label: 'COLOUR',
              visible: isPoints,
              options: [
                ['image', 'FROM IMAGE'],
                ['ink', 'HIGHLIGHT'],
              ],
            },
            {
              type: 'select',
              key: 'ptBlend',
              label: 'BLEND',
              visible: isPoints,
              options: [
                ['auto', 'AUTO'],
                ['glow', 'GLOW'],
                ['solid', 'SOLID'],
              ],
            },
            { type: 'slider', key: 'vignette', label: 'VIGNETTE', min: 0, max: 1, step: 0.01, visible: isPoints },
            { type: 'slider', key: 'grain', label: 'GRAIN', min: 0, max: 1, step: 0.01, visible: isPoints },
            {
              type: 'buttons',
              columns: 2,
              visible: isPoints,
              buttons: [
                {
                  label: 'LOAD DEPTH MAP',
                  onClick: actions.loadDepthMap,
                  title: 'Use a greyscale depth image (white = near) instead of the automatic depth',
                },
                { label: 'AUTO DEPTH', onClick: actions.clearDepthMap, title: 'Go back to depth estimated from brightness' },
              ],
            },
            {
              type: 'note',
              visible: isPoints,
              text: 'Depth is estimated from brightness. For true depth, load a depth map of the same picture.',
            },
          ],
        },
        {
          title: 'ADVANCED',
          open: false,
          visible: isRaster,
          items: [
            {
              type: 'select',
              key: 'inkFrom',
              label: 'INK FROM',
              options: [
                ['auto', 'AUTO'],
                ['shadows', 'SHADOWS'],
                ['lights', 'LIGHTS'],
              ],
            },
            {
              type: 'select',
              key: 'accentLevel',
              label: 'ACCENT ON',
              options: [
                [0, 'OFF'],
                [1, 'LEVEL 1'],
                [2, 'LEVEL 2'],
                [3, 'LEVEL 3'],
                [4, 'LEVEL 4'],
              ],
            },
            { type: 'color', key: 'accent', label: 'ACCENT', visible: (s) => s.accentLevel > 0 },
            { type: 'slider', key: 'contrast', label: 'CONTRAST', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'dither', label: 'DITHER', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'edge', label: 'EDGE FADE', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'SHAPES',
          visible: isRaster,
          items: [
            {
              type: 'buttons',
              buttons: [
                {
                  label: 'RESET TO PRESET',
                  primary: true,
                  onClick: () => store.reset(Object.keys(SHAPE_DEFAULTS)),
                },
              ],
            },
            { type: 'slider', key: 'cell', label: 'CELL SIZE', min: 4, max: 64, step: 1 },
            { type: 'slider', key: 'margin', label: 'MARGIN', min: 0, max: 0.6, step: 0.01 },
            { type: 'slider', key: 'banding', label: 'BANDING', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'density', label: 'LEVELS', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'l1', label: 'L1 START', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'l2', label: 'L2 START', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'l3', label: 'L3 START', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'l4', label: 'L4 START', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'ao', label: 'CONTACT AO', min: 0, max: 1, step: 0.01, visible: isModel },
          ],
        },
        {
          title: 'LEVEL SHAPES',
          visible: isRaster,
          items: [
            iconLibrary(actions),
            ...levelRows(1),
            ...levelRows(2),
            ...levelRows(3),
            ...levelRows(4),
            {
              type: 'note',
              text: 'Add your own icon (SVG or PNG) and pick it as the shape of any level. It takes the level colour.',
            },
          ],
        },
        {
          title: 'LIGHT & TONE',
          items: [
            {
              type: 'select',
              key: 'lighting',
              label: 'LIGHTING',
              visible: isModel,
              options: [
                ['studio', 'STUDIO'],
                ['soft', 'SOFT'],
                ['top', 'TOP'],
                ['side', 'SIDE'],
                ['rim', 'RIM'],
                ['flat', 'FLAT'],
              ],
            },
            { type: 'slider', key: 'lightAngle', label: 'ANGLE', min: -180, max: 180, step: 1, visible: isModel },
            { type: 'slider', key: 'exposure', label: 'EXPOSURE', min: 0.2, max: 3, step: 0.01 },
            { type: 'check', key: 'shadows', label: 'SHADOWS', visible: isModel },
            {
              type: 'select',
              key: 'material',
              label: 'MATERIAL',
              visible: isModel,
              options: [
                ['clay', 'CLAY'],
                ['original', 'ORIGINAL'],
              ],
            },
          ],
        },
        {
          title: 'SCENE',
          items: [
            { type: 'check', key: 'play', label: 'AUTO ROTATE' },
            { type: 'slider', key: 'loop', label: 'LOOP (S)', min: 1, max: 20, step: 0.5 },
            {
              type: 'select',
              key: 'dir',
              label: 'DIRECTION',
              options: [
                ['left', 'LEFT'],
                ['right', 'RIGHT'],
              ],
            },
            { type: 'slider', key: 'zoom', label: 'ZOOM', min: 0.4, max: 4, step: 0.01 },
            {
              type: 'select',
              key: 'upAxis',
              label: 'UP AXIS',
              visible: isModel,
              options: [
                ['y', 'Y UP'],
                ['z', 'Z UP'],
              ],
            },
          ],
        },
        {
          title: 'EXPORT',
          items: [
            {
              type: 'select',
              key: 'aspect',
              label: 'FORMAT',
              options: [
                ['1:1', '1:1 SQUARE'],
                ['4:5', '4:5 PORTRAIT'],
                ['9:16', '9:16 STORY'],
                ['16:9', '16:9 WIDE'],
              ],
            },
            {
              type: 'select',
              key: 'size',
              label: 'SIZE',
              options: [
                [512, '512'],
                [1024, '1024'],
                [1080, '1080'],
                [2048, '2048'],
              ],
            },
            {
              type: 'select',
              key: 'quality',
              label: 'QUALITY',
              options: [
                [1, '1×'],
                [2, '2×'],
                [3, '3×'],
              ],
            },
            { type: 'check', key: 'alpha', label: 'PNG ALPHA' },
            {
              type: 'select',
              key: 'gifFps',
              label: 'GIF FPS',
              options: [10, 20, 25].map((v) => [v, String(v)]),
            },
            {
              type: 'select',
              key: 'mp4Fps',
              label: 'MP4 FPS',
              options: [24, 30, 60].map((v) => [v, String(v)]),
            },
            {
              type: 'select',
              key: 'mp4Quality',
              label: 'MP4 QUALITY',
              options: [
                ['low', 'LOW'],
                ['medium', 'MEDIUM'],
                ['high', 'HIGH'],
              ],
            },
            {
              type: 'buttons',
              columns: 2,
              buttons: [
                { label: 'EXPORT PNG', primary: true, onClick: () => actions.export('png') },
                { label: 'EXPORT SVG', primary: true, onClick: () => actions.export('svg') },
                { label: 'EXPORT GIF', primary: true, onClick: () => actions.export('gif') },
                { label: 'EXPORT MP4', primary: true, onClick: () => actions.export('mp4') },
              ],
            },
            {
              type: 'buttons',
              columns: 2,
              buttons: [
                { label: 'SAVE PRESET', onClick: actions.savePreset, title: 'Download every setting as a JSON file' },
                { label: 'LOAD PRESET', onClick: actions.loadPreset, title: 'Load settings from a JSON preset' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'animate',
      label: 'ANIMATE',
      sections: [
        {
          title: 'MOTION',
          items: [
            {
              type: 'select',
              key: 'motion',
              label: 'MOTION',
              options: [
                ['turntable', 'TURNTABLE'],
                ['sway', 'SWAY'],
                ['tumble', 'TUMBLE'],
                ['still', 'STILL'],
              ],
            },
            { type: 'check', key: 'play', label: 'PLAY' },
            { type: 'slider', key: 'loop', label: 'LOOP (S)', min: 1, max: 20, step: 0.5 },
            {
              type: 'select',
              key: 'dir',
              label: 'DIRECTION',
              options: [
                ['left', 'LEFT'],
                ['right', 'RIGHT'],
              ],
            },
            {
              type: 'slider',
              key: 'sway',
              label: 'SWAY ANGLE',
              min: 0,
              max: 90,
              step: 1,
              visible: (s) => s.motion === 'sway' || s.motion === 'tumble',
            },
            { type: 'slider', key: 'float', label: 'FLOAT', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'LIGHT',
          visible: isModel,
          items: [{ type: 'check', key: 'lightOrbit', label: 'LIGHT ORBIT', visible: isModel }],
        },
        {
          title: 'POINT FX',
          visible: isPoints,
          items: [
            {
              type: 'select',
              key: 'ptFx',
              label: 'GATHER',
              options: [
                ['none', 'OFF'],
                ['pulse', 'PULSE'],
                ['sweep', 'SWEEP'],
              ],
            },
            { type: 'slider', key: 'ptBurst', label: 'BURST', min: 0, max: 1, step: 0.01, visible: (s) => s.ptFx !== 'none' },
            { type: 'slider', key: 'ptDrift', label: 'DRIFT', min: 0, max: 1, step: 0.01 },
            {
              type: 'note',
              text: 'The points scatter and gather again once per LOOP. SWAY in MOTION shows off the depth.',
            },
          ],
        },
        {
          title: 'TONE FX',
          visible: isRaster,
          items: [
            { type: 'slider', key: 'wave', label: 'WAVE', min: 0, max: 1, step: 0.01 },
            { type: 'slider', key: 'waveFreq', label: 'WAVE FREQ', min: 0.25, max: 6, step: 0.25, digits: 2 },
            { type: 'slider', key: 'waveAngle', label: 'WAVE ANGLE', min: 0, max: 360, step: 1 },
            { type: 'slider', key: 'shimmer', label: 'SHIMMER', min: 0, max: 1, step: 0.01 },
            {
              type: 'note',
              text: 'Everything here loops seamlessly: one LOOP is one full cycle, in the preview and in GIF / MP4 exports.',
            },
          ],
        },
      ],
    },
  ];
}
