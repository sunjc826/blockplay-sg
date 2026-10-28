import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { mergeHits, validArenaSnapshot } from './arena-runtime';
import { moveInMarina } from './marina-collision';
import { VEHICLE_COMBAT } from './vehicle-combat';
import { itemById } from './armory-catalog';
import { variantSpec } from './armory-state';
import { BOT_RANKS } from './arena-ranks';
import { BALLISTIC_SCALE, flightTime } from './fps-ballistics';
import { FPS_WEAPONS } from './fps-rules';
import { needsFlight } from './fps-projectiles';

const field = (spawns: { x: number; z: number }[]): ArenaEnvironment => ({
  bounds: { minX: 800, maxX: 1200, minZ: 800, maxZ: 1200 }, spawns,
  move: (p, dx, dz, r) => ({ x: Math.max(800 + r, Math.min(1200 - r, p.x + dx)), z: Math.max(800 + r, Math.min(1200 - r, p.z + dz)) }),
  endless: true,
});
const find = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
/** Two players 60 m apart on open ground, the second straight down -z of the first. */
function duel() {
  const arena = createArena([], 0, 'mixed', field([{ x: 1000, z: 1000 }, { x: 1000, z: 940 }]));
  arena.addPlayer('one', 'Alpha'); arena.addPlayer('two', 'Bravo');
  const one = find(arena, 'one'), two = find(arena, 'two');
  const x = two.x - one.x, y = two.y - .65 - one.y, z = two.z - one.z, l = Math.hypot(x, y, z);
  return { arena, one, two, direction: { x: x / l, y: y / l, z: z / l }, range: l };
}

