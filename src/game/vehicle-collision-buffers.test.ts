import { expect, it } from 'vitest';
import { createVehicleCollisionBuffers } from './vehicle-collision-buffers';
import { createSharedVehicle } from './vehicle-seats';
import { driveVehicle, flyVehicle, vehicleBounds, type FlightObstacle } from './vehicle-rules';
import type { Obstacle } from './region-collision';

const vehicle = (kind: 'car' | 'helicopter', x: number) => createSharedVehicle(kind, { x, z: 0, yaw: 0 });
const groundList = (staticGround: readonly Obstacle[], self: ReturnType<typeof vehicle>, all: ReturnType<typeof vehicle>[]) => [...staticGround, ...all.filter(v => !v.despawned && v !== self && v.y < 2).map(vehicleBounds)];
const flightList = (staticFlight: readonly FlightObstacle[], self: ReturnType<typeof vehicle>, all: ReturnType<typeof vehicle>[]) => [...staticFlight, ...all.filter(v => !v.despawned && v !== self).map(v => ({ ...vehicleBounds(v), minY: v.y, maxY: v.y + 2.7 }))];

it('reuses per-vehicle lists while refreshing moved, airborne, removed and respawned hulls in order', () => {
  const ground = [{ minX: -10, maxX: -8, minZ: -2, maxZ: 2, maxY: 3 }];
  const flight = [{ ...ground[0], minY: 0, maxY: 3 }], buffers = createVehicleCollisionBuffers(ground, ground);
  const car = vehicle('car', 0), other = vehicle('car', 5), heli = vehicle('helicopter', 12), all = [car, other, heli];
  const firstGround = buffers.ground(car, all), firstFlight = buffers.flight(heli, all, flight);
  for (let step = 0; step < 12; step++) {
    other.x = 5 - step * .8; other.yaw = step * .3; heli.y = step % 4;
    other.despawned = step % 3 === 0;
    expect(buffers.ground(car, all)).toBe(firstGround);
    expect(firstGround).toEqual(groundList(ground, car, all));
    expect(buffers.flight(heli, all, flight)).toBe(firstFlight);
    expect(firstFlight).toEqual(flightList(flight, heli, all));
    const snapshot = structuredClone(firstGround);
    buffers.ground(other, all); expect(firstGround).toEqual(snapshot);
  }
  const replacement = vehicle('car', -5); all[1] = replacement;
  expect(buffers.ground(car, all)).toEqual(groundList(ground, car, all));
});

it('keeps static object edits live and handles changed source lengths, replaced flight lists and fallback copies', () => {
  const ground: Obstacle[] = [{ minX: 1, maxX: 2, minZ: 3, maxZ: 4, minY: 8 }];
  const buffers = createVehicleCollisionBuffers(ground, ground), car = vehicle('car', 0), all = [car];
  const cached = buffers.ground(car, all); ground[0].minX = -2;
  expect(cached[0].minX).toBe(-2);
  ground.push({ minX: 8, maxX: 9, minZ: 8, maxZ: 9 }); expect(buffers.ground(car, all)).toEqual(ground);
  for (const authored of [[{ ...ground[0], minY: 4, maxY: 9 }], undefined, [{ ...ground[1], minY: 2, maxY: 4 }], undefined]) {
    expect(buffers.flight(car, all, authored)).toEqual(authored ?? ground.map(o => ({ ...o, minY: 0, maxY: o.maxY ?? 2.5 })));
  }
  ground[0].maxY = 17;
  expect(buffers.flight(car, all)[0].maxY).toBe(17);
});

it('produces exactly the same driving and flying results as freshly constructed collision lists', () => {
  const ground = [{ minX: -3, maxX: 3, minZ: -12, maxZ: -10, maxY: 7 }], flight = [{ ...ground[0], minY: 0, maxY: 7 }];
  const buffers = createVehicleCollisionBuffers(ground, ground), car = vehicle('car', 0), heli = vehicle('helicopter', 15), all = [car, heli];
  const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  for (let i = 0; i < 160; i++) {
    const steer = Math.sin(i * .1), dt = i % 3 === 0 ? .1 : .05;
    const expectedCar = driveVehicle(car, 1, steer, false, dt, groundList(ground, car, all), bounds);
    expect(driveVehicle(car, 1, steer, false, dt, buffers.ground(car, all), bounds)).toEqual(expectedCar);
    Object.assign(car, expectedCar.state);
    const expectedHeli = flyVehicle(heli, .5, steer, i < 80 ? 1 : -1, false, dt, flightList(flight, heli, all), bounds);
    expect(flyVehicle(heli, .5, steer, i < 80 ? 1 : -1, false, dt, buffers.flight(heli, all, flight), bounds)).toEqual(expectedHeli);
    Object.assign(heli, expectedHeli.state);
  }
});
