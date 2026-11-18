import * as THREE from 'three';

/**
 * What has just shaken the plants: bullet strikes and blasts ("hits"), and the
 * bodies pushing through grass. One small set of uniforms per scene, read by
 * the tree shader (tree-wind.ts) and the grass shader (ground-cover.ts), so a
 * frame costs a clock write and, while something is ringing, a short loop per
 * foliage vertex. With nothing ringing the loops run zero times.
 *
 * Presentation only. The geometry bullets, sight lines and movement test
 * against is the authored, undeformed one; nothing here is read back.
 * Reduced effects and reduced motion empty the field.
 */
export const MAX_FOLIAGE_HITS = 6, MAX_FOLIAGE_BODIES = 4;
/** Seconds a hit keeps ringing before it is dropped. */
export const FOLIAGE_HIT_LIFE = 3.2;
/** Hits this close in time and space are one event (a burst into the same crown). */
const MERGE_SECONDS = .12;

export interface FoliageBody { x: number; y: number; z: number; radius: number }
interface Field {
  clock: { value: number };
  hits: { value: THREE.Vector4[] };
  /** x: clock at the hit, y: strength. */
  times: { value: THREE.Vector2[] };
  count: { value: number };
  bodies: { value: THREE.Vector4[] };
  bodyCount: { value: number };
  reduced: boolean;
}
const fields = new WeakMap<THREE.Scene, Field>();
export function foliageField(scene: THREE.Scene): Field {
  let field = fields.get(scene);
  if (!field) {
    field = {
      clock: { value: 0 }, count: { value: 0 }, bodyCount: { value: 0 }, reduced: false,
      hits: { value: Array.from({ length: MAX_FOLIAGE_HITS }, () => new THREE.Vector4()) },
      times: { value: Array.from({ length: MAX_FOLIAGE_HITS }, () => new THREE.Vector2()) },
      bodies: { value: Array.from({ length: MAX_FOLIAGE_BODIES }, () => new THREE.Vector4()) },
    };
    fields.set(scene, field);
  }
  return field;
}

/** How hard a hit still pushes, 0..strength: full at its centre and at once, fading with distance and age. */
export function foliageHitLevel(age: number, distance: number, radius: number, strength: number) {
  if (age < 0 || age >= FOLIAGE_HIT_LIFE || distance >= radius) return 0;
  const t = Math.max(0, Math.min(1, (distance - radius * .35) / (radius * .65)));
  return strength * (1 - t * t * (3 - 2 * t)) * Math.exp(-age * 2.4);
}

/**
 * Something struck or burst at `point`. `radius` is how far plants feel it (m);
 * `strength` is about 1 for a rifle round and 4 to 6 for a shell.
 */
export function disturbFoliage(scene: THREE.Scene, point: { x: number; y: number; z: number }, radius: number, strength: number) {
  const field = foliageField(scene);
  if (field.reduced || !(radius > 0) || !(strength > 0)) return;
  const now = field.clock.value, hits = field.hits.value, times = field.times.value;
  let slot = -1;
  for (let i = 0; i < field.count.value; i++) {
    const hit = hits[i];
    if (now - times[i].x < MERGE_SECONDS && Math.hypot(hit.x - point.x, hit.y - point.y, hit.z - point.z) < Math.min(radius, hit.w) * .5) {
      // The same event again: keep the stronger and wider of the two, restarted.
      hit.set(point.x, point.y, point.z, Math.max(hit.w, radius)); times[i].set(now, Math.max(times[i].y, strength)); return;
    }
  }
  if (field.count.value < MAX_FOLIAGE_HITS) slot = field.count.value++;
  else {
    // Full: give up whichever is felt least by now, unless the newcomer is weaker still.
    let least = strength;
    for (let i = 0; i < MAX_FOLIAGE_HITS; i++) {
      const level = times[i].y * Math.exp(-(now - times[i].x) * 2.4);
      if (level < least) { least = level; slot = i; }
    }
    if (slot < 0) return;
  }
  hits[slot].set(point.x, point.y, point.z, radius); times[slot].set(now, strength);
}

/** Advance the clock and forget hits that have rung out. */
export function updateFoliageDisturbance(scene: THREE.Scene, dt: number, reduced: boolean) {
  const field = foliageField(scene);
  field.reduced = reduced;
  if (reduced) { field.count.value = 0; field.bodyCount.value = 0; return; }
  field.clock.value += Math.max(0, Math.min(.25, Number.isFinite(dt) ? dt : 0));
  const hits = field.hits.value, times = field.times.value;
  let kept = 0;
  for (let i = 0; i < field.count.value; i++) {
    if (field.clock.value - times[i].x >= FOLIAGE_HIT_LIFE) continue;
    if (kept !== i) { hits[kept].copy(hits[i]); times[kept].copy(times[i]); }
    kept++;
  }
  field.count.value = kept;
  // Keep the clock small enough for a float uniform to resolve a frame.
  if (!kept && field.clock.value > 600) field.clock.value = 0;
}

