import { describe, expect, it } from 'vitest';
import { shootAndLand } from './arena-test-shots';
import { AIRCREW, aircrewFacing, aircrewPoint, helicopterCrew, helicopterGunPoint, helicopterGunRay, rifleSeat } from './helicopter-crew';
import { combatTimeline, type CombatEventDescriptor } from './combat-events';
import { createArena, type ArenaEnvironment, type ArenaSimulation, type ArenaRaider } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { transportPoint } from './combat-transports';
import { bannerOf } from './combat-event-catalog';
import { getCombatEvent } from './combat-events';
import { threatens } from './combat-event-catalog';

const advance = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += .05) a.step(Math.min(.05, seconds - t)); };
const gun = [{ damage: 200, interval: .06, capacity: 100, reload: 1, ballistics: { velocity: 1500, drop: 0 } }];
function setup(kind: 'helicopter-raid' | 'transport-air' = 'helicopter-raid', variant = 0, cover = false) {
  const spawn = { x: 0, z: 0 };
  const environment: ArenaEnvironment = { bounds: { minX: -350, maxX: 350, minZ: -350, maxZ: 350 }, spawns: [{ x: 0, z: 0 }, { x: 100, z: 0 }], playerSpawn: spawn,
    endless: true, ...(kind === 'transport-air' ? { population: 6, reinforcements: true } : {}), move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }) };
  const a = createArena([], 0, 'assault', environment, undefined, undefined, cover ? (_o, _d, range) => Math.min(range, 2) : undefined);
  for (let n = 0; n <= variant; n++) { a.addPlayer(`planner-${n}`, 'Planner', 0, 0, gun, undefined, true); a.setPlayerHealthMultiplier(`planner-${n}`, 10); }
  const event = a.triggerEvent(kind, { x: 0, z: 0 }, 0)!;
  const ride = combatTimeline(event).find(p => p.type === 'transport');
  advance(a, ride?.type === 'transport' ? ride.arrive + .1 : 8.1);
  return { a, spawn, environment, event };
}
const crew = (c: ReturnType<typeof setup>) => c.a.snapshot().actors.filter(a => a.transport === c.event.id);
const frame = (c: ReturnType<typeof setup>) => c.a.snapshot().raiders?.find(r => r.event === c.event.id) ?? c.a.snapshot().transports!.find(t => t.event === c.event.id)!;
function shooter(c: ReturnType<typeof setup>, side: 'front' | 'left' | 'right') {
  const f = frame(c), point = transportPoint(f, side === 'front' ? .45 : side === 'left' ? -80 : 80, 1.75, side === 'front' ? -80 : .2);
  Object.assign(c.spawn, point); const id = `shooter-${side}`;
  c.a.addPlayer(id, 'Alpha', 0, 0, gun, undefined, true); c.a.setPlayerHealthMultiplier(id, 10); return id;
}
function fire(c: ReturnType<typeof setup>, from: string, to: { x: number; y: number; z: number; id?: string }) {
  const before = { ...to }; c.a.step(.02);
  const actor = c.a.snapshot().actors.find(a => a.id === from)!, current = c.a.snapshot().actors.find(a => a.id === to.id) ?? to;
  const flight = Math.hypot(current.x - actor.x, current.y - actor.y, current.z - actor.z) / 1500;
  const aimed = { x: current.x + (current.x - before.x) / .02 * flight, y: current.y + (current.y - before.y) / .02 * flight, z: current.z + (current.z - before.z) / .02 * flight };
  const dx = aimed.x - actor.x, dy = aimed.y - actor.y, dz = aimed.z - actor.z, length = Math.hypot(dx, dy, dz);
  return shootAndLand(c.a, from, actor, { x: dx / length, y: dy / length, z: dz / length }, 0);
}
const checkable = (c: ReturnType<typeof setup>) => { const s = c.a.snapshot(); return { ...s, actors: s.actors.filter(a => a.health <= 300) }; };

