// Central parameter store: defaults, colour pairings, persistence and undo history.

export const PAIRINGS = [
  { name: 'INK / ACID', ink: '#0b0d0c', bg: '#d8ff4a' },
  { name: 'ACID / INK', ink: '#d8ff4a', bg: '#0a0f14' },
  { name: 'EMBER / BONE', ink: '#ee5127', bg: '#f6f1e6' },
  { name: 'BONE / EMBER', ink: '#f6f1e6', bg: '#ee5127' },
  { name: 'COBALT / PAPER', ink: '#2440ff', bg: '#f2f2ee' },
  { name: 'PAPER / COBALT', ink: '#f2f2ee', bg: '#2440ff' },
  { name: 'INK / PAPER', ink: '#111214', bg: '#f2f2ee' },
  { name: 'PAPER / INK', ink: '#f2f2ee', bg: '#111214' },
];

export const SHAPE_DEFAULTS = {
  cell: 16,
  margin: 0.1,
  banding: 1,
  density: 0.5,
  contrast: 0.5,
  l1: 0.12,
  l2: 0.35,
  l3: 0.6,
  l4: 0.82,
  shape1: 'dot',
  size1: 0.4,
  shape2: 'cross',
  size2: 0.85,
  shape3: 'rounded',
  size3: 0.7,
  shape4: 'rounded',
  size4: 1,
  dither: 0.12,
  edge: 0.6,
  ao: 0.55,
};

export const DEFAULTS = {
  // colours
  pairing: 0,
  ink: PAIRINGS[0].ink,
  bg: PAIRINGS[0].bg,
  accentLevel: 0,
  accent: '#ff4d2e',
  inkFrom: 'auto',

  ...SHAPE_DEFAULTS,
  // uploaded cell icons: [{ id, name, data }] – a shape key of `icon:<id>` uses one
  icons: [],

  // lighting
  lighting: 'studio',
  lightAngle: 0,
  exposure: 1,
  shadows: true,
  material: 'clay',
  imageTone: 'tone',

  // scene
  object: 'knot',
  upAxis: 'y',
  zoom: 1,
  play: true,
  loop: 8,
  dir: 'left',

  // animate
  motion: 'turntable',
  sway: 30,
  float: 0,
  lightOrbit: false,
  wave: 0,
  waveFreq: 1.5,
  waveAngle: 0,
  shimmer: 0,

  // export
  aspect: '1:1',
  size: 1024,
  quality: 2,
  alpha: false,
  gifFps: 20,
  mp4Fps: 30,
  mp4Quality: 'high',
};

export const ASPECTS = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
};

const STORAGE_KEY = 'rastr-studio:v1';
// Keys that describe the session rather than the look – not worth an undo step.
const NO_HISTORY = new Set(['zoom', 'play']);
// What is on stage is not part of the look: undo never swaps the loaded model or picture.
const SESSION = new Set(['object', 'upAxis', 'zoom', 'play']);

export function createStore() {
  const state = { ...DEFAULTS };
  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];
  let pendingSnapshot = null;
  let commitTimer = 0;
  let saveTimer = 0;
  let fresh = true; // no saved session was found

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      applyKnown(state, saved);
      fresh = false;
    }
  } catch {
    // Storage can be unavailable (private mode, sandboxed frames) – defaults are fine.
  }

  function applyKnown(target, patch) {
    for (const key of Object.keys(DEFAULTS)) {
      if (!(key in patch) || typeof patch[key] !== typeof DEFAULTS[key]) continue;
      target[key] = key === 'icons' ? cleanIcons(patch[key]) : patch[key];
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // ignore
      }
    }, 300);
  }

  function emit(keys) {
    for (const fn of listeners) fn(keys);
    persist();
  }

  // A slider drag fires many updates; they collapse into one undo step.
  function trackHistory(keys) {
    if (keys.every((k) => NO_HISTORY.has(k))) return;
    if (!pendingSnapshot) pendingSnapshot = { ...state };
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitHistory, 400);
  }

  function commitHistory() {
    clearTimeout(commitTimer);
    if (!pendingSnapshot) return;
    undoStack.push(pendingSnapshot);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    pendingSnapshot = null;
  }

  function set(patch, { history = true } = {}) {
    const keys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
    if (!keys.length) return;
    if (history) trackHistory(keys);
    for (const k of keys) state[k] = patch[k];
    emit(keys);
  }

  function restore(snapshot) {
    const keys = Object.keys(DEFAULTS).filter((k) => !SESSION.has(k) && state[k] !== snapshot[k]);
    for (const k of keys) state[k] = snapshot[k];
    if (keys.length) emit(keys);
  }

  return {
    state,
    fresh,
    set,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    undo() {
      commitHistory();
      if (!undoStack.length) return false;
      redoStack.push({ ...state });
      restore(undoStack.pop());
      return true;
    },
    redo() {
      commitHistory();
      if (!redoStack.length) return false;
      undoStack.push({ ...state });
      restore(redoStack.pop());
      return true;
    },
    reset(keys = Object.keys(DEFAULTS)) {
      const patch = {};
      for (const k of keys) patch[k] = DEFAULTS[k];
      set(patch);
    },
    exportPreset() {
      return JSON.stringify({ app: 'rastr-studio', version: 1, params: state }, null, 2);
    },
    importPreset(text) {
      const data = JSON.parse(text);
      const params = data && typeof data === 'object' ? data.params || data : null;
      if (!params || typeof params !== 'object') throw new Error('Not a preset file');
      const next = { ...state };
      applyKnown(next, params);
      // An uploaded model or picture is not part of a preset file.
      if (next.object === 'custom' || next.object === 'image') next.object = state.object;
      set(next);
    },
  };
}

// Icons come from storage and preset files, so only well-formed entries are kept.
function cleanIcons(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (icon) =>
        icon &&
        typeof icon.id === 'string' &&
        /^[a-z0-9]{1,16}$/.test(icon.id) &&
        typeof icon.data === 'string' &&
        icon.data.startsWith('data:image/png;base64,'),
    )
    .slice(0, 6)
    .map((icon) => ({ id: icon.id, name: String(icon.name || 'icon').slice(0, 24), data: icon.data }));
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// Dark ink on a light ground prints the shadows; light ink on a dark ground prints the lights.
export function inkFromLights(state) {
  if (state.inkFrom === 'lights') return true;
  if (state.inkFrom === 'shadows') return false;
  return luminance(state.ink) > luminance(state.bg);
}

export function normalizeHex(value) {
  let v = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, '$&$&');
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : null;
}
