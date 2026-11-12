// The 3D side: scene, lights, camera and the low-resolution render that the
// halftone grid is sampled from. Nothing here is shown directly – the WebGL
// canvas stays offscreen and only its pixels are read back.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildCloud, updateCloud } from './cloud.js';
import { inkFromLights } from './state.js';

const FRAME_FOV = 26; // vertical field of view of the export frame, degrees
const TAU = Math.PI * 2;
const rad = THREE.MathUtils.degToRad;

export const VIEWS = {
  front: [0, 0],
  three: [35, 18],
  side: [90, 0],
  top: [0, 89],
  hero: [-32, -16],
};

// Light positions are in view space (x right, y up, z towards the camera), so a
// look stays the same from every camera angle. [x, y, z, intensity]
const RIGS = {
  studio: { key: [3, 4, 5, 2.7], fill: [-5, 1, 3, 0.5], rim: [-2, 3, -5, 1.3], ambient: 0.3 },
  soft: { key: [2, 5, 4, 1.4], fill: [-4, 2, 4, 0.9], rim: [0, 3, -5, 0.4], ambient: 0.8 },
  top: { key: [0.5, 6, 1.2, 3.2], fill: [0, -2, 4, 0.12], rim: [0, 2, -5, 0.3], ambient: 0.16 },
  side: { key: [6, 0.8, 1.5, 3.2], fill: [-5, 0, 2, 0.1], rim: [-3, 2, -4, 0.5], ambient: 0.12 },
  rim: { key: [-4, 3, -4, 3.4], fill: [4, 2, -4, 2.4], rim: [0, 5, -2, 0.8], ambient: 0.05 },
  flat: { key: [0, 0, 5, 0.4], fill: [0, 0, 5, 0], rim: [0, 0, -5, 0], ambient: 2.4 },
};

export class Stage {
  constructor(domElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FRAME_FOV, 1, 0.1, 50);
    this.pivot = new THREE.Group(); // animated
    this.fit = new THREE.Group(); // centres + scales the model to radius 1
    this.pivot.add(this.fit);
    this.scene.add(this.pivot);

    this.rig = new THREE.Group(); // follows camera orientation
    this.rigInner = new THREE.Group(); // user light angle + light orbit
    this.rig.add(this.rigInner);
    this.scene.add(this.rig);
    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.fill = new THREE.DirectionalLight(0xffffff, 1);
    this.rim = new THREE.DirectionalLight(0xffffff, 1);
    this.ambient = new THREE.AmbientLight(0xffffff, 1);
    this.rigInner.add(this.key, this.fill, this.rim);
    this.scene.add(this.ambient);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -1.4;
    sc.right = sc.top = 1.4;
    sc.near = 0.5;
    sc.far = 20;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;

