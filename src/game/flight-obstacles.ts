import * as THREE from 'three';
import type { FlightObstacle } from './vehicle-rules';

/** Snapshot structures once, preserving open space under decks/viaducts.
 * Continuous ground and draped paving use the world ground sampler instead of
 * their district-sized bounding boxes, which would seal the entire low airspace. */
export function sceneFlightObstacles(scene: THREE.Object3D, include: (mesh: THREE.Mesh) => boolean = () => true): FlightObstacle[] {
  const result: FlightObstacle[] = [], box = new THREE.Box3(), instance = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  const addBounds = (bounds: THREE.Box3, transform: THREE.Matrix4) => {
    box.copy(bounds).applyMatrix4(transform);
    if (box.isEmpty() || box.max.y <= .5) return;
    result.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: Math.max(0, box.min.y), maxY: box.max.y });
  };
  const add = (mesh: THREE.Mesh, transform: THREE.Matrix4) => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    addBounds(mesh.geometry.boundingBox!, transform);
  };
  scene.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.groundSurface === true || !include(object)) return;
    // Merged static scenery retains its authored part bounds rather than one
    // district-wide box. Bounds are local to the mesh, like its geometry.
    if (Array.isArray(object.userData.flightBounds)) {
      for (const bounds of object.userData.flightBounds) addBounds(bounds, object.matrixWorld);
      return;
    }
    if (object instanceof THREE.InstancedMesh) {
      for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, instance); matrix.multiplyMatrices(object.matrixWorld, instance); add(object, matrix); }
    } else add(object, object.matrixWorld);
  });
  return result;
}
