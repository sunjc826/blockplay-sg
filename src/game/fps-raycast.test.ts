import { expect, it } from 'vitest';
import * as THREE from 'three';
import { firstVisibleHit, visibleHits } from './fps-raycast';

it('blocks a target behind scenery and ignores invisible parent groups', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
  const wall = new THREE.Mesh(geometry, material); wall.position.z = -3;
  const target = new THREE.Mesh(geometry, material); target.position.z = -6;
  const group = new THREE.Group(); group.add(wall);
  group.updateMatrixWorld(true); target.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  expect(firstVisibleHit(ray, [target, group])?.object).toBe(wall);
  group.visible = false;
  expect(firstVisibleHit(ray, [target, group])?.object).toBe(target);
  target.visible = false; expect(firstVisibleHit(ray, [target, group])).toBeUndefined();
  geometry.dispose(); material.dispose();
});

it('returns pierced surfaces nearest first, bounded by the limit', () => {
  // Flat panels, so each stands for exactly one surface. A solid box reports its
  // near and far faces separately, and each face spends a round's budget.
  const geometry = new THREE.PlaneGeometry(4, 4), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const near = new THREE.Mesh(geometry, material); near.position.z = -3;
  const middle = new THREE.Mesh(geometry, material); middle.position.z = -6;
  const far = new THREE.Mesh(geometry, material); far.position.z = -9;
  [near, middle, far].forEach(m => m.updateMatrixWorld(true));
  // Offset off the panels' shared triangle edge, which a centred ray hits twice.
  const ray = new THREE.Raycaster(new THREE.Vector3(.7, .3, 0), new THREE.Vector3(0, 0, -1));
  const objects = [far, middle, near];
  expect(visibleHits(ray, objects, 3).map(h => h.object)).toEqual([near, middle, far]);
  expect(visibleHits(ray, objects, 2).map(h => h.object)).toEqual([near, middle]);
  expect(visibleHits(ray, objects, 1).map(h => h.object)).toEqual([near]);
  expect(visibleHits(ray, objects, 0)).toEqual([]);
  // An invisible surface is skipped without consuming the budget.
  middle.visible = false;
  expect(visibleHits(ray, objects, 2).map(h => h.object)).toEqual([near, far]);
  geometry.dispose(); material.dispose();
});
