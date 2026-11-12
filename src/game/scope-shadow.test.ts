import { describe, expect, it } from 'vitest';
import { createScopeShadow, type ScopeMotion } from './scope-shadow';

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
  it('answers flicks, recoil climb, jumps and landings on the matching axis', () => {
    const right = run(started(), 30, { lateralSpeed: 0, turnRate: 3 });
    expect(right.min).toBeLessThan(-.12);
    const climb = run(started(), 30, { lateralSpeed: 0, pitchRate: 1.5 }, 'y');
    expect(climb.min).toBeLessThan(-.05);
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
    expect(shadow.update(.05, { lateralSpeed: 2 }, false)).toEqual({ x: 0, y: 0 });
    // Raising the sight mid-strafe starts from the lean, not a fresh kick.
    expect(Math.abs(run(shadow, 60, { lateralSpeed: 2 }).min)).toBeLessThan(.06);
    shadow.reset();
    expect(shadow.update(0, still, true)).toEqual({ x: 0, y: 0 });
  });
});
