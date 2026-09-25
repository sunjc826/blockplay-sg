import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFpsVehicles } from './fps-vehicles';
import { firstVisibleHit } from './fps-raycast';

afterEach(() => vi.unstubAllGlobals());

it('keeps vehicle labels decorative for camera-free counter-fire rays and player shots', () => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ fillRect() {}, fillText() {} }),
  }) });
  const scene = new THREE.Scene();
  const vehicles = createFpsVehicles(scene, [], { car: '', helicopter: '' });
  try {
    scene.updateMatrixWorld(true);
    const labels: THREE.Sprite[] = [];
    scene.traverse(object => { if (object instanceof THREE.Sprite) labels.push(object); });
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      const position = label.getWorldPosition(new THREE.Vector3());
      const ray = new THREE.Raycaster(position.clone().add(new THREE.Vector3(0, 0, 10)), new THREE.Vector3(0, 0, -1));
      expect(ray.camera).toBeNull();
      expect(() => firstVisibleHit(ray, scene.children)).not.toThrow();
      expect(firstVisibleHit(ray, [label])).toBeUndefined();
      ray.camera = new THREE.PerspectiveCamera();
      expect(firstVisibleHit(ray, [label])).toBeUndefined();
    }
    // The actual car still obstructs fire: only its floating label is excluded.
    const car = vehicles.states.car;
    const bodyRay = new THREE.Raycaster(new THREE.Vector3(car.x, 1, car.z + 20), new THREE.Vector3(0, 0, -1));
    const hit = firstVisibleHit(bodyRay, [vehicles.models.car]);
    expect(hit).toBeDefined();
  } finally { vehicles.dispose(); }
});

it('preserves hull health and ammo through dismount, blocks wreck entry, and resets cleanly', () => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const scene = new THREE.Scene(), vehicles = createFpsVehicles(scene, [], { car: '', helicopter: '' });
  try {
    const spawn = { ...vehicles.states.car };
    expect(vehicles.interact(spawn)?.entered).toBe(true);
    vehicles.aim(new THREE.Vector3(spawn.x, 3, spawn.z - 50));
    expect(vehicles.fire()).not.toBeNull(); expect(vehicles.fire()).toBeNull();
    vehicles.damage('car', 180);
    const exit = vehicles.interact(spawn)!; expect(exit.entered).toBe(false);
    expect(vehicles.interact(exit)?.entered).toBe(true);
    expect(vehicles.mounted?.health).toBe(420); expect(vehicles.mounted?.ammo).toBe(239);
    vehicles.step(new Set(), .2); expect(vehicles.fire()).not.toBeNull();
    vehicles.damage('car', 1000); expect(vehicles.active).toBeNull();
    expect(vehicles.takeDestructions()).toMatchObject([{ kind: 'car', occupied: true }]);
    vehicles.damage('car', 1); expect(vehicles.takeDestructions()).toHaveLength(0);
    expect(vehicles.interact(spawn)).toBeNull();
    const wreck = vehicles.models.car.children[0] as THREE.Mesh, bent = wreck.scale.y;
    vehicles.reset(); expect(vehicles.states.car.health).toBe(600); expect(vehicles.states.car.ammo).toBe(240);
    expect(wreck.scale.y).toBeGreaterThan(bent); expect(vehicles.takeDestructions()).toHaveLength(0);
  } finally { vehicles.dispose(); }
  expect(scene.children).toHaveLength(0);
});

it('rotates gun direction to its aim point and excludes effects from collision', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const scene = new THREE.Scene(), vehicles = createFpsVehicles(scene, [], { car: '', helicopter: '' });
  try {
    vehicles.interact(vehicles.states.car); scene.updateMatrixWorld(true);
    const turret = vehicles.models.car.getObjectByName('vehicle-turret')!;
    const origin = turret.getWorldPosition(new THREE.Vector3());
    const desired = new THREE.Vector3(1, .1, 0).normalize();
    vehicles.aim(origin.clone().addScaledVector(desired, 40));
    const shot = vehicles.fire()!;
    expect(shot.direction.dot(desired)).toBeCloseTo(1, 5);
    vehicles.damage('helicopter', 10000); vehicles.step(new Set(), .05);
    expect(scene.children.filter(o => o.userData.fpsEffect)).toHaveLength(1);
    expect(vehicles.hitKind(vehicles.models.car.children[0])).toBe('car');
  } finally { vehicles.dispose(); }
});