describe('helicopter crew variation', () => {
  it('always has one pilot, varies between zero and two rifle passengers and trends upward with intensity', () => {
    const counts = new Set<number>(); let quiet = 0, heavy = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const e = { seed, intensity: 1 }, roles = helicopterCrew(e);
      expect(helicopterCrew(JSON.parse(JSON.stringify(e)))).toEqual(roles);
      expect(roles[0]).toBe('pilot'); expect(new Set(roles).size).toBe(roles.length); counts.add(roles.filter(rifleSeat).length);
      quiet += helicopterCrew({ seed, intensity: .5 }).length; heavy += helicopterCrew({ seed, intensity: 2 }).length;
    }
    expect([...counts].sort()).toEqual([0, 1, 2]); expect(heavy).toBeGreaterThan(quiet);
  });
  it('shares the player helicopter chin mount and keeps rifle seats on opposite sides through rotations', () => {
    const f = { x: 10, y: 20, z: 30, yaw: Math.PI / 2 };
    expect(helicopterGunPoint(f)).toEqual(transportPoint(f, 0, .72, -1.7));
    expect(aircrewPoint(f, 'pilot')).toEqual(transportPoint(f, .45, 2.05, -1.6));
    const l = aircrewPoint(f, 'door-left'), r = aircrewPoint(f, 'door-right');
    expect(Math.hypot(l.x - r.x, l.z - r.z)).toBeCloseTo(2.7);
    expect(aircrewFacing(0, 'door-left')).toBe(Math.PI / 2);
    expect(helicopterGunRay(f, { x: f.x, y: -1000, z: f.z }).direction.y).toBeCloseTo(Math.sin(-1.05));
  });
});

describe('raid helicopter crew', () => {
  it('publishes a real pilot and seeded rifle occupants with validated, separate hitboxes', () => {
    const c = setup(); expect(crew(c).map(a => a.aircrew).sort()).toEqual(helicopterCrew(c.event).sort());
    expect(crew(c).every(a => a.health === AIRCREW.health && a.armor === 0)).toBe(true);
    expect(validArenaSnapshot(checkable(c), c.environment)).toBe(true);
    const s = checkable(c), pilot = s.actors.find(a => a.aircrew === 'pilot')!;
    expect(validArenaSnapshot({ ...s, actors: s.actors.map(a => a.id === pilot.id ? { ...a, aircrew: 'cannon-operator' } : a) }, c.environment)).toBe(false);
    expect(validArenaSnapshot({ ...s, actors: [...s.actors, { ...pilot, id: 'duplicate-pilot' }] }, c.environment)).toBe(false);
    expect(validArenaSnapshot({ ...s, actors: s.actors.filter(a => a.id !== pilot.id) }, c.environment)).toBe(false);
    expect(validArenaSnapshot({ ...s, actors: s.actors.map(a => a.id === pilot.id ? { ...a, x: a.x + 5 } : a) }, c.environment)).toBe(false);
    expect(validArenaSnapshot({ ...s, raiders: s.raiders!.map(r => ({ ...r, ammo: 401 })) }, c.environment)).toBe(false);
    expect(validArenaSnapshot({ ...s, raiders: s.raiders!.map(r => ({ ...r, ammo: undefined })) }, c.environment)).toBe(false);
  });
  it('loses one rifle source when its occupant is shot, while the pilot keeps the mounted gun working', () => {
    const c = setup(), rifle = crew(c).find(a => rifleSeat(a.aircrew))!; expect(rifle).toBeTruthy();
    const id = shooter(c, rifle.aircrew === 'door-left' ? 'left' : 'right'), before = frame(c).health;
    expect(fire(c, id, rifle).hitId).toBe(rifle.id);
    expect(frame(c).health).toBe(before); expect(frame(c).state).toBe('orbit');
    const shots = (frame(c) as ArenaRaider).shots; advance(c.a, 5);
    expect(c.a.snapshot().actors.find(a => a.id === rifle.id)?.alive ?? false).toBe(false);
    expect((frame(c) as ArenaRaider).shots).toBeGreaterThan(shots);
    expect((frame(c) as ArenaRaider).ammo).toBe(400 - (frame(c) as ArenaRaider).shots);
  });
  it('fires regular rifle projectiles from passenger seats in addition to the mounted gun', () => {
    const c = setup(); advance(c.a, 8);
    const riflemen = crew(c).filter(a => rifleSeat(a.aircrew));
    expect(riflemen.some(a => a.shots > 0)).toBe(true);
    expect((frame(c) as ArenaRaider).shots).toBeGreaterThan(0);
    expect(c.a.snapshot().rounds?.some(r => riflemen.some(a => a.id === r.shooter)) || riflemen.reduce((n, a) => n + a.shots, 0) > 0).toBe(true);
  });
  it('a pilot kill stops the gun and forces a controlled descent, with survivors exiting only at touchdown', () => {
    const c = setup(), pilot = crew(c).find(a => a.aircrew === 'pilot')!, id = shooter(c, 'front'), before = frame(c).health;
    expect(fire(c, id, pilot).hitId).toBe(pilot.id);
    expect(frame(c)).toMatchObject({ state: 'landing', health: before });
    const shots = (frame(c) as ArenaRaider).shots, height = frame(c).y;
    advance(c.a, 1); expect(frame(c).y).toBeCloseTo(height - AIRCREW.descent);
    expect(c.a.snapshot().actors.some(a => a.id.startsWith(c.event.id) && !a.transport && a.alive)).toBe(false);
    advance(c.a, height / AIRCREW.descent + 1);
    expect(frame(c).state).toBe('landed'); expect((frame(c) as ArenaRaider).shots).toBe(shots);
    const survivors = c.a.snapshot().actors.filter(a => a.id.startsWith(c.event.id) && a.alive);
    expect(survivors.length).toBeGreaterThan(0); expect(survivors.every(a => !a.transport && !a.aircrew && a.y < 2)).toBe(true);
    expect(validArenaSnapshot(checkable(c), c.environment)).toBe(true);
  });
  it('flies away with surviving crew when the raid completes and removes all attachments on reset', () => {
    const c = setup(); advance(c.a, 64);
    expect(c.a.snapshot().raiders?.find(r => r.event === c.event.id)).toBeUndefined(); expect(crew(c)).toHaveLength(0);
    c.a.reset(); expect(c.a.snapshot().actors.some(a => a.transport || a.aircrew)).toBe(false);
  });
  it('respects cover for passenger fire and does not fire before the approach warning', () => {
    const c = setup('helicopter-raid', 0, true); advance(c.a, 10);
    expect(crew(c).filter(a => rifleSeat(a.aircrew)).every(a => a.shots === 0)).toBe(true);
    expect((frame(c) as ArenaRaider).shots).toBe(0);
  });
});

