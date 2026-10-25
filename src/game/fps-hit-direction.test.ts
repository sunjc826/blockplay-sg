import { describe, expect, it } from 'vitest';
import { createHitDirections, HIT_DIRECTION_SECONDS, hitBearing, hitDirectionFade, hitStrength } from './fps-hit-direction';

describe('hit directions', () => {
  // Yaw 0 faces -z, as the engine's camera does.
  const viewer = { x: 0, z: 0, yaw: 0 };
  it('reads ahead, right, left and behind from the viewer’s own facing', () => {
    expect(hitBearing(viewer, { x: 0, z: -10 })).toBeCloseTo(0);
    expect(hitBearing(viewer, { x: 10, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(hitBearing(viewer, { x: -10, z: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(hitBearing(viewer, { x: 0, z: 10 }))).toBeCloseTo(Math.PI);
    // Turning a quarter left (yaw grows towards -x) brings a shooter on the left to the front.
    expect(hitBearing({ ...viewer, yaw: Math.PI / 2 }, { x: -10, z: 0 })).toBeCloseTo(0);
  });
  it('merges repeated fire from one direction, separates others, and expires', () => {
    const directions = createHitDirections(3);
    directions.add(viewer, { x: 0, z: -20 }, .4);
    directions.advance(.5);
    directions.add(viewer, { x: 1, z: -20 }, .4);
    expect(directions.list).toHaveLength(1);
    expect(directions.list[0].age).toBe(0);
    directions.add(viewer, { x: 20, z: 0 }, .4);
    directions.add(viewer, { x: 0, z: 0.2 }, .4);
    expect(directions.list).toHaveLength(2);
    directions.advance(HIT_DIRECTION_SECONDS + .01);
    expect(directions.list).toHaveLength(0);
  });
  it('holds full weight, then fades; scales with how hard the hit was', () => {
    expect(hitDirectionFade(0)).toBe(1);
    expect(hitDirectionFade(HIT_DIRECTION_SECONDS * .75)).toBeCloseTo(.5);
    expect(hitDirectionFade(HIT_DIRECTION_SECONDS)).toBe(0);
    expect(hitStrength(5)).toBe(.35);
    expect(hitStrength(60)).toBe(1);
  });
});
