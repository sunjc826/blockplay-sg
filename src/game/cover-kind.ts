import * as THREE from 'three';

/** Foliage hides a silhouette but does not stop bullets or absorb a blast. */
export function isVisualCover(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.userData.visualCover) return true;
  }
  if (!(object instanceof THREE.Mesh)) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.length > 0 && materials.every(material => material.userData.visualCover === true);
}
