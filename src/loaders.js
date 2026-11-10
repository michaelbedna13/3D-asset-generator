// Loads user models. Accepts a single file (.glb / .gltf / .obj / .stl) or a
// whole dropped set (.gltf + .bin + textures), resolved through blob URLs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'stl'];

const extension = (name) => name.split('.').pop().toLowerCase();

export async function loadModelFiles(fileList) {
  const files = [...fileList];
  const main = files.find((f) => MODEL_EXTENSIONS.includes(extension(f.name)));
  if (!main) throw new Error('Unsupported file – use .glb, .gltf, .obj or .stl');

  const urls = new Map(files.map((f) => [f.name, URL.createObjectURL(f)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const name = decodeURIComponent(url.split(/[\\/]/).pop().split('?')[0]);
    return urls.get(name) || url;
  });

  try {
    // The main file is parsed from memory; only side files (.bin, textures)
    // referenced by a .gltf / .obj go through the blob URL map.
    const ext = extension(main.name);
    let object;
    if (ext === 'glb' || ext === 'gltf') {
      const draco = new DRACOLoader(manager); // decoder is bundled with three
      const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
      try {
        object = (await loader.parseAsync(await main.arrayBuffer(), '')).scene;
      } finally {
        draco.dispose();
      }
    } else if (ext === 'obj') {
      object = new OBJLoader(manager).parse(await main.text());
    } else {
      const geometry = new STLLoader(manager).parse(await main.arrayBuffer());
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    }
    let meshes = 0;
    object.traverse((o) => {
      if (o.isMesh) meshes++;
    });
    if (!meshes) throw new Error('The file contains no meshes');
    return { object, name: main.name, zUp: ext === 'stl' };
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}
