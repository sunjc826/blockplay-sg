import { describe, expect, it } from 'vitest';
import { createExpeditionLoot, ZONE_LOOT_RULES } from './expedition-loot';
import { buildExpeditionWorld } from './expedition-world';
import { WORLD_ZONES } from './world-zones';
import { zoneSectors } from './zone-sectors';
import { expeditionNpcs } from './expedition-npcs';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

describe('expedition loot in authored scenes', () => {
  it('rejects otherwise clear anchors inside a new traversal foundation', () => {
    const bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    const movement = createVerticalMovement({ bounds, obstacles: [], surfaces: [],
      traversalObstacles: [{ minX: -8, maxX: 8, minZ: -8, maxZ: 8, minY: 0, maxY: 3 }] });
    const canStand = (x: number, z: number, radius: number) => movement.canOccupy(x, 0, z, radius, 1.8);
    const loot = createExpeditionLoot('foundation').enterZone({ id: 'queenstown', spawn: { x: 0, z: 20 }, bounds,
      obstacles: [], anchors: [{ x: 2, z: 2 }, { x: -2, z: -2 }], canStand });
    expect(loot).toHaveLength(6);
    for (const item of loot) expect(canStand(item.x, item.z, .65), item.id).toBe(true);
  });
  for (const zone of WORLD_ZONES) it(`${zone.id}: all crates are clear and reachable across several seeds`, () => {
    const world = buildExpeditionWorld(zone.id);
    try {
      const movement = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles,
        surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
      const canStand = (x: number, z: number, radius: number) => movement.canOccupy(x, 0, z, radius, 1.8);
      const targets = ['route-a', 'route-b', 'route-c', 'hackathon'].flatMap(seed => [false, true].flatMap(useAnchors => {
        const loot = createExpeditionLoot(seed).enterZone({ id: zone.id, spawn: zone.spawn, bounds: world.bounds, obstacles: world.obstacles, canStand,
          sectors: zoneSectors(zone.id), ...(useAnchors ? { anchors: zone.encounterSpawns } : {}) });
        const rules = ZONE_LOOT_RULES[zone.id];
        const expected = rules.weaponCount + rules.ammoCount + rules.medicalCount + rules.armorCount;
        expect(loot, `${zone.id}/${seed} crate count`).toHaveLength(expected);
        for (const npc of expeditionNpcs(zone.id, zoneSectors(zone.id))) for (const item of loot)
          expect(Math.hypot(item.x - npc.x, item.z - npc.z), `${zone.id}/${seed} loot clear of ${npc.id}`).toBeGreaterThanOrEqual(3);
        return loot;
      }));
      const radius = .38;
      const clear = (x: number, z: number) => canStand(x, z, radius);
      const walk = (p: { x: number; z: number }, dx: number, dz: number) =>
        movement.move({ ...p, y: 0, velocityY: 0 }, dx, dz, 0, radius, 1.8);
      for (const target of targets) expect(clear(target.x, target.z), target.id).toBe(true);
      const queue = [{ x: zone.spawn.x, z: zone.spawn.z }]; const seen = new Set([`${zone.spawn.x},${zone.spawn.z}`]);
      const pending = new Set(targets);
      for (let i = 0; i < queue.length && pending.size; i++) {
        const p = queue[i];
        for (const target of pending) if (Math.hypot(p.x - target.x, p.z - target.z) <= 2.5) {
          const end = walk(p, target.x - p.x, target.z - p.z);
          if (Math.hypot(end.x - target.x, end.z - target.z) < .01 && Math.abs(end.y) < .01 && end.grounded) pending.delete(target);
        }
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
          const x = p.x + dx; const z = p.z + dz; const key = `${x},${z}`;
          if (seen.has(key) || !clear(x, z)) continue;
          const end = walk(p, dx, dz);
          if (Math.hypot(end.x - x, end.z - z) > .01 || Math.abs(end.y) > .01 || !end.grounded) continue;
          seen.add(key); queue.push({ x, z });
        }
      }
      expect([...pending].map(p => ({ id: p.id, x: p.x, z: p.z })), 'unreachable loot positions').toEqual([]);
    } finally { world.dispose(); }
  }, 15000);
});
