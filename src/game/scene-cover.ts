import * as THREE from 'three';
import { firstVisibleHit } from './fps-raycast';

/** Shared rendered cover for authority, sight, blasts and map audits. Movement
 * guard volumes deliberately do not participate: rays can pass between bars. */
export function createSceneCover(scene: THREE.Scene) {
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3();
  const surfaces: THREE.Mesh[] = [];
  let refreshedAt = -Infinity;
  function trace(from: { x: number; y: number; z: number }, heading: { x: number; y: number; z: number }, range: number) {
    direction.set(heading.x, heading.y, heading.z);
    if (!Number.isFinite(range) || range < 0 || ![from.x, from.y, from.z, ...direction].every(Number.isFinite) || direction.lengthSq() < 1e-8) return undefined;
    const now = performance.now();
    if (now - refreshedAt > 250) {
      refreshedAt = now; surfaces.length = 0;
      scene.updateMatrixWorld(true);
      // Retain hidden static meshes too; visibility can change between cache
      // refreshes and is checked at query time.
      const collect = (node: THREE.Object3D) => {
        if (node.userData.arenaActorId || node.userData.fpsEffect || node.userData.vehicleKind) return;
        if (node instanceof THREE.Mesh) surfaces.push(node);
        node.children.forEach(collect);
      };
      scene.children.forEach(collect);
    }
    ray.set(origin.set(from.x, from.y, from.z), direction.normalize()); ray.near = 0; ray.far = range;
    // Detached meshes can remain in the short-lived cache; never let them block.
    return firstVisibleHit(ray, surfaces.filter(mesh => {
      for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
        if (!node.visible) return false;
        if (node === scene) return true;
      }
      return false;
    }));
  }
  return { trace,
    distance: (from: { x: number; y: number; z: number }, heading: { x: number; y: number; z: number }, range: number) => trace(from, heading, range)?.distance ?? range,
  };
}
