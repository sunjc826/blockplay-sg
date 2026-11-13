import * as THREE from 'three';
import type { LightingState } from './world-lighting';
import { WATER_WAVES } from './water-wave-state';

/**
 * Open water: a surface a round can splash into rather than a floor it chips.
 *
 * Two halves. `markWater` is the cheap one: it only tags a material, so any
 * district's flat water boxes — batched into instanced meshes or not — tell the
 * engine "this is water" and a shot into them throws spray instead of sparks.
 *
 * `createWaterMaterial` is the full surface, used where the water is big enough
 * to be looked at (Marina Bay). Its baseline sky reflection is procedural;
 * Ultra can supply a bounded planar scene capture through water-reflections.
 * Rain rings stay in the surface shader. Per fragment it
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

// Shared sampling keeps displaced geometry, reflection normals and refraction in phase.
const waveField = /* glsl */ `
  uniform sampler2D uWaveMap;
  uniform float uWaveReady, uWaveHeight;
  uniform vec2 uWaveOrigin;
  uniform vec4 uWaveBounds;
  const float waveSpan=${WATER_WAVES.span.toFixed(1)};
  const float waveTexel=1.0/${WATER_WAVES.size.toFixed(1)};
  float waveWeight(vec2 p, float baseHeight) {
    if (uWaveReady<.5 || abs(baseHeight-uWaveHeight)>.02) return 0.0;
    vec2 local=p-uWaveOrigin;
    float edge=min(min(local.x,local.y),min(waveSpan-local.x,waveSpan-local.y));
    return smoothstep(0.0,3.0,edge);
  }
  float waveHeight(vec2 p, float baseHeight) {
    return texture2D(uWaveMap,(p-uWaveOrigin)/waveSpan).r*waveWeight(p,baseHeight);
  }
`;

