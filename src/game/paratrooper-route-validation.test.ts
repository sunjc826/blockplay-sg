import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createSceneCover } from './scene-cover';
import { createDropColumnCheck } from './paratrooper-route-validation';
import { markWater } from './water';

it('rejects rendered water even when an older map omitted its movement obstacle', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial(); markWater(material);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 20), material); scene.add(mesh);
  expect(createDropColumnCheck(createSceneCover(scene))({ x: 0, z: 0 }, 0)).toBe(false);
  mesh.geometry.dispose(); material.dispose();
});
it('requires real support and rejects canopies over a dry patch', () => {
  const scene = new THREE.Scene();
  expect(createDropColumnCheck(createSceneCover(scene))({ x: 0, z: 0 }, 0)).toBe(false);
  const material = new THREE.MeshBasicMaterial(), geometry = new THREE.BoxGeometry(20, .2, 20), floor = new THREE.Mesh(geometry, material); floor.position.y = -.1; scene.add(floor);
  expect(createDropColumnCheck(createSceneCover(scene))({ x: 0, z: 0 }, 0)).toBe(true);
  const overhead = new THREE.Mesh(geometry, material); overhead.position.y = 12; overhead.userData.visualCover = true; scene.add(overhead);
  expect(createDropColumnCheck(createSceneCover(scene))({ x: 0, z: 0 }, 0)).toBe(false);
  geometry.dispose(); material.dispose();
});
