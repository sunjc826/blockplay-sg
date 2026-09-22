import { describe, expect, it } from 'vitest';
import { advanceRecoil, BURST_RESET, CLIMB_CEILING, compensateRecoil, createRecoil, PITCH_CEILING, recoilPose, recoilView, recordRecoilShot, RECOVERY_DELAY, RECOVERY_LIMITS, resetRecoil, takeAimPush, VIEW_SCALE, YAW_CEILING } from './fps-recoil';
import { FPS_WEAPONS } from './fps-rules';

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

/**
 * A shooter holding the weapon: the engine's half of the loop, which owns the
 * aim and only ever moves it by what `takeAimPush` hands over.
 */
const shooter = (spec = SAR, weapon = 0) => {
  const state = createRecoil();
  let pitch = 0, yaw = 0;
  const drain = () => { const push = takeAimPush(state); pitch += push.pitch; yaw += push.yaw; };
  return {
    state,
    aim: () => ({ pitch, yaw }),
    fire() { recordRecoilShot(state, spec, weapon, () => .5); drain(); },
    tick(seconds: number, dt = 1 / 240) { for (let t = 0; t < seconds; t += dt) { advanceRecoil(state, dt); drain(); } },
    /** The shooter's own mouse, offered back the way the engine offers it. */
    pull(radians: number) { pitch += radians; compensateRecoil(state, radians, 0); },
  };
};

describe('the aim recoil takes', () => {
  const degrees = (radians: number) => radians * 180 / Math.PI;
  it('walks the shooter off the target, not just the picture', () => {
    // The whole point: a burst nobody has to answer is decoration at any
    // amplitude, because it returns to exactly where it was aimed.
    const player = shooter();
    for (let i = 0; i < 8; i++) { player.fire(); player.tick(.12); }
    expect(degrees(player.aim().pitch)).toBeGreaterThan(3);
  });
  it('holds the aim up while the trigger is held', () => {
    const player = shooter();
    player.fire();
    const taken = player.aim().pitch;
    // Inside the firing interval nothing is given back, so a burst accumulates.
    player.tick(RECOVERY_DELAY * .9);
    expect(player.aim().pitch).toBeCloseTo(taken, 12);
  });
  it('gives it back once the trigger is released, at the recovery rating', () => {
    const settle = (recoilRecovery: number) => {
      const player = shooter({ recoil: .018, recoilRecovery }, 0);
      for (let i = 0; i < 8; i++) { player.fire(); player.tick(.12); }
      const peak = player.aim().pitch;
      let elapsed = 0;
      while (player.aim().pitch > peak * .05 && elapsed < 10) { player.tick(1 / 240, 1 / 240); elapsed += 1 / 240; }
      return { peak, elapsed, rest: player.aim().pitch };
    };
    const slow = settle(.7), quick = settle(1.6);
    // Back to where the shooter was pointing, either way.
    expect(slow.rest).toBeLessThan(slow.peak * .05);
    expect(quick.rest).toBeLessThan(quick.peak * .05);
    // How far a burst walks is `recoil`; how long it stays walked is recovery.
    // Both weapons fire inside RECOVERY_DELAY, so neither recovers mid-burst
    // and the two climb identically — the rating buys the way back, not the
    // way up, and the ladder buys the way up with a lower `recoil` instead.
    expect(quick.peak).toBeCloseTo(slow.peak, 12);
    expect(quick.elapsed).toBeLessThan(slow.elapsed * .6);
  });
  it('does not drag the sights under the target when a burst is compensated', () => {
    // The failure this exists to prevent: pull down through a burst to stay on
    // target, release, and have the weapon "recover" the aim you already paid.
    const player = shooter();
    for (let i = 0; i < 10; i++) {
      const before = player.aim().pitch;
      player.fire();
      player.pull(before - player.aim().pitch); // perfect compensation
      player.tick(.12);
    }
    expect(player.aim().pitch).toBeCloseTo(0, 6);
    player.tick(2.5);
    expect(player.aim().pitch).toBeCloseTo(0, 3);
  });
  it('keeps aim the shooter deliberately gained, rather than owing it back', () => {
    // Looking further up mid-burst is not compensation, and must not leave the
    // weapon holding a debt it never took.
    const player = shooter();
    player.fire();
    player.pull(.2);
    player.tick(3);
    expect(player.aim().pitch).toBeGreaterThan(.15);
  });
  it('tops the climb out instead of walking the muzzle into the sky', () => {
    const player = shooter(ULTIMAX, 1);
    for (let i = 0; i < 60; i++) { player.fire(); player.tick(.085); }
    expect(player.state.climb).toBeLessThanOrEqual(CLIMB_CEILING + 1e-9);
    expect(player.aim().pitch).toBeLessThanOrEqual(CLIMB_CEILING + 1e-9);
  });
  it('hands over each push exactly once', () => {
    const state = createRecoil();
    recordRecoilShot(state, SAR, 0, () => .5);
    expect(takeAimPush(state).pitch).toBeGreaterThan(0);
    expect(takeAimPush(state)).toEqual({ pitch: 0, yaw: 0 });
  });
});

