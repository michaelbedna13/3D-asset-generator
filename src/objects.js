// Built-in procedural models, so the tool is useful before any file is loaded.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function kit() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const group = new THREE.Group();
  const add = (geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };
  return { group, add };
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 32, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const faceted = (geometry) => {
  const g = geometry.toNonIndexed();
  g.computeVertexNormals();
  return g;
};

function knot() {
  const { group, add } = kit();
  add(new THREE.TorusKnotGeometry(1, 0.36, 240, 36, 2, 3));
  return group;
}

function rocket() {
  const { group, add } = kit();
  const profile = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    profile.push(new THREE.Vector2(0.5 * Math.sin((t * Math.PI) / 2) ** 0.85, 2 - t * 1.15));
  }
  profile.push(new THREE.Vector2(0.5, -0.7), new THREE.Vector2(0.38, -1.05), new THREE.Vector2(0, -1.05));
  add(new THREE.LatheGeometry(profile, 48));
  add(cyl(0.2, 0.34, 0.34, 32, true), 0, -1.2, 0);
  add(cyl(0.515, 0.515, 0.09, 48), 0, 0.2, 0);

  const fin = new THREE.Shape();
  fin.moveTo(0.44, -0.15);
  fin.lineTo(1.08, -1.2);
  fin.lineTo(1.08, -1.5);
  fin.lineTo(0.4, -0.98);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.09, bevelEnabled: false });
  finGeo.translate(0, 0, -0.045);
  for (let i = 0; i < 3; i++) add(finGeo, 0, 0, 0, 0, (i / 3) * Math.PI * 2 + Math.PI / 2, 0);

  add(new THREE.TorusGeometry(0.17, 0.05, 14, 36), 0, 0.72, 0.49);
  add(cyl(0.15, 0.15, 0.04, 32), 0, 0.72, 0.48, Math.PI / 2);
  return group;
}

function tower() {
  const { group, add } = kit();
  const tiers = [
    [1.15, 0.45, 0.95],
    [0.92, 1.25, 0.76],
    [0.72, 0.9, 0.6],
    [0.52, 0.6, 0.44],
    [0.34, 0.36, 0.3],
  ];
  let y = 0;
  tiers.forEach(([w, h, d], tier) => {
    add(box(w, h, d), 0, y + h / 2, 0);
    if (tier > 0 && tier < 4) {
      // vertical ribs give the facade some texture for the occlusion pass
      const ribs = 4 - tier + 2;
      for (let i = 0; i < ribs; i++) {
        const x = ((i + 0.5) / ribs - 0.5) * w * 0.86;
        add(box(0.05, h * 0.96, d + 0.07), x, y + h / 2, 0);
        const z = ((i + 0.5) / ribs - 0.5) * d * 0.86;
        add(box(w + 0.07, h * 0.96, 0.05), 0, y + h / 2, z);
      }
    }
    y += h;
  });
  add(box(0.5, 0.7, 1.25), 0, 0.35, 0);
  add(cyl(0.09, 0.14, 0.3, 16), 0, y + 0.15, 0);
  add(cyl(0.012, 0.05, 0.9, 12), 0, y + 0.75, 0);
  return group;
}

function bridge() {
  const { group, add } = kit();
  const towerX = 1.25;
  const end = 2.35;
  const top = 1.45;
  const cableZ = 0.3;
  add(box(end * 2, 0.11, 0.76), 0, 0, 0);
  add(box(end * 2, 0.16, 0.06), 0, -0.1, 0.33);
  add(box(end * 2, 0.16, 0.06), 0, -0.1, -0.33);

  const cableY = (x) => {
    const ax = Math.abs(x);
    if (ax <= towerX) return 0.28 + (top - 0.28) * (ax / towerX) ** 2;
    const t = (ax - towerX) / (end - towerX);
    return top + (0.08 - top) * t - 0.18 * Math.sin(Math.PI * t);
  };

  for (const side of [-1, 1]) {
    const x = side * towerX;
    for (const z of [-cableZ, cableZ]) add(box(0.15, top + 0.75, 0.15), x, (top - 0.75) / 2 + 0.03, z);
    for (const y of [1.36, 0.9, 0.42, -0.45]) add(box(0.13, 0.11, cableZ * 2), x, y, 0);
    add(box(0.42, 0.14, 0.95), x, -0.78, 0);
  }

  for (const z of [-cableZ, cableZ]) {
    const points = [];
    for (let i = 0; i <= 96; i++) {
      const x = -end + (i / 96) * end * 2;
      points.push(new THREE.Vector3(x, cableY(x), z));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 192, 0.032, 8));
    for (let x = -end + 0.18; x < end; x += 0.18) {
      if (Math.abs(Math.abs(x) - towerX) < 0.09) continue;
      const h = cableY(x) - 0.05;
      if (h < 0.08) continue;
      add(cyl(0.013, 0.013, h, 6), x, 0.05 + h / 2, z);
    }
  }
  return group;
}

