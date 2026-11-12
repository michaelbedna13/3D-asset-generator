// Turns the sampled tone grid into leveled cells and paints them to canvas / SVG.
import { SHAPES, canvasSink, svgSink } from './shapes.js';
import { inkFromLights } from './state.js';
import { iconId, iconSprite, iconDataUrl } from './icons.js';

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
      if (grid.solid) ink = 1; // image used as a silhouette: everything covered is full ink
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

// Calls `visit(cx, cy, size)` for every cell of one level. Returns the cell count.
function eachCell(cells, s, level, W, H, visit) {
  const { cols, rows, levels, scale } = cells;
  const px = Math.min(W, H) / cells.short;
  const ox = (W - cols * px) / 2;
  const oy = (H - rows * px) / 2;
  const size = px * (1 - s.margin) * s[`size${level}`];
  let n = 0;
  for (let y = 0; y < rows; y++) {
    const cy = oy + (y + 0.5) * px;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (levels[i] !== level) continue;
      visit(ox + (x + 0.5) * px, cy, size * scale[i]);
      n++;
    }
  }
  return n;
}

// A level is drawn either with a built-in vector shape or with an uploaded icon.
function levelStyle(s, level) {
  const key = s[`shape${level}`];
  const icon = iconId(key);
  if (icon && iconSprite(icon, levelColor(s, level), 8)) return { icon };
  // An icon that is missing (removed, or still decoding) falls back to a dot.
  return { shape: SHAPES[key] || SHAPES.dot };
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
    const { icon, shape } = levelStyle(s, level);
    const color = levelColor(s, level);
    if (icon) {
      ctx.imageSmoothingQuality = 'high';
      eachCell(cells, s, level, W, H, (cx, cy, size) => {
        if (size < 0.5) return;
        ctx.drawImage(iconSprite(icon, color, size), cx - size / 2, cy - size / 2, size, size);
      });
      continue;
    }
    if (shape === SHAPES.none) continue;
    ctx.beginPath();
    if (!eachCell(cells, s, level, W, H, (cx, cy, size) => shape(sink, cx, cy, size))) continue;
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  }
}

const f = (n) => Math.round(n * 100) / 100;

export function toSVG(W, H, cells, s, { transparent = false } = {}) {
  let defs = `<clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>\n`;
  let body = '';
  for (let level = 1; level <= 4; level++) {
    const { icon, shape } = levelStyle(s, level);
    const color = levelColor(s, level);
    if (icon) {
      // Uploaded icons are bitmaps: embedded once, tinted, and instanced per cell.
      let uses = '';
      eachCell(cells, s, level, W, H, (cx, cy, size) => {
        uses += `<use xlink:href="#icon-${level}" transform="translate(${f(cx - size / 2)} ${f(cy - size / 2)}) scale(${f(size)})"/>`;
      });
      if (!uses) continue;
      defs += `<image id="icon-${level}" width="1" height="1" preserveAspectRatio="none" xlink:href="${iconDataUrl(icon, color)}"/>\n`;
      body += `<g id="level-${level}">${uses}</g>\n`;
      continue;
    }
    if (shape === SHAPES.none) continue;
    const sink = svgSink();
    if (!eachCell(cells, s, level, W, H, (cx, cy, size) => shape(sink, cx, cy, size))) continue;
    body += `<path id="level-${level}" fill="${color}" d="${sink}"/>\n`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs>\n${defs}</defs>\n` +
    (transparent ? '' : `<rect id="background" width="${W}" height="${H}" fill="${s.bg}"/>\n`) +
    `<g clip-path="url(#frame)" fill-rule="evenodd">\n${body}</g>\n</svg>\n`
  );
}
