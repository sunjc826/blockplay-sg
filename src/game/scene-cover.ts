import * as THREE from 'three';
import { isVisibleHit } from './fps-raycast';
import { createSceneRayIndex } from './scene-ray-index';
import { matrixEpoch } from './matrix-epoch';

/** Shared rendered cover for authority, sight, blasts and map audits. Movement
 * guard volumes deliberately do not participate: rays can pass between bars. */
export function createSceneCover(scene: THREE.Scene, ignore?: (node: THREE.Object3D) => boolean) {
  const ray = new THREE.Raycaster(), index = createSceneRayIndex();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3();
  const surfaces: THREE.Mesh[] = [];
  let refreshedAt = -Infinity, validated = false, validatedEpoch = -1;
  const expire = () => { validated = false; };
  // Detached meshes can remain in the short-lived cache; never let them block.
  const attachedAndVisible = (mesh: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
      if (!node.visible) return false;
      if (node === scene) return true;
    }
    return false;
  };
  /** Physical trace includes glazing; bullet and sight distances below omit it. */
  function trace(from: { x: number; y: number; z: number }, heading: { x: number; y: number; z: number }, range: number, includeFoliage = false, includeGlass = true) {
    direction.set(heading.x, heading.y, heading.z);
    if (!Number.isFinite(range) || range < 0 || ![from.x, from.y, from.z, ...direction].every(Number.isFinite) || direction.lengthSq() < 1e-8) return undefined;
    const now = performance.now();
    if (now - refreshedAt > 250) {
      refreshedAt = now; surfaces.length = 0;
      scene.updateMatrixWorld(true);
      // Retain hidden static meshes too; visibility can change between cache
      // refreshes and is checked at query time.
      const collect = (node: THREE.Object3D) => {
        if (node.userData.arenaActorId || node.userData.fpsEffect || node.userData.vehicleKind || node.userData.facilityId || ignore?.(node)) return;
        if (node instanceof THREE.Mesh) surfaces.push(node);
        node.children.forEach(collect);
      };
      scene.children.forEach(collect);
      index.setObjects(surfaces); validated = false;
    }
    // Validating every mesh is the expensive part of a query. A world matrix only changes in
    // three's matrix updates, which move the epoch, so validate after one of those, and at least
    // once per run of code (a simulation step, a frame) for geometry or instance edits.
    if (!validated || validatedEpoch !== matrixEpoch()) {
      index.refresh(); validatedEpoch = matrixEpoch();
      if (!validated) { validated = true; queueMicrotask(expire); }
    }
    ray.set(origin.set(from.x, from.y, from.z), direction.normalize()); ray.near = 0; ray.far = range;
    return index.nearestHit(ray, hit => isVisibleHit(hit, includeFoliage, includeGlass), attachedAndVisible);
  }
  return { trace,
    distance: (from: { x: number; y: number; z: number }, heading: { x: number; y: number; z: number }, range: number) => trace(from, heading, range, false, false)?.distance ?? range,
    sightDistance: (from: { x: number; y: number; z: number }, heading: { x: number; y: number; z: number }, range: number) => trace(from, heading, range, true, false)?.distance ?? range,
  };
}
