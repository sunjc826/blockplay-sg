import { describe, expect, it } from 'vitest';
import { BLOCK, DETAIL, MIN_DETAIL, STOREY, DOOR, SLAB, KERB, RAIL, ROAD_LINE, isOnModule, snap, snapFootprint, snapModuleBox, snapSpan, minRadius } from './block-module';

describe('block module', () => {
  it('names structure as whole blocks and detail as whole sub-units', () => {
    expect(BLOCK / DETAIL).toBe(5);
    for (const v of [STOREY, DOOR.width, DOOR.height, SLAB, KERB.width, ROAD_LINE.dash]) expect(isOnModule(v, BLOCK)).toBe(true);
    for (const v of [KERB.height, RAIL.post, RAIL.rail, RAIL.height, ROAD_LINE.width]) expect(isOnModule(v, DETAIL)).toBe(true);
    expect(STOREY).toBe(3); expect(DOOR).toEqual({ width: 1, height: 2 }); expect(SLAB).toBe(1);
    expect(MIN_DETAIL).toBe(DETAIL);
  });

  it('snaps without binary-fraction noise', () => {
    expect(snap(0.3000000004)).toBe(0.3);
    expect(snap(0.1 + 0.2)).toBe(0.3);
    expect(snap(-2.96)).toBe(-3);
    expect(snap(1.24, BLOCK)).toBe(1);
    expect(snap(1.26, BLOCK)).toBe(1.5);
  });

  it('puts both edges of a span on the grid and moves its centre by at most half a step', () => {
    for (const [c, s] of [[0, 0.15], [3.07, 2.94], [-12.33, 7.77], [0.6, 0.035], [101.55, 0.22]]) {
      const r = snapSpan(c, s);
      expect(isOnModule(r.center - r.size / 2)).toBe(true);
      expect(isOnModule(r.center + r.size / 2)).toBe(true);
      expect(r.size).toBeGreaterThanOrEqual(MIN_DETAIL);
      const growth = Math.max(0, MIN_DETAIL - s) / 2;
      expect(Math.abs(r.center - c)).toBeLessThanOrEqual(DETAIL / 2 + growth + 1e-9);
    }
  });

  it('closes hairline joints between neighbours', () => {
    // Two 0.986 m pavers on a 1 m pitch become two abutting 1 m slabs.
    const a = snapSpan(0, 0.986), b = snapSpan(1, 0.986);
    expect(a.center + a.size / 2).toBeCloseTo(b.center - b.size / 2, 9);
  });

  it('raises thin modelled detail to the minimum but leaves ground paint thin', () => {
    const wire = snapModuleBox(0, 1.1, 0, 0.035, 0.035, 20);
    expect(wire.w).toBe(0.1); expect(wire.h).toBe(0.1);
    const paint = snapModuleBox(4, 0.09, 0, 5, 0.025, 0.16);
    expect(paint.h).toBe(0.025); expect(paint.y).toBe(0.09); expect(paint.d).toBe(0.2); expect(paint.w).toBe(5);
    const shelf = snapModuleBox(0, 4, 0, 3, 0.05, 1);
    expect(shelf.h).toBe(0.1);
  });

  it('keeps a detail mounted on an on-grid face proud of it on either side', () => {
    // Trim authored flush against a wall face at x = 5, 3.5 cm thick.
    const east = snapSpan(5 + 0.0175, 0.035), west = snapSpan(-5 - 0.0175, 0.035);
    expect(east.center - east.size / 2).toBeCloseTo(5, 9); expect(east.size).toBe(0.1);
    expect(west.center + west.size / 2).toBeCloseTo(-5, 9);
  });

  it('leaves low ground slabs at their authored level for ground cover', () => {
    const court = snapModuleBox(0, 0.025, 0, 110.4, 0.09, 30);
    expect(court.y).toBe(0.025); expect(court.h).toBe(0.09);
    const kerb = snapModuleBox(0, 0.084, 0, 132, 0.168, 0.27);
    expect(kerb.h).toBe(0.168); expect(kerb.d).toBe(0.3);
    const wall = snapModuleBox(0, 1.3, 0, 1.2, 2.6, 10.8);
    expect(wall.h).toBe(2.6);
  });

  it('snaps a collider exactly as the visual authored with the same numbers', () => {
    const [x, z, w, d] = [12.37, -4.83, 2.8, 0.75];
    const visual = snapModuleBox(x, 1, z, w, 2, d);
    const collider = snapFootprint({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    expect(collider.minX).toBeCloseTo(visual.x - visual.w / 2, 6); expect(collider.maxX).toBeCloseTo(visual.x + visual.w / 2, 6);
    expect(collider.minZ).toBeCloseTo(visual.z - visual.d / 2, 6); expect(collider.maxZ).toBeCloseTo(visual.z + visual.d / 2, 6);
  });

  it('keeps cylinders at least one sub-unit across', () => {
    expect(minRadius(0.02)).toBe(0.05); expect(minRadius(0.4)).toBe(0.4);
  });
});
