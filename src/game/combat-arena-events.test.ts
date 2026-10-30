import { describe, expect, it } from 'vitest';
import { arenaWallDistance, createArena, type ArenaActor, type ArenaCoverDistance, type ArenaEnvironment, type ArenaRaider, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { DRONE, OVERWATCH, RAID, SUPPLY, TEAR_GAS } from './combat-event-catalog';
import { combatTimeline, type CombatEventDescriptor } from './combat-events';
import { shootAndLand } from './arena-test-shots';
import { FPS_WEAPONS } from './fps-rules';

const open = (spawns: { x: number; z: number }[], extra: Partial<ArenaEnvironment> = {}): ArenaEnvironment => ({
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, spawns,
  move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true, playerSpawn: { x: 0, z: 0 }, ...extra,
});
const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id);
const event = (arena: ArenaSimulation, id: string) => arena.snapshot().events?.find(e => e.id === id);
const raider = (arena: ArenaSimulation, id: string) => arena.snapshot().raiders?.find(r => r.event === id);
function advance(arena: ArenaSimulation, seconds: number, each?: () => void) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= .1) { arena.step(Math.min(.1, remaining)); each?.(); }
}
const heavy = [{ damage: 200, interval: .12, capacity: 30, reload: 1.8 }];
/** One round from `from` at a point, waiting out the gun's cycle first. */
function fireAt(arena: ArenaSimulation, from: string, at: { x: number; y: number; z: number }) {
  arena.step(.15);
  const shooter = actor(arena, from)!, x = at.x - shooter.x, y = at.y - shooter.y, z = at.z - shooter.z, l = Math.hypot(x, y, z);
  return shootAndLand(arena, from, shooter, { x: x / l, y: y / l, z: z / l }, shooter.weapon);
}
/** Walks a player to (x, z) the way their client would, a few metres a tick. */
function walkTo(arena: ArenaSimulation, id: string, x: number, z: number) {
  for (let i = 0; i < 80 && Math.hypot(actor(arena, id)!.x - x, actor(arena, id)!.z - z) > .05; i++) {
    arena.setInput(id, { x, y: 1.75, z, yaw: 0, pitch: 0, weapon: actor(arena, id)!.weapon, playing: true }); arena.step(.25);
  }
  expect(Math.hypot(actor(arena, id)!.x - x, actor(arena, id)!.z - z)).toBeLessThan(.1);
}
const crewOf = (arena: ArenaSimulation, e: CombatEventDescriptor) => arena.snapshot().actors.filter(a => a.id.startsWith(`${e.id}-`));
function soloArena(extra: Partial<ArenaEnvironment> = {}, spawns = [{ x: 0, z: 0 }, { x: 80, z: 0 }], bots = 0, composition = 'mixed') {
  const arena = createArena([], bots, composition, open(spawns, extra));
  arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
  arena.setPlayerHealthMultiplier('one', 10);
  return arena;
}

describe('air raid in the arena', () => {
  it('spares a body under a roof most of a bomb blast that hurts one in the open', () => {
    const lost = (roofed: boolean) => {
      const roof = [{ minX: -3, maxX: 3, minZ: -3, maxZ: 3, minY: 4, maxY: 4.3 }];
      const arena = createArena(roofed ? roof : [], 0, 'mixed', open([{ x: 10, z: 0 }]));
      arena.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
      arena.setPlayerHealthMultiplier('one', 10);
      // A roof over a spawn rules it out, so walk under it as a player would.
      walkTo(arena, 'one', 0, 0);
      arena.triggerEvent('air-raid', { x: 0, z: 0 }, 0);
      advance(arena, 30);
      return 1000 - actor(arena, 'one')!.health;
    };
    const exposed = lost(false), sheltered = lost(true);
    expect(exposed).toBeGreaterThan(0);
    expect(sheltered).toBeLessThan(exposed * .5);
  });
});

