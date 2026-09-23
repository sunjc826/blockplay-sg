import * as THREE from 'three';
const normalMatrix = new THREE.Matrix3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
/** Raycast normals are local even when the struck object is a rotated instance. */
export function impactSurfaceNormal(hit: THREE.Intersection, direction: THREE.Vector3, result: THREE.Vector3) {
  const local = hit.normal ?? hit.face?.normal;
  if (local) {
    transform.copy(hit.object.matrixWorld);
    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      hit.object.getMatrixAt(hit.instanceId, instance);
      transform.multiply(instance);
    }
    result.copy(local).applyNormalMatrix(normalMatrix.getNormalMatrix(transform));
    if (result.lengthSq() > 1e-12) {
      result.normalize();
      if (result.dot(direction) > 0) result.negate();
      return result;
    }
  }
  return result.copy(direction).negate().normalize();
}
