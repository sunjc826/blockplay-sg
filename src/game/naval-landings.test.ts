import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation, type ArenaPoint } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { SENTOSA_LANDING_SITES, districtNavalSites, navalWaterRouteClear } from './naval-landing-sites';
import { NAVAL, navalRampPoint, planNavalLanding, validReinforcementClocks } from './naval-landings';
import { transportDriverPoint, transportPoint, validTransport } from './combat-transports';
import { combatTimeline, validCombatEvent } from './combat-events';
import { shootAndLand } from './arena-test-shots';
import { buildDistrictWorld } from './district-world';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { validatedNavalSites } from './naval-route-validation';
import { REGION_IDS } from './region-ids';

const advance = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += .05) a.step(Math.min(.05, seconds - t)); };
const gun = [{ damage: 200, interval: .06, capacity: 100, reload: 1, ballistics: { velocity: 1500, drop: 0 } }];
const ride = (a: ArenaSimulation) => a.snapshot().transports!.find(t => t.mode === 'sea')!;
const infantry = (a: ArenaSimulation) => a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive);
function setup(extra: Partial<ArenaEnvironment> = {}, launch = true) {
  const spawn = { x: 0, z: -100 };
  const env: ArenaEnvironment = { bounds: { minX: -250, maxX: 250, minZ: -210, maxZ: 210 }, spawns: [{ x: 0, z: 0 }, { x: 30, z: 0 }], playerSpawn: spawn,
    move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }), endless: true, reinforcements: true, population: 4, navalSites: SENTOSA_LANDING_SITES, ...extra };
  const arena = createArena([], 0, 'assault', env);
  arena.addPlayer('player', 'Alpha', 0, 0, gun, undefined, true); arena.setPlayerHealthMultiplier('player', 3);
  const event = launch ? arena.triggerEvent('transport-sea') : null;
  return { arena, env, spawn, event };
}
function shooter(ctx: ReturnType<typeof setup>, point: ArenaPoint) {
  Object.assign(ctx.spawn, point); ctx.arena.addPlayer('shooter', 'Bravo', 0, 0, gun, undefined, true); ctx.arena.setPlayerHealthMultiplier('shooter', 3);
}
function fire(ctx: ReturnType<typeof setup>, at: ArenaPoint) {
  advance(ctx.arena, .07);
  const from = ctx.arena.snapshot().actors.find(a => a.id === 'shooter')!, dx = at.x - from.x, dy = at.y - from.y, dz = at.z - from.z, d = Math.hypot(dx, dy, dz);
  return shootAndLand(ctx.arena, 'shooter', from, { x: dx / d, y: dy / d, z: dz / d }, 0);
}

describe('naval routes', () => {
  it('enables only explicit coastal sites, never lakes or inferred sea directions', () => {
    expect(REGION_IDS.filter(id => districtNavalSites(id).length)).toEqual(['sentosa']);
    expect(SENTOSA_LANDING_SITES).toHaveLength(2);
    expect(navalWaterRouteClear(SENTOSA_LANDING_SITES[0], () => false)).toBe(true);
    expect(navalWaterRouteClear(SENTOSA_LANDING_SITES[0], (_x, z) => z > 260 && z < 270)).toBe(false);
  });
  it('validates both complete hull lanes and inland routes against the real Sentosa scene', () => {
    const w = buildDistrictWorld('sentosa');
    try {
      const movement = createVerticalMovement({ bounds: w.bounds, obstacles: w.obstacles, surfaces: getWalkSurfaces(w.scene), traversalObstacles: getTraversalObstacles(w.scene) });
      expect(validatedNavalSites(w.scene, SENTOSA_LANDING_SITES, w.bounds, movement).map(s => s.id)).toEqual(SENTOSA_LANDING_SITES.map(s => s.id));
      const p = SENTOSA_LANDING_SITES[0];
      expect(movement.canOccupy(p.berth.x, 0, p.berth.z, .4, 1.8)).toBe(false);
      expect(movement.supportHeight(p.ramp.to.x, p.ramp.to.z, .5, .4, 1.8)).toBeCloseTo(.33);
      expect(navalRampPoint(p, 0)).toEqual(p.ramp.from); expect(navalRampPoint(p, 1)).toEqual(p.ramp.to);
    } finally { w.dispose(); }
  }, 30000);
  it('rejects nearby humans, reserved lanes, blocked exits and protected deployment points', () => {
    const sites = SENTOSA_LANDING_SITES, west = sites[0];
    expect(planNavalLanding(sites, 'mercenaries', [west.ramp.to], new Set(), () => true)?.id).toBe(sites[1].id);
    expect(planNavalLanding(sites, 'mercenaries', [], new Set(sites.map(s => s.id)), () => true)).toBeUndefined();
    expect(planNavalLanding(sites, 'mercenaries', [], new Set(), () => false)).toBeUndefined();
    expect(planNavalLanding([west], 'mercenaries', [], new Set(), () => true, [west.ramp.to])).toBeUndefined();
  });
});

