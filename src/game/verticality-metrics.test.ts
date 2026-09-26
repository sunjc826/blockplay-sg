import { describe, expect, it } from 'vitest';
import { measureVerticality, type VerticalityInput } from './verticality-metrics';
import type { WalkSurface } from './vertical-routes';

const ramp: WalkSurface = { id: 'bridge/up', routeId: 'bridge', axis: 'x', minX: -12, maxX: -4, minZ: -2, maxZ: 2, startHeight: 0, endHeight: 3 };
const deck: WalkSurface = { id: 'bridge/deck', routeId: 'bridge', axis: 'x', minX: -4, maxX: 8, minZ: -2, maxZ: 2, startHeight: 3, endHeight: 3 };
const down: WalkSurface = { id: 'bridge/down', routeId: 'bridge', axis: 'x', minX: 8, maxX: 16, minZ: -2, maxZ: 2, startHeight: 3, endHeight: 0 };
const world = (surfaces: WalkSurface[] = []): VerticalityInput => ({ bounds: { minX: -20, maxX: 20, minZ: -10, maxZ: 10 }, spawn: { x: -16, z: 0 }, obstacles: [], traversalObstacles: [], surfaces });

describe('verticality diagnostics', () => {
  it('reports flat walking space without inventing access distances or elevated area', () => {
    const result = measureVerticality(world()).district;
    expect(result.samples).toBeGreaterThan(0);
    expect(result.elevatedAreaM2).toBe(0);
    expect(result.overlappingFootprintM2).toBe(0);
    expect(result.heightM.max).toBe(0);
    expect(result.distanceToElevatedSpaceM.median).toBeNull();
    expect(result.distanceToElevatedSpaceM.unreachableSamples).toBe(result.samples);
  });
  it('counts connected ramps, upper deck, genuinely overlapping levels, and path distances', () => {
    const result = measureVerticality(world([ramp, deck, down]));
    expect(result.district.elevatedAreaM2).toBeGreaterThan(0);
    expect(result.district.overlappingFootprintM2).toBeGreaterThan(0);
    expect(result.district.heightM.max).toBe(3);
    expect(result.district.reachableRouteIds).toEqual(['bridge']);
    expect(result.district.reachableSlopeIds).toEqual(['bridge/down', 'bridge/up']);
    expect(result.district.distanceToElevatedSpaceM.median).toBeGreaterThan(0);
    // Sector reachability inherits paths that enter from outside its bounds.
    const upperSector = result.summarize({ minX: 0, maxX: 6, minZ: -2, maxZ: 2 });
    expect(upperSector.elevatedAreaM2).toBeGreaterThan(0);
  });
  it('keeps exact authored heights at the collision boundary', () => {
    const y = 3.12344;
    const input = world([{ ...ramp, endHeight: y }, { ...deck, startHeight: y, endHeight: y }, { ...down, startHeight: y }]);
    input.traversalObstacles = [{ minX: deck.minX, maxX: deck.maxX, minZ: deck.minZ, maxZ: deck.maxZ, minY: y - 0.22, maxY: y }];
    const result = measureVerticality(input).district;
    expect(result.heightM.max).toBe(y);
    expect(result.elevatedAreaM2).toBeGreaterThan(0);
  });
  it('does not count a suspended deck without access', () => {
    const result = measureVerticality(world([deck]));
    expect(result.district.elevatedAreaM2).toBe(0);
    expect(result.district.reachableRouteIds).toEqual([]);
    expect(result.unreachableSamples).toBeGreaterThan(0);
  });
  it('excludes raised space that lacks standing headroom', () => {
    const input = world([ramp, deck, down]);
    input.traversalObstacles = [{ minX: -20, maxX: 20, minZ: -10, maxZ: 10, minY: 3.2, maxY: 5 }];
    const result = measureVerticality(input).district;
    expect(result.elevatedAreaM2).toBe(0);
    expect(result.heightM.max).toBeLessThan(2);
  });
  it('does not start a separate flood fill in an isolated sector', () => {
    const input = world([ramp, deck, down]);
    input.obstacles = [{ minX: -15, maxX: -13, minZ: -10, maxZ: 10 }];
    const result = measureVerticality(input);
    expect(result.district.elevatedAreaM2).toBe(0);
    expect(result.summarize({ minX: 0, maxX: 10, minZ: -5, maxZ: 5 }).samples).toBe(0);
  });
  it('validates sampling parameters', () => {
    expect(() => measureVerticality({ ...world(), spacing: 0 })).toThrow('finite and positive');
    expect(() => measureVerticality({ ...world(), elevatedHeight: Infinity })).toThrow('finite and positive');
  });
});
