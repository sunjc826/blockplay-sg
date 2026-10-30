import * as THREE from 'three';
import type { LightingState } from './world-lighting';
import { isWaterObject } from './water';
import { activePalette, HEAT_SOURCES, isHeatSource, visionAperture, visionGain, visionStrain, type VisionSpec, type VisionState } from './vision-devices';

/**
 * Draws what a worn vision device sees (vision-devices holds the devices).
 *
 * Night vision amplifies light, so it does so before tone mapping: the frame
 * renders at the tube's gain, lamps blow out the way an intensifier's do, and a
 * post pass turns the picture into phosphor with the tube's grain, halo, blur
 * and image circle.
 *
 * Thermal sees heat, which no material in the scene carries, so while it is on
 * every opaque mesh draws with an unlit temperature shader instead: people are
 * hot, engines and the range's heated targets warm, dark and sunlit surfaces
 * warmer than pale and shaded ones, metal, water and the sky cold. Glass turns
 * opaque, as it does in long-wave infrared. Effects (flashes, tracers, smoke)
 * keep their own materials, so a muzzle flash still reads as the hottest thing
 * on screen. Because the swap is on the meshes, the scope's picture-in-picture
 * and the optic reflections see the same thing for free. A post pass then
 * applies the core's resolution, palette, edge enhancement and noise.
 *
 * Both post passes read the finished canvas back (world, weapon and all), so
 * they need nothing from the passes before them.
 *
 * Switching is animated. The device's body swings down from the top of the
 * view, the naked-eye world showing round it, and only powers once it is in
 * front of the eyes: a tube lights from the middle out with a surge its
 * brightness control then reins in; a thermal core shows a flat field, scans
 * its first picture in from the top and clicks its shutter. Switched off, a
 * tube's phosphor fades on the last picture it drew, brightest parts last,
 * and a thermal display folds to a line, then a point; then the device swings
 * back up.
 */

