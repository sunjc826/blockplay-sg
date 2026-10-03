import { expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWeaponBipod, createBipodMotion, poseWeaponBipod } from './weapon-bipod';
import { buildServiceWeapon } from './service-weapon-models';
import { createWeaponHandling } from './fps-viewmodel';
import { disposeModel } from './armory-visuals';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { fitWeaponHardware } from './weapon-fittings';

const planted = { prone: true, grounded: true, speed: 0, eyeHeight: .55, dt: 1 / 60 };
for (const id of ['ultimax-inspired', 'mag-inspired', 'cis50-inspired']) {
  it(`${id}: unfolds from connected pivots, spreads symmetrically and keeps the soles level`, () => {
    const root = buildWeaponBipod(id)!;
    const left = root.getObjectByName(`${id}__bipod-left-fold`)!;
    const foot = root.getObjectByName(`${id}__bipod-left-foot`)!;
    const pivot = left.position.clone(), folded = foot.getWorldPosition(new THREE.Vector3());
    poseWeaponBipod(root, id, .5);
    const half = foot.getWorldPosition(new THREE.Vector3());
    poseWeaponBipod(root, id, 1);
    const deployed = foot.getWorldPosition(new THREE.Vector3());
    const right = root.getObjectByName(`${id}__bipod-right-foot`)!.getWorldPosition(new THREE.Vector3());
    expect(left.position.equals(pivot)).toBe(true);
    expect(half.y).toBeLessThan(folded.y); expect(half.y).toBeGreaterThan(deployed.y);
    expect(deployed.y).toBeLessThan(folded.y - .2);
    expect(deployed.x).toBeLessThan(pivot.x - .07);
    expect(right.y).toBeCloseTo(deployed.y, 8); expect(right.x).toBeCloseTo(-deployed.x, 8);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(foot.getWorldQuaternion(new THREE.Quaternion()));
    expect(up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
    poseWeaponBipod(root, id, 0);
    expect(foot.getWorldPosition(new THREE.Vector3()).distanceTo(folded)).toBeLessThan(1e-6);
    disposeModel(root);
  });

  it(`${id}: deploys gradually only in settled prone and reverses smoothly for movement or lost support`, () => {
    const root = buildWeaponBipod(id)!, motion = createBipodMotion(root, id);
    motion.update({ ...planted, eyeHeight: 1.5, dt: 1 }); expect(motion.progress).toBe(0);
    motion.update(planted); expect(motion.progress).toBeGreaterThan(0); expect(motion.progress).toBeLessThan(.05);
    for (let i = 0; i < 90; i++) motion.update(planted);
    expect(motion.progress).toBeCloseTo(1);
    motion.update({ ...planted, speed: .7 }); expect(motion.progress).toBeGreaterThan(.8); expect(motion.progress).toBeLessThan(1);
    for (let i = 0; i < 30; i++) motion.update({ ...planted, speed: .7 });
    expect(motion.progress).toBe(0);
    motion.update({ ...planted, dt: 1 }); expect(motion.progress).toBeCloseTo(1);
    motion.update({ ...planted, grounded: false, dt: 1 }); expect(motion.progress).toBe(0);
    motion.update({ ...planted, dt: 1 }); motion.update(); expect(motion.progress).toBe(0);
    disposeModel(root);
  });
}

for (const [family, variants] of [[3, ['mag-issued', 'mag-chope', 'mag-jaga']], [4, ['cis50-issued', 'cis50-tuas', 'cis50-merlion']]] as const) {
  for (const variant of variants) it(`${variant}: retains one rig through reload, reset and weapon handling disposal`, () => {
    const base = createProfile(), weapon = resolveLoadout(equip({ ...base, owned: [...base.owned, variant] }, variant, family)).weapons[family];
    const model = buildServiceWeapon(weapon.id)!, remove = fitWeaponHardware(model, weapon);
    const handling = createWeaponHandling(model, family);
    handling.update(null, false, { ...planted, dt: 1 });
    const foot = model.getObjectByName(`${weapon.id}__bipod-left-foot`)!;
    const deployed = foot.getWorldPosition(new THREE.Vector3());
    handling.update(.42, false, planted);
    expect(handling.bipodDeployment).toBeCloseTo(1);
    expect(foot.getWorldPosition(new THREE.Vector3()).distanceTo(deployed)).toBeLessThan(1e-6);
    expect(model.getObjectByName(`${weapon.id}__feed-belt`)!.visible).toBe(false);
    expect(model.getObjectsByProperty('name', `${weapon.id}__bipod`)).toHaveLength(1);
    expect(model.getObjectByName(`${weapon.id}__deployed-mount`)).toBeUndefined();
    handling.resetBipod(); expect(handling.bipodDeployment).toBe(0);
    handling.update(null, false, { ...planted, dt: 1 }); handling.dispose();
    expect(foot.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(deployed.y + .2);
    remove(); disposeModel(model);
  });
}

it('does not attach bipods to rifles or pistols', () => {
  expect(buildWeaponBipod('sar21-inspired')).toBeNull(); expect(buildWeaponBipod('p30-inspired')).toBeNull();
});