describe('rappel transport crew', () => {
  it('has a separate pilot and optional cover riflemen, delivers its troops and then leaves with its crew', () => {
    const c = setup('transport-air');
    expect(crew(c).map(a => a.aircrew).sort()).toEqual(helicopterCrew(c.event).sort());
    expect(validArenaSnapshot(checkable(c), c.environment)).toBe(true);
    const payload = combatTimeline(c.event).find(p => p.type === 'transport')!; if (payload.type !== 'transport') throw Error('missing transport');
    advance(c.a, payload.depart - c.a.snapshot().elapsed + .3);
    expect(frame(c).state).toBe('leaving'); expect(c.a.snapshot().transports![0].passengers).toBe(0);
    expect(crew(c).length).toBeGreaterThan(0);
    advance(c.a, payload.leave - c.a.snapshot().elapsed + .2);
    expect(crew(c)).toHaveLength(0);
  });
  it('killing a rifle passenger does not trigger pilot-loss evacuation', () => {
    const c = [0, 1, 2, 3, 4].map(n => setup('transport-air', n)).find(c => crew(c).some(a => rifleSeat(a.aircrew)))!;
    expect(c).toBeTruthy(); const rifle = crew(c).find(a => rifleSeat(a.aircrew))!, id = shooter(c, rifle.aircrew === 'door-left' ? 'left' : 'right');
    expect(fire(c, id, rifle).hitId).toBe(rifle.id);
    expect(frame(c).state).toBe('unloading'); expect(c.a.snapshot().transports![0].driverAlive).toBe(true);
  });
});

describe('helicopter faction rules', () => {
  it('treats a friendly gunship as fire support rather than a hazard', () => {
    const event: Pick<CombatEventDescriptor, 'kind' | 'faction'> = { kind: 'helicopter-raid', faction: 'armed-forces' }, plugin = getCombatEvent('helicopter-raid')!;
    expect(threatens(event, plugin)).toBe(false); expect(bannerOf(event, plugin).warning).toMatch(/FRIENDLY/);
  });
});
