import './style.css';
import { createStore, ASPECTS, DEFAULTS, PAIRINGS, inkFromLights } from './state.js';
import { Stage } from './stage.js';
import { gridDims, computeCells, drawCanvas, toSVG } from './halftone.js';
import { buildPanel } from './panel.js';
import { createSchema } from './schema.js';
import { OBJECTS, buildObject } from './objects.js';
import { loadModelFiles, MODEL_EXTENSIONS } from './loaders.js';
import { createIcon, ensureIcons, fileToCanvas, isImageFile, MAX_ICONS } from './icons.js';
import { exportPNG, exportSVG, exportGIF, exportMP4, download, frameSize } from './export.js';

const $ = (id) => document.getElementById(id);
const store = createStore();
const { state } = store;

// A custom model can't be restored after a reload – fall back to a built-in one.
if (state.object === 'custom' || !OBJECTS.some(([id]) => id === state.object)) {
  state.object = 'knot';
  state.upAxis = 'y';
}
if (store.fresh && window.matchMedia('(prefers-reduced-motion: reduce)').matches) state.play = false;

const canvas = $('view');
const ctx = canvas.getContext('2d');
const viewport = $('viewport');

let stage;
try {
  stage = new Stage(canvas);
} catch (error) {
  viewport.innerHTML = '<p class="fatal">This tool needs WebGL, which is not available in this browser.</p>';
  throw error;
}

let phase = 0;
let dirty = true;
let busy = false;
let customName = '';
let customKind = 'custom'; // 'custom' = uploaded model, 'image' = uploaded picture
let motionBeforeImage = null;
let lastCells = null;

// ---------- rendering ----------

function sampleCells(ph) {
  const aspect = ASPECTS[state.aspect] || 1;
  stage.setAspect(aspect);
  const grid = stage.sample(gridDims(state.cell, aspect), state, ph);
  return computeCells(grid, state, ph);
}

const app = {
  state,
  get phase() {
    return phase;
  },
  get pointMode() {
    return pointMode();
  },
  render(target, W, H, ph, options = {}) {
    if (pointMode()) {
      stage.setAspect(ASPECTS[state.aspect] || 1);
      const count = stage.renderPoints(target, W, H, state, ph, options);
      if (!options.transparent) finish(target, W, H, ph);
      return { points: true, count };
    }
    const cells = sampleCells(ph);
    drawCanvas(target, W, H, cells, state, options);
    return cells;
  },
  svg(W, H, ph, options) {
    if (pointMode()) throw new Error('SVG is not available for point clouds – use PNG');
    return toSVG(W, H, sampleCells(ph), state, options);
  },
};

function pointMode() {
  return state.object === 'image' && state.render === 'points';
}

