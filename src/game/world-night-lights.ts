import * as THREE from 'three';
import { nightFacadeAttributes } from './night-facades';
import type { Obstacle, RegionBounds } from './region-collision';
import { footprintRayInterval } from './region-collision';
import type { RegionRoad } from './regions';
import type { LightingState } from './world-lighting';
import { getTraversalObstacles, getWalkSurfaces, surfaceHeight, type WalkSurface } from './vertical-routes';
import { createMovingLights, movingLightsChunk, MOVING_LIGHTS_DECLARATIONS, type LightSource } from './moving-lights';

/**
 * The city's own light after sunset, for every district without authoring
 * any: streetlamps stood along the district's map roads, the pools they throw
 * baked into one top-down light map that every lit material samples, and lit
 * windows on the faces of anything building-sized. All of it fades in as the
 * sun nears the horizon and stays dark by day, so daylight looks as authored.
 *
 * No real lights are added: the pools are a texture lookup per fragment, so
 * hundreds of lamps cost the same as one and no shader recompiles at dusk.
 */

/** Metres between lamps along a road, alternating sides. */
export const LAMP_SPACING = 30;
/** Metres a lamp's pool reaches on the ground. */
export const LAMP_REACH = 15;
export const LAMP_HEIGHT = 7.5;
/** Park and plaza lamps: shorter, sparser, smaller pools, no arm. */
export const PATH_LAMP = { spacing: 52, height: 4.2, reach: 8.5 } as const;
const ARM = 1.7, MAX_LAMPS = 700;
/** Light-map cell, metres. */
const CELL = 1.25, MAX_MAP = 1024;
/** Height of the ground under each light-map texel is stored in [-10, 50] m. */
const HEIGHT_LOW = -10, HEIGHT_RANGE = 60;

export interface StreetLamp {
  x: number; z: number; y: number;
  /** Unit vector from the pole towards the road, along the arm; zero for a path lamp, which has none. */
  dx: number; dz: number;
  height: number; reach: number;
}

/** 0 by day, 1 once the sun is a couple of degrees under: streetlamps in Singapore come on a little before sunset. */
export function nightLevel(elevation: number) {
  const t = Math.max(0, Math.min(1, (12 - elevation) / 14));
  return t * t * (3 - 2 * t);
}

const roadSegments = (roads: readonly RegionRoad[]) => roads.flatMap(road => road.points.slice(1).map((p, i) => [road.points[i].x, road.points[i].z, p.x, p.z] as const));
/** Buckets keep the footprint test local; districts carry thousands of colliders. */
function footprints(obstacles: readonly Obstacle[]) {
  const cell = 16, grid = new Map<string, Obstacle[]>();
  for (const o of obstacles) for (let gx = Math.floor((o.minX - 3) / cell); gx <= Math.floor((o.maxX + 3) / cell); gx++)
    for (let gz = Math.floor((o.minZ - 3) / cell); gz <= Math.floor((o.maxZ + 3) / cell); gz++) {
      const key = `${gx},${gz}`, bucket = grid.get(key); if (bucket) bucket.push(o); else grid.set(key, [o]);
    }
  return (x: number, z: number, margin: number) => (grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? [])
    .some(o => x > o.minX - margin && x < o.maxX + margin && z > o.minZ - margin && z < o.maxZ + margin);
}
const segmentDistance = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l)) : 0;
  return Math.hypot(x - ax - vx * t, z - az - vz * t);
};

/**
 * Lamps along each road's polyline, on alternate kerbs, standing clear of
 * every footprint, every other carriageway and each other. Pure, so the
 * placement is testable without a scene.
 */
export function placeStreetLamps(roads: readonly RegionRoad[], roadWidth: number, obstacles: readonly Obstacle[], bounds: RegionBounds,
  options: { spacing?: number; ground?: (x: number, z: number) => number | null } = {}): StreetLamp[] {
  const spacing = options.spacing ?? LAMP_SPACING, offset = roadWidth / 2 + 1.4, lamps: StreetLamp[] = [];
  const segments = roadSegments(roads), blocked = footprints(obstacles);
  let side = 1;
  for (const road of roads) {
    let carry = spacing / 2;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 1e-3) continue;
      const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
      for (let s = carry; s < length; s += spacing) {
        side = -side;
        if (lamps.length >= MAX_LAMPS) return lamps;
        const nx = -uz * side, nz = ux * side;
        const x = a.x + ux * s + nx * offset, z = a.z + uz * s + nz * offset;
        if (x < bounds.minX + 2 || x > bounds.maxX - 2 || z < bounds.minZ + 2 || z > bounds.maxZ - 2) continue;
        if (blocked(x, z, .9) || segments.some(([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz) < roadWidth / 2 + .6)) continue;
        if (lamps.some(l => Math.hypot(l.x - x, l.z - z) < spacing * .45)) continue;
        const y = options.ground ? options.ground(x, z) : 0;
        if (y === null) continue;
        lamps.push({ x, z, y, dx: -nx, dz: -nz, height: LAMP_HEIGHT, reach: LAMP_REACH });
      }
      carry = ((carry - length) % spacing + spacing) % spacing;
    }
  }
  return lamps;
}

/**
 * Plazas, parks and courtyards get sparse short lamps with gaps of moonlit
 * ground between them, instead of a blanket of overlapping light.
 */