const THERMAL_VERTEX = /* glsl */`
#include <common>
#include <batching_pars_vertex>
#include <color_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
void main() {
  #include <color_vertex>
  #include <morphinstance_vertex>
  #include <morphcolor_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewNormal = transformedNormal;
  vViewPosition = -mvPosition.xyz;
  vec3 worldNormal = objectNormal;
  #ifdef USE_INSTANCING
    worldNormal = mat3(instanceMatrix) * worldNormal;
  #endif
  vWorldNormal = mat3(modelMatrix) * worldNormal;
}`;
const THERMAL_FRAGMENT = /* glsl */`
#include <common>
#include <color_pars_fragment>
uniform float uBase;
uniform float uHeat;
uniform float uAbsorb;
uniform float uSunlight;
uniform float uAir;
uniform float uReach;
uniform vec3 uSun;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
void main() {
  vec3 n = normalize(vWorldNormal), viewNormal = normalize(vViewNormal);
  if (!gl_FrontFacing) { n = -n; viewNormal = -viewNormal; }
  // Sun-facing surfaces are warmer, dark ones most of all; at night the ground keeps a little.
  // Kept well under a body's heat, so midday pavement does not swallow the people standing on it.
  float t = uBase + max(dot(n, uSun), 0.0) * uSunlight * (0.04 + 0.08 * uAbsorb) + max(n.y, 0.0) * 0.025 * uAbsorb;
  #ifdef USE_COLOR
    t += (dot(vColor.rgb, vec3(0.299, 0.587, 0.114)) - 0.5) * 0.05;
  #endif
  // A warm body is warmest where it faces you and cools towards its outline.
  float facing = abs(dot(viewNormal, normalize(vViewPosition)));
  t += uHeat * (0.62 + 0.38 * facing);
  // The air in between: distant things settle towards the air's own temperature.
  t = mix(t, uAir, (1.0 - exp(-length(vViewPosition) / uReach)) * 0.85);
  gl_FragColor = vec4(vec3(max(t, 0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const luma = (c: THREE.Color) => c.r * .2126 + c.g * .7152 + c.b * .0722;
/** Small, stable per-material variation, so neighbouring buildings are not one flat temperature. */
const variation = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000 - .5; };

/**
 * What a material emits as heat, from what it looks like: dark absorbs, green
 * transpires, bare metal and water read cold, lamps are hot.
 */
export function thermalProperties(material: THREE.Material, water = false) {
  const m = material as THREE.MeshStandardMaterial;
  const color = m.color instanceof THREE.Color ? m.color : null;
  const dark = color ? 1 - Math.min(1, luma(color) * 1.6) : .5;
  let base = .25 + .05 * dark + variation(material.uuid) * .04;
  if (color && color.g > color.r * 1.12 && color.g > color.b * 1.08) base -= .05;
  if ((m.metalness ?? 0) > .5) base -= .06;
  const glow = m.emissive instanceof THREE.Color ? luma(m.emissive) * (m.emissiveIntensity ?? 1) : 0;
  if (glow > .04) base += Math.min(.45, glow * 1.2);
  if (water) return { base: .13, absorb: 0 };
  return { base, absorb: dark };
}

/**
 * Glows, invisible colliders and see-through surfaces keep their own look: a
 * scope lens or a reflex window has to stay a window onto its picture. The one
 * exception is glass on something hot, a vehicle's windscreen, which goes
 * opaque the way glass does in long-wave infrared.
 */
function keepsOwnMaterial(material: THREE.Material, hot: boolean) {
  if (!material.colorWrite || material.blending === THREE.AdditiveBlending || material.blending === THREE.CustomBlending) return true;
  if (material.alphaTest > 0) return true;
  return material.transparent && (!hot || material.opacity < .02 || !!(material as THREE.MeshBasicMaterial).map);
}

/**
 * Swaps meshes onto temperature materials and back. A heat tag on an object
 * (`userData.heat`: a key of HEAT_SOURCES, or 'none' to stop one) applies to its
 * whole subtree; a character rig's flesh counts as a body. Below an `fpsEffect`
 * flag (flashes, smoke, markers) meshes keep their look, unless something hot
 * sits inside it, like a raid helicopter among the combat-event visuals.
 */
export function createThermalMaterials() {
  const shared = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunlight: { value: 1 }, uAir: { value: .2 }, uReach: { value: 260 } };
  const cache = new Map<string, THREE.ShaderMaterial>(), ours = new Set<THREE.Material>();
  const swapped = new Map<THREE.Mesh, { original: THREE.Material | THREE.Material[]; thermal: THREE.Material | THREE.Material[] }>();
  function thermalFor(material: THREE.Material, heat: number, water: boolean): THREE.Material {
    if (ours.has(material) || keepsOwnMaterial(material, heat > 0)) return material;
    const key = `${material.uuid}:${heat}:${water ? 1 : 0}`;
    let thermal = cache.get(key);
    if (!thermal) {
      const { base, absorb } = thermalProperties(material, water);
      // Metal gear on a figure (helmet, webbing hardware) is cooler than the body under it.
      const warmth = heat * ((material as THREE.MeshStandardMaterial).metalness > .3 ? .45 : 1);
      thermal = new THREE.ShaderMaterial({ name: `thermal:${material.name}`, vertexShader: THERMAL_VERTEX, fragmentShader: THERMAL_FRAGMENT,
        uniforms: { ...shared, uBase: { value: base }, uHeat: { value: warmth }, uAbsorb: { value: absorb } },
        side: material.side, vertexColors: material.vertexColors });
      cache.set(key, thermal); ours.add(thermal);
    }
    return thermal;
  }
  function swap(mesh: THREE.Mesh, heat: number) {
    const current = mesh.material, record = swapped.get(mesh);
    if (record && record.thermal === current) return;
    const water = isWaterObject(mesh);
    const thermal = Array.isArray(current) ? current.map(m => thermalFor(m, heat, water)) : thermalFor(current, heat, water);
    const changed = Array.isArray(current) ? (thermal as THREE.Material[]).some((m, i) => m !== current[i]) : thermal !== current;
    if (!changed) return;
    // Game code that replaced the material since the last scan owns the original now.
    swapped.set(mesh, { original: current, thermal }); mesh.material = thermal;
  }
  function walk(object: THREE.Object3D, heat: number, effect: boolean) {
    const tag = object.userData.heat, source = isHeatSource(tag) || (tag === undefined && object.userData.impactSurface === 'flesh');
    const here = tag === 'none' ? 0 : isHeatSource(tag) ? HEAT_SOURCES[tag] : source ? HEAT_SOURCES.body : heat;
    const decoration = source ? false : effect || !!object.userData.fpsEffect;
    if ((object as THREE.Mesh).isMesh && !decoration) swap(object as THREE.Mesh, here);
    for (const child of object.children) walk(child, here, decoration);
  }
  return {
    /** Puts every eligible mesh under `root` on its temperature material; safe to call repeatedly. */
    apply(root: THREE.Object3D) { walk(root, 0, false); },
    /** Hands every mesh its own material back, unless game code has since replaced it. */
    restore() {
      for (const [mesh, { original, thermal }] of swapped) if (mesh.material === thermal) mesh.material = original;
      swapped.clear();
    },
    /** The hour: where the sun is and how much it is warming things. */
    update(lighting: LightingState) {
      shared.uSun.value.set(lighting.key.x, lighting.key.y, lighting.key.z);
      shared.uSunlight.value = Math.max(0, 1 - lighting.shift) * Math.min(1.2, lighting.keyScale);
      shared.uAir.value = .17 + .05 * (1 - lighting.shift);
    },
    get swappedCount() { return swapped.size; },
    isThermal: (material: THREE.Material) => ours.has(material),
    dispose() { this.restore(); cache.forEach(m => m.dispose()); cache.clear(); ours.clear(); },
  };
}

const POST_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_COMMON = /* glsl */`
varying vec2 vUv;
uniform sampler2D tFrame;
uniform sampler2D tGlow;
uniform vec2 uResolution;
uniform float uTime;
uniform float uNoise;
uniform float uBlur;
uniform float uHalo;
uniform float uAperture;
uniform float uDistortion;
uniform float uWarm;
uniform float uOff;
uniform float uLift;
uniform float uHousing;
uniform vec3 uTint;
// Reduce pixel coordinates before mixing; large multipliers made bright specks
// line up in columns as float precision ran out on some renderers.
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/**
 * 1 at the middle of the screen's longer edges, larger into the corners: a portrait phone loses top and bottom, not the middle.
 * Measured from the device's eyepiece, which sits above the view while it swings.
 */
