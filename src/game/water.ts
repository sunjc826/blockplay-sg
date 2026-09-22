import * as THREE from 'three';

/**
 * Open water: a surface a round can splash into rather than a floor it chips.
 *
 * Two halves. `markWater` is the cheap one: it only tags a material, so any
 * district's flat water boxes — batched into instanced meshes or not — tell the
 * engine "this is water" and a shot into them throws spray instead of sparks.
 *
 * `createWaterMaterial` is the full surface, used where the water is big enough
 * to be looked at (Marina Bay). It is one shader, no render targets: the sky is
 * not re-rendered for reflections, it is approximated from two colours and the
 * reflected ray's elevation, which on a software renderer is the difference
 * between water and a slideshow. Per fragment it
 *
 *  - sums a handful of travelling sine waves into a surface slope (so the
 *    normal moves, even though the mesh is flat enough to raycast as a plane),
 *  - adds the ring ripples shots have dropped into it, each a damped wave
 *    packet expanding from where the round went in,
 *  - mixes body colour and reflected sky by Schlick's Fresnel term — near-clear
 *    looking straight down, a mirror at a grazing angle, which is most of what
 *    makes a flat plane read as water — and adds a sharp sun glint.
 *
 * Opacity follows the same Fresnel term, so a bed laid under the surface shows
 * through where the player looks down into the basin and vanishes at range.
 */

/** How many shot ripples the shader tracks at once; the oldest is overwritten. */
export const MAX_WATER_RIPPLES = 12;
/** Seconds a ripple lives, and the speed its ring spreads at in metres per second. */
export const RIPPLE_LIFE = 2.6, RIPPLE_SPEED = 1.6;

/** Tags any material as water, so a raycast that strikes it knows. */
export function markWater<T extends THREE.Material>(...materials: T[]) {
  for (const material of materials) material.userData.fpsWater = true;
  return materials[0];
}

/**
 * Is what a ray struck water? The mesh or its material can carry the tag, and
 * a batched instanced mesh keeps the material it was built from, so either
 * survives a district's static batching.
 */
export function isWaterObject(object: THREE.Object3D) {
  if (object.userData.fpsWater) return true;
  const material = (object as THREE.Mesh).material;
  if (!material) return false;
  return Array.isArray(material) ? material.some(m => m.userData.fpsWater) : !!material.userData.fpsWater;
}

