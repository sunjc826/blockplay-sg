import { describe, expect, it } from 'vitest';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile } from './armory-state';
import { DEFAULT_VARIANTS, FPS_WEAPONS, advanceWeapon, beginReload, createLoadout, fireWeapon, validWeaponIndex, hitDamage } from './fps-rules';
import { itemById } from './armory-catalog';
import { xpForLevel } from './progression';
import { effectStyleForWeapon } from './fps-effect-styles';
import { buildServiceWeapon } from './service-weapon-models';
import { disposeModel } from './armory-visuals';
import { fitWeaponOptic, getWeaponSight } from './weapon-optics';
import { fitWeaponHardware } from './weapon-fittings';
import { createArena } from './arena-rules';
import { equipmentMovement } from './fps-encumbrance';
import { validArenaInput } from './arena-runtime';

it('upgrades a two-platform v1 save without spending currency or losing equipment', () => {
  const legacy = { ...createProfile(), credits: 77, tokens: 22, owned: ['sar-issued', 'ult-issued', 'sar-vanguard'], guns: [
    { variant: 'sar-vanguard', skin: 'skin-issued', attachments: {} },
    { variant: 'ult-issued', skin: 'skin-issued', attachments: {} },
  ] };
  const restored = restoreProfile(JSON.stringify(legacy));
  expect(restored.guns.map(gun => gun.variant)).toEqual(['sar-vanguard', ...DEFAULT_VARIANTS.slice(1)]);
  expect(restored.credits).toBe(77); expect(restored.tokens).toBe(22);
  expect(restoreProfile(JSON.stringify(restored))).toEqual(restored);
});

for (const family of [2, 3, 4]) describe(FPS_WEAPONS[family].name, () => {
  it('owns the base, gates upgrades and preserves the purchased selection across reload', () => {
    const id = ['p30-kopi', 'mag-chope', 'cis50-tuas'][family - 2], base = createProfile();
    expect(base.owned).toContain(DEFAULT_VARIANTS[family]);
    expect(equip(base, id, family)).toBe(base);
    expect(purchase(base, id).profile).toBe(base);
    const buyer = { ...base, xp: xpForLevel(itemById(id)!.requiredLevel!), credits: 10000 };
    const bought = purchase(buyer, id).profile;
    expect(bought.credits).toBe(10000 - itemById(id)!.price);
    expect(equip(bought, id, 0)).toBe(bought);
    const saved = restoreProfile(JSON.stringify(equip(bought, id, family)));
    expect(saved.guns[family].variant).toBe(id);
    expect(resolveLoadout(saved).weapons[family].equipment.attachments).toEqual({});
  });
  it('enforces cooldown and conserves ammo on reload', () => {
    const state = createLoadout()[family], spec = FPS_WEAPONS[family];
    expect(fireWeapon(state, family)).toBe(true); expect(fireWeapon(state, family)).toBe(false);
    advanceWeapon(state, family, spec.interval);
    expect(beginReload(state, family)).toBe(true); expect(fireWeapon(state, family)).toBe(false);
    advanceWeapon(state, family, spec.reload);
    expect(state.magazine).toBe(spec.capacity); expect(state.reserve).toBe(spec.reserve - 1);
  });
  it('provides muzzle/ejection/reload nodes and unobstructed iron sights', () => {
    const weapon = resolveLoadout(createProfile()).weapons[family], model = buildServiceWeapon(weapon.id)!;
    for (const suffix of ['socket_muzzle', 'socket_eject', 'magazine']) expect(model.getObjectByName(`${weapon.id}__${suffix}`)).toBeDefined();
    const remove = fitWeaponOptic(model, weapon);
    expect(getWeaponSight(model)).toBeUndefined(); expect(model.getObjectByName('fps-scope-lens')).toBeUndefined();
    remove(); disposeModel(model);
  });
  it('accepts new weapon indexes through the host simulation and network validator', () => {
    const arena = createArena([], 0); arena.addPlayer('test', 'Test');
    const actor = arena.snapshot().actors[0], input = { ...actor, weapon: family, playing: true };
    expect(validArenaInput(input)).toBe(true); arena.setInput('test', input);
    expect(arena.snapshot().actors[0].weapon).toBe(family);
    arena.shoot('test', actor, { x: 0, y: 0, z: -1 }, family);
    expect(arena.snapshot().actors[0].shots).toBe(1);
  });
});

