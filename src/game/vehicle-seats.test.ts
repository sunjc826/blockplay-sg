import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaInput, validArenaSnapshot } from './arena-runtime';
import { validVehicleControls, type VehicleControls } from './vehicle-seats';
import { moveInMarina } from './marina-collision';

const spawns = { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 30, z: 0, yaw: 0 } };
const environment: ArenaEnvironment = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, move: moveInMarina,
  spawns: [{ x: 3.5, z: 0 }, { x: -20, z: 0 }, { x: 30, z: 10 }], playerSpawn: { x: 3.5, z: 0 }, endless: true };
const controls = (override: Partial<VehicleControls> = {}): VehicleControls => ({ forward: 0, steer: 0, lift: 0, brake: false, boost: false, fire: false, ...override });
const car = (arena: ArenaSimulation) => arena.snapshot().vehicles![0];
const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function arenaWithPlayers(count = 4) {
  const arena = createArena([], 0, 'mixed', environment, { spawns });
  for (let i = 0; i < count; i++) arena.addPlayer(`p${i}`, `Player ${i}`, 0, 0, [], undefined, true);
  return arena;
}
function input(arena: ArenaSimulation, id: string, held: Partial<VehicleControls>, playing = true) {
  arena.setInput(id, { ...actor(arena, id), playing, vehicleControls: controls(held) });
}
describe('shared vehicle seats and authority', () => {
  it('assigns unique seats, rejects full/remote/dead entry, and never steals a seat', () => {
    const arena = arenaWithPlayers(5);
    for (let i = 0; i < 4; i++) expect(arena.vehicleAction(`p${i}`, 'enter', 'car')).toBe(true);
    expect(car(arena).occupants).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(arena.vehicleAction('p4', 'enter', 'car')).toBe(false);
    expect(arena.vehicleAction('p0', 'switch')).toBe(false);
    expect(arena.vehicleAction('p0', 'enter', 'helicopter')).toBe(false);
    expect(arena.vehicleAction('p4', 'enter', 'helicopter')).toBe(false);
    arena.setPlayerVitals('p4', { health: 0 }); expect(arena.vehicleAction('p4', 'enter', 'car')).toBe(false);
    expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
  });
  it('gives only the driver movement and only the gunner shared ammunition', () => {
    const arena = arenaWithPlayers(3);
    for (let i = 0; i < 3; i++) arena.vehicleAction(`p${i}`, 'enter', 'car');
    input(arena, 'p2', { forward: 1, fire: true }); arena.step(.1);
    expect(car(arena).z).toBe(0); expect(car(arena).ammo).toBe(240);
    input(arena, 'p0', { forward: 1, fire: true }); arena.step(.1);
    expect(car(arena).z).toBeLessThan(0); expect(car(arena).ammo).toBe(240);
    input(arena, 'p1', { fire: true, aim: { x: 0, y: 3, z: -100 } }); arena.step(.05);
    expect(car(arena).ammo).toBe(239); expect(car(arena).shots).toBe(1);
    expect(actor(arena, 'p2').z).toBeCloseTo(car(arena).z + .7);
    const before = car(arena).ammo;
    arena.shoot('p2', actor(arena, 'p2'), { x: 0, y: 0, z: -1 }, 0);
    expect(actor(arena, 'p2').shots).toBe(0); expect(car(arena).ammo).toBe(before);
  });
  it('vacates seats on disconnect/death, switches only into vacancies and preserves hull ammo', () => {
    const arena = arenaWithPlayers(4);
    for (let i = 0; i < 4; i++) arena.vehicleAction(`p${i}`, 'enter', 'car');
    input(arena, 'p1', { fire: true }); arena.step(.05);
    expect(arena.vehicleAction('p2', 'exit')).toBe(true);
    expect(arena.vehicleAction('p0', 'switch')).toBe(true); expect(actor(arena, 'p0').seat).toBe(2);
    arena.removePlayer('p1'); expect(car(arena).occupants[1]).toBeNull();
    arena.setPlayerVitals('p3', { health: 0 }); expect(car(arena).occupants[3]).toBeNull();
    expect(car(arena).ammo).toBe(239);
    arena.reset(); expect(car(arena).occupants.every(id => id === null)).toBe(true); expect(car(arena).ammo).toBe(240);
  });
  it('expires stale driving/fire inputs, rejects moving exits and keeps ammo finite', () => {
    const arena = arenaWithPlayers(1); arena.vehicleAction('p0', 'enter', 'car');
    for (let i = 0; i < 10; i++) { input(arena, 'p0', { forward: 1 }); arena.step(.05); }
    expect(arena.vehicleAction('p0', 'exit')).toBe(false);
    for (let i = 0; i < 20; i++) arena.step(.05);
    expect(car(arena).speed).toBeLessThan(.1);
    for (let i = 0; i < 900; i++) { input(arena, 'p0', { fire: true }); arena.step(.05); }
    expect(car(arena).ammo).toBe(0); expect(car(arena).shots).toBe(240);
    expect(arena.vehicleAction('p0', 'exit')).toBe(true); expect(arena.vehicleAction('p0', 'enter', 'car')).toBe(true);
    expect(car(arena).ammo).toBe(0);
  });
  it('routes infantry hits into the hull and destroys all crew exactly once', () => {
    const arena = arenaWithPlayers(4);
    for (let i = 0; i < 4; i++) arena.vehicleAction(`p${i}`, 'enter', 'car');
    arena.addPlayer('attacker', 'Attacker', 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: 1 }]);
    for (let i = 0; i < 3; i++) {
      const shooter = actor(arena, 'attacker'), v = car(arena), delta = { x: v.x - shooter.x, y: v.y + 1.3 - shooter.y, z: v.z - shooter.z };
      const d = Math.hypot(delta.x, delta.y, delta.z);
      arena.shoot('attacker', shooter, { x: delta.x / d, y: delta.y / d, z: delta.z / d }, 0); arena.step(.1);
    }
    expect(car(arena).health).toBe(0); expect(car(arena).occupants).toEqual([null, null, null, null]);
    for (let i = 0; i < 4; i++) { expect(actor(arena, `p${i}`).alive).toBe(false); expect(actor(arena, `p${i}`).deaths).toBe(1); }
    expect(actor(arena, 'attacker').kills).toBe(4);
  });
  it('rejects forged vehicle controls and inconsistent snapshots', () => {
    expect(validVehicleControls(controls({ forward: 9 }))).toBe(false);
    const arena = arenaWithPlayers(1); arena.vehicleAction('p0', 'enter', 'car');
    expect(validArenaInput({ ...actor(arena, 'p0'), playing: true, vehicleControls: controls({ aim: { x: NaN, y: 0, z: 0 } }) })).toBe(false);
    const snapshot = arena.snapshot(); snapshot.vehicles![0].occupants[1] = 'p0'; expect(validArenaSnapshot(snapshot, environment)).toBe(false);
    const invalid = arena.snapshot(); invalid.vehicles![0].ammo = 999; expect(validArenaSnapshot(invalid, environment)).toBe(false);
  });
});

it('carries helicopter crew with the pilot and refuses airborne entry/exit', () => {
  const arena = createArena([], 0, 'mixed', { ...environment, playerSpawn: { x: 33.5, z: 0 } }, { spawns });
  for (const id of ['pilot', 'gunner', 'late']) arena.addPlayer(id, id, 0, 0, [], undefined, true);
  expect(arena.vehicleAction('pilot', 'enter', 'helicopter')).toBe(true);
  expect(arena.vehicleAction('gunner', 'enter', 'helicopter')).toBe(true);
  input(arena, 'gunner', { lift: 1 }); arena.step(.1);
  expect(arena.snapshot().vehicles![1].y).toBe(.13);
  for (let i = 0; i < 20; i++) { input(arena, 'pilot', { lift: 1 }); arena.step(.05); }
  expect(arena.snapshot().vehicles![1].y).toBeGreaterThan(2);
  expect(actor(arena, 'gunner').y).toBeGreaterThan(3);
  expect(arena.vehicleAction('gunner', 'exit')).toBe(false);
  expect(arena.vehicleAction('late', 'enter', 'helicopter')).toBe(false);
  expect(arena.vehicleAction('gunner', 'switch')).toBe(true);
  expect(actor(arena, 'gunner').seat).toBe(2);
});
