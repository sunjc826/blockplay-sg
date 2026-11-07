import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { accelerateMeshRaycast } from './mesh-raycast';

/** Explicitly fixed siblings within one moving part/spatial chunk. Never recurse.
 * Scene builders pass trackGeometry because their source geometry may be shared
 * outside this parent. Without it, the caller owns the entire source geometry:
 * replaced geometry is disposed unless another descendant still uses it.
 * A custom raycast is allowed only when explicitly supplied by the caller.
 */
export function batchRigidMeshes(parent: THREE.Object3D, options: {
  candidates?: readonly THREE.Object3D[];
  trackGeometry?: (geometry: THREE.BufferGeometry) => unknown;
  raycast?: THREE.Mesh['raycast'];
} = {}) {
  const groups = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  for (const child of options.candidates ?? [...parent.children]) {
    if (!(child instanceof THREE.Mesh) || child.parent !== parent || child.children.length || !child.visible) continue;
    if (child instanceof THREE.InstancedMesh || child instanceof THREE.SkinnedMesh || Array.isArray(child.material)) continue;
    if (child.material.transparent || !child.material.visible || Object.keys(child.userData).length) continue;
    if (child.raycast !== (options.raycast ?? THREE.Mesh.prototype.raycast)) continue;
    if (child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || child.onAfterRender !== THREE.Object3D.prototype.onAfterRender || child.customDepthMaterial || child.customDistanceMaterial) continue;
    const geometry: THREE.BufferGeometry = child.geometry;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity || Object.keys(geometry.morphAttributes).length) continue;
    if (Object.values(geometry.attributes).some(a => !(a instanceof THREE.BufferAttribute))) continue;
    child.updateMatrix(); if (child.matrix.determinant() <= 0) continue;
    const attributes = Object.entries(geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(',');
    const key = [child.material.id, attributes, child.castShadow, child.receiveShadow, child.renderOrder, child.layers.mask, child.frustumCulled].join('|');
    const group = groups.get(key) ?? []; group.push(child); groups.set(key, group);
  }
  const batches: THREE.Mesh[] = [], replaced = new Set<THREE.BufferGeometry>();
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const flightBounds = parts.map(part => {
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      return part.geometry.boundingBox!.clone().applyMatrix4(part.matrix);
    });
    const pieces = parts.map(part => {
      const geometry = part.geometry.clone();
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
      return geometry.applyMatrix4(part.matrix);
    });
    const geometry = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose());
    if (!geometry) throw new Error('Incompatible rigid transport geometry');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); options.trackGeometry?.(geometry);
    const first = parts[0], mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = 'Rigid transport parts'; mesh.raycast = first.raycast;
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder; mesh.layers.mask = first.layers.mask; mesh.frustumCulled = first.frustumCulled;
    mesh.userData.flightBounds = flightBounds;
    if (mesh.raycast === THREE.Mesh.prototype.raycast) {
      const release = accelerateMeshRaycast(mesh);
      const dispose = () => { release(); geometry.removeEventListener('dispose', dispose); };
      geometry.addEventListener('dispose', dispose);
    }
    parts.forEach(part => { parent.remove(part); replaced.add(part.geometry); });
    parent.add(mesh); batches.push(mesh);
  }
  if (!options.trackGeometry) {
    parent.traverse(o => { if (o instanceof THREE.Mesh) replaced.delete(o.geometry); });
    replaced.forEach(g => g.dispose());
  }
  return batches;
}
