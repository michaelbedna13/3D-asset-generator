// Declarative description of the control panel (see panel.js for the builders).
import { PAIRINGS, SHAPE_DEFAULTS } from './state.js';
import { SHAPE_OPTIONS } from './shapes.js';

const levelRows = (n) => [
  { type: 'select', key: `shape${n}`, label: `L${n} SHAPE`, options: SHAPE_OPTIONS },
  { type: 'slider', key: `size${n}`, label: `L${n} SIZE`, min: 0.1, max: 1.2, step: 0.01 },
];

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
          title: 'ADVANCED',
          open: false,
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
            ...levelRows(1),
            ...levelRows(2),
            ...levelRows(3),
            ...levelRows(4),
          ],
        },
        {
          title: 'SHAPES',
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
            { type: 'slider', key: 'ao', label: 'CONTACT AO', min: 0, max: 1, step: 0.01 },
          ],
        },
        {
          title: 'LIGHTING',
          items: [
            {
              type: 'select',
              key: 'lighting',
              label: 'LIGHTING',
              options: [
                ['studio', 'STUDIO'],
                ['soft', 'SOFT'],
                ['top', 'TOP'],
                ['side', 'SIDE'],
                ['rim', 'RIM'],
                ['flat', 'FLAT'],
              ],
            },
            { type: 'slider', key: 'lightAngle', label: 'ANGLE', min: -180, max: 180, step: 1 },
            { type: 'slider', key: 'exposure', label: 'EXPOSURE', min: 0.2, max: 3, step: 0.01 },
            { type: 'check', key: 'shadows', label: 'SHADOWS' },
            {
              type: 'select',
              key: 'material',
              label: 'MATERIAL',
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
          items: [{ type: 'check', key: 'lightOrbit', label: 'LIGHT ORBIT' }],
        },
        {
          title: 'TONE FX',
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