float rim() { return length((vUv - vec2(0.5, 0.5 + uLift)) * uResolution) / (0.5 * max(uResolution.x, uResolution.y)); }
/** The device's body, opaque; the world shows round it while it swings, with a little of its shadow. */
float body(float r) { return 1.0 - smoothstep(uHousing - 0.04, uHousing, r); }
float shade(float r) { return (1.0 - smoothstep(uHousing, uHousing + 0.3, r)) * 0.5 * step(0.001, uLift); }
/** Premultiplied over the canvas: the picture inside the body, the body's shadow on the world round it. */
vec4 present(vec3 picture, float r) { float b = body(r); return vec4(picture * b, max(b, shade(r))); }
vec2 lens(float r) { return 0.5 + (vUv - 0.5) * (1.0 - uDistortion * 0.1 * r * r); }
/** The device's image circle: black outside, a soft rim, a gentle falloff inside. */
float aperture(float r) {
  // Relative to the lens, so a portrait/ultrawide screen does not eat the thermal view with a wider feather.
  float edge = uAperture * (0.02 + 0.04 * uBlur);
  return (1.0 - smoothstep(uAperture - edge, uAperture, r)) * (1.0 - 0.32 * pow(clamp(r / uAperture, 0.0, 1.0), 2.5));
}`;
const NVG_FRAGMENT = /* glsl */`
${POST_COMMON}
uniform float uStrain;
uniform float uDay;
void main() {
  float r = rim();
  float radial = r / uAperture;
  vec2 centre = vec2(0.5, 0.5 + uLift), delta = vUv - centre;
  // The curved shoulder bends the scene more sharply in the last part of the glass.
  // Even the best tube has a little refraction; its centre stays undistorted.
  float shoulder = smoothstep(0.72, 1.0, radial);
  float bend = (0.025 + uDistortion * 0.12) * pow(radial, 4.0)
    + (0.018 + uDistortion * 0.045) * shoulder * shoulder;
  vec2 uv = centre + delta * (1.0 - bend);
  // A cheap tube is soft everywhere and softer at its rim.
  vec2 px = (uBlur * (1.0 + 1.6 * radial * radial) * 1.8 + shoulder * (0.7 + uDistortion * 2.0)) / uResolution;
  float l = luma(texture2D(tFrame, uv).rgb) * 0.4
    + (luma(texture2D(tFrame, uv + px).rgb) + luma(texture2D(tFrame, uv - px).rgb)
    + luma(texture2D(tFrame, uv + vec2(px.x, -px.y)).rgb) + luma(texture2D(tFrame, uv + vec2(-px.x, px.y)).rgb)) * 0.15;
  // A displaced, faint second image at the bevel reads as thick glass, in the tube's phosphor colour.
  float refracted = luma(texture2D(tFrame, uv - delta * (0.012 + uDistortion * 0.035)).rgb);
  l = mix(l, refracted, shoulder * (0.12 + uDistortion * 0.18));
  // Halos: bright points spread into the tube around them.
  vec2 h = (0.004 + 0.012 * uHalo) * vec2(uResolution.y / uResolution.x, 1.0);
  float glow = luma(texture2D(tGlow, uv).rgb) * 0.4 + (luma(texture2D(tGlow, uv + h).rgb) + luma(texture2D(tGlow, uv - h).rgb)
    + luma(texture2D(tGlow, uv + vec2(h.x, -h.y)).rgb) + luma(texture2D(tGlow, uv + vec2(-h.x, h.y)).rgb)) * 0.15;
  l += glow * uHalo * 1.6;
  // Lighting: the tube catches from the middle out, and overshoots before its brightness control reins it in.
  float lit = 1.0 - smoothstep(uWarm * 2.4 - 0.5, uWarm * 2.4, r / uAperture);
  float surge = smoothstep(0.12, 0.42, uWarm) * (1.0 - smoothstep(0.42, 0.95, uWarm));
  l *= lit * (1.0 + surge * 1.5);
  // Switched off, the phosphor glows on with the last picture, its brightest parts longest, closing towards the middle.
  float dying = 1.0 - uOff;
  l *= pow(dying, 1.0 + 2.5 * (1.0 - clamp(l, 0.0, 1.0))) * (1.0 - smoothstep(dying * 1.5 - 0.2, dying * 1.5 + 0.2, r / uAperture) * uOff);
  // In daylight the automatic brightness control flattens the picture.
  l = mix(l, 0.2 + l * 0.75, uDay * 0.45);
  // Grain is coarser on a blurry tube, worst when the gain is up and while the tube is still lighting.
  vec2 cell = floor(vUv * uResolution / (1.0 + uBlur * 1.5));
  float amount = uNoise * (0.3 + 0.7 * uStrain) * (1.6 - 0.6 * uWarm) * dying;
  // Keep grain below the image signal: fixed-strength snow used to drown the
  // very shadows the tube is meant to reveal, especially on the first generation.
  float grain = min(amount * 0.55, max(l, 0.0) * (0.35 + uNoise));
  l += (hash(cell + fract(uTime * 7.31) * 113.0) - 0.5) * grain * lit;
  // Scintillation: the odd bright speck from the photocathode.
  l += step(1.0 - 0.0008 * uNoise * uStrain, hash(cell * 1.37 + fract(uTime * 3.7) * 71.0)) * min(1.0, uNoise * 100.0) * 0.35 * lit * dying;
  l = max(l, 0.0);
  vec3 colour = uTint * l + smoothstep(0.85, 1.7, l) * 0.45;
  // Keep the circumference readable on every tier, with a dark rolled edge and a fine lit bevel.
  float aa = 2.0 / (uAperture * max(uResolution.x, uResolution.y));
  float circle = 1.0 - smoothstep(1.0 - aa, 1.0, radial);
  float rolloff = (1.0 - 0.22 * pow(clamp(radial, 0.0, 1.0), 3.0))
    * (1.0 - 0.82 * smoothstep(0.91, 1.0, radial));
  vec2 direction = normalize(delta * uResolution + vec2(0.0001));
  float reflection = 0.25 + 0.75 * pow(abs(dot(direction, normalize(vec2(-0.6, 0.8)))), 5.0);
  float bevel = smoothstep(0.955, 0.978, radial) * (1.0 - smoothstep(0.985, 1.0, radial));
  colour = colour * rolloff + uTint * bevel * reflection * (0.055 + 0.035 * uDistortion) * (1.0 - uOff);
  gl_FragColor = present(colour * circle * smoothstep(0.0, 1.0, uWarm), r);
}`;
const THERMAL_POST_FRAGMENT = /* glsl */`
${POST_COMMON}
uniform float uRows;
uniform float uDetail;
uniform float uPalette;
vec3 ironbow(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  vec3 a = vec3(0.0, 0.0, 0.03), b = vec3(0.2, 0.0, 0.48), c = vec3(0.74, 0.07, 0.47), d = vec3(0.98, 0.42, 0.04), e = vec3(1.0, 0.85, 0.18), f = vec3(1.0, 1.0, 0.92);
  return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : t < 3.0 ? mix(c, d, t - 2.0) : t < 4.0 ? mix(d, e, t - 3.0) : mix(e, f, t - 4.0);
}
void main() {
  float r = rim();
  vec2 uv = lens(r);
  // Switched off, the display folds to a bright line, the line to a point, and the point goes out.
  vec2 squeeze = max(vec2(1.0 - smoothstep(0.42, 0.78, uOff), 1.0 - smoothstep(0.0, 0.45, uOff)), vec2(0.002));
  vec2 fold = (uv - 0.5) / squeeze, px = 1.5 / (uResolution * squeeze);
  float shown = (1.0 - smoothstep(0.5 - px.x, 0.5, abs(fold.x))) * (1.0 - smoothstep(0.5 - px.y, 0.5, abs(fold.y)));
  uv = 0.5 + fold;
  vec2 cells = vec2(uRows * uResolution.x / uResolution.y, uRows);
  vec2 cell = floor(uv * cells), q = (cell + 0.5) / cells;
  float sharp = luma(texture2D(tFrame, q).rgb), soft = luma(texture2D(tGlow, q).rgb);
  // A sensor pixel averages what falls on it; poor optics smear further.
  float t = mix(sharp, soft, clamp(0.25 + uBlur, 0.0, 1.0));
  // Detail enhancement: lift the edges against their surroundings.
  t += (sharp - soft) * uDetail * 1.4;
  // Warm bodies bloom a little into the cold around them.
  t += max(soft - 0.55, 0.0) * uHalo * 0.8;
  // Level and span: the city at night lands around a third, a body near the top, the sky at the bottom.
  t = clamp((t - 0.47) / 0.42, 0.0, 1.0);
  t += (hash(cell + fract(uTime * 5.3) * 91.0) - 0.5) * uNoise * 0.32;
  // Fixed-pattern column noise, the signature of an uncooled core.
  t += (hash(vec2(cell.x, 7.0)) - 0.5) * uNoise * 0.14;
  t = clamp(t, 0.0, 1.0);
  vec3 colour = uPalette < 0.5 ? vec3(t) : uPalette < 1.5 ? vec3(1.0 - t) : ironbow(t);
  // A core coming up shows a flat field with boot noise, scans its first picture in from the top,
  // then clicks its shutter for a moment of flat grey before settling.
  float scan = (uWarm - 0.3) / 0.45, below = 1.0 - vUv.y;
  vec3 field = vec3(0.3 + (hash(vec2(floor(vUv.y * 90.0), floor(uTime * 24.0))) - 0.5) * 0.08 * (1.0 - step(1.0, uWarm)));
  colour = mix(field, colour, step(below, scan));
  colour += (1.0 - smoothstep(0.0, 0.03, abs(below - scan))) * 0.35 * step(scan, 1.0);
  float shutter = smoothstep(0.82, 0.85, uWarm) * (1.0 - smoothstep(0.9, 0.94, uWarm));
  colour = mix(colour, vec3(0.34), shutter);
  // The fold's line and point burn brighter as the picture squeezes into them.
  colour = mix(colour, vec3(1.0), smoothstep(0.25, 0.55, uOff) * 0.85) * (1.0 - smoothstep(0.8, 1.0, uOff));
  colour *= uTint * shown;
  gl_FragColor = present(colour * aperture(r) * smoothstep(0.0, 0.25, uWarm), r);
}`;
const GLOW_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tFrame;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 sum = vec3(0.0);
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) sum += max(texture2D(tFrame, vUv + vec2(float(x), float(y)) * uTexel).rgb - uThreshold, 0.0);
  gl_FragColor = vec4(sum / 9.0, 1.0);
}`;

