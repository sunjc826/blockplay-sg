import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { createSharedVehicle, type VehicleControls } from './vehicle-seats';
import type { VehicleKind } from './vehicle-rules';
import { createRegionMovement } from './region-collision';
import type { Obstacle } from './marina-collision';
import type { FacilitySite } from './facilities';
import { WORLD_VEHICLES } from './world-vehicles';

const spawns = { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 40, z: 0, yaw: 0 } };
const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
const movement = createRegionMovement(bounds);
const actor = (a: ArenaSimulation, id: string) => a.snapshot().actors.find(m => m.id === id)!;
const vehicle = (a: ArenaSimulation, kind: VehicleKind = 'car') => a.snapshot().vehicles!.find(v => v.kind === kind)!;
const allies = (a: ArenaSimulation) => a.snapshot().actors.filter(m => m.bot && m.faction === 'armed-forces');
const tick = (a: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds - .001; t += .05) a.step(.05); };
function waitForGunner(a: ArenaSimulation, kind: VehicleKind = 'car') {
  for (let t = 0; t < 3 && !vehicle(a, kind).occupants[1]; t += .05) a.step(.05);
  expect(vehicle(a, kind).occupants[1]).toBeTruthy();
}
const neutral: VehicleControls = { forward: 0, steer: 0, lift: 0, brake: true, boost: false, fire: false };
function input(a: ArenaSimulation, controls: Partial<VehicleControls>, seconds: number) {
  for (let t = 0; t < seconds - .001; t += .05) {
    a.setInput('p', { ...actor(a, 'p'), playing: true, vehicleControls: { ...neutral, ...controls } }); a.step(.05);
  }
}
function setup({ kind = 'car', gather = true, walls = [] as Obstacle[], enemy = false, ammo = 240, botX, elevation = 0 }: {
  kind?: VehicleKind; gather?: boolean; walls?: Obstacle[]; enemy?: boolean; ammo?: number; botX?: number; elevation?: number;
} = {}) {
  const x = spawns[kind].x;
  const sites: FacilitySite[] = [
    { id: 'command', name: 'Command', kind: 'command', x: x + 10, y: 0, z: 0, initialOwner: 'armed-forces', deployment: { x: botX ?? x + 7, z: 0, yaw: 0 } },
    ...(['car', 'helicopter'] as const).map(k => ({ id: k, name: k, kind: k === 'car' ? 'garage' as const : 'helipad' as const,
      x: spawns[k].x, y: 0, z: -12, initialOwner: 'armed-forces' as const, deployment: spawns[k] })),
  ];
  if (enemy) sites.push({ id: 'enemy', name: 'Enemy', kind: 'command', x: x + 32, y: 0, z: 0, initialOwner: 'mercenaries', deployment: { x: x + 32, z: 0, yaw: 0 } });
  for (const site of sites) site.y = elevation;
  const fleet = (['car', 'helicopter'] as const).map(k => ({ ...createSharedVehicle(k, spawns[k]), y: elevation + .13, faction: 'armed-forces', ammo }));
  const environment: ArenaEnvironment = { bounds: elevation ? { ...bounds, groundHeight: () => elevation } : bounds, move: movement.move, spawns: [{ x: x + 10, z: 0 }], playerSpawn: { x: x + 3.5, z: 0 }, endless: true,
    facilities: { sites, savedVehicles: fleet } };
  const arena = createArena(walls, enemy ? 1 : 0, 'assault', environment, { spawns, openWorld: true },
    elevation ? { bounds: environment.bounds, obstacles: walls, surfaces: [], traversalObstacles: [] } : undefined);
  arena.addPlayer('p', 'Player', 0, 0, [], undefined, true);
  if (gather) expect(arena.callout('p', 'gather')?.order?.allies).toBe(4);
  expect(arena.vehicleAction('p', 'enter', kind)).toBe(true);
  return { arena, environment };
}

