import './style.css';
import { createStore, ASPECTS, DEFAULTS, PAIRINGS, inkFromLights, isPicture, isPointCloud } from './state.js';
import { Stage } from './stage.js';
import { gridDims, computeCells, drawCanvas, toSVG } from './halftone.js';
import { buildPanel, bindControl, el } from './panel.js';
import { createSchema } from './schema.js';
import { OBJECTS, buildObject } from './objects.js';
import { SAMPLES, sampleCanvas, sampleName, thumbnail } from './samples.js';
import { GLYPHS } from './glyphs.js';
import { loadModelFiles, MODEL_EXTENSIONS } from './loaders.js';
import { createIcon, ensureIcons, fileToCanvas, isImageFile, MAX_ICONS } from './icons.js';
import { exportPNG, exportSVG, exportGIF, exportMP4, download, frameSize, hosted } from './export.js';

const $ = (id) => document.getElementById(id);
const store = createStore();
const { state } = store;

// A loaded picture or model can't be restored after a reload – open on a sample.
const known = (id) => SAMPLES.some(([key]) => key === id) || OBJECTS.some(([key]) => key === id);
if (!known(state.object)) {
  state.object = DEFAULTS.object;
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
let lastCells = null;
// what the owner has opened this session, kept so it can be picked again
const loaded = { picture: null, model: null };

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

const pointMode = () => isPointCloud(state);

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
  const count = lastCells.count.toLocaleString('en-US');
  const what = lastCells.points ? `${count} points` : `${lastCells.cols} × ${lastCells.rows} grid · ${count} cells`;
  $('stats').textContent = `${what} · PNG ${W} × ${H}${state.play ? ` · ${fps} fps` : ''}`;
}

// ---------- sources ----------

const kindOf = (id) => (id === 'image' || id.startsWith('pic:') ? 'picture' : 'object');
const titleCase = (text) => text.charAt(0) + text.slice(1).toLowerCase();

function sourceName(id = state.object) {
  if (id === 'image') return loaded.picture.name;
  if (id === 'custom') return loaded.model.name;
  if (id.startsWith('pic:')) return sampleName(id);
  return titleCase(OBJECTS.find(([key]) => key === id)[1]);
}

// Puts whatever `state.object` names onto the stage.
function showSource() {
  const id = state.object;
  if (id === 'image') stage.setImage(loaded.picture.canvas);
  else if (id.startsWith('pic:')) stage.setImage(sampleCanvas(id));
  else if (id === 'custom') stage.setModel(loaded.model.object, state.upAxis);
  else stage.setModel(buildObject(id), state.upAxis);
  dirty = true;
}

// Pictures and 3D objects each remember how they were moving, so switching
// between them never leaves a flat picture spinning or a model standing still.
const motionMemory = { picture: null, object: null };
const MOTION_DEFAULT = { picture: { motion: 'sway', sway: 12 }, object: { motion: 'turntable', sway: 30 } };

function selectSource(id, extra = {}) {
  const from = kindOf(state.object);
  const to = kindOf(id);
  const patch = { object: id, upAxis: id === 'custom' ? loaded.model.upAxis : 'y', ...extra };
  if (from !== to) {
    motionMemory[from] = { motion: state.motion, sway: state.sway };
    Object.assign(patch, motionMemory[to] || MOTION_DEFAULT[to]);
  }
  const same = state.object === id;
  store.set(patch);
  if (same) showSource(); // same slot, new file
}

const thumbs = new Map();
function sampleThumb(id) {
  if (!thumbs.has(id)) thumbs.set(id, thumbnail(sampleCanvas(id)));
  return thumbs.get(id);
}

const tile = ({ id, name, thumb }) =>
  el(
    'button',
    { type: 'button', class: 'tile', title: name, 'aria-pressed': String(state.object === id), onclick: () => selectSource(id) },
    [el('img', { src: thumb, alt: '' }), el('span', { text: name })],
  );

const objectRow = ({ id, name }) =>
  el('button', {
    type: 'button',
    class: 'object',
    title: name,
    text: name,
    'aria-pressed': String(state.object === id),
    onclick: () => selectSource(id),
  });

// The owner's own files sit apart from the built-in samples and objects.
function renderRail() {
  $('opened').hidden = !loaded.picture && !loaded.model;
  $('opened-pictures').replaceChildren(
    ...(loaded.picture ? [tile({ id: 'image', name: loaded.picture.name, thumb: loaded.picture.thumb })] : []),
  );
  $('opened-models').replaceChildren(...(loaded.model ? [objectRow({ id: 'custom', name: loaded.model.name })] : []));
  $('pictures').replaceChildren(...SAMPLES.map(([id, name]) => tile({ id, name, thumb: sampleThumb(id) })));
  $('objects').replaceChildren(...OBJECTS.map(([id, label]) => objectRow({ id, name: titleCase(label) })));
}

