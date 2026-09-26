import type { Obstacle, RegionBounds } from './region-collision';
import { createVerticalMovement } from './vertical-movement';
import { surfaceHeight, type WalkSurface } from './vertical-routes';

/** Diagnostics, never a map-quality score. Heights are feet above the current flat street datum. */
export const VERTICALITY_DEFAULTS = { spacing: 2, elevatedHeight: 2, radius: 0.38, bodyHeight: 1.8 } as const;
type Point = { x: number; y: number; z: number };
type Edge = { to: number; distance: number };
type Sample = Point & { column: string; surfaces: string[]; edges: Edge[] };
export interface VerticalityInput {
  bounds: RegionBounds;
  spawn: { x: number; z: number; y?: number };
  obstacles: readonly Obstacle[];
  surfaces: readonly WalkSurface[];
  traversalObstacles: Parameters<typeof createVerticalMovement>[0]['traversalObstacles'];
  spacing?: number;
  elevatedHeight?: number;
}
export interface VerticalitySummary {
  samples: number;
  reachableAreaM2: number;
  elevatedAreaM2: number;
  elevatedAreaFraction: number;
  overlappingFootprintM2: number;
  heightM: { min: number | null; p05: number | null; median: number | null; p95: number | null; max: number | null };
  distanceToElevatedSpaceM: { median: number | null; p90: number | null; unreachableSamples: number };
  reachableRouteIds: string[];
  reachableSlopeIds: string[];
}

const inside = (p: Point, b: RegionBounds) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
const quantile = (sorted: number[], q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;

/** Small binary heap for reverse multi-source shortest paths. */
class Queue {
  items: { id: number; distance: number }[] = [];
  push(id: number, distance: number) {
    const item = { id, distance }; let i = this.items.length; this.items.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (this.items[p].distance <= distance) break; this.items[i] = this.items[p]; i = p; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.items.length && this.items[c + 1].distance < this.items[c].distance) c++;
        if (this.items[c].distance >= last.distance) break;
        this.items[i] = this.items[c]; i = c;
      }
      this.items[i] = last;
    }
    return first;
  }
}

/**
 * Sample ground and explicitly playable surfaces on one layered lattice.
 * An edge exists only when the game's walking kernel actually arrives at the
 * other supported sample. No teleports onto roofs, inferred mesh walkability,
 * flying, jumps, cars, or invented stairs. Jumping and free-fall shortcuts are deliberately excluded.
 * Sector summaries reuse district reachability; a sector is never flood-filled
 * from an arbitrary point inside it.
 */
