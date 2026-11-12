// Point-cloud style for pictures: every sample of the image becomes a small
// glowing point, pushed forward or back by a depth value, that can drift,
// scatter and gather again in a seamless loop.
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  attribute vec3 aColor;   // sRGB 0..1, straight from the picture
  attribute vec4 aData;    // x depth 0..1, y brightness 0..1, z/w random seeds

  uniform float uPhase;    // 0..1 position in the loop
  uniform float uDepth;    // signed depth range in model units
  uniform float uScatter;  // constant dispersion
  uniform float uBurst;    // animated dispersion
  uniform float uFx;       // 0 none, 1 pulse, 2 sweep
  uniform float uDrift;
  uniform float uSize;     // point diameter in model units
  uniform float uPx;       // pixels per model unit at distance 1
  uniform float uCut;      // points below this tone weight are dropped
  uniform float uShadow;   // 0: bright areas carry the picture, 1: dark areas do
  uniform float uTint;     // 0: picture colours, 1: highlight colour
  uniform float uGain;
  uniform vec3 uInk;
  uniform vec2 uHalf;      // half extent of the picture in model units

  varying vec3 vColor;
  varying float vAlpha;

  const float TAU = 6.28318530718;

  void main() {
    float tone = mix(aData.y, 1.0 - aData.y, uShadow);
    // A soft, per-point threshold thins the cloud out instead of cutting a hard edge.
    float keep = smoothstep(uCut - 0.05, uCut + 0.05, tone + (aData.z - 0.5) * 0.08);

    vec3 p = position;
    p.z += (aData.x - 0.5) * uDepth;

    // drift: each point circles its own spot
    float a = TAU * (uPhase + aData.z);
    float b = TAU * (uPhase * 2.0 + aData.w);
    p += uDrift * 0.02 * vec3(sin(a), cos(b), sin(a + b));

    // scatter / gather: a direction of its own for every point
    float s1 = aData.z * 91.7 + aData.w * 13.3;
    vec3 dir = normalize(vec3(sin(s1 * 7.1), cos(s1 * 5.3), sin(s1 * 3.7) + 0.35)
      + 0.6 * vec3(position.xy / max(uHalf.x, uHalf.y), 0.0));
    // most points stay close and a few fly far, so the picture stays readable
    float reach = 0.06 + 1.5 * aData.w * aData.w * aData.w;

    float delay = uFx > 1.5 ? (position.x / uHalf.x * 0.5 + 0.5) * 0.6 : aData.z * 0.35;
    float t = fract(uPhase - delay);
    float envelope = uFx > 0.5 ? pow(sin(3.14159265 * t), 6.0) : 0.0;
    float spread = uScatter * 0.7 + uBurst * 2.4 * envelope;
    p += dir * reach * spread;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float raw = uSize * (0.55 + 0.9 * aData.w) * uPx / max(0.05, -mv.z);
    gl_PointSize = max(raw, 1.0);

    vec3 picture = aColor * uGain;
    vec3 tinted = uInk * (0.35 + 0.65 * tone) * uGain;
    vColor = mix(picture, tinted, uTint);
    // sub-pixel points fade instead of flickering
    vAlpha = keep * min(1.0, raw * raw) * mix(1.0, 0.25 + 0.75 * tone, uTint);
    if (keep < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uSolid; // 1: crisp opaque discs (light backgrounds), 0: soft glow
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (uSolid > 0.5) {
      if (d > 1.0 || vAlpha < 0.35) discard;
      gl_FragColor = vec4(vColor, 1.0);
    } else {
      float a = smoothstep(1.0, 0.25, d) * vAlpha;
      gl_FragColor = vec4(vColor, a);
    }
  }
`;

function scaled(source, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function boxBlur(src, w, h, radius) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const pass = (from, to, len, stride, lines, lineStride) => {
    for (let line = 0; line < lines; line++) {
      const base = line * lineStride;
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += from[base + Math.min(len - 1, Math.max(0, i)) * stride];
      for (let i = 0; i < len; i++) {
        to[base + i * stride] = sum / (radius * 2 + 1);
        const add = Math.min(len - 1, i + radius + 1);
        const drop = Math.max(0, i - radius);
        sum += from[base + add * stride] - from[base + drop * stride];
      }
    }
  };
  pass(src, tmp, w, 1, h, w);
  pass(tmp, out, h, w, w, 1);
  return out;
}

// Without a depth map the picture's own brightness stands in for depth: a
// heavily smoothed copy gives the large forms, the original adds fine relief.
function depthFromBrightness(lum, w, h) {
  const radius = Math.max(2, Math.round(Math.max(w, h) / 36));
  let soft = boxBlur(lum, w, h, radius);
  soft = boxBlur(soft, w, h, radius);
  const depth = new Float32Array(w * h);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < depth.length; i++) {
    const v = soft[i] * 0.78 + lum[i] * 0.22;
    depth[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < depth.length; i++) depth[i] = (depth[i] - min) / range;
  return depth;
}

// `image` and the optional `depthMap` are canvases; `count` is the target
// number of points. The cloud spans the same rectangle as the picture card.
export function buildCloud(image, depthMap, count, cardScale) {
  const aspect = image.width / image.height;
  const cols = Math.max(8, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.max(8, Math.round(cols / aspect));
  const px = scaled(image, cols, rows);
  const n = cols * rows;

  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  }
  let depth;
  if (depthMap) {
    const dp = scaled(depthMap, cols, rows);
    depth = new Float32Array(n);
    for (let i = 0; i < n; i++) depth[i] = (0.2126 * dp[i * 4] + 0.7152 * dp[i * 4 + 1] + 0.0722 * dp[i * 4 + 2]) / 255;
  } else {
    depth = depthFromBrightness(lum, cols, rows);
  }

  const halfW = (image.width * cardScale) / 2;
  const halfH = (image.height * cardScale) / 2;
  const position = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const data = new Float32Array(n * 4);
  let k = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (px[i * 4 + 3] < 24) continue; // transparent parts of a logo carry no points
      // jitter inside the cell so the cloud never reads as a grid
      position[k * 3] = ((x + Math.random()) / cols) * 2 * halfW - halfW;
      position[k * 3 + 1] = halfH - ((y + Math.random()) / rows) * 2 * halfH;
      color[k * 3] = px[i * 4] / 255;
      color[k * 3 + 1] = px[i * 4 + 1] / 255;
      color[k * 3 + 2] = px[i * 4 + 2] / 255;
      data[k * 4] = depth[i];
      data[k * 4 + 1] = lum[i];
      data[k * 4 + 2] = Math.random();
      data[k * 4 + 3] = Math.random();
      k++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.subarray(0, k * 3), 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(color.subarray(0, k * 3), 3));
  geometry.setAttribute('aData', new THREE.BufferAttribute(data.subarray(0, k * 4), 4));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uPhase: { value: 0 },
      uDepth: { value: 0.5 },
      uScatter: { value: 0 },
      uBurst: { value: 0 },
      uFx: { value: 0 },
      uDrift: { value: 0 },
      uSize: { value: 0.006 },
      uPx: { value: 1000 },
      uCut: { value: 0 },
      uShadow: { value: 0 },
      uTint: { value: 0 },
      uGain: { value: 1 },
      uSolid: { value: 0 },
      uInk: { value: new THREE.Vector3(1, 1, 1) },
      uHalf: { value: new THREE.Vector2(halfW, halfH) },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // positions move in the shader
  points.visible = false;
  points.userData.count = k;
  return points;
}

function hexToVec(hex, target) {
  const n = parseInt(hex.slice(1), 16);
  return target.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const FX = { none: 0, pulse: 1, sweep: 2 };

// `glow` adds points up like light (dark grounds); otherwise they are opaque discs.
export function updateCloud(points, s, phase, { pixelsPerUnit, glow, shadowTone }) {
  const m = points.material;
  const u = m.uniforms;
  u.uPhase.value = phase;
  u.uDepth.value = s.ptDepth * (s.ptDepthDir === 'dark' ? -1 : 1);
  u.uScatter.value = s.ptScatter;
  u.uBurst.value = s.ptBurst;
  u.uFx.value = FX[s.ptFx] || 0;
  u.uDrift.value = s.ptDrift;
  u.uSize.value = s.ptSize * 0.012;
  u.uPx.value = pixelsPerUnit;
  u.uCut.value = s.ptCut;
  u.uShadow.value = shadowTone ? 1 : 0;
  u.uTint.value = s.ptColor === 'ink' ? 1 : 0;
  u.uGain.value = s.exposure;
  u.uSolid.value = glow ? 0 : 1;
  hexToVec(s.ink, u.uInk.value);
  m.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
  m.transparent = glow;
  m.depthTest = !glow;
  m.depthWrite = !glow;
}
