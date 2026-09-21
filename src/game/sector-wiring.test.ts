import { describe, expect, it } from 'vitest';
import { createExpeditionLoot, rollZoneWeapon, ZONE_LOOT_RULES, type LootZoneGeometry } from './expedition-loot';
import { patrolSpawns } from './district-world';
import { getRegion } from './regions';
import { sectorAt, zoneSectors } from './zone-sectors';
import { getWorldZone, WORLD_ZONES, type WorldZoneId } from './world-zones';

const SECTORED: WorldZoneId = 'harbourfront';
const geometry = (id: WorldZoneId, obstacles: LootZoneGeometry['obstacles'] = []): LootZoneGeometry => {
  const region = getRegion(id), zone = getWorldZone(id);
  return { id, spawn: zone.spawn, bounds: region.bounds, obstacles, anchors: zone.encounterSpawns, sectors: zoneSectors(id) };
};

describe('loot placement across sectors', () => {
  it('spreads a district\'s crates over several named places', () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 12; seed++) {
      for (const crate of createExpeditionLoot(`spread-${seed}`).enterZone(geometry(SECTORED))) {
        if (crate.sectorId) found.add(crate.sectorId);
      }
    }
    // Before sectors every crate came from six points or a ring round the spawn.
    expect(found.size).toBeGreaterThanOrEqual(6);
  });

  it('gives a heavier sector more crates than a light one over many seeds', () => {
    const tally = new Map<string, number>();
    for (let seed = 0; seed < 120; seed++) {
      for (const crate of createExpeditionLoot(`weight-${seed}`).enterZone(geometry(SECTORED))) {
        if (crate.sectorId) tally.set(crate.sectorId, (tally.get(crate.sectorId) ?? 0) + 1);
      }
    }
    // Keppel wharf carries lootWeight 3, the boardwalk 0.5.
    expect(tally.get('keppel-wharf') ?? 0).toBeGreaterThan(tally.get('boardwalk') ?? 0);
  });

  it('places every crate on ground clear of the district\'s own geometry', () => {
    const region = getRegion(SECTORED), world = region.build();
    try {
      for (let seed = 0; seed < 8; seed++) {
        for (const crate of createExpeditionLoot(`clear-${seed}`).enterZone(geometry(SECTORED, world.obstacles))) {
          expect(region.canOccupy(crate.x, crate.z, 0.65, world.obstacles), JSON.stringify(crate)).toBe(true);
        }
      }
    } finally { world.dispose(); }
  });

  it('labels each crate with the sector a player standing there would be told', () => {
    for (const crate of createExpeditionLoot('label').enterZone(geometry(SECTORED))) {
      expect(crate.sectorId ?? null).toBe(sectorAt(SECTORED, crate.x, crate.z)?.id ?? null);
    }
  });

  /**
   * Every district is sectored now, so the guarantee worth pinning is that the
   * sector path is inert when no sectors are supplied — which is what keeps a
   * caller that predates sectors, or a district whose data is withdrawn,
   * placing loot exactly as it always did.
   */
  it('is inert when a caller supplies no sectors', () => {
    for (const id of ['bishan', 'tuas', 'queenstown'] as const) {
      const absent = createExpeditionLoot('regression').enterZone({ ...geometry(id), sectors: undefined });
      const empty = createExpeditionLoot('regression').enterZone({ ...geometry(id), sectors: [] });
      expect(absent).toEqual(empty);
      expect(absent.every(crate => crate.sectorId === undefined)).toBe(true);
      expect(absent.length).toBeGreaterThan(0);
    }
  });
});

describe('tier bias', () => {
  it('leans the roll toward Elite without ever guaranteeing it', () => {
    const count = (bias: -1 | 0 | 1) => {
      let elite = 0, seed = 7;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let n = 0; n < 4000; n++) if (rollZoneWeapon(SECTORED, random, bias).tier === 'Elite') elite++;
      return elite;
    };
    const [low, even, high] = [count(-1), count(0), count(1)];
    expect(high).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThan(4000);
  });

  it('never lets a bias push a probability outside its bounds', () => {
    for (const id of WORLD_ZONES.map(zone => zone.id)) for (const bias of [-1, 0, 1] as const) {
      let seed = 3;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const rules = ZONE_LOOT_RULES[id];
      expect(rules.eliteChance).toBeLessThanOrEqual(1);
      for (let n = 0; n < 50; n++) expect(['Elite', 'Field', 'Issued']).toContain(rollZoneWeapon(id, random, bias).tier);
    }
  });
});

describe('patrol spawns', () => {
  it('keeps every district\'s own spawns and adds ground from its sectors', () => {
    for (const zone of WORLD_ZONES) {
      const spawns = patrolSpawns(zone.id);
      for (const own of zone.encounterSpawns) expect(spawns, zone.id).toContainEqual(own);
      expect(spawns.length, zone.id).toBeGreaterThan(zone.encounterSpawns.length);
    }
  });

  it('offers only ground a patrol can actually stand on', () => {
    // createArena rejects a spawn inside geometry, so an unclear one is a point
    // the patrols silently lose rather than an outright failure.
    for (const id of [SECTORED, 'bishan', 'changi'] as const) {
      const region = getRegion(id), world = region.build();
      try {
        for (const spawn of patrolSpawns(id)) {
          expect(region.canOccupy(spawn.x, spawn.z, 0.5, world.obstacles), `${id} ${JSON.stringify(spawn)}`).toBe(true);
        }
      } finally { world.dispose(); }
    }
  });
});
