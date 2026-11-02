import * as THREE from 'three';
import type { RegionBounds } from './region-collision';
import type { RegionId } from './region-ids';
import type { RegionWorld } from './regions';
import { WORLD_GATEWAYS } from './world-zones';
import { RAIL_ROUTES, type RailDistrict } from './rail-routes';

export type BoundarySide = 'west' | 'east' | 'north' | 'south';
type BoundaryStyle = 'city' | 'estate' | 'heritage' | 'forest' | 'industrial';
interface BoundaryProfile { style: BoundaryStyle; open?: readonly BoundarySide[]; coast?: Partial<Record<BoundarySide, readonly [number, number]>> }
/** Authored scenery policy, not a claim about the real district's geographical border. */
export const BOUNDARY_PROFILES: Record<RegionId, BoundaryProfile> = {
  'marina-bay': { style: 'city' }, 'raffles-place': { style: 'city', open: ['north'] },
  queenstown: { style: 'estate' }, chinatown: { style: 'heritage' }, 'kampong-glam': { style: 'heritage' },
  'jurong-lake': { style: 'forest' }, changi: { style: 'industrial' }, 'upper-thomson': { style: 'forest' },
  punggol: { style: 'estate', coast: { south: [185, 255] } },
  harbourfront: { style: 'forest', open: ['south'] }, sentosa: { style: 'forest', open: ['north', 'south'] },
  geylang: { style: 'heritage' }, tuas: { style: 'industrial', open: ['west'] },
  woodlands: { style: 'estate', open: ['north'] }, tampines: { style: 'estate' }, 'toa-payoh': { style: 'estate' },
  'bukit-timah': { style: 'forest' }, bishan: { style: 'estate' }, orchard: { style: 'city' },
  yishun: { style: 'estate' }, 'little-india': { style: 'heritage' }, 'katong-joo-chiat': { style: 'heritage' },
  'pulau-ubin': { style: 'forest', open: ['west', 'east', 'north', 'south'] },
};
export const BOUNDARY_SIDES: readonly BoundarySide[] = ['west', 'east', 'north', 'south'];
export function boundaryFrame(bounds: RegionBounds, side: BoundarySide) {
  const axis = side === 'west' || side === 'east' ? 'x' : 'z';
  const direction = side === 'west' || side === 'north' ? -1 : 1;
  const fixed = axis === 'x' ? direction < 0 ? bounds.minX : bounds.maxX : direction < 0 ? bounds.minZ : bounds.maxZ;
  const min = axis === 'x' ? bounds.minZ : bounds.minX, max = axis === 'x' ? bounds.maxZ : bounds.maxX;
  return { axis, direction, fixed, min, max } as const;
}
export function boundaryOpenings(id: RegionId, bounds: RegionBounds, side: BoundarySide) {
  const frame = boundaryFrame(bounds, side), openings: { min: number; max: number; kind: 'crossing' | 'coast'; name: string }[] = [];
  const coast = BOUNDARY_PROFILES[id].coast?.[side];
  if (coast) openings.push({ min: coast[0], max: coast[1], kind: 'coast', name: 'Waterfront' });
  for (const gateway of WORLD_GATEWAYS.filter(g => g.from === id && g.kind !== 'ferry')) {
    const nearest = BOUNDARY_SIDES.reduce((a, b) => {
      const fa = boundaryFrame(bounds, a), fb = boundaryFrame(bounds, b);
      return Math.abs(gateway.position[fa.axis] - fa.fixed) <= Math.abs(gateway.position[fb.axis] - fb.fixed) ? a : b;
    });
    if (nearest !== side || Math.abs(gateway.position[frame.axis] - frame.fixed) > 75) continue;
    const center = frame.axis === 'x' ? gateway.position.z : gateway.position.x, width = Math.max(15, (gateway.border?.halfWidth ?? 0) + 8);
    openings.push({ min: center - width, max: center + width, kind: 'crossing', name: gateway.name });
  }
  const merged: typeof openings = [];
  for (const opening of openings.sort((a, b) => a.min - b.min)) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === opening.kind && opening.min <= previous.max + 6) {
      previous.max = Math.max(previous.max, opening.max); previous.name += ` / ${opening.name}`;
    } else merged.push({ ...opening });
  }
  return merged;
}
const palettes = {
  city: { ground: '#8b9383', wall: '#b1b3aa', buildings: ['#637e8b', '#829499', '#a3aaa5'], foliage: '#456541' },
  estate: { ground: '#7d946b', wall: '#b2b7a8', buildings: ['#b1bbad', '#a5b5b5', '#c1b5a6'], foliage: '#42653b' },
  heritage: { ground: '#9a9b83', wall: '#b3a78b', buildings: ['#b6a38c', '#acb6a2', '#b49b8e'], foliage: '#4f6b43' },
  forest: { ground: '#6e855b', wall: '#767b61', buildings: ['#647f50', '#476b43', '#839165'], foliage: '#3e633b' },
  industrial: { ground: '#94978a', wall: '#a8ada5', buildings: ['#8c9b9d', '#a5aaa3', '#788e91'], foliage: '#566e49' },
};
const hash = (n: number) => { const v = Math.sin(n * 127.1 + 41.7) * 43758.5453; return v - Math.floor(v); };

