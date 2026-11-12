// Monocular depth estimation for the point cloud, in the browser.
//
// Model: Depth Anything V2 Small (Apache-2.0), 8-bit quantized ONNX export by
// the onnx-community, ~27 MB. It is downloaded from Hugging Face the first time
// it is used, then kept in the browser's cache. The picture never leaves the
// device: inference runs locally in a worker through ONNX Runtime (WebAssembly).

const MODEL_URL =
  'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/' +
  '4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx'; // pinned revision
const MODEL_BYTES = 27258801;
const CACHE = 'rastr-models-v1';
const PATCH = 14; // the network works on 14 px patches
const LONG_SIDE = 518;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let worker = null;
let modelSent = false;

async function fetchModel(onProgress, signal) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(MODEL_URL);
    if (hit) return await hit.arrayBuffer();
  } catch {
    // Cache storage can be unavailable (private windows) – download every time then.
  }
  const response = await fetch(MODEL_URL, { signal });
  if (!response.ok) throw new Error(`The depth model could not be downloaded (${response.status})`);
  const total = Number(response.headers.get('content-length')) || MODEL_BYTES;
  const reader = response.body.getReader();
  const bytes = new Uint8Array(Math.max(total, MODEL_BYTES));
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length > bytes.length) throw new Error('The depth model download was larger than expected');
    bytes.set(value, received);
    received += value.length;
    onProgress?.(Math.min(1, received / total));
  }
  const buffer = bytes.buffer.slice(0, received);
  try {
    await cache?.put(MODEL_URL, new Response(buffer.slice(0), { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    // not being able to cache is not fatal
  }
  return buffer;
}

// Resizes to the model's input (longer side 518, both sides multiples of 14)
// and returns normalised planar RGB.
function preprocess(image) {
  const scale = LONG_SIDE / Math.max(image.width, image.height);
  const width = Math.max(PATCH, Math.round((image.width * scale) / PATCH) * PATCH);
  const height = Math.max(PATCH, Math.round((image.height * scale) / PATCH) * PATCH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  // transparent parts of a logo read as black to the model
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const plane = width * height;
  const pixels = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) pixels[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return { pixels, width, height };
}

function run(message, transfer, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      // an inference cannot be interrupted, so the worker is dropped
      worker.terminate();
      worker = null;
      modelSent = false;
      reject(new DOMException('Depth estimation cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = ({ data }) => {
      signal?.removeEventListener('abort', onAbort);
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(event.message || 'The depth worker failed to start'));
    };
    worker.postMessage(message, transfer);
  });
}

// Returns a greyscale canvas, white = near, ready for Stage.setDepthMap().
// `onStage(name, progress)` reports 'download' (0..1) and 'estimate'.
export async function estimateDepth(image, { onStage, signal } = {}) {
  if (!worker) {
    worker = new Worker(new URL('./depth.worker.js', import.meta.url), { type: 'module' });
    modelSent = false;
  }
  const message = preprocess(image);
  const transfer = [message.pixels.buffer];
  if (!modelSent) {
    onStage?.('download', 0);
    message.model = await fetchModel((p) => onStage?.('download', p), signal);
    transfer.push(message.model);
  }
  if (signal?.aborted) throw new DOMException('Depth estimation cancelled', 'AbortError');
  onStage?.('estimate', 0);
  const result = await run(message, transfer, signal);
  modelSent = true;

  // The model returns relative inverse depth: larger means nearer.
  const { depth, width, height } = result;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] < min) min = depth[i];
    if (depth[i] > max) max = depth[i];
  }
  const range = max - min || 1;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);
  for (let i = 0; i < depth.length; i++) {
    const v = Math.round(((depth[i] - min) / range) * 255);
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
