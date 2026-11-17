import * as THREE from 'three';
import type { LightingState } from './world-lighting';
import { waterWaveField, waterNormalField } from './water-surface-field';

/**
 * Open water: a surface a round can splash into rather than a floor it chips.
 *
 * `createWaterMaterial` is the surface every body of water wears. Marina Bay
 * and the Sentosa beach build it over a modelled bed; the other districts get
 * it through `createDistrictWater` (scene-kit's `water`), on the slabs, discs
 * and falls they author, batched into instanced meshes or not. `markWater` only
 * tags a material as water, for tests and for anything that is wet but is not
 * a surface. The baseline sky reflection is procedural; Ultra can supply a
 * bounded planar scene capture through water-reflections for the one surface a
 * district names as primary.
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

type WaterMesh = THREE.Mesh<THREE.BufferGeometry, WaterMaterial>;
const isSurface = (object: THREE.Object3D): object is WaterMesh => object instanceof THREE.Mesh && !Array.isArray(object.material)
  && typeof object.material.userData.setLighting === 'function';

/** Where a water mesh's surface lies: the height most of its upward faces share, and the ground they cover. */
export interface WaterLevel {
  height: number; area: number;
  /** minX, minZ, maxX, maxZ of the faces at `height`. */
  bounds: THREE.Vector4;
  /** Every upward face at any height, as world x,z triples: the water's true outline, islands and bridge gaps cut out. */
  faces: Float32Array;
}
const levels = new WeakMap<THREE.Mesh, WaterLevel>();
/**
 * A bay is one plane, but a district's water is slabs: batched, re-cut around
 * whatever stands in it, sometimes at more than one height in one mesh. The
 * passes that need "the surface" read it from the faces rather than the origin.
 */
export function waterSurfaceLevel(mesh: THREE.Mesh): WaterLevel {
  const known = levels.get(mesh); if (known) return known;
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), faces: number[] = [], heights: number[] = [];
  const buckets = new Map<number, { area: number; weighted: number }>();
  const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
  for (let i = 0; i < instances; i++) {
    if (mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); } else matrix.copy(mesh.matrixWorld);
    for (let f = 0; f < (index?.count ?? position.count); f += 3) {
      [a, b, c].forEach((v, n) => v.fromBufferAttribute(position, index ? index.getX(f + n) : f + n).applyMatrix4(matrix));
      const size = normal.subVectors(b, a).cross(c.sub(a)).length();
      if (size < 1e-9 || normal.y < size * .99) continue;
      c.add(a);
      const y = (a.y + b.y + c.y) / 3, key = Math.round(y * 50), bucket = buckets.get(key) ?? { area: 0, weighted: 0 };
      bucket.area += size / 2; bucket.weighted += y * size / 2; buckets.set(key, bucket);
      faces.push(a.x, a.z, b.x, b.z, c.x, c.z); heights.push(y);
    }
  }
  let best: { area: number; weighted: number } | undefined;
  for (const bucket of buckets.values()) if (!best || bucket.area > best.area) best = bucket;
  const level: WaterLevel = { height: best ? best.weighted / best.area : mesh.getWorldPosition(a).y, area: best?.area ?? 0,
    bounds: new THREE.Vector4(Infinity, Infinity, -Infinity, -Infinity), faces: new Float32Array(faces) };
  heights.forEach((y, n) => {
    if (Math.abs(y - level.height) > .02) return;
    for (let k = 0; k < 6; k += 2) {
      const x = faces[n * 6 + k], z = faces[n * 6 + k + 1], r = level.bounds;
      r.set(Math.min(r.x, x), Math.min(r.y, z), Math.max(r.z, x), Math.max(r.w, z));
    }
  });
  levels.set(mesh, level); return level;
}

const chosen = new WeakMap<THREE.Scene, WaterMesh>();
/**
 * The one broad surface that owns a district's bounded Ultra buffers: the
 * planar reflection, the wave simulation and, over a modelled bed, refraction
 * and caustics. Marina Bay and the Sentosa beach are named; anywhere else it is
 * the largest body of water the district authored. Water at other heights keeps
 * the shared surface without those buffers.
 */
export function primaryWaterSurface(scene: THREE.Scene) {
  const named = scene.getObjectByName(scene.userData.primaryWater ?? 'marina-bay-water') as WaterMesh | undefined;
  if (named || scene.userData.primaryWater) return named;
  const known = chosen.get(scene); if (known?.parent) return known;
  let best: WaterMesh | undefined, area = 400;
  scene.traverse(object => {
    if (!isSurface(object) || object.userData.fpsEffect) return;
    const size = waterSurfaceLevel(object).area;
    if (size > area) { area = size; best = object; }
  });
  if (best) chosen.set(scene, best);
  return best;
}

