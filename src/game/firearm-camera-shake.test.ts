import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFirearmCameraShake, FIREARM_SHAKE_DURATION, FIREARM_SHAKE_LIMIT } from './firearm-camera-shake';
import { FPS_WEAPONS } from './fps-rules';
import { advanceRecoil, createRecoil, recordRecoilShot, recoilView, takeAimPush } from './fps-recoil';

const size = (pose: { pitch: number; yaw: number; roll: number }) => Math.hypot(pose.pitch, pose.yaw, pose.roll);
const zero = { pitch: 0, yaw: 0, roll: 0 };

it('adds a visible firing rattle and settles completely within 200 ms', () => {
  const shake = createFirearmCameraShake();
  expect(shake.sample()).toEqual(zero);
  shake.shot(.018);
  expect(THREE.MathUtils.radToDeg(size(shake.sample()))).toBeGreaterThan(.3);
  expect(THREE.MathUtils.radToDeg(size(shake.sample()))).toBeLessThan(.5);
  shake.advance(.05); const tail = shake.sample();
  expect(size(tail)).toBeGreaterThan(.001);
  expect(size(tail)).toBeLessThan(.003);
  shake.advance(FIREARM_SHAKE_DURATION);
  expect(shake.sample()).toEqual(zero);
});

it('keeps the existing recoil dominant rather than adding another muzzle rise', () => {
  const recoil = createRecoil(), shake = createFirearmCameraShake();
  recordRecoilShot(recoil, FPS_WEAPONS[0], 0, () => .5); shake.shot(FPS_WEAPONS[0].recoil);
  advanceRecoil(recoil, .025); shake.advance(.025);
  expect(Math.abs(shake.sample().pitch)).toBeLessThan(recoilView(recoil).pitch * .25);
  expect(Math.abs(shake.sample().yaw)).toBeLessThan(.0026);
});

it('attenuates supported shots, aiming and magnified optics, and suppresses reduced motion', () => {
  const hip = createFirearmCameraShake(), supported = createFirearmCameraShake();
  hip.shot(.018); supported.shot(.018, .5);
  expect(size(supported.sample())).toBeCloseTo(size(hip.sample()) * .5);
  expect(size(hip.sample(1))).toBeCloseTo(size(hip.sample()) * .6);
  expect(size(hip.sample(1, 4))).toBeCloseTo(size(hip.sample(1)) / 4);
  expect(hip.sample(0, 1, true)).toEqual(zero);
});

it.each(FPS_WEAPONS)('bounds a sustained burst from $name without accumulating shake', weapon => {
  const shake = createFirearmCameraShake();
  for (let shot = 0; shot < 100; shot++) {
    shake.shot(weapon.recoil);
    for (let n = 0; n < Math.ceil(weapon.interval * 240); n++) {
      const pose = shake.sample();
      for (const angle of Object.values(pose)) {
        expect(Math.abs(angle)).toBeLessThanOrEqual(FIREARM_SHAKE_LIMIT);
        expect(THREE.MathUtils.radToDeg(Math.abs(angle))).toBeLessThan(.5);
      }
      shake.advance(1 / 240);
    }
  }
  shake.advance(.2); expect(shake.sample()).toEqual(zero);
});

it('does not stack even when many shot notifications arrive in one frame', () => {
  const one = createFirearmCameraShake(), many = createFirearmCameraShake(); one.shot(.018);
  for (let n = 0; n < 51; n++) many.shot(.018);
  expect(many.sample()).toEqual(one.sample());
});

it('uses wall-clock settling consistently and clears on reset or invalid inputs', () => {
  const a = createFirearmCameraShake(), b = createFirearmCameraShake(); a.shot(.018); b.shot(.018);
  a.advance(.1); for (let n = 0; n < 12; n++) b.advance(1 / 120);
  expect(a.sample().roll).toBeCloseTo(b.sample().roll, 12);
  const before = a.sample(); a.advance(0); a.advance(-1); a.advance(NaN); expect(a.sample()).toEqual(before);
  a.reset(); expect(a.sample()).toEqual(zero);
  for (const recoil of [0, -1, NaN, Infinity]) a.shot(recoil);
  expect(a.sample()).toEqual(zero);
});

it.each([false, true])('restores both camera rotations and all gameplay rays after drawing (render throws: %s)', throws => {
  const shake = createFirearmCameraShake(), world = new THREE.PerspectiveCamera(), view = new THREE.PerspectiveCamera();
  world.position.set(4, 2, -8); world.rotation.set(-.2, .7, .01, 'YXZ'); view.rotation.set(.01, -.02, .03);
  world.updateMatrixWorld(true); view.updateMatrixWorld(true);
  const before = [world.quaternion.clone(), view.quaternion.clone()];
  const eye = world.position.clone(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(), world); const direction = ray.ray.direction.clone();
  shake.shot(.018); const pose = shake.sample();
  const draw = () => {
    expect(world.quaternion.angleTo(before[0])).toBeGreaterThan(.0001);
    expect(view.quaternion.angleTo(before[1])).toBeGreaterThan(.0001);
    if (throws) throw Error('render failure');
    return 'drawn';
  };
  if (throws) expect(() => shake.render(world, view, pose, draw)).toThrow('render failure');
  else expect(shake.render(world, view, pose, draw)).toBe('drawn');
  expect(world.quaternion.toArray()).toEqual(before[0].toArray()); expect(view.quaternion.toArray()).toEqual(before[1].toArray());
  expect(world.position.equals(eye)).toBe(true);
  ray.setFromCamera(new THREE.Vector2(), world); expect(ray.ray.direction.toArray()).toEqual(direction.toArray());
});

it('does not consume randomness or alter recoil compensation and shot rays over a burst', () => {
  const baseline = createRecoil(), cosmetic = createRecoil(), shake = createFirearmCameraShake();
  const world = new THREE.PerspectiveCamera(), view = new THREE.PerspectiveCamera();
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Cosmetic shake must not consume shot randomness'); });
  try {
    for (let shot = 0; shot < 30; shot++) {
      recordRecoilShot(baseline, FPS_WEAPONS[0], 0, () => .5);
      recordRecoilShot(cosmetic, FPS_WEAPONS[0], 0, () => .5); shake.shot(FPS_WEAPONS[0].recoil);
      for (let frame = 0; frame < 8; frame++) {
        advanceRecoil(baseline, .015); advanceRecoil(cosmetic, .015); shake.advance(.015);
        expect(takeAimPush(cosmetic)).toEqual(takeAimPush(baseline));
        const original = world.quaternion.clone();
        shake.render(world, view, shake.sample(), () => undefined);
        expect(world.quaternion.toArray()).toEqual(original.toArray()); expect(cosmetic).toEqual(baseline);
      }
    }
  } finally { random.mockRestore(); }
});
