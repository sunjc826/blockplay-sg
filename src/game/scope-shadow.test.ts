import { describe, expect, it } from 'vitest';
import { AIMED_TURN_LAG_LIMIT, createAimedTurnLag, createScopeShadow, limitScopeEye, SCOPE_CLEAR_CENTRE, scopeEyeBox, type ScopeMotion } from './scope-shadow';

const still: ScopeMotion = { lateralSpeed: 0 };
/** Runs frames and reports the furthest swing on each side plus where it ended. */
function run(shadow: ReturnType<typeof createScopeShadow>, frames: number, motion: ScopeMotion, axis: 'x' | 'y' = 'x', fps = 60) {
  let min = 0, max = 0, last = 0;
  for (let i = 0; i < frames; i++) { last = shadow.update(1 / fps, motion, true)[axis]; min = Math.min(min, last); max = Math.max(max, last); }
  return { min, max, last };
}
const started = () => { const shadow = createScopeShadow(); shadow.update(1 / 60, still, true); return shadow; };

describe('scope shadow', () => {
  it('swings in when a sidestep starts, then eases to a slight lean while it continues', () => {
    for (const sign of [-1, 1]) {
      const shadow = started(), swing = run(shadow, 60, { lateralSpeed: sign * 2.2 });
      const peak = sign > 0 ? -swing.min : swing.max;
      expect(peak).toBeGreaterThan(.12); expect(peak).toBeLessThan(.2);
      expect(swing.last * -sign).toBeGreaterThan(.03); expect(swing.last * -sign).toBeLessThan(.06);
      // Reversing throws it across harder than a start from rest.
      const reverse = run(shadow, 60, { lateralSpeed: -sign * 2.2 });
      expect(sign > 0 ? reverse.max : -reverse.min).toBeGreaterThan(peak);
    }
  });
  it('kicks the other way on stopping, overshoots once and settles clear', () => {
    const shadow = started();
    run(shadow, 90, { lateralSpeed: 2 });
    const stop = run(shadow, 90, still);
    expect(stop.max).toBeGreaterThan(.1);
    expect(stop.min).toBeLessThan(-.005); expect(stop.min).toBeGreaterThan(-.06);
    expect(stop.last).toBe(0);
  });
  it('never jumps, and scales with slow movement', () => {
    const shadow = started();
    expect(Math.abs(shadow.update(1 / 60, { lateralSpeed: 3 }, true).x)).toBeLessThan(.08);
    const slow = run(started(), 120, { lateralSpeed: .5 }), full = run(started(), 120, { lateralSpeed: 2 });
    expect(slow.min).toBeCloseTo(full.min / 4, 6); expect(slow.last).toBeCloseTo(-.01125, 4);
  });
  it('answers jumps and landings on the vertical axis only', () => {
    const fall = started(); run(fall, 60, { lateralSpeed: 0, verticalSpeed: -8 }, 'y');
    const landing = run(fall, 30, still, 'y');
    expect(landing.min).toBeLessThan(-.12);
    expect(run(started(), 30, { lateralSpeed: 0, verticalSpeed: 5 }, 'x').min).toBe(0);
  });
  it('responds equally across frame rates and clears inactive/reduced-motion state', () => {
    const samples = [30, 60, 144].map(fps => {
      const shadow = createScopeShadow();
      shadow.update(1 / fps, still, true);
      return run(shadow, fps / 2, { lateralSpeed: 2 }, 'x', fps).last;
    });
    expect(samples[0]).toBeCloseTo(samples[1], 8); expect(samples[0]).toBeCloseTo(samples[2], 8);
    const shadow = started();
    shadow.update(.05, { lateralSpeed: 2 }, true);
    expect(shadow.update(.05, { lateralSpeed: 2 }, false)).toEqual({ x: 0, y: 0, relief: 0 });
    // Raising the sight mid-strafe starts from the lean, not a fresh kick.
    expect(Math.abs(run(shadow, 60, { lateralSpeed: 2 }).min)).toBeLessThan(.06);
    shadow.reset();
    expect(shadow.update(0, still, true)).toEqual({ x: 0, y: 0, relief: 0 });
  });
  it('tunnels in on a shot or a landing, harder for heavier recoil, and never for gravity or looking around', () => {
    const peak = (jolt: number) => { const shadow = started(); shadow.update(1 / 60, { lateralSpeed: 0, jolt }, true); let top = 0; for (let i = 0; i < 40; i++) top = Math.max(top, shadow.update(1 / 60, still, true).relief); return { top, last: shadow.update(1 / 60, still, true).relief }; };
    const heavy = peak(1), light = peak(.4);
    expect(heavy.top).toBeGreaterThan(.8); expect(heavy.top).toBeLessThanOrEqual(1);
    expect(light.top).toBeGreaterThan(.25); expect(light.top).toBeLessThan(heavy.top * .5);
    expect(heavy.last).toBeLessThan(.02);
    const fall = started();
    let falling = 0;
    for (let i = 0; i < 30; i++) falling = Math.max(falling, fall.update(1 / 60, { lateralSpeed: 0, verticalSpeed: -i * 20 / 60 }, true).relief);
    expect(falling).toBe(0);
    let landed = 0;
    for (let i = 0; i < 20; i++) landed = Math.max(landed, fall.update(1 / 60, still, true).relief);
    expect(landed).toBeGreaterThan(.6);
    const look = started();
    let looking = 0;
    for (let i = 0; i < 60; i++) looking = Math.max(looking, look.update(1 / 60, { lateralSpeed: 2 * Math.sin(i) }, true).relief);
    expect(looking).toBe(0);
  });
  it('tightens and hardens the eye box with magnification and closes it with relief', () => {
    const low = scopeEyeBox(1.5), mid = scopeEyeBox(4), high = scopeEyeBox(8), beyond = scopeEyeBox(12);
    expect(low.soft).toBeGreaterThan(mid.soft); expect(mid.soft).toBeGreaterThan(high.soft);
    expect(low.gain).toBeLessThan(mid.gain); expect(mid.gain).toBeLessThan(high.gain);
    expect(beyond).toEqual(high); expect(low.radius).toBe(high.radius);
    expect(scopeEyeBox(4, 1).radius).toBeCloseTo(mid.radius - .09); expect(scopeEyeBox(4, 5).radius).toBe(scopeEyeBox(4, 1).radius);
  });
  it('eases the eye into its limit and always leaves the aim point clear', () => {
    for (const magnification of [1.5, 4, 8]) for (const relief of [0, .5, 1]) {
      const box = scopeEyeBox(magnification, relief), limit = box.radius - box.soft - SCOPE_CLEAR_CENTRE;
      expect(limit).toBeGreaterThan(.03);
      let before = 0;
      for (const reach of [.02, .05, .1, .2, .5, 10]) {
        const eye = limitScopeEye({ x: -reach * .6, y: reach * .8 }, box), length = Math.hypot(eye.x, eye.y);
        // Still moving at every step, never past the limit, direction kept.
        expect(length).toBeGreaterThan(before); expect(length).toBeLessThanOrEqual(limit);
        expect(eye.y / eye.x).toBeCloseTo(-.8 / .6);
        // The shadow starts no nearer the centre than the protected disc.
        expect(box.radius - box.soft - length).toBeGreaterThanOrEqual(SCOPE_CLEAR_CENTRE - 1e-9);
        before = length;
      }
    }
    expect(limitScopeEye({ x: .01, y: 0 }, scopeEyeBox(8)).x).toBeCloseTo(.01, 3);
    expect(limitScopeEye({ x: 0, y: 0 }, scopeEyeBox(8))).toEqual({ x: 0, y: 0 });
  });
});

