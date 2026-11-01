import { describe, expect, it } from 'vitest';
import { resolveVehicleCrossing, vehicleArrivalClear } from './vehicle-crossing';
import { createVehicle, driveVehicle, flyVehicle } from './vehicle-rules';
import { WORLD_GATEWAYS } from './world-zones';
import { getRegion } from './regions';
import { sceneFlightObstacles } from './flight-obstacles';
import { getTraversalObstacles } from './vertical-routes';

const view = { yaw: 2.9, pitch: -.2 };
describe('vehicle district crossing', () => {
  it('only opts Sentosa in, and excludes damaged wrecks, water and insufficient hull clearance', () => {
    expect(WORLD_GATEWAYS.filter(g => g.vehicles?.length).map(g => g.id)).toEqual(['harbourfront-to-sentosa', 'sentosa-to-harbourfront']);
    const before = createVehicle('car', { x: 109, z: 209.9, yaw: Math.PI });
    const next = { ...before, z: 210.1, speed: 12, health: 103, ammo: 51, lateralSpeed: .2, yawSpeed: .1 };
    const crossed = resolveVehicleCrossing('harbourfront', before, next, view)!;
    expect(crossed.transition.spawn).toMatchObject(view);
    expect(crossed.state).toEqual({ ...next, x: 108, z: -204.75 });
    for (const patch of [{ health: 0 }, { despawned: true }, { x: 113.3 }, { y: NaN }]) expect(resolveVehicleCrossing('harbourfront', before, { ...next, ...patch }, view)).toBeNull();
    expect(resolveVehicleCrossing('marina-bay', before, next, view)).toBeNull();
  });
  it('requires helicopters to clear the canopy and retains altitude and climb', () => {
    const before = { ...createVehicle('helicopter', { x: 109, z: 209.9, yaw: Math.PI }), y: 18, climb: 2.1 };
    const crossed = resolveVehicleCrossing('harbourfront', before, { ...before, z: 210.1 }, view)!;
    expect(crossed.state).toMatchObject({ y: 18, climb: 2.1, yaw: Math.PI });
    expect(resolveVehicleCrossing('harbourfront', before, { ...before, z: 210.1, y: 4 }, view)).toBeNull();
  });
  for (const gateway of WORLD_GATEWAYS.filter(g => g.vehicles)) for (const kind of gateway.vehicles!) it(`${gateway.from}: ${kind} drives/flies through the real approach, seam and arrival`, () => {
    const region = getRegion(gateway.from), source = region.build();
    const destination = getRegion(gateway.to), target = destination.build();
    const flight = (world: typeof source) => [...sceneFlightObstacles(world.scene), ...getTraversalObstacles(world.scene), ...world.obstacles].map(o => ({ ...o, minY: o.minY ?? 0, maxY: o.maxY ?? 2.5 }));
    try {
      const direction = gateway.border!.direction;
      let state = { ...createVehicle(kind, { x: gateway.position.x, z: gateway.position.z - direction * 14, yaw: direction > 0 ? Math.PI : 0 }), y: kind === 'helicopter' ? 12 : .13 };
      let crossed = false;
      for (let i = 0; i < 180; i++) {
        const before = state;
        state = kind === 'car' ? driveVehicle(state, 1, 0, false, .025, source.obstacles, region.bounds).state : flyVehicle(state, 1, 0, 0, false, .025, flight(source), region.bounds).state;
        const crossing = resolveVehicleCrossing(gateway.from, before, state, view);
        if (crossing) {
          expect(vehicleArrivalClear(crossing.state, target.obstacles, flight(target), destination.bounds)).toBe(true);
          let arrived = crossing.state;
          for (let n = 0; n < 30; n++) arrived = kind === 'car' ? driveVehicle(arrived, 1, 0, false, .025, target.obstacles, destination.bounds).state : flyVehicle(arrived, 1, 0, 0, false, .025, flight(target), destination.bounds).state;
          expect((arrived.z - crossing.state.z) * direction).toBeGreaterThan(2);
          crossed = true; break;
        }
      }
      expect(crossed).toBe(true);
    } finally { source.dispose(); target.dispose(); }
  });
  it('rejects blocked arrivals, including overhead obstructions and the outside edge', () => {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const v = createVehicle('car', { x: 0, z: 0, yaw: 0 });
    const wall = { minX: -.5, maxX: .5, minZ: -1, maxZ: 1, minY: 0, maxY: 3 };
    expect(vehicleArrivalClear(v, [wall], [], bounds)).toBe(false);
    expect(vehicleArrivalClear({ ...v, x: 9 }, [], [], bounds)).toBe(false);
    expect(vehicleArrivalClear({ ...v, kind: 'helicopter', y: 7 }, [], [{ ...wall, minY: 9, maxY: 12 }], bounds)).toBe(false);
    expect(vehicleArrivalClear({ ...v, kind: 'helicopter', y: 7 }, [{ ...wall, maxY: 20 }], [], bounds)).toBe(false);
  });
});
