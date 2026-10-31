import * as THREE from 'three';
import { accelerateTerrainRaycast } from './terrain-raycast';
import type { VerticalPlace } from './vertical-places';
import type { SceneKit } from './scene-kit';

const profile = (n: number, points: readonly (readonly [number, number])[]) => {
  if (n <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (n <= points[i][0]) {
    const [a, h] = points[i - 1], [b, k] = points[i]; return h + (k - h) * (n - a) / (b - a);
  }
  return points.at(-1)![1];
};
const axis = (min: number, max: number, extra: number[]) => [...new Set([
  ...Array.from({ length: (max - min) / 2 + 1 }, (_, i) => min + i * 2), ...extra,
])].sort((a, b) => a - b);

export const HARBOURFRONT_RIDGE_STAIR = [
  { x: -185, z: -32, y: 0 }, { x: -185, z: -44, y: 5 },
  { x: -185, z: -46, y: 5 }, { x: -185, z: -58, y: 11 },
  { x: -185, z: -60, y: 11 }, { x: -185, z: -72, y: 17 },
  { x: -185, z: -74, y: 17 }, { x: -185, z: -84, y: 22 },
];
export const HARBOURFRONT_RIDGE_REST = { x: -207, z: -84, y: 12.1, width: 8, depth: 8 };
export const HARBOURFRONT_CONTOUR_PATH = [
  { x: -213, z: -34 }, { x: -209, z: -58 }, { x: -207, z: -84 },
  { x: -202, z: -108 }, { x: -185, z: -108 }, { x: -185, z: -96 },
];
function ridgeHeight(x: number, z: number) {
  const rise = profile(z, [[-142, 0], [-128, 3], [-112, 13], [-100, 22], ...[...HARBOURFRONT_RIDGE_STAIR].reverse().map(p => [p.z,p.y] as const)]);
  const shoulder = profile(x, [[-222, 0], [-214, .3], [-202, .8], [-196, 1], [-174, 1], [-164, .68], [-152, 0]]);
  let y = rise * shoulder;
  const p = HARBOURFRONT_RIDGE_REST;
  const distance = Math.max(0, Math.abs(x - p.x) - p.width / 2, Math.abs(z - p.z) - p.depth / 2);
  if (distance < 5) y += (p.y - y) * (1 - distance / 5);
  return y;
}

/** The fort keeps a compact defensive terrace sequence; its entrances end
 * before the road, rather than climbing across the z=20 carriageway. */
export const SENTOSA_FORT_GROUND: VerticalPlace = {
  id: 'siloso-rampart-terrain', name: 'Fort Siloso connected hillside and battery',
  note: 'Authored defensive terraces and planted shoulders, with two road-clear approaches; not surveyed fort levels.',
  floors: [
    { id: 'battery-lower', x: -90, z: -7, y: 4, width: 54, depth: 6, color: '#7a945e', foundation: 'solid', rails: false },
    { id: 'battery-middle', x: -90, z: -25, y: 8, width: 48, depth: 6, color: '#839661', foundation: 'solid', rails: false },
    { id: 'battery-rampart', x: -90, z: -48, y: 12.2, width: 34, depth: 16, color: '#b9b1a0', foundation: 'solid', rails: false },
  ],
  connections: [
    ...[-101, -86].map((x, i) => ({ id: `${i ? 'east' : 'west'}-fort-entry`, from: { x, y: 0, z: 12 }, to: { x, y: 4, z: -4 }, width: 5, foundation: 'solid' as const, rails: false, color: '#b9b1a0' })),
    { id: 'continuous-fort-earth-0', from: { x: -90, y: 4, z: -10 }, to: { x: -90, y: 8, z: -22 }, width: 44, foundation: 'solid', rails: false, color: '#839661' },
    { id: 'continuous-fort-earth-1', from: { x: -90, y: 8, z: -28 }, to: { x: -90, y: 12.2, z: -40 }, width: 28, foundation: 'solid', rails: false, color: '#839661' },
  ],
  fixtures: [-52, -47, -42].map(z => ({ x: -82, y: 12.8, z, width: 4.4, height: 1.2, depth: 2.6, color: '#7c6248' })),
};
const fortRegions = [
  ...SENTOSA_FORT_GROUND.floors.map(f => ({ minX: f.x - f.width / 2, maxX: f.x + f.width / 2, minZ: f.z - f.depth / 2, maxZ: f.z + f.depth / 2, height: () => f.y })),
  ...SENTOSA_FORT_GROUND.connections.map(c => ({ minX: c.from.x - c.width / 2, maxX: c.from.x + c.width / 2,
    minZ: Math.min(c.from.z, c.to.z), maxZ: Math.max(c.from.z, c.to.z),
    height: (_x: number, z: number) => c.from.y + (c.to.y - c.from.y) * (z - c.from.z) / (c.to.z - c.from.z) })),
];
const inRegion = (r: typeof fortRegions[number], x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
function fortHeight(x: number, z: number) {
  const owner = fortRegions.find(r => inRegion(r, x, z));
  if (owner) return owner.height(x, z);
  const rise = profile(z, [[-96, 0], [-78, 4], [-64, 9], [-56, 12.2], [-40, 12.2], [-28, 8], [-22, 8], [-10, 4], [-4, 4], [12, 0]]);
  const shoulder = profile(x, [[-142, 0], [-129, .3], [-117, .68], [-107, 1], [-73, 1], [-63, .65], [-48, 0]]);
  return rise * shoulder;
}
type Ground = ReturnType<typeof ground>;
function ground(xs: number[], zs: number[], authored: (x: number, z: number) => number, owned: (x: number, z: number) => boolean) {
  const heights = zs.map(z => xs.map(x => authored(x, z)));
  function height(x: number, z: number) {
    if (x <= xs[0] || x >= xs.at(-1)! || z <= zs[0] || z >= zs.at(-1)!) return 0;
    const i = xs.findIndex((n, i) => i < xs.length - 1 && x >= n && x < xs[i + 1]);
    const j = zs.findIndex((n, j) => j < zs.length - 1 && z >= n && z < zs[j + 1]);
    const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const a = heights[j][i], b = heights[j][i + 1], c = heights[j + 1][i], d = heights[j + 1][i + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  return { xs, zs, heights, height, owned };
}
const ridge = ground(axis(-222, -152, [-211, -203, -196, -188, -182, -174]), axis(-142, -32, [-100, -96, -88, -80,...HARBOURFRONT_RIDGE_STAIR.map(p=>p.z)]), ridgeHeight,
  (x, z) => x >= -188 && x <= -182 && z >= -84 && z <= -32);
const fort = ground(axis(-142, -48, fortRegions.flatMap(r => [r.minX, r.maxX])), axis(-96, 12, fortRegions.flatMap(r => [r.minZ, r.maxZ])), fortHeight,
  (x, z) => fortRegions.some(r => inRegion(r, x, z)));
export const harbourfrontGroundHeight = ridge.height;
export const sentosaGroundHeight = fort.height;

function nearPath(x: number, z: number, points: readonly { x: number; z: number }[], width: number) {
  return points.slice(1).some((b, i) => {
    const a = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < width / 2;
  });
}
export function buildCoastalGround(kind: 'harbourfront' | 'sentosa') {
  const model: Ground = kind === 'harbourfront' ? ridge : fort;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const low = new THREE.Color('#77945d'), high = new THREE.Color('#60804e'), path = new THREE.Color('#b7ac91');
  model.zs.forEach((z, j) => model.xs.forEach((x, i) => {
    const y = model.heights[j][i];
    const onPath = kind === 'harbourfront' && (nearPath(x, z, HARBOURFRONT_CONTOUR_PATH, 3) || Math.abs(x + 185) <= 11 && z >= -100 && z <= -84 || Math.abs(x + 207) <= 4 && Math.abs(z + 84) <= 4);
    const color = onPath ? path : low.clone().lerp(high, Math.min(1, y / 24));
    positions.push(x, y, z); colors.push(color.r, color.g, color.b);
    if (i < model.xs.length - 1 && j < model.zs.length - 1 && !model.owned((x + model.xs[i + 1]) / 2, (z + model.zs[j + 1]) / 2)) {
      const n = j * model.xs.length + i; indices.push(n, n + model.xs.length, n + 1, n + model.xs.length + 1, n + 1, n + model.xs.length);
    }
  }));
  const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = `${kind} connected coastal hillside`;
  mesh.receiveShadow = true; mesh.userData.groundSurface = mesh.userData.terrain = true;
  const disposeRaycast = accelerateTerrainRaycast(mesh, model.xs.length, model.zs.length);
  return { mesh, dispose() { disposeRaycast(); geometry.dispose(); material.dispose(); } };
}

// Kept separate from Google image acceptance metadata: public photos support
// these relationships, while relative levels and compressed routes are authored.
export const COASTAL_GROUND_SOURCES = [
  'https://www.nparks.gov.sg/visit/parks/park-detail/mount-faber-park',
  'https://www.littledayout.com/marang-trail-climbing-up-stairs-mount-faber/',
  'https://www.littledayout.com/fort-siloso-skywalk-siloso-trail-sentosa/',
  'https://www.vivocity.com.sg/tourist',
];

/** Timber trail/promontory seating, deliberately distinct from estate game tables. */
export function coastalBench(kit: SceneKit, x: number, z: number, base: number, shade = false, sideways = false) {
  const wood = kit.mat('#8b7357'), metal = kit.mat('#52615b', .65), pale = kit.mat('#c5c0ad');
  const box = (px: number, py: number, pz: number, w: number, h: number, d: number, m: THREE.Material, shadow = false) =>
    kit.box(sideways ? x + pz - z : px, py, sideways ? z - px + x : pz, sideways ? d : w, h, sideways ? w : d, m, kit.scene, shadow);
  const obstacle = (px: number, pz: number, w: number, d: number, minY: number, maxY: number) => {
    if (sideways) { const old = px; px = x + pz - z; pz = z - old + x; [w,d] = [d,w]; }
    const o = { minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2, minY, maxY };
    kit.obstacles.push(o); kit.scene.userData.traversalObstacles ??= []; kit.scene.userData.traversalObstacles.push(o);
  };
  for (const dz of [-.22, 0, .22]) box(x, base + .51, z + dz, 3.6, .10, .18, wood, true);
  for (const dx of [-1.25, 1.25]) {
    box(x + dx, base + .23, z, .16, .46, .6, metal);
    box(x + dx, base + .65, z - .29, .14, 1.1, .12, metal);
  }
  for (const dy of [.79, 1.02]) box(x, base + dy, z - .30, 3.6, .16, .10, wood);
  obstacle(x, z, 3.6, .65, base, base + 1.10);
  if (shade) {
    for (const dx of [-2.6, 2.6]) {
      box(x + dx, base + 1.5, z - 1.1, .22, 3, .22, metal);
      obstacle(x + dx, z - 1.1, .22, .22, base, base + 3);
    }
    for (let dx = -2.7; dx <= 2.7; dx += .45) box(x + dx, base + 3.1, z, .16, .15, 3.2, pale, true);
    box(x, base + 2.99, z - 1.1, 5.6, .16, .16, metal);
  }
}