describe('aimed turn lag', () => {
  const turn = (lag: ReturnType<typeof createAimedTurnLag>, frames: number, yawRate: number, pitchRate = 0, fps = 60) => {
    const trace: { yaw: number; pitch: number }[] = [];
    for (let i = 0; i < frames; i++) trace.push({ ...lag.update(1 / fps, yawRate / fps, pitchRate / fps, true) });
    return trace;
  };
  it('trails the turn: right turns leave the gun pointing left, looking up leaves it low', () => {
    const lag = createAimedTurnLag(), right = turn(lag, 30, -1, .5).at(-1)!;
    expect(right.yaw).toBeGreaterThan(.01); expect(right.pitch).toBeLessThan(-.005);
    const left = turn(createAimedTurnLag(), 30, 1).at(-1)!;
    expect(left.yaw).toBeCloseTo(-turn(createAimedTurnLag(), 30, -1).at(-1)!.yaw, 10);
    expect(left.pitch).toBe(0);
  });
  it('builds and recovers deliberately, with no jump on a flick and no overshoot', () => {
    const lag = createAimedTurnLag(), flick = turn(lag, 6, -6);
    // A hard flick moves the gun only a fraction of its limit in the first frame.
    expect(flick[0].yaw).toBeLessThan(AIMED_TURN_LAG_LIMIT * .15);
    for (let i = 1; i < flick.length; i++) expect(flick[i].yaw - flick[i - 1].yaw).toBeLessThan(AIMED_TURN_LAG_LIMIT * .15);
    const settle = turn(lag, 120, 0), peak = Math.max(...settle.map(sample => sample.yaw));
    expect(peak).toBeGreaterThan(AIMED_TURN_LAG_LIMIT * .5); expect(peak).toBeLessThanOrEqual(AIMED_TURN_LAG_LIMIT);
    // Still a quarter of the way out a quarter of a second after the flick ends.
    expect(settle[15].yaw).toBeGreaterThan(peak * .25);
    expect(Math.min(...settle.map(sample => sample.yaw))).toBeGreaterThanOrEqual(0);
    expect(settle.at(-1)!.yaw).toBeLessThan(AIMED_TURN_LAG_LIMIT * .01);
  });
  it('stays inside its limit however fast the view spins, and clears when disabled', () => {
    const lag = createAimedTurnLag();
    for (const sample of turn(lag, 120, -40, 40)) { expect(Math.abs(sample.yaw)).toBeLessThanOrEqual(AIMED_TURN_LAG_LIMIT); expect(Math.abs(sample.pitch)).toBeLessThanOrEqual(AIMED_TURN_LAG_LIMIT); }
    expect(lag.update(1 / 60, -.1, .1, false)).toEqual({ yaw: 0, pitch: 0 });
    expect(lag.update(1 / 60, NaN, 0, true).yaw).toBe(0);
  });
  it('holds much the same shape at 30, 60 and 144 frames a second', () => {
    const ends = [30, 60, 144].map(fps => turn(createAimedTurnLag(), fps / 2, -1, 0, fps).at(-1)!.yaw);
    expect(Math.abs(ends[0] - ends[1])).toBeLessThan(.001); expect(Math.abs(ends[2] - ends[1])).toBeLessThan(.001);
  });
});