describe('mortar team', () => {
  it('sets up a two-man pit out of reach, stops firing when both are dead, and clears the bodies', () => {
    const arena = soloArena();
    const mortar = arena.triggerEvent('mortar', { x: 0, z: 0 })!;
    expect(mortar.origin).toBeTruthy();
    const range = Math.hypot(mortar.origin!.x, mortar.origin!.z);
    expect(range).toBeGreaterThanOrEqual(55); expect(range).toBeLessThanOrEqual(125);
    const crew = crewOf(arena, mortar);
    expect(crew).toHaveLength(2);
    for (const member of crew) { expect(member.bot).toBe(true); expect(member.role).toBe('mortar-crew'); expect(Math.hypot(member.x - mortar.origin!.x, member.z - mortar.origin!.z)).toBeLessThan(2); }
    advance(arena, 8);
    // They hold the pit.
    for (const member of crewOf(arena, mortar)) expect(Math.hypot(member.x - mortar.origin!.x, member.z - mortar.origin!.z)).toBeLessThan(2);
    for (const member of crewOf(arena, mortar)) expect(fireAt(arena, 'one', { x: member.x, y: member.y - .62, z: member.z }).killed).toBe(true);
    advance(arena, .2);
    const ended = event(arena, mortar.id)!;
    expect(ended.outcome).toBe('silenced');
    expect(arena.snapshot().feed.some(f => f.text === 'Mortar team silenced')).toBe(true);
    for (const round of combatTimeline(ended)) if (round.type === 'munition') expect(ended.start + round.time - round.flight).toBeLessThanOrEqual(ended.ended! + 1e-6);
    advance(arena, 4);
    expect(crewOf(arena, mortar)).toHaveLength(0);
  });
  it('does not come back as reinforcements', () => {
    const arena = soloArena({ reinforcements: true }, [{ x: 0, z: 0 }, { x: 80, z: 0 }, { x: -80, z: 0 }], 1, 'assault');
    const mortar = arena.triggerEvent('mortar', { x: 0, z: 0 })!;
    advance(arena, 10);
    for (const member of crewOf(arena, mortar)) fireAt(arena, 'one', { x: member.x, y: member.y - .62, z: member.z });
    advance(arena, 60);
    expect(arena.snapshot().events?.some(e => e.kind.startsWith('transport') && e.troops && e.troops > 1)).toBeFalsy();
    expect(crewOf(arena, mortar)).toHaveLength(0);
  });
});

describe('raid helicopter', () => {
  it('holds fire through its warning, then its gunner hurts a player in the open', () => {
    const arena = soloArena();
    const raid = arena.triggerEvent('helicopter-raid')!;
    expect(raid.altitude).toBeGreaterThanOrEqual(30);
    advance(arena, RAID.warning - .1);
    expect(actor(arena, 'one')!.health).toBe(1000);
    advance(arena, 20);
    expect(actor(arena, 'one')!.health).toBeLessThan(1000);
    expect(raider(arena, raid.id)!.shots).toBeGreaterThan(0);
  });
  it('can be shot down, which credits the shooter in the feed and ends the raid', () => {
    const arena = soloArena();
    const raid = arena.triggerEvent('helicopter-raid')!;
    advance(arena, RAID.warning + 2);
    // Rounds fly, so lead it by where it will be when the round gets there.
    const ahead = () => {
      const was = raider(arena, raid.id)!; arena.step(.05);
      const r = raider(arena, raid.id)!, from = actor(arena, 'one')!, flight = Math.hypot(r.x - from.x, r.y - from.y, r.z - from.z) / FPS_WEAPONS[0].ballistics.velocity;
      return { x: r.x + (r.x - was.x) / .05 * flight, y: r.y + 1.3 + (r.y - was.y) / .05 * flight, z: r.z + (r.z - was.z) / .05 * flight };
    };
    for (let shot = 0; shot < 8 && raider(arena, raid.id)?.state !== 'down'; shot++) fireAt(arena, 'one', ahead());
    expect(raider(arena, raid.id)!.state).toBe('down');
    expect(event(arena, raid.id)!.outcome).toBe('downed');
    expect(arena.snapshot().feed.filter(f => f.bounty === 'gunship')).toHaveLength(1);
    expect(actor(arena, 'one')!.kills).toBe(0);
    expect(arena.snapshot().feed.some(f => f.killerId === 'one' && f.bounty === 'gunship' && f.text === 'Alpha downed the raid helicopter')).toBe(true);
    advance(arena, 15);
    expect(raider(arena, raid.id)).toBeUndefined();
  });
  it('is published in snapshots a guest accepts, and a guest rejects a forged one', () => {
    const environment = open([{ x: 0, z: 0 }, { x: 80, z: 0 }]);
    const arena = createArena([], 0, 'mixed', environment);
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    const raid = arena.triggerEvent('helicopter-raid')!;
    advance(arena, 12);
    const snapshot = arena.snapshot();
    expect(validArenaSnapshot(snapshot, environment)).toBe(true);
    const forged = (r: Partial<ArenaRaider>) => ({ ...snapshot, raiders: [{ ...snapshot.raiders![0], ...r }] });
    expect(validArenaSnapshot(forged({ event: 'event-99' }), environment)).toBe(false);
    expect(validArenaSnapshot(forged({ state: 'teleporting' as ArenaRaider['state'] }), environment)).toBe(false);
    expect(validArenaSnapshot(forged({ health: 5000 }), environment)).toBe(false);
    expect(raid.kind).toBe('helicopter-raid');
  });
});