/** Every material in the scene that wears the surface shader. */
export function waterSurfaceMaterials(scene: THREE.Scene) {
  const materials = new Set<WaterMaterial>();
  scene.traverse(object => { if (isSurface(object)) materials.add(object.material); });
  return materials;
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
  /** Scale of the vertex swell. Zero for coarse slabs, whose few corners would tilt rather than roll. */
  swell?: number;
  /** Falling water: faces seen side-on run with white streaks instead of standing still. */
  falls?: boolean;
  /** A surface with nothing modelled beneath it: drawn solid, writing depth like the ground around it. */
  opaque?: boolean;
}

const vertexShader = /* glsl */ `
  ${waterWaveField}
  ${waterNormalField}
  attribute float waterPatch;
  varying float vWaterPatch;
  varying vec3 vWorld;
  varying float vBaseHeight;
  uniform float uSwell;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  void main() {
    vec4 local = vec4(position, 1.0);
    // Districts batch their water boxes into instanced draws.
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    vec4 world = modelMatrix * local;
    vBaseHeight = world.y;
    vWaterPatch = waterPatch;
    if (waterPatch>.5 && uWaveReady>.5) world.y += waveHeight(world.xz,vBaseHeight);
    // A slow swell moves the vertices; the fine chop lives only in the normal.
    world.y += waterSwellHeight(world.xz) * uSwell;
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    // The sun's shadow map, as the ground beside the water reads it.
    vec4 worldPosition = world;
    vec3 transformedNormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    #include <shadowmap_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #define RIPPLES ${MAX_WATER_RIPPLES}
  ${waterWaveField}
  ${waterNormalField}
  varying float vWaterPatch;
  uniform float uClarity;
  uniform float uShallowDetail;
  uniform float uCausticLight;
  uniform float uCausticResponse;
  uniform float uRefractionReady;
  uniform float uRefractionHeight;
  uniform sampler2D uSceneColor;
  uniform sampler2D uSceneDepth;
  uniform vec2 uViewport;
  uniform vec2 uCameraRange;
  uniform mat4 uInverseViewProjection;
  uniform float uReflectionReady;
  uniform float uReflectionHeight;
  uniform float uReflectionBand;
  uniform float uWaterMask;
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
  uniform float uFalls;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <bsdfs>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  float foamNoise(vec2 p) {
    vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(waterHash(cell),waterHash(cell+vec2(1,0)),f.x),
      mix(waterHash(cell+vec2(0,1)),waterHash(cell+vec2(1,1)),f.x),f.y);
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
      // The patch is a square; the water is not. Both sides ask the same
      // question, so the surface gives way exactly where the patch draws.
      bool covered=all(greaterThanEqual(p,uWaveBounds.xy)) && all(lessThanEqual(p,uWaveBounds.zw))
        && (uWaterMask<.5 || shoreDepth(p)>.02);
      if (vWaterPatch<.5 && inPatch && covered) discard;
      if (vWaterPatch>.5 && !covered) discard;
    }
    float shoreline = shoreFade(p);
    float waterFootprint = max(length(dFdx(p)), length(dFdy(p)));
    vec2 slope=ambientWaterSlope(p,waterFootprint);
    if(simulated>0.0) slope+=interactionWaterSlope(p,vBaseHeight)*(1.0-smoothstep(.08,.3,waterFootprint));

    float foam = 0.0;
    if (simulated>0.0) {
      float trail=texture2D(uWaveMap,(p-uWaveOrigin)/waveSpan).b*simulated;
      // A broken, soft stern trail, held in world space as the hull turns away.
      if (trail>.001) {
        float bubbles=.4+.6*smoothstep(.2,.8,foamNoise(p*9.0+uTime*.025)*.65+foamNoise(p*21.0)*.35);
        bubbles=mix(bubbles,.7,smoothstep(.035,.12,waterFootprint));
        foam=trail*bubbles;
      }
    }
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
      slope += (d > 1e-3 ? offset / d : vec2(0.0)) * dh * 0.9 * (1.0-simulated) * shoreline;
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
      slope += delta/max(d,.001)*ring*amount*.08*shoreline;
      rainFoam += ring*amount*.035;
    }
    foam = (foam + rainFoam) * shoreline;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    // The same water seen side-on. A slab's rim is still; on a fall, streaks
    // run down the face and break into white where the sheet thins.
    vec3 face = cross(dFdx(vWorld), dFdy(vWorld));
    float faceLength = length(face);
    bool sheet = faceLength > 0.0 && abs(face.y) < faceLength * .6;
    float sheetFoam = 0.0;
    if (sheet) {
      face /= faceLength;
      vec3 across = normalize(vec3(-face.z, 0.0, face.x));
      float u = dot(vWorld, across), fall = vWorld.y + uTime * 3.2;
      float sheetFootprint = max(length(dFdx(vWorld)), length(dFdy(vWorld)));
      float fine = 1.0 - smoothstep(.05, .3, sheetFootprint);
      float broad = foamNoise(vec2(u * 1.7, fall * .16));
      float streak = mix(.5, foamNoise(vec2(u * 6.5 + 11.0, fall * .42 + broad * 1.5)), fine);
      float lean = ((broad - .5) * .5 + (streak - .5) * .35) * uFalls;
      normal = normalize(face + across * lean + vec3(0.0, .18, 0.0));
      sheetFoam = smoothstep(.42, .9, broad * .55 + streak * .6) * .75 * uFalls;
      slope = vec2(lean * .1);
      foam = 0.0;
    }
    vec3 toEye = normalize(cameraPosition - vWorld);
    float facing = clamp(dot(normal, toEye), 0.0, 1.0);
    // Schlick's approximation with water's F0 of about 0.02.
    // Capped below a perfect mirror: the chop scatters part of a grazing
    // reflection back into the body colour, and at range that is most of it.
    float fresnel = min(0.02 + 0.98 * pow(1.0 - facing, 5.0), mix(0.78,0.96,uUltra));

    vec3 reflected = reflect(-toEye, normal);
    vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.45, reflected.y));
    if (uReflectionReady > .5 && !sheet && abs(vBaseHeight-uReflectionHeight)<uReflectionBand) {
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
    // Under a bridge or a tree the body loses the sun and keeps the sky.
    float sunlit = getShadowMask();
    float shade = mix(.58, 1.0, sunlit);
    vec3 body = mix(uDeep, uShallow, clamp(facing * 0.6 + slope.x * 2.0, 0.0, 1.0) * 0.55) * uSurfaceLight * shade;
    vec3 contactColour=body;
    float contactCoverage=1.0;
    bool refracting=uRefractionReady>.5 && abs(vBaseHeight-uRefractionHeight)<.02;
    if (refracting) {
      vec2 uv=gl_FragCoord.xy/uViewport;
      float surfaceDepth=viewDepth(gl_FragCoord.z);
      float opaqueDepth=texture2D(uSceneDepth,uv).x;
      float thickness=max(0.0,viewDepth(opaqueDepth)-surfaceDepth);
      vec3 opaqueWorld=scenePosition(uv,opaqueDepth);
      float contactDepth=max(0.0,vWorld.y-opaqueWorld.y);
      // A thin film joins its receiver gently instead of drawing a hard mirror
      // edge. Both depth and thickness matter at grazing views of quay walls.
      float contact=opaqueDepth<.99999?clamp(min(contactDepth,thickness),0.0,1.0):1.0;
      contactCoverage=mix(1.0,smoothstep(0.0,.12,contact),uShallowDetail);
      contactColour=texture2D(uSceneColor,uv).rgb;
      vec3 viewNormal=mat3(viewMatrix)*normal;
      vec2 offset=viewNormal.xy*.025*min(thickness,2.0)/max(1.0,surfaceDepth*.12);
      offset*=mix(1.0,smoothstep(.025,.32,contact),uShallowDetail);
      float edge=smoothstep(0.0,.04,min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y)));
      vec2 refractedUv=clamp(uv+offset*edge,vec2(.001),vec2(.999));
      float displacedDepth=texture2D(uSceneDepth,refractedUv).x;
      vec3 behind=scenePosition(refractedUv,displacedDepth);
      // Never pull a foreground hull, quay or above-water object into the bay.
      if (displacedDepth>=.99999 || viewDepth(displacedDepth)<=surfaceDepth+.02 || behind.y>vBaseHeight+.02) {
        refractedUv=uv; displacedDepth=opaqueDepth;
        behind=scenePosition(uv,opaqueDepth);
      }
      // Keep refraction from dragging a different stair tread across its riser.
      float discontinuity=smoothstep(.06,.28,abs(behind.y-opaqueWorld.y))*uShallowDetail;
      refractedUv=mix(refractedUv,uv,discontinuity);
      displacedDepth=texture2D(uSceneDepth,refractedUv).x;
      behind=scenePosition(refractedUv,displacedDepth);
      if(displacedDepth>=.99999 || viewDepth(displacedDepth)<=surfaceDepth+.02 || behind.y>vBaseHeight+.02) {
        refractedUv=uv;displacedDepth=opaqueDepth;behind=opaqueWorld;
      }
      float path=min(30.0,max(0.0,viewDepth(displacedDepth)-surfaceDepth)/max(.15,-normalize((viewMatrix*vec4(vWorld,1.0)).xyz).z));
      float depth=max(0.0,vBaseHeight-behind.y);
      vec3 transmission=exp(-vec3(.85,.38,.29)*path);
      if (displacedDepth>=.99999) transmission=vec3(0.0);
      vec3 scatter=mix(uShallow,uDeep,1.0-exp(-depth*.65))*uSurfaceLight*shade;
      vec3 receiver=texture2D(uSceneColor,refractedUv).rgb;
      body=receiver*transmission+scatter*(1.0-transmission);
    }
    vec3 colour = mix(body, sky, fresnel);
    // Broaden subpixel highlights and conserve their energy instead of flashing single pixels.
    vec3 reflectionDx = dFdx(reflected), reflectionDy = dFdy(reflected);
    float glintVariance = .5 * (dot(reflectionDx, reflectionDx) + dot(reflectionDy, reflectionDy));
    float glintPower = 1.0 / (1.0 / 380.0 + glintVariance);
    float glint = pow(max(dot(reflected, uSun), 0.0), glintPower) * (glintPower / 380.0);
    glint *= sunlit;
    colour += uGlintColor * glint * uGlintStrength;
    colour = mix(colour, vec3(0.9, 0.96, 0.97) * uSurfaceLight, clamp(foam + sheetFoam, 0.0, 0.85));
    if(refracting)colour=mix(contactColour,colour,contactCoverage);

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
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
      uTime: { value: 0 },
      uRain: { value: 0 },
      uUltra: { value: 0 },
      uShallowDetail: { value: 1 }, uCausticLight: { value: 1 },
      uCausticResponse: { value: 1 },
      uWaterDepthMap: { value: null }, uWaterDepthReady: { value: 0 },
      uWaterDepthBounds: { value: new THREE.Vector4() },
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
      // A bay and the pond beside it are different mirrors. A district's slabs sit
      // within a step of each other and share the one capture.
      uReflectionBand: { value: options.opaque ? .25 : .02 }, uWaterMask: { value: 0 },
      uReflectionMap: { value: null },
      uReflectionMatrix: { value: new THREE.Matrix4() },
      uChop: { value: options.choppiness ?? 1 },
      uSwell: { value: options.swell ?? 1 }, uFalls: { value: options.falls ? 1 : 0 },
      uClarity: { value: options.opaque ? 1 : options.clarity ?? 0.62 },
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
    vertexShader, fragmentShader, fog: true, lights: true, transparent: !options.opaque, depthWrite: !!options.opaque,
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
    // Moonlight uses a positive key direction too, so gate by solar elevation.
    const causticLight=THREE.MathUtils.smoothstep(lighting.elevation,3,25)*weather*weather;
    u.uCausticLight.value += (causticLight-u.uCausticLight.value)*blend;
    targetGlint.setRGB(1, .96, .86).lerp(targetSky.set(lighting.keyColor), lighting.shift);
    u.uGlintColor.value.lerp(targetGlint, blend);
    u.uSun.value.set(lighting.key.x, lighting.key.y, lighting.key.z);
  };
  material.userData.resetLighting = () => {
    u.uRain.value=0;u.uReflectionReady.value=0;u.uRefractionReady.value=0;u.uUltra.value=0;u.uWaveReady.value=0;
    u.uSky.value.copy(daySky); u.uHorizon.value.copy(dayHorizon); u.uSun.value.copy(daySun);
    u.uSurfaceLight.value = 1; u.uGlintStrength.value = 2.4; u.uGlintColor.value.setRGB(1, .96, .86);
    u.uCausticLight.value = 1;
  };
  return material;
}

/**
 * The same surface for a district's authored water: lakes, canals, ponds and
 * straits built as slabs, with the body and reflected sky taken from the one
 * colour the district chose and the sky it sits under.
 */
export function createDistrictWater(color: string, options: { sun: THREE.Vector3; background: THREE.ColorRepresentation; choppiness?: number; falls?: boolean }) {
  const body = new THREE.Color(color), sky = new THREE.Color(options.background);
  const hex = (c: THREE.Color) => `#${c.getHexString()}`;
  return createWaterMaterial({
    deep: hex(body.clone().multiplyScalar(.5)), shallow: hex(body),
    sky: hex(sky.clone().lerp(new THREE.Color('#6f9fc8'), .45)), horizon: hex(sky.clone().lerp(body, .55).multiplyScalar(.74)),
    sun: options.sun, choppiness: options.choppiness ?? .7, falls: options.falls, swell: 0, opaque: true,
  });
}

/** Hands a shot's ripple to whatever water it struck, if that water can take one. */
export function rippleWater(object: THREE.Object3D, x: number, z: number, strength = 1) {
  const material = (object as THREE.Mesh).material;
  const target = Array.isArray(material) ? material.find(m => m.userData.ripple) : material;
  (target?.userData.ripple as ((x: number, z: number, s: number) => void) | undefined)?.(x, z, strength);
}
