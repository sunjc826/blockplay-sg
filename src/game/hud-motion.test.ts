import { expect, it } from 'vitest';
import { HIT_PULSE_GAP_MS, fillFraction, hitTracker, magazineDisplay, nextHitPulse } from './hud-motion';

it('shows the engine magazine whenever a reload is not running', () => {
  expect(magazineDisplay(17, 30, 120, 0)).toBe(17);
  expect(magazineDisplay(0, 30, 120, 0)).toBe(0);
});

it('climbs to what the reload will actually transfer, and lands on it', () => {
  expect(magazineDisplay(0, 30, 120, 1)).toBe(0);
  expect(magazineDisplay(0, 30, 120, .5)).toBe(15);
  expect(magazineDisplay(0, 30, 120, 0.0001)).toBe(30);
  // A tactical reload starts from the rounds already in the magazine.
  expect(magazineDisplay(12, 30, 120, 1)).toBe(12);
  expect(magazineDisplay(12, 30, 120, .5)).toBe(21);
});

it('climbs only while the fresh magazine goes in, landing at the commit point', () => {
  // Progress .3: still taking the old magazine out.
  expect(magazineDisplay(4, 30, 120, .7, .47, .74)).toBe(4);
  expect(magazineDisplay(4, 30, 120, 1 - .605, .47, .74)).toBe(17);
  // Seated: the engine already counts the fresh magazine.
  expect(magazineDisplay(30, 30, 94, .26, .47, .74)).toBe(30);
  expect(magazineDisplay(30, 30, 94, .1, .47, .74)).toBe(30);
  // Past the seat the digits are the engine's: chambering moves one out of the magazine.
  expect(magazineDisplay(29, 30, 90, .08, .47, .74)).toBe(29);
});

it('never promises rounds the reserve cannot supply', () => {
  // Five left in reserve fills five, not a magazine.
  expect(magazineDisplay(0, 30, 5, .5)).toBe(3);
  expect(magazineDisplay(0, 30, 5, 0.0001)).toBe(5);
  expect(magazineDisplay(28, 30, 0, .5)).toBe(28);
});

it('clamps the bar fraction rather than scaling past the track', () => {
  expect(fillFraction(15, 30)).toBe(.5);
  expect(fillFraction(45, 30)).toBe(1);
  expect(fillFraction(-5, 30)).toBe(0);
  // A weapon or a player with no maximum must not scale by NaN.
  expect(fillFraction(10, 0)).toBe(0);
});

it('plays a hit on each loss, weighted by its share of full health', () => {
  let t = hitTracker(100, 50);
  const first = nextHitPulse(t, 100, 30, 100, 0);
  expect(first.pulse).toEqual({ weight: 'heavy', health: false, armor: true });
  const second = nextHitPulse(first.tracker, 92, 30, 100, 50);
  expect(second.pulse).toEqual({ weight: 'hard', health: true, armor: false });
  // A burst replays at once rather than waiting for the last pulse to end.
  expect(nextHitPulse(second.tracker, 84, 30, 100, 90).pulse?.weight).toBe('hard');
  t = nextHitPulse(second.tracker, 84, 30, 100, 90).tracker;
  expect(nextHitPulse(t, 84, 30, 100, 2000).pulse).toBeNull();
});

it('adds a steady drain up into spaced light pulses', () => {
  let t = hitTracker(100, 0), pulses = 0;
  // Tear gas: 7 a second, a fraction per frame.
  for (let frame = 1; frame <= 120; frame++) {
    const next = nextHitPulse(t, 100 - 7 * frame / 60, 0, 100, frame * 1000 / 60);
    t = next.tracker;
    if (next.pulse) { pulses++; expect(next.pulse.weight).toBe('light'); }
  }
  expect(pulses).toBeGreaterThanOrEqual(Math.floor(2000 / HIT_PULSE_GAP_MS) - 1);
  expect(pulses).toBeLessThanOrEqual(Math.ceil(2000 / HIT_PULSE_GAP_MS) + 1);
});

it('never plays healing, regeneration or a respawn', () => {
  let t = nextHitPulse(hitTracker(100, 0), 40, 0, 100, 0).tracker;
  for (const health of [41, 60, 100]) {
    const next = nextHitPulse(t, health, 0, 100, 1000 + health);
    expect(next.pulse).toBeNull();
    t = next.tracker;
  }
  // Regeneration since the hit is not banked as a later loss.
  expect(nextHitPulse(t, 99.5, 0, 100, 5000).pulse).toBeNull();
});
