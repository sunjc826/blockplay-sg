import type { Obstacle, RegionBounds } from './region-collision';

/**
 * How open a district's ground is, measured from its built colliders: the numbers a level review starts from.
 * Everything is 2D at one eye height taken where the viewer stands, so a ridge or a sunken court between two
 * points is not seen, and only colliders block: foliage, railings without colliders and fog do not.
 */
export interface LayoutOptions {
  /** Sample spacing in metres. */
  cell?: number;
  /** Sightlines stop here, about what fog and a rifle make useful. */
  reach?: number;
  /** Rays cast from each sample. */
  rays?: number;
  eye?: number;
  /** A collider this tall above its base is a building rather than cover. */
  buildingHeight?: number;
  /** A standable top this far above the ground counts as raised floor. */
  raisedHeight?: number;
  /** Authored decks, bridges and stairs (vertical-routes); their level parts count as raised floor. */
  surfaces?: readonly LayoutSurface[];
}
export interface LayoutSurface { minX: number; maxX: number; minZ: number; maxZ: number; startHeight: number; endHeight: number; footprint?: Obstacle['footprint'] }
export interface LayoutBand { name: string; samples: number; openness: number }
export interface LayoutReport {
  cell: number; reach: number;
  /** Samples a soldier can stand on. */
  standable: number;
  /** Share of land (standable ground plus building footprints) under buildings. */
  buildingShare: number;
  /** Share of land under level footing well above the ground: decks, bridges, podiums, roofs that can be stood on. */
  raisedShare: number;
  /** Mean share of the reach disc a standing viewer sees: 1 is a parade square, 0 a cupboard. */
  openness: number;
  /** Mean and median over samples of the average clear distance round a viewer, capped at the reach. */
  sightline: { mean: number; median: number };
  /** Openness by thirds of the map, north (low Z) first. */
  bands: LayoutBand[];
}

type Blocker = { minX: number; maxX: number; minZ: number; maxZ: number; footprint?: Obstacle['footprint'] };

function inside(o: Blocker, x: number, z: number) {
  if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) return false;
  if (!o.footprint) return true;
  let positive = false, negative = false;
  for (let i = 0; i < o.footprint.length; i++) {
    const a = o.footprint[i], b = o.footprint[(i + 1) % o.footprint.length], cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    positive ||= cross > 1e-5; negative ||= cross < -1e-5;
  }
  return !(positive && negative);
}

/** Distance along a unit ray to a collider's outline, or Infinity. The box is the slab test; a footprint is its edges. */
export function rayToBlocker(o: Blocker, x: number, z: number, dx: number, dz: number, limit: number) {
  let near = 0, far = limit;
  for (const [origin, direction, low, high] of [[x, dx, o.minX, o.maxX], [z, dz, o.minZ, o.maxZ]] as const) {
    if (Math.abs(direction) < 1e-9) { if (origin < low || origin > high) return Infinity; continue; }
    const a = (low - origin) / direction, b = (high - origin) / direction;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  if (!o.footprint) return near;
  let hit = Infinity;
  for (let i = 0; i < o.footprint.length; i++) {
    const a = o.footprint[i], b = o.footprint[(i + 1) % o.footprint.length], ex = b.x - a.x, ez = b.z - a.z, cross = dx * ez - dz * ex;
    if (Math.abs(cross) < 1e-9) continue;
    const t = ((a.x - x) * ez - (a.z - z) * ex) / cross, u = ((a.x - x) * dz - (a.z - z) * dx) / cross;
    if (t >= 0 && t <= limit && u >= 0 && u <= 1) hit = Math.min(hit, t);
  }
  return hit;
}

export function measureLayout(bounds: RegionBounds, obstacles: readonly Obstacle[], standable: (x: number, z: number) => boolean, options: LayoutOptions = {}): LayoutReport {
  const { cell = 8, reach = 120, rays = 72, eye = 1.6, buildingHeight = 2.5, raisedHeight = 1.5, surfaces = [] } = options;
  const ground = (x: number, z: number) => bounds.groundHeight?.(x, z) ?? 0;
  const solid = obstacles.filter(o => !o.water);
  const base = (o: Obstacle) => o.minY ?? ground((o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2);
  const buildings = solid.filter(o => (o.maxY ?? Infinity) - base(o) >= buildingHeight && (o.minY === undefined || o.minY - ground((o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2) < eye));
  const raised: Blocker[] = [
    ...solid.filter(o => o.supportsTop && o.maxY !== undefined && o.maxY - ground((o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2) >= raisedHeight),
    ...surfaces.filter(s => s.startHeight === s.endHeight && s.startHeight - ground((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2) >= raisedHeight),
  ];

  const points: { x: number; z: number }[] = [];
  let built = 0, decked = 0;
  for (let x = bounds.minX + cell / 2; x < bounds.maxX; x += cell) for (let z = bounds.minZ + cell / 2; z < bounds.maxZ; z += cell) {
    const inBuilding = buildings.some(o => inside(o, x, z));
    if (inBuilding) built++;
    if (raised.some(o => inside(o, x, z))) decked++;
    if (!inBuilding && standable(x, z)) points.push({ x, z });
  }
  const land = points.length + built;

  const directions = Array.from({ length: rays }, (_, i) => ({ x: Math.cos(i / rays * Math.PI * 2), z: Math.sin(i / rays * Math.PI * 2) }));
  const depth = bounds.maxZ - bounds.minZ, names = ['north', 'middle', 'south'];
  const bandSum = [0, 0, 0], bandCount = [0, 0, 0], sight: number[] = [];
  let total = 0;
  for (const p of points) {
    const height = ground(p.x, p.z) + eye;
    const near = solid.filter(o => (o.maxY ?? Infinity) >= height && (o.minY ?? -Infinity) <= height
      && o.minX < p.x + reach && o.maxX > p.x - reach && o.minZ < p.z + reach && o.maxZ > p.z - reach && !inside(o, p.x, p.z));
    let area = 0, run = 0;
    for (const d of directions) {
      // The map's edge ends a sightline as a wall does: there is no ground beyond it to see.
      let distance = Math.min(reach,
        d.x > 0 ? (bounds.maxX - p.x) / d.x : d.x < 0 ? (bounds.minX - p.x) / d.x : Infinity,
        d.z > 0 ? (bounds.maxZ - p.z) / d.z : d.z < 0 ? (bounds.minZ - p.z) / d.z : Infinity);
      for (const o of near) distance = Math.min(distance, rayToBlocker(o, p.x, p.z, d.x, d.z, distance));
      area += distance * distance; run += distance;
    }
    const share = area / (rays * reach * reach), band = Math.min(2, Math.floor((p.z - bounds.minZ) / depth * 3));
    total += share; bandSum[band] += share; bandCount[band]++; sight.push(run / rays);
  }
  sight.sort((a, b) => a - b);
  const count = Math.max(1, points.length);
  return {
    cell, reach, standable: points.length,
    buildingShare: land ? built / land : 0, raisedShare: land ? decked / land : 0, openness: total / count,
    sightline: { mean: sight.reduce((sum, value) => sum + value, 0) / count, median: sight[Math.floor(sight.length / 2)] ?? 0 },
    bands: names.map((name, i) => ({ name, samples: bandCount[i], openness: bandCount[i] ? bandSum[i] / bandCount[i] : 0 })),
  };
}
