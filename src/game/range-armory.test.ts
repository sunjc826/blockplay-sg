import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, isEnemyIssue, itemById } from './armory-catalog';
import { createProfile, resolveLoadout, restoreProfile } from './armory-state';
import { DEFAULT_VARIANTS, FPS_WEAPONS } from './fps-rules';
import { createVerticalMovement, MAX_STEP_HEIGHT } from './vertical-movement';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { buildDistrictWorld } from './district-world';
import { getFpsDistrict } from './fps-districts';
import { districtInfrastructure } from './district-infrastructure';
import { REGION_IDS } from './regions';
import { buildServiceWeapon } from './service-weapon-models';
import { OICW_LAUNCHER, OICW_RIFLE, QTS_LAUNCHER, QTS_RIFLE } from './weapon-modes';
import * as THREE from 'three';
import { applyEnemyWeaponConfig } from './enemy-weapon-models';
import { carriedVariants, findRangeArmoryPlot, focusRack, RACK_REACH, RANGE_WALL_ROWS, rangeArmoryObstacles, rangeArmoryPlan, rangeTableWeapons, TABLE_CELL, takeRangeArmoryWeapon, WALL_WIDTH } from './range-armory';

const wallIds = RANGE_WALL_ROWS.flatMap(row => row.items.map(item => item.id));
const family = (id: string) => itemById(id)!.family!;

describe('range armoury contents', () => {
  it('hangs every issued and every captured weapon once, without the launcher mode', () => {
    const captured = ARMORY_CATALOG.filter(item => item.category === 'weapon' && isEnemyIssue(item) && !item.id.endsWith('-launcher')).map(item => item.id);
    expect(new Set(wallIds).size).toBe(wallIds.length);
    expect([...wallIds].sort()).toEqual([...captured, ...DEFAULT_VARIANTS.slice(0, 5)].sort());
    expect(wallIds).not.toContain('ff-oicw-launcher'); expect(wallIds).not.toContain('cc-qts11-launcher');
    expect(RANGE_WALL_ROWS.find(row => row.label === 'COLLECTIVE CORPS CARGO')!.items.map(item => item.id)).toEqual(expect.arrayContaining(['sar-proxy-prototype', 'cc-gatekeeper', 'cc-network', 'cc-qts11']));
  });
  it('leaves bought and rented weapons on the table, and nothing else', () => {
    const base = createProfile();
    expect(rangeTableWeapons(base)).toEqual([]);
    const table = rangeTableWeapons({ ...base, owned: [...base.owned, 'sar-vanguard', 'p30-kopi'], rentals: { 'ult-patrol': 1000, 'ult-lights': 0 } }).map(item => item.id);
    expect(table.sort()).toEqual(['p30-kopi', 'sar-vanguard', 'ult-patrol'].sort());
  });
  it('lays out every buyable weapon on one table', () => {
    const buyable = ARMORY_CATALOG.filter(item => item.category === 'weapon' && !isEnemyIssue(item) && item.price > 0).length;
    const { table } = rangeArmoryPlan(buyable);
    expect(table!.columns * table!.rows).toBeGreaterThanOrEqual(buyable);
    expect(table!.width).toBeLessThanOrEqual(WALL_WIDTH);
  });
  it('fits each wall row, and each gun fits a table cell', () => {
    const lengthOf = (id: string) => {
      const item = itemById(id)!, spec = FPS_WEAPONS[item.family!], model = buildServiceWeapon(spec.id);
      if (!model) return .95; // SAR 21 and Ultimax load as field-kit models, under a metre.
      applyEnemyWeaponConfig(model, spec.id, item.config); model.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).z;
    };
    for (const row of RANGE_WALL_ROWS) expect(row.items.reduce((sum, item) => sum + lengthOf(item.id), 0), row.label).toBeLessThan(WALL_WIDTH - .3);
    for (const id of ['cis50-merlion', 'mag-chope', 'mag-lepak']) expect(lengthOf(id), id).toBeLessThan(TABLE_CELL.width + .25);
  });
});

