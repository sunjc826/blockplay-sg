import { describe, expect, it } from 'vitest';
import { SPEED_OF_SOUND } from './combat-event-audio';
import { gunshotTone } from './gunshot-audio';

const rifle = (distance = 0, own = false) => gunshotTone(5.56, 36, distance, own);

describe('gunshot tone', () => {
  it('gives a heavier gun a bigger, deeper thump and a longer echo', () => {
    const pistol = gunshotTone(9, 28, 0, true), mg = gunshotTone(7.62, 60, 0, true), heavy = gunshotTone(12.7, 160, 0, true);
    for (const [light, big] of [[pistol, rifle(0, true)], [rifle(0, true), mg], [mg, heavy]]) {
      expect(big.thump).toBeGreaterThan(light.thump);
      expect(big.thumpTo).toBeLessThan(light.thumpTo);
      expect(big.tailLength).toBeGreaterThan(light.tailLength);
      expect(big.level).toBeGreaterThan(light.level);
    }
    expect(heavy.thumpTo).toBeLessThan(45);
  });
  it('puts our own gun at the ear, louder than another beside us', () => {
    expect(rifle(0, true).level).toBeGreaterThan(rifle(5).level);
    expect(rifle(0, true).delay).toBe(0);
  });
  it('loses the crack to distance before the rumble, and arrives late', () => {
    const near = rifle(10), far = rifle(300);
    expect(far.crack / near.crack).toBeLessThan(far.thump / near.thump);
    expect(far.bodyCutoff).toBeLessThan(near.bodyCutoff);
    expect(far.tailLength).toBeGreaterThan(near.tailLength);
    expect(far.delay).toBeCloseTo(300 / SPEED_OF_SOUND);
  });
  it('is silent out of earshot', () => {
    expect(rifle(650).level).toBe(0);
  });
});
