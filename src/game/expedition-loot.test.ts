import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { createProfile, variantSpec } from './armory-state';
import {
  createExpeditionLoot, createFieldEquipment, equipFieldLoot, resolveExpeditionLoadout, rollZoneWeapon,
  ZONE_LOOT_RULES, type FieldLoot, type LootZoneGeometry,
} from './expedition-loot';
import type { WorldZoneId } from './world-zones';

const zone = (id: WorldZoneId = 'marina-bay'): LootZoneGeometry => ({ id, spawn: { x: 0, z: 0 }, bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, obstacles: [] });
const pickup = (catalogId: string, kind: 'weapon' | 'armor' = 'weapon'): FieldLoot => ({
  id: 'test', zoneId: 'marina-bay', kind, catalogId, name: 'Test pickup', tier: 'Elite', x: 0, z: 0, amount: 1,
});

describe('seeded expedition loot', () => {
  it('creates stable positions and known catalog items from a seed, independently of visit order', () => {
    const first = createExpeditionLoot('expedition-42'); const second = createExpeditionLoot('expedition-42');
    const marina = first.enterZone(zone()); first.enterZone(zone('queenstown'));
    second.enterZone(zone('queenstown')); expect(second.enterZone(zone())).toEqual(marina);
    expect(createExpeditionLoot('another-expedition').enterZone(zone())).not.toEqual(marina);
    for (const item of marina) {
      expect(Math.hypot(item.x, item.z)).toBeGreaterThanOrEqual(14.99);
      expect(Math.hypot(item.x, item.z)).toBeLessThanOrEqual(45.01);
      if (item.catalogId) expect(itemById(item.catalogId)?.category).toBe(item.kind === 'armor' ? 'plate' : item.kind === 'weapon' ? 'weapon' : 'consumable');
    }
  });
  it('keeps collected IDs across re-entry and prevents duplicate, remote or cross-zone pickup', () => {
    const expedition = createExpeditionLoot(42); const items = expedition.enterZone(zone()); const item = items[0];
    expect(expedition.collect('marina-bay', item.id, { x: 1000, z: 1000 })).toBeNull();
    expect(expedition.collect('queenstown', item.id, item)).toBeNull();
    expect(expedition.collect('marina-bay', item.id, item)).toEqual(item);
    expect(expedition.collect('marina-bay', item.id, item)).toBeNull();
    expedition.enterZone(zone('queenstown'));
    const reentry = expedition.enterZone({ ...zone(), spawn: { x: 80, z: 80 } });
    expect(reentry).toEqual(items.slice(1)); expect(expedition.snapshot().collected).toEqual([item.id]);
    expect(expedition.collect('marina-bay', items[1].id, { x: NaN, z: items[1].z })).toBeNull();
  });
  it('returns detached loot data and finds only pickups within interaction range', () => {
    const expedition = createExpeditionLoot('detached'); const item = expedition.enterZone(zone())[0];
    expect(expedition.nearest('marina-bay', item)?.id).toBe(item.id);
    expect(expedition.nearest('marina-bay', { x: 1000, z: 1000 }, 2000)).toBeNull();
    item.x = 999; item.name = 'corrupted';
    expect(expedition.remaining('marina-bay')[0].x).not.toBe(999);
    const snapshot = expedition.snapshot(); snapshot.zones[0].loot[0].name = 'corrupted';
    expect(expedition.remaining('marina-bay')[0].name).not.toBe('corrupted');
  });
  it('respects custom zone bounds, obstacles and spacing without assuming Marina coordinates', () => {
    const geometry: LootZoneGeometry = {
      ...zone('raffles-place'), spawn: { x: 1000, z: 1000 }, bounds: { minX: 950, maxX: 1050, minZ: 950, maxZ: 1050 },
      obstacles: [{ minX: 950, maxX: 1000, minZ: 950, maxZ: 1050 }],
    };
    const items = createExpeditionLoot('cover').enterZone(geometry);
    expect(items).toHaveLength(10);
    for (const item of items) {
      expect(item.x).toBeGreaterThanOrEqual(1000.65); expect(item.x).toBeLessThanOrEqual(1049.35);
      expect(item.z).toBeGreaterThanOrEqual(950.65); expect(item.z).toBeLessThanOrEqual(1049.35);
      for (const other of items) if (other.id !== item.id) expect(Math.hypot(other.x - item.x, other.z - item.z)).toBeGreaterThanOrEqual(3);
    }
  });
  it('uses curated safe anchors and never places loot inside a fully blocked zone', () => {
    const anchors = Array.from({ length: 8 }, (_, i) => ({ x: 10 + i * 4, z: 10 }));
    const loot = createExpeditionLoot('anchors').enterZone({ ...zone(), anchors });
    expect(loot.every(item => anchors.some(p => p.x === item.x && p.z === item.z))).toBe(true);
    expect(createExpeditionLoot('blocked').enterZone({ ...zone(), obstacles: [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }] })).toEqual([]);
    expect(createExpeditionLoot('invalid').enterZone({ ...zone(), spawn: { x: Infinity, z: 0 } })).toEqual([]);
  });
  it('sets elite weapon odds to 5% in Queenstown, 15% in Marina and 50% in the CBD', () => {
    for (const id of ['queenstown', 'marina-bay', 'raffles-place'] as const) {
      let elites = 0;
      for (let sample = 0; sample < 1000; sample++) {
        let call = 0;
        const item = rollZoneWeapon(id, () => call++ === 0 ? sample / 1000 : 0);
        if (item.tier === 'Elite') elites++;
        expect(item.category).toBe('weapon');
      }
      expect(elites).toBe(ZONE_LOOT_RULES[id].eliteChance * 1000);
    }
  });
  it('gives the CBD more weapon crates and stronger supply packs than residential zones', () => {
    const expedition = createExpeditionLoot('risk-reward');
    const cbd = expedition.enterZone(zone('raffles-place')); const residential = expedition.enterZone(zone('queenstown'));
    expect(cbd.filter(item => item.kind === 'weapon')).toHaveLength(4);
    expect(residential.filter(item => item.kind === 'weapon')).toHaveLength(2);
    expect(cbd.find(item => item.kind === 'ammo')!.amount).toBeGreaterThan(residential.find(item => item.kind === 'ammo')!.amount);
    expect(cbd.find(item => item.kind === 'medical')!.amount).toBeGreaterThan(residential.find(item => item.kind === 'medical')!.amount);
  });
  it('uses a weighted food-stall anchor without adding to the district loot distribution', () => {
    const foodAnchors = [{ x: 12, z: 16 }, { x: 16, z: 16 }];
    const geometry: LootZoneGeometry = { ...zone('chinatown'), sectors: [
      { id: 'hawker', name: 'Hawker centre', cover: 'broken', lootWeight: 3, anchors: [{ x: 20, z: 20 }, { x: 24, z: 20 }, { x: 28, z: 20 }], foodAnchors,
        bounds: { minX: 5, maxX: 35, minZ: 5, maxZ: 30 } },
      { id: 'road', name: 'Main road', cover: 'open', lootWeight: 1, anchors: [{ x: -12, z: -16 }, { x: -16, z: -16 }, { x: -20, z: -16 }],
        bounds: { minX: -35, maxX: -5, minZ: -30, maxZ: -5 } },
    ] };
    const loot = createExpeditionLoot('hawker-distribution').enterZone(geometry);
    const rules = ZONE_LOOT_RULES.chinatown;
    expect(loot).toHaveLength(rules.weaponCount + rules.ammoCount + rules.medicalCount + rules.armorCount);
    const food = loot.filter(item => item.placement === 'food-stall');
    expect(food).toHaveLength(1);
    expect(foodAnchors).toContainEqual({ x: food[0].x, z: food[0].z });
    expect(itemById(food[0].catalogId!)?.supplyType).toBe('food');
    expect(loot.filter(item => item.kind === 'medical')).toHaveLength(rules.medicalCount);
    expect(loot.filter(item => item.kind === 'ammo').every(item => item.catalogId === 'kit-ammo')).toBe(true);
  });
  it('uses the district sector weights when choosing between food venues', () => {
    const sectors: NonNullable<LootZoneGeometry['sectors']> = [
      { id: 'busy-hawker', name: 'Busy hawker centre', cover: 'broken', lootWeight: 3,
        anchors: [{ x: 24, z: 20 }], foodAnchors: [{ x: 16, z: 16 }], bounds: { minX: 5, maxX: 35, minZ: 5, maxZ: 30 } },
      { id: 'quiet-kiosk', name: 'Quiet kiosk', cover: 'open', lootWeight: 1,
        anchors: [{ x: -24, z: -20 }], foodAnchors: [{ x: -16, z: -16 }], bounds: { minX: -35, maxX: -5, minZ: -30, maxZ: -5 } },
    ];
    const selections = { 'busy-hawker': 0, 'quiet-kiosk': 0 };
    for (let sample = 0; sample < 400; sample++) {
      const food = createExpeditionLoot(`venue-weight-${sample}`).enterZone({ ...zone('chinatown'), sectors })
        .find(item => item.placement === 'food-stall')!;
      selections[food.sectorId as keyof typeof selections]++;
    }
    expect(selections['busy-hawker']).toBeGreaterThan(selections['quiet-kiosk'] * 2);
  });
  it('keeps recovery loot as field utilities when a district has no food venue', () => {
    const loot = createExpeditionLoot('no-kiosk').enterZone(zone('tuas'));
    expect(loot.filter(item => item.kind === 'medical').every(item => item.placement === 'field' && itemById(item.catalogId!)?.supplyType !== 'food')).toBe(true);
  });
});

