import { describe, expect, it } from 'vitest';
import { footCycle, footSample, GAIT, gaitShape, hipsFromFeet, idleWeight, spring, stepSpring } from './gait-motion';

describe('gait shape', () => {
  it('fits each step to the leg, so a planted foot covers exactly the ground the body does', () => {
    for (const speed of [.4, 1, 1.8, 2.6, 3.1, 4.5, 6]) {
      const shape = gaitShape(speed);
      // Stance lasts duty × (stride / speed) and the foot travels 2 × reach in it.
      const footSpeed = 2 * shape.reach / (shape.duty * shape.stride / speed);
      expect(footSpeed).toBeCloseTo(speed, 5);
      expect(shape.reach).toBeLessThanOrEqual(GAIT.maxReach);
      const cadence = speed / shape.stride;
      expect(cadence).toBeGreaterThanOrEqual(GAIT.minCadence - 1e-9);
      expect(cadence).toBeLessThanOrEqual(GAIT.maxCadence + 1e-9);
    }
  });
  it('walks with a foot always down and runs with a flight phase', () => {
    expect(gaitShape(1.8).duty).toBeGreaterThan(.55);
    expect(gaitShape(6).duty).toBeLessThan(.35);
    expect(gaitShape(6).blend).toBe(1);
    expect(gaitShape(1).blend).toBe(0);
  });
  it('takes shorter steps crouched', () => {
    expect(gaitShape(2, 1).stride).toBeLessThan(gaitShape(2, 0).stride);
  });
});

describe('foot cycle', () => {
  it('is under the hip at mid-stance on phase π and moves back at a constant rate while planted', () => {
    const sample = footCycle(Math.PI, .6);
    expect(sample.along).toBeCloseTo(0, 6); expect(sample.lift).toBe(0); expect(sample.stance).toBeCloseTo(.5, 6);
    const step = .01, rates: number[] = [];
    for (let phase = Math.PI - .5; phase < Math.PI + .5; phase += step) rates.push(footCycle(phase + step, .6).along - footCycle(phase, .6).along);
    for (const rate of rates) expect(rate).toBeCloseTo(rates[0], 6);
    expect(rates[0]).toBeLessThan(0);
  });
  it('lifts only in swing, carries the foot forward and stays continuous round the cycle', () => {
    const out = footSample();
    let previous = footCycle(0, .6, footSample()), lifted = false;
    for (let i = 1; i <= 720; i++) {
      footCycle(i / 720 * Math.PI * 2, .6, out);
      expect(Math.abs(out.along - previous.along)).toBeLessThan(.03);
      expect(Math.abs(out.lift - previous.lift)).toBeLessThan(.05);
      if (out.stance < 0) { lifted ||= out.lift > .9; } else expect(out.lift).toBe(0);
      // The swing overshoots the planted stretch only slightly as it leaves and meets the ground.
      expect(Math.abs(out.along)).toBeLessThan(1.1);
      previous = { ...out };
    }
    expect(lifted).toBe(true);
  });
  it('raises the heel at toe-off and the toes before heel strike', () => {
    expect(footCycle(Math.PI + .99 * .6 * Math.PI, .6).heel).toBeGreaterThan(.9);
    // Just before heel strike: late in swing.
    expect(footCycle(Math.PI - .6 * Math.PI - .02, .6).toe).toBeGreaterThan(.9);
  });
});

describe('hips from feet', () => {
  it('vaults over the planted leg walking and sinks into it running', () => {
    const mid = footCycle(Math.PI, .6), swing = footCycle(0, .6);
    const strike = footCycle(Math.PI - .6 * Math.PI + .01, .6), off = footCycle(Math.PI + .6 * Math.PI - .01, .6);
    expect(hipsFromFeet(mid, swing, 0, .03, .05).drop).toBeLessThan(hipsFromFeet(strike, off, 0, .03, .05).drop);
    expect(hipsFromFeet(mid, swing, 1, .03, .05).drop).toBeGreaterThan(hipsFromFeet(swing, swing, 1, .03, .05).drop);
    // The weight sits over the supporting foot: the right here.
    expect(hipsFromFeet(swing, mid, 0, .03, .05).shift).toBeGreaterThan(.9);
  });
});

describe('secondary motion helpers', () => {
  it('settles a spring with a small overshoot at any frame time', () => {
    for (const dt of [1 / 144, 1 / 30, .1]) {
      const s = spring(); let peak = 0;
      for (let t = 0; t < 3; t += dt) { stepSpring(s, 1, 10, .42, dt); peak = Math.max(peak, s.value); }
      expect(s.value).toBeCloseTo(1, 3); expect(peak).toBeGreaterThan(1.05); expect(peak).toBeLessThan(1.4);
    }
  });
  it('shifts the weight slowly and deterministically between the legs', () => {
    let left = false, right = false, previous = idleWeight(0);
    for (let t = 0; t < 120; t += .1) {
      const w = idleWeight(t);
      expect(Math.abs(w)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(w - previous)).toBeLessThan(.1);
      left ||= w < -.8; right ||= w > .8; previous = w;
    }
    expect(left && right).toBe(true);
    expect(idleWeight(42.5)).toBe(idleWeight(42.5));
  });
});
