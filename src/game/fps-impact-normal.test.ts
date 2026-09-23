import { expect, it } from 'vitest';
import * as THREE from 'three';
import { impactSurfaceNormal } from './fps-impact-normal';
it('orients marks on rotated, scaled instances toward the arriving shot', () => {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(2, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(2, 1, 1)));
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(4, 0, 0), new THREE.Vector3(-1, 0, 0));
  const hit = ray.intersectObject(mesh)[0]; expect(hit).toBeDefined();
  const normal = impactSurfaceNormal(hit, ray.ray.direction, new THREE.Vector3());
  expect(normal.x).toBeCloseTo(1); expect(normal.z).toBeCloseTo(0); expect(normal.length()).toBeCloseTo(1);
  expect(impactSurfaceNormal(hit, new THREE.Vector3(1, 0, 0), new THREE.Vector3()).x).toBeCloseTo(-1);
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose();
});
it('falls back toward the shooter when a hit has no surface normal', () => {
  const hit = { object: new THREE.Object3D(), point: new THREE.Vector3(), distance: 1 };
  expect(impactSurfaceNormal(hit, new THREE.Vector3(0, 0, -1), new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0);
});
