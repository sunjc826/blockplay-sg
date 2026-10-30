import * as THREE from 'three';
import type { Obstacle } from './marina-collision';
import type { MapBounds } from './minimap';

export function rangeResupplyPoint(spawn: { x: number; z: number; yaw: number }, bounds: MapBounds, obstacles: readonly Obstacle[], vehicles: readonly { x: number; z: number }[]) {
  for (const radius of [2.4, 3.5, 5, 7]) for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75, Math.PI, .4, -.4]) {
    const angle = spawn.yaw + turn, x = spawn.x - Math.sin(angle) * radius, z = spawn.z - Math.cos(angle) * radius, pad = .9;
    if (x - pad < bounds.minX || x + pad > bounds.maxX || z - pad < bounds.minZ || z + pad > bounds.maxZ ||
      vehicles.some(v => Math.hypot(v.x - x, v.z - z) < 4) || obstacles.some(o => x + pad > o.minX && x - pad < o.maxX && z + pad > o.minZ && z - pad < o.maxZ)) continue;
    return { x, z, yaw: Math.atan2(x - spawn.x, z - spawn.z) };
  }
  return null;
}
export function createRangeResupply(scene: THREE.Scene, point: { x: number; z: number; yaw: number }) {
  const root = new THREE.Group(); root.name = 'range-resupply'; root.position.set(point.x, 0, point.z); root.rotation.y = point.yaw; scene.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const paint = new THREE.MeshStandardMaterial({ color: '#46573c', roughness: .85 }), dark = new THREE.MeshStandardMaterial({ color: '#242e28', roughness: .8 }),
    brass = new THREE.MeshStandardMaterial({ color: '#c7ab62', metalness: .4, roughness: .5 }), medic = new THREE.MeshStandardMaterial({ color: '#d7ddd1', roughness: .8 });
  materials.push(paint, dark, brass, medic);
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    const geometry = new THREE.BoxGeometry(w, h, d); geometries.push(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); root.add(mesh);
  }
  box(1.4, .7, .8, 0, .4, 0, paint); box(1.5, .1, .9, 0, .81, 0, dark);
  for (const x of [-.48, .48]) box(.08, .76, .83, x, .4, 0, brass);
  box(.18, .07, .82, 0, .74, 0, brass);
  box(.36, .22, .24, .42, .98, 0, medic); box(.18, .04, .015, .42, .98, -.127, paint); box(.04, .15, .015, .42, .98, -.13, paint);
  for (const x of [-.42, -.22]) { box(.1, .18, .1, x, .95, 0, paint); box(.03, .04, .03, x, 1.06, 0, brass); }
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#18251d'; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = '#f0d591'; ctx.font = 'bold 33px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RANGE RESUPPLY', 256, 43); ctx.font = '23px sans-serif'; ctx.fillStyle = '#e4e9df'; ctx.fillText('AMMO · GRENADES · UTILITIES', 256, 77);
  const texture = new THREE.CanvasTexture(canvas), label = new THREE.MeshBasicMaterial({ map: texture }); materials.push(label);
  box(1.16, .22, .015, 0, .46, -.414, label);
  return { root, point, dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); texture.dispose(); } };
}
