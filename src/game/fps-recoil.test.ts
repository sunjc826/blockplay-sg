import { expect, it } from 'vitest';
import { advanceRecoil, BURST_RESET, createRecoil, PITCH_CEILING, recoilView, recordRecoilShot, resetRecoil, VIEW_SCALE, YAW_CEILING } from './fps-recoil';

const step = (state: ReturnType<typeof createRecoil>, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) advanceRecoil(state, dt);
};

it('climbs into the shot rather than snapping to the impulse', () => {
  const state = createRecoil();
  recordRecoilShot(state, .018, 0, () => .5);
  // Nothing is applied until the next step: the rendered offset chases a target.
  expect(state.pitch).toBe(0);
  advanceRecoil(state, 1 / 120);
  const early = state.pitch;
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(state.pitchTarget);
  step(state, .06);
  expect(state.pitch).toBeGreaterThan(early);
});

it('settles back to rest once the trigger is released', () => {
  const state = createRecoil();
  for (let i = 0; i < 12; i++) { recordRecoilShot(state, .026, 1, () => .5); step(state, .085); }
  expect(Math.abs(state.pitch)).toBeGreaterThan(.005);
  step(state, 2);
  expect(Math.abs(state.pitch)).toBeLessThan(1e-3);
  expect(Math.abs(state.yaw)).toBeLessThan(1e-3);
  expect(Math.abs(state.punch)).toBeLessThan(1e-3);
  expect(Math.abs(state.roll)).toBeLessThan(1e-3);
});

it('holds a long burst under the ceilings that bound aim displacement', () => {
  const state = createRecoil();
  for (let i = 0; i < 60; i++) {
    recordRecoilShot(state, .026, 1, Math.random); step(state, .072);
    expect(state.pitchTarget).toBeLessThanOrEqual(PITCH_CEILING + 1e-9);
    expect(Math.abs(state.yawTarget)).toBeLessThanOrEqual(YAW_CEILING + 1e-9);
  }
  // The camera coupling is what the engine used before, so a burst costs the
  // same aim displacement it always did.
  expect(recoilView(state).pitch).toBeCloseTo(state.pitch * VIEW_SCALE, 12);
  expect(Math.abs(recoilView(state).pitch)).toBeLessThanOrEqual(PITCH_CEILING * VIEW_SCALE);
});

it('walks the same pattern every burst, to both sides', () => {
  const fixed = () => .5; // no jitter: the pattern alone
  const run = () => {
    const state = createRecoil(), path: number[] = [];
    for (let i = 0; i < 12; i++) { recordRecoilShot(state, .018, 0, fixed); path.push(state.yawTarget); step(state, .12); }
    return path;
  };
  const first = run();
  expect(run()).toEqual(first);
  expect(first.some(v => v > 0)).toBe(true);
  expect(first.some(v => v < 0)).toBe(true);
});

it('restarts the pattern after a pause, not mid-magazine', () => {
  const state = createRecoil();
  recordRecoilShot(state, .018, 0, () => .5); recordRecoilShot(state, .018, 0, () => .5);
  expect(state.shot).toBe(2);
  step(state, BURST_RESET * .5);
  expect(state.shot).toBe(2);
  step(state, BURST_RESET);
  expect(state.shot).toBe(0);
});

it('stays finite through absurd frames and clears on reset', () => {
  const state = createRecoil();
  recordRecoilShot(state, .026, 1, Math.random);
  advanceRecoil(state, 0); advanceRecoil(state, 5); advanceRecoil(state, -1);
  Object.values(state).forEach(value => expect(Number.isFinite(value)).toBe(true));
  resetRecoil(state);
  expect(state).toEqual(createRecoil());
});
