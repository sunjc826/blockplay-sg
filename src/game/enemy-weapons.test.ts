import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARMORY_CATALOG, isEnemyIssue, isShopFamily, issuedItems, itemById } from './armory-catalog';
import { createProfile, equip, purchase, resolveLoadout, restoreProfile } from './armory-state';
import { DEFAULT_VARIANTS, FPS_WEAPONS } from './fps-rules';
import { ENEMY_WEAPON_LAYOUT, enemyOptic } from './enemy-weapon-layout';
import { dressWeapon } from './armory-visuals';
import { getWeaponSight } from './weapon-optics';
import { applyEnemyWeaponConfig, buildEnemyWeapon } from './enemy-weapon-models';
import { buildServiceWeapon } from './service-weapon-models';
import { armamentFamilies, chooseArmament, listArenaRoles } from './arena-roles';
import { createArena } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { createExpeditionLoot, equipFieldLoot, createFieldEquipment, MAX_FIELD_DROPS, rollZoneWeapon } from './expedition-loot';

const enemy = ARMORY_CATALOG.filter(item => item.category === 'weapon' && isEnemyIssue(item));
const family = (id: string) => FPS_WEAPONS.findIndex(weapon => weapon.id === id);
const resolved = (id: string) => {
  const item = itemById(id)!, base = createProfile();
  return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, item.family!)).weapons[item.family!];
};

describe('enemy-issue catalog', () => {
  it('adds the XM8, G36 and MG4 as their own platforms, each with variants', () => {
    for (const id of ['xm8-inspired', 'g36-inspired', 'mg4-inspired']) {
      const variants = enemy.filter(item => item.family === family(id));
      expect(variants.length, id).toBeGreaterThanOrEqual(3);
      expect(variants.filter(item => item.tier === 'Issued').map(item => item.id)).toEqual([DEFAULT_VARIANTS[family(id)]]);
      // Every variant names a configuration the model actually has.
      for (const item of variants) expect(Object.keys(ENEMY_WEAPON_LAYOUT[id as keyof typeof ENEMY_WEAPON_LAYOUT].configs), item.id).toContain(item.config);
    }
  });
  it('never sells, issues or crates them', () => {
    const profile = createProfile();
    for (const item of enemy) {
      expect(issuedItems).not.toContain(item.id);
      expect(profile.owned).not.toContain(item.id);
      expect(purchase({ ...profile, credits: 1e6, tokens: 1e6, xp: 1e6 }, item.id).profile.owned).not.toContain(item.id);
    }
    for (const id of ['xm8-inspired', 'g36-inspired', 'mg4-inspired']) expect(isShopFamily(family(id))).toBe(false);
    for (const index of [0, 1, 2, 3, 4]) expect(isShopFamily(index)).toBe(true);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 400; i++) expect(isEnemyIssue(rollZoneWeapon('raffles-place', random, 1))).toBe(false);
  });
  it('drops enemy issue from a restored save, so it lasts one expedition', () => {
    const saved = { ...createProfile(), owned: [...createProfile().owned, 'mg4-sustained'] };
    saved.guns[family('mg4-inspired')] = { variant: 'mg4-sustained', skin: 'skin-issued', attachments: {} };
    const restored = restoreProfile(JSON.stringify(saved));
    expect(restored.owned).not.toContain('mg4-sustained');
    expect(restored.guns[family('mg4-inspired')].variant).toBe('mg4-standard');
  });
  it('resolves the figures the descriptions advertise', () => {
    expect(resolved('xm8-sharpshooter').damage).toBe(53);
    expect(resolved('xm8-sharpshooter').capacity).toBe(20);
    expect(resolved('mg36').damage).toBe(42);
    expect(resolved('mg36').capacity).toBe(100);
    expect(resolved('xm8-automatic').capacity).toBe(100);
    expect(resolved('mg4-sustained').damage).toBe(38);
    expect(resolved('mg4-sustained').capacity).toBe(200);
    expect(resolved('xm8-compact').interval).toBeLessThan(resolved('xm8-carbine').interval);
    expect(resolved('g36c').mobility).toBeGreaterThan(resolved('g36k').mobility);
    expect(resolved('mg4ke').bipod).toBe('quick');
    expect(resolved('mg4-standard').feed).toBe('belt');
  });
});

