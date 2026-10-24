import { describe, expect, it } from 'vitest';
import { createArena, REINFORCEMENT_FALLBACK, type ArenaActor, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { combatTimeline, getCombatEvent, type CombatEventDescriptor, type InsertPayload } from './combat-events';

const open = (spawns: { x: number; z: number }[], extra: Partial<ArenaEnvironment> = {}): ArenaEnvironment => ({
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, spawns,
  move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true, playerSpawn: { x: 0, z: 0 }, ...extra,
});
const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function advance(arena: ArenaSimulation, seconds: number, each?: () => void) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= .1) { arena.step(Math.min(.1, remaining)); each?.(); }
}
const heavy = [{ damage: 200, interval: .12, capacity: 30, reload: 1.8 }];
function shootDead(arena: ArenaSimulation, from: string, victim: ArenaActor) {
  const shooter = actor(arena, from), x = victim.x - shooter.x, y = victim.y - .62 - shooter.y, z = victim.z - shooter.z, l = Math.hypot(x, y, z);
  return arena.shoot(from, shooter, { x: x / l, y: y / l, z: z / l }, shooter.weapon);
}

describe('artillery in the arena', () => {
  it('stays harmless through the warning, then hurts whoever stands under it, credits nobody, and leaves', () => {
    const arena = createArena([], 0, 'mixed', open([{ x: 0, z: 0 }, { x: 120, z: 0 }]));
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    arena.addPlayer('two', 'Bravo');
    const target = actor(arena, 'one');
    const event = arena.triggerEvent('artillery', { x: target.x, z: target.z })!;
    expect(event.kind).toBe('artillery');
    expect(arena.snapshot().events).toHaveLength(1);
    advance(arena, getCombatEvent('artillery')!.warning - .1);
    expect(actor(arena, 'one').health).toBe(100);
    advance(arena, 20);
    const one = actor(arena, 'one');
    expect(one.health < 100 || one.deaths > 0).toBe(true);
    expect(actor(arena, 'two')).toMatchObject({ health: 100, kills: 0 });
    if (one.deaths) expect(arena.snapshot().feed.some(f => f.text === 'Artillery killed Alpha' && !f.killerId)).toBe(true);
    expect(arena.snapshot().finished).toBe(false);
    advance(arena, 40);
    expect(arena.snapshot().events).toBeUndefined();
  });
  it('is stopped by walls between the blast and the body', () => {
    // The same barrage on the same spot, once in the open and once with Bravo walled in.
    const bunker = [{ minX: 4, maxX: 4.3, minZ: -2, maxZ: 2, maxY: 3 }, { minX: 7.7, maxX: 8, minZ: -2, maxZ: 2, maxY: 3 },
      { minX: 4, maxX: 8, minZ: -2, maxZ: -1.7, maxY: 3 }, { minX: 4, maxX: 8, minZ: 1.7, maxZ: 2, maxY: 3 }];
    const health = (walls: typeof bunker) => {
      const arena = createArena(walls, 0, 'mixed', open([{ x: 0, z: 0 }, { x: 6, z: 0 }]));
      arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
      arena.addPlayer('two', 'Bravo');
      arena.setPlayerHealthMultiplier('two', 10);
      expect(actor(arena, 'two')).toMatchObject({ x: 6, z: 0 });
      arena.triggerEvent('artillery', { x: 6, z: 0 }, Math.PI / 2);
      advance(arena, 30);
      return actor(arena, 'two').health;
    };
    expect(health([])).toBeLessThan(1000);
    expect(health(bunker)).toBe(1000);
  });
  it('lets the open-world director start strikes on its own, and can be switched off', () => {
    const run = (enabled: boolean) => {
      const arena = createArena([], 0, 'mixed', open([{ x: 0, z: 0 }], { combatEvents: { risk: 'high' } }));
      arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
      arena.setCombatEvents(enabled);
      let seen = 0;
      advance(arena, 200, () => { seen = Math.max(seen, arena.snapshot().events?.length ?? 0); });
      return seen;
    };
    expect(run(true)).toBeGreaterThan(0);
    expect(run(false)).toBe(0);
  });
  it('publishes descriptors a guest accepts, and a guest rejects a forged one', () => {
    const environment = open([{ x: 0, z: 0 }]);
    const arena = createArena([], 0, 'mixed', environment);
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    arena.triggerEvent('artillery', { x: 20, z: 0 });
    advance(arena, 1);
    const snapshot = arena.snapshot();
    expect(validArenaSnapshot(snapshot, environment)).toBe(true);
    expect(validArenaSnapshot({ ...snapshot, events: [{ ...snapshot.events![0], kind: 'orbital-laser' }] }, environment)).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, events: [{ ...snapshot.events![0], target: { x: 900, z: 0 } }] }, environment)).toBe(false);
  });
});

describe('reinforcements', () => {
  const spawns = [{ x: 0, z: 0 }, { x: 110, z: 0 }, { x: -110, z: 0 }, { x: 0, z: 110 }];
  it('brings a fallen bot back on a transport, at the drop, when its seat is called', () => {
    const arena = createArena([], 1, 'assault', open(spawns, { reinforcements: true }));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    expect(shootDead(arena, 'one', actor(arena, 'bot-1')).killed).toBe(true);
    // Its old respawn delay passes and it stays down, waiting for a ride.
    advance(arena, 4);
    expect(actor(arena, 'bot-1').alive).toBe(false);
    let ride: CombatEventDescriptor | undefined;
    let back: ArenaActor | null = null, backAt = 0;
    advance(arena, 60, () => {
      ride ??= arena.snapshot().events?.find(e => e.kind.startsWith('transport'));
      const bot = actor(arena, 'bot-1');
      if (bot.alive && !back) { back = { ...bot }; backAt = arena.snapshot().elapsed; }
    });
    expect(ride!).toBeTruthy();
    expect(ride!.troops).toBe(1);
    const insert = combatTimeline(ride!).find((p): p is InsertPayload => p.type === 'insert')!;
    expect(back).not.toBeNull();
    expect(backAt).toBeGreaterThanOrEqual(ride!.start + insert.time - 1e-6);
    expect(Math.hypot(back!.x - insert.at.x, back!.z - insert.at.z)).toBeLessThan(1);
    expect(Math.hypot(back!.x, back!.z)).toBeGreaterThanOrEqual(40);
  });
  it('falls back to a plain respawn when no transport can reach anywhere', () => {
    // Every spawn is beside the player, so no drop is far enough away.
    const arena = createArena([], 1, 'assault', open([{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: -8, z: 0 }], { reinforcements: true }));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    expect(shootDead(arena, 'one', actor(arena, 'bot-1')).killed).toBe(true);
    advance(arena, REINFORCEMENT_FALLBACK);
    expect(actor(arena, 'bot-1').alive).toBe(false);
    advance(arena, 5);
    expect(actor(arena, 'bot-1').alive).toBe(true);
  });
  it('keeps the old three-second respawn where reinforcements are off', () => {
    const arena = createArena([], 1, 'assault', open(spawns));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    shootDead(arena, 'one', actor(arena, 'bot-1'));
    advance(arena, 3.1);
    expect(actor(arena, 'bot-1').alive).toBe(true);
  });
  it('can be called on demand by road or by air', () => {
    const arena = createArena([], 0, 'mixed', open(spawns, { reinforcements: true }));
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    expect(arena.triggerEvent('transport-air')?.kind).toBe('transport-air');
    advance(arena, 1);
    expect(arena.triggerEvent('transport-land')?.kind).toBe('transport-land');
  });
});
