import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildVehicleModel } from './vehicle-models';
import { disposeModel } from './armory-visuals';

afterEach(() => vi.unstubAllGlobals());

it('keeps the curved nose and tapered tail closed to exterior rays and ready for vehicle paint/rain', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const model = buildVehicleModel('helicopter', 'paint-jungle'); model.updateMatrixWorld(true);
  try {
    const nose = model.getObjectByName('nose-fairing') as THREE.Mesh;
    for (const x of [-.65, 0, .65]) {
      const hits = new THREE.Raycaster(new THREE.Vector3(x, 1.2, -4), new THREE.Vector3(0, 0, 1)).intersectObject(nose);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.z).toBeLessThan(-2);
      expect(hits[0].face!.normal.z).toBeLessThan(0);
    }
    const inside = new THREE.Raycaster(new THREE.Vector3(0, 1.3, -1.8), new THREE.Vector3(0, -.3, -1).normalize()).intersectObject(nose);
    expect(inside.length).toBeGreaterThan(0);
    const tail = model.getObjectByName('tail-boom') as THREE.Mesh;
    const radiusAt = (z: number, y: number) => new THREE.Raycaster(new THREE.Vector3(2, y, z), new THREE.Vector3(-1, 0, 0)).intersectObject(tail)[0].point.x;
    expect(radiusAt(2.2, 1.75)).toBeGreaterThan(radiusAt(5.3, 2.04) * 2);
    for (const name of ['nose-fairing', 'cabin-belly', 'cabin-roof', 'rear-bulkhead', 'tail-boom', 'engine-cowling']) {
      for (const mesh of model.getObjectsByProperty('name', name) as THREE.Mesh[]) {
        expect(mesh.userData.rainReceiver).toBe(true);
        expect((mesh.material as THREE.MeshStandardMaterial).map).toBeTruthy();
        expect(mesh.geometry.getAttribute('uv').count).toBe(mesh.geometry.getAttribute('position').count);
      }
    }
  } finally { disposeModel(model); }
});