describe('player vehicle pickups', () => {
  it.each(['car', 'helicopter'] as const)('waits for a sustained stop, then walks followers into %s gunner and passenger seats', kind => {
    const { arena, environment } = setup({ kind });
    tick(arena, .9);
    expect(vehicle(arena, kind).occupants).toEqual(['p', null, null, null]);
    waitForGunner(arena, kind);
    expect(vehicle(arena, kind).occupants[2]).toBeNull();
    tick(arena, 4);
    expect(vehicle(arena, kind).occupants.every(Boolean)).toBe(true);
    expect(allies(arena).filter(m => m.vehicle === kind)).toHaveLength(3);
    expect(allies(arena).filter(m => !m.vehicle)).toHaveLength(1);
    expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
  });

  it('also picks up nearby unassigned allies, including with an empty mounted gun', () => {
    const { arena } = setup({ gather: false, ammo: 0 });
    tick(arena, 6);
    expect(vehicle(arena).occupants.every(Boolean)).toBe(true);
    expect(vehicle(arena).ammo).toBe(0);
  });

  it.each(['car', 'helicopter'] as const)('boards and unloads a grounded %s on elevated terrain', kind => {
    const { arena } = setup({ kind, elevation: 6 }); tick(arena, 5);
    expect(vehicle(arena, kind).occupants.every(Boolean)).toBe(true);
    expect(arena.vehicleAction('p', 'exit')).toBe(true);
    expect(vehicle(arena, kind).occupants.every(id => id === null)).toBe(true);
    expect(allies(arena).every(m => m.y > 7)).toBe(true);
  });

  it.each(['hold-position', 'move-there', 'scatter'])('respects an explicit %s order', order => {
    const { arena } = setup({ gather: false });
    expect(arena.callout('p', order, { x: 12, y: 1.75, z: 0 })?.order?.allies).toBe(4);
    tick(arena, 4);
    expect(vehicle(arena).occupants).toEqual(['p', null, null, null]);
  });

  it('does not redirect followers who are gathering on a different player', () => {
    const { arena } = setup({ gather: false });
    arena.addPlayer('other', 'Other', 0, 0, [], undefined, true);
    expect(arena.callout('other', 'gather')?.order?.allies).toBe(4);
    tick(arena, 4);
    expect(vehicle(arena).occupants).toEqual(['p', null, null, null]);
  });

  it('resets the invitation when the player drives away, requiring a fresh stop', () => {
    const { arena } = setup();
    tick(arena, .75);
    input(arena, { forward: 1, brake: false }, .4);
    expect(vehicle(arena).speed).toBeGreaterThan(WORLD_VEHICLES.pickupSpeed);
    expect(vehicle(arena).occupants).toEqual(['p', null, null, null]);
    input(arena, {}, .35);
    tick(arena, .4);
    expect(vehicle(arena).occupants).toEqual(['p', null, null, null]);
    tick(arena, 4);
    expect(vehicle(arena).occupants.every(Boolean)).toBe(true);
  });

  it('cancels an approach on dismount and does not immediately reboard an empty vehicle', () => {
    const { arena } = setup({ botX: 20 });
    const before = allies(arena).map(m => ({ ...m }));
    tick(arena, 2);
    expect(vehicle(arena).occupants).toEqual(['p', null, null, null]);
    expect(allies(arena).some((m, i) => Math.hypot(m.x, m.z) < Math.hypot(before[i].x, before[i].z))).toBe(true);
    expect(arena.vehicleAction('p', 'exit')).toBe(true);
    tick(arena, 4);
    expect(vehicle(arena).occupants.every(id => id === null)).toBe(true);
  });

  it('keeps a loaded crew through stops, then unloads safely and resumes following with a reboard cooldown', () => {
    const { arena, environment } = setup();
    tick(arena, 5);
    const crew = allies(arena).filter(m => m.vehicle).map(m => m.id);
    expect(crew).toHaveLength(3);
    input(arena, { forward: 1, brake: false }, 1);
    input(arena, {}, 1);
    tick(arena, 2);
    expect(crew.every(id => actor(arena, id).vehicle === 'car')).toBe(true);
    expect(arena.vehicleAction('p', 'exit')).toBe(true);
    expect(vehicle(arena).occupants.every(id => id === null)).toBe(true);
    const positions = crew.map(id => actor(arena, id));
    expect(new Set(positions.map(m => `${m.x},${m.z}`)).size).toBe(3);
    expect(arena.vehicleAction('p', 'enter', 'car')).toBe(true);
    tick(arena, WORLD_VEHICLES.boardCooldown - 1);
    expect(crew.every(id => !actor(arena, id).vehicle)).toBe(true);
    tick(arena, 5);
    expect(crew.some(id => actor(arena, id).vehicle === 'car')).toBe(true);
    expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
  });

  it('keeps the crew seated when the driver switches, skips occupied seats, and never fills their driver seat with AI', () => {
    const { arena } = setup();
    waitForGunner(arena);
    expect(arena.vehicleAction('p', 'switch')).toBe(true);
    expect(actor(arena, 'p').seat).toBe(2);
    const gunner = vehicle(arena).occupants[1];
    tick(arena, 4);
    expect(vehicle(arena).occupants).toEqual([null, gunner, 'p', null]);
    expect(arena.vehicleAction('p', 'exit')).toBe(true);
    tick(arena, .3);
    expect(vehicle(arena).occupants.every(id => id === null)).toBe(true);
  });

  it('refuses a seat switch when every other seat is occupied', () => {
    const { arena } = setup(); tick(arena, 5);
    const crew = vehicle(arena).occupants;
    expect(arena.vehicleAction('p', 'switch')).toBe(false);
    expect(vehicle(arena).occupants).toEqual(crew);
  });

  it('lets a player collect allies under fire and keeps mounted AI aboard near enemies', () => {
    const { arena } = setup({ enemy: true });
    arena.setPlayerHealthMultiplier('p', 10);
    tick(arena, 3);
    expect(vehicle(arena).occupants.filter(Boolean).length).toBeGreaterThan(1);
    const crew = allies(arena).filter(m => m.vehicle).map(m => m.id);
    tick(arena, 1);
    expect(crew.every(id => actor(arena, id).vehicle === 'car')).toBe(true);
    expect(vehicle(arena).shots).toBeGreaterThan(0);
    expect(arena.snapshot().actors.filter(m => m.bot && m.faction === 'mercenaries').every(m => !m.vehicle)).toBe(true);
  });

  it('keeps approaching allies on their side of a wall', () => {
    const wall = { minX: 4.8, maxX: 5.2, minZ: -30, maxZ: 30 };
    const { arena } = setup({ walls: [wall], botX: 10 });
    tick(arena, 6);
    expect(vehicle(arena).occupants).toEqual(['p', null, null, null]);
    expect(allies(arena).every(m => m.x >= wall.maxX + .39)).toBe(true);
  });

  it('unloads AI riders when their driver disconnects', () => {
    const { arena } = setup(); tick(arena, 5);
    const crew = vehicle(arena).occupants.slice(1);
    expect(crew.every(Boolean)).toBe(true);
    arena.removePlayer('p'); tick(arena, .3);
    expect(vehicle(arena).occupants.every(id => id === null)).toBe(true);
    expect(crew.every(id => actor(arena, id!).alive && !actor(arena, id!).vehicle)).toBe(true);
  });

  it('keeps all riders seated when safe dismount positions are blocked', () => {
    const walls = Array.from({ length: 4 }, () => ({ minX: 100, maxX: 101, minZ: 100, maxZ: 101 }));
    const { arena } = setup({ walls }); tick(arena, 5);
    const crew = vehicle(arena).occupants;
    const cage = [
      { minX: -8, maxX: -1.65, minZ: -8, maxZ: 8 }, { minX: 1.65, maxX: 8, minZ: -8, maxZ: 8 },
      { minX: -8, maxX: 8, minZ: -8, maxZ: -2.7 }, { minX: -8, maxX: 8, minZ: 2.7, maxZ: 8 },
    ];
    walls.forEach((wall, i) => Object.assign(wall, cage[i]));
    expect(arena.vehicleAction('p', 'exit')).toBe(false);
    expect(vehicle(arena).occupants).toEqual(crew);
  });

  it('does not start a pickup while the helicopter is airborne', () => {
    const { arena } = setup({ kind: 'helicopter' });
    input(arena, { lift: 1 }, .8);
    input(arena, {}, 2);
    expect(vehicle(arena, 'helicopter').y).toBeGreaterThan(1);
    expect(vehicle(arena, 'helicopter').occupants).toEqual(['p', null, null, null]);
  });

  it('keeps the helicopter crew seated in flight and unloads after landing', () => {
    const { arena } = setup({ kind: 'helicopter' }); tick(arena, 5);
    input(arena, { brake: false, lift: 1 }, 1.5);
    expect(vehicle(arena, 'helicopter').y).toBeGreaterThan(2);
    expect(arena.vehicleAction('p', 'exit')).toBe(false);
    expect(vehicle(arena, 'helicopter').occupants.every(Boolean)).toBe(true);
    input(arena, { lift: -1 }, 3);
    input(arena, {}, 1);
    expect(arena.vehicleAction('p', 'exit')).toBe(true);
    expect(vehicle(arena, 'helicopter').occupants.every(id => id === null)).toBe(true);
  });
});