const isModelFile = (file) => MODEL_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase());

// One entry point for everything that is dropped or picked: a 3D model
// (possibly with its side files) or a picture.
async function loadFiles(files) {
  if (!files.length || busy) return;
  const picture = !files.some(isModelFile) && files.find(isImageFile);
  toast(picture ? 'Opening picture…' : 'Opening model…', 0);
  try {
    if (picture) {
      const source = await fileToCanvas(picture, 2048);
      loaded.picture = { name: picture.name, canvas: source, thumb: thumbnail(source) };
      selectSource('image');
      renderRail();
      toast(`Opened ${picture.name}`);
      return;
    }
    const { object, name, zUp } = await loadModelFiles(files);
    object.userData.keep = true;
    loaded.model = { name, object, upAxis: zUp ? 'z' : 'y' };
    selectSource('custom');
    renderRail();
    toast(`Opened ${name}`);
  } catch (error) {
    console.error(error);
    toast(`Could not open the file. ${error.message}`, 6000, true);
  }
}

// No `accept` filter on purpose: mobile file pickers grey out .glb / .gltf
// because they have no registered type there. Validation happens on load.
const fileModel = $('file-model');
const openButton = $('open');
openButton.append(el('span', { class: 'glyph', html: GLYPHS.open }), el('span', { text: 'Open file…' }));
openButton.addEventListener('click', () => fileModel.click());
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

// ---------- top bar ----------

// The two looks are always on show. A point cloud needs a picture, so choosing
// it while a 3D object is on stage switches to a picture instead of refusing.
const lookColours = { points: null, raster: null };

function lookPatch(look) {
  const current = pointMode() ? 'points' : 'raster';
  const patch = { render: look };
  if (current === look) return patch;
  lookColours[current] = { pairing: state.pairing, ink: state.ink, bg: state.bg };
  if (lookColours[look]) Object.assign(patch, lookColours[look]);
  else if (look === 'points' && !inkFromLights(state)) {
    // points glow on a dark ground
    const dark = PAIRINGS.length - 1;
    Object.assign(patch, { pairing: dark, ink: PAIRINGS[dark].ink, bg: PAIRINGS[dark].bg });
  }
  return patch;
}

function setLook(look) {
  if (look === 'points' && !isPicture(state)) {
    const id = loaded.picture ? 'image' : DEFAULTS.object;
    selectSource(id, lookPatch('points'));
    toast(`A point cloud needs a picture. Showing ${sourceName(id)}.`, 4200);
    return;
  }
  store.set(lookPatch(look));
}

$('looks').append(
  bindControl(
    {
      type: 'segment',
      bare: true,
      class: 'seg-looks',
      label: 'Look',
      value: (s) => (isPointCloud(s) ? 'points' : 'raster'),
      onSelect: setLook,
      options: [
        ['points', 'Point cloud', GLYPHS.points],
        ['raster', 'Shape raster', GLYPHS.raster],
      ],
    },
    store,
  ),
);

const iconButton = (glyph, label, onclick) =>
  el('button', { type: 'button', class: 'icon-btn', title: label, 'aria-label': label, html: glyph, onclick });

const undoButton = iconButton(GLYPHS.undo, 'Undo (Ctrl / ⌘ Z)', () => {
  store.undo();
  syncHistory();
});
const redoButton = iconButton(GLYPHS.redo, 'Redo (Shift Ctrl / ⌘ Z)', () => {
  store.redo();
  syncHistory();
});
$('history').append(undoButton, redoButton);
const syncHistory = () => {
  undoButton.disabled = !store.canUndo();
  redoButton.disabled = !store.canRedo();
};

// ---------- canvas bar ----------

const VIEW_BUTTONS = [
  ['front', 'Front'],
  ['three', '3/4'],
  ['side', 'Side'],
  ['top', 'Top'],
  ['hero', 'Hero'],
];

const barGroup = (label, ...controls) => el('div', { class: 'bar-group' }, [el('span', { class: 'bar-label', text: label }), ...controls]);
const toneDot = (tone) => `<i class="tone tone-${tone}"></i>`;

const playButton = iconButton(GLYPHS.play, 'Play (Space)', () => store.set({ play: !state.play }));
const zoomRange = el('input', { type: 'range', min: 0.4, max: 4, step: 0.01, 'aria-label': 'Zoom' });
zoomRange.addEventListener('input', () => store.set({ zoom: Number(zoomRange.value) }));
zoomRange.addEventListener('dblclick', () => store.set({ zoom: 1 }));

