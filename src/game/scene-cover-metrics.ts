import type * as THREE from 'three';
import { EYE, LATTICE, transform1d } from './cover-metrics';
import { isVisualCover } from './cover-kind';
import { sceneFlightObstacles } from './flight-obstacles';
import type { Obstacle, RegionBounds } from './region-collision';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces, surfaceContains, surfaceHeight } from './vertical-routes';

export interface CoverSummary {
  mean: number; median: number; p90: number; max: number;
  samples: number; within2m: number;
}
type Posture = keyof typeof EYE;

/**
 * Ground-level design diagnostic, not a guarantee against any firing direction.
 * Distances are horizontal straight-line proximity on a 2m lattice, NOT walking
 * routes or ballistic protection. Mesh boxes approximate silhouettes; narrow
 * surfaces seed every cell they intersect, with up to one cell of uncertainty.
 *
 * All occupiable samples (including zero-distance concealment) share the same
 * denominator. Visual cover includes solid cover. Terrain uses actual authored
 * top planes, never the bounding box of a whole hill. Eye heights follow local
 * earth, rounded to 25cm bands; building galleries are deliberately separate.
 * District fields are solved before sector summaries, so nearby cover across a
 * sector boundary is retained. No cover is Infinity; no valid samples is null.
 */
export function analyseSceneCover(scene: THREE.Scene, bounds: RegionBounds, obstacles: readonly Obstacle[]) {
  const surfaces = getWalkSurfaces(scene), earth = surfaces.filter(s => s.solidBelow);
  const movement = createVerticalMovement({ bounds, obstacles, surfaces, traversalObstacles: getTraversalObstacles(scene) });
  const cols = Math.floor((bounds.maxX - bounds.minX) / LATTICE) + 1;
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / LATTICE) + 1, total = cols * rows;
  const ground = new Float64Array(total), valid = new Uint8Array(total);
  const bands = new Map<number, number[]>();
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = bounds.minX + i * LATTICE, z = bounds.minZ + j * LATTICE, at = i * rows + j;
    for (const s of earth) if (surfaceContains(s, x, z)) ground[at] = Math.max(ground[at], surfaceHeight(s, x, z));
    if (!movement.canOccupy(x, ground[at], z, .4, 1.8)) continue;
    valid[at] = 1;
    const band = Math.round(ground[at] * 4) / 4, cells = bands.get(band) ?? [];
    cells.push(at); bands.set(band, cells);
  }
  const substantial = (m: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
    Math.max(m.maxX - m.minX, m.maxZ - m.minZ) >= 1.5 || Math.min(m.maxX - m.minX, m.maxZ - m.minZ) >= .65;
  const hard = sceneFlightObstacles(scene, mesh => !isVisualCover(mesh) && !mesh.userData.terrain && !mesh.userData.coverMetricIgnore).filter(substantial);
  const foliage = sceneFlightObstacles(scene, mesh => isVisualCover(mesh) && !mesh.userData.coverMetricIgnore).filter(substantial);
  const fields = {} as Record<Posture, { solid: Float64Array; visual: Float64Array }>;
  const INF = 1e12;
  const solve = (eye: number, includeFoliage: boolean) => {
    const grid = new Float64Array(total).fill(INF);
    for (const m of includeFoliage ? [...hard, ...foliage] : hard) {
      if (m.minY > eye || m.maxY < eye) continue;
      const i0 = Math.max(0, Math.ceil((m.minX - bounds.minX) / LATTICE - .5));
      const i1 = Math.min(cols - 1, Math.floor((m.maxX - bounds.minX) / LATTICE + .5));
      const j0 = Math.max(0, Math.ceil((m.minZ - bounds.minZ) / LATTICE - .5));
      const j1 = Math.min(rows - 1, Math.floor((m.maxZ - bounds.minZ) / LATTICE + .5));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[i * rows + j] = 0;
    }
    // Earth higher than this observer's eyes breaks the low horizontal sightline.
    for (let at = 0; at < total; at++) if (ground[at] >= eye) grid[at] = 0;
    if (!grid.includes(0)) return grid.fill(Infinity);
    const column = new Float64Array(rows), row = new Float64Array(cols);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) column[j] = grid[i * rows + j];
      const distances = transform1d(column, rows);
      for (let j = 0; j < rows; j++) grid[i * rows + j] = distances[j];
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) row[i] = grid[i * rows + j];
      const distances = transform1d(row, cols);
      for (let i = 0; i < cols; i++) grid[i * rows + j] = Math.sqrt(distances[i]) * LATTICE;
    }
    return grid;
  };
  for (const posture of Object.keys(EYE) as Posture[]) {
    const solid = new Float64Array(total), visual = new Float64Array(total);
    for (const [band, cells] of bands) {
      const hardDistances = solve(band + EYE[posture], false);
      const visualDistances = solve(band + EYE[posture], true);
      for (const at of cells) { solid[at] = hardDistances[at]; visual[at] = visualDistances[at]; }
    }
    fields[posture] = { solid, visual };
  }
  function measure(area: RegionBounds = bounds) {
    const summarize = (distances: Float64Array): CoverSummary | null => {
      const values: number[] = [];
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = bounds.minX + i * LATTICE, z = bounds.minZ + j * LATTICE, at = i * rows + j;
        if (valid[at] && x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ) values.push(distances[at]);
      }
      if (!values.length) return null;
      values.sort((a, b) => a - b);
      return { mean: values.reduce((sum, d) => sum + d, 0) / values.length,
        median: values[Math.floor(values.length * .5)], p90: values[Math.floor(values.length * .9)],
        max: values[values.length - 1], samples: values.length, within2m: values.filter(d => d <= 2).length / values.length };
    };
    return Object.fromEntries((Object.keys(EYE) as Posture[]).map(p => [p, {
      solid: summarize(fields[p].solid), visual: summarize(fields[p].visual),
    }])) as Record<Posture, { solid: CoverSummary | null; visual: CoverSummary | null }>;
  }
  return { measure };
}