const PALETTE_INDEX = { 'white-hot': 0, 'black-hot': 1, ironbow: 2 } as const;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** The two post passes, drawn over the finished canvas. */
function createVisionPost(renderer: THREE.WebGLRenderer) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene();
  const glow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType });
  const common = () => ({ tFrame: { value: null as THREE.Texture | null }, tGlow: { value: glow.texture }, uResolution: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uNoise: { value: 0 }, uBlur: { value: 0 }, uHalo: { value: 0 }, uAperture: { value: 1 }, uDistortion: { value: 0 }, uWarm: { value: 1 },
    uOff: { value: 0 }, uLift: { value: 0 }, uHousing: { value: 2 }, uTint: { value: new THREE.Color() } });
  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, over = false) =>
    new THREE.ShaderMaterial({ vertexShader: POST_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, transparent: over, premultipliedAlpha: over });
  const nvg = pass(NVG_FRAGMENT, { ...common(), uStrain: { value: 0 }, uDay: { value: 0 } }, true);
  const thermal = pass(THERMAL_POST_FRAGMENT, { ...common(), uRows: { value: 240 }, uDetail: { value: 0 }, uPalette: { value: 0 } }, true);
  const bright = pass(GLOW_FRAGMENT, { tFrame: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });
  const quad = new THREE.Mesh(geometry, nvg); quad.frustumCulled = false; quadScene.add(quad);
  const size = new THREE.Vector2();
  let frame: THREE.FramebufferTexture | null = null;
  return {
    /** Reads the canvas back and draws the device's picture over it. `hold` keeps the last frame (a calibration freeze, or a dying picture). */
    present(spec: VisionSpec, state: VisionState, info: { gain: number; day: number; time: number; hold: boolean }) {
      renderer.getDrawingBufferSize(size);
      if (!frame || frame.image.width !== size.x || frame.image.height !== size.y) {
        frame?.dispose(); frame = new THREE.FramebufferTexture(size.x, size.y);
        frame.minFilter = frame.magFilter = THREE.LinearFilter;
        glow.setSize(Math.max(1, Math.ceil(size.x / 4)), Math.max(1, Math.ceil(size.y / 4)));
      }
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(null);
      if (!info.hold) renderer.copyFramebufferToTexture(frame);
      const thermalPass = spec.kind === 'thermal';
      bright.uniforms.tFrame.value = frame; bright.uniforms.uTexel.value.set(2 / size.x, 2 / size.y);
      // Night vision halos only what is bright; thermal blurs everything for its soft sensor average.
      bright.uniforms.uThreshold.value = thermalPass ? 0 : .62;
      quad.material = bright; renderer.setRenderTarget(glow); renderer.render(quadScene, quadCamera);
      const material = thermalPass ? thermal : nvg, u = material.uniforms;
      u.tFrame.value = frame; u.uResolution.value.copy(size); u.uTime.value = info.time;
      u.uNoise.value = spec.noise; u.uBlur.value = spec.blur; u.uHalo.value = spec.halo; u.uAperture.value = visionAperture(spec, size.x / size.y);
      u.uDistortion.value = spec.distortion; u.uWarm.value = state.warm; u.uTint.value.set(spec.phosphor);
      u.uOff.value = state.on ? 0 : 1 - state.fading;
      // The body covers the whole view once lowered; swinging, it is a disc whose lower edge travels down from the top.
      const housing = Math.max(1.5, spec.aperture + .1), long = Math.max(size.x, size.y);
      u.uHousing.value = housing; u.uLift.value = (1 - easeInOut(state.mount)) * (.52 + housing * .5 * long / size.y);
      if (thermalPass) {
        u.uRows.value = spec.rows || size.y; u.uDetail.value = spec.detail;
        u.uPalette.value = PALETTE_INDEX[activePalette(state, spec) || 'white-hot'];
      } else { u.uStrain.value = visionStrain(spec, info.gain); u.uDay.value = info.day; }
      quad.material = material; renderer.setRenderTarget(null); renderer.render(quadScene, quadCamera);
      renderer.setRenderTarget(previous);
    },
    dispose() { frame?.dispose(); glow.dispose(); geometry.dispose(); nvg.dispose(); thermal.dispose(); bright.dispose(); },
  };
}

