// PNG / SVG / GIF / MP4 export. Animated formats render one seamless loop,
// frame by frame at exact phases, so the result never depends on preview speed.
import { GIFEncoder, applyPalette } from 'gifenc';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { ASPECTS } from './state.js';

const MAX_PIXELS = 16_000_000; // stays inside mobile Safari's canvas limit

export function frameSize(state, scale = 1, even = false) {
  const aspect = ASPECTS[state.aspect] || 1;
  let short = state.size * scale;
  const area = short * short * Math.max(aspect, 1 / aspect);
  if (area > MAX_PIXELS) short *= Math.sqrt(MAX_PIXELS / area);
  let W = Math.round(aspect >= 1 ? short * aspect : short);
  let H = Math.round(aspect >= 1 ? short : short / aspect);
  if (even) {
    W -= W % 2;
    H -= H % 2;
  }
  return { W, H };
}

// Inside a claude.ai artifact the page can't start a download on its own; the
// host offers a `downloads` capability instead. Everywhere else `window.claude`
// doesn't exist and a plain download link is used.
const hosted = typeof window !== 'undefined' && typeof window.claude?.use === 'function';
const hostDownloads = hosted ? window.claude.use('downloads').catch(() => null) : null;

// Resolves 'saved', or 'declined' when the viewer dismisses the host's prompt.
export async function download(blob, filename) {
  if (hosted) {
    const downloads = await hostDownloads;
    if (!downloads) throw new Error('Saving files is not available in this view');
    try {
      await downloads.save({ filename, data: blob });
      return 'saved';
    } catch (error) {
      if (error?.code === 'declined') return 'declined';
      throw new Error(error?.message || 'The file could not be saved');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'saved';
}

function makeCanvas(W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  return canvas;
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

export async function exportPNG(app) {
  const { state } = app;
  const { W, H } = frameSize(state, state.quality);
  const canvas = makeCanvas(W, H);
  app.render(canvas.getContext('2d'), W, H, app.phase, { transparent: state.alpha });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The browser could not create a PNG this large');
  return { blob, ext: 'png', info: `${W}×${H}` };
}

export async function exportSVG(app) {
  const { state } = app;
  const { W, H } = frameSize(state);
  const svg = app.svg(W, H, app.phase, { transparent: state.alpha });
  return { blob: new Blob([svg], { type: 'image/svg+xml' }), ext: 'svg', info: `${W}×${H}` };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// The artwork only ever contains the brand colours plus their anti-aliased
// blends, so the GIF palette is built analytically instead of by quantizing.
function buildPalette(state) {
  const bg = hexToRgb(state.bg);
  const inks = [hexToRgb(state.ink)];
  if (state.accentLevel) inks.push(hexToRgb(state.accent));
  const palette = [bg];
  for (const ink of inks) {
    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      palette.push(bg.map((c, k) => Math.round(c + (ink[k] - c) * t)));
    }
  }
  return palette;
}

export async function exportGIF(app, { onProgress, signal } = {}) {
  const { state } = app;
  const { W, H } = frameSize(state);
  const fps = state.gifFps;
  const frames = Math.max(1, Math.round(state.loop * fps));
  const delay = Math.round(100 / fps) * 10; // GIF timing has 10 ms resolution
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const palette = buildPalette(state);
  const gif = GIFEncoder();

  for (let i = 0; i < frames; i++) {
    checkAbort(signal);
    app.render(ctx, W, H, i / frames);
    const { data } = ctx.getImageData(0, 0, W, H);
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, W, H, i === 0 ? { palette, delay, repeat: 0 } : { delay });
    onProgress?.((i + 1) / frames);
    await nextTask();
  }
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), ext: 'gif', info: `${W}×${H} · ${frames} frames` };
}

const BITS_PER_PIXEL = { low: 0.06, medium: 0.12, high: 0.22 };

async function pickVideoCodec(base) {
  const candidates = [
    ['avc', 'avc1.640033'],
    ['avc', 'avc1.4d0033'],
    ['avc', 'avc1.42e033'],
    ['vp9', 'vp09.00.40.08'],
    ['av1', 'av01.0.08M.08'],
  ];
  for (const [container, codec] of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ ...base, codec });
      if (supported) return { container, codec };
    } catch {
      // try the next codec
    }
  }
  return null;
}

export function canExportVideo() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export async function exportMP4(app, { onProgress, signal } = {}) {
  if (!canExportVideo()) {
    throw new Error('MP4 export needs WebCodecs – use a current Chrome, Edge, Safari or Firefox');
  }
  const { state } = app;
  const { W, H } = frameSize(state, 1, true);
  const fps = state.mp4Fps;
  const frames = Math.max(1, Math.round(state.loop * fps));
  const bitrate = Math.round(
    Math.min(60e6, Math.max(1e6, W * H * fps * (BITS_PER_PIXEL[state.mp4Quality] || BITS_PER_PIXEL.high))),
  );
  const base = { width: W, height: H, bitrate, framerate: fps };
  const picked = await pickVideoCodec(base);
  if (!picked) throw new Error('This browser has no video encoder for this frame size');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.container, width: W, height: H, frameRate: fps },
    fastStart: 'in-memory',
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure({ ...base, codec: picked.codec });

  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const frameDuration = 1e6 / fps;
  try {
    for (let i = 0; i < frames; i++) {
      checkAbort(signal);
      if (failure) throw failure;
      app.render(ctx, W, H, i / frames);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDuration), duration: Math.round(frameDuration) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      onProgress?.((i + 1) / frames);
      // keep the encoder queue short so memory stays flat on long loops
      do await nextTask();
      while (encoder.encodeQueueSize > 4);
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  const codecName = { avc: 'H.264', vp9: 'VP9', av1: 'AV1' }[picked.container];
  return {
    blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    ext: 'mp4',
    info: `${W}×${H} · ${fps} fps · ${codecName}`,
  };
}
