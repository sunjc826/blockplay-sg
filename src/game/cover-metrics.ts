import type * as THREE from 'three';
import { sceneFlightObstacles } from './flight-obstacles';
import type { RegionBounds } from './region-collision';

/**
 * How far a player must run to get out of the line of fire.
 *
 * The first version of this measured the movement collision list, which is the
 * wrong set. `Obstacle` is a flat footprint with no height — it is what stops
 * your feet — whereas a round is resolved by raycasting the scene meshes
 * (`fps-engine.ts` -> `firstVisibleHit`). The two disagree in both directions:
 * HarbourFront's basin is a 228x40 m collider whose box tops out at y=0.14, so
 * the whole harbour counted as cover, and Jurong Lake read 12.8 m better than
 * it is; meanwhile loggia bands and bridge decks that never call `solid()` stop
 * rounds but were invisible. Cover is therefore measured from the rendered
 * geometry, which carries real heights.
 */

/** Eye heights the engine actually uses, from `fps-engine.ts`. */
export const EYE = { stand: 1.75, crouch: 1.15 } as const;
/**
 * Shorter than this along its longer plan axis and it is a lamp post, a bollard
 * or a tree trunk. Deliberately the longer axis, not the shorter: a six-metre
 * wall four hundred millimetres thick is excellent cover, and a filter on the
 * shorter axis throws every wall, hoarding and parapet away while keeping
 * nothing useful.
 */
const MIN_COVER_LENGTH = 1.5;
/** A mass starting above this is a canopy overhead, not something to get behind. */
const MAX_COVER_BASE = 1.0;
/** Sampling step, matching the reachability flood fill's lattice. */
export const LATTICE = 2;

export type SectorCover = 'dense' | 'broken' | 'open';

export interface CoverMass { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Masses that break a silhouette, split by the posture they cover. Crouch cover
 * is the primary measure: a player can always crouch, so a chest-high wall is
 * real cover, merely bought at half movement speed.
 */
export function coverMasses(scene: THREE.Object3D) {
  const wide = sceneFlightObstacles(scene).filter(o =>
    Math.max(o.maxX - o.minX, o.maxZ - o.minZ) >= MIN_COVER_LENGTH && o.minY <= MAX_COVER_BASE);
  const pick = (height: number): CoverMass[] => wide.filter(o => o.maxY >= height)
    .map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ }));
  return { crouch: pick(EYE.crouch), stand: pick(EYE.stand) };
}

/** Exact squared-distance transform along one axis (Felzenszwalb). */
function transform1d(f: Float64Array, n: number) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k]; d[q] = dx * dx + f[v[k]];
  }
  return d;
}

/**
 * Median and 90th-percentile distance from open ground to the nearest cover,
 * in metres. `standable` narrows "open" to ground a player could actually
 * occupy, so water and building interiors do not read as exposure. Cover is rasterised onto the lattice and the distance field solved
 * exactly in O(cells) rather than by comparing every open cell to every mass —
 * Queenstown alone yields some fourteen thousand instance boxes, which a
 * pairwise sweep cannot afford.
 */
export function measureCover(bounds: RegionBounds, masses: readonly CoverMass[], standable?: (x: number, z: number) => boolean) {
  const cols = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / LATTICE) + 1);
  const rows = Math.max(1, Math.floor((bounds.maxZ - bounds.minZ) / LATTICE) + 1);
  const INF = 1e12, grid = new Float64Array(cols * rows).fill(INF);
  let covered = 0;
  for (const m of masses) {
    const i0 = Math.max(0, Math.ceil((m.minX - bounds.minX) / LATTICE));
    const i1 = Math.min(cols - 1, Math.floor((m.maxX - bounds.minX) / LATTICE));
    const j0 = Math.max(0, Math.ceil((m.minZ - bounds.minZ) / LATTICE));
    const j1 = Math.min(rows - 1, Math.floor((m.maxZ - bounds.minZ) / LATTICE));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const at = i * rows + j;
      if (grid[at] !== 0) { grid[at] = 0; covered++; }
    }
  }
  const total = cols * rows;
  // No cover at all is not merely a long run from it, so it stays Infinity
  // rather than collapsing to a large number a caller might average in.
  if (!covered) return { median: Infinity, p90: Infinity, solid: 0, samples: total };
  const column = new Float64Array(rows);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) column[j] = grid[i * rows + j];
    const d = transform1d(column, rows);
    for (let j = 0; j < rows; j++) grid[i * rows + j] = d[j];
  }
  const row = new Float64Array(cols);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) row[i] = grid[i * rows + j];
    const d = transform1d(row, cols);
    for (let i = 0; i < cols; i++) grid[i * rows + j] = d[i];
  }
  // Ground nobody can stand on is not exposed ground. Without this the harbour
  // itself counts as open, and a district reads worse the more water it has.
  const open: number[] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const at = i * rows + j;
    if (grid[at] <= 0) continue;
    if (standable && !standable(bounds.minX + i * LATTICE, bounds.minZ + j * LATTICE)) continue;
    open.push(Math.sqrt(grid[at]) * LATTICE);
  }
  open.sort((a, b) => a - b);
  const at = (q: number) => open.length ? open[Math.min(open.length - 1, Math.floor(open.length * q))] : 0;
  return { median: at(0.5), p90: at(0.9), solid: covered / total, samples: total };
}

/**
 * How the ground reads to someone being shot at. The bands are numeric rather
 * than a matter of judgement, because nineteen districts will be labelled
 * against them and eyeballing the scene gets it wrong — of the nine labels
 * written by hand for HarbourFront, three were wrong on the first measurement
 * and four more moved when the metric was corrected.
 *
 * Measured on crouch cover: a player can always crouch, so a chest-high wall is
 * real cover, merely bought at half movement speed. `zone-sectors.test.ts`
 * holds every declared label to `coverFor`, so a label cannot drift from the
 * geometry it describes.
 *
 * Median metres from open ground to the nearest mass that breaks a silhouette.
 * `dense` is cover essentially at hand, `broken` is cover a short sprint away,
 * `open` is exposed. The thresholds are tight because they describe a district
 * that has had a cover pass: before HarbourFront's, every sector sat between
 * 12 m and no cover at all, and any banding would have called the whole map
 * open. Expect an unpassed district to read `open` almost throughout — that is
 * the point, not a miscalibration.
 */
export const COVER_BANDS = { dense: 6, broken: 12 } as const;

/** The band the geometry actually falls in, which is what a label must match. */
export function coverFor(bounds: RegionBounds, masses: readonly CoverMass[], standable?: (x: number, z: number) => boolean): SectorCover {
  const { median } = measureCover(bounds, masses, standable);
  if (median <= COVER_BANDS.dense) return 'dense';
  return median <= COVER_BANDS.broken ? 'broken' : 'open';
}