/**
 * What a held trigger costs, in degrees of the shooter's own aim, after a given
 * number of rounds at the weapon's own cadence. Degrees because that is the
 * only unit in which a kick can be compared to anything — kick units and
 * ratings are internal, and "feels weak" is not measurable.
 */
function climbAfter(weapon: number, rounds: number) {
  const spec = FPS_WEAPONS[weapon], state = createRecoil();
  let aim = 0;
  const drain = () => { aim += takeAimPush(state).pitch; };
  for (let round = 0; round < rounds; round++) {
    recordRecoilShot(state, spec, weapon, () => .5); drain();
    for (let f = 0; f < Math.round(spec.interval * 240); f++) { advanceRecoil(state, 1 / 240); drain(); }
  }
  return aim * 180 / Math.PI;
}

describe('how the kick compares to the genre', () => {
  /**
   * Blockplay was tuned by feel twice and came out at roughly half of what a
   * shooter does, which is how "the recoil is barely anything" survived a
   * change that tripled it. These bands are the fix: approximate, widely-cited
   * figures for uncompensated climb in games that move the camera.
   *
   *   CS:GO AK-47 spray   ~1.5-2 deg first round, ~11-14 at ten, ~25-27 a magazine
   *   Apex / CoD rifles   ~1-1.5 deg first round, ~8-12 at ten, then recovers
   *
   * The bands are deliberately wide: they exist to catch a weapon that is off
   * by a factor, not to pin a tuning decision to one decimal place.
   */
  const RIFLE_BAND = { first: [1.2, 2.4], ten: [9, 15], magazine: [22, 32] };
  it('puts the issued rifle in the band a rifle is expected to occupy', () => {
    const [firstLow, firstHigh] = RIFLE_BAND.first;
    expect(climbAfter(0, 1)).toBeGreaterThan(firstLow);
    expect(climbAfter(0, 1)).toBeLessThan(firstHigh);
    const [tenLow, tenHigh] = RIFLE_BAND.ten;
    expect(climbAfter(0, 10)).toBeGreaterThan(tenLow);
    expect(climbAfter(0, 10)).toBeLessThan(tenHigh);
    const [magLow, magHigh] = RIFLE_BAND.magazine;
    expect(climbAfter(0, FPS_WEAPONS[0].capacity)).toBeGreaterThan(magLow);
    expect(climbAfter(0, FPS_WEAPONS[0].capacity)).toBeLessThan(magHigh);
  });
  it('makes the support weapon the harder one to hold, round for round', () => {
    // It kicks harder and settles slower; that is what its volume of fire costs.
    expect(climbAfter(1, 10)).toBeGreaterThan(climbAfter(0, 10) * 1.2);
  });
  it('climbs monotonically while the trigger is held', () => {
    // A burst that stopped costing anything halfway through a magazine would be
    // a ceiling set too low, which is the other way to make recoil decoration.
    for (const weapon of [0, 1]) {
      expect(climbAfter(weapon, 10)).toBeGreaterThan(climbAfter(weapon, 5));
      expect(climbAfter(weapon, 20)).toBeGreaterThan(climbAfter(weapon, 10));
    }
  });
});
