// Image handling: decoding uploads, and custom icons used as cell shapes.
//
// An uploaded icon is normalised once into a square white-on-transparent mask
// (cropped to its content). That mask is what gets stored in the settings, so
// presets carry the icon with them. For drawing, the mask is tinted with the
// ink colour and kept as a chain of halved sizes for clean downscaling.

const MASK_SIZE = 512;
export const MAX_ICONS = 6;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg', 'bmp'];

const decoded = new Map(); // id → { mask: HTMLCanvasElement, tints: Map<color, canvas[]> }
const loading = new Set();

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function isImageFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext) || (file.type.startsWith('image/') && !file.name.includes('.'));
}

async function decodeImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
  } catch {
    throw new Error('The image could not be read');
  }
  return img;
}

// Rasterises a file to a canvas whose longer side is at most `maxSide`.
// SVGs have no pixel size of their own, so they are drawn at the full size.
export async function fileToCanvas(file, maxSide) {
  const url = URL.createObjectURL(file);
  try {
    const img = await decodeImage(url);
    const isVector = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    const scale = isVector ? maxSide / Math.max(w, h) : Math.min(1, maxSide / Math.max(w, h));
    const canvas = makeCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Builds the normalised mask for an uploaded icon.
export async function createIcon(file) {
  const source = await fileToCanvas(file, MASK_SIZE);
  const { width: w, height: h } = source;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  let translucent = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) translucent++;
  const hasAlpha = translucent > (w * h) / 200;

  // An image without transparency is read as a drawing on a flat ground:
  // whatever differs in brightness from the corners becomes the shape.
  const lum = (i) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  const lightGround = corners.reduce((sum, i) => sum + lum(i), 0) / 4 > 0.5;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = hasAlpha ? px[i + 3] : Math.round((lightGround ? 1 - lum(i) : lum(i)) * 255);
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = a;
      if (a > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('The image is empty');
  ctx.putImageData(image, 0, 0);

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const scale = MASK_SIZE / Math.max(bw, bh);
  const mask = makeCanvas(MASK_SIZE, MASK_SIZE);
  const mctx = mask.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(source, minX, minY, bw, bh, (MASK_SIZE - bw * scale) / 2, (MASK_SIZE - bh * scale) / 2, bw * scale, bh * scale);

  const id = Math.random().toString(36).slice(2, 9);
  decoded.set(id, { mask, tints: new Map() });
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'icon';
  return { id, name, data: mask.toDataURL('image/png') };
}

// Decodes icons that arrived through saved settings, a preset or undo.
export function ensureIcons(list, onReady) {
  for (const icon of list) {
    if (decoded.has(icon.id) || loading.has(icon.id)) continue;
    loading.add(icon.id);
    decodeImage(icon.data)
      .then((img) => {
        const mask = makeCanvas(MASK_SIZE, MASK_SIZE);
        mask.getContext('2d').drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE);
        decoded.set(icon.id, { mask, tints: new Map() });
        onReady();
      })
      .catch(() => {})
      .finally(() => loading.delete(icon.id));
  }
}

function tintChain(id, color) {
  const entry = decoded.get(id);
  if (!entry) return null;
  let chain = entry.tints.get(color);
  if (!chain) {
    if (entry.tints.size > 6) entry.tints.clear();
    const full = makeCanvas(MASK_SIZE, MASK_SIZE);
    const ctx = full.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(entry.mask, 0, 0);
    chain = [full];
    for (let size = MASK_SIZE / 2; size >= 8; size /= 2) {
      const half = makeCanvas(size, size);
      const hctx = half.getContext('2d');
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(chain[chain.length - 1], 0, 0, size, size);
      chain.push(half);
    }
    entry.tints.set(color, chain);
  }
  return chain;
}

// The smallest pre-scaled copy that is still at least `size` px.
export function iconSprite(id, color, size) {
  const chain = tintChain(id, color);
  if (!chain) return null;
  let pick = chain[0];
  for (const canvas of chain) if (canvas.width >= size) pick = canvas;
  return pick;
}

export function iconDataUrl(id, color) {
  const chain = tintChain(id, color);
  return chain ? chain[0].toDataURL('image/png') : null;
}

export const iconId = (shapeKey) => (typeof shapeKey === 'string' && shapeKey.startsWith('icon:') ? shapeKey.slice(5) : null);
