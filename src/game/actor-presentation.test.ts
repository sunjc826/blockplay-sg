import { expect, it } from 'vitest';
import { createActorPresentation } from './actor-presentation';
import { createArena } from './arena-rules';

const actor = () => { const arena = createArena([], 0); arena.addPlayer('other', 'Other'); return arena.snapshot().actors[0]; };

it('interpolates host-time motion even when snapshots arrive in a batch', () => {
  const view = createActorPresentation(), state = actor();
  view.accept({ ...state, x: 0 }, 0, 1);
  view.accept({ ...state, x: 1 }, .1, 1.1);
  view.accept({ ...state, x: 2 }, .2, 1.1);
  expect(view.sample(1.1)!.x).toBeCloseTo(1);
  expect(view.sample(1.125)!.x).toBeCloseTo(1.25);
  expect(view.sample(1.15)!.x).toBeCloseTo(1.5);
  expect(view.sample(10)!.x).toBe(2);
  expect(state.x).not.toBe(2);
});

it('uses the shortest turn and does not rewind its render clock on delayed arrivals', () => {
  const view = createActorPresentation(), state = actor();
  view.accept({ ...state, x: 0, yaw: Math.PI - .1 }, 0, 1);
  view.accept({ ...state, x: 1, yaw: -Math.PI + .1 }, .1, 1.1);
  expect(view.sample(1.15)!.yaw).toBeCloseTo(Math.PI);
  const x = view.sample(1.2)!.x;
  view.accept({ ...state, x: 2 }, .2, 2);
  expect(view.sample(2)!.x).toBeGreaterThanOrEqual(x);
});

it('replaces the path on death, respawn, boarding, match reset and teleport', () => {
  const state = actor();
  for (const next of [
    { ...state, alive: false }, { ...state, deaths: 1 },
    { ...state, vehicle: 'car' as const, seat: 0 }, { ...state, x: 90 },
  ]) {
    const view = createActorPresentation();
    view.accept({ ...state, x: 0 }, 10, 10); view.accept(next, 10.1, 10.1);
    expect(view.sample(10.1)!.x).toBe(next.x);
  }
  const view = createActorPresentation();
  view.accept({ ...state, x: 0 }, 10, 10); view.accept({ ...state, x: 4 }, 0, 11);
  expect(view.sample(11)!.x).toBe(4);
});
