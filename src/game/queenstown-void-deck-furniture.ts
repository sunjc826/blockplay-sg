import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { accelerateMeshRaycast } from './mesh-raycast';
import { QUEENSTOWN_HDB_BLOCKS } from './queenstown-housing-layout';
import { queenstownTerrainHeight } from './queenstown-terrain';
import type { Obstacle } from './region-collision';
import type { TraversalObstacle } from './vertical-routes';

type Finish = 'granite' | 'jade' | 'terracotta';
type Board = 'plain' | 'xiangqi' | 'checkers';
export interface DeckTable {
  block: string; x: number; y: number; z: number;
  finish: Finish; board: Board; seating: 'stools' | 'curved'; seats: number;
}
// Small social pockets occupy the rear bays; the middle and front stay open.
// These are photo-informed arrangements, not surveyed furniture locations.
export const QUEENSTOWN_DECK_TABLES: DeckTable[] = QUEENSTOWN_HDB_BLOCKS.flatMap((b, i) => {
  const y = queenstownTerrainHeight(b.x, b.z);
  return [
    { block: b.id, x: b.x - 19 + (i % 2) * .5, y, z: b.z - 4.2,
      finish: (['jade', 'granite', 'terracotta'] as const)[i % 3],
      board: i === 0 || i === 3 ? 'xiangqi' : 'plain',
      seating: i % 3 === 1 ? 'stools' : 'curved', seats: 6 },
    { block: b.id, x: b.x + 6.3, y, z: b.z - 4.1,
      finish: i % 2 ? 'terracotta' : 'granite',
      board: i === 1 || i === 4 ? 'checkers' : 'plain', seating: 'stools', seats: i % 2 ? 4 : 6 },
  ];
});
export const QUEENSTOWN_DECK_BENCHES = QUEENSTOWN_HDB_BLOCKS.flatMap((b, i) =>
  [-9, 6.5].map((dx, j) => ({ x: b.x + dx, y: queenstownTerrainHeight(b.x, b.z), z: b.z + 7,
    finish: (i + j) % 2 ? 'jade' as const : 'granite' as const, back: (i + j) % 3 !== 0 })));

const finishes = { granite: '#aaaead', jade: '#527f80', terracotta: '#a96955' };

