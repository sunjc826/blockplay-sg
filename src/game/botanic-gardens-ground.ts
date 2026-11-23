import * as THREE from 'three';
import { accelerateTerrainRaycast } from './terrain-raycast';
import { accelerateMeshRaycast } from './mesh-raycast';

/**
 * The Botanic Gardens' ground: two hills, a rain forest ridge and Palm Valley falling north between
 * them to Symphony Lake (docs/level-reviews/botanic-gardens-plan.json). Positions follow the plan;
 * every height is authored, since no official levels are published. One sampled grid serves the
 * drawn mesh and the height the game walks on, so the two cannot drift apart.
 */
export const BOTANIC_EXTENT = { minX: -215, maxX: 215, minZ: -265, maxZ: 265 };
/** Perimeter road centrelines; the ground is level from 8 m inside them outward. */
export const BOTANIC_EDGE = { x: 205, z: 258 };
export const BOTANIC_RING = [{ x: -205, z: 34 }, { x: -70, z: 30 }, { x: 0, z: 36 }, { x: 70, z: 40 }, { x: 205, z: 36 }];

export interface Lake { cx: number; cz: number; rx: number; rz: number }
export interface LandDisc { x: number; z: number; r: number; y: number }
export const SWAN_LAKE: Lake = { cx: -105, cz: 188, rx: 60, rz: 40 };
export const SYMPHONY_LAKE: Lake = { cx: 24, cz: -206, rx: 56, rz: 32 };
/** Land standing in or against a lake: the stage islet, the gazebo landing and Swan Lake's island. */
export const STAGE_ISLET: LandDisc = { x: -12, z: -184, r: 15, y: .9 };
export const GAZEBO_LANDING: LandDisc = { x: -100, z: 226, r: 8, y: .4 };
export const SWAN_ISLAND: LandDisc = { x: -112, z: 176, r: 9, y: .8 };
const DISCS = [STAGE_ISLET, GAZEBO_LANDING, SWAN_ISLAND];

/** Level ground under a building: its footprint and the height it stands at. */
export const BOTANIC_PADS = {
  burkill: { x: -130, z: -52, w: 22, d: 16, y: 11 },
  corner: { x: 106, z: -192, w: 20, d: 16, y: 4 },
  /** Level ground under the Corner House stair, which would otherwise start on a cross slope. */
  cornerStair: { x: 100, z: -176, w: 5, d: 12, y: 4 },
  bandstand: { x: -1, z: 89, w: 14, d: 14, y: 6 },
  plaza: { x: 11, z: 16, w: 82, d: 28, y: 6 },
} as const;

const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
/** Piecewise profile with eased joins, so a terrace meets its bank without a crease. */
function profile(n: number, points: readonly (readonly [number, number])[]) {
  if (n <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (n <= points[i][0]) {
    const [a, h] = points[i - 1], [b, k] = points[i]; return h + (k - h) * smooth((n - a) / (b - a));
  }
  return points.at(-1)![1];
}
function distanceToPath(x: number, z: number, points: readonly { x: number; z: number }[]) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}
export const distanceToRing = (x: number, z: number) => distanceToPath(x, z, BOTANIC_RING);
/** The ring road's own grade: level in the west, over the saddle at Orchid Plaza, along the forest ridge and down to Cluny Road. */
const ringHeight = (x: number) => profile(x, [[-200, 0], [-105, 0], [-45, 6], [95, 6], [150, 5], [193, 0]]);