describe('loitering drone', () => {
  it('circles, locks on to a player it can see, dives and detonates on them', () => {
    const arena = soloArena();
    const drone = arena.triggerEvent('drone')!;
    const states = new Set<string>();
    advance(arena, 30, () => { const r = raider(arena, drone.id); if (r) states.add(r.state); });
    expect([...states]).toEqual(expect.arrayContaining(['cruise', 'lock', 'dive', 'exploded']));
    expect(event(arena, drone.id)?.outcome ?? 'detonated').toBe('detonated');
    expect(actor(arena, 'one')!.health).toBeLessThan(1000);
    expect(arena.snapshot().feed.some(f => f.text === 'Drone killed Alpha')).toBe(false);
  });
  it('goes back to circling when it loses sight, and does nothing before its warning', () => {
    const wall = [{ minX: -20, maxX: 20, minZ: -1.2, maxZ: -1, maxY: 200 }, { minX: -20, maxX: 20, minZ: 1, maxZ: 1.2, maxY: 200 },
      { minX: -1.2, maxX: -1, minZ: -20, maxZ: 20, maxY: 200 }, { minX: 1, maxX: 1.2, minZ: -20, maxZ: 20, maxY: 200 }, { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 3, maxY: 3.2 }];
    const arena = createArena(wall, 0, 'mixed', open([{ x: 80, z: 0 }]));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    walkTo(arena, 'one', 0, 0);
    const drone = arena.triggerEvent('drone', { x: 0, z: 0 })!;
    const states = new Set<string>();
    advance(arena, DRONE.warning + 10, () => { const r = raider(arena, drone.id); if (r) states.add(r.state); });
    // Boxed in under a roof: it never sees them, so it never dives.
    expect(states.has('dive')).toBe(false);
    expect(actor(arena, 'one')!.health).toBe(100);
  });
  it('falls harmlessly when shot down', () => {
    const arena = soloArena();
    const drone = arena.triggerEvent('drone')!;
    let r: ArenaRaider | undefined;
    advance(arena, 3, () => {
      r = raider(arena, drone.id);
      if (r && r.state === 'cruise' && Math.hypot(r.x, r.z) < 40) fireAt(arena, 'one', { x: r.x, y: r.y, z: r.z });
    });
    advance(arena, 10, () => {
      r = raider(arena, drone.id);
      if (r && r.health > 0) fireAt(arena, 'one', { x: r.x, y: r.y, z: r.z });
    });
    expect(event(arena, drone.id)!.outcome).toBe('downed');
    expect(arena.snapshot().feed.filter(f => f.bounty === 'drone' && f.killerId === 'one')).toHaveLength(1);
    advance(arena, 10);
    expect(actor(arena, 'one')!.health).toBe(1000);
  });
});

describe('rooftop sniper', () => {
  it('holds its perch, glints while it has a line, shoots only after the warning, and relocates when its time is up', () => {
    const arena = soloArena({}, [{ x: 0, z: 0 }, { x: 0, z: 70 }]);
    const sniper = arena.triggerEvent('sniper')!;
    const [overwatch] = crewOf(arena, sniper);
    expect(overwatch.role).toBe('overwatch');
    expect(Math.hypot(overwatch.x, overwatch.z - 70)).toBeLessThan(1);
    advance(arena, OVERWATCH.warning - .1);
    expect(actor(arena, 'one')!.health).toBe(1000);
    let glinted = false;
    advance(arena, 30, () => { const s = actor(arena, overwatch.id); if (s?.aiming) glinted = true; });
    expect(glinted).toBe(true);
    const held = actor(arena, overwatch.id)!;
    expect(Math.hypot(held.x, held.z - 70)).toBeLessThan(1);
    expect(held.shots).toBeGreaterThan(0);
    advance(arena, OVERWATCH.stay);
    expect(actor(arena, overwatch.id)).toBeUndefined();
  });
  it('cannot see through a smoke screen', () => {
    const lost = (smoke: boolean) => {
      const arena = soloArena({}, [{ x: 0, z: 0 }, { x: 0, z: 70 }]);
      if (smoke) arena.triggerEvent('smoke-screen', { x: 0, z: 35 }, 0);
      advance(arena, 3);
      arena.triggerEvent('sniper');
      advance(arena, 25);
      return 1000 - actor(arena, 'one')!.health;
    };
    expect(lost(false)).toBeGreaterThan(0);
    expect(lost(true)).toBe(0);
  });
});