const vertexShader = /* glsl */ `
  ${waveField}
  attribute float waterPatch;
  varying float vWaterPatch;
  uniform float uTime;
  uniform float uChop;
  varying vec3 vWorld;
  varying float vBaseHeight;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vBaseHeight = world.y;
    vWaterPatch = waterPatch;
    if (waterPatch>.5 && uWaveReady>.5) world.y += waveHeight(world.xz,vBaseHeight);
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
  ${waveField}
  varying float vWaterPatch;
  uniform float uTime;
  uniform float uChop;
  uniform float uClarity;
  uniform float uRain;
  uniform float uUltra;
  uniform float uRefractionReady;
  uniform float uRefractionHeight;
  uniform sampler2D uSceneColor;
  uniform sampler2D uSceneDepth;
  uniform vec2 uViewport;
  uniform vec2 uCameraRange;
  uniform mat4 uInverseViewProjection;
  uniform float uReflectionReady;
  uniform float uReflectionHeight;
  uniform sampler2D uReflectionMap;
  uniform mat4 uReflectionMatrix;
  varying float vBaseHeight;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform float uSurfaceLight;
  uniform float uGlintStrength;
  uniform vec3 uGlintColor;
  // xy = centre on the surface (world x, z), z = birth time, w = strength.
  uniform vec4 uRipples[RIPPLES];
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  // Slope contribution of one travelling wave: d/dx, d/dz of a*sin(k.p - wt).
  vec2 wave(vec2 p, vec2 dir, float k, float a, float w) {
    float phase = dot(p, dir) * k - uTime * w;
    // Remove frequencies that cannot be resolved by this pixel (especially at the horizon).
    float footprint = max(abs(dFdx(phase)), abs(dFdy(phase)));
    return dir * (a * k * cos(phase)) * (1.0 - smoothstep(1.0, 3.14159, footprint));
  }

  // Analytic gradients of smooth value noise: two advected scales provide
  // irregular wind ripples without texture assets or finite-difference reads.
  float waterHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  vec2 windSlope(vec2 p) {
    vec2 cell=floor(p), f=fract(p), u=f*f*(3.0-2.0*f), du=6.0*f*(1.0-f);
    float a=waterHash(cell), b=waterHash(cell+vec2(1,0));
    float c=waterHash(cell+vec2(0,1)), d=waterHash(cell+vec2(1,1));
    return du*vec2(mix(b-a,d-c,u.y),mix(c-a,d-b,u.x));
  }
  float viewDepth(float depth) {
    return uCameraRange.x*uCameraRange.y /
      (uCameraRange.y-depth*(uCameraRange.y-uCameraRange.x));
  }
  vec3 scenePosition(vec2 uv, float depth) {
    vec4 world=uInverseViewProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
    return world.xyz/world.w;
  }

  void main() {
    vec2 p = vWorld.xz;
    float simulated=waveWeight(p,vBaseHeight);
    if (uWaveReady>.5 && abs(vBaseHeight-uWaveHeight)<.02) {
      vec2 local=p-uWaveOrigin;
      // Keep a narrow underlying border so MSAA coverage at the patch edge
      // cannot leave subpixel holes between the two independently rasterized meshes.
      bool inPatch=all(greaterThan(local,vec2(.2))) && all(lessThan(local,vec2(waveSpan-.2)));
      if (vWaterPatch<.5 && inPatch) discard;
      if (vWaterPatch>.5 && (any(lessThan(p,uWaveBounds.xy)) || any(greaterThan(p,uWaveBounds.zw)))) discard;
    }
    float waterFootprint = max(length(dFdx(p)), length(dFdy(p)));
    vec2 slope = vec2(0.0);
    slope += wave(p, normalize(vec2(0.8, 0.6)), 0.55, 0.035, 1.3);
    slope += wave(p, normalize(vec2(-0.5, 0.86)), 0.9, 0.022, 1.9);
    slope += wave(p, normalize(vec2(0.2, -1.0)), 1.7, 0.012, 2.7);
    slope += wave(p, normalize(vec2(-0.95, -0.3)), 3.1, 0.006, 3.6);
    if (uUltra > .5) {
      // The broad swell's shading agrees with its actual vertex displacement.
      slope += vec2(.0045*cos(p.x*.09+uTime*.7),.00455*cos(p.y*.13-uTime*.9));
      mat2 turn=mat2(.8,.6,-.6,.8);
      float wind=1.0+uRain*.45;
      slope += windSlope(p*2.7+vec2(uTime*.22,-uTime*.14))*.045*wind
        *(1.0-smoothstep(.12,.65,waterFootprint));
      slope += turn*windSlope(mat2(.8,-.6,.6,.8)*p*7.3+vec2(-uTime*.31,uTime*.19))*.022*wind
        *(1.0-smoothstep(.04,.25,waterFootprint));
    }
    slope *= uChop;
    if (simulated>0.0) {
      vec2 stepX=vec2(waveSpan*waveTexel,0),stepZ=stepX.yx;
      vec2 waveSlope=vec2(waveHeight(p+stepX,vBaseHeight)-waveHeight(p-stepX,vBaseHeight),
        waveHeight(p+stepZ,vBaseHeight)-waveHeight(p-stepZ,vBaseHeight))/(2.0*waveSpan*waveTexel);
      slope += waveSlope*(1.0-smoothstep(.08,.3,waterFootprint));
    }

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
      float dh = cos(phase) * envelope * decay * (1.0 - smoothstep(1.0, 3.14159, 11.0 * waterFootprint));
      slope += (d > 1e-3 ? offset / d : vec2(0.0)) * dh * 0.9 * (1.0-simulated);
      // Fresh white water where the round broke the surface.
      foam += mix(1.0,.12,simulated) * r.w * exp(-age * 3.2) * smoothstep(0.5 + age * 0.9, 0.0, d);
    }

    // Small, short-lived rain rings deform the surface itself, never floating
    // white wire circles. Two staggered cell layers avoid a regular grid.
    float rainFoam = 0.0;
    if (uRain > .01) for (int layer=0; layer<2; layer++) {
      vec2 cell=floor(p*1.25+float(layer)*.5);
      float seed=fract(sin(dot(cell,vec2(127.1,311.7))+float(layer)*43.1)*43758.5453);
      float age=fract(uTime*.9+seed*7.0);
      vec2 centre=(cell+vec2(.28+.44*seed,.28+.44*fract(seed*13.7))-float(layer)*.5)/1.25;
      vec2 delta=p-centre;float d=length(delta),radius=age*.24;
      float ringWidth=sqrt(1.0/(95.0*95.0)+.25*waterFootprint*waterFootprint);
      float ring=exp(-pow((d-radius)/ringWidth,2.0))/(95.0*ringWidth)*(1.0-smoothstep(.25,.65,age))*smoothstep(0.0,.06,age);
      float amount=uRain*(.5+seed*.5)*(1.0-smoothstep(20.0,65.0,distance(cameraPosition.xz,p)));
      slope += delta/max(d,.001)*ring*amount*.08;
      rainFoam += ring*amount*.035;
    }
    foam += rainFoam;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 toEye = normalize(cameraPosition - vWorld);
    float facing = clamp(dot(normal, toEye), 0.0, 1.0);
    // Schlick's approximation with water's F0 of about 0.02.
    // Capped below a perfect mirror: the chop scatters part of a grazing
    // reflection back into the body colour, and at range that is most of it.
    float fresnel = min(0.02 + 0.98 * pow(1.0 - facing, 5.0), mix(0.78,0.96,uUltra));

    vec3 reflected = reflect(-toEye, normal);
    vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.45, reflected.y));
    if (uReflectionReady > .5 && abs(vBaseHeight-uReflectionHeight)<.02) {
      vec4 projected=uReflectionMatrix*vec4(vWorld,1.0);
      // Resolve the larger angular deflection of nearby interactive crests.
      float distortion=mix(.018,.05+.025*(1.0-facing),uWaveReady);
      vec2 uv=projected.xy/projected.w + slope*distortion;
      if(projected.w>0.0 && all(greaterThan(uv,vec2(0.0))) && all(lessThan(uv,vec2(1.0)))) {
        float edge=smoothstep(0.0,.035,min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y)));
        vec3 captured=texture2D(uReflectionMap,uv).rgb;
        if (uUltra > .5) {
          // Mip filtering removes distant shimmer; the short vertical kernel
          // gives lights and silhouettes a soft, wind-stretched reflection.
          float blur=1.1+uRain*.8+(1.0-facing)*.8;
          vec2 spread=vec2(.0005,.0018)*(1.0+uRain);
          captured=texture2D(uReflectionMap,uv,blur).rgb*.5;
          captured+=texture2D(uReflectionMap,clamp(uv+spread,.001,.999),blur).rgb*.25;
          captured+=texture2D(uReflectionMap,clamp(uv-spread,.001,.999),blur).rgb*.25;
        }
        sky=mix(sky,captured,edge*mix(.9,.95,uUltra));
      }
    }
    vec3 body = mix(uDeep, uShallow, clamp(facing * 0.6 + slope.x * 2.0, 0.0, 1.0) * 0.55) * uSurfaceLight;
    bool refracting=uRefractionReady>.5 && abs(vBaseHeight-uRefractionHeight)<.02;
    if (refracting) {
      vec2 uv=gl_FragCoord.xy/uViewport;
      float surfaceDepth=viewDepth(gl_FragCoord.z);
      float opaqueDepth=texture2D(uSceneDepth,uv).x;
      float thickness=max(0.0,viewDepth(opaqueDepth)-surfaceDepth);
      vec3 viewNormal=mat3(viewMatrix)*normal;
      vec2 offset=viewNormal.xy*.025*min(thickness,2.0)/max(1.0,surfaceDepth*.12);
      float edge=smoothstep(0.0,.04,min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y)));
      vec2 refractedUv=clamp(uv+offset*edge,vec2(.001),vec2(.999));
      float displacedDepth=texture2D(uSceneDepth,refractedUv).x;
      vec3 behind=scenePosition(refractedUv,displacedDepth);
      // Never pull a foreground hull, quay or above-water object into the bay.
      if (displacedDepth>=.99999 || viewDepth(displacedDepth)<=surfaceDepth+.02 || behind.y>vBaseHeight+.02) {
        refractedUv=uv; displacedDepth=opaqueDepth;
        behind=scenePosition(uv,opaqueDepth);
      }
      float path=min(30.0,max(0.0,viewDepth(displacedDepth)-surfaceDepth)/max(.15,-normalize((viewMatrix*vec4(vWorld,1.0)).xyz).z));
      float depth=max(0.0,vBaseHeight-behind.y);
      vec3 transmission=exp(-vec3(.85,.38,.29)*path);
      if (displacedDepth>=.99999) transmission=vec3(0.0);
      vec3 scatter=mix(uShallow,uDeep,1.0-exp(-depth*.65))*uSurfaceLight;
      body=texture2D(uSceneColor,refractedUv).rgb*transmission+scatter*(1.0-transmission);
    }
    vec3 colour = mix(body, sky, fresnel);
    // Broaden subpixel highlights and conserve their energy instead of flashing single pixels.
    vec3 reflectionDx = dFdx(reflected), reflectionDy = dFdy(reflected);
    float glintVariance = .5 * (dot(reflectionDx, reflectionDx) + dot(reflectionDy, reflectionDy));
    float glintPower = 1.0 / (1.0 / 380.0 + glintVariance);
    float glint = pow(max(dot(reflected, uSun), 0.0), glintPower) * (glintPower / 380.0);
    colour += uGlintColor * glint * uGlintStrength;
    colour = mix(colour, vec3(0.9, 0.96, 0.97) * uSurfaceLight, clamp(foam, 0.0, 0.85));

    float alpha = clamp(mix(uClarity, 1.0, fresnel) + glint + foam, 0.0, 1.0);
    // Refraction already contains the bed colour: do not alpha-blend it twice.
    gl_FragColor = vec4(colour, refracting ? 1.0 : alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export type WaterMaterial = THREE.ShaderMaterial & {
  userData: {
    fpsWater: true;
    ripple: (x: number, z: number, strength?: number) => void;
    /** Optional Ultra simulation hook; cheap rings remain the fallback. */
    waveImpulse?: (x: number, z: number, strength: number) => void;
    waveCoverage?: (x: number, z: number, radius: number) => boolean;
    setTime: (seconds: number) => void;
    setRain: (intensity: number, reduced: boolean) => void;
    setLighting: (lighting: LightingState, sky: THREE.Color, horizon: THREE.Color, sunlight: number, blend: number) => void;
    resetLighting: () => void;
  };
};

export function createWaterMaterial(options: WaterOptions): WaterMaterial {
  const ripples = Array.from({ length: MAX_WATER_RIPPLES }, () => new THREE.Vector4(0, 0, -1e3, 0));
  let next = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uRain: { value: 0 },
      uUltra: { value: 0 },
      uWaveReady: { value: 0 }, uWaveMap: { value: null }, uWaveHeight: { value: 0 },
      uWaveOrigin: { value: new THREE.Vector2() }, uWaveBounds: { value: new THREE.Vector4() },
      uRefractionReady: { value: 0 },
      uRefractionHeight: { value: 0 },
      uSceneColor: { value: null }, uSceneDepth: { value: null },
      uViewport: { value: new THREE.Vector2(1,1) },
      uCameraRange: { value: new THREE.Vector2(.08,1000) },
      uInverseViewProjection: { value: new THREE.Matrix4() },
      uReflectionReady: { value: 0 },
      uReflectionHeight: { value: 0 },
      uReflectionMap: { value: null },
      uReflectionMatrix: { value: new THREE.Matrix4() },
      uChop: { value: options.choppiness ?? 1 },
      uClarity: { value: options.clarity ?? 0.62 },
      uDeep: { value: new THREE.Color(options.deep) },
      uShallow: { value: new THREE.Color(options.shallow) },
      uSky: { value: new THREE.Color(options.sky) },
      uHorizon: { value: new THREE.Color(options.horizon) },
      uSun: { value: options.sun.clone().normalize() },
      uSurfaceLight: { value: 1 },
      uGlintStrength: { value: 2.4 },
      uGlintColor: { value: new THREE.Color(1, .96, .86) },
      uRipples: { value: ripples },
    }]),
    vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false,
  }) as WaterMaterial;
  // UniformsUtils.merge clones values; keep writing to the array the shader reads.
  const live = material.uniforms.uRipples.value as THREE.Vector4[];
  Object.assign(material.defaultAttributeValues, { waterPatch: [0] });
  material.userData.fpsWater = true;
  /** Drops a ring into the surface at world (x, z), aged from the current time. */
  material.userData.ripple = (x, z, strength = 1) => {
    if (![x,z,strength].every(Number.isFinite)) return;
    strength = Math.max(0, Math.min(3, strength));
    material.userData.waveImpulse?.(x,z,strength);
    live[next].set(x, z, material.uniforms.uTime.value, strength);
    next = (next + 1) % MAX_WATER_RIPPLES;
  };
  material.userData.setTime = seconds => { material.uniforms.uTime.value = seconds; };
  material.userData.setRain = (intensity, reduced) => { material.uniforms.uRain.value = reduced ? 0 : THREE.MathUtils.clamp(intensity,0,1); };
  const daySky = new THREE.Color(options.sky), dayHorizon = new THREE.Color(options.horizon);
  const daySun = options.sun.clone().normalize();
  const targetSky = new THREE.Color(), targetHorizon = new THREE.Color(), targetGlint = new THREE.Color();
  const u = material.uniforms;
  material.userData.setLighting = (lighting, sky, horizon, sunlight, blend) => {
    // Reflections follow the same eased sky as the world; the water body and
    // fresh foam must also lose their daylight brightness after sunset.
    targetSky.lerpColors(daySky, sky, lighting.skyWeight);
    targetHorizon.lerpColors(dayHorizon, horizon, lighting.skyWeight);
    u.uSky.value.lerp(targetSky, blend); u.uHorizon.value.lerp(targetHorizon, blend);
    const weather = THREE.MathUtils.clamp(sunlight, .05, 1);
    const nightLight = .025 + .34 * lighting.keyScale + .10 * lighting.ambientScale;
    const surfaceLight = (1 - lighting.shift + lighting.shift * nightLight) * weather;
    u.uSurfaceLight.value += (surfaceLight - u.uSurfaceLight.value) * blend;
    const glint = 2.4 * weather * (1 - lighting.shift + lighting.shift * lighting.keyScale);
    u.uGlintStrength.value += (glint - u.uGlintStrength.value) * blend;
    targetGlint.setRGB(1, .96, .86).lerp(targetSky.set(lighting.keyColor), lighting.shift);
    u.uGlintColor.value.lerp(targetGlint, blend);
    u.uSun.value.set(lighting.key.x, lighting.key.y, lighting.key.z);
  };
  material.userData.resetLighting = () => {
    u.uRain.value=0;u.uReflectionReady.value=0;u.uRefractionReady.value=0;u.uUltra.value=0;u.uWaveReady.value=0;
    u.uSky.value.copy(daySky); u.uHorizon.value.copy(dayHorizon); u.uSun.value.copy(daySun);
    u.uSurfaceLight.value = 1; u.uGlintStrength.value = 2.4; u.uGlintColor.value.setRGB(1, .96, .86);
  };
  return material;
}

/** Hands a shot's ripple to whatever water it struck, if that water can take one. */
export function rippleWater(object: THREE.Object3D, x: number, z: number, strength = 1) {
  const material = (object as THREE.Mesh).material;
  const target = Array.isArray(material) ? material.find(m => m.userData.ripple) : material;
  (target?.userData.ripple as ((x: number, z: number, s: number) => void) | undefined)?.(x, z, strength);
}