export function placePathLamps(existing: readonly StreetLamp[], roads: readonly RegionRoad[], roadWidth: number, obstacles: readonly Obstacle[], bounds: RegionBounds,
  options: { ground?: (x: number, z: number) => number | null } = {}): StreetLamp[] {
  const { spacing, height, reach } = PATH_LAMP, segments = roadSegments(roads), blocked = footprints(obstacles);
  const placed = [...existing], lamps: StreetLamp[] = [];
  const jitter = (i: number, j: number, salt: number) => { const n = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453; return (n - Math.floor(n) - .5) * spacing * .5; };
  for (let i = 0, x0 = bounds.minX + spacing / 2; x0 < bounds.maxX; i++, x0 += spacing)
    for (let j = 0, z0 = bounds.minZ + spacing / 2; z0 < bounds.maxZ; j++, z0 += spacing) {
      if (placed.length >= MAX_LAMPS) return lamps;
      const x = x0 + jitter(i, j, 1), z = z0 + jitter(i, j, 2);
      if (x < bounds.minX + 6 || x > bounds.maxX - 6 || z < bounds.minZ + 6 || z > bounds.maxZ - 6) continue;
      if (blocked(x, z, 2.5) || segments.some(([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz) < roadWidth / 2 + 1.5)) continue;
      if (placed.some(l => Math.hypot(l.x - x, l.z - z) < (l.reach + reach) * .85)) continue;
      const y = options.ground ? options.ground(x, z) : 0;
      if (y === null) continue;
      const lamp = { x, z, y, dx: 0, dz: 0, height, reach };
      lamps.push(lamp); placed.push(lamp);
    }
  return lamps;
}

type LampBlocker = Obstacle & { minY?: number };
/** Clips the lamp-to-ground segment against solid walls, decks and authored convex footprints. Bake time only. */
function blocksLamp(o: LampBlocker, cx: number, cy: number, cz: number, x: number, y: number, z: number) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  let near = .001, far = .999;
  if (Math.abs(dx) < 1e-8) { if (cx < o.minX || cx > o.maxX) return false; }
  else { const a = (o.minX - cx) / dx, b = (o.maxX - cx) / dx; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  if (Math.abs(dz) < 1e-8) { if (cz < o.minZ || cz > o.maxZ) return false; }
  else { const a = (o.minZ - cz) / dz, b = (o.maxZ - cz) / dz; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  // Every sample lies below its lamp head, so dy is negative.
  near = Math.max(near, ((o.maxY ?? 12) - cy) / dy);
  far = Math.min(far, ((o.minY ?? -Infinity) - cy) / dy);
  if (near > far) return false;
  if (o.footprint) [near, far] = footprintRayInterval(o.footprint, { x: cx, z: cz }, { x: dx, z: dz }, near, far);
  return near <= far;
}

/** Top-down lamp light, one texel per `CELL`: R is the visible pools' brightness, G their ground height. */
export function bakeLampMap(lamps: readonly StreetLamp[], bounds: RegionBounds, obstacles: readonly LampBlocker[] = []) {
  const width = Math.max(1, Math.min(MAX_MAP, Math.ceil((bounds.maxX - bounds.minX) / CELL)));
  const height = Math.max(1, Math.min(MAX_MAP, Math.ceil((bounds.maxZ - bounds.minZ) / CELL)));
  const sx = width / (bounds.maxX - bounds.minX), sz = height / (bounds.maxZ - bounds.minZ);
  const light = new Float32Array(width * height), ground = new Float32Array(width * height);
  for (const lamp of lamps) {
    const cx = lamp.x + lamp.dx * ARM, cz = lamp.z + lamp.dz * ARM, reach = lamp.reach;
    const headY = lamp.y + lamp.height;
    const blockers = obstacles.filter(o => o.maxX >= cx - reach && o.minX <= cx + reach && o.maxZ >= cz - reach && o.minZ <= cz + reach
      && (o.maxY ?? 12) > lamp.y + .15 && (o.minY ?? -Infinity) < headY);
    const x0 = Math.max(0, Math.floor((cx - reach - bounds.minX) * sx)), x1 = Math.min(width - 1, Math.ceil((cx + reach - bounds.minX) * sx));
    const z0 = Math.max(0, Math.floor((cz - reach - bounds.minZ) * sz)), z1 = Math.min(height - 1, Math.ceil((cz + reach - bounds.minZ) * sz));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const x = bounds.minX + (i + .5) / sx, z = bounds.minZ + (j + .5) / sz;
      const d = Math.hypot(x - cx, z - cz) / reach;
      if (d >= 1) continue;
      if (blockers.some(o => blocksLamp(o, cx, headY, cz, x, lamp.y + .05, z))) continue;
      // A soft pool with a brighter hot spot under the head.
      const k = j * width + i, value = (1 - d * d) ** 2 * .75 + Math.exp(-d * d * 18) * .25;
      if (value > light[k] * .5) ground[k] = lamp.y;
      light[k] += value;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let k = 0; k < light.length; k++) {
    data[k * 4] = Math.round(Math.min(1, light[k]) * 255);
    data[k * 4 + 1] = Math.round(Math.max(0, Math.min(1, (ground[k] - HEIGHT_LOW) / HEIGHT_RANGE)) * 255);
    data[k * 4 + 3] = 255;
  }
  return { data, width, height, light, ground };
}

/** Windows start this far above a building's foot; the storey below it is the shopfront's. */
export const GROUND_STOREY = 2.6;
/**
 * The ground storey drawn on building-sized walls. Bays are the window columns above (about 3.1 m).
 * Widths are shares of a bay, heights metres above the foot. A facade narrower than `minFacade`, or a
 * building whose foot is more than `maxLift` above the ground under it (a tower on a podium, a block on
 * stilts), gets none.
 */
export const STOREFRONT = { minFacade: 6, maxLift: .9, blank: .17, door: .25, frontWidth: .8, doorWidth: .4, riser: .5, head: 2.2, plinth: .3 } as const;
/**
 * Interior mapping behind glass: rooms `depth` to `depth + depthRange` metres deep behind a wall `reveal`
 * metres thick (which shows as a frame round the opening), furnished and lit by one ceiling lamp; how much of a room's
 * colour a shopfront shows by day (the rest of the light is the street's), and how brightly lit shopfronts
 * and lit windows show their rooms at night.
 */
export const INTERIOR = { depth: 3.4, depthRange: 1.8, reveal: .18, dayShare: .85, nightShopfront: .38, nightWindow: .95 } as const;
/**
 * Where a view ray entering a room's glass at `p` (metres from its left wall and floor) first meets the room:
 * the surface and the distance. `d` is the direction along the facade, up and inwards. Mirrors `nightRoom`.
 */
export function interiorHit(p: [number, number], size: [number, number], d: [number, number, number], depth: number) {
  const dz = Math.max(d[2], .02);
  const x = d[0] > 0 ? (size[0] - p[0]) / d[0] : -p[0] / Math.min(d[0], -1e-4), y = d[1] > 0 ? (size[1] - p[1]) / d[1] : -p[1] / Math.min(d[1], -1e-4), z = depth / dz;
  const t = Math.min(x, y, z);
  return { t, surface: t === z ? 'back' as const : t === y ? d[1] > 0 ? 'ceiling' as const : 'floor' as const : 'side' as const, point: [p[0] + d[0] * t, p[1] + d[1] * t, dz * t] as [number, number, number] };
}
/** Rain streaks under the roof edge of building-sized walls: column width and lengths in metres, the share of columns streaked, and how much they darken. */
export const STREAKS = { width: .55, share: .5, shortest: 1.2, longest: 9, darken: .11 } as const;
/** How far down from the roof edge a streak with this seed runs, metres. Mirrors the GLSL. */
export const streakLength = (seed: number) => STREAKS.shortest + seed * seed * (STREAKS.longest - STREAKS.shortest);
/** What a bay holds for a seed in 0-1. Mirrors the GLSL. */
export function storefrontBay(seed: number): 'blank' | 'door' | 'shopfront' {
  return seed < STOREFRONT.blank ? 'blank' : seed <= STOREFRONT.blank + STOREFRONT.door ? 'door' : 'shopfront';
}
/** A box, prism or tower at least two storeys tall and a room deep: worth windows. */
export function buildingSized(box: THREE.Box3) {
  const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
  return h >= 7 && Math.min(w, d) >= 4.5 && Math.max(w, d) <= 260 && box.max.y >= 7;
}
const WINDOW_SHAPES = new Set(['BoxGeometry', 'ExtrudeGeometry', 'CylinderGeometry']);
const uprightAxis = new THREE.Vector3();
/**
 * Square to the ground, with one of its own axes plumb: a pitched roof slab is
 * tall enough to pass for a building, but its ends are no facades.
 */
export function upright(matrix: THREE.Matrix4) {
  return [0, 1, 2].some(column => Math.abs(uprightAxis.setFromMatrixColumn(matrix, column).normalize().y) > .995);
}
/** Groups whose contents are terrain, decks or windowless boundary scenery. */
const NO_WINDOWS = new Set(['Connected elevated places', 'Walkable elevated routes', 'district-boundaries']);

/**
 * Adds colour, and covers the sky behind it by its own brightness: the world
 * view composites the scene over a separately cleared sky, so plain additive
 * blending would leave dark fringes against it.
 */
const GLOW_BLENDING = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor } as const;

type Lit = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;
const lit = (m: THREE.Material): m is Lit => m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial;
/** Planting, water and glass panes keep their own look at night. */
function windowable(m: Lit) {
  if (m.transparent || m.userData.fpsWater) return false;
  const { r, g, b } = m.color;
  return !(g > r * 1.15 && g > b * 1.05);
}

export function createNightLights(scene: THREE.Scene, options: { roads: readonly RegionRoad[]; roadWidth: number; bounds: RegionBounds; obstacles: readonly Obstacle[] }) {
  const { bounds } = options;
  const surfaces = getWalkSurfaces(scene);
  scene.updateMatrixWorld(true);
  // Water and raised decks: a lamp is never stood in the bay or under a bridge.
  const water: THREE.Box3[] = [];
  scene.traverse(o => { if (o instanceof THREE.Mesh && o.userData.fpsWater) water.push(new THREE.Box3().setFromObject(o)); });
  const ground = (x: number, z: number) => {
    if (water.some(b => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y < 2)) return null;
    const base=bounds.groundHeight?.(x,z)??0;
    let y = base, raised = false;
    for (const s of surfaces as readonly WalkSurface[]) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
      if (s.solidBelow) y = Math.max(y, surfaceHeight(s, x, z)); else raised = true;
    }
    return raised && y === base ? null : y;
  };
  const streets = placeStreetLamps(options.roads, options.roadWidth, options.obstacles, bounds, { ground });
  const lamps = [...streets, ...placePathLamps(streets, options.roads, options.roadWidth, options.obstacles, bounds, { ground })];
  const baked = bakeLampMap(lamps, bounds, [...options.obstacles, ...getTraversalObstacles(scene)]);
  const map = new THREE.DataTexture(baked.data, baked.width, baked.height, THREE.RGBAFormat);
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearFilter; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true;
  const uniforms = {
    nightLevel: { value: 0 },
    /** Pools only read once the sky has dimmed, so they follow the night more steeply than the lamps themselves. */
    nightPool: { value: 0 },
    nightMap: { value: map },
    nightBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ)) },
    nightLampColor: { value: new THREE.Color('#ffd9a6').multiplyScalar(4.5) },
    nightWindowShare: { value: .48 },
    /** Seconds, wrapped every 21 minutes: drives windows switching and screen flicker. */
    nightClock: { value: 0 },
    /** 0 with reduced motion: no flicker, no switching. */
    nightMotion: { value: 1 },
  };
  const reducedMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const moving = createMovingLights();

  // Lamp furniture: instanced poles and arms, emissive heads, and soft halos.
  const root = new THREE.Group(); root.name = 'night-lights'; root.userData.fpsEffect = true; scene.add(root);
  const poleGeometry = new THREE.CylinderGeometry(.07, .11, 1, 6), armGeometry = new THREE.BoxGeometry(1, 1, 1), headGeometry = new THREE.BoxGeometry(1, 1, 1);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: '#6c7377', roughness: .6, metalness: .4 });
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#4d5256' });
  const count = Math.max(1, lamps.length);
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, count), arms = new THREE.InstancedMesh(armGeometry, poleMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, count);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const haloPositions = new Float32Array(count * 3), haloSizes = new Float32Array(count);
  lamps.forEach((lamp, i) => {
    const yaw = Math.atan2(-lamp.dz, lamp.dx), path = !lamp.dx && !lamp.dz; rotation.setFromAxisAngle(up, yaw);
    poles.setMatrixAt(i, matrix.compose(position.set(lamp.x, lamp.y + lamp.height / 2, lamp.z), rotation, scale.set(path ? .8 : 1, lamp.height, path ? .8 : 1)));
    arms.setMatrixAt(i, matrix.compose(position.set(lamp.x + lamp.dx * ARM / 2, lamp.y + lamp.height - .05, lamp.z + lamp.dz * ARM / 2), rotation, path ? scale.set(0, 0, 0) : scale.set(ARM, .09, .09)));
    const hx = lamp.x + lamp.dx * ARM, hz = lamp.z + lamp.dz * ARM, hy = lamp.y + lamp.height + (path ? .2 : -.16);
    // A street head is a flat luminaire under the arm; a path lamp a lantern on top of its post.
    heads.setMatrixAt(i, matrix.compose(position.set(hx, hy, hz), rotation, path ? scale.set(.34, .48, .34) : scale.set(.95, .14, .38)));
    haloPositions.set([hx, hy - (path ? 0 : .1), hz], i * 3);
    haloSizes[i] = path ? 2.2 : 3.2;
  });
  for (const mesh of [poles, arms, heads]) { mesh.count = lamps.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); root.add(mesh); }
  const haloGeometry = new THREE.BufferGeometry(); haloGeometry.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3));
  haloGeometry.setAttribute('size', new THREE.BufferAttribute(haloSizes, 1));
  haloGeometry.setDrawRange(0, lamps.length);
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, color: { value: new THREE.Color('#ffd49a') }, scale: { value: 600 }, fogNear: { value: 150 }, fogFar: { value: 700 } },
    vertexShader: `uniform float scale; attribute float size; varying float vDepth;
      void main() { vec4 view = modelViewMatrix * vec4(position, 1.0); vDepth = -view.z; gl_Position = projectionMatrix * view; gl_PointSize = clamp(scale * size / max(1.0, vDepth), 2.0, 160.0); }`,
    fragmentShader: `uniform float level, fogNear, fogFar; uniform vec3 color; varying float vDepth;
      void main() { float r = length(gl_PointCoord - .5) * 2.0; if (r > 1.0) discard;
        float glow = pow(1.0 - r, 2.2) * .55 + exp(-r * r * 40.0) * .9;
        float fade = 1.0 - smoothstep(fogNear, fogFar, vDepth);
        vec3 c = color * glow * level * fade; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`,
    ...GLOW_BLENDING,
  });
  const halos = new THREE.Points(haloGeometry, haloMaterial); halos.frustumCulled = false; halos.renderOrder = 2; root.add(halos);

  // A night sky: stars over the upper dome and the moon where the key light comes from, both at infinity and thinned by cloud.
  const starCount = 1100, starPositions = new Float32Array(starCount * 3), starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const r1 = Math.abs(Math.sin(i * 91.7) * 43758.5453) % 1, r2 = Math.abs(Math.sin(i * 47.3 + 1.3) * 24634.6345) % 1, r3 = Math.abs(Math.sin(i * 13.1 + 7.7) * 9151.73) % 1;
    const y = .06 + .94 * Math.sqrt(r1), ring = Math.sqrt(1 - y * y), angle = r2 * Math.PI * 2;
    starPositions.set([Math.cos(angle) * ring, y, Math.sin(angle) * ring], i * 3);
    starSizes[i] = r3 > .97 ? 2.6 : r3 > .85 ? 1.8 : 1.2;
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3)); starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const skyVertex = `attribute float size; uniform float pixel; varying float vSize;
    void main() { vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position * 100.0, 1.0); gl_Position = clip.xyww; gl_PointSize = size * pixel; vSize = size; }`;
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, pixel: { value: 1 } },
    vertexShader: skyVertex,
    fragmentShader: `uniform float level; varying float vSize;
      void main() { float r = length(gl_PointCoord - .5) * 2.0; if (r > 1.0) discard;
        vec3 c = vec3(.85, .9, 1.0) * (1.0 - r * r) * level * (.35 + .25 * vSize); gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`,
    ...GLOW_BLENDING,
  });
  const stars = new THREE.Points(starGeometry, starMaterial); stars.frustumCulled = false; stars.renderOrder = -1; root.add(stars);
  const moonGeometry = new THREE.BufferGeometry(); moonGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0]), 3)); moonGeometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array([34]), 1));
  const moonMaterial = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, pixel: { value: 1 } },
    vertexShader: skyVertex,
    fragmentShader: `uniform float level;
      void main() { vec2 p = (gl_PointCoord - .5) * 2.0; float r = length(p);
        float disc = 1.0 - smoothstep(.36, .4, r), glow = pow(max(0.0, 1.0 - r), 3.0) * .35;
        float mare = .86 + .14 * sin(p.x * 9.0 + 1.3) * sin(p.y * 7.0 - .4);
        vec3 c = (vec3(1.0, .97, .88) * 1.6 * disc * mare + vec3(.55, .65, .9) * glow) * level; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`,
    ...GLOW_BLENDING,
  });
  const moon = new THREE.Points(moonGeometry, moonMaterial); moon.frustumCulled = false; moon.renderOrder = -1; root.add(moon);
  const moonPosition = moonGeometry.getAttribute('position') as THREE.BufferAttribute;
  root.traverse(object => { object.raycast = () => {}; object.userData.fpsEffect = true; });

  // Every lit material in the district samples the lamp map; building-sized meshes also get windows.
  const patched = new WeakMap<THREE.Material, { compile: Lit['onBeforeCompile']; key: Lit['customProgramCacheKey'] }>();
  const windowed = new Map<THREE.Material, Lit>();
  const swaps: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; attributes: THREE.BufferAttribute[] }[] = [];
  function patch(material: Lit, windows: boolean, panes = false) {
    if (patched.has(material)) return;
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    patched.set(material, { compile, key });
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms, moving.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vNightWorld, vNightNormal;${windows ? '\nattribute vec2 nightSpan, nightEdge;\nattribute vec3 nightTangent;\nvarying vec2 vNightSpan, vNightEdge;\nvarying float vNightSeed;' : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 nightWorld = vec4(transformed, 1.0); vec3 nightNormal = objectNormal;
          #ifdef USE_INSTANCING
            nightWorld = instanceMatrix * nightWorld; nightNormal /= vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));
            nightNormal = mat3(instanceMatrix) * nightNormal;
          #endif
          vNightWorld = (modelMatrix * nightWorld).xyz; nightNormal /= vec3(dot(modelMatrix[0].xyz, modelMatrix[0].xyz), dot(modelMatrix[1].xyz, modelMatrix[1].xyz), dot(modelMatrix[2].xyz, modelMatrix[2].xyz));
          vNightNormal = mat3(modelMatrix) * nightNormal;${windows ? `
vNightSpan = nightSpan;
vec3 nightT = nightTangent; vec4 nightSeed = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  nightT = mat3(instanceMatrix) * nightT; nightSeed = instanceMatrix * nightSeed;
#endif
vNightEdge = nightEdge * length(mat3(modelMatrix) * nightT);
vec3 nightCenter = (modelMatrix * nightSeed).xyz;
// Hash once per vertex; hashing interpolated world coordinates in the fragment
// shader amplifies rounding into stripes across an otherwise constant pane.
vNightSeed = fract(sin(dot(nightCenter, vec3(12.9898, 78.233, 37.719))) * 43758.5453);` : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float nightLevel, nightPool, nightWindowShare; uniform sampler2D nightMap; uniform vec4 nightBounds; uniform vec3 nightLampColor;
          varying vec3 vNightWorld, vNightNormal;${windows ? `
          varying vec2 vNightSpan, vNightEdge;
          varying float vNightSeed;
          uniform float nightClock, nightMotion;
          // About one window in six belongs to someone who comes and goes: it is
          // decided afresh every two and a half minutes, each on its own schedule.
          float nightWindowLit(float h) {
            float restless = step(.83, fract(h * 5.31)) * nightMotion;
            float epoch = floor(nightClock / 150.0 + fract(h * 17.3));
            float roll = fract(sin(epoch * 91.7 + h * 311.7) * 43758.5453);
            return step(1.0 - nightWindowShare, mix(h, roll, restless));
          }
          // A few lit rooms have a screen on: a cool, unsteady glow rather than lamplight.
          vec3 nightWindowTint(float h, vec3 tint) {
            float screen = step(.965, fract(h * 11.7)) * nightMotion, t = nightClock + h * 50.0;
            float flicker = .6 + .25 * sin(t * 5.1) * sin(t * 2.3 + 1.7) + .15 * sin(t * 13.7 + h * 9.0);
            return mix(tint, vec3(.5, .66, 1.0) * flicker, screen);
          }
          // Interior mapping: a room seen through a point on its glass, with no geometry behind it.
          // p is metres from the room's left wall and floor, size its width and height, open the glazed
          // opening in the same metres (left, bottom, right, top), d the view direction along the facade, up
          // and into the wall. The ray first crosses the wall's own thickness, where it may meet the frame;
          // then it is carried to the furniture or the room's shell, and the hit is lit from a ceiling lamp.
          // Returns colour and, in alpha, 1 for the room and 0 for the frame. Mirrors interiorHit for the shell.
          float nightRoomHash(float v) { return fract(sin(v * 91.345) * 47453.5453); }
          float nightBoxHit(vec3 from, vec3 dir, vec3 low, vec3 high, out vec3 normal) {
            vec3 a = (low - from) / dir, b = (high - from) / dir, near = min(a, b), far = max(a, b);
            float enter = max(near.x, max(near.y, near.z)), leave = min(far.x, min(far.y, far.z));
            normal = -sign(dir) * step(near.yzx, near.xyz) * step(near.zxy, near.xyz);
            return enter > leave || enter < 0.0 ? 1e9 : enter;
          }
          vec4 nightRoom(vec2 p, vec2 size, vec4 open, vec3 d, float seed) {
            d = vec3(abs(d.x) < 1e-3 ? 1e-3 : d.x, abs(d.y) < 1e-3 ? 1e-3 : d.y, max(d.z, .03));
            float reveal = ${INTERIOR.reveal.toFixed(2)}, depth = ${INTERIOR.depth.toFixed(1)} + ${INTERIOR.depthRange.toFixed(1)} * nightRoomHash(seed * 7.7);
            vec3 wall = mix(vec3(.84, .78, .68), vec3(.66, .76, .82), step(.5, nightRoomHash(seed * 3.1)));
            wall = mix(wall, vec3(.88, .82, .58), step(.8, nightRoomHash(seed * 5.3)));
            // The wall is a hand deep: a ray that leaves the opening inside that thickness has met the frame.
            vec3 from = vec3(p, 0.0) + d * (reveal / d.z);
            if (from.x < open.x || from.x > open.z || from.y < open.y || from.y > open.w) {
              float side = from.y > open.w ? .5 : from.y < open.y ? 1.0 : .72;
              return vec4(vec3(.5, .52, .54) * side, 0.0);
            }
            vec3 low = vec3(0.0, 0.0, reveal), high = vec3(size, reveal + depth);
            vec3 reach = vec3(d.x > 0.0 ? (high.x - from.x) / d.x : (low.x - from.x) / d.x, d.y > 0.0 ? (high.y - from.y) / d.y : (low.y - from.y) / d.y, (high.z - from.z) / d.z);
            float t = min(reach.x, min(reach.y, reach.z));
            vec3 normal = t == reach.z ? vec3(0.0, 0.0, -1.0) : t == reach.y ? vec3(0.0, -sign(d.y), 0.0) : vec3(-sign(d.x), 0.0, 0.0);
            float kind = 0.0;
            // Furniture, each a real box in the room so it slides against the walls as the viewer moves:
            // a counter across the back, shelving down one side, and a display table near the glass.
            float flip = step(.5, nightRoomHash(seed * 11.3)), far = high.z;
            vec3 hitNormal;
            float counter = nightBoxHit(from, d, vec3(.35, 0.0, far - 1.75), vec3(size.x - .35, .95, far - 1.2), hitNormal);
            if (counter < t) { t = counter; normal = hitNormal; kind = 1.0; }
            float shelfX = mix(0.0, size.x - .42, flip);
            float shelf = nightBoxHit(from, d, vec3(shelfX, 0.0, reveal + .7), vec3(shelfX + .42, min(2.05, size.y - .3), far - .25), hitNormal);
            if (shelf < t) { t = shelf; normal = hitNormal; kind = 2.0; }
            float tableX = mix(size.x * .52, size.x * .14, flip);
            float table = nightBoxHit(from, d, vec3(tableX, 0.0, reveal + .55), vec3(tableX + size.x * .34, .72, reveal + 1.5), hitNormal);
            if (table < t) { t = table; normal = hitNormal; kind = 3.0; }
            vec3 hit = from + d * t;
            // What the surface is made of.
            vec3 accent = mix(vec3(.72, .3, .24), vec3(.24, .46, .62), nightRoomHash(seed * 13.7));
            accent = mix(accent, vec3(.86, .66, .22), step(.66, nightRoomHash(seed * 17.9)));
            vec3 albedo = wall;
            float glow = 0.0;
            if (kind == 1.0) albedo = normal.y > .5 ? vec3(.86, .84, .8) : accent * (.8 + .2 * step(.5, fract(hit.x * 1.3)));
            else if (kind == 2.0) {
              // Goods on the shelves: a board every 40 cm, blocks of colour between them.
              float board = step(.86, fract(hit.y * 2.5)), block = nightRoomHash(floor(hit.z * 3.2) + floor(hit.y * 2.5) * 7.0 + seed * 31.0);
              vec3 goods = mix(mix(vec3(.82, .34, .28), vec3(.3, .56, .72), step(.33, block)), vec3(.9, .78, .32), step(.66, block));
              albedo = abs(normal.x) > .5 ? mix(goods, vec3(.2, .17, .15), board) : vec3(.28, .24, .21);
            } else if (kind == 3.0) albedo = normal.y > .5 ? mix(vec3(.8, .74, .62), accent, step(.6, nightRoomHash(floor(hit.x * 2.6) + floor(hit.z * 2.6) * 5.0 + seed))) : vec3(.36, .3, .26);
            else if (normal.z < -.5) {
              // Back wall: a door to one side, a skirting board, and a sign band over the counter.
              float doorX = mix(size.x - 1.25, .35, flip), door = step(doorX, hit.x) * step(hit.x, doorX + .9) * step(hit.y, 2.05);
              float band = step(1.55, hit.y) * step(hit.y, 1.95) * (1.0 - door) * step(.5, hit.x) * step(hit.x, size.x - .5);
              albedo = mix(mix(wall, accent, band * .85), wall * .5, door) * (1.0 - .3 * step(hit.y, .1));
            } else if (normal.y > .5) {
              // Floor tiles lead the eye inward.
              vec2 tile = abs(fract(vec2(hit.x, hit.z) / .6) - .5);
              albedo = mix(vec3(.5, .46, .4), wall * .6, .5) * (1.0 - .22 * step(.46, max(tile.x, tile.y)));
            } else if (normal.y < -.5) {
              // Ceiling, with the lamp's own panel.
              vec2 panel = abs(vec2(hit.x - size.x * .5, hit.z - (reveal + depth * .45)));
              glow = step(panel.x, .55) * step(panel.y, .22);
              albedo = vec3(.9);
            }
            // One lamp under the ceiling: light falls off with distance and angle, and corners gather shade.
            vec3 lamp = vec3(size.x * .5, size.y - .12, reveal + depth * .45), toLamp = lamp - hit;
            float range = length(toLamp), lit = max(dot(normal, toLamp / range), 0.0) / (1.0 + .16 * range * range);
            vec3 edge = min(hit - low, high - hit) + abs(normal) * 10.0;
            float corner = kind > 0.0 ? smoothstep(0.0, .35, hit.y) : smoothstep(0.0, .5, min(edge.x, min(edge.y, edge.z)));
            float shade = (.3 + 1.5 * lit) * mix(.55, 1.0, corner);
            return vec4(mix(albedo * shade, vec3(1.25, 1.2, 1.05), glow), 1.0);
          }
          // The view direction in a wall's own axes: along it (the way the facade coordinate grows), up, and inwards.
          vec3 nightInto(vec3 normal) {
            vec3 view = normalize(vNightWorld - cameraPosition), along = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
            return vec3(dot(view, along), view.y, -dot(view, normal));
          }` : ''}
          ${MOVING_LIGHTS_DECLARATIONS}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Flares, motors and bursts nearby (moving-lights); they still shine when a blackout puts the city out.
          if (movingCount > 0) { vec3 movingN = normalize(vNightNormal); ${movingLightsChunk('vNightWorld', 'movingN', 'diffuseColor.rgb')} }
          ${windows && !panes ? `
          // The ground storey of a building that stands on the ground, by day and night: a darker plinth, a
          // fascia under the first floor, and in most bays a glazed shopfront or a door. Drawn in the same
          // bays as the windows above, so a lit window at night sits over an opening by day.
          float nightFront = 0.0, nightFrontSeed = 0.0, nightFrontGlass = 1.0; vec4 nightFrontRoom = vec4(0.0);
          {
            float frontWall = 1.0 - smoothstep(.12, .3, abs(normalize(vNightNormal).y));
            vec2 frontUv = clamp((vNightWorld.xz - nightBounds.xy) * nightBounds.zw, 0.0, 1.0);
            float frontGround = texture2D(nightMap, frontUv).g * ${HEIGHT_RANGE.toFixed(1)} + ${HEIGHT_LOW.toFixed(1)};
            float frontBase = vNightSpan.x - ${GROUND_STOREY.toFixed(1)}, frontY = vNightWorld.y - max(frontBase, frontGround);
            float frontBay = vNightEdge.x / max(.01, vNightEdge.y) * max(1.0, floor(vNightEdge.y / 3.1));
            vec2 frontAa = max(vec2(fwidth(frontBay), fwidth(frontY)), vec2(1e-4));
            // Rain streaks: columns about half a metre wide run down from the roof edge, each its own length,
            // so a tall wall is not one clean sheet. Gone once a column is under a couple of pixels.
            float streakColumn = vNightEdge.x * ${(1 / STREAKS.width).toFixed(2)}, streakAa = max(fwidth(streakColumn), 1e-4);
            float streakSeed = fract(sin(dot(vec2(floor(streakColumn), floor(vNightSeed * 97.0) + 3.7), vec2(12.9898, 78.233))) * 43758.5453);
            float streakBelow = vNightSpan.y + 1.1 - vNightWorld.y, streakIn = fract(streakColumn);
            float streak = step(${(1 - STREAKS.share).toFixed(2)}, streakSeed) * (1.0 - smoothstep(0.0, ${STREAKS.shortest.toFixed(1)} + streakSeed * streakSeed * ${(STREAKS.longest - STREAKS.shortest).toFixed(1)}, streakBelow))
              * smoothstep(0.0, .3, streakIn) * (1.0 - smoothstep(.7, 1.0, streakIn)) * (1.0 - smoothstep(.25, .7, streakAa)) * frontWall * step(0.0, streakBelow);
            diffuseColor.rgb *= 1.0 - ${STREAKS.darken.toFixed(2)} * streak;
            if (frontWall > 0.0 && vNightEdge.y >= ${STOREFRONT.minFacade.toFixed(1)} && frontBase - frontGround < ${STOREFRONT.maxLift.toFixed(1)} && frontY < ${GROUND_STOREY.toFixed(1)}) {
              float frontNear = (1.0 - smoothstep(.3, .8, frontAa.x)) * frontWall;
              nightFrontSeed = fract(sin(dot(vec2(floor(frontBay), floor(vNightSeed * 97.0)), vec2(12.9898, 78.233))) * 43758.5453);
              // One bay in six is blank wall, about one in four a door, the rest shopfronts over a low riser.
              float frontDoor = step(nightFrontSeed, ${(STOREFRONT.blank + STOREFRONT.door).toFixed(2)});
              float frontHalf = mix(${(STOREFRONT.frontWidth / 2).toFixed(2)}, ${(STOREFRONT.doorWidth / 2).toFixed(2)}, frontDoor), frontSill = mix(${STOREFRONT.riser.toFixed(2)}, 0.0, frontDoor);
              nightFront = step(${STOREFRONT.blank.toFixed(2)}, nightFrontSeed) * frontNear
                * clamp((frontHalf - abs(fract(frontBay) - .5)) / frontAa.x + .5, 0.0, 1.0)
                * clamp((frontY - frontSill) / frontAa.y + .5, 0.0, 1.0) * clamp((${STOREFRONT.head.toFixed(2)} - frontY) / frontAa.y + .5, 0.0, 1.0);
              float frontPlinth = (1.0 - smoothstep(${STOREFRONT.plinth.toFixed(2)}, ${(STOREFRONT.plinth + .04).toFixed(2)}, frontY)) * frontNear;
              float frontFascia = smoothstep(${(STOREFRONT.head + .08).toFixed(2)}, ${(STOREFRONT.head + .12).toFixed(2)}, frontY) * frontNear;
              diffuseColor.rgb *= 1.0 - .2 * frontPlinth * (1.0 - nightFront) - .12 * frontFascia;
              // Behind the glass, a room; at a glancing angle the glass goes dark and reflective instead.
              vec3 frontInto = nightInto(normalize(vNightNormal));
              float frontBayWidth = vNightEdge.y / max(1.0, floor(vNightEdge.y / 3.1));
              nightFrontRoom = nightRoom(vec2(fract(frontBay) * frontBayWidth, frontY), vec2(frontBayWidth, ${GROUND_STOREY.toFixed(1)}),
                vec4((.5 - frontHalf) * frontBayWidth, frontSill, (.5 + frontHalf) * frontBayWidth, ${STOREFRONT.head.toFixed(2)}), frontInto, nightFrontSeed);
              // Glass only dims the room at a glancing angle; the frame is not glass at all.
              nightFrontGlass = mix(.1, .85, pow(1.0 - clamp(frontInto.z, 0.0, 1.0), 3.0)) * nightFrontRoom.a;
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(nightFrontRoom.rgb * ${INTERIOR.dayShare.toFixed(2)}, vec3(.045, .06, .075), nightFrontGlass), nightFront);
              #ifdef STANDARD
                roughnessFactor = mix(roughnessFactor, .16, nightFront);
              #endif
            }
          }` : ''}
          if (nightLevel > .001) {
            vec3 nightN = normalize(vNightNormal);
            vec2 nightUv = (vNightWorld.xz - nightBounds.xy) * nightBounds.zw;
            if (nightUv.x > 0.0 && nightUv.x < 1.0 && nightUv.y > 0.0 && nightUv.y < 1.0) {
              vec4 nightTexel = texture2D(nightMap, nightUv);
              float above = vNightWorld.y - (nightTexel.g * ${HEIGHT_RANGE.toFixed(1)} + ${HEIGHT_LOW.toFixed(1)});
              float reach = smoothstep(-1.5, 0.0, above) * (1.0 - smoothstep(${(LAMP_HEIGHT - 2).toFixed(1)}, ${(LAMP_HEIGHT + 3).toFixed(1)}, above));
              float facing = nightN.y >= 0.0 ? mix(.5, 1.0, nightN.y) : .3 * (1.0 + nightN.y);
              totalEmissiveRadiance += diffuseColor.rgb * nightLampColor * nightTexel.r * nightTexel.r * reach * facing * nightPool;
            }
            ${windows ? `
            float wall = 1.0 - smoothstep(.12, .3, abs(nightN.y));
            if (wall > 0.0 && vNightWorld.y > vNightSpan.x && vNightWorld.y < vNightSpan.y) {
              vec3 roomLight = vec3(1.0);
              ${panes ? `
              // An authored pane is already the window: light its surface, preserving frames and grilles.
              float h = vNightSeed;
              float lit = nightWindowLit(h);
              float pane = 1.0;
              ` : `
              // Fit complete columns and storeys inside each actual facade, including rotated/extruded sides.
              float height = max(.01, vNightSpan.y - vNightSpan.x);
              vec2 count = max(vec2(1.0), floor(vec2(vNightEdge.y / 3.1, height / 3.3)));
              vec2 cell = vec2(vNightEdge.x / max(.01, vNightEdge.y), (vNightWorld.y - vNightSpan.x) / height) * count;
              vec2 id = floor(cell), f = fract(cell), aa = max(fwidth(cell), vec2(1e-4));
              vec2 pane2 = clamp((vec2(.28, .24) - abs(f - .5)) / aa, 0.0, 1.0);
              float facade = floor(vNightSeed * 97.0);
              float h = fract(sin(dot(id + facade, vec2(12.9898, 78.233))) * 43758.5453);
              float lit = nightWindowLit(h);
              // Far off, a grid finer than a pixel settles to its average instead of shimmering.
              float far = smoothstep(.35, .9, max(aa.x, aa.y));
              float pane = mix(pane2.x * pane2.y, .56 * .48, far);
              // Up close a lit pane shows the room behind it; far off it settles to the plain glow.
              vec2 roomSize = vec2(vNightEdge.y / count.x, height / count.y);
              float roomFar = max(far, smoothstep(.02, .12, max(aa.x, aa.y)));
              if (roomFar < 1.0) {
                vec4 room = nightRoom(f * roomSize, roomSize, vec4(.22 * roomSize.x, .26 * roomSize.y, .78 * roomSize.x, .74 * roomSize.y), nightInto(nightN), h);
                roomLight = mix(room.rgb * mix(.15, ${INTERIOR.nightWindow.toFixed(2)}, room.a), vec3(1.0), roomFar);
              }
              `}
              vec3 tint = nightWindowTint(h, mix(vec3(1.0, .74, .45), vec3(.82, .9, 1.0), step(.72, fract(h * 7.13))));
              totalEmissiveRadiance += tint * roomLight * (1.1 + fract(h * 3.7)) * pane * lit * wall * nightLevel;
            }${panes ? '' : `
            // A share of the shopfronts keep their lights on after dark.
            totalEmissiveRadiance += vec3(1.0, .86, .68) * nightFrontRoom.rgb * mix(.12, 1.0, nightFrontRoom.a) * (1.0 - .6 * nightFrontGlass) * nightFront * nightWindowLit(fract(nightFrontSeed * 3.31)) * ${INTERIOR.nightShopfront.toFixed(2)} * nightLevel;`}` : ''}
          }`);
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|night${windows ? panes ? '-panes-v3' : '-windows-v7' : ''}`; };
    material.needsUpdate = true;
  }
  const box = new THREE.Box3(), geometryBox = new THREE.Box3(), instance = new THREE.Matrix4();
  function viewOf(source: THREE.BufferGeometry) {
    const view = new THREE.BufferGeometry();
    view.index = source.index;
    for (const name of Object.keys(source.attributes)) view.setAttribute(name, source.attributes[name]);
    for (const group of source.groups) view.addGroup(group.start, group.count, group.materialIndex);
    view.boundingBox = source.boundingBox; view.boundingSphere = source.boundingSphere;
    return view;
  }
  function windowsFor(mesh: THREE.Mesh) {
    if (Array.isArray(mesh.material) || !lit(mesh.material)) return false;
    // Material metadata survives static batching and instanced-material separation.
    const panes = mesh.material.userData.nightWindow === true;
    if (!panes && (!windowable(mesh.material) || !WINDOW_SHAPES.has(mesh.geometry.type))) return false;
    if (mesh instanceof THREE.SkinnedMesh) return false;
    for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) if (!panes && NO_WINDOWS.has(p.name)) return false;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometryBox.copy(geometry.boundingBox!);
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    const span = new Float32Array(instances * 2);
    let any = false;
    const up = new THREE.Vector3();
    for (let i = 0; i < instances; i++) {
      if (mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(i, instance); instance.premultiply(mesh.matrixWorld); }
      else instance.copy(mesh.matrixWorld);
      box.copy(geometryBox).applyMatrix4(instance);
      // A round tower only when it is a tower, not a tank.
      const round = geometry.type === 'CylinderGeometry' && (box.max.y - box.min.y) < 1.4 * (box.max.x - box.min.x);
      const ok = panes || !round && upright(instance) && buildingSized(box);
      if (ok && !any) {
        const axis = [0, 1, 2].find(axis => Math.abs(new THREE.Vector3().setFromMatrixColumn(instance, axis).normalize().y) > .995) ?? 1;
        up.setComponent(axis, Math.sign(new THREE.Vector3().setFromMatrixColumn(instance, axis).y));
      }
      span.set(ok ? panes ? [box.min.y - .01, box.max.y + .01] : [box.min.y + GROUND_STOREY, box.max.y - 1.1] : [1e6, -1e6], i * 2);
      any ||= ok;
    }
    if (!any) return false;
    const view = viewOf(geometry);
    const attribute = mesh instanceof THREE.InstancedMesh ? new THREE.InstancedBufferAttribute(span, 2)
      : new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2).map((_, k) => span[k % 2]), 2);
    view.setAttribute('nightSpan', attribute);
    const facade = nightFacadeAttributes(geometry, up);
    for (const [name, buffer] of Object.entries(facade)) view.setAttribute(name, buffer);
    let material = windowed.get(mesh.material);
    if (!material) { material = (mesh.material as Lit).clone(); windowed.set(mesh.material, material); patch(material, true, panes); }
    swaps.push({ mesh, geometry, material: mesh.material, attributes: [attribute, ...Object.values(facade)] });
    mesh.geometry = view; mesh.material = material;
    return true;
  }
  /** Patches what the scene holds now; later arrivals (vehicles, people) are picked up by the periodic rescan. */
  function scan(first: boolean) {
    const visit = (object: THREE.Object3D) => {
      if (object.userData.fpsEffect) return;
      if (object instanceof THREE.Mesh) {
        if (!(first && windowsFor(object))) for (const m of Array.isArray(object.material) ? object.material : [object.material]) if (lit(m)) patch(m, false);
      }
      object.children.forEach(visit);
    };
    visit(scene);
  }
  scan(true); patch(poleMaterial, false);

  const headOff = new THREE.Color('#4d5256'), headOn = new THREE.Color('#fff1d0').multiplyScalar(4);
  const buffer = new THREE.Vector2();
  let level = -1, dark = 0, sinceScan = 0, disposed = false;
  return {
    root,
    lamps,
    scanMaterials: () => scan(false),
    /** How lit the city is this frame, 0–1. */
    get level() { return Math.max(0, level); },
    /**
     * How much lamp light falls where `position` is, 0–1, already scaled by
     * the night: for lighting what the world's materials do not cover, such as
     * the weapon in hand.
     */
    lightAt(position: THREE.Vector3) {
      if (level <= 0) return 0;
      const i = Math.floor((position.x - bounds.minX) / (bounds.maxX - bounds.minX) * baked.width), j = Math.floor((position.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * baked.height);
      if (i < 0 || j < 0 || i >= baked.width || j >= baked.height) return 0;
      const k = j * baked.width + i, above = position.y - baked.ground[k];
      const reach = Math.max(0, Math.min(1, (above + 1.5) / 1.5)) * (1 - Math.max(0, Math.min(1, (above - LAMP_HEIGHT + 2) / 5)));
      return Math.min(1, baked.light[k]) ** 2 * reach * level * level;
    },
    /**
     * Light from things on the move this frame (flares, motors, bursts), for
     * the slots that matter most from `camera`. Night only, blackout or not.
     */
    shine(sources: readonly LightSource[], camera: { x: number; y: number; z: number }) { if (!disposed) moving.set(sources, camera, dark); },
    /** `lighting` is the hour's light; `blackout` 0–1 puts the city out (the sky stays). */
    update(lighting: Pick<LightingState, 'elevation' | 'key'>, blackout: number, dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
      if (disposed) return;
      uniforms.nightClock.value = (uniforms.nightClock.value + (Number.isFinite(dt) ? Math.max(0, Math.min(dt, .25)) : 0)) % 6000;
      uniforms.nightMotion.value = reducedMotion?.matches ? 0 : 1;
      const elevation = lighting.elevation; dark = nightLevel(elevation);
      const next = dark * (1 - Math.max(0, Math.min(1, blackout)));
      if (Math.abs(next - level) > 1e-3) {
        level = next; uniforms.nightLevel.value = level; uniforms.nightPool.value = level * level;
        headMaterial.color.copy(headOff).lerp(headOn, level);
        haloMaterial.uniforms.level.value = level ** 1.6;
      }
      halos.visible = level > .01;
      // Cloud and haze thin the sky out; the city's fog distance stands for how clear the air is.
      const clear = scene.fog instanceof THREE.Fog ? Math.max(0, Math.min(1, (scene.fog.far - 450) / 350)) : 1;
      const pixel = renderer.getPixelRatio();
      starMaterial.uniforms.level.value = Math.max(0, (dark - .85) / .15) * clear; starMaterial.uniforms.pixel.value = pixel;
      stars.visible = starMaterial.uniforms.level.value > .01;
      moonMaterial.uniforms.level.value = (elevation < -4 ? Math.min(1, (-4 - elevation) / 4) : 0) * (.25 + .75 * clear); moonMaterial.uniforms.pixel.value = pixel;
      moon.visible = moonMaterial.uniforms.level.value > .01;
      if (moon.visible) { moonPosition.setXYZ(0, lighting.key.x, lighting.key.y, lighting.key.z); moonPosition.needsUpdate = true; }
      // Pixels per metre at one metre's depth, so a halo keeps its size in the world.
      haloMaterial.uniforms.scale.value = renderer.getDrawingBufferSize(buffer).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      if (scene.fog instanceof THREE.Fog) { haloMaterial.uniforms.fogNear.value = scene.fog.near; haloMaterial.uniforms.fogFar.value = scene.fog.far; }
      sinceScan += dt;
      if (sinceScan > 1.5) { sinceScan = 0; scan(false); }
    },
    dispose() {
      if (disposed) return; disposed = true;
      scene.remove(root);
      for (const { mesh, geometry, material, attributes } of swaps) {
        const view = mesh.geometry;
        mesh.geometry = geometry; mesh.material = material;
        // Free only the facade attributes owned by this view, never the shared source buffers.
        for (const name of Object.keys(view.attributes)) if (!attributes.includes(view.attributes[name] as THREE.BufferAttribute)) view.deleteAttribute(name);
        view.index = null; view.dispose();
      }
      windowed.forEach(material => material.dispose());
      const restore = (m: THREE.Material) => {
        const original = patched.get(m); if (!original || !lit(m)) return;
        m.onBeforeCompile = original.compile; m.customProgramCacheKey = original.key; m.needsUpdate = true; patched.delete(m);
      };
      scene.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(restore); });
      [poles, arms, heads].forEach(m => m.dispose());
      [poleGeometry, armGeometry, headGeometry, haloGeometry, starGeometry, moonGeometry].forEach(g => g.dispose());
      [poleMaterial, headMaterial, haloMaterial, starMaterial, moonMaterial].forEach(m => m.dispose());
      map.dispose();
    },
  };
}
