import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWeaponShoulderMotion, SHOULDER_PUSH_LIMIT } from './weapon-shoulder-motion';
import { FPS_WEAPONS } from './fps-rules';
import { createWeaponHandling } from './fps-viewmodel';
import { advanceRecoil, createRecoil, recordRecoilShot, takeAimPush } from './fps-recoil';
import { createWeaponBloom, recordBloomShot, sampleShotSpread, weaponSpread } from './fps-accuracy';

const zero = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };

it('snaps backward immediately, compresses into the shoulder, overshoots and settles', () => {
  const motion = createWeaponShoulderMotion();
  expect(motion.sample()).toEqual(zero);
  motion.shot(FPS_WEAPONS[0]);
  expect(motion.sample().z).toBeGreaterThan(.015);
  motion.advance(.02); expect(motion.sample().z).toBeGreaterThan(.03);
  let lowest = 0;
  for (let n = 0; n < 40; n++) { motion.advance(.005); lowest = Math.min(lowest, motion.sample().z); }
  expect(lowest).toBeLessThan(-.002); expect(lowest).toBeGreaterThanOrEqual(-.009);
  motion.advance(.5); expect(motion.sample()).toEqual(zero);
});

it('gives heavier weapons a slower shoulder response without changing their ratings', () => {
  const light = createWeaponShoulderMotion(), heavy = createWeaponShoulderMotion();
  const pistol = Object.freeze({ recoil: .018, weightKg: 1 }), machineGun = Object.freeze({ recoil: .018, weightKg: 12 });
  light.shot(pistol); heavy.shot(machineGun);
  light.advance(.04); heavy.advance(.04);
  expect(heavy.sample().z).toBeGreaterThan(light.sample().z);
  expect(pistol).toEqual({ recoil: .018, weightKg: 1 }); expect(machineGun).toEqual({ recoil: .018, weightKg: 12 });
});

it('restrains ADS travel/rotation, scope movement and planted bipods, and suppresses reduced motion', () => {
  const motion = createWeaponShoulderMotion(), supported = createWeaponShoulderMotion();
  motion.shot(FPS_WEAPONS[0]); supported.shot(FPS_WEAPONS[0], .5); motion.advance(.02); supported.advance(.02);
  const hip = motion.sample(), ads = motion.sample(1), scoped = motion.sample(1, 4), planted = motion.sample(0, 1, 1);
  expect(ads.z).toBeLessThan(hip.z * .35); expect(Math.abs(ads.pitch)).toBeLessThan(Math.abs(hip.pitch) * .2);
  expect(Math.abs(scoped.pitch)).toBeCloseTo(Math.abs(ads.pitch) / 4);
  expect(planted.z).toBeCloseTo(hip.z * .5);
  expect(supported.sample().z).toBeCloseTo(hip.z * .5);
  expect(motion.sample(0, 1, 0, true)).toEqual(zero);
});

it('integrates the same spring on fast and slow frames, and clears all residual motion', () => {
  const a = createWeaponShoulderMotion(), b = createWeaponShoulderMotion(); a.shot(FPS_WEAPONS[0]); b.shot(FPS_WEAPONS[0]);
  a.advance(.04); for (let n = 0; n < 8; n++) b.advance(.005);
  for (const key of Object.keys(a.sample()) as (keyof typeof zero)[]) expect(a.sample()[key]).toBeCloseTo(b.sample()[key], 10);
  const frozen = a.sample(); a.advance(0); a.advance(-1); a.advance(NaN); expect(a.sample()).toEqual(frozen);
  a.reset(); expect(a.sample()).toEqual(zero);
  for (const recoil of [0, -1, NaN, Infinity]) a.shot({ recoil });
  expect(a.sample()).toEqual(zero);
  a.shot(FPS_WEAPONS[0]); const fresh = createWeaponShoulderMotion(); fresh.shot(FPS_WEAPONS[0]);
  expect(a.sample()).toEqual(fresh.sample());
});

