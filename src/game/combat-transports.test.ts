import { describe, it, expect } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation, type ArenaPoint, type ArenaCoverDistance } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { combatTimeline } from './combat-events';
import { TRANSPORT_HULL, transportPoint, transportDriverPoint, transportRayDistance, validTransport, type ArenaTransport } from './combat-transports';
import { shootAndLand } from './arena-test-shots';

const advance = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += .05) a.step(Math.min(.05, seconds - t)); };
const transport = (a: ArenaSimulation) => a.snapshot().transports![0];
const gun = [{ damage: 200, interval: .06, capacity: 100, reload: 1 }];
function setup(mode: 'land' | 'air' = 'land', population = 8, cover?: ArenaCoverDistance, arriving = true) {
  const spawn = { x: 0, z: 0 };
  const environment: ArenaEnvironment = { bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 }, spawns: [{ x: 0, z: 0 }, { x: 80, z: 0 }], playerSpawn: spawn,
    endless: true, population, reinforcements: true, move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }) };
  const a = createArena([], 0, 'assault', environment, undefined, undefined, cover);
  a.addPlayer('planner', 'Planner', 0, 0, gun, undefined, true);
  const event = a.triggerEvent(`transport-${mode}`)!;
  const payload = combatTimeline(event).find(p => p.type === 'transport')!;
  if (payload.type !== 'transport') throw new Error('transport missing');
  advance(a, arriving ? payload.arrive + .05 : payload.enter + (payload.arrive - payload.enter) * .5);
  return { a, environment, event, payload, spawn };
}
function addShooter(ctx: ReturnType<typeof setup>, at: ArenaPoint) {
  Object.assign(ctx.spawn, at); ctx.a.addPlayer('one', 'Alpha', 0, 0, gun, undefined, true);
}
function fire(a: ArenaSimulation, at: ArenaPoint) {
  advance(a, .065);
  const from = a.snapshot().actors.find(p => p.id === 'one')!;
  const d = { x: at.x - from.x, y: at.y - from.y, z: at.z - from.z }, length = Math.hypot(d.x, d.y, d.z);
  return shootAndLand(a, 'one', from, { x: d.x / length, y: d.y / length, z: d.z / length }, 0);
}
function shootHull(ctx: ReturnType<typeof setup>, shots: number) {
  for (let n = 0; n < shots; n++) fire(ctx.a, transportPoint(transport(ctx.a), 0, 1.4, 1));
}