export interface WaterOptions {
  /** Colour of the water body seen straight down. */
  deep: string;
  /** Colour it lightens to where waves face the viewer. */
  shallow: string;
  /** Reflected sky overhead and at the horizon. */
  sky: string; horizon: string;
  /** Direction *towards* the sun, for the glint. */
  sun: THREE.Vector3;
  /** Floor opacity when looking straight down; the rim is always opaque. */
  clarity?: number;
  /** Overall wave height scale. The bay is sheltered, so the default is small. */
  choppiness?: number;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uChop;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // A slow swell moves the vertices; the fine chop lives only in the normal.
    world.y += uChop * (0.05 * sin(world.x * 0.09 + uTime * 0.7) + 0.035 * sin(world.z * 0.13 - uTime * 0.9));
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #define RIPPLES ${MAX_WATER_RIPPLES}
  uniform float uTime;
  uniform float uChop;
  uniform float uClarity;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  // xy = centre on the surface (world x, z), z = birth time, w = strength.
  uniform vec4 uRipples[RIPPLES];
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  // Slope contribution of one travelling wave: d/dx, d/dz of a*sin(k.p - wt).
  vec2 wave(vec2 p, vec2 dir, float k, float a, float w) {
    return dir * (a * k * cos(dot(p, dir) * k - uTime * w));
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 slope = vec2(0.0);
    slope += wave(p, normalize(vec2(0.8, 0.6)), 0.55, 0.035, 1.3);
    slope += wave(p, normalize(vec2(-0.5, 0.86)), 0.9, 0.022, 1.9);
    slope += wave(p, normalize(vec2(0.2, -1.0)), 1.7, 0.012, 2.7);
    slope += wave(p, normalize(vec2(-0.95, -0.3)), 3.1, 0.006, 3.6);
    slope *= uChop;

    float foam = 0.0;
    for (int i = 0; i < RIPPLES; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (r.w <= 0.0 || age < 0.0 || age > ${RIPPLE_LIFE.toFixed(2)}) continue;
      vec2 offset = p - r.xy;
      float d = length(offset);
      // A packet of rings trailing the front: the front runs outwards at a
      // steady speed while the amplitude falls with age (damping) and with
      // radius (the same energy spread over a longer ring).
      float front = age * ${RIPPLE_SPEED.toFixed(2)};
      float behind = front - d;
      float envelope = exp(-behind * behind * 3.0) * step(0.0, behind + 0.35);
      float decay = r.w * exp(-age * 1.6) / (1.0 + d * 1.4);
      float phase = behind * 11.0;
      float dh = cos(phase) * envelope * decay;
      slope += (d > 1e-3 ? offset / d : vec2(0.0)) * dh * 0.9;
      // Fresh white water where the round broke the surface.
      foam += r.w * exp(-age * 3.2) * smoothstep(0.5 + age * 0.9, 0.0, d);
    }

    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 toEye = normalize(cameraPosition - vWorld);
    float facing = clamp(dot(normal, toEye), 0.0, 1.0);
    // Schlick's approximation with water's F0 of about 0.02.
    // Capped below a perfect mirror: the chop scatters part of a grazing
    // reflection back into the body colour, and at range that is most of it.
    float fresnel = min(0.02 + 0.98 * pow(1.0 - facing, 5.0), 0.78);

    vec3 reflected = reflect(-toEye, normal);
    vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.45, reflected.y));
    vec3 body = mix(uDeep, uShallow, clamp(facing * 0.6 + slope.x * 2.0, 0.0, 1.0) * 0.55);
    vec3 colour = mix(body, sky, fresnel);
    float glint = pow(max(dot(reflected, uSun), 0.0), 380.0);
    colour += vec3(1.0, 0.96, 0.86) * glint * 2.4;
    colour = mix(colour, vec3(0.9, 0.96, 0.97), clamp(foam, 0.0, 0.85));

    float alpha = clamp(mix(uClarity, 1.0, fresnel) + glint + foam, 0.0, 1.0);
    gl_FragColor = vec4(colour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export type WaterMaterial = THREE.ShaderMaterial & {
  userData: { fpsWater: true; ripple: (x: number, z: number, strength?: number) => void; setTime: (seconds: number) => void };
};

export function createWaterMaterial(options: WaterOptions): WaterMaterial {
  const ripples = Array.from({ length: MAX_WATER_RIPPLES }, () => new THREE.Vector4(0, 0, -1e3, 0));
  let next = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uChop: { value: options.choppiness ?? 1 },
      uClarity: { value: options.clarity ?? 0.62 },
      uDeep: { value: new THREE.Color(options.deep) },
      uShallow: { value: new THREE.Color(options.shallow) },
      uSky: { value: new THREE.Color(options.sky) },
      uHorizon: { value: new THREE.Color(options.horizon) },
      uSun: { value: options.sun.clone().normalize() },
      uRipples: { value: ripples },
    }]),
    vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false,
  }) as WaterMaterial;
  // UniformsUtils.merge clones values; keep writing to the array the shader reads.
  const live = material.uniforms.uRipples.value as THREE.Vector4[];
  material.userData.fpsWater = true;
  /** Drops a ring into the surface at world (x, z), aged from the current time. */
  material.userData.ripple = (x, z, strength = 1) => {
    live[next].set(x, z, material.uniforms.uTime.value, Math.max(0, Math.min(1.5, strength)));
    next = (next + 1) % MAX_WATER_RIPPLES;
  };
  material.userData.setTime = seconds => { material.uniforms.uTime.value = seconds; };
  return material;
}

/** Hands a shot's ripple to whatever water it struck, if that water can take one. */
export function rippleWater(object: THREE.Object3D, x: number, z: number, strength = 1) {
  const material = (object as THREE.Mesh).material;
  const target = Array.isArray(material) ? material.find(m => m.userData.ripple) : material;
  (target?.userData.ripple as ((x: number, z: number, s: number) => void) | undefined)?.(x, z, strength);
}
