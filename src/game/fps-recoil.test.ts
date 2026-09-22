import { describe, expect, it } from 'vitest';
import { advanceRecoil, BURST_RESET, createRecoil, PITCH_CEILING, recoilPose, recoilView, recordRecoilShot, RECOVERY_LIMITS, resetRecoil, VIEW_SCALE, YAW_CEILING } from './fps-recoil';

const step = (state: ReturnType<typeof createRecoil>, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) advanceRecoil(state, dt);
};
/** The issued weapons, as `fps-rules` rates them. */
const SAR = { recoil: .018, recoilRecovery: 1 }, ULTIMAX = { recoil: .026, recoilRecovery: .85 };
/**
 * Where a held trigger settles: the climb a player has to hold against, found
 * by firing a magazine at the weapon's own cadence rather than by solving for
 * it, so the number the test reads is the number the engine produces.
 */
const sustained = (spec: { recoil: number; recoilRecovery: number }, weapon: number, interval: number, rounds = 30) => {
  const state = createRecoil();
  let peak = 0;
  for (let i = 0; i < rounds; i++) { recordRecoilShot(state, spec, weapon, () => .5); step(state, interval, 1 / 240); peak = Math.max(peak, state.pitch); }
  return peak;
};

it('climbs into the shot rather than snapping to the impulse', () => {
  const state = createRecoil();
  recordRecoilShot(state, SAR, 0, () => .5);
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
  for (let i = 0; i < 12; i++) { recordRecoilShot(state, ULTIMAX, 1, () => .5); step(state, .085); }
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
    recordRecoilShot(state, ULTIMAX, 1, Math.random); step(state, .072);
    expect(state.pitchTarget).toBeLessThanOrEqual(PITCH_CEILING + 1e-9);
    expect(Math.abs(state.yawTarget)).toBeLessThanOrEqual(YAW_CEILING + 1e-9);
  }
  expect(recoilView(state).pitch).toBeCloseTo(state.pitch * VIEW_SCALE, 12);
  expect(Math.abs(recoilView(state).pitch)).toBeLessThanOrEqual(PITCH_CEILING * VIEW_SCALE);
});

it('walks the same pattern every burst, to both sides', () => {
  const fixed = () => .5; // no jitter: the pattern alone
  const run = () => {
    const state = createRecoil(), path: number[] = [];
    for (let i = 0; i < 12; i++) { recordRecoilShot(state, SAR, 0, fixed); path.push(state.yawTarget); step(state, .12); }
    return path;
  };
  const first = run();
  expect(run()).toEqual(first);
  expect(first.some(v => v > 0)).toBe(true);
  expect(first.some(v => v < 0)).toBe(true);
});

it('restarts the pattern after a pause, not mid-magazine', () => {
  const state = createRecoil();
  recordRecoilShot(state, SAR, 0, () => .5); recordRecoilShot(state, SAR, 0, () => .5);
  expect(state.shot).toBe(2);
  step(state, BURST_RESET * .5);
  expect(state.shot).toBe(2);
  step(state, BURST_RESET);
  expect(state.shot).toBe(0);
});

it('stays finite through absurd frames and clears on reset', () => {
  const state = createRecoil();
  recordRecoilShot(state, ULTIMAX, 1, Math.random);
  advanceRecoil(state, 0); advanceRecoil(state, 5); advanceRecoil(state, -1);
  Object.values(state).forEach(value => expect(Number.isFinite(value)).toBe(true));
  resetRecoil(state);
  expect(state).toEqual(createRecoil());
});

describe('how big the kick is', () => {
  // A kick nobody has to answer is decoration. These are the floors that make
  // it a thing the player fights, in degrees of camera displacement, which is
  // what a shooter is actually felt in.
  const degrees = (radians: number) => radians * 180 / Math.PI;
  it('throws the sights off the target on a single shot', () => {
    const state = createRecoil();
    recordRecoilShot(state, SAR, 0, () => .5);
    let peak = 0;
    for (let i = 0; i < 40; i++) { advanceRecoil(state, 1 / 240); peak = Math.max(peak, recoilView(state).pitch); }
    expect(degrees(peak)).toBeGreaterThan(.5);
    expect(degrees(peak)).toBeLessThan(2);
  });
  it('makes a held trigger climb enough to miss a target with', () => {
    // Drill targets stand 12-30 units out, so a degree of climb is ~0.2-0.5
    // units of miss. Under half a degree the burst would land anyway.
    expect(degrees(sustained(SAR, 0, .12) * VIEW_SCALE)).toBeGreaterThan(1);
    expect(degrees(sustained(ULTIMAX, 1, .085) * VIEW_SCALE)).toBeGreaterThan(2);
  });
  it('kicks the weapon in the hands, not only the camera', () => {
    const state = createRecoil();
    for (let i = 0; i < 8; i++) { recordRecoilShot(state, ULTIMAX, 1, () => .5); step(state, .085, 1 / 240); }
    const pose = recoilPose(state);
    // Centimetres back towards the shoulder, and a visible muzzle rise.
    expect(pose.push).toBeGreaterThan(.02);
    expect(degrees(pose.pitch)).toBeGreaterThan(2);
  });
});

describe('recovery, the second rating', () => {
  it('leaves the first shot alone and answers the ones after it', () => {
    const slow = { recoil: .018, recoilRecovery: .7 }, quick = { recoil: .018, recoilRecovery: 1.6 };
    const impulse = (spec: typeof slow) => {
      const state = createRecoil();
      recordRecoilShot(state, spec, 0, () => .5);
      return state.pitchTarget;
    };
    // One round throws the muzzle exactly as far either way: the impulse is
    // `recoil` alone, and recovery only decides how it comes back from there.
    expect(impulse(quick)).toBe(impulse(slow));
    // A magazine is where the settle rate decides the climb.
    expect(sustained(quick, 0, .12)).toBeLessThan(sustained(slow, 0, .12) * .8);
  });
  it('settles a burst sooner, which is what it is bought for', () => {
    const settleTime = (recoilRecovery: number) => {
      const state = createRecoil();
      for (let i = 0; i < 10; i++) { recordRecoilShot(state, { recoil: .026, recoilRecovery }, 1, () => .5); step(state, .085, 1 / 240); }
      let elapsed = 0;
      while (Math.abs(state.pitch) > 1e-3 && elapsed < 10) { advanceRecoil(state, 1 / 240); elapsed += 1 / 240; }
      return elapsed;
    };
    expect(settleTime(1.5)).toBeLessThan(settleTime(.85));
  });
  it('keeps the rate of the weapon that fired, across a swap mid-settle', () => {
    const state = createRecoil();
    recordRecoilShot(state, { recoil: .026, recoilRecovery: .5 }, 1, () => .5);
    expect(state.recovery).toBe(.5);
    advanceRecoil(state, 1 / 60);
    expect(state.recovery).toBe(.5);
  });
  it('cannot be rated into stalling the settle or cancelling the kick', () => {
    for (const rating of [0, -5, 500, NaN]) {
      const state = createRecoil();
      recordRecoilShot(state, { recoil: .026, recoilRecovery: rating }, 1, () => .5);
      expect(state.recovery).toBeGreaterThanOrEqual(RECOVERY_LIMITS.min);
      expect(state.recovery).toBeLessThanOrEqual(RECOVERY_LIMITS.max);
      step(state, 12);
      expect(Math.abs(state.pitch)).toBeLessThan(1e-3);
    }
  });
});
