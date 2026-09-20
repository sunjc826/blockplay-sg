import { describe, expect, it } from 'vitest';
import { BALLISTIC_STEP, MAX_BALLISTIC_SEGMENTS, HITSCAN, ballisticPoint, ballisticSegments, dropCompensation, falloffScale, flightTime, isFlat, isInstant } from './fps-ballistics';

const origin = { x: 0, y: 1.75, z: 0 }, forward = { x: 0, y: 0, z: -1 };
const arcade = { velocity: 350, drop: 25 };

describe('ballistic solver', () => {
  it('degenerates to the straight ray the engine already traces', () => {
    const segments = ballisticSegments(origin, forward, HITSCAN, 180);
    expect(segments).toHaveLength(1);
    expect(segments[0].from).toEqual(origin);
    expect(segments[0].to).toEqual({ x: 0, y: 1.75, z: -180 });
    expect(segments[0].time).toBe(0); expect(segments[0].travelled).toBe(180);
    expect(isFlat(HITSCAN)).toBe(true); expect(isInstant(HITSCAN)).toBe(true);
  });
  it('keeps a straight path but real flight time when only drop is absent', () => {
    const [segment] = ballisticSegments(origin, forward, { velocity: 400, drop: 0 }, 120);
    expect(segment.to).toEqual({ x: 0, y: 1.75, z: -120 });
    expect(segment.time).toBeCloseTo(0.3, 6); expect(isInstant({ velocity: 400, drop: 0 })).toBe(false);
  });
  it('normalizes the direction so an unnormalized aim vector does not change range', () => {
    const [segment] = ballisticSegments(origin, { x: 0, y: 0, z: -7 }, HITSCAN, 60);
    expect(segment.to.z).toBeCloseTo(-60, 10);
  });
  it('falls away from the straight line and lands where the closed form predicts', () => {
    const segments = ballisticSegments(origin, forward, arcade, 120);
    const total = 120 / arcade.velocity, last = segments[segments.length - 1];
    expect(last.to.z).toBeCloseTo(-120, 6);
    expect(last.to.y).toBeCloseTo(origin.y - 0.5 * arcade.drop * total * total, 6);
    expect(last.time).toBeCloseTo(total, 10);
    // The arc is longer than the chord, and descent is monotonic along it.
    expect(last.travelled).toBeGreaterThan(120);
    for (let i = 1; i < segments.length; i++) expect(segments[i].to.y).toBeLessThan(segments[i - 1].to.y);
  });
  it('subdivides by flight time and caps the segment count for the frame budget', () => {
    expect(ballisticSegments(origin, forward, arcade, 120)).toHaveLength(Math.ceil(120 / arcade.velocity / BALLISTIC_STEP));
    expect(ballisticSegments(origin, forward, arcade, 120, 1e-6)).toHaveLength(MAX_BALLISTIC_SEGMENTS);
    expect(ballisticSegments(origin, forward, arcade, 0)).toHaveLength(1);
  });
  it('treats a zero or negative muzzle velocity as instant rather than emitting NaN', () => {
    for (const velocity of [0, -10]) {
      const [segment] = ballisticSegments(origin, forward, { velocity, drop: 25 }, 90);
      expect(segment.to.z).toBe(-90); expect(segment.time).toBe(0);
      expect(Number.isFinite(segment.to.y)).toBe(true);
    }
    expect(flightTime(90, HITSCAN)).toBe(0);
  });
  it('places a round at its origin at t=0 and clamps negative time', () => {
    expect(ballisticPoint(origin, forward, arcade, 0)).toEqual(origin);
    expect(ballisticPoint(origin, forward, arcade, -5)).toEqual(origin);
  });
  it('raises the aim point with range, and not at all for hitscan', () => {
    expect(dropCompensation(120, HITSCAN)).toBe(0);
    expect(dropCompensation(120, { velocity: 400, drop: 0 })).toBe(0);
    expect(dropCompensation(30, arcade)).toBeLessThan(dropCompensation(120, arcade));
    expect(dropCompensation(120, arcade)).toBeCloseTo(Math.atan(25 * 120 / (2 * 350 * 350)), 10);
    // A faster round needs less elevation at the same range.
    expect(dropCompensation(120, { velocity: 700, drop: 25 })).toBeLessThan(dropCompensation(120, arcade));
  });
});

describe('damage falloff', () => {
  it('holds full damage inside the near band and the floor beyond the far band', () => {
    expect(falloffScale(0, 20, 60, .5)).toBe(1); expect(falloffScale(20, 20, 60, .5)).toBe(1);
    expect(falloffScale(60, 20, 60, .5)).toBe(.5); expect(falloffScale(400, 20, 60, .5)).toBe(.5);
  });
  it('interpolates linearly across the band', () => {
    expect(falloffScale(40, 20, 60, .5)).toBeCloseTo(.75, 10);
    expect(falloffScale(30, 20, 60, .5)).toBeCloseTo(.875, 10);
  });
  it('stays finite for a malformed band, an inverted band or a clamped floor', () => {
    expect(falloffScale(70, 60, 20, .5)).toBe(.5); expect(falloffScale(50, 60, 20, .5)).toBe(1);
    expect(falloffScale(50, 30, 30, .5)).toBe(.5);
    expect(falloffScale(80, 20, 60, -2)).toBe(0); expect(falloffScale(80, 20, 60, 4)).toBe(1);
    expect(falloffScale(-5, 20, 60, .5)).toBe(1);
  });
});
