import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * The primitives the supply models (food-models, utility-models) are built
 * from, at real size in metres. Materials are shared by look within one model,
 * and everything made is owned by it, so `dispose` frees the lot.
 */
export function createModelKit(name: string, seedText = name) {
  const root = new THREE.Group(), body = new THREE.Group(); root.name = name; root.add(body);
  const geometries: THREE.BufferGeometry[] = [], materials = new Map<string, THREE.Material>();
  const material = (color: string, roughness = .8, metalness = 0, opacity = 1) => {
    const key = `${color}|${roughness}|${metalness}|${opacity}`; let m = materials.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); materials.set(key, m); }
    return m;
  };
  const glow = (color: string) => { const key = `glow|${color}`; let m = materials.get(key); if (!m) { m = new THREE.MeshBasicMaterial({ color }); materials.set(key, m); } return m; };
  const mesh = (into: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); into.add(object); return object;
  };
  const box = (into: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, round = .2) =>
    mesh(into, new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * round), m, x, y, z);
  const cylinder = (into: THREE.Object3D, top: number, bottom: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, segments = 18) =>
    mesh(into, new THREE.CylinderGeometry(top, bottom, h, segments), m, x, y, z);
  const ball = (into: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const object = mesh(into, new THREE.SphereGeometry(r, 10, 8), m, x, y, z); object.scale.set(sx, sy, sz); return object;
  };
  // A dome of something heaped, its base at y.
  const dome = (into: THREE.Object3D, r: number, height: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const object = mesh(into, new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z); object.scale.y = height / r; return object;
  };
  // Where a scattered piece sits: the same every time for the same item.
  let seed = 0; for (const c of seedText) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  /** Grounded: resting on y = 0 and centred over the origin. Otherwise centred on the origin. */
  const finish = (grounded: boolean) => {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(body), centre = bounds.getCenter(new THREE.Vector3());
    body.position.set(-centre.x, grounded ? -bounds.min.y : -centre.y, -centre.z);
    return {
      root,
      /** Footprint and height of the whole model, metres. */
      size: bounds.getSize(new THREE.Vector3()),
      dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
    };
  };
  return { root, body, material, glow, mesh, box, cylinder, ball, dome, random, finish };
}
