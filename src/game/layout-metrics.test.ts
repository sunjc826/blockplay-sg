import { describe, expect, it } from 'vitest';
import { measureLayout, rayToBlocker } from './layout-metrics';
import type { Obstacle } from './region-collision';

const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const anywhere = () => true;

describe('layout metrics', () => {
  it('reads an empty field as nearly fully open, short only where the map edge cuts the disc', () => {
    const open = measureLayout(bounds, [], anywhere);
    expect(open.standable).toBe(2500);
    expect(open.buildingShare).toBe(0);
    expect(open.openness).toBeGreaterThan(.6);
    expect(open.sightline.median).toBeGreaterThan(90);
    expect(open.sightline.median).toBeLessThanOrEqual(120);
    // The middle third loses less to the edges than the outer two, which match by symmetry.
    expect(open.bands[1].openness).toBeGreaterThan(open.bands[0].openness);
    expect(open.bands[0].openness).toBeCloseTo(open.bands[2].openness, 6);
  });
  it('counts a tower as building, shortens sightlines round it and leaves low cover out of both', () => {
    const tower: Obstacle = { minX: -40, maxX: 40, minZ: -40, maxZ: 40, minY: 0, maxY: 60 };
    const kerb: Obstacle = { minX: -40, maxX: 40, minZ: -40, maxZ: 40, minY: 0, maxY: .6 };
    const open = measureLayout(bounds, [], anywhere), blocked = measureLayout(bounds, [tower], anywhere), low = measureLayout(bounds, [kerb], anywhere);
    expect(blocked.buildingShare).toBeCloseTo(100 / 2500, 6);
    expect(blocked.standable).toBe(2400);
    expect(blocked.openness).toBeLessThan(open.openness - .03);
    expect(low.buildingShare).toBe(0);
    expect(low.openness).toBeCloseTo(open.openness, 6);
  });
  it('reports standable tops above head height as raised floor, and lets a viewer see under a canopy', () => {
    const deck: Obstacle = { minX: 0, maxX: 80, minZ: 0, maxZ: 80, minY: 4, maxY: 4.5, supportsTop: true };
    const report = measureLayout(bounds, [deck], anywhere);
    expect(report.raisedShare).toBeCloseTo(100 / 2500, 6);
    expect(report.buildingShare).toBe(0);
    expect(report.openness).toBeCloseTo(measureLayout(bounds, [], anywhere).openness, 6);
    // An authored deck counts once it is level; the ramp up to it does not.
    const walk = { minX: -80, maxX: 0, minZ: -80, maxZ: 0, startHeight: 5, endHeight: 5 }, ramp = { minX: -160, maxX: -80, minZ: -80, maxZ: 0, startHeight: 0, endHeight: 5 };
    expect(measureLayout(bounds, [], anywhere, { surfaces: [walk, ramp] }).raisedShare).toBeCloseTo(100 / 2500, 6);
  });
  it('ignores water colliders and ground a soldier cannot stand on', () => {
    const bay: Obstacle = { minX: -200, maxX: 0, minZ: -200, maxZ: 200, water: true };
    const report = measureLayout(bounds, [bay], x => x > 0);
    expect(report.standable).toBe(1250);
    expect(report.buildingShare).toBe(0);
  });
  it('stops a ray on a rotated footprint rather than on its bounding box', () => {
    const diamond = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, footprint: [{ x: 0, z: -10 }, { x: 10, z: 0 }, { x: 0, z: 10 }, { x: -10, z: 0 }] };
    expect(rayToBlocker(diamond, -30, 0, 1, 0, 120)).toBeCloseTo(20, 6);
    // Along the box's edge the square would be hit; the diamond is only touched at its tip or missed.
    expect(rayToBlocker(diamond, -30, 9, 1, 0, 120)).toBeCloseTo(29, 6);
    expect(rayToBlocker(diamond, -30, 11, 1, 0, 120)).toBe(Infinity);
    expect(rayToBlocker({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, -30, 9, 1, 0, 120)).toBeCloseTo(20, 6);
  });
});