describe('supply drop', () => {
  it('is opened by the first player to reach the crate once it lands', () => {
    const arena = soloArena();
    const drop = arena.triggerEvent('supply-drop', { x: 0, z: 0 })!;
    advance(arena, SUPPLY.release + 5);
    expect(event(arena, drop.id)!.ended).toBeUndefined();
    advance(arena, 20);
    expect(event(arena, drop.id)).toMatchObject({ outcome: 'claimed', claimedBy: 'one' });
    expect(arena.snapshot().feed.some(f => f.text === 'Alpha opened the supply drop')).toBe(true);
  });
  it('is carried off by a patrol that stands over it first', () => {
    // The patrol takes the only spawn, far from the player and out of their sight.
    const arena = createArena([], 1, 'tank', open([{ x: 150, z: 0 }], { playerSpawn: { x: -190, z: 0 } }));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    const drop = arena.triggerEvent('supply-drop', { x: 110, z: 0 })!;
    advance(arena, 80);
    expect(event(arena, drop.id)!.outcome).toBe('secured');
    expect(arena.snapshot().feed.some(f => f.text === 'Enemy patrol secured the supply drop')).toBe(true);
  });
});

describe('tear gas', () => {
  it('wears through health but not plates, only after its warning, and only inside', () => {
    const arena = createArena([], 0, 'mixed', open([{ x: 0, z: 0 }, { x: 80, z: 0 }]));
    arena.addPlayer('one', 'Alpha', 60, .6, heavy, undefined, true);
    arena.addPlayer('two', 'Bravo');
    const gas = arena.triggerEvent('tear-gas', { x: 0, z: 0 })!;
    advance(arena, TEAR_GAS.warning - .1);
    expect(actor(arena, 'one')!.health).toBe(100);
    advance(arena, 6);
    const one = actor(arena, 'one')!;
    expect(one.health).toBeLessThan(100);
    expect(one.armor).toBe(60);
    expect(actor(arena, 'two')!.health).toBe(100);
    expect(gas.kind).toBe('tear-gas');
  });
  it('drives bots out of the cloud', () => {
    const arena = createArena([], 1, 'tank', open([{ x: 0, z: 0 }, { x: 150, z: 150 }], { playerSpawn: { x: 150, z: 150 } }));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    const bot = actor(arena, 'bot-1')!;
    arena.triggerEvent('tear-gas', { x: bot.x, z: bot.z });
    advance(arena, TEAR_GAS.warning + 6);
    const moved = actor(arena, 'bot-1')!;
    expect(Math.hypot(moved.x - bot.x, moved.z - bot.z)).toBeGreaterThan(8);
  });
});

export type { ArenaActor };

/** A rendered building only the cover rays know about, as a district's meshes are: its roof is a perch. */
const building = (minX: number, maxX: number, minZ: number, maxZ: number, height: number): ArenaCoverDistance =>
  (origin, direction, distance) => Math.min(distance, arenaWallDistance(origin, direction, [{ minX, maxX, minZ, maxZ, minY: 0, maxY: height }]));

