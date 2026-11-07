import * as THREE from 'three';
import { accelerateInstancedRaycasts } from './instanced-raycast';

/** Explicitly selected fixed siblings, never a recursive scene-wide merge.
 * The caller owns geometry/materials and disposes the returned instance buffers.
 * Keep spatial chunks and independently moving groups separate at the call site.
 */
export function instanceStaticMeshes(parent: THREE.Object3D, candidates: readonly THREE.Object3D[] = [...parent.children]) {
  const groups = new Map<string, THREE.Mesh[]>(), instances: THREE.InstancedMesh[] = [];
  for (const child of candidates) {
    if (!(child instanceof THREE.Mesh) || child.parent !== parent || child.children.length) continue;
    if (child instanceof THREE.InstancedMesh || child instanceof THREE.SkinnedMesh || !child.visible) continue;
    if (Array.isArray(child.material) || child.material.transparent || !child.material.visible) continue;
    if (child.raycast !== THREE.Mesh.prototype.raycast || child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || child.onAfterRender !== THREE.Object3D.prototype.onAfterRender) continue;
    if (child.customDepthMaterial || child.customDistanceMaterial || Object.keys(child.userData).length) continue;
    if (Object.keys(child.geometry.morphAttributes).length) continue;
    child.updateMatrix(); if (child.matrix.determinant() <= 0) continue;
    const key = [child.geometry.id, child.material.id, child.castShadow, child.receiveShadow,
      child.renderOrder, child.layers.mask, child.frustumCulled].join('|');
    const group = groups.get(key) ?? []; group.push(child); groups.set(key, group);
  }
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const first = parts[0], mesh = new THREE.InstancedMesh(first.geometry, first.material, parts.length);
    mesh.name = `${parent.name || 'Scenery'} repeated parts`;
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder; mesh.layers.mask = first.layers.mask; mesh.frustumCulled = first.frustumCulled;
    parts.forEach((part, i) => { mesh.setMatrixAt(i, part.matrix); parent.remove(part); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    accelerateInstancedRaycasts(mesh);
    parent.add(mesh); instances.push(mesh);
  }
  return instances;
}