function authored(x: number, z: number) {
  // Bandstand hill: a broad dome with a level crown.
  let h = 6 * smooth((1 - Math.hypot((x - 5) / 56, (z - 95) / 46)) / .68);
  // Orchid hill: three terraces at 4, 8 and 11 m.
  h = Math.max(h, profile(Math.hypot((x + 125) / 78, (z + 50) / 72), [[.3, 11], [.44, 8], [.58, 8], [.72, 4], [.84, 4], [1, 0]]));
  // Rain forest ridge: highest along its west rim, above the valley.
  const ridge = profile(x, [[70, 0], [90, 1], [178, 1], [197, 0]]) * profile(z, [[-124, 0], [-100, 1], [100, 1], [124, 0]]);
  h = Math.max(h, ridge * (6.5 - 1.5 * smooth((x - 90) / 60)));
  // Palm Valley: from the plaza saddle down to the lake, with one step in the lawn at z = -62.
  const floor = profile(z, [[-168, .5], [-150, 1], [-66, 3], [-60, 4.5], [2, 6]]);
  const t = Math.max(0, Math.min(1, (8 - z) / 158)), west = -42 - 20 * t, east = 58 + 20 * t;
  const outside = Math.max(0, west - x, x - east, z - 44, -168 - z);
  h = Math.max(h, floor * (1 - smooth(outside / 24)));
  // Corner House slope.
  h = Math.max(h, 4 * smooth((1 - Math.hypot((x - 106) / 34, (z + 192) / 30)) / .4));
  for (const pad of Object.values(BOTANIC_PADS)) {
    const d = Math.max(0, Math.abs(x - pad.x) - pad.w / 2 - 2, Math.abs(z - pad.z) - pad.d / 2 - 2);
    if (d < 7) h += (pad.y - h) * (1 - smooth(d / 7));
  }
  const road = distanceToRing(x, z);
  if (road < 20) h += (ringHeight(x) - h) * (1 - smooth((road - 7) / 13));
  for (const disc of DISCS) h = Math.max(h, disc.y * (1 - smooth((Math.hypot(x - disc.x, z - disc.z) - disc.r + 3) / 3)));
  return h * smooth((Math.min(BOTANIC_EDGE.x - Math.abs(x), BOTANIC_EDGE.z - Math.abs(z)) - 8) / 16);
}

const COLUMNS = 145, ROWS = 178;
const stepX = (BOTANIC_EXTENT.maxX - BOTANIC_EXTENT.minX) / (COLUMNS - 1), stepZ = (BOTANIC_EXTENT.maxZ - BOTANIC_EXTENT.minZ) / (ROWS - 1);
const heights = new Float32Array(COLUMNS * ROWS);
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLUMNS; i++) heights[j * COLUMNS + i] = authored(BOTANIC_EXTENT.minX + i * stepX, BOTANIC_EXTENT.minZ + j * stepZ);

/** Height of the drawn ground, read off the same triangles the mesh draws. */
export function botanicGroundHeight(x: number, z: number) {
  const u = (x - BOTANIC_EXTENT.minX) / stepX, v = (z - BOTANIC_EXTENT.minZ) / stepZ;
  if (!(u > 0 && v > 0 && u < COLUMNS - 1 && v < ROWS - 1)) return 0;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, n = j * COLUMNS + i;
  const a = heights[n], b = heights[n + 1], c = heights[n + COLUMNS], d = heights[n + COLUMNS + 1];
  return fu + fv <= 1 ? a + (b - a) * fu + (c - a) * fv : d + (c - d) * (1 - fu) + (b - d) * (1 - fv);
}

export const inLake = (lake: Lake, x: number, z: number, margin = 0) => Math.hypot((x - lake.cx) / (lake.rx + margin), (z - lake.cz) / (lake.rz + margin)) < 1;
/**
 * A lake as collision: rows of rectangles under the ellipse, parted around any land standing in it.
 * Rows are inset to the narrower of their two edges so no rectangle reaches past the drawn shore.
 */
export function lakeSpans(lake: Lake, row = 5) {
  const spans: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (let minZ = lake.cz - lake.rz; minZ < lake.cz + lake.rz - 1e-6; minZ += row) {
    const maxZ = Math.min(minZ + row, lake.cz + lake.rz), far = Math.max(Math.abs(minZ - lake.cz), Math.abs(maxZ - lake.cz));
    const half = lake.rx * Math.sqrt(Math.max(0, 1 - (far / lake.rz) ** 2));
    if (half < 2) continue;
    let pieces: [number, number][] = [[lake.cx - half, lake.cx + half]];
    for (const disc of DISCS) {
      const near = Math.max(0, minZ - disc.z, disc.z - maxZ);
      if (near >= disc.r) continue;
      const chord = Math.sqrt(disc.r ** 2 - near ** 2);
      pieces = pieces.flatMap(([a, b]) => [[a, Math.min(b, disc.x - chord)], [Math.max(a, disc.x + chord), b]].filter(([from, to]) => to - from > 1) as [number, number][]);
    }
    for (const [minX, maxX] of pieces) spans.push({ minX, maxX, minZ, maxZ });
  }
  return spans;
}

