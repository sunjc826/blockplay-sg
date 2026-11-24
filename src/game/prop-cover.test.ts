import * as THREE from 'three';
import { expect, it } from 'vitest';
import { addPropCover } from './prop-cover';
import { createSceneCover } from './scene-cover';

it('stands a prop\'s collision box in the scene as cover that is never drawn', () => {
  const scene = new THREE.Scene();
  // The model itself, set apart as the engine sets it: a simulation without the model must see the same.
  const model = new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial()); model.position.set(10, 1, 0); model.userData.coverApart = true; scene.add(model);
  const cover = addPropCover(scene, [{ minX: 9.5, maxX: 10.5, minZ: -.5, maxZ: .5, minY: 0, maxY: 1.2 }]);
  scene.updateMatrixWorld(true);
  const drawn = cover.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  expect(drawn.material.visible).toBe(false);
  const sight = createSceneCover(scene);
  expect(sight.distance({ x: 0, y: .6, z: 0 }, { x: 1, y: 0, z: 0 }, 50)).toBeCloseTo(9.5, 2);
  // Over the box, though inside the model's own shape.
  expect(sight.distance({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 50)).toBeCloseTo(50, 2);
  cover.dispose(); expect(cover.group.parent).toBeNull();
});