/** A baked finish on the actual tabletop cap: no overlapping board decal. */
function surfaceTexture(finish: Finish, board: Board, top: boolean) {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  const color = new THREE.Color(finishes[finish]).convertLinearToSRGB();
  const lines: [number, number, number, number][] = [];
  if (board === 'xiangqi') {
    const left = 68, north = 60, step = 15;
    for (let row = 0; row < 10; row++) lines.push([left, north + row * step, left + 8 * step, north + row * step]);
    for (let col = 0; col < 9; col++) {
      const x = left + col * step;
      if (col === 0 || col === 8) lines.push([x, north, x, north + 9 * step]);
      else { lines.push([x, north, x, north + 4 * step]); lines.push([x, north + 5 * step, x, north + 9 * step]); }
    }
    for (const row of [0, 7]) {
      lines.push([left + 3 * step, north + row * step, left + 5 * step, north + (row + 2) * step]);
      lines.push([left + 5 * step, north + row * step, left + 3 * step, north + (row + 2) * step]);
    }
  }
  const nearLine = (x: number, y: number) => lines.some(([ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) < .75;
  });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = ((Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263)) >>> 0) % 101;
    const tiled = finish !== 'granite', tile = top ? 24 : 32;
    const grout = tiled && (x % tile < 1.5 || y % tile < 1.5);
    const variation = tiled ? ((Math.floor(x / tile) * 7 + Math.floor(y / tile) * 11) % 9 - 4) * .012 : (n - 50) * .002;
    let rgb = [color.r, color.g, color.b].map(c => Math.min(1, Math.max(0, c + variation)));
    if (grout) rgb = [.79, .78, .71];
    if (top && board !== 'plain' && x >= 62 && x <= 194 && y >= 53 && y <= 203) {
      rgb = [.80 + n * .0005, .81 + n * .0004, .75 + n * .0005];
      if (board === 'checkers' && x >= 64 && x < 192 && y >= 64 && y < 192) {
        const dark = (Math.floor((x - 64) / 16) + Math.floor((y - 64) / 16)) % 2;
        rgb = dark ? [.34, .41, .39] : [.88, .87, .80];
      }
      if (board === 'xiangqi' && nearLine(x, y)) rgb = [.40, .20, .16];
    }
    const p = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(rgb[c] * 255);
    pixels[p + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

export function addQueenstownVoidDeckFurniture(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'Queenstown communal stone furniture';
  const obstacles: Obstacle[] = [], traversal: TraversalObstacle[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>(), textures: THREE.Texture[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const partBounds = new Map<THREE.Material, THREE.Box3[]>();
  const rendered: THREE.BufferGeometry[] = [];
  const raycastDisposers: (() => void)[] = [];
  const material = (finish: Finish, board: Board = 'plain', top = false) => {
    const key = `${finish}/${board}/${top}`;
    let m = materials.get(key);
    if (!m) {
      const map = surfaceTexture(finish, board, top); textures.push(map);
      m = new THREE.MeshStandardMaterial({ map, roughness: finish === 'granite' ? .76 : .58 });
      materials.set(key, m);
    }
    return m;
  };
  const piece = (g: THREE.BufferGeometry, m: THREE.Material) => {
    // Merge only equal-material pieces; retain real curved silhouettes and caps.
    const list = batches.get(m) ?? [];
    g.computeBoundingBox();
    const bounds = partBounds.get(m) ?? []; bounds.push(g.boundingBox!.clone()); partBounds.set(m, bounds);
    list.push(g.index ? g.toNonIndexed() : g); batches.set(m, list);
    if (g.index) g.dispose();
  };
  const collider = (points: { x: number; z: number }[], minY: number, maxY: number) => {
    const bounds = { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
      minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)), footprint: points, minY, maxY };
    traversal.push(bounds); obstacles.push(bounds);
  };
  const cylinder = (x: number, y: number, z: number, radius: number, height: number, finish: Finish, board: Board = 'plain') => {
    const g = new THREE.CylinderGeometry(radius, radius, height, 24);
    // Cylinder side and cap UVs need different finishes; split its existing groups.
    for (const group of g.groups) {
      const part = new THREE.BufferGeometry();
      const full = g.toNonIndexed();
      for (const name of ['position', 'normal', 'uv']) {
        const a = full.getAttribute(name);
        const values = Array.from(a.array).slice(group.start * a.itemSize, (group.start + group.count) * a.itemSize);
        if (name === 'uv' && group.materialIndex === 0) {
          // Side tiles keep their physical proportions on both thin table rims
          // and taller pedestals instead of stretching into horizontal stripes.
          for (let i = 0; i < values.length; i += 2) { values[i] *= Math.PI * 2 * radius; values[i + 1] *= height; }
        }
        part.setAttribute(name, new THREE.Float32BufferAttribute(values, a.itemSize));
      }
      full.dispose(); part.translate(x, y, z);
      piece(part, material(finish, group.materialIndex === 1 ? board : 'plain', group.materialIndex === 1));
    }
    g.dispose();
    const points = Array.from({ length: 24 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 12) * radius, z: z + Math.sin(i * Math.PI / 12) * radius }));
    collider(points, y - height / 2, y + height / 2);
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, finish: Finish) => {
    piece(new THREE.BoxGeometry(w, h, d).translate(x, y, z), material(finish));
    collider([{ x: x - w / 2, z: z - d / 2 }, { x: x + w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z + d / 2 }, { x: x - w / 2, z: z + d / 2 }], y - h / 2, y + h / 2);
  };
  const arc = (t: DeckTable, inner: number, outer: number, bottom: number, height: number, start: number, end: number) => {
    // Convex segments give the curved seats matching collision without filling
    // the open approach or the space between the table and bench.
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a = start + (end - start) * i / steps, b = start + (end - start) * (i + 1) / steps;
      const points = [[inner, a], [outer, a], [outer, b], [inner, b]].map(([r, angle]) => ({ x: t.x + r * Math.cos(angle), z: t.z + r * Math.sin(angle) }));
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, t.y + bottom, 0);
      piece(g, material(t.finish)); collider(points, t.y + bottom, t.y + bottom + height);
    }
  };
  for (const t of QUEENSTOWN_DECK_TABLES) {
    cylinder(t.x, t.y + .365, t.z, .25, .73, t.finish);
    cylinder(t.x, t.y + .79, t.z, .88, .12, t.finish, t.board);
    if (t.seating === 'stools') {
      for (let i = 0; i < t.seats; i++) {
        const a = i * Math.PI * 2 / t.seats + Math.PI / 6;
        const x = t.x + Math.cos(a) * 1.48, z = t.z + Math.sin(a) * 1.48;
        cylinder(x, t.y + .235, z, .29, .47, t.finish);
        cylinder(x, t.y + .49, z, .33, .04, t.finish);
      }
    } else {
      for (const side of [0, Math.PI]) {
        const start = side - Math.PI / 3, end = side + Math.PI / 3;
        arc(t, 1.20, 1.83, .46, .14, start, end);
        arc(t, 1.71, 1.86, .60, .46, start, end);
        for (const a of [start + .22, side, end - .22]) {
          cylinder(t.x + Math.cos(a) * 1.53, t.y + .23, t.z + Math.sin(a) * 1.53, .13, .46, t.finish);
        }
      }
    }
  }
  for (const b of QUEENSTOWN_DECK_BENCHES) {
    box(b.x, b.y + .49, b.z, 3.2, .16, .65, b.finish);
    for (const dx of [-1.15, 1.15]) box(b.x + dx, b.y + .205, b.z, .22, .41, .54, b.finish);
    if (b.back) box(b.x, b.y + .83, b.z + .27, 3.2, .52, .13, b.finish);
  }
  for (const [m, pieces] of batches) {
    const merged = mergeGeometries(pieces); pieces.forEach(g => g.dispose());
    if (!merged) throw new Error('Incompatible void-deck furniture geometry');
    rendered.push(merged);
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = mesh.receiveShadow = true;
    // The draw batch spans six blocks. Flight uses the original piece volumes,
    // so batching cannot turn the gaps between blocks into invisible walls.
    mesh.userData.flightBounds = partBounds.get(m);
    // A finish batch spans six blocks: its bounding sphere admits street rays
    // nowhere near a table. Test only nearby triangles, retaining exact hits.
    raycastDisposers.push(accelerateMeshRaycast(mesh));
    root.add(mesh);
  }
  scene.add(root);
  scene.userData.traversalObstacles = [...(scene.userData.traversalObstacles ?? []), ...traversal];
  scene.userData.voidDeckFurniture = { tables: QUEENSTOWN_DECK_TABLES.length, boards: QUEENSTOWN_DECK_TABLES.filter(t => t.board !== 'plain').length,
    standaloneBenches: QUEENSTOWN_DECK_BENCHES.length, sources: ['https://thelionraw.wordpress.com/2013/06/20/communal-chinese-chess-tables/',
      'https://www.frankie.com.au/gallery/symmetrical-snaps-from-singapores-public-housing-blocks-565513'], surveyedLocations: false };
  return { obstacles, dispose() { root.removeFromParent(); raycastDisposers.forEach(dispose => dispose()); rendered.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); } };
}
