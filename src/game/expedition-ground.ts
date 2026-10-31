import * as THREE from 'three';
import { visibleHits } from './fps-raycast';
import { MAX_STEP_HEIGHT } from './vertical-movement';
import type { LootGround } from './expedition-loot';

/** Static rendered floors, including paving that sits above the movement plane. */
export function createLootGround(scene: THREE.Scene): LootGround {
  const floors: THREE.Mesh[] = [];
  const collect = (node: THREE.Object3D) => {
    if (node.userData.fpsEffect || node.userData.arenaActorId || node.userData.vehicleKind || node.userData.fpsWater) return;
    if (node instanceof THREE.Mesh) floors.push(node);
    node.children.forEach(collect);
  };
  scene.updateMatrixWorld(true); scene.children.forEach(collect);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3(), transform = new THREE.Matrix4(), instance = new THREE.Matrix4();
  return (x, z, height) => {
    // Start just above the feet, below overhead floors and roofs. Scattered
    // items trace separately, so a kerb, ramp or ledge can change their height.
    ray.ray.origin.set(x, height + MAX_STEP_HEIGHT, z);
    for (const hit of visibleHits(ray, floors, Infinity)) {
      if (!hit.face) continue;
      transform.copy(hit.object.matrixWorld);
      if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
        hit.object.getMatrixAt(hit.instanceId, instance); transform.multiply(instance);
      }
      normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(transform));
      if (normal.y > .5) return hit.point.y;
    }
    return height;
  };
}