// Vignette and film grain, laid over a finished point-cloud frame.
let grainTile = null;
function finish(target, W, H, ph) {
  if (state.vignette > 0) {
    const r = Math.hypot(W, H) / 2;
    const gradient = target.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${state.vignette * 0.9})`);
    target.fillStyle = gradient;
    target.fillRect(0, 0, W, H);
  }
  if (state.grain > 0) {
    if (!grainTile) {
      grainTile = document.createElement('canvas');
      grainTile.width = grainTile.height = 256;
      const g = grainTile.getContext('2d');
      const image = g.createImageData(256, 256);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      g.putImageData(image, 0, 0);
    }
    // The grain is sized against the frame and shifts every 1/24 of the loop,
    // so it shimmers yet still loops.
    const scale = Math.max(1, Math.min(W, H) / 1024);
    const step = Math.floor(ph * 24);
    target.save();
    target.globalAlpha = state.grain * 0.5;
    target.globalCompositeOperation = 'overlay';
    target.imageSmoothingEnabled = false;
    target.scale(scale, scale);
    target.translate(-((step * 97) % 256), -((step * 57) % 256));
    target.fillStyle = target.createPattern(grainTile, 'repeat');
    target.fillRect(0, 0, W / scale + 256, H / scale + 256);
    target.restore();
  }
}

function fitCanvas() {
  const aspect = ASPECTS[state.aspect] || 1;
  const pad = Math.min(viewport.clientWidth, viewport.clientHeight) < 420 ? 12 : 28;
  const maxW = Math.max(50, viewport.clientWidth - pad * 2);
  const maxH = Math.max(50, viewport.clientHeight - pad * 2);
  const w = Math.floor(Math.min(maxW, maxH * aspect));
  const h = Math.floor(w / aspect);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  dirty = true;
}
new ResizeObserver(fitCanvas).observe(viewport);

let lastTime = performance.now();
let fpsTime = lastTime;
let fpsFrames = 0;
let fps = 0;
let statsStale = true;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  if (busy) return;
  if (state.play) {
    phase = (phase + dt / state.loop) % 1;
    dirty = true;
  }
  if (stage.update(now)) dirty = true;
  if (!dirty || !canvas.width) return;
  dirty = false;
  lastCells = app.render(ctx, canvas.width, canvas.height, phase);

  fpsFrames++;
  if (now - fpsTime > 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsTime));
    fpsFrames = 0;
    fpsTime = now;
    statsStale = true;
  }
  if (statsStale) updateStats();
}

function updateStats() {
  if (!lastCells) return;
  statsStale = false;
  const { W, H } = frameSize(state, state.quality);
  const what = lastCells.points
    ? `${lastCells.count.toLocaleString('en-US')} POINTS`
    : `${lastCells.cols}×${lastCells.rows} GRID · ${lastCells.count.toLocaleString('en-US')} CELLS`;
  $('stats').textContent = `${what} · PNG ${W}×${H}${state.play ? ` · ${fps} FPS` : ''}`;
}

// ---------- models ----------

function renderObjectChips() {
  const entries = OBJECTS.map(([id, label]) => [id, label]);
  if (customName) entries.push([customKind, customName.toUpperCase()]);
  $('objects').replaceChildren(
    ...entries.map(([id, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(state.object === id));
      button.addEventListener('click', () => {
        if (id !== customKind) store.set({ object: id, upAxis: 'y' });
      });
      return button;
    }),
  );
}

function showBuiltin(id) {
  stage.setModel(buildObject(id), state.upAxis);
  dirty = true;
}

const shortName = (name) => (name.length > 22 ? `${name.slice(0, 20)}…` : name);
const isModelFile = (file) => MODEL_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase());

// One entry point for everything that is dropped or picked: a 3D model
// (possibly with its side files) or a picture to rasterise.
async function loadFiles(files) {
  if (!files.length || busy) return;
  const picture = !files.some(isModelFile) && files.find(isImageFile);
  toast(picture ? 'LOADING IMAGE…' : 'LOADING MODEL…', 0);
  try {
    if (picture) {
      stage.setImage(await fileToCanvas(picture, 2048));
      customName = shortName(picture.name);
      customKind = 'image';
      // A picture starts flat and facing the camera; a spin can be switched back on.
      const patch = { object: 'image', upAxis: 'y' };
      if (state.motion === 'turntable' || state.motion === 'tumble') {
        motionBeforeImage = state.motion;
        patch.motion = 'still';
      }
      stage.setView('front', false);
      store.set(patch);
      renderObjectChips();
      dirty = true;
      toast(`LOADED ${picture.name.toUpperCase()}`);
      return;
    }
    const { object, name, zUp } = await loadModelFiles(files);
    customName = shortName(name);
    customKind = 'custom';
    const upAxis = zUp ? 'z' : 'y';
    stage.setModel(object, upAxis);
    store.set({ object: 'custom', upAxis });
    renderObjectChips();
    dirty = true;
    toast(`LOADED ${name.toUpperCase()}`);
  } catch (error) {
    console.error(error);
    toast(`COULD NOT LOAD FILE – ${error.message}`.toUpperCase(), 6000, true);
  }
}

// No `accept` filter on purpose: mobile file pickers grey out .glb / .gltf
// because they have no registered type there. Validation happens on load.
const fileModel = $('file-model');
$('swap').addEventListener('click', () => fileModel.click());
fileModel.addEventListener('change', () => {
  loadFiles([...fileModel.files]);
  fileModel.value = '';
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  $('drop').hidden = false;
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('drop').hidden = true;
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('drop').hidden = true;
  const files = [...e.dataTransfer.files];
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.json')) loadPresetFile(files[0]);
  else loadFiles(files);
});

// ---------- views ----------

const VIEW_BUTTONS = [
  ['front', 'FRONT'],
  ['three', '3/4'],
  ['side', 'SIDE'],
  ['top', 'TOP'],
  ['hero', 'HERO'],
];
$('views').replaceChildren(
  ...VIEW_BUTTONS.map(([id, label], i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = label;
    button.title = `${label} view (${i + 1})`;
    button.addEventListener('click', () => stage.setView(id));
    return button;
  }),
);

// ---------- feedback ----------

let toastTimer = 0;
function toast(message, duration = 2600, isError = false) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => (node.hidden = true), duration);
}

// ---------- export ----------

let abortController = null;
$('progress-cancel').addEventListener('click', () => abortController?.abort());

function fileBase() {
  const name = state.object === customKind ? customName.replace(/\.[^.]+$/, '') : state.object;
  return `rastr-${name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'asset'}`;
}

async function runExport(kind) {
  if (busy) return;
  const jobs = { png: exportPNG, svg: exportSVG, gif: exportGIF, mp4: exportMP4 };
  const animated = kind === 'gif' || kind === 'mp4';
  busy = true;
  abortController = new AbortController();
  if (animated) {
    $('progress-label').textContent = `RENDERING ${kind.toUpperCase()} 0%`;
    $('progress-bar').style.width = '0%';
    $('progress').hidden = false;
  }
  try {
    const result = await jobs[kind](app, {
      signal: abortController.signal,
      onProgress: (p) => {
        const pct = Math.round(p * 100);
        $('progress-label').textContent = `RENDERING ${kind.toUpperCase()} ${pct}%`;
        $('progress-bar').style.width = `${pct}%`;
      },
    });
    $('progress').hidden = true;
    if ((await download(result.blob, `${fileBase()}.${result.ext}`)) === 'declined') {
      toast('EXPORT CANCELLED');
      return;
    }
    const mb = result.blob.size / 1048576;
    const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(result.blob.size / 1024))} KB`;
    toast(`SAVED ${result.ext.toUpperCase()} · ${result.info} · ${size}`.toUpperCase(), 4200);
  } catch (error) {
    if (error.name === 'AbortError') toast('EXPORT CANCELLED');
    else {
      console.error(error);
      toast(`EXPORT FAILED – ${error.message}`.toUpperCase(), 7000, true);
    }
  } finally {
    $('progress').hidden = true;
    abortController = null;
    busy = false;
    dirty = true;
    lastTime = performance.now();
  }
}

