import { afterAll, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { addQueenstownVoidDeckFurniture, QUEENSTOWN_DECK_TABLES } from './queenstown-void-deck-furniture';

const scene = new THREE.Scene();
const furniture = addQueenstownVoidDeckFurniture(scene);
scene.updateMatrixWorld(true);
afterAll(() => furniture.dispose());

it('keeps exact furniture hits without scanning district-wide triangle batches for combat rays', () => {
  const meshes: THREE.Mesh[] = [];
  scene.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  const native = THREE.Mesh.prototype.raycast;
  const faces = (mesh: THREE.Mesh) => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  const rays = QUEENSTOWN_DECK_TABLES.flatMap(table => [
    new THREE.Raycaster(new THREE.Vector3(table.x, table.y + 3, table.z), new THREE.Vector3(0, -1, 0), 0, 4),
    new THREE.Raycaster(new THREE.Vector3(table.x - 10, table.y + .79, table.z), new THREE.Vector3(1, 0, 0), 0, 20),
    new THREE.Raycaster(new THREE.Vector3(table.x - 10, table.y + 1.75, table.z), new THREE.Vector3(1, 0, 0), 0, 20),
  ]);
  let testedFaces = 0;
  const spy = vi.spyOn(THREE.Mesh.prototype, 'raycast').mockImplementation(function (this: THREE.Mesh, ray, hits) {
    testedFaces += faces(this);
    native.call(this, ray, hits);
  });
  const describe = (hits: THREE.Intersection[]) => hits.sort((a, b) => a.distance - b.distance || a.object.id - b.object.id || a.faceIndex! - b.faceIndex!)
    .map(hit => ({ object: hit.object.id, distance: hit.distance, face: hit.faceIndex, point: hit.point.toArray(), uv: hit.uv?.toArray() }));
  try {
    for (const ray of rays) {
      const expected: THREE.Intersection[] = [];
      meshes.forEach(mesh => native.call(mesh, ray, expected));
      expect(describe(ray.intersectObjects(meshes, false))).toEqual(describe(expected));
    }
    // Deterministic work budget, independent of CPU speed: nearby leaf geometry
    // must be much smaller than all furniture across the district for each ray.
    expect(testedFaces).toBeLessThan(rays.length * meshes.reduce((sum, mesh) => sum + faces(mesh), 0) / 20);
  } finally { spy.mockRestore(); }
});