    this.clay = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide,
    });

    this.rtColor = new THREE.WebGLRenderTarget(4, 4);
    this.rtDepth = new THREE.WebGLRenderTarget(4, 4);
    this.colorBuf = new Uint8Array(0);
    this.depthBuf = new Uint8Array(0);
    this.grid = { cols: 0, rows: 0, lum: null, cov: null, depth: null };

    this.aspect = 1;
    this.baseDistance = this.fitDistance(1);
    this.setSpherical(rad(VIEWS.three[0]), rad(VIEWS.three[1]), this.baseDistance);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.9;
    this.applyDistanceLimits();
    this.tween = null;
    this.model = null;
    this.flat = false;
    this.image = null;
    this.cloud = null;
  }

  // Distance at which the unit bounding sphere just fills the frame.
  fitDistance(aspect) {
    const v = rad(FRAME_FOV / 2);
    const h = Math.atan(Math.tan(v) * aspect);
    return 1.06 / Math.sin(Math.min(v, h));
  }

  applyDistanceLimits() {
    this.controls.minDistance = this.baseDistance / 4;
    this.controls.maxDistance = this.baseDistance / 0.4;
  }

  setSpherical(azimuth, elevation, distance) {
    const sph = new THREE.Spherical(distance, Math.PI / 2 - elevation, azimuth);
    this.camera.position.setFromSpherical(sph);
    this.camera.lookAt(0, 0, 0);
  }

  get zoom() {
    return this.baseDistance / this.camera.position.length();
  }

  setZoom(zoom) {
    this.camera.position.setLength(this.baseDistance / zoom);
  }

  setAspect(aspect) {
    if (aspect === this.aspect) return;
    const zoom = this.zoom;
    this.aspect = aspect;
    this.baseDistance = this.fitDistance(aspect);
    this.applyDistanceLimits();
    this.setZoom(zoom);
    if (this.flat) this.setUpAxis('y'); // a picture is fitted to the frame's shape
  }

  setView(name, animate = true) {
    const [az, el] = VIEWS[name] || VIEWS.three;
    const from = new THREE.Spherical().setFromVector3(this.camera.position);
    const to = { theta: rad(az), phi: Math.PI / 2 - rad(el) };
    // Take the short way around.
    let dTheta = to.theta - from.theta;
    dTheta = ((((dTheta + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    if (!animate) {
      this.setSpherical(to.theta, rad(el), from.radius);
      return;
    }
    this.tween = { from, dTheta, dPhi: to.phi - from.phi, start: performance.now(), duration: 520 };
  }

  // Advances camera easing / damping. Returns true when the picture changed.
  update(now) {
    let changed = false;
    if (this.tween) {
      const { from, dTheta, dPhi, start, duration } = this.tween;
      const k = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - k) ** 3;
      const sph = new THREE.Spherical(from.radius, from.phi + dPhi * e, from.theta + dTheta * e);
      sph.makeSafe();
      this.camera.position.setFromSpherical(sph);
      if (k >= 1) this.tween = null;
      changed = true;
    }
    return this.controls.update() || changed;
  }

  // A picture becomes an unlit, double-sided card in the scene, so camera,
  // motion and export work on it exactly as they do on a model.
  setImage(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const k = 2 / Math.max(canvas.width, canvas.height);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(canvas.width * k, canvas.height * k),
      // NoBlending writes the texture's own alpha straight into the render
      // target, which is what the sampler reads as coverage.
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, blending: THREE.NoBlending }),
    );
    this.setModel(card, 'y', true);
    this.image = { canvas, scale: k, depthMap: null };
  }

  // Replaces the brightness-derived depth of the point cloud with a real depth
  // map (white = near). Pass null to go back to the automatic one.
  setDepthMap(canvas) {
    if (!this.image) return;
    this.image.depthMap = canvas;
    this.dropCloud();
  }

  dropCloud() {
    if (!this.cloud) return;
    this.cloud.removeFromParent();
    this.cloud.geometry.dispose();
    this.cloud.material.dispose();
    this.cloud = null;
  }

  // Draws the picture as a point cloud straight into a 2D context.
  renderPoints(ctx, W, H, s, phase, { transparent = false } = {}) {
    if (!this.image) return 0;
    if (!this.cloud || this.cloud.userData.target !== s.ptCount) {
      this.dropCloud();
      this.cloud = buildCloud(this.image.canvas, this.image.depthMap, s.ptCount, this.image.scale);
      this.cloud.userData.target = s.ptCount;
      this.orient.add(this.cloud);
    }
    this.applyLook(s, phase);

    const cam = this.camera;
    cam.fov = FRAME_FOV;
    cam.aspect = W / H;
    const dist = cam.position.length();
    cam.near = Math.max(0.02, dist * 0.02);
    cam.far = dist + 12;
    cam.updateProjectionMatrix();

    // Very large exports are rendered at the GPU-safe size and scaled up.
    const fit = Math.min(1, 4096 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * fit));
    const h = Math.max(1, Math.round(H * fit));
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) r.setSize(w, h, false);

    const glow = s.ptBlend === 'glow' || (s.ptBlend === 'auto' && inkFromLights(s));
    updateCloud(this.cloud, s, phase, {
      pixelsPerUnit: h / (2 * Math.tan(rad(FRAME_FOV / 2))),
      glow,
      shadowTone: !inkFromLights(s),
    });

    this.model.visible = false;
    this.cloud.visible = true;
    r.setRenderTarget(null);
    r.setClearColor(s.bg, transparent ? 0 : 1);
    r.clear();
    r.render(this.scene, cam);
    r.setClearColor(0x000000, 0);
    this.cloud.visible = false;
    this.model.visible = true;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(r.domElement, 0, 0, W, H);
    return this.cloud.userData.count;
  }

  setModel(object, upAxis = 'y', flat = false) {
    this.flat = flat;
    this.dropCloud();
    this.image = null;
    if (this.model) {
      this.fit.clear();
      // a loaded model flagged `keep` stays alive so it can be shown again
      if (!this.model.userData.keep) disposeObject(this.model);
    }
    this.model = object;
    this.orient = new THREE.Group();
    this.orient.add(object);
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    });
    this.fit.add(this.orient);
    this.setUpAxis(upAxis);
  }

  setUpAxis(upAxis) {
    if (!this.orient) return;
    // Measure the model on its own, outside the animated hierarchy.
    this.fit.remove(this.orient);
    this.orient.rotation.x = upAxis === 'z' ? -Math.PI / 2 : 0;
    this.orient.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.orient);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Bounding sphere around the box centre – much tighter than the box
    // diagonal for round or diagonal shapes, so they fill the frame.
    const boxRadius = size.length() / 2 || 1;
    let r2 = 0;
    const v = new THREE.Vector3();
    this.orient.traverse((o) => {
      const pos = o.isMesh && o.geometry.attributes.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 150000));
      for (let i = 0; i < pos.count; i += step) {
        r2 = Math.max(r2, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).distanceToSquared(center));
      }
    });
    const sphere = Math.sqrt(r2);
    // Skinned or instanced meshes can sit far from their rest pose; trust the box then.
    let radius = sphere > boxRadius * 0.4 ? Math.min(sphere, boxRadius) : boxRadius;
    // A picture is fitted to the frame rectangle instead, so it fills the
    // frame edge to edge when seen from the front (the short side spans 2 units).
    if (this.flat) {
      const frameW = 2 * Math.max(1, this.aspect);
      const frameH = 2 * Math.max(1, 1 / this.aspect);
      radius = Math.max(size.x / frameW, size.y / frameH) || 1;
    }
    this.fit.scale.setScalar(1 / radius);
    this.fit.position.copy(center).multiplyScalar(-1 / radius);
    this.fit.add(this.orient);
  }

  applyLook(s, phase) {
    const rig = RIGS[s.lighting] || RIGS.studio;
    for (const name of ['key', 'fill', 'rim']) {
      const [x, y, z, intensity] = rig[name];
      this[name].position.set(x, y, z);
      this[name].intensity = intensity;
    }
    this.ambient.intensity = rig.ambient;
    this.key.castShadow = s.shadows;
    this.rigInner.rotation.y = rad(s.lightAngle) + (s.lightOrbit ? TAU * phase : 0);

    const dir = s.dir === 'left' ? 1 : -1;
    const p = this.pivot;
    p.rotation.set(0, 0, 0);
    if (s.motion === 'turntable') p.rotation.y = dir * TAU * phase;
    else if (s.motion === 'sway') p.rotation.y = dir * rad(s.sway) * Math.sin(TAU * phase);
    else if (s.motion === 'tumble') {
      p.rotation.y = dir * TAU * phase;
      p.rotation.x = rad(s.sway) * 0.6 * Math.sin(TAU * phase);
      p.rotation.z = rad(s.sway) * 0.4 * Math.cos(TAU * phase);
    }
    p.position.y = s.float * 0.12 * Math.sin(TAU * phase);
  }

  // Renders the scene at a few samples per grid cell and reduces it to
  // per-cell tone, coverage and (for occlusion) linear depth.
  sample({ cols, rows, short }, s, phase) {
    this.applyLook(s, phase);

    const cam = this.camera;
    // The grid may overshoot the frame by a fraction of a cell – widen the fov to match.
    const frameRows = short * Math.max(1, 1 / this.aspect);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(rad(FRAME_FOV / 2)) * (rows / frameRows)));
    cam.aspect = cols / rows;
    const dist = cam.position.length();
    cam.near = Math.max(0.05, dist - 1.8);
    cam.far = dist + 1.8;
    cam.updateProjectionMatrix();
    this.rig.quaternion.copy(cam.quaternion);

    const ss = Math.max(1, Math.min(4, Math.floor(640 / Math.max(cols, rows))));
    const w = cols * ss;
    const h = rows * ss;
    if (this.rtColor.width !== w || this.rtColor.height !== h) {
      this.rtColor.setSize(w, h);
      this.rtDepth.setSize(w, h);
      this.colorBuf = new Uint8Array(w * h * 4);
      this.depthBuf = new Uint8Array(w * h * 4);
    }
    const grid = this.grid;
    if (grid.cols !== cols || grid.rows !== rows || grid.short !== short) {
      grid.cols = cols;
      grid.rows = rows;
      grid.short = short;
      grid.lum = new Float32Array(cols * rows);
      grid.cov = new Float32Array(cols * rows);
      grid.depthStore = new Float32Array(cols * rows);
    }

    const r = this.renderer;
    this.scene.overrideMaterial = s.material === 'clay' && !this.flat ? this.clay : null;
    r.setRenderTarget(this.rtColor);
    r.clear();
    r.render(this.scene, cam);
    r.readRenderTargetPixels(this.rtColor, 0, 0, w, h, this.colorBuf);

    const wantDepth = s.ao > 0 && !this.flat;
    if (wantDepth) {
      this.scene.overrideMaterial = this.depthMaterial;
      r.setRenderTarget(this.rtDepth);
      r.clear();
      r.render(this.scene, cam);
      r.readRenderTargetPixels(this.rtDepth, 0, 0, w, h, this.depthBuf);
    }
    this.scene.overrideMaterial = null;
    r.setRenderTarget(null);
    grid.depth = wantDepth ? grid.depthStore : null;
    grid.solid = this.flat && s.imageTone === 'solid';

    const cb = this.colorBuf;
    const db = this.depthBuf;
    const { near, far } = cam;
    const samples = ss * ss;
    const exposure = s.exposure;
    for (let gy = 0; gy < rows; gy++) {
      const baseY = (rows - 1 - gy) * ss; // WebGL rows are bottom-up
      for (let gx = 0; gx < cols; gx++) {
        let sumA = 0;
        let sumL = 0;
        let sumD = 0;
        let nD = 0;
        for (let sy = 0; sy < ss; sy++) {
          let o = ((baseY + sy) * w + gx * ss) * 4;
          for (let sx = 0; sx < ss; sx++, o += 4) {
            const a = cb[o + 3];
            if (!a) continue;
            sumA += a;
            sumL += a * (0.2126 * cb[o] + 0.7152 * cb[o + 1] + 0.0722 * cb[o + 2]);
            if (wantDepth) {
              const d = db[o] / 256 + db[o + 1] / 65536 + db[o + 2] / 16777216;
              if (d > 0) {
                sumD += d;
                nD++;
              }
            }
          }
        }
        const i = gy * cols + gx;
        grid.cov[i] = sumA / (255 * samples);
        grid.lum[i] = sumA ? Math.min(1, (sumL / (sumA * 255)) * exposure) : 0; // linear light
        // window depth → linear distance from the camera
        if (wantDepth) grid.depthStore[i] = nD ? (near * far) / (far - (far - near) * (sumD / nD)) : far;
      }
    }
    return grid;
  }
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materials) {
      for (const value of Object.values(m)) if (value && value.isTexture) value.dispose();
      m.dispose();
    }
  });
}
