import { expect, it } from 'vitest';
import { buildDistrictWorld } from './district-world';
import { createHeatField, DISTRICT_HEAT } from './faction-heat';
import { findWorldRoute, getWorldZone, WORLD_ZONES } from './world-zones';
import { zoneSectors } from './zone-sectors';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

it('makes Yishun a high-pressure expedition in the actual district adapter', () => {
  const world = buildDistrictWorld('yishun');
  try {
    expect(world.zone.risk).toBe('high');
    expect(world.zone.botCount).toBeGreaterThan(Math.max(...WORLD_ZONES.filter(z => z.id !== 'yishun').map(z => z.botCount)));
    expect(world.environment.combatEvents).toEqual({ risk: 'high' });
    expect(world.environment.paratroopers).toBe(true);
    const field = createHeatField(world.environment.heat!);
    expect(field.districtStrength('mercenaries')).toBeGreaterThan(.95);
    for (const id of ['raffles-place', 'changi', 'tuas'] as const) {
      const normal = createHeatField({ defaults: DISTRICT_HEAT[getWorldZone(id).risk], sectors: zoneSectors(id).map(s => ({ ...s, weight: s.botWeight ?? s.lootWeight })) });
      expect(field.topUpInterval('mercenaries'), id).toBeLessThan(normal.topUpInterval('mercenaries'));
    }
    // The joke survives the normal quiet-time decay rather than disappearing
    // after the first fight. Heat still stays inside the engine's 0–1 limits.
    field.casualty('mercenaries', 'northpoint'); field.step(600);
    expect(field.level('mercenaries', 'northpoint')).toBeCloseTo(.9);
    expect(field.snapshot().every(row => row.mercenaries >= 0 && row.mercenaries <= 1)).toBe(true);
  } finally { world.dispose(); }
});

it('Yishun keeps market and housing passages usable and both neighbouring routes reversible', () => {
  const world = buildDistrictWorld('yishun');
  try {
    const movement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
    for (const [x, z] of [[-194, -145], [-194, -30], [-70, 95], [82, 65]]) {
      expect(movement.canOccupy(x, 0, z, .65, 1.8), `${x},${z}`).toBe(true);
    }
    expect(movement.canOccupy(82, 0, 109, .65, 1.8), 'pond water').toBe(false);
    for (const id of ['woodlands', 'upper-thomson'] as const) {
      expect(findWorldRoute('yishun', id)).toHaveLength(1);
      expect(findWorldRoute(id, 'yishun')).toHaveLength(1);
    }
    expect(world.scene.userData.referenceFeatures).toEqual([]);
  } finally { world.dispose(); }
});