// ---------- presets ----------

const filePreset = $('file-preset');
async function loadPresetFile(file) {
  try {
    store.importPreset(await file.text());
    toast('PRESET LOADED');
  } catch (error) {
    toast(`COULD NOT LOAD PRESET – ${error.message}`.toUpperCase(), 6000, true);
  }
}
filePreset.addEventListener('change', () => {
  if (filePreset.files[0]) loadPresetFile(filePreset.files[0]);
  filePreset.value = '';
});

const actions = {
  export: runExport,
  async savePreset() {
    try {
      const blob = new Blob([store.exportPreset()], { type: 'application/json' });
      if ((await download(blob, 'rastr-preset.json')) === 'saved') toast('PRESET SAVED');
    } catch (error) {
      toast(`COULD NOT SAVE PRESET – ${error.message}`.toUpperCase(), 6000, true);
    }
  },
  loadPreset: () => filePreset.click(),
  // Switching a picture to the point cloud also sets the stage for it: a dark
  // ground so the points glow, and a gentle sway that shows the depth.
  setRender(render) {
    const patch = { render };
    if (render === 'points') {
      if (!inkFromLights(state)) {
        const dark = PAIRINGS.length - 1;
        Object.assign(patch, { pairing: dark, ink: PAIRINGS[dark].ink, bg: PAIRINGS[dark].bg });
      }
      if (state.motion === 'still') Object.assign(patch, { motion: 'sway', sway: 12 });
    }
    store.set(patch);
  },
  loadDepthMap: () => fileDepth.click(),
  clearDepthMap() {
    stage.setDepthMap(null);
    dirty = true;
    toast('DEPTH FROM BRIGHTNESS');
  },
  addIcon() {
    if (state.icons.length >= MAX_ICONS) toast(`${MAX_ICONS} ICONS IS THE LIMIT – REMOVE ONE FIRST`, 4000, true);
    else fileIcon.click();
  },
  removeIcon(id) {
    const patch = { icons: state.icons.filter((icon) => icon.id !== id) };
    for (let level = 1; level <= 4; level++) {
      if (state[`shape${level}`] === `icon:${id}`) patch[`shape${level}`] = DEFAULTS[`shape${level}`];
    }
    store.set(patch);
    toast('ICON REMOVED · ⌘Z TO UNDO');
  },
};