describe('host-owned landing parties', () => {
  it('reserves a finite manifest, publishes the coxswain, and walks soldiers down the real ramp before departing', () => {
    const { arena, env, event } = setup(); expect(event?.troops).toBe(4);
    expect(combatTimeline(event!).some(p => p.type === 'insert')).toBe(false);
    advance(arena, 1);
    expect(ride(arena)).toMatchObject({ mode: 'sea', passengers: 4, state: 'inbound', ramp: 0, y: .14 });
    expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
    expect(ride(arena).z).toBeGreaterThan(env.bounds.maxZ);
    advance(arena, 15); expect(ride(arena).state).toBe('ramping'); expect(ride(arena).ramp).toBeCloseTo(.5);
    advance(arena, 1.3);
    const crossing = infantry(arena)[0]; expect(crossing.z).toBeGreaterThan(193); expect(crossing.y).toBeGreaterThan(2.08);
    expect(crossing.shield).toBeUndefined(); expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
    advance(arena, 10); expect(infantry(arena)).toHaveLength(4); expect(ride(arena).passengers).toBe(0);
    expect(new Set(infantry(arena).map(a => a.id)).size).toBe(4);
    expect(infantry(arena).every(a => a.z < 193)).toBe(true);
    advance(arena, 20); expect(ride(arena).state).toBe('departed'); expect(ride(arena).visible).toBe(false);
    expect(arena.snapshot().actors.some(a => a.id === ride(arena).driver)).toBe(false);
    expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
  });
  it('keeps guest snapshots valid when a spawn shield rounds down to zero', () => {
    const { arena, env } = setup(); advance(arena, 3); expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
  });
  it('does not launch on unapproved maps or create empty missions at full population', () => {
    expect(setup({ navalSites: [] }).event).toBeNull();
    expect(setup({ population: 0 }).event).toBeNull();
  });
  it('keeps posts from taking troops already booked onto a boat', () => {
    const { arena } = setup({ facilities: { sites: [{ id: 'post', name: 'Post', kind: 'command', x: 40, y: 0, z: 40, deployment: { x: 40, z: 40, yaw: 0 }, initialOwner: 'mercenaries' }] } });
    advance(arena, 14); expect(infantry(arena)).toHaveLength(0); expect(ride(arena).passengers).toBe(4);
    advance(arena, 20); expect(infantry(arena)).toHaveLength(4); expect(new Set(infantry(arena).map(a => a.id)).size).toBe(4);
  });
  it('schedules naval missions independently of working posts and shares the external gate', () => {
    const { arena } = setup({ facilities: { sites: [] }, savedReinforcementClocks: { naval: { mercenaries: 2, 'armed-forces': 150 }, external: { mercenaries: 2, 'armed-forces': 80 } } }, false);
    advance(arena, 1.9); expect(arena.snapshot().transports).toBeUndefined();
    advance(arena, .2); expect(ride(arena)).toBeDefined();
    expect(arena.snapshot().reinforcementClocks!.external.mercenaries).toBeGreaterThan(79);
    expect(arena.snapshot().events).toHaveLength(1); expect(arena.triggerEvent('transport-land')).toBeNull();
  });
  it.each(['mercenaries', 'armed-forces'] as const)('automatically launches when every command post belongs to %s', owner => {
    const { arena } = setup({ facilities: { sites: [{ id: 'post', name: 'Post', kind: 'command', x: 50, y: 0, z: 50, deployment: { x: 50, z: 50, yaw: 0 }, initialOwner: owner }] },
      savedReinforcementClocks: { naval: { mercenaries: 2, 'armed-forces': 150 }, external: { mercenaries: 2, 'armed-forces': 80 } } }, false);
    advance(arena, 2.1); expect(ride(arena)).toMatchObject({ passengers: 4, state: 'inbound' });
  });
  it('resumes unloading when a player clears a blocked ramp without moving the landing', () => {
    const ctx = setup(); advance(ctx.arena, 15.1);
    const site = SENTOSA_LANDING_SITES[0]; Object.assign(ctx.spawn, site.ramp.to);
    ctx.arena.addPlayer('blocker', 'Blocker', 0, 0, gun, undefined, true); advance(ctx.arena, 3);
    expect(ride(ctx.arena).passengers).toBe(4); ctx.arena.removePlayer('blocker'); advance(ctx.arena, 8);
    expect(ride(ctx.arena).passengers).toBe(0); expect(infantry(ctx.arena)).toHaveLength(4);
  });
  it('evacuates only through the dry ramp when the coxswain dies at the beach', () => {
    const ctx = setup(); advance(ctx.arena, 15.2); const t = ride(ctx.arena);
    shooter(ctx, { x: t.x + 18, y: 1.75, z: 194 });
    expect(fire(ctx, transportDriverPoint(t)).hitId).toBe(t.driver); advance(ctx.arena, 10);
    expect(ride(ctx.arena)).toMatchObject({ driverAlive: false, state: 'stopped', passengers: 0 });
    expect(infantry(ctx.arena)).toHaveLength(4); expect(infantry(ctx.arena).every(a => a.z < 196)).toBe(true);
  });
  it('can dispatch a friendly and hostile boat on separate lanes', () => {
    const { arena, env } = setup({ facilities: { sites: [] }, heat: { defaults: { mercenaries: { min: 0, max: 0 }, 'armed-forces': { min: 1, max: 1 } }, sectors: [] }, savedReinforcementClocks: { naval: { mercenaries: 0, 'armed-forces': 0 }, external: { mercenaries: 0, 'armed-forces': 0 } } }, false);
    advance(arena, .1);
    const boats = arena.snapshot().transports!;
    expect(boats).toHaveLength(2); expect(boats[0].x).not.toBe(boats[1].x);
    expect(arena.snapshot().events!.some(e => e.faction === 'armed-forces')).toBe(true);
    expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
  });
  it('holds a blocked ramp and returns passengers to reserve without teleporting them', () => {
    const ctx = setup(); advance(ctx.arena, 15.1);
    Object.assign(ctx.spawn, SENTOSA_LANDING_SITES[0].ramp.to); ctx.arena.addPlayer('blocker', 'Blocker', 0, 0, gun, undefined, true); ctx.arena.setPlayerHealthMultiplier('blocker', 3);
    advance(ctx.arena, 25); expect(infantry(ctx.arena)).toHaveLength(0); expect(ride(ctx.arena).passengers).toBe(0);
    expect(ctx.arena.snapshot().reinforcementClocks!.naval.mercenaries).toBeGreaterThan(109);
    expect(ctx.arena.snapshot().events!.filter(e => e.kind === 'transport-sea')).toHaveLength(1);
  });
  it('stops offshore when the coxswain dies, never evacuating into water', () => {
    const ctx = setup(); advance(ctx.arena, 8); const t = ride(ctx.arena);
    shooter(ctx, { x: t.x + .65, y: 1.75, z: 180 });
    expect(fire(ctx, transportDriverPoint(t)).hitId).toBe(t.driver);
    const stopped = ride(ctx.arena).z; advance(ctx.arena, 25);
    expect(ride(ctx.arena)).toMatchObject({ driverAlive: false, state: 'stopped', passengers: 4, z: stopped });
    expect(infantry(ctx.arena)).toHaveLength(0); expect(validArenaSnapshot(ctx.arena.snapshot(), ctx.env)).toBe(true);
    advance(ctx.arena, 15); expect(ride(ctx.arena).state).toBe('departed'); expect(ride(ctx.arena).passengers).toBe(0);
  });
  it('loses only undelivered passengers when a partially unloaded craft is destroyed', () => {
    const ctx = setup(); advance(ctx.arena, 18.1); expect(infantry(ctx.arena).length).toBeGreaterThan(0);
    const t = ride(ctx.arena); shooter(ctx, transportPoint(t, 20, 1.75, 0));
    for (let i = 0; i < 5; i++) fire(ctx, transportPoint(ride(ctx.arena), 0, .2, 0));
    expect(ride(ctx.arena)).toMatchObject({ health: 0, state: 'wreck', passengers: 0 });
    const delivered = ctx.arena.snapshot().actors.filter(a => a.bot && !a.transport).map(a => a.id);
    advance(ctx.arena, 8);
    expect(ctx.arena.snapshot().actors.filter(a => a.bot && !a.transport).every(a => delivered.includes(a.id))).toBe(true);
    expect(ctx.arena.triggerEvent('transport-land')).toBeNull();
    expect(validArenaSnapshot(ctx.arena.snapshot(), ctx.env)).toBe(true);
  });
  it('freezes saved clocks while absent and resets them only for a new expedition', () => {
    const ctx = setup({ facilities: { sites: [] } }); advance(ctx.arena, 20);
    const saved = ctx.arena.snapshot().reinforcementClocks!;
    const back = setup({ facilities: { sites: [] }, savedReinforcementClocks: saved }, false);
    expect(back.arena.snapshot().reinforcementClocks).toEqual(saved);
    expect(back.arena.snapshot().transports).toBeUndefined();
    advance(back.arena, 10); expect(back.arena.snapshot().reinforcementClocks!.naval.mercenaries).toBeCloseTo(saved.naval.mercenaries - 10);
    back.arena.reset(); expect(back.arena.snapshot().reinforcementClocks!.naval.mercenaries).toBe(NAVAL.interval);
  });
  it('rejects forged routes, sea states, passenger counts and clocks', () => {
    const ctx = setup(); advance(ctx.arena, 1); const t = ride(ctx.arena), now = ctx.arena.snapshot().elapsed;
    expect(validCombatEvent({ ...ctx.event, landing: 'lake' }, now, ctx.env.bounds)).toBe(false);
    expect(validTransport({ ...t, ramp: 2 })).toBe(false); expect(validTransport({ ...t, passengers: 5 })).toBe(false);
    expect(validTransport({ ...t, state: 'landing' })).toBe(false);
    expect(validReinforcementClocks({ naval: {}, external: {} })).toBe(false);
    expect(validArenaSnapshot({ ...ctx.arena.snapshot(), reinforcementClocks: { naval: {}, external: {} } }, ctx.env)).toBe(false);
  });
});
