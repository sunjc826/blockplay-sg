import * as THREE from 'three';
import type { WorldDetail } from './environment-quality';

/**
 * Occasional leaves falling from the plants near the camera and dust motes in
 * the sun. Only dust follows the camera; a leaf always falls at a real plant,
 * and is moved to one near the player only while it is out of sight.
 * One draw of folded, tapered leaves and tiny dust specks; every
 * particle's path is worked out in the vertex shader from the time and its
 * seed, so a frame costs a few uniform writes, plus a few times a second a
 * pass over the leaves to re-home the hidden ones. Presentation only.
 *
 * Leaves fall in still air, more in wind, and thin out in heavy rain; motes need direct
 * sun and vanish at night. Reduced effects and the Low preset (`low` world
 * detail) turn the whole thing off; phones draw half as many.
 */
export interface AmbientDriftWeather {
  /** Weather wind, 0 (still) to 7 (squall). */
  wind: number;
  /** Rain, 0..1. */
  rain: number;
  /** Direct sunlight, 0..1. */
  sun: number;
  /** 0 day to 1 night. */
  night: number;
  reduced: boolean;
  detail: WorldDetail;
  mobile: boolean;
}

export const DRIFT_COUNT: Record<WorldDetail, number> = { low: 0, high: 144, ultra: 288 };
/** Half-size of the dust volume around the camera (m): close in, since a speck is lost beyond a few metres. */
const BOX = new THREE.Vector3(6, 3, 6);
/** Leaves fall from plants within this distance of the camera (m); the shader fades them out from 14 to 22. */
const LEAF_REACH = 12, LEAF_HIDDEN = 24;
/** Downwind, matching the trees' lean (tree-wind.ts). */
const WIND_DIRECTION = new THREE.Vector2(.984, .177);
/** Rest height of the merged particles, far below any world, for passes that bypass this material. */
const PARK = -5000;

/** How much of the drift shows: leaves and motes (0..1), and how fast leaves are carried (m/s). */
export function driftAmounts(weather: Pick<AmbientDriftWeather, 'wind' | 'rain' | 'sun' | 'night' | 'reduced' | 'detail'>) {
  if (weather.reduced || weather.detail === 'low') return { leaves: 0, motes: 0, speed: 0 };
  const day = 1 - Math.max(0, Math.min(1, weather.night)), wind = Math.max(0, Math.min(7, weather.wind)), rain = Math.max(0, Math.min(1, weather.rain));
  return {
    leaves: Math.min(1, .5 + wind * .12) * (1 - rain * .5) * (.35 + .65 * day),
    motes: .45 * Math.max(0, Math.min(1, weather.sun)) * day * (1 - rain) * (1 - Math.min(1, wind / 3)),
    speed: .5 + wind * .85,
  };
}

const declarations = /* glsl */`
uniform float driftTime, driftLeaves, driftMotes, driftSpeed;
uniform vec3 driftBox;
uniform vec2 driftWind;
attribute vec4 driftSeed;
attribute float driftKind;
attribute vec4 driftSource;
varying float vDriftMote;
mat3 driftRotation(vec3 axis, float angle) {
  float s = sin(angle), c = cos(angle), t = 1.0 - c;
  return mat3(t * axis.x * axis.x + c, t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
              t * axis.x * axis.y - s * axis.z, t * axis.y * axis.y + c, t * axis.y * axis.z + s * axis.x,
              t * axis.x * axis.z + s * axis.y, t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c);
}
`;
const motion = /* glsl */`
bool driftMote = driftKind > .5;
// Leaves fall and are carried downwind, swinging side to side; motes barely move.
vec3 driftVelocity = driftMote ? vec3(driftWind.x * driftSpeed * .08, .02, driftWind.y * driftSpeed * .08)
                               : vec3(driftWind.x * driftSpeed, -.45 - driftSeed.w * .35, driftWind.y * driftSpeed);
vec3 driftCell = driftBox * 2.0;
vec3 driftPoint = driftSeed.xyz * driftCell + driftVelocity * driftTime;
float driftClock = driftTime * (driftMote ? .35 : 1.6) + driftSeed.w * 40.0;
driftPoint += driftMote ? vec3(sin(driftClock), sin(driftClock * .7 + 1.0) * .6, cos(driftClock * .8)) * .25
                        : vec3(sin(driftClock) * .55, abs(sin(driftClock)) * .25, cos(driftClock * .9) * .35);
// Wrap into a box that follows the camera, more of it below eye height than above.
vec3 driftCentre = cameraPosition + vec3(0.0, driftBox.y * .35, 0.0);
driftPoint = mod(driftPoint - driftCentre + driftBox, driftCell) - driftBox + driftCentre;
vec3 driftEdge = abs(driftPoint - driftCentre) / driftBox;
float driftFade = 1.0 - smoothstep(.75, 1.0, max(driftEdge.x, max(driftEdge.y, driftEdge.z)));
float driftShown = step(driftSeed.w, driftMote ? driftMotes : driftLeaves);
if (!driftMote) {
  // A fall followed by an equally long quiet gap. Tall canopies get longer falls. Sources are actual
  // plants in world space, so moving the camera cannot carry leaves onto the bay.
  float duration = max(4.5 + driftSeed.z * 2.5, driftSource.w / (.65 + driftSeed.w * .25));
  float cycle = fract(driftTime / (duration * 2.0) + driftSeed.x);
  float fall = clamp(cycle / .5, 0.0, 1.0);
  // Start on the sampled foliage surface. Lateral travel grows only after release.
  vec2 offset = driftWind * fall * (2.0 + driftSeed.x + driftSpeed * .8)
              + vec2(sin(driftClock), cos(driftClock * .9)) * .35 * sin(fall * 3.1416);
  driftPoint = driftSource.xyz + vec3(offset.x, mix(driftSource.w, .15, fall), offset.y);
  driftFade = smoothstep(0.0, .015, fall) * (1.0 - smoothstep(.88, 1.0, fall));
  driftFade *= 1.0 - smoothstep(14.0, 22.0, distance(cameraPosition, driftPoint));
  driftShown *= step(.01, driftSource.w);
}
mat3 driftSpin = driftRotation(normalize(driftSeed.xyz - .5 + vec3(0.0, .01, 0.0)), driftClock * (driftMote ? .5 : 2.3));
`;

