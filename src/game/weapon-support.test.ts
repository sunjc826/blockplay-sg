import { expect, it } from 'vitest';
import * as THREE from 'three';
import { BIPOD_PROFILES, bipodRecoilMultiplier, type BipodKind } from './weapon-support';
import { buildWeaponBipod, createBipodMotion } from './weapon-bipod';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { ARMORY_CATALOG } from './armory-catalog';
import { dressWeapon, disposeModel } from './armory-visuals';
import { buildServiceWeapon } from './service-weapon-models';

it('trades deployment and folding speed for increasing recoil stability', () => {
  const times: number[] = [];
  for (const kind of ['quick', 'standard', 'heavy'] as const) {
    const root = buildWeaponBipod('mag-inspired', kind)!, motion = createBipodMotion(root, 'mag-inspired');
    let elapsed = 0;
    while (motion.progress < .999 && elapsed < 2) {
      motion.update({ prone: true, grounded: true, speed: 0, eyeHeight: .55, dt: .01 }); elapsed += .01;
    }
    expect(elapsed).toBeCloseTo(BIPOD_PROFILES[kind].deploy, 2); times.push(elapsed);
    expect(bipodRecoilMultiplier(kind, 1, true, true, 0)).toBeCloseTo(BIPOD_PROFILES[kind].recoil);
    disposeModel(root);
  }
  expect(times[0]).toBeLessThan(times[1]); expect(times[1]).toBeLessThan(times[2]);
  expect(BIPOD_PROFILES.quick.recoil).toBeGreaterThan(BIPOD_PROFILES.standard.recoil);
  expect(BIPOD_PROFILES.standard.recoil).toBeGreaterThan(BIPOD_PROFILES.heavy.recoil);
  expect(buildWeaponBipod('ultimax-inspired', 'none')).toBeNull();
});

it('grants no free support while folding, moving, rising or airborne', () => {
  expect(bipodRecoilMultiplier('none', 1, true, true, 0)).toBe(1);
  expect(bipodRecoilMultiplier('heavy', .75, true, true, 0)).toBe(1);
  const partial = bipodRecoilMultiplier('heavy', .875, true, true, 0);
  expect(partial).toBeGreaterThan(.65); expect(partial).toBeLessThan(1);
  expect(bipodRecoilMultiplier('heavy', 1, true, true, .16)).toBe(1);
  expect(bipodRecoilMultiplier('heavy', 1, false, true, 0)).toBe(1);
  expect(bipodRecoilMultiplier('heavy', 1, true, false, 0)).toBe(1);
  expect(bipodRecoilMultiplier('heavy', NaN, true, true, 0)).toBe(1);
});

const variants: [number, string, BipodKind][] = [
  [1, 'ult-issued', 'standard'], [1, 'ult-patrol', 'none'], [1, 'ult-centurion', 'quick'], [1, 'ult-bastion', 'heavy'],
  [3, 'mag-issued', 'standard'], [3, 'mag-chope', 'heavy'], [3, 'mag-jaga', 'quick'],
  [4, 'cis50-issued', 'heavy'], [4, 'cis50-tuas', 'quick'], [4, 'cis50-merlion', 'standard'],
];
for (const [family, variant, kind] of variants) it(`${variant} resolves and displays its actual support package without duplicates`, () => {
  const base = createProfile(), spec = resolveLoadout(equip({ ...base, owned: [...base.owned, variant] }, variant, family)).weapons[family];
  expect(spec.bipod).toBe(kind);
  const root = buildServiceWeapon(spec.id) ?? new THREE.Group();
  const original = root.getObjectByName(`${spec.id}__bipod`);
  const undress = dressWeapon(root, spec);
  const rigs = root.getObjectsByProperty('name', `${spec.id}__bipod`);
  expect(rigs).toHaveLength(kind === 'none' ? 0 : 1);
  if (kind !== 'none') expect(rigs[0].userData.bipodKind).toBe(kind);
  undress(); expect(root.getObjectByName(`${spec.id}__bipod`)).toBe(original);
  disposeModel(root);
});

it('never removes the required support from an issued .50 or changes existing unlocks', () => {
  for (const item of ARMORY_CATALOG.filter(item => item.category === 'weapon')) {
    const base = createProfile(), spec = resolveLoadout(equip({ ...base, owned: [...base.owned, item.id] }, item.id, item.family!)).weapons[item.family!];
    if (spec.requiresMount) expect(spec.bipod).not.toBe('none');
  }
  const base = createProfile();
  const issued = resolveLoadout(equip(base, 'ult-issued', 1)).weapons[1];
  const mobile = resolveLoadout(equip({ ...base, owned: [...base.owned, 'ult-patrol'] }, 'ult-patrol', 1)).weapons[1];
  expect(mobile.weightKg!).toBeLessThan(issued.weightKg!); expect(mobile.mobility).toBeGreaterThan(issued.mobility);
});