describe('taking a rack weapon', () => {
  const start = () => { const profile = createProfile(); return { profile, equipment: resolveLoadout(profile) }; };
  it('fills the main slot and leaves the saved profile alone', () => {
    const { profile, equipment } = start(), saved = JSON.stringify(profile);
    const next = takeRangeArmoryWeapon(profile, equipment, 'ff-intervention', 0)!;
    expect(next.weapons[family('ff-intervention')].equipment.variant).toBe('ff-intervention');
    expect(next.carriedFamilies[0]).toBe(family('ff-intervention'));
    expect(carriedVariants(next).has('ff-intervention')).toBe(true);
    expect(carriedVariants(next).has('sar-issued')).toBe(false);
    expect(JSON.stringify(profile)).toBe(saved);
    expect(restoreProfile(saved).owned).not.toContain('ff-intervention');
  });
  it('builds on what is carried, so a later take or a crossing keeps the other guns', () => {
    const { profile, equipment } = start();
    const first = takeRangeArmoryWeapon(profile, equipment, 'g36k', 0)!;
    const second = takeRangeArmoryWeapon(profile, first, 'p30-issued', family('g36k'))!;
    expect(carriedVariants(second)).toEqual(new Set(['g36k', 'p30-issued']));
    const third = takeRangeArmoryWeapon(profile, second, 'xm8-compact', family('g36k'))!;
    expect(carriedVariants(third)).toEqual(new Set(['xm8-compact', 'p30-issued']));
    // Back to a variant of the same family replaces it where it is.
    expect(takeRangeArmoryWeapon(profile, third, 'xm8-carbine', family('xm8-compact'))!.carriedFamilies[0]).toBe(family('xm8-compact'));
  });
  it('brings the launcher mode with Peace Offering', () => {
    const { profile, equipment } = start();
    const next = takeRangeArmoryWeapon(profile, equipment, 'ff-oicw', 0)!;
    expect(next.carriedFamilies).toContain(OICW_RIFLE); expect(next.carriedFamilies).toContain(OICW_LAUNCHER);
  });
  it('brings the launcher mode with the QTS-11, and refuses the launcher on its own', () => {
    const { profile, equipment } = start();
    const next = takeRangeArmoryWeapon(profile, equipment, 'cc-qts11', 0)!;
    expect(next.carriedFamilies).toContain(QTS_RIFLE); expect(next.carriedFamilies).toContain(QTS_LAUNCHER);
    expect(takeRangeArmoryWeapon(profile, equipment, 'cc-qts11-launcher', 0)).toBeNull();
  });
  it('replaces the extra main when it is in hand', () => {
    const base = createProfile(), profile = { ...base, owned: [...base.owned, 'slot-extra'], carry: { main: 0, extra: 1 } };
    const next = takeRangeArmoryWeapon(profile, resolveLoadout(profile), 'mg4ke', 1)!;
    expect(next.carriedFamilies.slice(0, 2)).toEqual([0, family('mg4ke')]);
  });
  it('keeps a rental on the clock and refuses what is not a rack weapon', () => {
    const base = createProfile(), profile = { ...base, rentals: { 'ult-lights': 5000 } };
    expect(takeRangeArmoryWeapon(profile, resolveLoadout(profile), 'ult-lights', 0)!.weapons[1].rentalRemainingMs).toBe(5000);
    expect(takeRangeArmoryWeapon(base, resolveLoadout(base), 'ff-oicw-launcher', 0)).toBeNull();
    expect(takeRangeArmoryWeapon(base, resolveLoadout(base), 'skin-issued', 0)).toBeNull();
  });
});

describe('looking at the rack', () => {
  const items = [{ id: 'left', x: -1, y: 1.7, z: -2 }, { id: 'right', x: 1, y: 1.7, z: -2 }, { id: 'high', x: 1, y: 2.8, z: -2 }];
  const feet = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: 1.7, z: 0 };
  it('picks by where the crosshair is rather than what is nearest', () => {
    expect(focusRack(items, feet, eye, { x: -.45, y: 0, z: -1 })?.id).toBe('left');
    expect(focusRack(items, feet, eye, { x: .45, y: 0, z: -1 })?.id).toBe('right');
    expect(focusRack(items, feet, eye, { x: .45, y: .5, z: -1 })?.id).toBe('high');
  });
  it('needs a look at it, and reach', () => {
    expect(focusRack(items, feet, eye, { x: 0, y: 0, z: 1 })).toBeNull();
    expect(focusRack(items, { x: 0, y: 0, z: RACK_REACH + 4 }, { x: 0, y: 1.7, z: RACK_REACH + 4 }, { x: 0, y: 0, z: -1 })).toBeNull();
  });
});

describe('bay placement', () => {
  it.each(REGION_IDS)('%s has room near the spawn', id => {
    const world = buildDistrictWorld(id), district = getFpsDistrict(id), { fleetSpawns } = districtInfrastructure(world, []);
    const movement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getPhysicalWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
    const site = { spawn: district.spawn, bounds: world.bounds,
      blocks: [...world.obstacles, ...district.props.map(([, x, z, w, d]) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }))],
      vehicles: Object.values(district.vehicles).concat(Object.values(fleetSpawns)), targets: district.targets,
      floor: (x: number, z: number) => movement.supportHeight(x, z, (world.bounds.groundHeight?.(x, z) ?? 0) + MAX_STEP_HEIGHT, .4, 1.8),
      canStand: (x: number, y: number, z: number) => movement.canOccupy(x, y, z, .5, 1.8) };
    for (const count of [0, 26]) {
      const plan = rangeArmoryPlan(count), plot = findRangeArmoryPlot(plan, site);
      expect(plot, `${id} with ${count}`).not.toBeNull();
      const distance = Math.hypot(plot!.x - district.spawn.x, plot!.z - district.spawn.z);
      expect(distance, `${id} with ${count}`).toBeLessThan(25);
      expect(rangeArmoryObstacles(plot!, plan, 0).length).toBe(count ? 2 : 1);
    }
  }, 60000);
});
