import { describe, expect, it } from 'vitest';
import { ORDER_ACKS, ORDER_KINDS, ORDER_TUNING, orderGoal, orderStep, ringPoint, scatterPoint, standingOrder } from './squad-orders';

const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('squad orders', () => {
  it('spread a squad round a point rather than stacking it', () => {
    const points = [0, 1, 2, 3].map(slot => ringPoint({ x: 10, z: 10 }, slot, 4, 3));
    for (const p of points) expect(gap(p, { x: 10, z: 10 })).toBeCloseTo(3);
    expect(gap(points[0], points[2])).toBeCloseTo(6);
  });
  it('send a scatter outward from the caller, fanned by slot', () => {
    const caller = { x: 0, z: 0 }, from = { x: 5, z: 0 };
    const straight = scatterPoint(from, caller, 16);
    expect(straight).toEqual({ x: 21, z: 0 });
    expect(gap(scatterPoint(from, caller, 16, .5), caller)).toBeGreaterThan(gap(from, caller));
    // Standing on the caller, the turn picks the way.
    expect(gap(scatterPoint(caller, caller, 16, 1), caller)).toBeCloseTo(16);
  });
  it('give each movement order its goal, slack and life', () => {
    const caller = { x: 0, z: 0 }, ally = { x: 8, z: 0 }, at = { x: 30, z: 30 };
    const gather = standingOrder('gather', 'p', 10, 0, 2, caller, ally);
    expect(gather.until).toBe(10 + ORDER_TUNING.gather.seconds);
    // A gather's goal travels with the caller.
    expect(gap(orderGoal(gather, { x: 50, z: 50 }), { x: 50, z: 50 })).toBeCloseTo(ORDER_TUNING.gather.ring);
    expect(gap(orderGoal(standingOrder('move', 'p', 0, 1, 3, caller, ally, at)), at)).toBeCloseTo(ORDER_TUNING.move.ring);
    expect(orderGoal(standingOrder('hold', 'p', 0, 0, 1, caller, ally))).toEqual(ally);
    expect(gap(orderGoal(standingOrder('scatter', 'p', 0, 0, 1, caller, ally)), caller)).toBeGreaterThan(gap(ally, caller) + 10);
  });
  it('step toward the goal at pace, and stop inside the slack', () => {
    expect(orderStep({ x: 0, z: 0 }, { x: 10, z: 0 }, 1, 3, .5)).toEqual({ dx: 1.5, dz: 0 });
    expect(orderStep({ x: 0, z: 0 }, { x: .5, z: 0 }, 1, 3, .5)).toBeNull();
  });
  it('have an answer for every order at every rank', () => {
    for (const kind of ORDER_KINDS) for (const rank of ['recruit', 'regular', 'veteran'] as const) expect(ORDER_ACKS[kind][rank].length).toBeGreaterThan(0);
  });
});
