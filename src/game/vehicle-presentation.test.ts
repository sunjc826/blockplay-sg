import { expect, it } from 'vitest';
import { createSharedVehicle } from './vehicle-seats';
import { createVehiclePresentation } from './vehicle-presentation';

it.each(['car', 'helicopter'] as const)('interpolates %s travel and flight between authority ticks without changing authority', kind => {
  const view = createVehiclePresentation(), state = createSharedVehicle(kind, { x: 0, z: 0, yaw: 0 });
  for (let i = 0; i <= 20; i++) view.accept({ ...state, x: i, y: kind === 'helicopter' ? i * .25 : .13 }, i * .05);
  const positions = Array.from({ length: 7 }, (_, i) => view.sample(1 + i / 120)!);
  for (let i = 1; i < positions.length; i++) {
    expect(positions[i].x - positions[i - 1].x).toBeCloseTo(1 / 6);
    if (kind === 'helicopter') expect(positions[i].y - positions[i - 1].y).toBeCloseTo(1 / 24);
  }
  expect(state.x).toBe(0);
  expect(view.sample(2)!.x).toBe(20); // Never extrapolate through a wall after updates stop.
});

it('turns across the angle boundary by the shortest path', () => {
  const view = createVehiclePresentation(), state = createSharedVehicle('car', { x: 0, z: 0, yaw: Math.PI - .1 });
  view.accept(state, 0); view.accept({ ...state, yaw: -Math.PI + .1, gunYaw: -Math.PI + .1 }, .1);
  expect(view.sample(.15)!.yaw).toBeCloseTo(Math.PI);
  expect(view.sample(.15)!.gunYaw).toBeCloseTo(Math.PI);
});

it('snaps replacements and teleports rather than sweeping a hull through the district', () => {
  const view = createVehiclePresentation(), state = createSharedVehicle('car', { x: 0, z: 0, yaw: 0 });
  view.accept(state, 0); view.accept({ ...state, x: 80 }, .1);
  expect(view.sample(.1)!.x).toBe(80);
  view.accept({ ...state, x: 80, health: 0 }, .2); view.accept({ ...state, x: 85 }, .3);
  expect(view.sample(.3)!.x).toBe(85);
  view.reset(); expect(view.sample(1)).toBeNull();
});
