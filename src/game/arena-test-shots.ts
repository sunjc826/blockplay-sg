import type { ArenaPoint, ArenaShot, ArenaSimulation } from './arena-rules';

/**
 * For tests: fires like `arena.shoot` and lets the round fly until it lands or
 * runs out, in steps short enough to leave cooldowns, reloads and bots almost
 * where they were. A refused or instant shot returns at once, as before.
 */
export function shootAndLand(arena: ArenaSimulation, id: string, origin: ArenaPoint, direction: ArenaPoint, weapon: number, maxDistance?: number): ArenaShot {
  const fired = arena.shoot(id, origin, direction, weapon, maxDistance);
  if (fired.hitId || !arena.inFlight(id)) return fired;
  for (let i = 0; i < 400 && arena.inFlight(id); i++) {
    arena.step(.002);
    const hits = arena.takeHits(id);
    if (hits.length) return hits[hits.length - 1];
  }
  return { hitId: null, killed: false, damage: 0 };
}
