import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFpsVehicles } from './fps-vehicles';
import { firstVisibleHit } from './fps-raycast';
import { createSharedVehicle } from './vehicle-seats';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('updates cockpit hull/ammunition from local and shared authority and restores it on reset', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const vehicles = createFpsVehicles(new THREE.Scene(), [], { car: '', helicopter: '' });
  const dashboard = vehicles.models.helicopter.getObjectByName('helicopter-dashboard')!;
  const screen = dashboard.getObjectByName('cockpit-status-display') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  try {
    expect(dashboard.userData.telemetry).toMatchObject({ health: 900, ammo: 400, critical: false });
    const initial = screen.material.map!.version;
    vehicles.step(new Set(), .05);
    expect(screen.material.map!.version).toBe(initial); // unchanged telemetry does not upload again
    vehicles.interact(vehicles.states.helicopter); vehicles.aim(new THREE.Vector3(0, 5, -100));
    expect(vehicles.fire()).not.toBeNull(); vehicles.step(new Set(), .05);
    expect(dashboard.userData.telemetry.ammo).toBe(399);
    vehicles.damage('helicopter', 700);
    expect(dashboard.userData.telemetry).toMatchObject({ health: 200, ammo: 399, critical: true });
    const air = createSharedVehicle('helicopter', { x: 0, z: 0, yaw: 0 });
    air.health = 125; air.ammo = 0; air.occupants[0] = 'pilot';
    vehicles.adoptShared([createSharedVehicle('car', { x: 40, z: 0, yaw: 0 }), air], 'pilot');
    expect(dashboard.userData.telemetry).toMatchObject({ health: 125, ammo: 0, critical: true });
    vehicles.reset();
    expect(dashboard.userData.telemetry).toMatchObject({ health: 900, ammo: 400, critical: false });
  } finally { vehicles.dispose(); }
});

it('applies speed-dependent damage at contact and allows separate impacts without a timer', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const wall = { minX: -10, maxX: 10, minZ: -5, maxZ: 0 };
  const spawns = { car: { x: 0, z: 2.4, yaw: 0 }, helicopter: { x: 30, z: 0, yaw: 0 } };
  const vehicles = createFpsVehicles(new THREE.Scene(), [wall], { car: '', helicopter: '' }, { spawns });
  try {
    expect(vehicles.interact(vehicles.states.car)?.entered).toBe(true);
    for (const [speed, damage] of [[4, 0], [9.5, 50], [14.5, 200], [19.5, 450]]) {
      Object.assign(vehicles.states.car, spawns.car, { speed, health: 600 });
      vehicles.step(new Set(['w']), .05);
      expect(vehicles.states.car.health).toBeCloseTo(600 - damage);
      const afterImpact = vehicles.states.car.health;
      for (let i = 0; i < 20; i++) vehicles.step(new Set(['w']), .05);
      expect(vehicles.states.car.health).toBe(afterImpact);
    }
    Object.assign(vehicles.states.car, spawns.car, { speed: 20, health: 600 });
    vehicles.step(new Set(['w', ' ']), .05);
    expect(vehicles.states.car.health).toBeGreaterThan(550);
  } finally { vehicles.dispose(); }
});

it('does not damage a fast helicopter for a gentle vertical roof contact', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const roof = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, maxY: 5 };
  const spawns = { car: { x: -30, z: 0, yaw: 0 }, helicopter: { x: 0, z: 0, yaw: 0 } };
  const vehicles = createFpsVehicles(new THREE.Scene(), [roof], { car: '', helicopter: '' }, { spawns });
  try {
    expect(vehicles.interact(vehicles.states.helicopter)?.entered).toBe(true);
    Object.assign(vehicles.states.helicopter, { y: 5.02, speed: 20, climb: -2 });
    vehicles.step(new Set(['w']), .05);
    expect(vehicles.states.helicopter.health).toBe(900);
    expect(vehicles.states.helicopter.climb).toBe(0);
    expect(vehicles.states.helicopter.speed).toBe(20);
  } finally { vehicles.dispose(); }
});

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

it('dismounts onto a low pavement at its actual feet height', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const scene = new THREE.Scene();
  const pavement = { minX: -100, maxX: 100, minZ: -100, maxZ: 100, maxY: .2 };
  const vehicles = createFpsVehicles(scene, [pavement], { car: '', helicopter: '' }, { exitFloor: () => .2 });
  try {
    vehicles.interact(vehicles.states.car);
    vehicles.states.car.yaw = Math.PI / 4;
    const exit = vehicles.interact(vehicles.states.car);
    expect(exit).toMatchObject({ entered: false, y: .2 });
    expect(vehicles.active).toBeNull();
  } finally { vehicles.dispose(); }
});

it('keeps the rendered hull and mounted camera pose together between shared snapshots', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
  const scene = new THREE.Scene(), vehicles = createFpsVehicles(scene, [], { car: '', helicopter: '' });
  const car = createSharedVehicle('car', { x: 0, z: 0, yaw: 0 }); car.occupants[2] = 'passenger';
  const air = createSharedVehicle('helicopter', { x: 40, z: 0, yaw: 0 });
  try {
    vehicles.adoptShared([car, air], 'passenger');
    now = 100; vehicles.adoptShared([{ ...car, z: -2, speed: 20 }, air], 'passenger');
    now = 150; vehicles.sharedStep(.05);
    expect(vehicles.states.car.z).toBe(-2);
    expect(vehicles.viewMounted?.z).toBeCloseTo(-1);
    expect(vehicles.models.car.position.z).toBeCloseTo(vehicles.viewMounted!.z);
    expect(vehicles.canUseFirearm).toBe(true); expect(vehicles.canFire).toBe(false);
    vehicles.reset(); expect(vehicles.viewMounted).toBeNull();
  } finally { vehicles.dispose(); }
});

it('drives the Humvee steering wheel and speedometer from actual movement, and resets both', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });
  const vehicles = createFpsVehicles(new THREE.Scene(), [], { car: '', helicopter: '' });
  try {
    vehicles.interact(vehicles.states.car);
    const wheel = vehicles.models.car.getObjectByName('humvee-steering-wheel')!;
    const needle = vehicles.models.car.getObjectByName('humvee-speed-needle')!;
    const parked = needle.rotation.z;
    for (let i = 0; i < 20; i++) vehicles.step(new Set(['w', 'd']), .05);
    expect(wheel.rotation.z).toBeLessThan(-.05);
    expect(needle.rotation.z).toBeLessThan(parked);
    vehicles.reset();
    expect(needle.rotation.z).toBeCloseTo(parked);
    expect(wheel.rotation.z).toBeCloseTo(0);
  } finally { vehicles.dispose(); }
});