/** Who is standing or driving in the grass this frame: feet height and how wide a swathe they press. */
export function setFoliageBodies(scene: THREE.Scene, bodies: readonly FoliageBody[]) {
  const field = foliageField(scene);
  const count = field.reduced ? 0 : Math.min(MAX_FOLIAGE_BODIES, bodies.length);
  for (let i = 0; i < count; i++) field.bodies.value[i].set(bodies[i].x, bodies[i].y, bodies[i].z, bodies[i].radius);
  field.bodyCount.value = count;
}

export function foliageUniforms(scene: THREE.Scene) {
  const field = foliageField(scene);
  return { foliageClock: field.clock, foliageHits: field.hits, foliageHitTimes: field.times, foliageHitCount: field.count, foliageBodies: field.bodies, foliageBodyCount: field.bodyCount };
}

export const foliageDeclarations = /* glsl */`
uniform float foliageClock;
uniform vec4 foliageHits[${MAX_FOLIAGE_HITS}];
uniform vec2 foliageHitTimes[${MAX_FOLIAGE_HITS}];
uniform int foliageHitCount;
uniform vec4 foliageBodies[${MAX_FOLIAGE_BODIES}];
uniform int foliageBodyCount;
// x: how hard a hit still pushes at this point; y: seconds since it landed.
vec2 foliageHitLevel(int i, vec3 point) {
  float age = foliageClock - foliageHitTimes[i].x;
  float near = 1.0 - smoothstep(foliageHits[i].w * .35, foliageHits[i].w, distance(point, foliageHits[i].xyz));
  return vec2(foliageHitTimes[i].y * near * exp(-age * 2.4), age);
}
`;

/**
 * Tree parts: thrown away from the hit, then ringing back through rest and
 * settling in about two seconds; leaves also shiver. Adds to `treeOffset`,
 * using `treePoint`, `treeLevel`, `treePhase` and `treeFlutter` from tree-wind.
 */
export const foliageTreeShake = /* glsl */`
for (int i = 0; i < ${MAX_FOLIAGE_HITS}; i++) {
  if (i >= foliageHitCount) break;
  vec2 shake = foliageHitLevel(i, treePoint);
  if (shake.x < .001) continue;
  vec3 shakeAway = treePoint - foliageHits[i].xyz;
  vec2 shakeDir = shakeAway.xz / max(.05, length(shakeAway.xz));
  // Rooted: nothing moves at the ground, a trunk a little, a crown most.
  float shakeHold = min(1.0, treeLevel * 1.4) * (.3 + .7 * treeFlutter) * min(shake.x, 5.0);
  float shakeRing = cos(shake.y * 12.0 + treePhase * .3) * (1.0 - exp(-shake.y * 40.0));
  treeOffset.xz += shakeDir * shakeHold * shakeRing * .085;
  treeOffset += vec3(.5, 1.0, .5) * sin(shake.y * 31.0 + dot(treePoint, vec3(3.3, 2.1, 2.7))) * treeFlutter * min(shake.x, 3.0) * .03;
}
`;

/**
 * Grass: `grassLean` (tip travel as a share of blade height, world x/z) and
 * `grassFlat` (0 upright to 1 pressed down) for a tuft rooted at `grassRoot`.
 * Bodies part it outward; a blast lays it down away from the centre and it
 * springs back over a couple of seconds.
 */
export const foliageGrassPress = /* glsl */`
for (int i = 0; i < ${MAX_FOLIAGE_BODIES}; i++) {
  if (i >= foliageBodyCount) break;
  vec3 bodyAway = grassRoot - foliageBodies[i].xyz;
  float bodyDistance = length(bodyAway.xz);
  float bodyPress = (1.0 - smoothstep(foliageBodies[i].w * .4, foliageBodies[i].w, bodyDistance)) * (1.0 - smoothstep(.9, 1.6, abs(bodyAway.y)));
  grassLean += bodyAway.xz / max(.05, bodyDistance) * bodyPress * 1.1;
  grassFlat = max(grassFlat, bodyPress * .6);
}
for (int i = 0; i < ${MAX_FOLIAGE_HITS}; i++) {
  if (i >= foliageHitCount) break;
  vec2 shake = foliageHitLevel(i, grassRoot);
  if (shake.x < .001) continue;
  vec2 shakeAway = grassRoot.xz - foliageHits[i].xz;
  float shakeLie = min(1.0, shake.x * .45) * (1.0 - exp(-shake.y * 30.0));
  grassLean += shakeAway / max(.05, length(shakeAway)) * shakeLie * (1.0 + .3 * sin(shake.y * 10.0));
  grassFlat = max(grassFlat, shakeLie * .7);
}
`;