describe('a world that does not revolve around the player', () => {
  it('sends a drone at a patrol in the open when the only player is out of its sight', () => {
    const box = [{ minX: -20, maxX: 20, minZ: -1.2, maxZ: -1, maxY: 200 }, { minX: -20, maxX: 20, minZ: 1, maxZ: 1.2, maxY: 200 },
      { minX: -1.2, maxX: -1, minZ: -20, maxZ: 20, maxY: 200 }, { minX: 1, maxX: 1.2, minZ: -20, maxZ: 20, maxY: 200 }, { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 3, maxY: 3.2 }];
    const arena = createArena(box, 1, 'tank', open([{ x: 60, z: 40 }], { playerSpawn: { x: 60, z: -40 } }));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    walkTo(arena, 'one', 0, 0);
    const patrol = actor(arena, 'bot-1')!;
    const drone = arena.triggerEvent('drone', { x: patrol.x, z: patrol.z })!;
    let diveAim: { x: number; z: number } | null = null;
    advance(arena, 30, () => { const r = raider(arena, drone.id); if (r?.state === 'dive' && r.aim && !diveAim) diveAim = r.aim; });
    expect(diveAim).not.toBeNull();
    expect(Math.hypot(diveAim!.x, diveAim!.z)).toBeGreaterThan(10);
    const hit = actor(arena, 'bot-1')!;
    expect(hit.health < 130 || hit.deaths > 0).toBe(true);
    expect(actor(arena, 'one')!.health).toBe(100);
  });
  it('perches a sniper on a roof within rifle reach, where a player in the street can kill it', () => {
    const arena = createArena([], 0, 'mixed', open([{ x: 0, z: 0 }]), undefined, undefined, building(48, 70, -40, 40, 20));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    const sniper = arena.triggerEvent('sniper')!;
    expect(sniper.altitude).toBe(20);
    const [perched] = crewOf(arena, sniper);
    expect(perched.ground).toBe(20);
    expect(Math.hypot(perched.x, perched.y - 1.75, perched.z)).toBeLessThanOrEqual(OVERWATCH.reach);
    advance(arena, 2);
    expect(fireAt(arena, 'one', { x: perched.x, y: perched.y - .3, z: perched.z }).killed).toBe(true);
    advance(arena, .2);
    expect(event(arena, sniper.id)!.outcome).toBe('silenced');
    expect(arena.snapshot().feed.some(f => f.text === 'Sniper silenced')).toBe(true);
  });
  it('leaves a perched sniper ignored by patrols until it shoots them, then they look up and answer', () => {
    const arena = createArena([], 1, 'tank', open([{ x: 30, z: 0 }], { playerSpawn: { x: -150, z: 0 } }), undefined, undefined, building(78, 100, -40, 40, 20));
    arena.addPlayer('one', 'Alpha', 0, 0, heavy, undefined, true);
    const patrol = actor(arena, 'bot-1')!;
    const sniper = arena.triggerEvent('sniper', { x: patrol.x, z: patrol.z })!;
    expect(sniper.altitude).toBe(20);
    let before = 0, after = 0, struck = false;
    advance(arena, 20, () => {
      const bot = actor(arena, 'bot-1')!;
      if (!struck && bot.health < 130) struck = true;
      else if (!struck) before = Math.max(before, bot.pitch);
      else after = Math.max(after, bot.pitch);
    });
    expect(struck).toBe(true);
    // Eyes on the street until hit; up at the roofline afterwards.
    expect(before).toBeLessThan(.15);
    expect(after).toBeGreaterThan(.25);
  });
});

describe('whose event it is', () => {
  it('gives an event on a player to the mercenaries and one on a mercenary patrol to the forces, crew and all', () => {
    const arena = soloArena({}, [{ x: 150, z: 0 }], 1, 'tank');
    const patrol = actor(arena, 'bot-1')!;
    expect(Math.hypot(patrol.x, patrol.z)).toBeGreaterThan(100);
    const onPlayer = arena.triggerEvent('mortar', { x: 0, z: 0 })!;
    expect(onPlayer.faction).toBeUndefined();
    expect(crewOf(arena, onPlayer).every(c => c.faction === 'mercenaries')).toBe(true);
    const onPatrol = arena.triggerEvent('mortar', { x: patrol.x, z: patrol.z })!;
    expect(onPatrol.faction).toBe('armed-forces');
    const crew = crewOf(arena, onPatrol);
    expect(crew.length).toBeGreaterThan(0);
    expect(crew.every(c => c.faction === 'armed-forces')).toBe(true);
    expect(validArenaSnapshot(arena.snapshot().actors.some(a => a.health > 300) ? { ...arena.snapshot(), actors: arena.snapshot().actors.filter(a => a.health <= 300) } : arena.snapshot(), open([]))).toBe(true);
  });
});
