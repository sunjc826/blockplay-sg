import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { moveInMarina } from './marina-collision';
import { clearVehicleSpawn, worldVehicleSpawns, WORLD_VEHICLES } from './world-vehicles';
import { buildDistrictWorld } from './district-world';
import { getFpsDistrict } from './fps-districts';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { sceneFlightObstacles } from './flight-obstacles';
import { expeditionNpcs } from './expedition-npcs';
import { zoneSectors } from './zone-sectors';
import { WORLD_ZONES } from './world-zones';
import { shootAndLand } from './arena-test-shots';
import { vehicleRayDistance } from './vehicle-seats';
import { vehicleExit, vehicleBounds, createVehicle } from './vehicle-rules';

const spawns = { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 40, z: 0, yaw: 0 } };
const environment: ArenaEnvironment = { bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, move: moveInMarina,
  spawns: [{ x: 3.5, z: 0 }], playerSpawn: { x: 3.5, z: 0 }, endless: true };
const options = { spawns, openWorld: true };
const tick = (arena: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - .001; t += .05) arena.step(.05); };
const car = (arena: ArenaSimulation) => arena.snapshot().vehicles![0];
const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
function player(arena: ArenaSimulation, id: string) { arena.addPlayer(id, id, 0, 0, [], undefined, true); }
function drive(arena: ArenaSimulation, seconds: number, forward = 1) {
  for (let t = 0; t < seconds; t += .05) { arena.setInput('p0', { ...actor(arena, 'p0'), playing: true,
    vehicleControls: { forward, steer: 0, lift: 0, brake: forward === 0, boost: false, fire: false } }); arena.step(.05); }
}

