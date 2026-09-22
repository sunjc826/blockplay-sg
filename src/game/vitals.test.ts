import { expect, it } from 'vitest';
import { armorState, healthBand, HEALTH_CRITICAL, HEALTH_LOW } from './vitals';

it('bands health as a share of the player\'s own maximum', () => {
  expect(healthBand(100, 100)).toBe('steady');
  expect(healthBand(51, 100)).toBe('steady');
  expect(healthBand(HEALTH_LOW * 100, 100)).toBe('low');
  expect(healthBand(30, 100)).toBe('low');
  expect(healthBand(HEALTH_CRITICAL * 100, 100)).toBe('critical');
  expect(healthBand(1, 100)).toBe('critical');
  // A doubled maximum from the debug panel must move the thresholds with it.
  expect(healthBand(120, 200)).toBe('steady');
  expect(healthBand(90, 200)).toBe('low');
  expect(healthBand(40, 200)).toBe('critical');
});

it('treats a dead or impossible reading as critical rather than steady', () => {
  expect(healthBand(0, 100)).toBe('critical');
  expect(healthBand(-5, 100)).toBe('critical');
  expect(healthBand(100, 0)).toBe('critical');
});

it('reads armor as holding only while some plate remains', () => {
  expect(armorState(40)).toBe('holding');
  expect(armorState(.4)).toBe('holding');
  expect(armorState(0)).toBe('depleted');
});