/** A ribbon laid on the ground: a path, the ring road, or (with `square`) a paved floor exactly `width` deep. Later ribbons lie over earlier ones. */
export interface GroundRibbon { points: readonly { x: number; z: number }[]; width: number; color: string; square?: boolean }

export function buildBotanicGround(ribbons: readonly GroundRibbon[]) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const lawn = new THREE.Color('#7f9c5c'), high = new THREE.Color('#6c8a50'), forest = new THREE.Color('#5d7446'), bed = new THREE.Color('#6f7f5a');
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLUMNS; i++) {
    const x = BOTANIC_EXTENT.minX + i * stepX, z = BOTANIC_EXTENT.minZ + j * stepZ, y = heights[j * COLUMNS + i];
    const shaded = x > 84 && x < 198 && Math.abs(z) < 112 && distanceToRing(x, z) > 8;
    const wet = inLake(SWAN_LAKE, x, z, 2) || inLake(SYMPHONY_LAKE, x, z, 2);
    const color = wet && y < .3 ? bed : shaded ? forest : lawn.clone().lerp(high, Math.min(1, y / 11));
    positions.push(x, y, z); colors.push(color.r, color.g, color.b);
    if (i < COLUMNS - 1 && j < ROWS - 1) { const n = j * COLUMNS + i; indices.push(n, n + COLUMNS, n + 1, n + COLUMNS + 1, n + 1, n + COLUMNS); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Botanic Gardens ground';
  mesh.receiveShadow = true; mesh.userData.groundSurface = mesh.userData.terrain = true;
  const disposeRaycast = accelerateTerrainRaycast(mesh, COLUMNS, ROWS);

  // Paths and the ring road are draped a hand's width above the ground, sampled every metre so they follow it.
  const at: number[] = [], tint: number[] = [], faces: number[] = [];
  ribbons.forEach((ribbon, order) => {
    const color = new THREE.Color(ribbon.color), lift = ribbon.square ? .14 : order ? .1 : .06, across = Math.max(4, Math.ceil(ribbon.width / 1.5)), over = ribbon.square ? 0 : ribbon.width / 2;
    for (let s = 1; s < ribbon.points.length; s++) {
      const a = ribbon.points[s - 1], b = ribbon.points[s], length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length));
      const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length, first = at.length / 3;
      // Each stretch overruns its ends by half a width, which closes the notch on the outside of a bend.
      for (let n = 0; n <= steps; n++) for (let k = 0; k <= across; k++) {
        const along = -over + (length + over * 2) * n / steps, side = (k / across - .5) * ribbon.width;
        const x = a.x + (b.x - a.x) * along / length + nx * side, z = a.z + (b.z - a.z) * along / length + nz * side;
        at.push(x, botanicGroundHeight(x, z) + lift, z); tint.push(color.r, color.g, color.b);
        if (n < steps && k < across) { const v = first + n * (across + 1) + k; faces.push(v, v + 1, v + across + 1, v + 1, v + across + 2, v + across + 1); }
      }
    }
  });
  const pathGeometry = new THREE.BufferGeometry(); pathGeometry.setIndex(faces);
  pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(at, 3));
  pathGeometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3)); pathGeometry.computeVertexNormals();
  const pathMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const paths = new THREE.Mesh(pathGeometry, pathMaterial); paths.name = 'Botanic Gardens paths'; paths.receiveShadow = true;
  // Ground cover reads this flag: grass stops at the edge of anything paved.
  paths.userData.groundSurface = paths.userData.groundPaving = true;
  const disposePathRaycast = accelerateMeshRaycast(paths);
  return { mesh, paths, dispose() { disposeRaycast(); disposePathRaycast(); geometry.dispose(); material.dispose(); pathGeometry.dispose(); pathMaterial.dispose(); } };
}
