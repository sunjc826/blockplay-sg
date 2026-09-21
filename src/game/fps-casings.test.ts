import { expect, it } from 'vitest';
import { advanceCasings, casingFade, CASING_FADE, ejectCasing, MAX_CASINGS, type Casing } from './fps-casings';

const right = { x: 1, y: 0, z: 0 }, up = { x: 0, y: 1, z: 0 }, back = { x: 0, y: 0, z: 1 };
const port = { x: 0, y: 1.4, z: 0 };
const eject = (list: Casing[], carry = { x: 0, y: 0, z: 0 }) => ejectCasing(list, port, right, up, back, carry, () => .5);
const settle = (list: Casing[], seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) advanceCasings(list, 1 / 60); };

it('throws the case out of the port and up, on the weapon\'s own axes', () => {
  const list: Casing[] = [];
  const casing = eject(list);
  expect(casing.vx).toBeGreaterThan(0);
  expect(casing.vy).toBeGreaterThan(0);
  // Held sideways, the port still throws along the weapon's right.
  const sideways = ejectCasing([], port, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, back, undefined, () => .5);
  expect(sideways.vy).toBeLessThan(0);
  expect(sideways.vx).toBeGreaterThan(0);
});

it('carries the shooter\'s ground speed so walking fire does not drop brass in place', () => {
  const still = eject([]), walking = eject([], { x: 0, y: 0, z: -4 });
  expect(walking.vz).toBeCloseTo(still.vz - 4, 10);
});

it('falls, bounces lower each time and comes to rest', () => {
  const list: Casing[] = []; eject(list);
  const apex = list[0].y;
  settle(list, .4);
  expect(list[0].y).toBeLessThan(apex);
  settle(list, 1.2);
  expect(list[0].resting).toBe(true);
  expect(list[0].y).toBeCloseTo(0, 6);
  const still = { ...list[0] };
  settle(list, .2);
  // A resting case keeps its pose; only its age moves.
  expect(list[0]?.x).toBeCloseTo(still.x, 10);
  expect(list[0]?.angle).toBeCloseTo(still.angle, 10);
});

it('lands on a raised floor rather than through it', () => {
  const list: Casing[] = []; eject(list);
  for (let t = 0; t < 2; t += 1 / 60) advanceCasings(list, 1 / 60, 1.2);
  expect(list[0]?.y ?? 1.2).toBeGreaterThanOrEqual(1.2 - 1e-6);
});

it('recycles the oldest case instead of growing the pool', () => {
  const list: Casing[] = [];
  for (let i = 0; i < MAX_CASINGS; i++) { eject(list); advanceCasings(list, 1 / 60); }
  expect(list.length).toBe(MAX_CASINGS);
  const oldest = Math.max(...list.map(c => c.age));
  eject(list);
  expect(list.length).toBe(MAX_CASINGS);
  expect(Math.max(...list.map(c => c.age))).toBeLessThan(oldest);
});

it('fades out before it expires, and drops off the list when it does', () => {
  const list: Casing[] = []; const casing = eject(list);
  expect(casingFade(casing)).toBe(1);
  casing.age = casing.life - CASING_FADE / 2;
  expect(casingFade(casing)).toBeCloseTo(.5, 6);
  settle(list, 6);
  expect(list).toHaveLength(0);
});
