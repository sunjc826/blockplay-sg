import * as THREE from 'three';

/**
 * Light thrown by things on the move at night (a flare drifting down, a
 * rocket's motor, a burst overhead) onto whatever is near them. Not three's
 * point lights: a fixed handful of slots read by the night shader every lit
 * material already runs (world-night-lights), each a plain diffuse falloff
 * with no specular and no shadow. The slot count never changes, so nothing
 * recompiles as sources come and go, and a pixel out of every source's reach
 * costs a distance check per slot in use.
 */

export const MOVING_LIGHTS = 8;

export interface LightSource {
  x: number; y: number; z: number;
  /** Linear colour; multiplied by `intensity`. */
  colour: THREE.Color;
  /** Brightness at the source: 1 is about a streetlamp's pool. */
  intensity: number;
  /** Metres beyond which it lights nothing. */
  reach: number;
}

/**
 * How much a source matters from where the camera is: bright and near beats
 * bright and far, and anything whose reach covers the camera counts in full.
 */
export function lightScore(source: LightSource, camera: { x: number; y: number; z: number }) {
  const d = Math.hypot(source.x - camera.x, source.y - camera.y, source.z - camera.z), clear = Math.max(0, d - source.reach);
  return source.intensity * source.reach * source.reach / (source.reach * source.reach + clear * clear);
}
/** The `count` sources that matter most from `camera`, best first. */
export function pickLights(sources: readonly LightSource[], camera: { x: number; y: number; z: number }, count = MOVING_LIGHTS) {
  return sources.filter(s => s.intensity > 0 && s.reach > 0).map(s => ({ s, score: lightScore(s, camera) }))
    .sort((a, b) => b.score - a.score).slice(0, count).map(e => e.s);
}

/**
 * How much light a source puts on a surface `distance` metres away, before
 * colour and facing: inverse-square softened near the source, windowed to
 * zero at `reach`. The shader below computes the same.
 */
export function lightFalloff(distance: number, reach: number) {
  if (distance >= reach) return 0;
  const q = distance * distance / (reach * reach), window = (1 - q) * (1 - q);
  return window / (1 + 25 * q);
}

export function createMovingLights() {
  const uniforms = {
    movingLight: { value: Array.from({ length: MOVING_LIGHTS }, () => new THREE.Vector4()) },
    movingColour: { value: Array.from({ length: MOVING_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    movingCount: { value: 0 },
  };
  return {
    uniforms,
    /** Fills the slots from this frame's sources, chosen from the camera; `level` dims them all (0 by day). */
    set(sources: readonly LightSource[], camera: { x: number; y: number; z: number }, level: number) {
      const chosen = level > .001 ? pickLights(sources, camera) : [];
      chosen.forEach((s, i) => {
        uniforms.movingLight.value[i].set(s.x, s.y, s.z, s.reach);
        uniforms.movingColour.value[i].copy(s.colour).multiplyScalar(s.intensity * level);
      });
      uniforms.movingCount.value = chosen.length;
    },
  };
}

/** Uniform declarations for a fragment shader's preamble. */
export const MOVING_LIGHTS_DECLARATIONS = `uniform vec4 movingLight[${MOVING_LIGHTS}]; uniform vec3 movingColour[${MOVING_LIGHTS}]; uniform int movingCount;`;
/**
 * Adds the moving lights to `totalEmissiveRadiance`, given the fragment's
 * world position `world`, unit normal `normal` and `albedo`. Faces turned
 * away still catch a little, as light off the street and the haze would.
 */
export function movingLightsChunk(world: string, normal: string, albedo: string) {
  return `for (int i = 0; i < ${MOVING_LIGHTS}; i++) {
      if (i >= movingCount) break;
      vec3 toLight = movingLight[i].xyz - ${world}; float reach = movingLight[i].w, distance2 = dot(toLight, toLight);
      if (distance2 >= reach * reach) continue;
      float q = distance2 / (reach * reach), window = (1.0 - q) * (1.0 - q);
      float facing = .15 + .85 * max(dot(${normal}, toLight * inversesqrt(max(distance2, 1e-4))), 0.0);
      totalEmissiveRadiance += ${albedo} * movingColour[i] * window / (1.0 + 25.0 * q) * facing;
    }`;
}