/** A readable foreground limit plus layered scenery out to fog, outside playable ground.
 * The existing bounds remain the movement boundary; travel gaps retain their full width. */
export function withDistrictBoundaries<T extends RegionWorld>(id: RegionId, world: T, bounds: RegionBounds): T {
  const profile = BOUNDARY_PROFILES[id], palette = palettes[profile.style];
  const root = new THREE.Group(); root.name = 'district-boundaries'; world.scene.add(root);
  const geometry = new THREE.BoxGeometry(1, 1, 1), canopy = new THREE.IcosahedronGeometry(1, 1);
  const materials: THREE.Material[] = [], extra: THREE.BufferGeometry[] = [];
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .9 }); materials.push(m); return m; };
  const wall = material(palette.wall), groundMaterial = material(palette.ground), dark = material('#45534e');
  const green = material(palette.foliage), bark = material('#766653'), paint = material('#9ba58c');
  const facades = palette.buildings.map(material), windows = material(profile.style === 'heritage' ? '#536d67' : '#56717b');
  const boxes = new Map<string, { material: THREE.Material; solid: boolean; transforms: THREE.Matrix4[] }>(), crowns: THREE.Matrix4[] = [];
  const ground = (x: number, z: number) => bounds.groundHeight?.(Math.max(bounds.minX, Math.min(bounds.maxX, x)), Math.max(bounds.minZ, Math.min(bounds.maxZ, z))) ?? 0;
  const matrix = (x: number, y: number, z: number, w: number, h: number, d: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, solid = true) => {
    const key = `${m.uuid}/${solid}`, batch = boxes.get(key) ?? { material: m, solid, transforms: [] };
    batch.transforms.push(matrix(x, y, z, w, h, d)); boxes.set(key, batch);
  };
  const metadata: { side: BoundarySide; min: number; max: number; kind: string }[] = [];
  const horizon = world.scene.fog instanceof THREE.Fog ? world.scene.fog.far + 100 : 1100;
  for (const side of BOUNDARY_SIDES) {
    if (profile.open?.includes(side)) continue;
    const { axis, direction, fixed, min, max } = boundaryFrame(bounds, side), openings = boundaryOpenings(id, bounds, side);
    const at = (s: number, out: number) => ({ x: axis === 'x' ? fixed + direction * out : s, z: axis === 'z' ? fixed + direction * out : s });
    const centerAlong = (min + max) / 2, radius = (axis === 'x' ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ) / 2;
    const groundOutside = (s: number, out: number) => {
      const sample = at(centerAlong + (s - centerAlong) / (1 + out / radius), 0), inner = ground(sample.x, sample.z) - .06;
      return inner + (-3 - inner) * out / horizon - .12;
    };
    const strip = (s: number, out: number, y: number, length: number, height: number, depth: number, m: THREE.Material, solid = true) => {
      const p = at(s, out); box(p.x, y, p.z, axis === 'x' ? depth : length, height, axis === 'z' ? depth : length, m, solid);
    };
    const spans: [number, number][] = [];
    let cursor = min;
    for (const gap of [...openings].sort((a, b) => a.min - b.min)) {
      if (gap.min > cursor) spans.push([cursor, Math.min(max, gap.min)]);
      cursor = Math.max(cursor, gap.max);
    }
    if (cursor < max) spans.push([cursor, max]);
    for (const [lo, hi] of spans) {
      const count = Math.ceil((hi - lo) / 22);
      for (let i = 0; i < count; i++) {
        const a = lo + (hi - lo) * i / count, b = lo + (hi - lo) * (i + 1) / count, s = (a + b) / 2, length = b - a;
        const p = at(s, 0), pa = at(a, 0), pb = at(b, 0), base = ground(p.x, p.z), seed = s + fixed * 7, r = hash(seed);
        const low = Math.min(base, ground(pa.x, pa.z), ground(pb.x, pb.z)) - .2, high = Math.max(base, ground(pa.x, pa.z), ground(pb.x, pb.z));
        const height = profile.style === 'forest' ? 4.8 + r * 2.8 : profile.style === 'industrial' ? 1.1 : 3.2;
        // The inner face meets the clamp plane; its entire volume lies outside play.
        strip(s, 1.3, (low + high + height) / 2, length, high + height - low, 2.6, wall);
        if (profile.style === 'industrial') {
          strip(s, .85, base + 3.6, length, .18, .18, dark);
          for (let u = a + .6; u < b; u += 1.25) strip(u, .9, base + 2.4, .09, 3.7, .12, dark);
        } else if (profile.style !== 'heritage') {
          strip(s, 1.8, high + height + .3, length, .8, 2.6, green);
        } else {
          strip(s, 1.3, high + height + .1, length, .2, 2.9, paint);
        }
        metadata.push({ side, min: a, max: b, kind: profile.style });
        // Layered silhouettes retain parallax; larger distant forms blend into existing fog.
        for (let layer = 0; layer < 3; layer++) {
          const shore = profile.coast?.[side];
          if (shore && s > shore[0] - 32 && s < shore[1] + 32) continue;
          const out = 17 + layer * 65 + r * 12, h = profile.style === 'forest' ? 10 + r * 12 + layer * 2
            : profile.style === 'heritage' ? 7 + r * 7 + layer * 3 : profile.style === 'industrial' ? 12 + r * 14 : 19 + r * 35 + layer * 12;
          const q = at(s + (layer % 2 ? 5 : -3), out), y = groundOutside(s, out);
          if (profile.style === 'forest') {
            box(q.x, y + h / 2, q.z, .9, h, .9, bark, false);
            crowns.push(matrix(q.x, y + h, q.z, length * .85, h * .55, 14 + layer * 3));
          } else {
            const width = length - 2, depth = 16 + layer * 5;
            strip(s, out, y + h / 2, width, h, depth, facades[(i + layer) % facades.length], false);
            strip(s, out, y + h + .25, width + .8, .5, depth + .8, wall, false);
            if (layer === 0) for (let floor = 4; floor < h - 1; floor += 3.6) {
              strip(s, out - depth / 2 - .08, y + floor, width - 2.5, 1.15, .12, windows, false);
              // Break long window ribbons into recognisable service facades.
              for (const offset of [-width / 4, width / 4]) strip(s + offset, out - depth / 2 - .18, y + floor, .45, 1.5, .15, wall, false);
            }
          }
        }
      }
    }
    // A ground skirt starts at the physical boundary, then falls away inside full fog.
    // Radially expanded outside corners meet the neighbouring side's skirt exactly.
    const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
    const vertices: number[] = [], waterVertices: number[] = [];
    const skirt = (a: number, b: number, water = false) => {
      const pa = at(a, .015), pb = at(b, .015), scale = 1 + horizon / Math.max(1, Math.abs(fixed - center[axis]));
      const oa = { x: center.x + (pa.x - center.x) * scale, z: center.z + (pa.z - center.z) * scale }, ob = { x: center.x + (pb.x - center.x) * scale, z: center.z + (pb.z - center.z) * scale };
      const ya = water ? -.12 : ground(pa.x, pa.z) - .06, yb = water ? -.12 : ground(pb.x, pb.z) - .06;
      const points = [[pa.x, ya, pa.z], [pb.x, yb, pb.z], [ob.x, water ? -.12 : -3, ob.z], [oa.x, water ? -.12 : -3, oa.z]];
      const order = (side === 'west' || side === 'south') ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const n of order) (water ? waterVertices : vertices).push(...points[n]);
    };
    const coast = profile.coast?.[side];
    for (let a = min; a < max; a += 22) {
      const b = Math.min(max, a + 22);
      if (coast && a < coast[1] && b > coast[0]) {
        if (a < coast[0]) skirt(a, coast[0]);
        skirt(Math.max(a, coast[0]), Math.min(b, coast[1]), true);
        if (b > coast[1]) skirt(coast[1], b);
      } else skirt(a, b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals(); extra.push(g);
    const apron = new THREE.Mesh(g, groundMaterial); apron.name = `boundary-ground-${side}`; apron.raycast = () => {}; apron.userData.fpsEffect = true; root.add(apron);
    if (waterVertices.length) {
      let source: THREE.Material | undefined;
      world.scene.traverse(object => { if (object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.userData.fpsWater) source ??= object.material; });
      const sea = source?.clone() ?? material('#5892a0'); if (source) materials.push(sea);
      sea.userData.fpsWater = true;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(waterVertices, 3)); g.computeVertexNormals(); extra.push(g);
      const mesh = new THREE.Mesh(g, sea); mesh.name = `boundary-water-${side}`; mesh.raycast = () => {}; mesh.userData.fpsEffect = true; root.add(mesh);
    }
    // Existing checkpoint gaps lead to a short service road turning behind the screen.
    for (const gap of openings.filter(g => g.kind === 'crossing')) {
      const s = (gap.min + gap.max) / 2, p = at(s, 0), y = ground(p.x, p.z);
      const ribbon = (center: number, out: number, width: number, depth: number) => {
        const vertices: number[] = [], corners = [[center - width / 2, out - depth / 2], [center + width / 2, out - depth / 2], [center + width / 2, out + depth / 2], [center - width / 2, out + depth / 2]];
        const order = side === 'west' || side === 'south' ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const i of order) { const [u, v] = corners[i], p = at(u, v); vertices.push(p.x, groundOutside(u, v) + .15, p.z); }
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals(); extra.push(geometry);
        const mesh = new THREE.Mesh(geometry, dark); mesh.raycast = () => {}; mesh.userData.fpsEffect = true; root.add(mesh);
      };
      ribbon(s, 18, 14, 36); ribbon(s + 17, 33, 48, 14);
      strip(s, 54, y + 5, gap.max - gap.min + 4, 10, 8, facades[0]);
      metadata.push({ side, min: gap.min, max: gap.max, kind: 'crossing' });
    }
  }
  // Covered turnback yards make the existing finite rail termini part of the edge scenery.
  // Full train motion and its supported track extents remain shared with rail-routes.ts.
  const rail = RAIL_ROUTES[id as RailDistrict];
  if (rail) for (const [end, sign] of [[rail.min, -1], [rail.max, 1]] as const) {
    const s = end - sign * 8, length = 24, half = rail.halfWidth + .9, y = rail.railY;
    const place = (u: number, c: number, h: number, l: number, d: number, height: number, m: THREE.Material) => box(rail.axis === 'x' ? u : c, h, rail.axis === 'z' ? u : c, rail.axis === 'x' ? l : d, height, rail.axis === 'z' ? l : d, m);
    place(s, rail.cross, y + 6.4, length, half * 2 + .8, .6, wall);
    for (const side of [-1, 1]) {
      place(s, rail.cross + side * half, y + 3, length, .35, 6, facades[1]);
      for (let u = s - length / 2 + 1; u < s + length / 2; u += 3) place(u, rail.cross + side * (half + .2), y + 3.8, .18, .2, 3.4, dark);
    }
    place(end + sign * 3.5, rail.cross, y + 3, .5, half * 2, 6, dark);
  }
  for (const { material: m, solid, transforms } of boxes.values()) {
    const mesh = new THREE.InstancedMesh(geometry, m, transforms.length);
    if (!solid) { mesh.raycast = () => {}; mesh.userData.fpsEffect = true; }
    transforms.forEach((transform, i) => mesh.setMatrixAt(i, transform)); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh);
  }
  if (crowns.length) {
    const mesh = new THREE.InstancedMesh(canopy, green, crowns.length); crowns.forEach((transform, i) => mesh.setMatrixAt(i, transform)); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.raycast = () => {}; mesh.userData.fpsEffect = true; root.add(mesh);
  }
  root.traverse(object => { object.userData.coverMetricIgnore = true; object.userData.boundaryScenery = true; object.userData.noShadowCast = true; });
  root.userData.segments = metadata;
  world.scene.userData.boundaryDesign = { style: profile.style, openSides: profile.open ?? [], coast: profile.coast ?? {}, authored: true };
  const dispose = world.dispose.bind(world);
  return { ...world, dispose() { root.removeFromParent(); geometry.dispose(); canopy.dispose(); extra.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); dispose(); } };
}