describe('shootable reinforcement transports', () => {
  it('publishes a real, seated driver and separately damageable hull', () => {
    const ctx = setup(), t = transport(ctx.a), driver = ctx.a.snapshot().actors.find(a => a.id === t.driver)!;
    expect(driver).toMatchObject({ alive: true, bot: true, transport: t.event, health: 100, faction: 'mercenaries' });
    expect(t).toMatchObject({ health: TRANSPORT_HULL.land.health, passengers: 8 });
    expect(driver.x).toBeCloseTo(transportDriverPoint(t).x);
    expect(validArenaSnapshot(ctx.a.snapshot(), ctx.environment)).toBe(true);
  });
  it('lets half the passengers escape critical damage, keeping the driver and remaining troops aboard', () => {
    const ctx = setup(); addShooter(ctx, transportPoint(transport(ctx.a), 15, 1.75, 0));
    shootHull(ctx, 3);
    expect(transport(ctx.a)).toMatchObject({ health: 200, state: 'stopped', driverAlive: true });
    advance(ctx.a, 5);
    expect(transport(ctx.a).passengers).toBe(4);
    expect(ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive)).toHaveLength(4);
    advance(ctx.a, 8);
    expect(transport(ctx.a).passengers).toBe(4); // No later insert at the scheduled drop.
  });
  it('killing the driver stops an intact truck and lets every remaining passenger out', () => {
    const ctx = setup(), t = transport(ctx.a); addShooter(ctx, transportPoint(t, .55, 1.75, -10));
    expect(fire(ctx.a, transportDriverPoint(t)).hitId).toBe(t.driver);
    expect(transport(ctx.a)).toMatchObject({ health: 800, driverAlive: false, state: 'stopped' });
    advance(ctx.a, 7);
    expect(transport(ctx.a).passengers).toBe(0);
    expect(ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive)).toHaveLength(8);
  });
  it('driver death after a partial evacuation releases the rest instead of duplicating troops', () => {
    const ctx = setup(); addShooter(ctx, transportPoint(transport(ctx.a), .55, 1.75, -10)); ctx.a.setPlayerHealthMultiplier('one', 10);
    shootHull(ctx, 3); advance(ctx.a, 4);
    const t = transport(ctx.a);
    // A front-quarter line reaches the cab through its glazing.
    expect(fire(ctx.a, transportDriverPoint(t)).hitId).toBe(t.driver);
    expect(transport(ctx.a).driverAlive).toBe(false);
    advance(ctx.a, 5);
    expect(transport(ctx.a).passengers).toBe(0);
    expect(new Set(ctx.a.snapshot().actors.filter(a => a.bot && !a.transport).map(a => a.id)).size).toBe(8);
  });
  it('destroying a loaded hull cancels all later inserts and pays no hull bounty', () => {
    const ctx = setup(); addShooter(ctx, transportPoint(transport(ctx.a), 15, 1.75, 0));
    shootHull(ctx, 4);
    expect(transport(ctx.a)).toMatchObject({ health: 0, state: 'wreck', passengers: 0, driverAlive: false });
    advance(ctx.a, 5);
    expect(ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive)).toHaveLength(0);
    expect(ctx.a.snapshot().feed.filter(f => f.text === 'Troop truck destroyed')).toHaveLength(1);
    expect(ctx.a.snapshot().feed.some(f => f.bounty)).toBe(false);
    expect(validArenaSnapshot(ctx.a.snapshot(), ctx.environment)).toBe(true);
  });
  it('a pilot kill makes an emergency descent before troops can leave an airborne helicopter', () => {
    const ctx = setup('air'), t = transport(ctx.a); addShooter(ctx, transportPoint(t, .45, 1.75, -12));
    expect(fire(ctx.a, transportDriverPoint(t)).hitId).toBe(t.driver);
    expect(transport(ctx.a)).toMatchObject({ health: 1000, driverAlive: false, state: 'landing', passengers: 6 });
    advance(ctx.a, .5);
    expect(ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive)).toHaveLength(0);
    advance(ctx.a, 8);
    expect(transport(ctx.a)).toMatchObject({ state: 'stopped', passengers: 0 });
    for (const a of ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive)) expect(a.y).toBeLessThan(2);
  });
  it('does not let friendly infantry damage a friendly transport or driver', () => {
    const ctx = setup(), t = transport(ctx.a); addShooter(ctx, transportPoint(t, .55, 1.75, -10));
    const driver = ctx.a.snapshot().actors.find(a => a.id === t.driver)!;
    // A second enemy driver cannot be controlled through the public player API;
    // use the normal friendly reinforcement call for the player's own side.
    expect(driver.faction).toBe('mercenaries');
    const called = ctx.a.callout('one', 'reinforce');
    expect(called).toBeTruthy();
    const friendly = ctx.a.snapshot().transports?.find(t => ctx.a.snapshot().events?.find(e => e.id === t.event)?.faction === 'armed-forces');
    if (!friendly) throw new Error('Friendly reinforcement call did not dispatch');
    advance(ctx.a, 5);
    const health = friendly.health;
    fire(ctx.a, transportPoint(ctx.a.snapshot().transports!.find(t => t.event === friendly.event)!, 0, 1.4, 1));
    expect(ctx.a.snapshot().transports!.find(t => t.event === friendly.event)!.health).toBe(health);
  });
  it('evacuates beside an interrupted inbound truck rather than at its scheduled destination', () => {
    const ctx = setup('land', 8, undefined, false);
    addShooter(ctx, transportPoint(transport(ctx.a), .55, 1.75, -10)); ctx.a.setPlayerHealthMultiplier('one', 10);
    fire(ctx.a, transportDriverPoint(transport(ctx.a))); const stopped = { ...transport(ctx.a) };
    expect(stopped.driverAlive).toBe(false);
    expect(Math.hypot(stopped.x - ctx.event.target.x, stopped.z - ctx.event.target.z)).toBeGreaterThan(20);
    advance(ctx.a, 7);
    expect(transport(ctx.a).x).toBe(stopped.x); expect(transport(ctx.a).z).toBe(stopped.z);
    const survivors = ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive);
    expect(survivors).toHaveLength(8);
    for (const soldier of survivors) expect(Math.hypot(soldier.x - stopped.x, soldier.z - stopped.z)).toBeLessThan(18);
  });
  it('keeps a lone passenger aboard on critical damage until the driver is killed', () => {
    const ctx = setup('land', 1); addShooter(ctx, transportPoint(transport(ctx.a), .55, 1.75, -10));
    shootHull(ctx, 3); advance(ctx.a, 3);
    expect(transport(ctx.a)).toMatchObject({ driverAlive: true, passengers: 1 });
    fire(ctx.a, transportDriverPoint(transport(ctx.a))); advance(ctx.a, 2);
    expect(transport(ctx.a).passengers).toBe(0);
  });
  it('removes a driver who departed normally rather than consuming a hidden actor slot', () => {
    const ctx = setup(), driver = transport(ctx.a).driver;
    advance(ctx.a, ctx.payload.leave - ctx.a.snapshot().elapsed + .2);
    expect(transport(ctx.a)).toMatchObject({ state: 'departed', visible: false, passengers: 0 });
    expect(ctx.a.snapshot().actors.some(a => a.id === driver)).toBe(false);
    expect(validArenaSnapshot(ctx.a.snapshot(), ctx.environment)).toBe(true);
  });
  it('retries obstructed emergency exits instead of teleporting to the planned drop', () => {
    let blocked = false;
    const ctx = setup('land', 8, (origin, direction, range) => blocked && Math.abs(origin.y - 1.2) < .01 && Math.abs(direction.y) < .01 ? 0 : range);
    addShooter(ctx, transportPoint(transport(ctx.a), .55, 1.75, -10));
    blocked = true; fire(ctx.a, transportDriverPoint(transport(ctx.a))); advance(ctx.a, 4);
    expect(transport(ctx.a)).toMatchObject({ driverAlive: false, passengers: 8 });
    expect(ctx.a.snapshot().actors.filter(a => a.bot && !a.transport && a.alive)).toHaveLength(0);
    blocked = false; advance(ctx.a, 7);
    expect(transport(ctx.a).passengers).toBe(0);
  });
  it('event blasts damage transport hulls and a wreck only announces destruction once', () => {
    const ctx = setup(); addShooter(ctx, transportPoint(transport(ctx.a), 20, 1.75, 0));
    shootHull(ctx, 3); const t = transport(ctx.a);
    ctx.a.triggerEvent('artillery', { x: t.x, z: t.z }); advance(ctx.a, 20);
    expect(transport(ctx.a).health).toBeLessThan(200);
    const destructions = ctx.a.snapshot().feed.filter(f => f.text === 'Troop truck destroyed');
    expect(destructions.length).toBeLessThanOrEqual(1);
  });
  it('validates bounded hull and driver associations and removes them on reset', () => {
    const ctx = setup(), snapshot = ctx.a.snapshot(), t = transport(ctx.a);
    const forged = (change: Partial<ArenaTransport>) => ({ ...snapshot, transports: [{ ...t, ...change }] });
    expect(validArenaSnapshot(forged({ health: Infinity }), ctx.environment)).toBe(false);
    expect(validArenaSnapshot(forged({ driver: 'planner' }), ctx.environment)).toBe(false);
    expect(validArenaSnapshot(forged({ event: 'made-up' }), ctx.environment)).toBe(false);
    expect(validArenaSnapshot(forged({ passengers: 9 }), ctx.environment)).toBe(false);
    const raised = { ...snapshot, transports: [{ ...t, y: 200 }], actors: snapshot.actors.map(a => a.id === t.driver ? { ...a, y: 202.4, ground: 201.2 } : a) };
    expect(validArenaSnapshot(raised, ctx.environment)).toBe(true);
    expect(validArenaSnapshot({ ...snapshot, transports: [t, t] }, ctx.environment)).toBe(false);
    ctx.a.reset(); expect(ctx.a.snapshot().transports).toBeUndefined(); expect(ctx.a.snapshot().actors.some(a => a.transport)).toBe(false);
  });
});

it('hull hitboxes stop shots from every heading while leaving the windscreen open', () => {
  const t: ArenaTransport = { event: 'event-1', mode: 'land', x: 0, y: 0, z: 0, yaw: 0, health: 800, maxHealth: 800, state: 'stopped', visible: true, driver: 'driver', driverAlive: true, passengers: 8 };
  expect(validTransport(t)).toBe(true);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    t.yaw = yaw;
    const from = transportPoint(t, 10, 1.4, 1), to = transportPoint(t, 0, 1.4, 1), d = { x: (to.x - from.x) / 10, y: 0, z: (to.z - from.z) / 10 };
    expect(transportRayDistance(t, from, d)).toBeCloseTo(8.8);
  }
  t.yaw = 0;
  expect(transportRayDistance(t, { x: .55, y: 2.4, z: -10 }, { x: 0, y: 0, z: 1 })).toBeGreaterThan(8);
});
