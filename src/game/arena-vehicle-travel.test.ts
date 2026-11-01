import { describe, expect, it, vi } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { createSharedVehicle } from './vehicle-seats';
import { createRegionMovement } from './region-collision';
import * as THREE from 'three';
import { createSoloSession } from './lan-peer';
import { createArenaRuntime, validArenaSnapshot } from './arena-runtime';
import type { VehicleKind } from './vehicle-rules';

const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
const spawns = { car: { x: 0, z: 0, yaw: 0 }, helicopter: { x: 40, z: 0, yaw: 0 } };
function setup(kind: VehicleKind, id: string, departures?: Pick<ArenaEnvironment, 'departedCrew' | 'departedVehicles'>) {
  const x = spawns[kind].x;
  const environment: ArenaEnvironment = { ...departures, bounds, move: createRegionMovement(bounds).move, spawns: [{ x: x + 10, z: 0 }], playerSpawn: { x: x + 3.5, z: 0 }, endless: true,
    facilities: { sites: [
      { id: 'command', name: 'Command', kind: 'command', x: x + 10, y: 0, z: 0, initialOwner: 'armed-forces', deployment: { x: x + 7, z: 0, yaw: 0 } },
    ], savedVehicles: (['car', 'helicopter'] as const).map(k => ({ ...createSharedVehicle(k, spawns[k]), faction: 'armed-forces' })) } };
  const arena = createArena([], 0, 'assault', environment, { spawns, openWorld: true });
  arena.addPlayer(id, 'Explorer', 0, 0, [], undefined, true);
  return { arena, environment };
}
const tick = (arena: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds; t += .05) arena.step(.05); };

