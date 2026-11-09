import { describe, expect, it } from 'vitest';
import { createScopeStrafeShadow } from './scope-shadow';

describe('scope strafe shadow', () => {
  it('holds a pronounced, mirrored crescent during normal aimed sidesteps', () => {
    for (const sign of [-1, 1]) {
      const shadow = createScopeStrafeShadow();
      let value = 0;
      for (let i = 0; i < 30; i++) value = shadow.update(1 / 60, sign * 2.2, true);
      expect(value * -sign).toBeGreaterThan(.17);
      expect(Math.abs(value)).toBeLessThanOrEqual(.18);
      for (let i = 0; i < 30; i++) value = shadow.update(1 / 60, -sign * 2.2, true);
      expect(value * sign).toBeGreaterThan(.17);
    }
  });
  it('settles on stopping, scales with slow movement and does not jump on direction changes', () => {
    const shadow = createScopeStrafeShadow();
    expect(Math.abs(shadow.update(1 / 60, 3, true))).toBeLessThan(.04);
    for (let i = 0; i < 30; i++) shadow.update(1 / 60, 3, true);
    expect(shadow.update(1 / 60, -3, true)).toBeLessThan(0);
    for (let i = 0; i < 30; i++) shadow.update(1 / 60, 0, true);
    expect(Math.abs(shadow.update(1 / 60, 0, true))).toBeLessThan(.001);
    for (let i = 0; i < 60; i++) shadow.update(1 / 60, .5, true);
    expect(shadow.update(0, .5, true)).toBeCloseTo(-.045, 4);
  });
  it('responds equally across frame rates and clears inactive/reduced-motion state', () => {
    const samples = [30, 60, 144].map(fps => {
      const shadow = createScopeStrafeShadow();
      for (let i = 0; i < fps / 2; i++) shadow.update(1 / fps, 2, true);
      return shadow.update(0, 2, true);
    });
    expect(samples[0]).toBeCloseTo(samples[1], 8); expect(samples[0]).toBeCloseTo(samples[2], 8);
    const shadow = createScopeStrafeShadow();
    shadow.update(.1, 2, true);
    expect(shadow.update(.1, 2, false)).toBe(0);
    shadow.update(.1, 2, true); shadow.reset();
    expect(shadow.update(0, 0, true)).toBe(0);
  });
});