it('keeps each class distinct and makes caliber width independent of power', () => {
  const [rifle, , pistol, gpmg, heavy] = resolveLoadout(createProfile()).weapons;
  expect(pistol.fireMode).toBe('semi'); expect(pistol.mobility).toBeGreaterThan(rifle.mobility);
  expect(pistol.reload).toBeLessThan(rifle.reload);
  expect(heavy.mobility).toBeLessThan(gpmg.mobility); expect(gpmg.mobility).toBeLessThan(rifle.mobility);
  const fx = [rifle, pistol, gpmg, heavy].map(effectStyleForWeapon);
  expect(fx[3].impact.holeRadius).toBeGreaterThan(fx[1].impact.holeRadius);
  expect(fx[1].impact.holeRadius).toBeGreaterThan(fx[2].impact.holeRadius);
  expect(fx[2].impact.holeRadius).toBeGreaterThan(fx[0].impact.holeRadius);
  expect(fx[3].impact.holeDepth).toBeGreaterThan(fx[1].impact.holeDepth);
  const base = createProfile(), id = 'cis50-merlion';
  const premium = resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, 4)).weapons[4];
  const pfx = effectStyleForWeapon(premium);
  expect(pfx.impact.holeRadius).toBe(fx[3].impact.holeRadius);
  expect(pfx.impact.smokeSize).toBeGreaterThan(fx[3].impact.smokeSize);
  const model = buildServiceWeapon(premium.id)!;
  const remove = fitWeaponHardware(model, premium); expect(model.getObjectByName('equipped-hardware')).toBeDefined();
  remove(); expect(model.getObjectByName('equipped-hardware')).toBeUndefined(); disposeModel(model);
});
it('rejects malformed or out-of-range family indexes', () => {
  for (const index of [-1, 5, .5, NaN, Infinity, '2', null]) expect(validWeaponIndex(index)).toBe(false);
});

it('makes every .50 variant lethal unarmored at any range while retaining handling costs', () => {
  const base = createProfile();
  for (const id of ['cis50-issued', 'cis50-tuas', 'cis50-merlion']) {
    const loadout = resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, 4));
    const heavy = loadout.weapons[4], rifle = loadout.weapons[0];
    for (const range of [0, 55, 90, 140, 300]) {
      expect(hitDamage(heavy, range, 'body')).toBeGreaterThanOrEqual(115);
    }
    const held = equipmentMovement(loadout, 4), pistol = equipmentMovement(loadout, 2);
    expect(held.movement).toBeLessThan(pistol.movement * .6);
    expect(held.aimSpeed).toBeLessThan(pistol.aimSpeed * .6);
    expect(heavy.recoil).toBeGreaterThan(rifle.recoil * 2);
    expect(heavy.recoilRecovery).toBeLessThan(rifle.recoilRecovery);
  }
});

it('places the GPMG between the rifle and heavy MG for lethality and handling', () => {
  const base = createProfile();
  for (const id of ['mag-issued', 'mag-chope', 'mag-jaga']) {
    const loadout = resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, 3));
    const mag = loadout.weapons[3];
    for (const health of [100, 115]) {
      for (const range of [0, 20, 45]) expect(Math.ceil(health / hitDamage(mag, range, 'body'))).toBe(2);
      expect(Math.ceil(health / hitDamage(mag, 120, 'body'))).toBe(3);
    }
    const heavyLoadout = resolveLoadout(equip(base, 'cis50-issued', 4));
    const rifleLoadout = resolveLoadout(base);
    const handling = equipmentMovement(loadout, 3);
    for (const stat of ['movement', 'aimSpeed'] as const) {
      expect(handling[stat]).toBeGreaterThan(equipmentMovement(heavyLoadout, 4)[stat]);
      expect(handling[stat]).toBeLessThan(equipmentMovement(rifleLoadout, 0)[stat]);
    }
    expect(mag.recoil).toBeGreaterThan(loadout.weapons[0].recoil);
    expect(mag.recoil).toBeLessThan(heavyLoadout.weapons[4].recoil);
  }
});
