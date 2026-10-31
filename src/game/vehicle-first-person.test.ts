import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildVehicleModel } from './vehicle-models';
import { createVehicle } from './vehicle-rules';
import { seatFacing, seatLocalPoint, seatPoint } from './vehicle-seats';
import { placeVehicleFirstPersonCamera } from './vehicle-first-person';
import { disposeModel } from './armory-visuals';

afterEach(() => vi.unstubAllGlobals());
const stubCanvas = () => vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) });

it('keeps pilot and gunner eyes in their seats regardless of who controls the chin gun', () => {
  const v = createVehicle('helicopter', { x: 10, z: -8, yaw: .7 }); v.y = 20;
  const model = new THREE.Group(); model.position.set(v.x, v.y, v.z); model.rotation.y = v.yaw;
  const camera = new THREE.PerspectiveCamera();
  for (const seat of [0, 1]) for (const canFire of [true, false]) {
    placeVehicleFirstPersonCamera(camera, model, v, seat, v.yaw, 0, canFire);
    const eye = seatPoint(v, seat);
    expect(camera.position.distanceTo(new THREE.Vector3(eye.x, eye.y, eye.z))).toBeLessThan(1e-8);
    expect(camera.position.y).toBeCloseTo(22.08);
  }
});

it('follows the rendered hull pitch and rotation without sliding through the cabin', () => {
  const v = createVehicle('helicopter', { x: 10, z: -8, yaw: 1.1 }); v.y = 20;
  const model = new THREE.Group(); model.position.set(v.x, v.y, v.z); model.rotation.set(-.22, v.yaw, 0);
  const camera = new THREE.PerspectiveCamera();
  for (const seat of [0, 1, 2, 3]) {
    const facing = seatFacing(v.kind, seat), local = seatLocalPoint(v.kind, seat);
    placeVehicleFirstPersonCamera(camera, model, v, seat, v.yaw + facing, 0, seat < 2);
    const inCabin = model.worldToLocal(camera.position.clone());
    expect(inCabin.distanceTo(new THREE.Vector3(local.x, local.y, local.z))).toBeLessThan(1e-8);
    const look = camera.getWorldDirection(new THREE.Vector3());
    const expected = new THREE.Vector3(-Math.sin(facing), 0, -Math.cos(facing)).transformDirection(model.matrixWorld);
    expect(look.dot(expected)).toBeCloseTo(1);
  }
});

it('gives both side seats clear outward views and a solid floor and rear bulkhead inside', () => {
  stubCanvas();
  const model = buildVehicleModel('helicopter'); model.updateMatrixWorld(true);
  try {
    for (const seat of [2, 3]) {
      const eye = seatLocalPoint('helicopter', seat), from = new THREE.Vector3(eye.x, eye.y, eye.z);
      const outward = new THREE.Vector3(seat === 2 ? -1 : 1, 0, 0);
      const hits = (direction: THREE.Vector3) => new THREE.Raycaster(from, direction, .08, 10).intersectObject(model, true).filter(h => !(h.object as THREE.Mesh).material || !((h.object as THREE.Mesh).material as THREE.Material).transparent);
      expect(hits(outward)).toHaveLength(0);
      expect(hits(new THREE.Vector3(0, -1, 0))[0]?.object.name).toBe('side-seat-cushion');
      const floor = new THREE.Raycaster(new THREE.Vector3(eye.x, eye.y, 0), new THREE.Vector3(0, -1, 0), .08, 10).intersectObject(model, true);
      expect(floor[0]?.object.name).toBe('cabin-floor');
      expect(hits(new THREE.Vector3(0, 0, 1))[0]?.object.name).toBe('rear-bulkhead-lining');
    }
    const pilot = seatLocalPoint('helicopter', 0);
    const front = new THREE.Raycaster(new THREE.Vector3(pilot.x, pilot.y, pilot.z), new THREE.Vector3(0, 0, -1)).intersectObject(model, true);
    expect(front[0]?.object.name).toBe('cockpit-glazing');
  } finally { disposeModel(model); }
});

it('preserves the raised gun camera for the car', () => {
  const v = createVehicle('car', { x: 10, z: -8, yaw: 0 }), camera = new THREE.PerspectiveCamera();
  placeVehicleFirstPersonCamera(camera, new THREE.Group(), v, 1, 0, 0, true);
  expect(camera.position.toArray()).toEqual([v.x, v.y + 2.72, v.z - .45]);
});
