import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { accelerateMeshRaycast } from './mesh-raycast';

/** Merge fixed siblings only: parent animation/visibility and inherited tags stay intact.
 * Run after shadow proxies are built, before damage/rain/ray systems scan the model.
 * Transparent surfaces and independently deformed body panels retain their meshes.
 */
export function batchVehicleParts(root: THREE.Group, moving: ReadonlySet<string>) {
  const parents: THREE.Object3D[] = [], removed = new Set<THREE.BufferGeometry>();
  root.traverse(o => { if (o.children.length) parents.push(o); });
  for (const parent of parents) {
    const groups = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child.children.length || moving.has(child.name)) continue;
      if (child instanceof THREE.SkinnedMesh || child instanceof THREE.InstancedMesh || !child.visible) continue;
      if (Array.isArray(child.material) || !child.material.visible || child.material.transparent) continue;
      if (parent === root && child.position.y > .7) continue; // vehicleDamageVisual's panel selection/order
      if (child.raycast !== THREE.Mesh.prototype.raycast || child.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || child.onAfterRender !== THREE.Object3D.prototype.onAfterRender) continue;
      if (child.customDepthMaterial || child.customDistanceMaterial) continue;
      // Unknown part-specific semantics should remain on their original mesh.
      if (Object.keys(child.userData).some(k => !['rainReceiver', 'wetSurface', 'noShadowCast'].includes(k))) continue;
      const geometry: THREE.BufferGeometry = child.geometry;
      if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity || Object.keys(geometry.morphAttributes).length) continue;
      if (Object.values(geometry.attributes).some(a => !(a instanceof THREE.BufferAttribute))) continue;
      child.updateMatrix();
      if (child.matrix.determinant() <= 0) continue;
      const attributes = Object.entries(geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(',');
      const key = [child.material.id, attributes, child.castShadow, child.receiveShadow, child.renderOrder,
        child.layers.mask, child.frustumCulled, child.userData.rainReceiver, child.userData.wetSurface, child.userData.noShadowCast].join('|');
      const group = groups.get(key) ?? []; group.push(child); groups.set(key, group);
    }
    for (const parts of groups.values()) {
      if (parts.length < 2) continue;
      const geometries = parts.map(part => {
        const geometry = part.geometry.clone();
        if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
        geometry.applyMatrix4(part.matrix); return geometry;
      });
      const geometry = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
      if (!geometry) throw new Error('Incompatible vehicle part geometry');
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const first = parts[0], mesh = new THREE.Mesh(geometry, first.material);
      mesh.name = parts.every(p => p.name === first.name) ? first.name : 'vehicle-parts';
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder; mesh.layers.mask = first.layers.mask; mesh.frustumCulled = first.frustumCulled;
      mesh.userData = { ...first.userData };
      // A larger draw bound must not make bullets/rain scan every triangle.
      const disposeRaycast = accelerateMeshRaycast(mesh);
      const dispose = () => { disposeRaycast(); geometry.removeEventListener('dispose', dispose); };
      geometry.addEventListener('dispose', dispose);
      for (const part of parts) { parent.remove(part); removed.add(part.geometry); }
      parent.add(mesh);
    }
  }
  // A geometry can also be shared by a retained part. Materials remain shared.
  root.traverse(o => { if (o instanceof THREE.Mesh) removed.delete(o.geometry); });
  removed.forEach(g => g.dispose());
}
