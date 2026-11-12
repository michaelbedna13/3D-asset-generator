// Built-in sample pictures, drawn in code so the tool opens with something to
// work on. They are illustrations made for this tool, not photographs.

const W = 1600;
const H = 1100;

// Small deterministic generator: the samples look the same on every visit.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasOf(w = W, h = H) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function skyline() {
  const canvas = canvasOf();
  const g = canvas.getContext('2d');
  const random = seeded(7);

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05070d');
  sky.addColorStop(0.75, '#0d1424');
  sky.addColorStop(1, '#161b2a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const halo = g.createRadialGradient(1180, 250, 40, 1180, 250, 330);
  halo.addColorStop(0, 'rgba(120,140,230,0.55)');
  halo.addColorStop(1, 'rgba(120,140,230,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f1ecd8';
  g.beginPath();
  g.arc(1180, 250, 66, 0, Math.PI * 2);
  g.fill();

  const ground = H - 150;
  const tower = (x, w, h, warm) => {
    const top = ground - h;
    const lit = warm ? '#d79a5c' : '#9aa6c0';
    const shade = warm ? '#7c4a2d' : '#4b5672';
    g.fillStyle = lit;
    g.fillRect(x, top, w * 0.55, h);
    g.fillStyle = shade;
    g.fillRect(x + w * 0.55, top, w * 0.45, h);
    g.fillStyle = '#eee6d6';
    g.beginPath();
    g.moveTo(x - 12, top);
    g.lineTo(x + w / 2, top - h * 0.3);
    g.lineTo(x + w + 12, top);
    g.closePath();
    g.fill();
    for (let wy = top + 34; wy < ground - 40; wy += 50) {
      for (let wx = x + 16; wx < x + w - 26; wx += 40) {
        g.fillStyle = random() < 0.58 ? '#ffd684' : '#1c1a20';
        g.fillRect(wx, wy, 16, 26);
      }
    }
  };
  tower(170, 130, 290, false);
  tower(330, 190, 470, true);
  tower(560, 250, 660, true);
  tower(850, 180, 400, false);

  g.fillStyle = '#23262c';
  g.fillRect(0, ground, W, H - ground);
  g.strokeStyle = 'rgba(190,170,140,0.28)';
  g.lineWidth = 3;
  for (let i = 0; i < 70; i++) {
    const x = random() * W;
    g.beginPath();
    g.moveTo(x, ground);
    g.lineTo(x + (random() - 0.5) * 70, H);
    g.stroke();
  }
  return canvas;
}

function orbs() {
  const canvas = canvasOf();
  const g = canvas.getContext('2d');

  const back = g.createLinearGradient(0, 0, 0, H);
  back.addColorStop(0, '#0a0b0d');
  back.addColorStop(0.62, '#131518');
  back.addColorStop(0.62, '#1d1f23');
  back.addColorStop(1, '#0c0d0f');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);

  const orb = (x, y, r, light, mid, dark) => {
    // contact shadow: a flattened soft disc under the orb
    g.save();
    g.translate(x + r * 0.15, y + r * 0.96);
    g.scale(1, 0.26);
    const shadow = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.3);
    shadow.addColorStop(0, 'rgba(0,0,0,0.8)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shadow;
    g.beginPath();
    g.arc(0, 0, r * 1.3, 0, Math.PI * 2);
    g.fill();
    g.restore();

    const body = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.06, x, y, r);
    body.addColorStop(0, light);
    body.addColorStop(0.45, mid);
    body.addColorStop(1, dark);
    g.fillStyle = body;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  orb(1090, 600, 230, '#dfe8ff', '#5f7fd6', '#141a36');
  orb(520, 560, 300, '#fff1dc', '#e0803a', '#3a1508');
  orb(840, 760, 150, '#ffffff', '#cfcbc2', '#3b3833');
  return canvas;
}

// A mark with transparency, for trying the solid-shape raster and icon looks.
function mark() {
  const canvas = canvasOf(1400, 1000);
  const g = canvas.getContext('2d');
  const paint = g.createLinearGradient(160, 160, 1240, 840);
  paint.addColorStop(0, '#ff9a3c');
  paint.addColorStop(1, '#ff4f8b');
  g.fillStyle = paint;

  g.beginPath();
  g.arc(470, 500, 330, 0, Math.PI * 2);
  g.arc(470, 500, 150, 0, Math.PI * 2, true);
  g.fill('evenodd');
  g.fillRect(900, 170, 150, 660);
  g.beginPath();
  g.arc(1210, 745, 85, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

export const SAMPLES = [
  ['pic:skyline', 'Skyline', skyline],
  ['pic:orbs', 'Orbs', orbs],
  ['pic:mark', 'Mark', mark],
];

const cache = new Map();

export function sampleCanvas(id) {
  if (!cache.has(id)) {
    const entry = SAMPLES.find(([key]) => key === id) || SAMPLES[0];
    cache.set(id, entry[2]());
  }
  return cache.get(id);
}

export function sampleName(id) {
  return (SAMPLES.find(([key]) => key === id) || SAMPLES[0])[1];
}

// A small preview for the source rail.
export function thumbnail(source, size = 112) {
  const scale = size / Math.max(source.width, source.height);
  const canvas = canvasOf(Math.round(source.width * scale), Math.round(source.height * scale));
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
