import * as THREE from 'three';
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
/** Groups whose contents are terrain or decks, never facades. */
const NO_WINDOWS = new Set(['Connected elevated places', 'Walkable elevated routes']);

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
    let y = 0, raised = false;
    for (const s of surfaces as readonly WalkSurface[]) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
      if (s.solidBelow) y = Math.max(y, surfaceHeight(s, x, z)); else raised = true;
    }
    return raised && y === 0 ? null : y;
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
  };
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
  const swaps: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; span: THREE.BufferAttribute }[] = [];
  function patch(material: Lit, windows: boolean) {
    if (patched.has(material)) return;
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    patched.set(material, { compile, key });
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms, moving.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vNightWorld, vNightNormal;${windows ? '\nattribute vec2 nightSpan;\nvarying vec2 vNightSpan;' : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 nightWorld = vec4(transformed, 1.0); vec3 nightNormal = objectNormal;
          #ifdef USE_INSTANCING
            nightWorld = instanceMatrix * nightWorld; nightNormal = mat3(instanceMatrix) * nightNormal;
          #endif
          vNightWorld = (modelMatrix * nightWorld).xyz; vNightNormal = mat3(modelMatrix) * nightNormal;${windows ? '\nvNightSpan = nightSpan;' : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float nightLevel, nightPool, nightWindowShare; uniform sampler2D nightMap; uniform vec4 nightBounds; uniform vec3 nightLampColor;
          varying vec3 vNightWorld, vNightNormal;${windows ? '\nvarying vec2 vNightSpan;' : ''}
          ${MOVING_LIGHTS_DECLARATIONS}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Flares, motors and bursts nearby (moving-lights); they still shine when a blackout puts the city out.
          if (movingCount > 0) { vec3 movingN = normalize(vNightNormal); ${movingLightsChunk('vNightWorld', 'movingN', 'diffuseColor.rgb')} }
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
              // The grid and which panes are lit follow the wall's plane in the world, not the mesh:
              // two buildings that share a wall plane light the same panes, so their overlap cannot flicker.
              vec2 along = normalize(vec2(-nightN.z, nightN.x) + 1e-5);
              float plane = mod(floor(dot(vNightWorld.xz, normalize(nightN.xz + 1e-5)) + .37), 97.0);
              vec2 cell = vec2(dot(vNightWorld.xz, along) / 3.1, vNightWorld.y / 3.3);
              vec2 id = floor(cell), f = fract(cell), aa = max(fwidth(cell), vec2(1e-4));
              // Whole storeys only, so the ground floor and parapet cut no pane in half.
              float storey = step(vNightSpan.x, id.y * 3.3) * step((id.y + 1.0) * 3.3, vNightSpan.y);
              vec2 pane2 = clamp((vec2(.28, .24) - abs(f - .5)) / aa, 0.0, 1.0);
              float facade = floor(nightN.x * 2.0 + .5) * 7.0 + floor(nightN.z * 2.0 + .5) * 13.0 + plane;
              float h = fract(sin(dot(id + facade, vec2(12.9898, 78.233))) * 43758.5453);
              float lit = storey * step(1.0 - nightWindowShare * (.6 + .8 * fract(plane * .37)), h);
              // Far off, a grid finer than a pixel settles to its average instead of shimmering.
              float pane = mix(pane2.x * pane2.y, .56 * .48, smoothstep(.35, .9, max(aa.x, aa.y)));
              vec3 tint = mix(vec3(1.0, .74, .45), vec3(.82, .9, 1.0), step(.72, fract(h * 7.13)));
              totalEmissiveRadiance += tint * (1.1 + fract(h * 3.7)) * pane * lit * wall * nightLevel;
            }` : ''}
          }`);
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|night${windows ? '-windows' : ''}`; };
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
    if (Array.isArray(mesh.material) || !lit(mesh.material) || !windowable(mesh.material) || !WINDOW_SHAPES.has(mesh.geometry.type)) return false;
    if (mesh instanceof THREE.SkinnedMesh) return false;
    for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) if (NO_WINDOWS.has(p.name)) return false;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometryBox.copy(geometry.boundingBox!);
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    const span = new Float32Array(instances * 2);
    let any = false;
    for (let i = 0; i < instances; i++) {
      if (mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(i, instance); instance.premultiply(mesh.matrixWorld); }
      else instance.copy(mesh.matrixWorld);
      box.copy(geometryBox).applyMatrix4(instance);
      // A round tower only when it is a tower, not a tank.
      const round = geometry.type === 'CylinderGeometry' && (box.max.y - box.min.y) < 1.4 * (box.max.x - box.min.x);
      const ok = !round && upright(instance) && buildingSized(box);
      span.set(ok ? [box.min.y + 2.6, box.max.y - 1.1] : [1e6, -1e6], i * 2);
      any ||= ok;
    }
    if (!any) return false;
    const view = viewOf(geometry);
    const attribute = mesh instanceof THREE.InstancedMesh ? new THREE.InstancedBufferAttribute(span, 2)
      : new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2).map((_, k) => span[k % 2]), 2);
    view.setAttribute('nightSpan', attribute);
    let material = windowed.get(mesh.material);
    if (!material) { material = (mesh.material as Lit).clone(); windowed.set(mesh.material, material); patch(material, true); }
    swaps.push({ mesh, geometry, material: mesh.material, span: attribute });
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
      for (const { mesh, geometry, material, span } of swaps) {
        const view = mesh.geometry;
        mesh.geometry = geometry; mesh.material = material;
        // The view shares every buffer but its own; only that one may be freed with it.
        for (const name of Object.keys(view.attributes)) if (view.attributes[name] !== span) view.deleteAttribute(name);
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