$('canvasbar').append(
  barGroup(
    'Frame',
    bindControl(
      { type: 'segment', bare: true, key: 'aspect', label: 'Frame format', options: Object.keys(ASPECTS).map((a) => [a, a]) },
      store,
    ),
  ),
  barGroup(
    'View',
    el(
      'div',
      { class: 'seg', role: 'group', 'aria-label': 'Camera view' },
      VIEW_BUTTONS.map(([id, label], i) =>
        el('button', { type: 'button', class: 'seg-btn', text: label, title: `${label} view (${i + 1})`, onclick: () => stage.setView(id) }),
      ),
    ),
  ),
  barGroup('Zoom', zoomRange),
  playButton,
  barGroup(
    'Surround',
    bindControl(
      {
        type: 'segment',
        bare: true,
        iconOnly: true,
        key: 'surround',
        label: 'Tone around the canvas',
        options: [
          ['dark', 'Dark surround', toneDot('dark')],
          ['grey', 'Grey surround', toneDot('grey')],
          ['light', 'Light surround', toneDot('light')],
        ],
      },
      store,
    ),
  ),
);

function syncChrome() {
  viewport.dataset.surround = state.surround;
  zoomRange.value = state.zoom;
  zoomRange.style.setProperty('--fill', `${((state.zoom - 0.4) / 3.6) * 100}%`);
  playButton.innerHTML = state.play ? GLYPHS.pause : GLYPHS.play;
  const label = state.play ? 'Pause (Space)' : 'Play (Space)';
  playButton.title = label;
  playButton.setAttribute('aria-label', label);
  syncHistory();
}

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
  const name = sourceName().replace(/\.[^.]+$/, '');
  return `rastr-${name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'asset'}`;
}