describe('temporary expedition equipment', () => {
  it('equips known variant and plate stats without granting purchases, levels or currency', () => {
    const profile = createProfile(); const before = JSON.stringify(profile);
    const rifle = equipFieldLoot(createFieldEquipment(), pickup('sar-vanguard'));
    const armored = equipFieldLoot(rifle, pickup('plate-ceramic', 'armor'));
    const resolved = resolveExpeditionLoadout(profile, armored);
    // Read from the catalog: this test is about field loot applying a variant's
    // stats, not about what those stats are currently balanced to.
    const vanguard = variantSpec(itemById('sar-vanguard')!)!;
    expect(resolved.weapons[0].damage).toBe(vanguard.damage); expect(resolved.weapons[0].capacity).toBe(vanguard.capacity);
    expect(resolved.armor).toBe(75); expect(resolved.absorption).toBe(0.65);
    expect(JSON.stringify(profile)).toBe(before); expect(profile.owned).not.toContain('sar-vanguard');
    expect(rifle.plate).toBeUndefined();
  });
  it('rejects unknown IDs, cosmetics posing as weapons and mismatched weapon families', () => {
    const equipment = createFieldEquipment();
    expect(equipFieldLoot(equipment, pickup('not-in-catalog'))).toBe(equipment);
    expect(equipFieldLoot(equipment, pickup('skin-gold'))).toBe(equipment);
    const loadout = resolveExpeditionLoadout(createProfile(), { weapons: { 0: 'ult-centurion', 1: 'skin-gold' }, plate: 'sar-vanguard' });
    expect(loadout.weapons[0].damage).toBe(36); expect(loadout.weapons[1].damage).toBe(30); expect(loadout.armor).toBe(0);
  });
});