it('unloads the whole crew to separate clear points when the driver dismounts', () => {
  const arena = createArena([], 0, 'mixed', environment, options);
  for (let i = 0; i < 4; i++) { player(arena, `p${i}`); expect(arena.vehicleAction(`p${i}`, 'enter', 'car')).toBe(true); }
  expect(arena.vehicleAction('p0', 'exit')).toBe(true);
  expect(car(arena).occupants).toEqual([null, null, null, null]);
  const crew = arena.snapshot().actors;
  expect(new Set(crew.map(a => `${a.x},${a.z}`)).size).toBe(4);
  expect(crew.every(a => !a.vehicle && a.y === 1.75)).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('unloads a crew after parking the car diagonally', () => {
  const arena = createArena([], 0, 'mixed', environment, options);
  for (let i = 0; i < 4; i++) { player(arena, `p${i}`); arena.vehicleAction(`p${i}`, 'enter', 'car'); }
  for (let t = 0; t < 1.2; t += .05) {
    arena.setInput('p0', { ...actor(arena, 'p0'), playing: true,
      vehicleControls: { forward: 1, steer: 1, lift: 0, brake: false, boost: false, fire: false } }); arena.step(.05);
  }
  drive(arena, 1, 0);
  expect(Math.abs(car(arena).yaw)).toBeGreaterThan(.4);
  expect(Math.abs(car(arena).yaw)).toBeLessThan(1.2);
  expect(arena.vehicleAction('p0', 'exit')).toBe(true);
  expect(car(arena).occupants.every(id => id === null)).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('lets a whole crew step onto pavement using infantry clearance and floor height', () => {
  const pavement = { id: 'pavement', routeId: 'street', minX: -12, maxX: 12, minZ: -12, maxZ: 12,
    axis: 'x' as const, startHeight: .2, endHeight: .2, solidBelow: true };
  const arena = createArena([], 0, 'mixed', environment, options,
    { bounds: environment.bounds, obstacles: [], surfaces: [pavement], traversalObstacles: [] });
  for (let i = 0; i < 4; i++) { player(arena, `p${i}`); expect(arena.vehicleAction(`p${i}`, 'enter', 'car')).toBe(true); }
  expect(arena.vehicleAction('p0', 'exit')).toBe(true);
  expect(arena.snapshot().actors.every(a => !a.vehicle && Math.abs(a.y - 1.95) < .001)).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('lets a driver switch to the gun without treating the seat change as a dismount', () => {
  const arena = createArena([], 0, 'mixed', environment, options); player(arena, 'p0');
  arena.vehicleAction('p0', 'enter', 'car');
  expect(arena.vehicleAction('p0', 'switch')).toBe(true);
  tick(arena, 1);
  expect(car(arena).occupants).toEqual([null, 'p0', null, null]);
  expect(actor(arena, 'p0').vehicle).toBe('car');
});

it('keeps a blocked crew seated and does not teleport anyone through walls', () => {
  const walls = Array.from({ length: 4 }, () => ({ minX: 100, maxX: 101, minZ: 100, maxZ: 101 }));
  const arena = createArena(walls, 0, 'mixed', environment, options);
  for (let i = 0; i < 4; i++) { player(arena, `p${i}`); expect(arena.vehicleAction(`p${i}`, 'enter', 'car')).toBe(true); }
  const cage = [
    { minX: -8, maxX: -1.65, minZ: -8, maxZ: 8 }, { minX: 1.65, maxX: 8, minZ: -8, maxZ: 8 },
    { minX: -8, maxX: 8, minZ: -8, maxZ: -2.7 }, { minX: -8, maxX: 8, minZ: 2.7, maxZ: 8 },
  ];
  walls.forEach((wall, i) => Object.assign(wall, cage[i]));
  expect(arena.vehicleAction('p0', 'exit')).toBe(false);
  expect(car(arena).occupants).toEqual(['p0', 'p1', 'p2', 'p3']);
});

it('AI boards and drives a car, but never takes an unattended helicopter pilot seat', () => {
  const arena = createArena([], 2, 'mixed', environment, options);
  tick(arena, .1);
  expect(car(arena).occupants.filter(Boolean)).toHaveLength(2);
  const initial = car(arena).z;
  tick(arena, 5);
  expect(car(arena).z).toBeLessThan(initial - 2);
  expect(arena.snapshot().actors.every(a => a.vehicle === 'car')).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
  const air = createArena([], 1, 'mixed', { ...environment, spawns: [{ x: 43.5, z: 0 }] }, options);
  tick(air, 2); expect(air.snapshot().vehicles![1].occupants[0]).toBeNull();
});

it('rallies a gunner and passengers from beyond boarding range before driving away', () => {
  const arena = createArena([], 4, 'mixed', { ...environment,
    spawns: [{ x: 3.5, z: 0 }, { x: -30, z: 0 }, { x: 30, z: 0 }, { x: 0, z: 32 }] }, options);
  tick(arena, .1);
  expect(car(arena).occupants.filter(Boolean)).toHaveLength(1);
  tick(arena, 4);
  expect(car(arena).x).toBe(0); expect(car(arena).z).toBe(0);
  tick(arena, WORLD_VEHICLES.assembleSeconds - 4);
  expect(car(arena).occupants.every(Boolean)).toBe(true);
  expect(car(arena).occupants[1]).not.toBeNull();
  expect(car(arena).z).toBeLessThan(-1);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('leaves a lone AI vehicle on foot when no gunner can join', () => {
  const arena = createArena([], 1, 'mixed', environment, options);
  tick(arena, WORLD_VEHICLES.assembleSeconds + 1);
  expect(car(arena).occupants.every(id => id === null)).toBe(true);
  expect(car(arena).x).toBe(0); expect(car(arena).z).toBe(0);
  expect(arena.snapshot().actors.every(a => !a.vehicle)).toBe(true);
});

it('a lone AI driver stops, dismounts and fights visible enemies without immediately reboarding', () => {
  const arena = createArena([], 1, 'mixed', environment, options);
  tick(arena, 4);
  const bot = arena.snapshot().actors.find(a => a.bot)!;
  expect(bot.vehicle).toBe('car');
  player(arena, 'enemy');
  tick(arena, 5);
  expect(car(arena).occupants.every(id => id === null)).toBe(true);
  expect(actor(arena, bot.id).vehicle).toBeUndefined();
  expect(actor(arena, bot.id).shots).toBeGreaterThan(0);
  tick(arena, 1); expect(actor(arena, bot.id).vehicle).toBeUndefined();
});

it('refuses boarding a hostile crew while allowing the driver’s allies', () => {
  const arena = createArena([], 1, 'mixed', environment, options);
  const bot = arena.snapshot().actors.find(a => a.bot)!;
  player(arena, 'p0'); arena.vehicleAction('p0', 'enter', 'car');
  expect(arena.vehicleAction(bot.id, 'enter', 'car')).toBe(false);
  // Same-side human crews exercise the shared boarding and cascade path.
  player(arena, 'p1'); expect(arena.vehicleAction('p1', 'enter', 'car')).toBe(true);
  arena.vehicleAction('p0', 'exit'); expect(actor(arena, 'p1').vehicle).toBeUndefined();
});

it('unloads an AI driver and all AI passengers together', () => {
  const arena = createArena([], 3, 'mixed', environment, options);
  tick(arena, .1);
  const crew = car(arena).occupants.filter((id): id is string => !!id);
  expect(crew).toHaveLength(3);
  expect(arena.vehicleAction(crew[0], 'exit')).toBe(true);
  expect(car(arena).occupants.every(id => id === null)).toBe(true);
  tick(arena, 1);
  expect(crew.every(id => !actor(arena, id).vehicle)).toBe(true);
});

it('keeps helicopter passengers aboard in flight and lands them when the pilot disconnects', () => {
  const arena = createArena([], 0, 'mixed', { ...environment, playerSpawn: { x: 43.5, z: 0 } }, options);
  for (const id of ['pilot', 'passenger']) { player(arena, id); expect(arena.vehicleAction(id, 'enter', 'helicopter')).toBe(true); }
  for (let t = 0; t < 1.5; t += .05) {
    arena.setInput('pilot', { ...actor(arena, 'pilot'), playing: true,
      vehicleControls: { forward: 0, steer: 0, lift: 1, brake: false, boost: false, fire: false } }); arena.step(.05);
  }
  expect(arena.snapshot().vehicles![1].y).toBeGreaterThan(2);
  expect(arena.vehicleAction('pilot', 'exit')).toBe(false);
  arena.removePlayer('pilot'); tick(arena, .1);
  expect(actor(arena, 'passenger').vehicle).toBe('helicopter');
  tick(arena, 6);
  expect(actor(arena, 'passenger').vehicle).toBeUndefined();
  expect(actor(arena, 'passenger').alive).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('recovers distant abandoned hulls after two minutes, without refilling a player vehicle', () => {
  const arena = createArena([], 0, 'mixed', environment, options); player(arena, 'p0');
  arena.vehicleAction('p0', 'enter', 'car'); drive(arena, 5); drive(arena, 1, 0);
  const parked = car(arena).z; expect(parked).toBeLessThan(-60);
  tick(arena, WORLD_VEHICLES.abandonedSeconds + 1); expect(car(arena).z).toBeCloseTo(parked, 5);
  expect(arena.vehicleAction('p0', 'exit')).toBe(true);
  arena.removePlayer('p0');
  tick(arena, WORLD_VEHICLES.abandonedSeconds - 1); expect(car(arena).z).toBeCloseTo(parked, 5);
  tick(arena, 2); expect(car(arena).z).toBe(0); expect(car(arena).ammo).toBe(240);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('despawns a nearby wreck after 30 seconds but waits for the motor pool to clear before replacing it', () => {
  const arena = createArena([], 0, 'mixed', environment, options);
  arena.addPlayer('shooter', 'Shooter', 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: 1 }], undefined, true);
  for (let i = 0; i < 3; i++) {
    const from = actor(arena, 'shooter'), v = car(arena), aim = { x: v.x - from.x, y: v.y + 1.3 - from.y, z: v.z - from.z };
    const d = Math.hypot(aim.x, aim.y, aim.z);
    shootAndLand(arena, 'shooter', from, { x: aim.x / d, y: aim.y / d, z: aim.z / d }, 0); tick(arena, .1);
  }
  expect(car(arena).health).toBe(0);
  tick(arena, WORLD_VEHICLES.despawnSeconds - 1); expect(car(arena).despawned).toBe(false);
  tick(arena, 2); expect(car(arena).despawned).toBe(true);
  expect(vehicleRayDistance(car(arena), { x: 10, y: 1.5, z: 0 }, { x: -1, y: 0, z: 0 })).toBe(Infinity);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
  const invalid = arena.snapshot(); invalid.vehicles![0].health = 100;
  expect(validArenaSnapshot(invalid, environment)).toBe(false);
  tick(arena, WORLD_VEHICLES.wreckSeconds); expect(car(arena).health).toBe(0);
  arena.removePlayer('shooter'); tick(arena, .1);
  expect(car(arena).health).toBe(600); expect(car(arena).despawned).toBe(false); expect(car(arena).occupants.every(id => id === null)).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it.each([false, true])('clears a remote wreck beside a player and only replenishes open-world vehicles (%s)', openWorld => {
  const arena = createArena([], 0, 'mixed', environment, { ...options, openWorld });
  arena.addPlayer('p0', 'Shooter', 0, 0, [{ damage: 200, interval: .06, capacity: 100, reload: 1 }], undefined, true);
  expect(arena.vehicleAction('p0', 'enter', 'car')).toBe(true);
  drive(arena, 5); drive(arena, 1, 0);
  expect(arena.vehicleAction('p0', 'exit')).toBe(true);
  expect(Math.abs(car(arena).z)).toBeGreaterThan(60);
  arena.setPlayerHealthMultiplier('p0', 5);
  arena.setPlayerVitals('p0', { health: 250 });
  for (let i = 0; i < 3; i++) {
    const from = actor(arena, 'p0'), v = car(arena), aim = { x: v.x - from.x, y: v.y + 1.3 - from.y, z: v.z - from.z };
    const d = Math.hypot(aim.x, aim.y, aim.z);
    shootAndLand(arena, 'p0', from, { x: aim.x / d, y: aim.y / d, z: aim.z / d }, 0); tick(arena, .1);
  }
  expect(car(arena).health).toBe(0);
  expect(actor(arena, 'p0').alive).toBe(true);
  tick(arena, WORLD_VEHICLES.despawnSeconds + 1);
  expect(car(arena).despawned).toBe(true);
  expect(car(arena).health).toBe(0);
  expect(arena.vehicleAction('p0', 'enter', 'car')).toBe(false);
  tick(arena, WORLD_VEHICLES.wreckSeconds - WORLD_VEHICLES.despawnSeconds);
  expect(car(arena).health).toBe(openWorld ? 600 : 0);
  expect(car(arena).despawned).toBe(!openWorld);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
});

it('never auto-boards training bots or replenishes training wrecks', () => {
  const arena = createArena([], 1, 'mixed', environment, { spawns });
  tick(arena, 5); expect(car(arena).occupants.every(id => id === null)).toBe(true);
});

for (const { id } of WORLD_ZONES) it(`${id}: open-world motor pool has clear hulls, rotor space and exits`, () => {
  const world = buildDistrictWorld(id);
  try {
    const ground = [...world.obstacles, ...verticalVehicleObstacles({ surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) })];
    const flight = sceneFlightObstacles(world.scene), protectedPoints = [...expeditionNpcs(id, zoneSectors(id)), world.zone.spawn];
    const fleet = worldVehicleSpawns(getFpsDistrict(id).vehicles, ground, flight, world.bounds, protectedPoints);
    for (const kind of ['car', 'helicopter'] as const) {
      const other = kind === 'car' ? 'helicopter' : 'car';
      const solids = [...ground, vehicleBounds(createVehicle(other, fleet[other])), ...protectedPoints.map(p => ({ minX: p.x - 1, maxX: p.x + 1, minZ: p.z - 1, maxZ: p.z + 1 }))];
      expect(clearVehicleSpawn(kind, fleet[kind], ground, flight, world.bounds, solids.slice(ground.length))).toBe(true);
      expect(vehicleExit(createVehicle(kind, fleet[kind]), solids, world.bounds)).not.toBeNull();
    }
  } finally { world.dispose(); }
});