describe('travelling rounds', () => {
  it('fly every carried gun at a share of its real muzzle velocity, crossing 100 m in about a fifth of a second', () => {
    for (const weapon of FPS_WEAPONS) expect(needsFlight(weapon.ballistics)).toBe(true);
    const rifle = FPS_WEAPONS[0].ballistics;
    expect(rifle.velocity).toBe(Math.round(970 * BALLISTIC_SCALE));
    expect(flightTime(100, rifle)).toBeGreaterThan(.15); expect(flightTime(100, rifle)).toBeLessThan(.25);
  });
  it('land on the host only once the round has flown the distance', () => {
    const { arena, one, direction, range } = duel();
    expect(arena.shoot('one', one, direction, one.weapon).hitId).toBeNull();
    expect(arena.inFlight('one')).toBe(1); expect(find(arena, 'two').health).toBe(100);
    const flight = flightTime(range, FPS_WEAPONS[one.weapon].ballistics);
    let t = 0;
    for (; t < 1 && find(arena, 'two').health === 100; t += .005) arena.step(.005);
    expect(t).toBeGreaterThan(flight - .02); expect(t).toBeLessThan(flight + .02);
    expect(arena.takeHits('one')).toEqual([{ hitId: 'two', killed: false, damage: 36 }]);
    expect(arena.takeHits('one')).toEqual([]); expect(arena.inFlight()).toBe(0);
  });
  it('miss a target that steps out of the line before the round arrives', () => {
    const { arena, one, two, direction } = duel();
    arena.shoot('one', one, direction, one.weapon);
    arena.step(.02);
    arena.setInput('two', { ...two, x: two.x + 1.2, playing: true });
    for (let t = 0; t < .5; t += .02) arena.step(.02);
    expect(find(arena, 'two').health).toBe(100);
    expect(arena.takeHits('one')).toEqual([]); expect(arena.inFlight()).toBe(0);
    expect(arena.snapshot().impacts).toEqual([]);
  });
  it('are published in snapshots for every screen to draw, and a guest rejects a forged one', () => {
    const { arena, one, direction } = duel();
    arena.shoot('one', one, direction, one.weapon); arena.step(.01);
    const snapshot = arena.snapshot(), environment = field([{ x: 1000, z: 1000 }]);
    expect(snapshot.rounds).toEqual([expect.objectContaining({ shooter: 'one', velocity: FPS_WEAPONS[one.weapon].ballistics.velocity, drop: 9.8, time: expect.closeTo(.01, 5),
      calibre: FPS_WEAPONS[one.weapon].caliberMm, power: 36 })]);
    expect(validArenaSnapshot(snapshot, environment)).toBe(true);
    expect(validArenaSnapshot({ ...snapshot, rounds: [{ ...snapshot.rounds![0], velocity: 1e6 }] }, environment)).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, rounds: [{ ...snapshot.rounds![0], vehicle: 'tank' as never }] }, environment)).toBe(false);
  });
  it('fly from a vehicle gun too, leaving its own hull and landing late on whoever it meets', () => {
    const environment: ArenaEnvironment = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, move: moveInMarina,
      spawns: [{ x: 3.5, z: 0 }, { x: 0, z: -60 }], playerSpawn: { x: 3.5, z: 0 }, endless: true };
    const arena = createArena([], 0, 'mixed', environment, { spawns: { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 30, z: 0, yaw: 0 } } });
    arena.addPlayer('driver', 'Driver', 0, 0, [], undefined, true); arena.addPlayer('gunner', 'Gunner', 0, 0, [], undefined, true);
    arena.addPlayer('target', 'Target');
    arena.vehicleAction('driver', 'enter', 'car'); arena.vehicleAction('gunner', 'enter', 'car');
    const target = find(arena, 'target');
    arena.setInput('gunner', { ...find(arena, 'gunner'), playing: true, vehicleControls: { forward: 0, steer: 0, lift: 0, brake: false, boost: false, fire: true, aim: { x: target.x, y: target.y - .65, z: target.z } } });
    arena.step(.02);
    expect(arena.snapshot().rounds?.[0]).toMatchObject({ shooter: 'gunner', vehicle: 'car', velocity: VEHICLE_COMBAT.car.ballistics.velocity, calibre: 7.62, power: VEHICLE_COMBAT.car.damage });
    expect(find(arena, 'target').health).toBe(100);
    for (let t = 0; t < .5 && find(arena, 'target').health === 100; t += .01) arena.step(.01);
    expect(find(arena, 'target').health).toBe(100 - VEHICLE_COMBAT.car.damage);
    expect(arena.snapshot().vehicles![0].health).toBe(VEHICLE_COMBAT.car.health);
    expect(arena.takeHits('gunner').at(-1)).toMatchObject({ hitId: 'target', damage: VEHICLE_COMBAT.car.damage });
  });
  it('publish a bot\'s round with its drawn variant\'s bore and damage', () => {
    const arena = createArena([], 1, 'tank', { ...field([{ x: 1000, z: 1012 }]), playerSpawn: { x: 1000, z: 1000 } });
    arena.addPlayer('you', 'You', 0, 0, undefined, undefined, true); arena.setPlayerHealthMultiplier('you', 10);
    let view: NonNullable<ReturnType<ArenaSimulation['snapshot']>['rounds']>[number] | undefined;
    for (let t = 0; t < 10 && !view; t += .02) { arena.step(.02); view = arena.snapshot().rounds?.find(r => r.shooter === 'bot-1'); }
    const spec = variantSpec(itemById(find(arena, 'bot-1').variant!)!)!;
    expect(view).toMatchObject({ calibre: spec.caliberMm, power: spec.damage });
  });
  it('read several hits landing at once as one marker', () => {
    expect(mergeHits([])).toBeNull();
    expect(mergeHits([{ hitId: null, killed: false, damage: 0 }])).toBeNull();
    expect(mergeHits([{ hitId: 'a', killed: true, damage: 60 }, { hitId: 'b', killed: false, damage: 30 }])).toEqual({ hitId: 'b', killed: true, damage: 90 });
  });
  it('have bots lead further the higher their rank', () => {
    expect(BOT_RANKS.map(rank => rank.lead)).toEqual([...BOT_RANKS.map(rank => rank.lead)].sort((a, b) => a - b));
    expect(BOT_RANKS[0].lead).toBeGreaterThan(0); expect(BOT_RANKS[2].lead).toBeLessThan(1);
  });
});
