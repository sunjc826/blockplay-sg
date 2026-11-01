import { expect, it } from 'vitest';
import * as THREE from 'three';
import { applyVehicleImpactCamera, createEmptyImpactPose, createVehicleImpactMotion, validVehicleImpact } from './vehicle-impact';
import { createVehicle, driveVehicle, flyVehicle, type VehicleImpact } from './vehicle-rules';

const impact = (speed = 20, serial = 1, x = 0, y = 0, z = 1): VehicleImpact => ({ speed, serial, x, y, z });
const wall = { minX: -20, maxX: 20, minZ: -5, maxZ: 0, minY: 0, maxY: 20 };
const magnitude = (value: object) => Math.hypot(...Object.values(value));

it('retains the actual contact direction/severity until another collision, ignoring wall pressure', () => {
  const v = { ...createVehicle('car'), x: 0, z: 2.4, yaw: 0, speed: 19.5 };
  const hit = driveVehicle(v, 1, 0, false, .05, [wall]).state;
  expect(hit.impact).toEqual(impact());
  expect(driveVehicle(hit, 0, 0, false, .05, [wall]).state.impact).toEqual(hit.impact);
  let pressing = { ...hit, speed: 0, z: 2.35 };
  for (let i = 0; i < 30; i++) pressing = driveVehicle(pressing, 1, 0, false, .05, [wall]).state;
  expect(pressing.impact).toEqual(hit.impact);
  const again = driveVehicle({ ...hit, z: 2.4, speed: 19.5 }, 1, 0, false, .05, [wall]).state;
  expect(again.impact?.serial).toBe(2);
  const landing = flyVehicle({ ...createVehicle('helicopter'), x: 0, z: 0, y: .15, climb: -12 }, 0, 0, -1, false, .05, []).state;
  expect(landing.impact?.y).toBe(1); expect(landing.impact?.x).toBe(0); expect(landing.impact?.z).toBe(0);
});

it('scales jolts by severity and resolves front, side and vertical hits into different body motion', () => {
  const front = createVehicleImpactMotion(), side = createVehicleImpactMotion(), vertical = createVehicleImpactMotion(), small = createVehicleImpactMotion();
  front.accept(impact(), 0); small.accept(impact(5), 0); side.accept(impact(20, 1, 1, 0, 0), 0); vertical.accept(impact(20, 1, 0, 1, 0), 0);
  for (const motion of [front, side, vertical, small]) motion.advance(.05);
  expect(front.sample().body.pitch).toBeLessThan(-.02); expect(front.sample().body.roll).toBe(0);
  expect(side.sample().body.pitch).toBe(0); expect(side.sample().body.roll).toBeLessThan(-.02);
  expect(vertical.sample().body.heave).toBeGreaterThan(front.sample().body.heave);
  expect(magnitude(front.sample().camera)).toBeGreaterThan(magnitude(small.sample().camera));
  const rotated = createVehicleImpactMotion(); rotated.accept(impact(20, 1, 1, 0, 0), -Math.PI / 2); rotated.advance(.05);
  expect(rotated.sample().body.pitch).toBeGreaterThan(.02); expect(rotated.sample().body.roll).toBeCloseTo(0);
});

it('does not replay duplicate/stale receipts, clears restored baselines and bounds stacked contacts', () => {
  const motion = createVehicleImpactMotion(); motion.accept(impact(), 0); motion.advance(.05);
  const once = motion.sample(); motion.accept(impact(), 0); motion.accept(impact(20, 0), 0);
  expect(motion.sample()).toEqual(once);
  for (let serial = 2; serial < 20; serial++) motion.accept(impact(100, serial), 0);
  motion.advance(.05);
  expect(Math.abs(motion.sample().body.pitch)).toBeLessThanOrEqual(.08);
  expect(magnitude(motion.sample().camera)).toBeLessThan(.06);
  motion.reset(20); motion.accept(impact(20, 20), 0); motion.advance(.05);
  expect(motion.sample()).toEqual(createEmptyImpactPose());
});

it('settles independently of frame rate, freezes at dt=0, and suppresses all motion when requested', () => {
  const a = createVehicleImpactMotion(), b = createVehicleImpactMotion(); a.accept(impact(), 0); b.accept(impact(), 0);
  a.advance(.1); for (let i = 0; i < 12; i++) b.advance(1 / 120);
  expect(a.sample().body.pitch).toBeCloseTo(b.sample().body.pitch, 10);
  const frozen = a.sample(); a.advance(0); expect(a.sample()).toEqual(frozen);
  expect(a.sample(true)).toEqual(createEmptyImpactPose());
  a.advance(2); expect(a.sample()).toEqual(createEmptyImpactPose());
});

it.each([false, true])('adds camera rotation without moving the eye or changing the stored look (first person: %s)', firstPerson => {
  const camera = new THREE.PerspectiveCamera(), motion = createVehicleImpactMotion();
  const yaw = .7, pitch = -.1;
  camera.position.set(10, 3, -5); camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const before = camera.quaternion.clone(), eye = camera.position.clone();
  motion.accept(impact(), 0); motion.advance(.05);
  applyVehicleImpactCamera(camera, motion.sample(), firstPerson);
  expect(camera.position.equals(eye)).toBe(true);
  expect(camera.quaternion.angleTo(before)).toBeGreaterThan(.003);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  motion.advance(2); applyVehicleImpactCamera(camera, motion.sample(), firstPerson);
  expect(camera.quaternion.angleTo(before)).toBeLessThan(1e-7);
});

it('rejects malformed shared impact receipts and ignores them in presentation', () => {
  expect(validVehicleImpact(impact())).toBe(true);
  for (const invalid of [{ ...impact(), serial: -1 }, { ...impact(), serial: 1.5 }, { ...impact(), speed: NaN }, { ...impact(), speed: 121 }, { ...impact(), x: Infinity }, { ...impact(), z: 2 }, { ...impact(), z: 0 }]) {
    expect(validVehicleImpact(invalid)).toBe(false);
    const motion = createVehicleImpactMotion(); motion.accept(invalid, 0); motion.advance(.05);
    expect(motion.sample()).toEqual(createEmptyImpactPose());
  }
});
