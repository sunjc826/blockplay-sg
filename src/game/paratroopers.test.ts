import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { validCombatEvent, combatTimeline } from './combat-events';
import { PARATROOPERS, districtParatroopers, planParatroopers } from './paratroopers';
import { REGION_IDS } from './region-ids';
import { COASTAL_SEA } from './ambient-sky';
import { validReinforcementClocks } from './naval-landings';
import { shootAndLand } from './arena-test-shots';

const advance = (arena: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += .05) arena.step(Math.min(.05, seconds - t)); };
const gun = [{ damage: 200, interval: .06, capacity: 100, reload: 1, ballistics: { velocity: 1500, drop: 0 } }];
function setup(extra: Partial<ArenaEnvironment> = {}, cover?: (o: {x: number; y: number; z: number}, d: {x: number; y: number; z: number}, n: number) => number) {
  const env: ArenaEnvironment = { bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }),
    spawns: [{ x: 80, z: 80 }, { x: -80, z: 80 }], playerSpawn: { x: 0, z: -100 }, endless: true, reinforcements: true, paratroopers: true, population: 4, facilities: { sites: [] }, ...extra };
  const arena = createArena([], 0, 'assault', env, undefined, undefined, cover);
  arena.addPlayer('player', 'Alpha', 0, 0, gun, undefined, true);
  return { arena, env };
}
const bots = (a: ArenaSimulation) => a.snapshot().actors.filter(a => a.bot && a.alive);
describe('paratrooper reinforcements', () => {
  it('covers every inland district, including lakes, and no coast', () => {
    expect(REGION_IDS.filter(districtParatroopers)).toHaveLength(12);
    for (const id of REGION_IDS) expect(districtParatroopers(id)).toBe(!COASTAL_SEA[id]);
  });
  it('checks every canopy column and clear path, humans and protected arrivals', () => {
    const center = { x: 0, z: 0 };
    expect(planParatroopers([center], [], [], () => true)).toEqual(center);
    expect(planParatroopers([center], [{ x: 40, z: 0 }], [], () => true)).toBeUndefined();
    expect(planParatroopers([center], [], [{ x: 20, z: 0 }], () => true)).toBeUndefined();
    expect(planParatroopers([center], [], [], p => p.x < 0)).toBeUndefined();
  });
  it('warns, staggers four real parachutes, lands once and releases the squad', () => {
    const { arena, env } = setup(), event = arena.triggerEvent('paratroopers')!;
    expect(event).not.toBeNull(); expect(validCombatEvent(event, 0, env.bounds)).toBe(true);
    expect(combatTimeline(event).some(p => p.type === 'flyer' && p.model === 'cargo')).toBe(true);
    advance(arena, 11.9); expect(bots(arena)).toHaveLength(0);
    advance(arena, .2); expect(bots(arena)).toHaveLength(1); expect(bots(arena)[0].parachuting).toBe(true);
    const first = bots(arena)[0].id, height = bots(arena)[0].y;
    advance(arena, 4); expect(bots(arena)).toHaveLength(4); expect(bots(arena).find(a => a.id === first)!.y).toBeLessThan(height);
    expect(bots(arena).every(a => !a.shield && a.shots === 0)).toBe(true);
    expect(validArenaSnapshot(arena.snapshot(), env)).toBe(true);
    advance(arena, 12); expect(bots(arena)).toHaveLength(4); expect(bots(arena).every(a => !a.parachuting && a.y < 2)).toBe(true);
    expect(new Set(bots(arena).map(a => a.id)).size).toBe(4); expect(arena.triggerEvent('paratroopers')).toBeNull();
  });
  it('reserves existing casualties instead of recruiting duplicate soldiers', () => {
    const { env } = setup();
    const arena = createArena([], 4, 'assault', env);
    expect(arena.triggerEvent('paratroopers')).not.toBeNull();
    advance(arena, 16);
    const arriving = bots(arena).filter(a => a.faction === 'mercenaries');
    expect(arriving.map(a => a.id).sort()).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4']);
    expect(arena.triggerEvent('transport-air')).toBeNull();
    advance(arena, 12); expect(bots(arena).filter(a => a.faction === 'mercenaries')).toHaveLength(4);
  });
  it('records a normal casualty if touchdown becomes physically obstructed', () => {
    let roof = false;
    const { arena } = setup({}, (_o, _d, n) => roof ? 150 : n);
    arena.triggerEvent('paratroopers'); advance(arena, 16); expect(bots(arena)).toHaveLength(4);
    roof = true; advance(arena, 12); expect(bots(arena)).toHaveLength(0);
    expect(arena.snapshot().actors.filter(a => a.faction === 'mercenaries').every(a => a.deaths === 1 && !a.parachuting)).toBe(true);
  });
  it('schedules independently of post ownership and spends persistent shared clocks', () => {
    const { arena } = setup({ savedReinforcementClocks: { airborne: { mercenaries: 1, 'armed-forces': 150 }, naval: { mercenaries: 150, 'armed-forces': 150 }, external: { mercenaries: 1, 'armed-forces': 80 } },
      facilities: { sites: [{ id: 'post', name: 'Post', kind: 'command', x: -150, z: -150, y: 0, deployment: { x: -150, z: -150, yaw: 0 }, initialOwner: 'mercenaries' }] } });
    advance(arena, 1.1); expect(arena.snapshot().events?.some(e => e.kind === 'paratroopers')).toBe(true);
    const clocks = arena.snapshot().reinforcementClocks!; expect(clocks.airborne!.mercenaries).toBeGreaterThan(149); expect(clocks.external.mercenaries).toBeGreaterThan(79);
    expect(validReinforcementClocks(clocks)).toBe(true); expect(arena.triggerEvent('transport-air')).toBeNull();
    const next = setup({ savedReinforcementClocks: clocks }).arena;
    advance(next, 1); expect(next.snapshot().events).toBeUndefined();
    expect(next.snapshot().reinforcementClocks!.airborne!.mercenaries).toBeCloseTo(clocks.airborne!.mercenaries - 1);
  });
  it('validates saved clocks safely and accepts older district saves', () => {
    const clocks = setup().arena.snapshot().reinforcementClocks!;
    for (const airborne of [null, [], 2, { mercenaries: -1, 'armed-forces': 150 }, { mercenaries: 0, 'armed-forces': NaN }]) expect(validReinforcementClocks({ ...clocks, airborne })).toBe(false);
    expect(validReinforcementClocks({ ...clocks, airborne: undefined })).toBe(true);
  });
  it('does not launch on a coast or when the manifest has no troops', () => {
    expect(setup({ paratroopers: false }).arena.triggerEvent('paratroopers')).toBeNull();
    expect(setup({ population: 0 }).arena.triggerEvent('paratroopers')).toBeNull();
  });
  it('rejects roof and canopy obstructions without spending the launch interval', () => {
    const { arena } = setup({}, (_o, _d, _n) => 150); // roof at y=10
    expect(arena.triggerEvent('paratroopers')).toBeNull(); expect(bots(arena)).toHaveLength(0);
    expect(arena.snapshot().reinforcementClocks!.airborne!.mercenaries).toBe(PARATROOPERS.interval);
  });
  it('aborts unreleased troops if the descent becomes obstructed, retaining the cooldown', () => {
    let roof = false;
    const { arena } = setup({}, (_o, _d, n) => roof ? 150 : n);
    expect(arena.triggerEvent('paratroopers')).not.toBeNull(); roof = true;
    advance(arena, 16); expect(bots(arena)).toHaveLength(0);
    expect(arena.snapshot().reinforcementClocks!.airborne!.mercenaries).toBeGreaterThan(130);
  });
  it('can be shot during descent, with no replacement in the same drop', () => {
    const { arena, env } = setup(); arena.triggerEvent('paratroopers'); advance(arena, 15.2);
    const target = bots(arena)[0]; env.playerSpawn = { x: target.x + 12, z: target.z };
    arena.addPlayer('shooter', 'Bravo', 0, 0, gun, undefined, true); const origin = arena.snapshot().actors.find(a => a.id === 'shooter')!;
    const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z, d = Math.hypot(dx, dy, dz);
    const hit = shootAndLand(arena, 'shooter', origin, { x: dx / d, y: dy / d, z: dz / d }, 0);
    expect(hit.killed).toBe(true); expect(arena.snapshot().actors.find(a => a.id === target.id)?.parachuting).toBeUndefined();
    advance(arena, 13); expect(bots(arena)).toHaveLength(3);
  });
  it('resets airborne troops and timers and rejects malformed network state', () => {
    const { arena, env } = setup(); arena.triggerEvent('paratroopers'); advance(arena, 16);
    const snapshot = arena.snapshot(); snapshot.actors[0].parachuting = true; expect(validArenaSnapshot(snapshot, env)).toBe(false);
    expect(validCombatEvent({ ...arena.snapshot().events![0], troops: 5 }, 16, env.bounds)).toBe(false);
    arena.reset(); expect(bots(arena).filter(a => a.faction === 'mercenaries')).toHaveLength(0); expect(bots(arena).every(a => !a.parachuting)).toBe(true); expect(arena.snapshot().events).toBeUndefined();
    expect(arena.snapshot().reinforcementClocks!.airborne!.mercenaries).toBe(150);
  });
});