describe('solo district vehicle crew transfer', () => {
  it.each(['car', 'helicopter'] as const)('preserves a full %s crew and hull across a round trip without source duplicates', kind => {
    const { arena: source } = setup(kind, 'old-player');
    source.callout('old-player', 'gather');
    expect(source.vehicleAction('old-player', 'enter', kind)).toBe(true);
    tick(source, 6);
    const transfer = source.vehicleTravel('old-player', 'harbourfront')!;
    expect(transfer.vehicle.occupants.every(Boolean)).toBe(true);
    expect(transfer.crew).toHaveLength(3);
    // Wounded crew with a part-spent magazine and a damaged, armed hull.
    transfer.crew[0].actor.health = 47; transfer.crew[0].actor.armor = 13;
    transfer.crew[0].ammo[transfer.crew[0].actor.weapon].magazine = 7;
    transfer.crew[0].actor.conditions = { deafened: { strength: 1, remaining: 4, seconds: 5 } };
    Object.assign(transfer.vehicle, { x: 1, z: 20, y: kind === 'helicopter' ? 18 : .13, speed: 8, climb: kind === 'helicopter' ? 1.2 : 0, lateralSpeed: .2, yawSpeed: .1, health: 103, ammo: 51, weaponCooldown: .12 });
    source.detachVehicle('old-player');
    expect(source.snapshot().vehicles!.some(v => v.kind === kind)).toBe(false);
    expect(validArenaSnapshot(source.snapshot())).toBe(true);
    expect(source.snapshot().actors.filter(a => transfer.sourceCrewIds.includes(a.id))).toHaveLength(0);
    const { arena: target, environment } = setup(kind, 'new-player');
    expect(target.restoreVehicleTravel(transfer, 'new-player')).toBe(true);
    const snap = target.snapshot();
    expect(snap.vehicles!.find(v => v.kind === kind)).toEqual({ ...transfer.vehicle, occupants: transfer.vehicle.occupants.map(id => id === 'old-player' ? 'new-player' : id) });
    for (const member of transfer.crew) {
      const restored = snap.actors.find(a => a.id === member.actor.id)!;
      expect(restored).toMatchObject({ name: member.actor.name, health: member.actor.health, armor: member.actor.armor, faction: member.actor.faction, role: member.actor.role, weapon: member.actor.weapon, vehicle: kind, seat: transfer.vehicle.occupants.indexOf(member.actor.id) });
    }
    expect(snap.actors.find(a => a.id === transfer.crew[0].actor.id)?.conditions).toEqual(transfer.crew[0].actor.conditions);
    expect(validArenaSnapshot(snap, environment)).toBe(true);
    const back = target.vehicleTravel('new-player', 'sentosa')!;
    expect(back.crew[0].ammo[back.crew[0].actor.weapon].magazine).toBe(7);
    expect(back.crew.map(m => m.actor.id)).toEqual(transfer.crew.map(m => m.actor.id));
    expect(back.crew.every(m => !m.order || m.order.by === 'new-player')).toBe(true);
    const { arena: revisit } = setup(kind, 'third-player', { departedVehicles: [kind], departedCrew: transfer.sourceCrewIds });
    expect(revisit.snapshot().vehicles!.some(v => v.kind === kind)).toBe(false);
    expect(revisit.snapshot().actors.some(a => transfer.sourceCrewIds.includes(a.id))).toBe(false);
    expect(revisit.restoreVehicleTravel(back, 'third-player')).toBe(true);
    expect(revisit.snapshot().vehicles!.filter(v => v.kind === kind)).toHaveLength(1);
    expect(revisit.snapshot().actors.filter(a => back.crew.some(m => m.actor.id === a.id))).toHaveLength(3);
    expect(revisit.restoreVehicleTravel(back, 'third-player')).toBe(false);
  });
  it('keeps a passenger in the same seat with the AI driver intact', () => {
    const { arena } = setup('car', 'p');
    arena.callout('p', 'gather'); arena.vehicleAction('p', 'enter', 'car'); tick(arena, 6);
    const transfer = arena.vehicleTravel('p', 'harbourfront')!;
    [transfer.vehicle.occupants[0], transfer.vehicle.occupants[2]] = [transfer.vehicle.occupants[2], transfer.vehicle.occupants[0]];
    const { arena: target } = setup('car', 'q');
    expect(target.restoreVehicleTravel(transfer, 'q')).toBe(true);
    expect(target.snapshot().actors.find(a => a.id === 'q')?.seat).toBe(2);
    expect(target.snapshot().vehicles!.find(v => v.kind === 'car')?.occupants[0]).toBe(transfer.vehicle.occupants[0]);
  });
  it('publishes the imported seat before play starts, then accepts the first held driving input', () => {
    vi.useFakeTimers();
    const { arena, environment } = setup('car', 'old');
    arena.vehicleAction('old', 'enter', 'car');
    const transfer = arena.vehicleTravel('old', 'harbourfront')!;
    transfer.vehicle.speed = 8;
    const session = createSoloSession('Explorer');
    const runtime = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], session, botCount: 0, environment, vehicles: { spawns, openWorld: true } });
    try {
      expect(runtime.restoreVehicleTravel(transfer)).toBe(true);
      const frame = runtime.update(0, { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: false });
      expect(frame.self?.vehicle).toBe('car');
      expect(frame.self?.seat).toBe(0);
      expect(frame.snapshot!.vehicles!.find(v => v.kind === 'car')?.speed).toBe(8);
      expect(frame.snapshot!.vehicles!.find(v => v.kind === 'car')?.occupants[0]).toBe(session.id);
      const input = { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true, vehicleControls: { forward: 1, steer: 0, lift: 0, brake: false, boost: false, fire: false } };
      runtime.update(0, input); vi.advanceTimersByTime(100);
      expect(runtime.update(0, input).snapshot!.vehicles!.find(v => v.kind === 'car')!.speed).toBeGreaterThan(8);
    } finally { runtime.dispose(); session.close(); vi.useRealTimers(); }
  });
  it('does not transfer an unmounted or dead player', () => {
    const { arena } = setup('car', 'p'); expect(arena.vehicleTravel('p', 'harbourfront')).toBeNull();
    arena.vehicleAction('p', 'enter', 'car'); arena.setPlayerVitals('p', { health: 0 });
    expect(arena.vehicleTravel('p', 'harbourfront')).toBeNull();
  });
});