async function runExport(kind) {
  if (busy) return;
  const jobs = { png: exportPNG, svg: exportSVG, gif: exportGIF, mp4: exportMP4 };
  const animated = kind === 'gif' || kind === 'mp4';
  busy = true;
  abortController = new AbortController();
  if (animated) {
    $('progress-label').textContent = `Rendering ${kind.toUpperCase()} 0%`;
    $('progress-bar').style.setProperty('--p', 0);
    $('progress').hidden = false;
  }
  try {
    const result = await jobs[kind](app, {
      signal: abortController.signal,
      onProgress: (p) => {
        const pct = Math.round(p * 100);
        $('progress-label').textContent = `Rendering ${kind.toUpperCase()} ${pct}%`;
        $('progress-bar').style.setProperty('--p', pct / 100);
      },
    });
    $('progress').hidden = true;
    if ((await download(result.blob, `${fileBase()}.${result.ext}`)) === 'declined') {
      toast('Export cancelled');
      return;
    }
    const mb = result.blob.size / 1048576;
    const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(result.blob.size / 1024))} KB`;
    toast(`Saved ${result.ext.toUpperCase()} · ${result.info} · ${size}`, 4200);
  } catch (error) {
    if (error.name === 'AbortError') toast('Export cancelled');
    else {
      console.error(error);
      toast(`Export failed. ${error.message}`, 7000, true);
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
    toast('Preset loaded');
  } catch (error) {
    toast(`Could not load the preset. ${error.message}`, 6000, true);
  }
}
filePreset.addEventListener('change', () => {
  if (filePreset.files[0]) loadPresetFile(filePreset.files[0]);
  filePreset.value = '';
});

// The depth model needs to download its weights, which neither the single-file
// build nor a claude.ai artifact can do, so the feature is left out there.
const loadDepthModule = import.meta.env.MODE === 'single' || hosted ? null : () => import('./depth.js');

async function estimateDepth() {
  if (busy || !stage.image) return;
  busy = true;
  abortController = new AbortController();
  const label = $('progress-label');
  const bar = $('progress-bar');
  label.textContent = 'Loading the depth model';
  bar.style.setProperty('--p', 0);
  $('progress').hidden = false;
  try {
    const { estimateDepth: run } = await loadDepthModule();
    const map = await run(stage.image.canvas, {
      signal: abortController.signal,
      onStage(name, progress) {
        if (name === 'download') {
          const pct = Math.round(progress * 100);
          label.textContent = `Downloading the depth model ${pct}%`;
          bar.style.setProperty('--p', pct / 100);
        } else {
          label.textContent = 'Estimating depth. This can take a minute.';
          bar.style.setProperty('--p', 1);
        }
      },
    });
    stage.setDepthMap(map);
    if (state.ptDepthDir !== 'bright') store.set({ ptDepthDir: 'bright' }); // the map is white = near
    toast('Depth estimated');
  } catch (error) {
    if (error.name === 'AbortError') toast('Depth estimation cancelled');
    else {
      console.error(error);
      toast(`Depth estimation failed. ${error.message}`, 7000, true);
    }
  } finally {
    $('progress').hidden = true;
    abortController = null;
    busy = false;
    dirty = true;
    lastTime = performance.now();
  }
}

const actions = {
  export: runExport,
  estimateDepth: loadDepthModule ? estimateDepth : null,
  async saveDepthMap() {
    const map = stage.image?.depthMap;
    if (!map) {
      toast('There is no depth map yet. Estimate or load one first.', 4000, true);
      return;
    }
    try {
      const blob = await new Promise((resolve) => map.toBlob(resolve, 'image/png'));
      if ((await download(blob, `${fileBase()}-depth.png`)) === 'saved') toast('Depth map saved');
    } catch (error) {
      toast(`Could not save the depth map. ${error.message}`, 6000, true);
    }
  },
  async savePreset() {
    try {
      const blob = new Blob([store.exportPreset()], { type: 'application/json' });
      if ((await download(blob, 'rastr-preset.json')) === 'saved') toast('Preset saved');
    } catch (error) {
      toast(`Could not save the preset. ${error.message}`, 6000, true);
    }
  },
  loadPreset: () => filePreset.click(),
  loadDepthMap: () => fileDepth.click(),
  clearDepthMap() {
    stage.setDepthMap(null);
    dirty = true;
    toast('Depth is guessed from brightness again');
  },
  addIcon() {
    if (state.icons.length >= MAX_ICONS) toast(`${MAX_ICONS} icons is the limit. Remove one first.`, 4000, true);
    else fileIcon.click();
  },
  removeIcon(id) {
    const patch = { icons: state.icons.filter((icon) => icon.id !== id) };
    for (let level = 1; level <= 4; level++) {
      if (state[`shape${level}`] === `icon:${id}`) patch[`shape${level}`] = DEFAULTS[`shape${level}`];
    }
    store.set(patch);
    toast('Icon removed. Undo brings it back.');
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
    toast('Depth map loaded');
  } catch (error) {
    toast(`Could not load the depth map. ${error.message}`, 6000, true);
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
    toast('Icon added and set as the shape of level 4');
  } catch (error) {
    toast(`Could not add the icon. ${error.message}`, 6000, true);
  }
});

// ---------- wiring ----------

buildPanel($('panel'), createSchema(store, actions), store);

let shownKind = null;
function frameSource() {
  // a picture is seen head-on, an object from three quarters
  const kind = kindOf(state.object);
  if (kind === shownKind) return;
  shownKind = kind;
  stage.setView(kind === 'picture' ? 'front' : 'three', false);
}

store.subscribe((keys) => {
  if (keys.includes('object')) {
    showSource();
    frameSource();
    renderRail();
  }
  if (keys.includes('icons')) ensureIcons(state.icons, () => (dirty = true));
  if (keys.includes('upAxis')) stage.setUpAxis(state.upAxis);
  if (keys.includes('aspect')) fitCanvas();
  if (keys.includes('zoom') && Math.abs(stage.zoom - state.zoom) > 0.004) stage.setZoom(state.zoom);
  syncChrome();
  dirty = true;
  statsStale = true; // refreshed after the next render, once the new grid exists
});

stage.controls.addEventListener('change', () => {
  const zoom = Math.round(stage.zoom * 100) / 100;
  if (Math.abs(zoom - state.zoom) > 0.004) store.set({ zoom }, { history: false });
});

function resetLook() {
  const keep = new Set(['object', 'upAxis', 'icons', 'render', 'surround', 'motion', 'sway']);
  store.reset(Object.keys(state).filter((k) => !keep.has(k)));
  stage.setView(kindOf(state.object) === 'picture' ? 'front' : 'three');
  toast('Look reset to defaults');
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

  if (mod && (key === 'z' || key === 'y') && !typing) {
    e.preventDefault();
    const redo = key === 'y' || e.shiftKey;
    const done = redo ? store.redo() : store.undo();
    if (!done) toast(redo ? 'Nothing to redo' : 'Nothing to undo', 1200);
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

showSource();
frameSource();
ensureIcons(state.icons, () => (dirty = true));
stage.setZoom(state.zoom);
renderRail();
syncChrome();
fitCanvas();
requestAnimationFrame(frame);

// Handy for debugging and automated checks.
window.rastr = { store, stage, app, selectSource, setLook };
