import * as THREE from 'three';
import type { Obstacle } from './region-collision';
import type { RegionStamp, RegionWorld } from './regions';

export interface SceneKitOptions {
  /** Sky and fog colour; districts pick their own daylight. */
  background: string;
  fogNear: number;
  fogFar: number;
  sun?: { x: number; y: number; z: number; color?: string; intensity?: number };
  shadow?: { extent: number; far: number };
  hemisphere?: { sky: string; ground: string; intensity: number };
}

/**
 * Shared primitives for authored districts: tracked geometry and materials,
 * axis-aligned colliders, canvas signs and the instanced-batch/dispose pass.
 * Marina, Raffles and Queenstown predate this and keep their own copies.
 */
export function createSceneKit(options: SceneKitOptions) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);
  scene.fog = new THREE.Fog(options.background, options.fogNear, options.fogFar);
  const sky = options.hemisphere ?? { sky: '#f1f8ff', ground: '#787366', intensity: 1.8 };
  scene.add(new THREE.HemisphereLight(sky.sky, sky.ground, sky.intensity));
  const sunOptions = options.sun ?? { x: -110, y: 190, z: 100 };
  const sun = new THREE.DirectionalLight(sunOptions.color ?? '#fff1dd', sunOptions.intensity ?? 2);
  sun.position.set(sunOptions.x, sunOptions.y, sunOptions.z);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.22;
  const extent = options.shadow?.extent ?? 230;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: options.shadow?.far ?? 540 });
  scene.add(sun);

  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const obstacles: Obstacle[] = [];
  const geo = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.push(geometry); return geometry; };
  const mat = (color: string, roughness = 0.76, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.push(material); return material;
  };
  const unit = geo(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 10));
  const crownGeo = geo(new THREE.IcosahedronGeometry(1, 1));

  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D = scene, shadow = false) {
    const mesh = new THREE.Mesh(unit, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(x: number, y: number, z: number, r: number, h: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(cylinderGeo, material);
    mesh.position.set(x, y, z); mesh.scale.set(r, h, r);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material) {
    const mesh = cylinder(0, 0, 0, r, a.distanceTo(b), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** Axis-aligned footprint. Keep these clear of every displayed road centreline. */
  function solid(x: number, z: number, w: number, d: number) {
    obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  function blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(crownGeo, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function sign(text: string, x: number, y: number, z: number, w = 16, h = 2, color = '#235749', textColor = '#fff9e8') {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 128);
    ctx.fillStyle = textColor; ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 384, 66, 740);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture }); materials.push(material);
    const panel = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), material);
    panel.position.set(x, y, z); scene.add(panel); return panel;
  }
  function tree(x: number, z: number, h: number, trunk: THREE.Material, leaf: THREE.Material) {
    box(x, h / 2, z, 0.6, h, 0.6, trunk, scene, true); solid(x, z, 0.8, 0.8);
    for (let i = 0; i < 3; i++) blob(x + (i - 1) * 1.7, h + i % 2, z, 3.6, 2.5, 3.5, leaf);
  }
  /** Simple animated bystander. Groups are never batched, so they can move. */
  function walker(x: number, z: number, shirt: THREE.Material, skin: THREE.Material, legs: THREE.Material) {
    const person = new THREE.Group();
    box(0, 1.1, 0, 0.5, 0.7, 0.35, shirt, person);
    box(0, 1.7, 0, 0.33, 0.35, 0.33, skin, person);
    for (const side of [-0.16, 0.16]) box(side, 0.4, 0, 0.16, 0.8, 0.18, legs, person);
    person.position.set(x, 0, z); scene.add(person); return person;
  }
  function car(body: THREE.Material, glass: THREE.Material, trim: THREE.Material, dark: THREE.Material) {
    const group = new THREE.Group(); scene.add(group);
    box(0, 0.7, 0, 1.8, 0.65, 3.4, body, group, true);
    box(0, 1.18, 0.1, 1.5, 0.62, 1.65, glass, group);
    box(0, 1.51, 0.1, 1.6, 0.13, 1.85, trim, group);
    box(0, 0.65, -1.74, 1.55, 0.2, 0.08, trim, group);
    const wheelGeo = geo(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10));
    for (const x of [-0.94, 0.94]) for (const z of [-1.05, 1.05]) {
      const wheel = new THREE.Mesh(wheelGeo, dark); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); group.add(wheel);
    }
    group.visible = false; return group;
  }
  function stampRings(list: readonly RegionStamp[], material: THREE.Material) {
    const stampGeo = geo(new THREE.TorusGeometry(1.15, 0.16, 5, 20));
    return list.map(stamp => {
      const mesh = new THREE.Mesh(stampGeo, material);
      mesh.position.set(stamp.x, 2.2, stamp.z); scene.add(mesh); return mesh;
    });
  }

  /**
   * Merge repeated static meshes into instanced draws, then hand back the
   * region world. Anything parented to a Group stays individually animatable.
   */
  function finish({ car: carGroup, stamps, animate }: { car: THREE.Object3D; stamps: THREE.Mesh[]; animate: (time: number) => void }): RegionWorld {
    scene.userData.authoredMeshCount = scene.children.filter(child => child instanceof THREE.Mesh).length;
    const batches = new Map<string, THREE.Mesh[]>(), instances: THREE.InstancedMesh[] = [];
    for (const child of [...scene.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || stamps.includes(child)) continue;
      const key = `${child.geometry.uuid}:${child.material.uuid}:${child.castShadow}:${child.receiveShadow}`;
      const batch = batches.get(key) ?? []; batch.push(child); batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      if (batch.length < 2) continue;
      const merged = new THREE.InstancedMesh(batch[0].geometry, batch[0].material, batch.length);
      merged.castShadow = batch[0].castShadow; merged.receiveShadow = batch[0].receiveShadow;
      batch.forEach((mesh, index) => { mesh.updateMatrix(); merged.setMatrixAt(index, mesh.matrix); scene.remove(mesh); });
      merged.computeBoundingSphere(); scene.add(merged); instances.push(merged);
    }
    return {
      scene, obstacles, car: carGroup, stamps,
      animate(time: number) {
        stamps.forEach((stamp, index) => {
          stamp.rotation.y = time * 0.7;
          stamp.position.y = 2.2 + Math.sin(time * 2 + index) * 0.2;
        });
        animate(time);
      },
      dispose() {
        instances.forEach(mesh => mesh.dispose());
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        textures.forEach(texture => texture.dispose());
        sun.shadow.dispose();
      },
    };
  }

  return { scene, obstacles, geo, mat, box, cylinder, beam, blob, solid, sign, tree, walker, car, stampRings, finish, THREE };
}
export type SceneKit = ReturnType<typeof createSceneKit>;