/**
 * The device in the frame loop. `begin` runs before anything draws the world
 * (scope, reflections, the world itself) and returns the exposure to render at;
 * `end` runs once the weapon is on the canvas.
 */
export function createVisionSystem(renderer: THREE.WebGLRenderer, scenes: { world: THREE.Scene; view: THREE.Scene }) {
  const materials = createThermalMaterials(), post = createVisionPost(renderer);
  const background = new THREE.Color(), fog = new THREE.Color(), COLD_SKY = new THREE.Color(.004, .004, .005);
  let thermalOn = false, rescan = 0, saved: { background: THREE.Color | null; fog: THREE.Color | null } | null = null;
  let gain = 1, day = 1;
  return {
    /** Whether the scene is drawing temperature this frame; ambient occlusion has no meaning then. */
    get thermal() { return thermalOn; },
    get swapped() { return materials.swappedCount; },
    begin(spec: VisionSpec | undefined, state: VisionState, frame: { dt: number; lighting: LightingState; blackout: number; exposure: number }) {
      // Nothing changes the world's picture until the device is in front of the eyes.
      const lowered = state.on && state.mount >= 1;
      const wantThermal = spec?.kind === 'thermal' && lowered;
      if (wantThermal !== thermalOn) {
        thermalOn = wantThermal; rescan = 0;
        if (!wantThermal) materials.restore();
      }
      if (thermalOn) {
        // New figures, vehicles and pickups join on the next scan.
        rescan -= frame.dt;
        if (rescan <= 0) { rescan = .4; materials.apply(scenes.world); materials.apply(scenes.view); }
        materials.update(frame.lighting);
        const sky = scenes.world.background instanceof THREE.Color ? scenes.world.background : null, haze = scenes.world.fog?.color ?? null;
        saved = { background: sky ? background.copy(sky) : null, fog: haze ? fog.copy(haze) : null };
        sky?.copy(COLD_SKY); haze?.copy(COLD_SKY);
        return 1;
      }
      day = 1 - frame.lighting.shift;
      gain = spec && lowered ? visionGain(spec, frame.lighting.shift, frame.blackout) : 1;
      return frame.exposure * gain;
    },
    end(spec: VisionSpec | undefined, state: VisionState, time: number) {
      if (saved) {
        if (saved.background && scenes.world.background instanceof THREE.Color) scenes.world.background.copy(saved.background);
        if (saved.fog && scenes.world.fog) scenes.world.fog.color.copy(saved.fog);
        saved = null;
      }
      // Off, the canvas has gone back to the naked eye; the dying picture is the last one the device drew.
      if (spec && (state.on || state.mount > 0)) post.present(spec, state, { gain, day, time, hold: state.calibrating > 0 || !state.on });
    },
    dispose() { materials.dispose(); post.dispose(); },
  };
}