/** World-space foliage point: x/z on the blade/crown, y at the landing base, height up to release. */
export interface DriftSource { x: number; y: number; z: number; height: number }

/** Sample real foliage vertices after world transforms, before meshes are batched.
 * Keeping the base separate also makes rooftop leaves land on their own planter. */
export function foliageDriftSources(mesh: THREE.Mesh, ground: number): DriftSource[] {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position'), point = new THREE.Vector3();
  const unique = new Map<string, DriftSource>();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    if (point.y <= ground + .1) continue;
    const key = `${point.x.toFixed(4)}:${point.y.toFixed(4)}:${point.z.toFixed(4)}`;
    unique.set(key, { x: point.x, y: ground, z: point.z, height: point.y - ground });
  }
  const points = [...unique.values()];
  // A bounded selection per crown/frond, including the end of its vertex list.
  return points.length <= 16 ? points : Array.from({ length: 16 }, (_, i) => points[Math.round(i * (points.length - 1) / 15)]);
}

/** A pointed blade folded along its midrib, with an asymmetric outline and a short stem.
 * Twelve triangles, matching the dust cube, keep both in the same merged draw. */
function leafGeometry() {
  const rim = [
    [0, 0, .065], [-.014, .001, .041], [-.029, 0, .015], [-.032, -.003, -.012],
    [-.021, -.002, -.039], [0, 0, -.055], [.018, -.003, -.039],
    [.028, -.002, -.013], [.025, .001, .016], [.012, .002, .043],
  ];
  const vertices: number[] = [];
  for (let i = 0; i < rim.length; i++) vertices.push(0, .006, 0, ...rim[i], ...rim[(i + 1) % rim.length]);
  vertices.push(-.002, 0, -.052, -.001, -.002, -.075, .002, 0, -.052,
    .002, 0, -.052, -.001, -.002, -.075, .002, -.002, -.074);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createAmbientDrift(scene: THREE.Scene, options: { leafColors?: readonly string[]; moteColor?: string; leafSources?: readonly DriftSource[] } = {}) {
  const leafColors = (options.leafColors ?? ['#5f8a3a', '#7a9a3c', '#a8923e', '#8a6a3a', '#4e7a3a']).map(c => new THREE.Color(c));
  const moteColor = new THREE.Color(options.moteColor ?? '#fff1cf');
  const count = DRIFT_COUNT.ultra;
  // One merged mesh: folded leaf blades and cubes shrunk to dust specks.
  // Its vertices are parked far below the world, so passes that draw the scene
  // with an override material (normals for ambient occlusion) never see them;
  // only this material lifts them into the air round the camera.
  const cube = new THREE.BoxGeometry(.12, .016, .09), block = cube.toNonIndexed(), leaf = leafGeometry();
  cube.dispose();
  const corners = block.getAttribute('position').count, indices = corners;
  const positions = new Float32Array(count * corners * 3), normals = new Float32Array(count * corners * 3), colors = new Float32Array(count * corners * 3);
  const sources = new Float32Array(count * corners * 4);
  const planting = options.leafSources ?? [], home = new Int32Array(count).fill(-1), nearby: number[] = [];
  let homedAt = -Infinity, picks = 0;
  const seeds = new Float32Array(count * corners * 4), kinds = new Float32Array(count * corners), index = new Uint32Array(count * indices);
  // Hash-style seeds: deterministic, so every visit looks the same.
  const random = (i: number, salt: number) => { const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const mote = i % 3 === 2;
    const template = mote ? block : leaf, particlePosition = template.getAttribute('position'), particleNormal = template.getAttribute('normal');
    const size = mote ? 1 : .8 + random(i, 8) * .3;
    if (!mote && planting.length) home[i] = Math.floor(random(i, 6) * planting.length);
    const source = planting[home[i]];
    color.copy(mote ? moteColor : leafColors[i % leafColors.length]).multiplyScalar(mote ? 1 : .85 + random(i, 5) * .3);
    for (let v = 0; v < corners; v++) {
      const at = i * corners + v;
      positions.set([particlePosition.getX(v) * size, particlePosition.getY(v) * size + PARK, particlePosition.getZ(v) * size], at * 3);
      if (!mote && source) sources.set([source.x, source.y, source.z, source.height], at * 4);
      normals.set([particleNormal.getX(v), particleNormal.getY(v), particleNormal.getZ(v)], at * 3);
      // A lighter midrib and darker stem read naturally without an alpha texture.
      const shade = mote ? 1 : v >= 30 ? .62 : v % 3 === 0 ? 1.16 : .92;
      colors.set([color.r * shade, color.g * shade, color.b * shade], at * 3);
      seeds.set([random(i, 1), random(i, 2), random(i, 3), random(i, 4)], at * 4); kinds[at] = mote ? 1 : 0;
    }
    for (let k = 0; k < indices; k++) index[i * indices + k] = k + i * corners;
  }
  block.dispose(); leaf.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('driftSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('driftSource', new THREE.BufferAttribute(sources, 4));
  geometry.setAttribute('driftKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const material = new THREE.MeshStandardMaterial({ roughness: .85, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  const uniforms = {
    driftTime: { value: 0 }, driftLeaves: { value: 0 }, driftMotes: { value: 0 }, driftSpeed: { value: 0 },
    driftBox: { value: BOX.clone() }, driftWind: { value: WIND_DIRECTION.clone() },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${declarations}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${motion}\nobjectNormal = driftSpin * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vDriftMote = driftMote ? 1.0 : 0.0;
transformed = driftSpin * ((transformed - vec3(0.0, ${PARK.toFixed(1)}, 0.0)) * (driftMote ? vec3(.12, .9, .16) : vec3(1.0))) * driftFade * driftShown + driftPoint;`);
    // Enough reflected light to read as specks in the sun, short of glowing flecks.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDriftMote;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vDriftMote * .35;');
  };
  material.customProgramCacheKey = () => 'ambient-drift-v4';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ambient-drift';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.raycast = () => {};
  // Effects keep their own material under thermal vision and are skipped by the night and haze patches.
  mesh.userData.fpsEffect = true;
  mesh.visible = false;
  scene.add(mesh);
  const sourceAttribute = geometry.getAttribute('driftSource') as THREE.BufferAttribute;
  // Leaves are dealt across every plant in the district, so few would ever fall
  // in view. A few times a second, any leaf whose plant is too far to be seen
  // and which is between falls is moved to a plant near the camera.
  const rehome = (time: number, eye: THREE.Vector3) => {
    if (!planting.length || Math.abs(time - homedAt) < .25) return;
    homedAt = time; nearby.length = 0;
    const away = (s: DriftSource) => Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z);
    planting.forEach((s, at) => { if (away(s) < LEAF_REACH) nearby.push(at); });
    if (!nearby.length) return;
    let moved = false;
    for (let i = 0; i < count; i++) {
      if (home[i] < 0 || away(planting[home[i]]) < LEAF_HIDDEN) continue;
      const duration = Math.max(4.5 + random(i, 3) * 2.5, planting[home[i]].height / (.65 + random(i, 4) * .25));
      const turn = time / (duration * 2) + random(i, 1);
      if (turn - Math.floor(turn) < .52) continue; // mid-fall (same cycle as the shader)
      const next = nearby[Math.floor(random(i, 7 + picks++) * nearby.length)], s = planting[next];
      const nextDuration = Math.max(4.5 + random(i, 3) * 2.5, s.height / (.65 + random(i, 4) * .25));
      const nextTurn = time / (nextDuration * 2) + random(i, 1);
      if (nextTurn - Math.floor(nextTurn) < .52) continue; // new canopy must also be between falls
      home[i] = next;
      const height = s.height;
      for (let v = 0; v < corners; v++) sources.set([s.x, s.y, s.z, height], (i * corners + v) * 4);
      moved = true;
    }
    if (moved) sourceAttribute.needsUpdate = true;
  };
  return {
    mesh,
    /** `eye` is the camera's world position; without it leaves stay where they were dealt. */
    update(time: number, weather: AmbientDriftWeather, eye?: THREE.Vector3) {
      const amounts = driftAmounts(weather);
      if (eye && amounts.leaves > .001) rehome(time, eye);
      // Phones draw half as many; the seeds are uniform, so the first n are an even spread.
      const shown = Math.min(count, Math.round(DRIFT_COUNT[weather.detail] * (weather.mobile ? .5 : 1)));
      geometry.setDrawRange(0, shown * indices);
      mesh.visible = shown > 0 && (amounts.leaves > .001 || amounts.motes > .001);
      uniforms.driftTime.value = time; uniforms.driftLeaves.value = amounts.leaves; uniforms.driftMotes.value = amounts.motes; uniforms.driftSpeed.value = amounts.speed;
    },
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); },
  };
}
export type AmbientDrift = ReturnType<typeof createAmbientDrift>;
