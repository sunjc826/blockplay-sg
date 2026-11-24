import * as THREE from 'three';
import type { Obstacle } from './region-collision';

/**
 * Small loaded models a match stands in its arena (the range's crates and racks) count as cover by their
 * collision box, not their mesh: the model itself is marked `coverApart`, and this adds the box, undrawn.
 * A simulation on another thread has the boxes but not the models, so both see the same cover.
 */
export function addPropCover(scene: THREE.Scene, boxes: readonly Obstacle[]) {
  const group = new THREE.Group(); group.name = 'Prop cover';
  const material = new THREE.MeshBasicMaterial({ visible: false, colorWrite: false }), geometries: THREE.BufferGeometry[] = [];
  for (const box of boxes) {
    const floor = box.minY ?? 0, top = box.maxY ?? floor + 1;
    const geometry = new THREE.BoxGeometry(box.maxX - box.minX, top - floor, box.maxZ - box.minZ); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set((box.minX + box.maxX) / 2, (floor + top) / 2, (box.minZ + box.maxZ) / 2);
    group.add(mesh);
  }
  scene.add(group); group.updateMatrixWorld(true);
  return { group, dispose() { group.removeFromParent(); geometries.forEach(g => g.dispose()); material.dispose(); } };
}
