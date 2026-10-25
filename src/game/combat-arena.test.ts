import { describe, expect, it } from 'vitest';
import { createArena, REINFORCEMENT_FALLBACK, REINFORCEMENT_SEATS, REINFORCEMENT_TOP_UP, type ArenaActor, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { DISTRICT_HEAT, FACTION_SCALE } from './faction-heat';
import { combatTimeline, getCombatEvent, type CombatEventDescriptor, type InsertPayload } from './combat-events';

const open = (spawns: { x: number; z: number }[], extra: Partial<ArenaEnvironment> = {}): ArenaEnvironment => ({
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, spawns,
  move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true, playerSpawn: { x: 0, z: 0 }, ...extra,
});
const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
/** The snapshot a guest would check, less players boosted past its 300-health limit by the solo-only multiplier. */
const checkable = (arena: ArenaSimulation) => { const s = arena.snapshot(); return { ...s, actors: s.actors.filter(a => a.health <= 300) }; };
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
  it('never lets transports on the road hold back a barrage', () => {
    const arena = createArena([], 0, 'mixed', open(spawns, { reinforcements: true }));
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    for (const kind of ['transport-land', 'transport-air', 'transport-land']) expect(arena.triggerEvent(kind)).toBeTruthy();
    expect(arena.triggerEvent('artillery')?.kind).toBe('artillery');
  });
  it('can be called on demand by road or by air', () => {
    const arena = createArena([], 0, 'mixed', open(spawns, { reinforcements: true }));
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    expect(arena.triggerEvent('transport-air')?.kind).toBe('transport-air');
    advance(arena, 1);
    expect(arena.triggerEvent('transport-land')?.kind).toBe('transport-land');
  });
  it('tops an under-strength district up with full transports of fresh contractors, and no further', () => {
    const arena = createArena([], 1, 'assault', open(spawns, { reinforcements: true, population: 7 }));
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    arena.setPlayerHealthMultiplier('one', 10);
    const bots = () => arena.snapshot().actors.filter(a => a.bot);
    advance(arena, REINFORCEMENT_TOP_UP - 1);
    expect(arena.snapshot().events).toBeUndefined();
    // Recruits ride in reserve: nobody sees them until they step off.
    let ride: CombatEventDescriptor | undefined, most = 0;
    advance(arena, 90, () => {
      ride ??= arena.snapshot().events?.find(e => e.kind.startsWith('transport'));
      most = Math.max(most, bots().length);
      if (!ride) expect(bots()).toHaveLength(1);
    });
    expect(ride!.troops).toBe(Math.min(6, REINFORCEMENT_SEATS[ride!.kind === 'transport-land' ? 'land' : 'air']));
    expect(most).toBe(7);
    expect(bots().every(b => b.faction === 'mercenaries')).toBe(true);
    expect(new Set(bots().map(b => b.name)).size).toBe(7);
    expect(arena.snapshot().feed.some(f => f.text.endsWith('joined') && f.text !== 'Alpha joined' && !f.text.includes('Merlion'))).toBe(false);
    expect(validArenaSnapshot(checkable(arena), open(spawns))).toBe(true);
    arena.reset();
    expect(bots()).toHaveLength(1);
  });
});

describe('factions', () => {
  const spawns = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: -30, z: 0 }];
  it('puts players with the forces and bots with the contractors', () => {
    const arena = createArena([], 2, 'assault', open(spawns));
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    expect(actor(arena, 'one').faction).toBe('armed-forces');
    expect(actor(arena, 'bot-1').faction).toBe('mercenaries');
    const snapshot = arena.snapshot();
    expect(validArenaSnapshot({ ...snapshot, actors: snapshot.actors.map(a => ({ ...a, faction: 'pirates' })) }, open(spawns))).toBe(false);
  });
  it('keeps contractors from fighting each other: no targets among their own and no harm from their rounds', () => {
    const arena = createArena([], 3, 'assault', open(spawns));
    advance(arena, 30);
    expect(arena.snapshot().actors.every(a => a.alive && a.kills === 0 && a.health === 100)).toBe(true);
    const shot = shootDead(arena, 'bot-1', actor(arena, 'bot-2'));
    expect(shot.damage).toBe(0);
    expect(actor(arena, 'bot-2').health).toBe(100);
  });
});

describe('faction heat in the arena', () => {
  const spawns = [{ x: 0, z: 0 }, { x: 110, z: 0 }, { x: -110, z: 0 }, { x: 0, z: 110 }, { x: 0, z: -110 }, { x: 120, z: 120 }];
  const sectors = [
    { id: 'east', bounds: { minX: 60, maxX: 200, minZ: -200, maxZ: 200 }, weight: 2, heat: { mercenaries: { min: .7, max: 1 } } },
    { id: 'west', bounds: { minX: -200, maxX: -60, minZ: -200, maxZ: 200 }, weight: 1, heat: { 'armed-forces': { min: .6, max: 1 } } },
  ];
  const hot = () => open(spawns, { reinforcements: true, heat: { sectors, defaults: DISTRICT_HEAT.medium } });
  it('brings in small friendly squads that fight the contractors, never the player', () => {
    const arena = createArena([], 2, 'assault', hot());
    arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    arena.setPlayerHealthMultiplier('one', 10);
    let friendlyRide: CombatEventDescriptor | undefined;
    advance(arena, 160, () => { friendlyRide ??= arena.snapshot().events?.find(e => e.faction === 'armed-forces'); });
    expect(friendlyRide?.kind).toMatch(/^transport/);
    const friends = arena.snapshot().actors.filter(a => a.bot && a.faction === 'armed-forces');
    expect(friends.length).toBeGreaterThan(0);
    expect(friends.length).toBeLessThanOrEqual(FACTION_SCALE['armed-forces'].troops[1]);
    expect(friends.every(f => /^(Pte|Cpl|Sgt) /.test(f.name) && f.variant === undefined)).toBe(true);
    // Friendly rounds stop on the player and do nothing.
    const friend = friends.find(f => f.alive)!;
    const player = actor(arena, 'one'), before = player.health;
    if (friend) expect(shootDead(arena, friend.id, player).damage).toBe(0);
    expect(actor(arena, 'one').health).toBe(before);
    expect(validArenaSnapshot(checkable(arena), hot())).toBe(true);
    expect(arena.snapshot().heat?.find(h => h.sector === 'east')?.mercenaries).toBeGreaterThanOrEqual(.7);
  });
  it('sends more contractors as their losses heat the district', () => {
    const headcount = (losses: number) => {
      const arena = createArena([], 2, 'assault', hot());
      arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
      arena.setPlayerHealthMultiplier('one', 10);
      let most = 0;
      for (let i = 0; i < 30; i++) {
        if (i < losses) for (const bot of arena.snapshot().actors.filter(a => a.bot && a.faction === 'mercenaries' && a.alive).slice(0, 1)) {
          const p = actor(arena, 'one'); arena.setInput('one', { ...p, x: bot.x + 3, z: bot.z, y: 1.75, weapon: p.weapon, playing: true });
          advance(arena, .5); shootDead(arena, 'one', actor(arena, bot.id));
        }
        advance(arena, 8, () => { most = Math.max(most, arena.snapshot().actors.filter(a => a.bot && a.faction === 'mercenaries').length); });
      }
      return most;
    };
    expect(headcount(12)).toBeGreaterThan(headcount(0));
  });
});