const fileDepth = $('file-depth');
fileDepth.addEventListener('change', async () => {
  const file = fileDepth.files[0];
  fileDepth.value = '';
  if (!file) return;
  try {
    stage.setDepthMap(await fileToCanvas(file, 1024));
    dirty = true;
    toast('DEPTH MAP LOADED');
  } catch (error) {
    toast(`COULD NOT LOAD DEPTH MAP – ${error.message}`.toUpperCase(), 6000, true);
  }
});

const fileIcon = $('file-icon');
fileIcon.addEventListener('change', async () => {
  const file = fileIcon.files[0];
  fileIcon.value = '';
  if (!file) return;
  try {
    const icon = await createIcon(file);
    // The new icon goes straight onto the densest level so it is visible at once.
    store.set({ icons: [...state.icons, icon], shape4: `icon:${icon.id}` });
    toast('ICON ADDED · SET AS L4 SHAPE');
  } catch (error) {
    toast(`COULD NOT ADD ICON – ${error.message}`.toUpperCase(), 6000, true);
  }
});

// ---------- wiring ----------

buildPanel($('panel'), createSchema(store, actions), store);

store.subscribe((keys) => {
  if (keys.includes('object')) {
    if (state.object !== 'custom' && state.object !== 'image') {
      showBuiltin(state.object);
      // Give a model back the spin that loading a picture switched off.
      const motion = motionBeforeImage;
      motionBeforeImage = null;
      if (motion && state.motion === 'still') store.set({ motion }, { history: false });
    }
    renderObjectChips();
  }
  if (keys.includes('icons')) ensureIcons(state.icons, () => (dirty = true));
  if (keys.includes('upAxis')) stage.setUpAxis(state.upAxis);
  if (keys.includes('aspect')) fitCanvas();
  if (keys.includes('zoom') && Math.abs(stage.zoom - state.zoom) > 0.004) stage.setZoom(state.zoom);
  dirty = true;
  statsStale = true; // refreshed after the next render, once the new grid exists
});

stage.controls.addEventListener('change', () => {
  const zoom = Math.round(stage.zoom * 100) / 100;
  if (Math.abs(zoom - state.zoom) > 0.004) store.set({ zoom }, { history: false });
});

function resetLook() {
  const keep = new Set(['object', 'upAxis', 'icons']);
  store.reset(Object.keys(state).filter((k) => !keep.has(k)));
  stage.setView('three');
  toast('RESET TO DEFAULTS');
}

window.addEventListener('keydown', (e) => {
  const target = e.target;
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      (target.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(target.type)));
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z' && !typing) {
    e.preventDefault();
    const done = e.shiftKey ? store.redo() : store.undo();
    toast(done ? (e.shiftKey ? 'REDO' : 'UNDO') : 'NOTHING TO ' + (e.shiftKey ? 'REDO' : 'UNDO'), 1200);
    return;
  }
  if (mod && key === 'y' && !typing) {
    e.preventDefault();
    toast(store.redo() ? 'REDO' : 'NOTHING TO REDO', 1200);
    return;
  }
  if (typing || mod || e.altKey) return;

  if (key === ' ' && !(target instanceof HTMLButtonElement) && target.tagName !== 'SUMMARY' && target.type !== 'checkbox') {
    e.preventDefault();
    store.set({ play: !state.play });
  } else if (key === 'e') runExport('png');
  else if (key === 's') runExport('svg');
  else if (key === 'g') runExport('gif');
  else if (key === 'm') runExport('mp4');
  else if (key === 'r') resetLook();
  else if (key >= '1' && key <= '5') stage.setView(VIEW_BUTTONS[Number(key) - 1][0]);
});

showBuiltin(state.object);
ensureIcons(state.icons, () => (dirty = true));
stage.setZoom(state.zoom);
renderObjectChips();
fitCanvas();
requestAnimationFrame(frame);

// Handy for debugging and automated checks.
window.rastr = { store, stage, app };