it.each(FPS_WEAPONS)('keeps a sustained $name burst within the shoulder envelope', spec => {
  const motion = createWeaponShoulderMotion();
  for (let shot = 0; shot < 60; shot++) {
    motion.shot(spec);
    for (let n = 0; n < Math.ceil(spec.interval * 120); n++) {
      const pose = motion.sample();
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.z).toBeGreaterThanOrEqual(-.009); expect(pose.z).toBeLessThanOrEqual(SHOULDER_PUSH_LIMIT);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(.055); expect(Math.abs(pose.roll)).toBeLessThan(.006);
      motion.advance(1 / 120);
    }
  }
  motion.advance(1); expect(motion.sample()).toEqual(zero);
});

it.each([false, true])('keeps hands attached, leaves the camera alone and restores every muzzle transform (render throws: %s)', throws => {
  const rig = new THREE.Group(), gun = new THREE.Group(), muzzle = new THREE.Object3D(), camera = new THREE.PerspectiveCamera();
  rig.position.set(.2, -.32, -.78); rig.rotation.set(.03, -.04, .02); rig.add(gun); gun.add(muzzle); muzzle.position.set(0, .3, -.6);
  const handling = createWeaponHandling(gun, 0); handling.update(null, false); rig.updateMatrixWorld(true);
  const left = gun.getObjectByName('reload-hand-left')!, grip = left.position.clone();
  const position = rig.position.clone(), rotation = rig.quaternion.clone(), muzzleBefore = muzzle.getWorldPosition(new THREE.Vector3()), cameraBefore = camera.quaternion.clone();
  const motion = createWeaponShoulderMotion(); motion.shot(FPS_WEAPONS[0]); motion.advance(.02);
  const draw = () => {
    expect(rig.position.z).toBeGreaterThan(position.z + .02);
    expect(left.position.equals(grip)).toBe(true);
    expect(gun.worldToLocal(left.getWorldPosition(new THREE.Vector3())).distanceTo(grip)).toBeLessThan(1e-10);
    expect(camera.quaternion.toArray()).toEqual(cameraBefore.toArray());
    if (throws) throw Error('draw failed'); return 'drawn';
  };
  try {
    if (throws) expect(() => motion.render(rig, motion.sample(), draw)).toThrow('draw failed');
    else expect(motion.render(rig, motion.sample(), draw)).toBe('drawn');
    expect(rig.position.toArray()).toEqual(position.toArray()); expect(rig.quaternion.toArray()).toEqual(rotation.toArray());
    expect(muzzle.getWorldPosition(new THREE.Vector3()).toArray()).toEqual(muzzleBefore.toArray());
  } finally { handling.dispose(); }
});

it('preserves recoil, compensation, spread and rays exactly through a burst without taking randomness', () => {
  const base = createRecoil(), decorated = createRecoil(), bloom = createWeaponBloom(), motion = createWeaponShoulderMotion();
  const rig = new THREE.Group(), camera = new THREE.PerspectiveCamera(); camera.rotation.set(-.2, .4, 0); camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), center = new THREE.Vector2();
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Cosmetic motion consumed gameplay randomness'); });
  try {
    for (let shot = 0; shot < 30; shot++) {
      recordRecoilShot(base, FPS_WEAPONS[0], 0, () => .5); recordRecoilShot(decorated, FPS_WEAPONS[0], 0, () => .5);
      recordBloomShot(bloom, 0); motion.shot(FPS_WEAPONS[0]);
      for (let frame = 0; frame < 8; frame++) {
        advanceRecoil(base, .015); advanceRecoil(decorated, .015); motion.advance(.015);
        expect(takeAimPush(decorated)).toEqual(takeAimPush(base));
        const before = sampleShotSpread(weaponSpread(bloom, 0, 1, false, false), () => .5);
        ray.setFromCamera(center, camera); const direction = ray.ray.direction.clone();
        motion.render(rig, motion.sample(), () => { ray.setFromCamera(center, camera); expect(ray.ray.direction.toArray()).toEqual(direction.toArray()); });
        expect(sampleShotSpread(weaponSpread(bloom, 0, 1, false, false), () => .5)).toEqual(before);
        expect(decorated).toEqual(base);
      }
    }
  } finally { random.mockRestore(); }
});