function chair() {
  const { group, add } = kit();
  add(new RoundedBoxGeometry(1.05, 0.1, 1.05, 3, 0.03), 0, 0, 0);
  for (const x of [-0.45, 0.45]) {
    add(cyl(0.05, 0.035, 0.95, 16), x, -0.5, 0.45);
    add(cyl(0.05, 0.035, 0.95, 16), x, -0.5, -0.45);
    add(cyl(0.045, 0.05, 1.25, 16), x, 0.62, -0.47, -0.08);
    add(cyl(0.022, 0.022, 0.9, 10), x, -0.6, 0, Math.PI / 2);
  }
  add(new RoundedBoxGeometry(1.05, 0.2, 0.07, 3, 0.03), 0, 1.16, -0.52, -0.08);
  add(box(0.9, 0.07, 0.05), 0, 0.42, -0.455, -0.08);
  for (let i = 0; i < 4; i++) add(cyl(0.028, 0.028, 0.66, 10), -0.27 + i * 0.18, 0.76, -0.485, -0.08);
  return group;
}

function mug() {
  const { group, add } = kit();
  const p = [
    [0, -0.6],
    [0.5, -0.6],
    [0.56, -0.54],
    [0.56, 0.56],
    [0.535, 0.6],
    [0.5, 0.6],
    [0.48, 0.56],
    [0.48, -0.48],
    [0, -0.48],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(p, 56));
  add(new THREE.TorusGeometry(0.32, 0.075, 16, 40, Math.PI), 0.55, 0, 0, 0, 0, -Math.PI / 2);
  return group;
}

function cactus() {
  const { group, add } = kit();
  const ribbed = (radius, length, ribs) => {
    const g = new THREE.CapsuleGeometry(radius, length, 12, ribs * 8);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const k = 1 + 0.09 * Math.cos(Math.atan2(z, x) * ribs);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  add(ribbed(0.3, 1.45, 9), 0, 0.2, 0);
  add(ribbed(0.16, 0.42, 7), -0.42, -0.05, 0, 0, 0, Math.PI / 2);
  add(ribbed(0.16, 0.5, 7), -0.66, 0.26, 0);
  add(ribbed(0.15, 0.36, 7), 0.4, 0.38, 0, 0, 0, Math.PI / 2);
  add(ribbed(0.15, 0.36, 7), 0.6, 0.62, 0);
  add(cyl(0.5, 0.36, 0.55, 40), 0, -1.02, 0);
  add(cyl(0.55, 0.55, 0.13, 40), 0, -0.72, 0);
  return group;
}

function gem() {
  const { group, add } = kit();
  const sides = 10;
  add(faceted(cyl(0.58, 1, 0.36, sides)), 0, 0.42, 0);
  add(faceted(cyl(1, 1, 0.07, sides)), 0, 0.205, 0);
  add(faceted(new THREE.ConeGeometry(1, 1.2, sides)), 0, -0.43, 0, Math.PI);
  group.rotation.set(0.1, 0, 0.14);
  const wrap = new THREE.Group();
  wrap.add(group);
  return wrap;
}

function robot() {
  const { group, add } = kit();
  add(new RoundedBoxGeometry(0.95, 1, 0.62, 4, 0.1), 0, 0, 0);
  add(new RoundedBoxGeometry(0.86, 0.62, 0.62, 4, 0.12), 0, 0.93, 0);
  add(cyl(0.13, 0.13, 0.14, 20), 0, 0.56, 0);
  for (const side of [-1, 1]) {
    add(cyl(0.1, 0.1, 0.06, 24), side * 0.19, 0.98, 0.32, Math.PI / 2);
    add(cyl(0.11, 0.11, 0.1, 24), side * 0.46, 0.93, 0, 0, 0, Math.PI / 2);
    add(new THREE.CapsuleGeometry(0.11, 0.6, 8, 20), side * 0.64, 0.02, 0, 0, 0, side * 0.16);
    add(new THREE.CapsuleGeometry(0.13, 0.42, 8, 20), side * 0.23, -0.82, 0);
    add(new RoundedBoxGeometry(0.34, 0.15, 0.5, 3, 0.05), side * 0.23, -1.2, 0.07);
  }
  add(box(0.5, 0.3, 0.05), 0, 0.14, 0.31);
  add(box(0.3, 0.035, 0.05), 0, 0.76, 0.31);
  add(cyl(0.022, 0.022, 0.3, 10), 0, 1.38, 0);
  add(new THREE.SphereGeometry(0.075, 20, 14), 0, 1.57, 0);
  return group;
}

export const OBJECTS = [
  ['knot', 'KNOT', knot],
  ['rocket', 'ROCKET', rocket],
  ['tower', 'TOWER', tower],
  ['bridge', 'BRIDGE', bridge],
  ['chair', 'CHAIR', chair],
  ['mug', 'MUG', mug],
  ['cactus', 'CACTUS', cactus],
  ['gem', 'GEM', gem],
  ['robot', 'ROBOT', robot],
];

export function buildObject(id) {
  const entry = OBJECTS.find(([key]) => key === id) || OBJECTS[0];
  return entry[2]();
}