export function measureVerticality(input: VerticalityInput) {
  const spacing = input.spacing ?? VERTICALITY_DEFAULTS.spacing;
  const elevatedHeight = input.elevatedHeight ?? VERTICALITY_DEFAULTS.elevatedHeight;
  if (!Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(elevatedHeight) || elevatedHeight <= 0) throw new Error('Verticality sampling values must be finite and positive');
  const { radius, bodyHeight } = VERTICALITY_DEFAULTS;
  const movement = createVerticalMovement(input);
  const samples: Sample[] = [], columns = new Map<string, number[]>();
  const at = (i: number, j: number) => `${i}:${j}`;
  const cols = Math.floor((input.bounds.maxX - input.bounds.minX) / spacing) + 1;
  const rows = Math.floor((input.bounds.maxZ - input.bounds.minZ) / spacing) + 1;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = input.bounds.minX + i * spacing, z = input.bounds.minZ + j * spacing;
    const candidates = new Map<number, string[]>([[0, []]]);
    for (const s of input.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const y = surfaceHeight(s, x, z);
      candidates.set(y, [...(candidates.get(y) ?? []), s.id]);
    }
    for (const [y, surfaces] of candidates) {
      if (!movement.canOccupy(x, y, z, radius, bodyHeight)) continue;
      const support = movement.supportHeight(x, z, y + 0.01, radius, bodyHeight);
      if (support === null || Math.abs(support - y) > 0.02) continue;
      const column = at(i, j), ids = columns.get(column) ?? [];
      ids.push(samples.length); columns.set(column, ids);
      samples.push({ x, y, z, column, surfaces, edges: [] });
    }
  }
  const reaches = (a: Point, b: Point) => {
    // dt=0 uses the real spatial walking substeps without simulating gravity.
    const moved = movement.move({ ...a, velocityY: 0 }, b.x - a.x, b.z - a.z, 0, radius, bodyHeight);
    return Math.hypot(moved.x - b.x, moved.z - b.z) < 0.05 && Math.abs(moved.y - b.y) < 0.08 && moved.grounded;
  };
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    for (const a of columns.get(at(i, j)) ?? []) {
      for (const key of [at(i + 1, j), at(i, j + 1)]) for (const b of columns.get(key) ?? []) {
        const p = samples[a], q = samples[b];
        const distance = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        if (reaches(p, q)) p.edges.push({ to: b, distance });
        if (reaches(q, p)) q.edges.push({ to: a, distance });
      }
    }
  }
  const spawn = { ...input.spawn, y: input.spawn.y ?? 0 };
  const reachable = new Set<number>(), pending: number[] = [];
  if (movement.canOccupy(spawn.x, spawn.y, spawn.z, radius, bodyHeight)) {
    for (let id = 0; id < samples.length; id++) {
      const s = samples[id];
      if (Math.hypot(s.x - spawn.x, s.z - spawn.z) <= spacing * Math.SQRT2 + 0.01 && reaches(spawn, s)) {
        reachable.add(id); pending.push(id);
      }
    }
  }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    for (const edge of samples[pending[cursor]].edges) if (!reachable.has(edge.to)) {
      reachable.add(edge.to); pending.push(edge.to);
    }
  }
  const reverse: Edge[][] = samples.map(() => []);
  for (const id of reachable) for (const edge of samples[id].edges) if (reachable.has(edge.to)) reverse[edge.to].push({ to: id, distance: edge.distance });
  const distances = new Float64Array(samples.length).fill(Infinity), queue = new Queue();
  for (const id of reachable) if (samples[id].y >= elevatedHeight) { distances[id] = 0; queue.push(id, 0); }
  while (queue.items.length) {
    const current = queue.pop();
    if (current.distance !== distances[current.id]) continue;
    for (const edge of reverse[current.id]) {
      const next = current.distance + edge.distance;
      if (next < distances[edge.to]) { distances[edge.to] = next; queue.push(edge.to, next); }
    }
  }
  const reachableIds = [...reachable];
  const summarize = (bounds = input.bounds): VerticalitySummary => {
    const ids = reachableIds.filter(id => inside(samples[id], bounds));
    const heights = ids.map(id => samples[id].y).sort((a, b) => a - b);
    const elevated = ids.filter(id => samples[id].y >= elevatedHeight).length;
    const groundIds = ids.filter(id => samples[id].y < elevatedHeight);
    const finiteDistances = groundIds.map(id => distances[id]).filter(Number.isFinite).sort((a, b) => a - b);
    const footprints = new Map<string, number[]>();
    const surfaceIds = new Set<string>();
    const surfaceHeights = new Map<string, number[]>();
    for (const id of ids) {
      const s = samples[id], ys = footprints.get(s.column) ?? []; ys.push(s.y); footprints.set(s.column, ys);
      s.surfaces.forEach(id => {
        if (s.y >= elevatedHeight) surfaceIds.add(id);
        const ys = surfaceHeights.get(id) ?? []; ys.push(s.y); surfaceHeights.set(id, ys);
      });
    }
    const overlap = [...footprints.values()].filter(ys => Math.max(...ys) - Math.min(...ys) >= elevatedHeight).length;
    const routeIds = new Set(input.surfaces.filter(s => surfaceIds.has(s.id)).map(s => s.routeId));
    const slopeIds = input.surfaces.filter(s => {
      const ys = surfaceHeights.get(s.id) ?? [];
      return ys.length > 0 && Math.abs(s.endHeight - s.startHeight) >= elevatedHeight && Math.max(...ys) - Math.min(...ys) >= elevatedHeight;
    }).map(s => s.id);
    return {
      samples: ids.length, reachableAreaM2: ids.length * spacing ** 2,
      elevatedAreaM2: elevated * spacing ** 2, elevatedAreaFraction: ids.length ? elevated / ids.length : 0,
      overlappingFootprintM2: overlap * spacing ** 2,
      heightM: { min: quantile(heights, 0), p05: quantile(heights, 0.05), median: quantile(heights, 0.5), p95: quantile(heights, 0.95), max: quantile(heights, 1) },
      distanceToElevatedSpaceM: { median: quantile(finiteDistances, 0.5), p90: quantile(finiteDistances, 0.9), unreachableSamples: groundIds.length - finiteDistances.length },
      reachableRouteIds: [...routeIds].sort(), reachableSlopeIds: slopeIds.sort(),
    };
  };
  return { parameters: { spacing, elevatedHeight, radius, bodyHeight }, candidateSamples: samples.length, unreachableSamples: samples.length - reachable.size, district: summarize(), summarize };
}
