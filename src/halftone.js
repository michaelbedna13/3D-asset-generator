// Turns the sampled tone grid into leveled cells and paints them to canvas / SVG.
import { SHAPES, canvasSink, svgSink } from './shapes.js';
import { inkFromLights } from './state.js';

const MIN_COVERAGE = 0.06;
const TAU = Math.PI * 2;
const LIGHT_INK_GAMMA = 0.55;

// Cell size is expressed in px of a frame whose shorter side is 1024, so a look
// stays identical across every export size and aspect.
// `short` is the number of cells across the frame's shorter side; the longer
// side may overshoot by a fraction of a cell, which is centred and clipped.
export function gridDims(cell, aspect) {
  const short = Math.max(4, Math.round(1024 / cell));
  const cols = Math.ceil(short * Math.max(1, aspect) - 1e-4);
  const rows = Math.ceil(short * Math.max(1, 1 / aspect) - 1e-4);
  return { cols, rows, short };
}

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const buffers = { n: 0, levels: null, scale: null, ao: null };
function ensureBuffers(n) {
  if (buffers.n === n) return;
  buffers.n = n;
  buffers.levels = new Uint8Array(n);
  buffers.scale = new Float32Array(n);
  buffers.ao = new Float32Array(n);
}

const AO_DIRS = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, 1, 1, -1, -1, -1];

// Depth-based occlusion at grid resolution: a cell is darkened when its
// neighbours sit closer to the camera (creases, contact points, overlaps).
function computeAO(grid, ao) {
  const { cols, rows, depth, cov } = grid;
  const step = Math.max(1, Math.round(cols / 56));
  const R = 0.11; // model units – the model's bounding radius is 1
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (cov[i] < MIN_COVERAGE) {
        ao[i] = 0;
        continue;
      }
      const d = depth[i];
      let occ = 0;
      let n = 0;
      for (let ring = 1; ring <= 2; ring++) {
        for (let k = 0; k < 16; k += 2) {
          n++;
          const nx = x + AO_DIRS[k] * step * ring;
          const ny = y + AO_DIRS[k + 1] * step * ring;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (cov[j] < MIN_COVERAGE) continue;
          const diff = d - depth[j];
          if (diff <= 0) continue;
          // Ramp up to R, then fade so distant geometry doesn't cast halos.
          const falloff = diff > R ? Math.max(0, 1 - (diff - R) / (3 * R)) : 1;
          occ += Math.min(1, diff / R) * falloff;
        }
      }
      ao[i] = Math.min(1, (occ / n) * 2.4);
    }
  }
}

export function computeCells(grid, s, phase) {
  const { cols, rows, lum, cov } = grid;
  const n = cols * rows;
  ensureBuffers(n);
  const { levels, scale, ao } = buffers;

  const useAO = s.ao > 0 && grid.depth;
  if (useAO) computeAO(grid, ao);

  const lights = inkFromLights(s);
  const t = [s.l1, s.l2, s.l3, s.l4].sort((a, b) => a - b);
  const densityExp = 2 ** ((0.5 - s.density) * 4);
  const contrast = 2 ** ((s.contrast - 0.5) * 3);
  const waveAmp = s.wave * 0.45;
  const waveCos = Math.cos((s.waveAngle * Math.PI) / 180);
  const waveSin = Math.sin((s.waveAngle * Math.PI) / 180);
  const shimmer = s.shimmer * 0.4;
  const dither = s.dither * 0.35;
  let count = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const c = cov[i];
      if (c < MIN_COVERAGE) {
        levels[i] = 0;
        continue;
      }
      let l = lum[i];
      if (useAO) l *= 1 - s.ao * ao[i];
      // Dark ink covers what the light doesn't reach (linear, like print).
      // Light ink on a dark ground is lifted so a lit surface reads as solid.
      let ink = lights ? l ** LIGHT_INK_GAMMA : 1 - l;
      ink = (ink - 0.5) * contrast + 0.5;
      ink = ink <= 0 ? 0 : ink >= 1 ? 1 : ink ** densityExp;
      ink *= 1 - s.edge * (1 - c);

      const h = hash(x, y);
      if (dither) ink += (h - 0.5) * dither;
      if (waveAmp) {
        const u = (x / cols) * waveCos + (y / cols) * waveSin;
        ink += waveAmp * Math.sin(TAU * (phase - u * s.waveFreq));
      }
      if (shimmer) ink += shimmer * Math.sin(TAU * (phase * (1 + ((h * 3) | 0)) + h * 7.31));

      let level = 0;
      if (ink >= t[3]) level = 4;
      else if (ink >= t[2]) level = 3;
      else if (ink >= t[1]) level = 2;
      else if (ink >= t[0]) level = 1;
      levels[i] = level;
      if (level) {
        count++;
        const lo = t[level - 1];
        const hi = level < 4 ? t[level] : 1;
        const band = hi > lo ? Math.min(1, (ink - lo) / (hi - lo)) : 1;
        scale[i] = 1 - (1 - s.banding) * (1 - band) * 0.5;
      }
    }
  }
  return { levels, scale, count, cols, rows, short: grid.short };
}

function levelColor(s, level) {
  return s.accentLevel === level ? s.accent : s.ink;
}

function emitLevel(sink, cells, s, level, W, H) {
  const { cols, rows, levels, scale } = cells;
  const shape = SHAPES[s[`shape${level}`]] || SHAPES.dot;
  if (shape === SHAPES.none) return false;
  const px = Math.min(W, H) / cells.short;
  const ox = (W - cols * px) / 2;
  const oy = (H - rows * px) / 2;
  const size = px * (1 - s.margin) * s[`size${level}`];
  let any = false;
  for (let y = 0; y < rows; y++) {
    const cy = oy + (y + 0.5) * px;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (levels[i] !== level) continue;
      shape(sink, ox + (x + 0.5) * px, cy, size * scale[i]);
      any = true;
    }
  }
  return any;
}

export function drawCanvas(ctx, W, H, cells, s, { transparent = false } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (transparent) ctx.clearRect(0, 0, W, H);
  else {
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, W, H);
  }
  const sink = canvasSink(ctx);
  for (let level = 1; level <= 4; level++) {
    ctx.beginPath();
    if (!emitLevel(sink, cells, s, level, W, H)) continue;
    ctx.fillStyle = levelColor(s, level);
    ctx.fill('evenodd');
  }
}

export function toSVG(W, H, cells, s, { transparent = false } = {}) {
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n` +
    `<clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>\n`;
  if (!transparent) out += `<rect id="background" width="${W}" height="${H}" fill="${s.bg}"/>\n`;
  out += '<g clip-path="url(#frame)" fill-rule="evenodd">\n';
  for (let level = 1; level <= 4; level++) {
    const sink = svgSink();
    if (!emitLevel(sink, cells, s, level, W, H)) continue;
    out += `<path id="level-${level}" fill="${levelColor(s, level)}" d="${sink}"/>\n`;
  }
  return `${out}</g>\n</svg>\n`;
}
