import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createSceneCover } from './scene-cover';
import { createArena } from './arena-rules';
import { shootAndLand } from './arena-test-shots';

afterEach(() => vi.useRealTimers());
it('keeps effects, avatars, vehicles, hidden and removed meshes out of static cover', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 4, 1), material = new THREE.MeshBasicMaterial();
  const groups = Array.from({ length: 5 }, (_, index) => {
    const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -2 - index * 2; group.add(mesh); scene.add(group); return group;
  });
  groups[0].userData.fpsEffect = true; groups[1].userData.arenaActorId = 'enemy'; groups[2].userData.vehicleKind = 'car'; groups[3].visible = false;
  const cover = createSceneCover(scene), from = { x: 0, y: 0, z: 0 }, direction = { x: 0, y: 0, z: -1 };
  expect(cover.distance(from, direction, 20)).toBe(9.5);
  groups[4].visible = false; expect(cover.distance(from, direction, 20)).toBe(20);
  groups[4].visible = true; groups[4].removeFromParent(); expect(cover.distance(from, direction, 20)).toBe(20);
  groups[3].visible = true; expect(cover.distance(from, direction, 20)).toBe(7.5);
  geometry.dispose(); material.dispose();
});

it('uses rendered bars for damage while movement guards keep their full envelope', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(.1, .1, 4), material = new THREE.MeshBasicMaterial();
  const top = new THREE.Mesh(geometry, material); top.position.set(0, 1.08, 0); scene.add(top);
  const cover = createSceneCover(scene);
  const guard = { minX: -.06, maxX: .06, minZ: -2, maxZ: 2, minY: 0, maxY: 1.13 };
  const environment = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, spawns: [{ x: -2, z: .3 }, { x: 2, z: .3 }], move: (p: { x: number; z: number }) => p };
  for (const y of [.7, 1.08]) {
    const arena = createArena([], 0, 'mixed', environment, undefined, { bounds: environment.bounds, obstacles: [], surfaces: [], traversalObstacles: [guard] }, cover.distance);
    arena.addPlayer('one', 'One'); arena.addPlayer('two', 'Two');
    const one = arena.snapshot().actors.find(a => a.id === 'one')!;
    // A crouched firing origin within the host's accepted distance from the eye.
    const result = shootAndLand(arena, 'one', { ...one, y }, { x: 1, y: 0, z: 0 }, 0);
    expect(result.damage > 0, `ray height ${y}`).toBe(y === .7);
    expect(arena.snapshot().impacts?.length).toBe(y === .7 ? 1 : 0);
  }
  geometry.dispose(); material.dispose();
});

it('checks dropped flight segments against cover absent along the initial aim ray', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(8, 1, .4), material = new THREE.MeshBasicMaterial();
  const wall = new THREE.Mesh(geometry, material); wall.position.set(0, 1.25, -25); scene.add(wall);
  const cover = createSceneCover(scene);
  const arena = createArena([], 0, 'mixed', { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawns: [{ x: 0, z: 0 }, { x: 0, z: -60 }], move: p => p }, undefined, undefined, cover.distance);
  arena.addPlayer('one', 'One', 0, 0, [{ damage: 36, interval: .12, capacity: 30, reload: 1.8, ballistics: { velocity: 100, drop: 30 } }]);
  arena.addPlayer('two', 'Two');
  const one = arena.snapshot().actors.find(a => a.id === 'one')!;
  const origin = { ...one, y: 2.5 };
  expect(cover.distance(origin, { x: 0, y: 0, z: -1 }, 60)).toBe(60);
  arena.shoot('one', origin, { x: 0, y: 0, z: -1 }, 0);
  for (let t = 0; t < .65; t += .01) arena.step(.01);
  expect(arena.inFlight()).toBe(0);
  expect(arena.snapshot().impacts).toEqual([]);
  expect(arena.snapshot().actors.find(a => a.id === 'two')!.health).toBe(100);
  geometry.dispose(); material.dispose();
});