describe('enemy weapon models', () => {
  it('builds every platform with the nodes the viewmodel animates', () => {
    for (const id of ['xm8-inspired', 'g36-inspired', 'mg4-inspired']) {
      const model = buildServiceWeapon(id)!;
      expect(model.name).toBe(id);
      for (const node of ['magazine', 'charging-handle', 'socket_muzzle', 'socket_eject']) expect(model.getObjectByName(`${id}__${node}`), node).toBeTruthy();
      if (id === 'mg4-inspired') for (const node of ['feed-cover', 'feed-belt']) expect(model.getObjectByName(`${id}__${node}`), node).toBeTruthy();
    }
  });
  it('shows one configuration at a time and moves the muzzle with it', () => {
    const model = buildEnemyWeapon('xm8-inspired')!;
    const visible = (name: string) => model.getObjectsByProperty('name', `xm8-inspired__config-${name}`).some(node => node.visible);
    expect(visible('handguard-carbine')).toBe(true); expect(visible('twin-drum')).toBe(false);
    const restore = applyEnemyWeaponConfig(model, 'xm8-inspired', 'automatic');
    expect(visible('handguard-carbine')).toBe(false); expect(visible('twin-drum')).toBe(true); expect(visible('magazine-30')).toBe(false);
    expect(model.getObjectByName('xm8-inspired__socket_muzzle')!.position.z).toBe(ENEMY_WEAPON_LAYOUT['xm8-inspired'].configs.automatic.muzzle);
    restore();
    expect(visible('handguard-carbine')).toBe(true); expect(visible('twin-drum')).toBe(false);
    expect(model.getObjectByName('xm8-inspired__socket_muzzle')!.position.z).toBe(ENEMY_WEAPON_LAYOUT['xm8-inspired'].configs.carbine.muzzle);
  });
  it('keeps the aiming line clear between the eye and the front of the sight', () => {
    // Cast down the sight line from behind the rear sight. Through a red dot or
    // over irons nothing may be hit short of the front sight; a scope is looked
    // into, so nothing may stand between the eye and its eyepiece lens.
    for (const [id, layout] of Object.entries(ENEMY_WEAPON_LAYOUT)) for (const config of Object.keys(layout.configs)) {
      const model = buildEnemyWeapon(id)!; applyEnemyWeaponConfig(model, id, config); model.updateMatrixWorld(true);
      const solids: THREE.Object3D[] = [];
      model.traverseVisible(node => { if (node instanceof THREE.Mesh && !/front-sight/.test(node.name)) solids.push(node); });
      const optic = enemyOptic(id, config);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, optic?.height ?? layout.sightHeight, .6), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObjects(solids, false)[0];
      if (optic?.kind === 'scope') expect(hit!.point.z, `${id} ${config}: ${hit?.object.name}`).toBeLessThan(optic.lens);
      else expect(hit, `${id} ${config}: ${hit?.object.name}`).toBeUndefined();
    }
  });
  it('fits a collimated dot to the XM8 and G36C and a magnified scope to the other G36s', () => {
    const fitted = (variant: string) => {
      const weapon = resolved(variant), model = buildServiceWeapon(weapon.id)!;
      dressWeapon(model, weapon);
      return { weapon, sight: getWeaponSight(model)!, optic: enemyOptic(weapon.id, itemById(variant)!.config)! };
    };
    for (const variant of ['xm8-carbine', 'xm8-sharpshooter', 'g36c']) {
      const { weapon, sight, optic } = fitted(variant);
      expect(optic.kind, variant).toBe('reflex'); expect(weapon.optic, variant).toBe('reflex');
      expect(sight.magnification, variant).toBe(1);
      expect(sight.lens.position.z).toBe(optic.lens); expect(sight.aimHeight).toBe(optic.height);
    }
    for (const variant of ['g36-rifle', 'g36k', 'mg36']) {
      const { weapon, sight, optic } = fitted(variant);
      expect(optic.kind, variant).toBe('scope'); expect(weapon.optic, variant).toBe('integrated');
      expect(sight.magnification, variant).toBeCloseTo(3);
      expect(sight.aimDepth).toBe(optic.aimDepth);
    }
    // The MG4 keeps its irons: no lens is fitted.
    const mg4 = buildServiceWeapon('mg4-inspired')!; dressWeapon(mg4, resolved('mg4-standard'));
    expect(getWeaponSight(mg4)).toBeUndefined();
  });
});

describe('enemy squads', () => {
  it('arms every role from enemy issue and draws again on each spawn', () => {
    for (const role of listArenaRoles()) {
      expect(armamentFamilies(role).every(index => FPS_WEAPONS[index].id.match(/xm8|g36|mg4/))).toBe(true);
      let seed = 3; const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
      const drawn = new Set(Array.from({ length: 200 }, () => chooseArmament(role, random).id));
      expect(drawn.size, role.id).toBe(role.armament.length);
    }
    const arena = createArena([], 6, 'mixed');
    const actors = arena.snapshot().actors;
    for (const actor of actors) {
      const item = itemById(actor.variant!)!;
      expect(isEnemyIssue(item)).toBe(true); expect(item.family).toBe(actor.weapon);
    }
    expect(validArenaSnapshot(arena.snapshot())).toBe(true);
    expect(validArenaSnapshot({ ...arena.snapshot(), actors: actors.map(actor => ({ ...actor, variant: 7 })) })).toBe(false);
  });
});

describe('dropped enemy weapons', () => {
  it('leaves a pickup where the enemy fell and keeps only the newest', () => {
    const loot = createExpeditionLoot('drops');
    expect(loot.drop('marina-bay', 'sar-issued', { x: 0, z: 0 })).toBeNull();
    expect(loot.drop('marina-bay', 'xm8-compact', { x: NaN, z: 0 })).toBeNull();
    const first = loot.drop('marina-bay', 'xm8-compact', { x: 3, z: 4, y: 0 })!;
    expect(first.loot).toMatchObject({ kind: 'weapon', catalogId: 'xm8-compact', tier: 'Field', dropped: true, x: 3, z: 4 });
    expect(loot.nearest('marina-bay', { x: 3.5, z: 4, y: 0 })?.id).toBe(first.loot.id);
    const evicted: string[] = [];
    for (let i = 0; i < MAX_FIELD_DROPS; i++) evicted.push(...loot.drop('marina-bay', 'mg4-standard', { x: 20 + i * 3, z: 0 })!.evicted);
    expect(evicted).toEqual([first.loot.id]);
    expect(loot.remaining('marina-bay').filter(item => item.dropped)).toHaveLength(MAX_FIELD_DROPS);
    // Taking one makes it field equipment like any crate weapon, and it is gone from the ground.
    const taken = loot.collect('marina-bay', loot.nearest('marina-bay', { x: 20, z: 0 })!.id, { x: 20, z: 0 })!;
    expect(equipFieldLoot(createFieldEquipment(), taken).weapons[family('mg4-inspired')]).toBe('mg4-standard');
    expect(loot.remaining('marina-bay').filter(item => item.dropped)).toHaveLength(MAX_FIELD_DROPS - 1);
    expect(JSON.stringify(loot.snapshot())).not.toContain('drop-');
  });
});
