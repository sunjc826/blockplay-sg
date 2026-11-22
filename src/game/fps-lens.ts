import * as THREE from 'three';
import type { Direction } from './world-lighting';
import type { SunRayOverlay } from './sun-rays';
import { GUST_DOWNWIND } from './wind-gusts';

/**
 * What the eye, as a lens, adds over the finished frame (world and weapon):
 *
 * - The sun's flare: glare round the disc, diffraction spikes, a streak, and
 *   ghosts strung through the middle of the view. Whether the sun is in sight
 *   is read off the frame itself: the sky is the background colour cleared on
 *   the canvas (world-occlusion keeps it so), so the pixels round the sun
 *   either still are that colour plus any god-ray glow or something (a tower,
 *   a tree, the gun, a cloud) stands in front of it. That test lands in a 1×1 target that eases
 *   towards each frame's answer, so the flare fades as the sun slips behind an
 *   edge instead of blinking.
 * - Dust in haze: specks laid out by direction, so turning sweeps them past
 *   like things in the air, in three depths whose nearer layers slide with
 *   your movement and drift on the wind. They glint brightest looking towards
 *   the sun, as fine particles scatter forward.
 * - Rain on the lens: drops land (more facing up into it, none under a roof or
 *   in a vehicle), merge, and once heavy enough slide down leaving a trail of
 *   beads, then dry. Each draws as a small quad that refracts the frame behind
 *   it, the way a bead of water is a tiny wide-angle lens: the scene round it,
 *   shrunk and upside down, dark at the rim, with a highlight.
 *
 * Off (no passes at all) when none of the three has anything to show; a
 * thermal picture gets only the rain, since its sky holds no sun and its air
 * no glinting dust.
 */

/** One drop on the lens. Screen units: x across 0–1, y up 0–1, radius a share of the screen's height. */
export interface LensDrop { x: number; y: number; radius: number; age: number; life: number; stick: number; speed: number; seed: number; travelled: number; splash?: boolean;
  /** What put it there, which sets its look. */
  kind: LensWater;
  /** Heavy rain: it landed hard and is still spreading. */
  impact?: boolean;
  /** Spray: which way it is drawn out (radians, 0 tail up) and by how much. */
  angle?: number; stretch?: number }
/** A clinging bead, a runner off a dunking, a soft out-of-focus smudge, or a fleck of spray. */
export type LensWater = 'bead' | 'runner' | 'smear' | 'spray';
export const waterSplashExposure = (distance:number, facing:number, height:number) => facing < -.1 || height > 3 ? 0 : Math.max(0,1-distance/5.5) * Math.max(0,1-height/4);
export const LENS_DROP_LIMIT = 128;
/** Drops at least this big (share of screen height) run once they let go. */
export const SLIDING_RADIUS = .011;

/** How much falling rain bends the view, 0–1: by the rain, more in a gust (`wind` up to about 15), less from shelter, fading out looking along its fall (`lookY`). */
export const rainRefraction = (rain: number, wind: number, sheltered: boolean, lookY: number) =>
  rain < .03 ? 0 : Math.min(1, rain * (.7 + .3 * Math.min(1, Math.max(0, wind) / 6))) * (sheltered ? .45 : 1) * (1 - smoothstep(.6, .95, Math.abs(lookY)));
/** How much of the falling rain the lens catches, from how far the view looks up (`lookY`, the forward vector's height). */
export const rainExposure = (lookY: number) => .15 + .85 * smoothstep(-.5, .6, lookY);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How heavy the rain is for the lens, 0–1: showers are none of it, a monsoon some, a thunderstorm or squall nearly all. */
export const heavyRain = (rain: number) => smoothstep(.55, .9, rain);

/**
 * The water on the lens, as a bounded pool of drops and a film. How it got there decides what it looks like:
 * - Rain: small crisp beads that cling; the big ones let go and run, leaving beads behind.
 * - Heavy rain: more of them and bigger, each landing as a splat that settles, and now and then a
 *   drop so near the glass it is only a large soft smudge drifting down.
 * - Swimming: going under or coming up sheets the whole lens (`film`), which drains from the top
 *   and leaves fast runners; each stroke slops more across the bottom.
 * - A round into water close by: a burst of fine spray from that side, flung outwards, gone in a second or two.
 */
export function createLensRain(random: () => number = Math.random) {
  const drops: LensDrop[] = [];
  let due = 0, swimDue = 0, wasSwimming = false, film = 0;
  const add = (x: number, y: number, radius: number, life: number, stick: number, kind: LensWater = 'bead') => {
    if (drops.length >= LENS_DROP_LIMIT) return null;
    const drop: LensDrop = { x, y, radius, age: 0, life, stick, speed: 0, seed: random(), travelled: 0, kind };
    drops.push(drop); return drop;
  };
  function land(aspect: number, heavy: number) {
    if (random() < heavy * .09 && drops.filter(d => d.kind === 'smear').length < 5) {
      add(random(), .12 + random() * .8, .035 + random() * .05, 2.4 + random() * 2.6, 98, 'smear'); return;
    }
    const radius = .004 + random() ** 2.5 * .02 * (1 + heavy * .5), x = random(), y = .04 + random() * .96;
    // A drop landing on another joins it, which is how the big runners form.
    for (const drop of drops) {
      if (drop.kind === 'bead' && Math.hypot((drop.x - x) * aspect, drop.y - y) < drop.radius + radius) {
        drop.radius = Math.min(.03, Math.hypot(drop.radius, radius)); drop.life = Math.max(drop.life, drop.age + 3); return;
      }
    }
    const drop = add(x, y, radius, 2.5 + random() * 4.5, (.2 + random() * 2.2) * (1 - heavy * .5));
    if (drop && heavy > .3) drop.impact = true;
  }
  /** Spray off water struck close by. `from` is where across the screen (0–1) it was struck. */
  function splash(strength: number, aspect: number, reduced = false, from = .5) {
    const amount = Math.max(0, Math.min(1, strength)), origin = Math.max(0, Math.min(1, from));
    for (let i = 0; i < Math.ceil(amount * (reduced ? 10 : 34)); i++) {
      const x = Math.max(0, Math.min(1, origin + (random() + random() + random() - 1.5) * .3)), y = .1 + random() * .75;
      const d = add(x, y, .003 + random() ** 2 * .009, .7 + random() * 1.6, 97, 'spray');
      if (!d) break;
      // Each fleck is drawn out along the way it was flung: away from where the round went in, low on the screen.
      const ax = (x - origin) * aspect, ay = y - .3;
      d.splash = true; d.angle = Math.atan2(ax, -ay); d.stretch = .6 + random() * 2.2;
    }
    for (let i = 0; i < Math.ceil(amount * (reduced ? 2 : 6)); i++) {
      const d = add(Math.max(0, Math.min(1, origin + (random() - .5) * .5)), .15 + random() * .7, .009 + random() * .014, 1.8 + random() * 2.2, random() * .2);
      if (d) { d.splash = true; d.speed = .12 + random() * .25; }
    }
  }
  /** Head through the surface, either way: the lens is sheeted, then drains into runners. */
  function dunk(reduced = false) {
    film = 1;
    for (let i = 0; i < (reduced ? 6 : 16); i++) {
      const d = add(random(), .5 + random() * .5, .012 + random() * .013, 2 + random() * 2, random() * .25, 'runner');
      if (d) { d.splash = true; d.speed = .25 + random() * .3; }
    }
  }
  /** A stroke's worth of water over the lower lens. */
  function slosh(reduced = false) {
    film = Math.max(film, .3);
    for (let i = 0; i < (reduced ? 4 : 10); i++) {
      const d = add(random(), .04 + random() * .4, .006 + random() * .015, 2.2 + random() * 2.8, random() * .2);
      if (d) { d.splash = true; d.speed = .1 + random() * .2; }
    }
  }
  return {
    drops, splash, dunk, slosh,
    /** The sheet of water over the lens after a dunking, 1 just after to 0 once it has drained. */
    get film() { return film; },
    /**
     * `rain` 0–1 from the weather, `exposure` from `rainExposure`, `aspect` the
     * screen's width over height, `wind` the weather's, `reduced` fewer drops.
     */
    step(dt: number, air: { rain: number; exposure: number; sheltered: boolean; aspect: number; wind?: number; reduced?: boolean; swimming?: boolean; swimSpeed?: number }) {
      dt = Math.max(0, Math.min(.1, dt));
      if (!!air.swimming !== wasSwimming) dunk(air.reduced);
      wasSwimming = !!air.swimming;
      swimDue = air.swimming ? swimDue + dt * (.8 + Math.min(2, air.swimSpeed ?? 0) * 1.8) : 0;
      if (swimDue >= 1) { swimDue -= 1; slosh(air.reduced); }
      film = Math.max(0, film - dt / 2.2);
      const heavy = heavyRain(air.rain);
      // The weather eases between presets, so the last of a shower counts as none.
      const rate = air.sheltered || air.rain < .03 ? 0 : air.rain * air.exposure * 22 * (1 + heavy * .6) * (air.reduced ? .35 : 1);
      due = Math.min(4, due + rate * dt);
      while (due >= 1) { due -= 1; land(air.aspect, heavy); }
      for (let i = drops.length - 1; i >= 0; i--) {
        const drop = drops[i];
        drop.age += dt;
        // Out of the rain the lens dries: whatever is left goes within a couple of seconds.
        if (rate === 0 && !drop.splash) drop.life = Math.min(drop.life, drop.age + 1.2 + drop.seed * .8);
        // A smudge is water too near to focus on: it sags slowly and spreads, and never runs.
        if (drop.kind === 'smear') { drop.y -= dt * .025; drop.radius *= 1 + dt * .06; }
        else if (drop.radius >= SLIDING_RADIUS && drop.age > drop.stick) {
          drop.speed = Math.min(.6, drop.speed + dt * (.25 + drop.radius * 20));
          const fall = drop.speed * dt;
          drop.y -= fall; drop.travelled += fall;
          drop.x += (Math.sin(drop.age * 6 + drop.seed * 40) * .015 * drop.speed + (air.wind ?? 0) * .0015) * dt;
          // A runner loses water to the beads it leaves behind.
          drop.radius *= 1 - dt * .06;
          if (drop.travelled > drop.radius * 1.6 && (rate > 0 || drop.splash)) {
            drop.travelled = 0;
            add(drop.x + (random() - .5) * drop.radius / air.aspect, drop.y + drop.radius * 1.2, drop.radius * (.22 + random() * .18), .8 + random(), 99);
          }
        }
        if (drop.age > drop.life || drop.y + drop.radius < 0) drops.splice(i, 1);
      }
    },
    clear() { drops.length = 0; due = swimDue = film = 0; wasSwimming=false; },
  };
}

/** How strongly the sun flares, before anything in front of it: by its height (degrees) and how much the weather lets through (its `sun`). */
export const sunFlareStrength = (elevation: number, sunlight: number) => smoothstep(-1.5, 6, elevation) * smoothstep(.45, .95, sunlight);
/** Haze dust's brightness: it shows in sunlight and barely at night. `day` is 1 at full day, 0 at night. */
export const dustStrength = (haze: number, day: number, sheltered: boolean) => haze * (.18 + .82 * day) * (sheltered ? .45 : 1);

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const VISIBILITY_FRAGMENT = /* glsl */`
uniform sampler2D tFrame;
uniform sampler2D tSunRays;
uniform vec3 uRayColor;
uniform vec2 uSun;
uniform vec2 uSpread;
uniform vec3 uSky;
uniform float uBlend;
void main() {
  float seen = 0.0;
  for (int x = -3; x <= 3; x++) for (int y = -3; y <= 3; y++) {
    vec2 uv = uSun + vec2(float(x), float(y)) * uSpread;
    // God rays brighten clear sky before this pass. Compare with that same
    // bounded display-space addition, not the original clear colour alone.
    // Keep testing the finished frame so the weapon still blocks the sun.
    vec3 sky = clamp(uSky + texture2D(tSunRays, uv).r * uRayColor, 0.0, 1.0);
    vec3 c = texture2D(tFrame, uv).rgb, d = abs(c - sky);
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    seen += inside * (1.0 - smoothstep(0.025, 0.07, max(d.r, max(d.g, d.b))));
  }
  gl_FragColor = vec4(vec3(seen / 49.0), uBlend);
}`;
const AIR_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tVisible;
uniform vec2 uSun;
uniform float uFlare;
uniform vec3 uSunColor;
uniform float uAspect;
uniform float uHaze;
uniform float uDust;
uniform float uTime;
uniform float uPxPerRadian;
uniform vec3 uSunDirection;
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
uniform vec2 uLayers[3];
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float disc(vec2 p, vec2 c, float r, float soft) { return 1.0 - smoothstep(r - soft, r, length(p - c)); }
vec3 flare() {
  float seen = texture2D(tVisible, vec2(0.5)).r * uFlare;
  if (seen < 0.002) return vec3(0.0);
  vec2 aspect = vec2(uAspect, 1.0), p = (vUv - 0.5) * aspect, s = (uSun - 0.5) * aspect, d = p - s;
  float dist = length(d), angle = atan(d.y, d.x);
  // The sun, and the glare scattered round it; haze spreads it wide and soft.
  float glare = exp(-dist * mix(34.0, 11.0, uHaze)) * 1.3 + exp(-dist * mix(6.5, 2.8, uHaze)) * 0.3;
  // Diffraction spikes and a faint horizontal streak, which haze washes out.
  float spikes = pow(abs(cos(angle * 3.0)), 70.0) * exp(-dist * 8.0) * 0.45 + pow(abs(cos(angle * 3.0 + 0.52)), 110.0) * exp(-dist * 13.0) * 0.3;
  float streak = exp(-abs(d.y) * 240.0) * exp(-abs(d.x) * 2.4) * 0.3;
  vec3 colour = uSunColor * (glare + (spikes + streak) * (1.0 - 0.75 * uHaze));
  // Ghosts: light bounced between lens surfaces, on the line from the sun through the middle.
  vec3 ghosts = vec3(1.0, 0.72, 0.38) * disc(p, -0.32 * s, 0.045, 0.03) * 0.1
    + vec3(0.36, 0.86, 0.78) * disc(p, -0.7 * s, 0.085, 0.06) * 0.055
    + vec3(0.66, 0.48, 1.0) * disc(p, -1.15 * s, 0.032, 0.012) * 0.12
    + vec3(0.5, 1.0, 0.62) * disc(p, 0.42 * s, 0.022, 0.01) * 0.08
    + vec3(1.0, 0.58, 0.3) * disc(p, -1.55 * s, 0.15, 0.11) * 0.035;
  // A thin rainbow ring round the sun.
  float ring = dist - 0.29;
  ghosts += (1.0 - smoothstep(vec3(0.0), vec3(0.014), abs(vec3(ring - 0.006, ring, ring + 0.006)))) * 0.035;
  colour += ghosts * (1.0 - 0.6 * uHaze);
  // Looking near the sun lifts the whole view a little.
  colour += uSunColor * 0.07 * (1.0 - smoothstep(0.0, 0.8, length(s)));
  return colour * seen;
}
vec3 dust() {
  if (uDust < 0.002) return vec3(0.0);
  vec4 view = uInverseProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(mat3(uCameraWorld) * (view.xyz / view.w));
  vec2 bearing = vec2(atan(dir.x, -dir.z), asin(clamp(dir.y, -1.0, 1.0)));
  float squash = max(cos(bearing.y), 0.2), sum = 0.0;
  for (int i = 0; i < 3; i++) {
    float layer = float(i), cells = layer == 0.0 ? 70.0 : layer == 1.0 ? 34.0 : 15.0;
    vec2 grid = (bearing + uLayers[i]) * vec2(cells, cells), cell = floor(grid), f = fract(grid);
    float h = hash(cell + layer * 17.31);
    if (h > (layer == 2.0 ? 0.035 : 0.1)) continue;
    h = hash(cell * 1.71 + layer * 3.1 + 5.0);
    vec2 at = 0.5 + 0.3 * vec2(sin(uTime * (0.21 + h) + h * 40.0), cos(uTime * (0.17 + h * 0.6) + h * 71.0));
    float cellPx = uPxPerRadian / cells;
    float radius = mix(0.7, 1.3, fract(h * 13.7)) * (1.0 + layer * 1.8);
    float gap = length((f - at) * vec2(cellPx * squash, cellPx));
    float glint = 0.55 + 0.45 * sin(uTime * (0.8 + h * 3.0) + h * 30.0);
    // Nearer specks are larger and out of focus, so dimmer at their middle.
    sum += (1.0 - smoothstep(radius * 0.35, radius, gap)) * glint * (layer == 2.0 ? 0.45 : 1.0);
  }
  float toward = max(dot(dir, uSunDirection), 0.0);
  float scatter = 0.12 + 1.3 * pow(toward, 6.0) + 0.6 * pow(toward, 40.0);
  // Bearings bunch up straight overhead and underfoot; the dust thins out there instead.
  float poles = 1.0 - smoothstep(0.72, 0.92, abs(dir.y));
  return mix(vec3(0.95, 0.88, 0.74), uSunColor, 0.5) * sum * scatter * poles * uDust * 0.38;
}
void main() { gl_FragColor = vec4(flare() + dust(), 1.0); }`;
const DROP_VERTEX = /* glsl */`
attribute vec4 aDrop;
attribute vec4 aShape;
uniform float uAspect;
varying vec2 vLocal;
varying vec4 vDrop;
varying vec4 vShape;
void main() {
  vLocal = position.xy; vDrop = aDrop; vShape = aShape;
  // Stretch (x) draws it out along its own up; the angle (w) turns that up, for spray flung sideways.
  vec2 reach = position.xy * vec2(aDrop.z, aDrop.z * (1.0 + aShape.x)) * 2.0;
  float c = cos(aShape.w), s = sin(aShape.w);
  reach = vec2(reach.x * c - reach.y * s, reach.x * s + reach.y * c);
  gl_Position = vec4(aDrop.xy * 2.0 - 1.0 + vec2(reach.x / uAspect, reach.y), 0.0, 1.0);
}`;
const DROP_FRAGMENT = /* glsl */`
uniform sampler2D tFrame;
uniform vec2 uResolution;
uniform float uAspect;
varying vec2 vLocal;
varying vec4 vDrop;
varying vec4 vShape;
void main() {
  // vShape.z: 0 a crisp bead in focus, 1 a smudge too near the glass to focus on.
  float soft = vShape.z;
  // A runner is a teardrop: a round front with its tail narrowing upward.
  vec2 q = vec2(vLocal.x * (1.0 + max(vLocal.y, 0.0) * vShape.x * 1.6), vLocal.y);
  float d = length(q);
  if (d > 1.0) discard;
  float height = sqrt(max(0.0, 1.0 - d * d));
  vec2 centre = vDrop.xy, extent = vec2(vDrop.z / uAspect, vDrop.z);
  // Shrunk and upside down: the drop gathers light from a patch a few times its size.
  // A smudge neither shrinks nor flips what is behind it: it only blurs it, wide.
  vec2 uv = centre - q * extent * mix(2.2 + 1.8 * (1.0 - height), -0.75, soft), blur = extent * mix(0.18, 0.8, soft);
  vec3 seen = (texture2D(tFrame, uv).rgb * 2.0 + texture2D(tFrame, uv + blur).rgb + texture2D(tFrame, uv - blur).rgb
    + texture2D(tFrame, uv + vec2(blur.x, -blur.y)).rgb + texture2D(tFrame, uv + vec2(-blur.x, blur.y)).rgb
    + texture2D(tFrame, uv + vec2(blur.x, 0.0) * 0.5).rgb + texture2D(tFrame, uv - vec2(blur.x, 0.0) * 0.5).rgb
    + texture2D(tFrame, uv + vec2(0.0, blur.y) * 0.5).rgb + texture2D(tFrame, uv - vec2(0.0, blur.y) * 0.5).rgb) / 10.0;
  // Dark at the rim, where light bends past the eye; a little brighter through the middle.
  seen *= mix(mix(0.45, 1.08, smoothstep(0.0, 0.75, height)), 1.0, soft);
  // A smudge instead washes what is behind it a little milky, as water out of focus does.
  seen = mix(seen, seen * 0.84 + 0.12, soft);
  vec3 normal = normalize(vec3(q, height * 1.4));
  float highlight = pow(max(dot(normal, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 40.0);
  seen += highlight * 0.6 * (1.0 - soft);
  float edge = 1.0 - smoothstep(mix(0.84, 0.45, soft), 1.0, d);
  gl_FragColor = vec4(seen, edge * vDrop.w);
}`;

/**
 * Rain between the eye and the scene, as glass: each falling streak is a thin lens that shows the
 * view behind it shifted sideways and a little brighter along one edge. Three depths of streak; the
 * rest of the frame is left alone. `uLean` slants them with the wind across the view.
 */
const RAIN_REFRACTION_FRAGMENT = /* glsl */`
uniform sampler2D tFrame;
uniform vec2 uResolution;
uniform float uAspect, uTime, uAmount, uLean;
varying vec2 vUv;
float streakHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float shift = 0.0, cover = 0.0;
  for (int i = 0; i < 3; i++) {
    float layer = float(i), columns = 64.0 + layer * 52.0;
    vec2 p = vec2(vUv.x * uAspect + vUv.y * uLean, vUv.y);
    float column = floor(p.x * columns), across = fract(p.x * columns) - 0.5;
    float speed = (2.4 + streakHash(vec2(column, layer)) * 1.6) * (1.0 - 0.22 * layer);
    float slot = 0.46 - 0.12 * layer;
    float y = (p.y + uTime * speed + streakHash(vec2(column, layer + 7.0)) * 9.0) / slot;
    float row = floor(y), along = fract(y);
    float on = step(1.0 - uAmount * (0.1 + 0.05 * layer), streakHash(vec2(column, row + layer * 31.0)));
    float width = 0.2 + 0.22 * streakHash(vec2(row, column));
    float body = (1.0 - smoothstep(width * 0.55, width, abs(across))) * smoothstep(0.0, 0.2, along) * (1.0 - smoothstep(0.5, 0.95, along));
    float seen = on * body * (1.0 - 0.25 * layer);
    shift += seen * across / width * (1.0 - 0.3 * layer);
    cover = max(cover, seen);
  }
  if (cover < 0.02) discard;
  float px = uResolution.y / 800.0;
  vec2 uv = vUv + vec2(-shift * 9.0, cover * 5.0) * px / uResolution;
  vec3 seen = texture2D(tFrame, clamp(uv, 0.0, 1.0)).rgb;
  // The lit edge of a drop: a little of the scene's own light gathered to one side.
  seen *= 1.0 + 0.22 * max(0.0, shift);
  gl_FragColor = vec4(seen, min(1.0, cover * 1.15));
}`;

/**
 * A sheet of water over the lens after a dunking. It covers everything at first and drains from the
 * top, its lower part still running: what is behind it wobbles and blurs, and a bright ragged line
 * marks where the glass has cleared down to.
 */
const FILM_FRAGMENT = /* glsl */`
uniform sampler2D tFrame;
uniform float uAspect, uTime, uFilm;
varying vec2 vUv;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float front = uFilm * 1.45 - 0.25 + 0.05 * sin(p.x * 6.0 + uTime * 1.7) + 0.025 * sin(p.x * 19.0 - uTime * 2.6);
  float cover = 1.0 - smoothstep(front - 0.14, front, vUv.y);
  if (cover < 0.01) discard;
  vec2 wave = vec2(sin(p.y * 13.0 + uTime * 5.0 + 2.0 * sin(p.x * 7.0)), cos(p.x * 11.0 - uTime * 2.0 + 2.0 * sin(p.y * 9.0 + uTime * 4.0)));
  wave += 0.5 * vec2(sin(p.x * 31.0 + p.y * 17.0 + uTime * 7.0), cos(p.y * 37.0 - uTime * 9.0));
  float depth = cover * (0.35 + 0.65 * uFilm);
  vec2 uv = clamp(vUv + wave * vec2(0.006 / uAspect, 0.01) * depth, 0.0, 1.0), blur = vec2(0.004 / uAspect, 0.004) * depth;
  vec3 seen = (texture2D(tFrame, uv).rgb * 2.0 + texture2D(tFrame, uv + blur).rgb + texture2D(tFrame, uv - blur).rgb
    + texture2D(tFrame, uv + vec2(blur.x, -blur.y)).rgb + texture2D(tFrame, uv + vec2(-blur.x, blur.y)).rgb) / 6.0;
  // The draining edge catches the light.
  float edge = smoothstep(front - 0.05, front - 0.01, vUv.y) * (1.0 - smoothstep(front - 0.01, front, vUv.y));
  seen = seen * (1.0 - 0.06 * cover) + 0.1 * edge;
  gl_FragColor = vec4(seen, min(1.0, cover * 1.6));
}`;

export interface LensFrame {
  camera: THREE.PerspectiveCamera;
  dt: number; time: number;
  /** Unit vector towards the sun (the key light), its height in degrees, and its colour. */
  sun: Direction; elevation: number; sunColor: string;
  /** 0 full day to 1 night (the hour's `shift`). */
  dusk: number;
  /** From the weather: how much sun gets through (its `sun`), haze 0–1, rain 0–1, wind. */
  sunlight: number; haze: number; rain: number; wind: number;
  /** Under a roof or in a vehicle: no rain lands. */
  sheltered: boolean;
  /** The sky colour cleared on the canvas, or null when the sky is not a plain colour. */
  sky: THREE.Color | null;
  /** Only the god-ray overlay actually composited into this frame, if any. */
  sunRayOverlay?: SunRayOverlay | null;
  /** The scene is drawing temperature (thermal), which has no sun or glinting dust. */
  thermal: boolean;
  reduced: boolean;
  swimming?: boolean; swimSpeed?: number;
}

export function createLensEffects(renderer: THREE.WebGLRenderer) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene();
  const visible = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType });
  const visibility = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: VISIBILITY_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
    uniforms: { tFrame: { value: null }, tSunRays: { value: null }, uRayColor: { value: new THREE.Color(0) }, uSun: { value: new THREE.Vector2() }, uSpread: { value: new THREE.Vector2() }, uSky: { value: new THREE.Vector3() }, uBlend: { value: 1 } } });
  const air = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: AIR_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending,
    uniforms: { tVisible: { value: visible.texture }, uSun: { value: new THREE.Vector2() }, uFlare: { value: 0 }, uSunColor: { value: new THREE.Color() }, uAspect: { value: 1 },
      uHaze: { value: 0 }, uDust: { value: 0 }, uTime: { value: 0 }, uPxPerRadian: { value: 1000 }, uSunDirection: { value: new THREE.Vector3() },
      uInverseProjection: { value: new THREE.Matrix4() }, uCameraWorld: { value: new THREE.Matrix4() }, uLayers: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] } } });
  const refraction = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: RAIN_REFRACTION_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
    uniforms: { tFrame: { value: null }, uResolution: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTime: { value: 0 }, uAmount: { value: 0 }, uLean: { value: 0 } } });
  const film = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader: FILM_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
    uniforms: { tFrame: { value: null }, uAspect: { value: 1 }, uTime: { value: 0 }, uFilm: { value: 0 } } });
  const quad = new THREE.Mesh(geometry, air); quad.frustumCulled = false; quadScene.add(quad);

  const dropScene = new THREE.Scene(), rain = createLensRain();
  const dropGeometry = new THREE.InstancedBufferGeometry();
  dropGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  dropGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const dropData = new Float32Array(LENS_DROP_LIMIT * 4), shapeData = new Float32Array(LENS_DROP_LIMIT * 4);
  const dropAttribute = new THREE.InstancedBufferAttribute(dropData, 4).setUsage(THREE.DynamicDrawUsage);
  const shapeAttribute = new THREE.InstancedBufferAttribute(shapeData, 4).setUsage(THREE.DynamicDrawUsage);
  dropGeometry.setAttribute('aDrop', dropAttribute); dropGeometry.setAttribute('aShape', shapeAttribute); dropGeometry.instanceCount = 0;
  const dropMaterial = new THREE.ShaderMaterial({ vertexShader: DROP_VERTEX, fragmentShader: DROP_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
    uniforms: { tFrame: { value: null }, uResolution: { value: new THREE.Vector2() }, uAspect: { value: 1 } } });
  const dropMesh = new THREE.Mesh(dropGeometry, dropMaterial); dropMesh.frustumCulled = false; dropScene.add(dropMesh);

  const size = new THREE.Vector2(), sunPoint = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const lastPosition = new THREE.Vector3(), skyRgb = { r: 0, g: 0, b: 0 };
  const layers = air.uniforms.uLayers.value as THREE.Vector2[];
  /** Metres to each dust layer, for parallax as you move; how many cells a layer wraps at, so wrapping never shows. */
  const DEPTHS = [40, 12, 3.5], CELLS = [70, 34, 15];
  let frame: THREE.FramebufferTexture | null = null, placed = false, seenSun = 0;
  const status = { flare: 0, dust: 0, drops: 0, refraction: 0, film: 0 };
  return {
    /** What showed last frame: flare strength (after anything in front of the sun), dust strength, drops on the lens, and how much the falling rain bends the view (0–1). */
    get status() { return status; },
    get drops() { return rain.drops; },
    /** Spray off water struck close by; `from` is where across the screen (0–1) it was struck. */
    splash(strength:number,aspect:number,reduced=false,from=.5) { rain.splash(strength,aspect,reduced,from); },
    clear() { rain.clear(); },
    present(f: LensFrame) {
      const camera = f.camera;
      renderer.getDrawingBufferSize(size);
      const aspect = size.x / Math.max(1, size.y);
      camera.getWorldDirection(forward);
      rain.step(f.dt, { rain: f.rain, exposure: rainExposure(forward.y), sheltered: f.sheltered, aspect, wind: f.wind, reduced: f.reduced, swimming:f.swimming,swimSpeed:f.swimSpeed });

      // Where the sun is on screen, and how much of a flare it could make there.
      sunPoint.set(f.sun.x, f.sun.y, f.sun.z);
      const facing = sunPoint.dot(forward);
      sunPoint.multiplyScalar(1000).add(camera.position).project(camera);
      const sunU = sunPoint.x * .5 + .5, sunV = sunPoint.y * .5 + .5;
      const outside = Math.max(0, -sunU, sunU - 1, -sunV, sunV - 1);
      const flare = f.thermal || !f.sky || facing <= 0 ? 0 : sunFlareStrength(f.elevation, f.sunlight) * (1 - smoothstep(0, .12, outside));
      const dust = f.thermal ? 0 : dustStrength(f.haze, 1 - f.dusk, f.sheltered) * (f.reduced ? .5 : 1);

      // The dust layers slide against your movement, nearer ones more, and drift on the wind.
      camera.getWorldPosition(sunPoint);
      if (placed) {
        right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
        const moved = sunPoint.sub(lastPosition), sideways = moved.dot(right), lifted = moved.dot(up);
        for (let i = 0; i < 3; i++) {
          const wrap = 64 / CELLS[i], drift = (.04 + f.wind * .012) * Math.min(.1, f.dt) / (1 + i * .3);
          layers[i].x = (layers[i].x + Math.max(-.5, Math.min(.5, sideways / DEPTHS[i])) + drift) % wrap;
          layers[i].y = (layers[i].y + Math.max(-.5, Math.min(.5, lifted / DEPTHS[i])) + Math.sin(f.time * .3 + i) * .002 * Math.min(.1, f.dt)) % wrap;
        }
      }
      camera.getWorldPosition(lastPosition); placed = true;

      const drops = rain.drops.length;
      // Falling rain bends the view behind it: less from under a roof (it is all some way off), none looking straight up or down its fall.
      const bend = f.reduced ? 0 : rainRefraction(f.rain, f.wind, f.sheltered, forward.y);
      const sheet = rain.film;
      status.dust = dust; status.drops = drops; status.refraction = bend; status.film = sheet;
      if (flare < .002) seenSun = 0;
      if (flare < .002 && dust < .002 && !drops && bend < .02 && sheet < .01) { status.flare = 0; return; }

      if (!frame || frame.image.width !== size.x || frame.image.height !== size.y) {
        frame?.dispose(); frame = new THREE.FramebufferTexture(size.x, size.y);
        frame.minFilter = frame.magFilter = THREE.LinearFilter;
      }
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null); renderer.copyFramebufferToTexture(frame);
      if (flare >= .002) {
        // Is the sky still there round the sun? Eased towards each frame's answer.
        f.sky!.getRGB(skyRgb, THREE.SRGBColorSpace);
        const v = visibility.uniforms;
        v.tSunRays.value = f.sunRayOverlay?.texture ?? frame;
        if (f.sunRayOverlay) v.uRayColor.value.copy(f.sunRayOverlay.color); else v.uRayColor.value.setRGB(0, 0, 0);
        v.tFrame.value = frame; v.uSun.value.set(sunU, sunV); v.uSpread.value.set(.006 / aspect, .006);
        v.uSky.value.set(skyRgb.r, skyRgb.g, skyRgb.b); v.uBlend.value = seenSun ? 1 - Math.exp(-Math.min(.1, f.dt) * 14) : 1;
        quad.material = visibility; renderer.setRenderTarget(visible); renderer.render(quadScene, quadCamera);
        renderer.setRenderTarget(null); seenSun = 1;
      }
      if (flare >= .002 || dust >= .002) {
        const u = air.uniforms;
        u.uSun.value.set(sunU, sunV); u.uFlare.value = flare; u.uSunColor.value.set(f.sunColor); u.uAspect.value = aspect;
        u.uHaze.value = f.haze; u.uDust.value = dust; u.uTime.value = f.time % 3600;
        u.uPxPerRadian.value = size.y / THREE.MathUtils.degToRad(camera.fov);
        u.uSunDirection.value.set(f.sun.x, f.sun.y, f.sun.z);
        u.uInverseProjection.value.copy(camera.projectionMatrixInverse); u.uCameraWorld.value.copy(camera.matrixWorld);
        quad.material = air; renderer.render(quadScene, quadCamera);
      }
      status.flare = flare;
      if (bend >= .02) {
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        const u = refraction.uniforms;
        u.tFrame.value = frame; u.uResolution.value.copy(size); u.uAspect.value = aspect; u.uTime.value = f.time % 600; u.uAmount.value = bend;
        // Wind across the view slants the streaks; the weather's wind blows along `GUST_DOWNWIND`.
        u.uLean.value = Math.max(-.5, Math.min(.5, (right.x * GUST_DOWNWIND.x + right.z * GUST_DOWNWIND.z) * f.wind / 25));
        quad.material = refraction; renderer.render(quadScene, quadCamera);
      }
      if (sheet >= .01) {
        const u = film.uniforms;
        u.tFrame.value = frame; u.uAspect.value = aspect; u.uTime.value = f.reduced ? 0 : f.time % 600; u.uFilm.value = sheet;
        quad.material = film; renderer.render(quadScene, quadCamera);
      }
      if (drops) {
        for (let i = 0; i < drops; i++) {
          const drop = rain.drops[i], fadeIn = Math.min(1, drop.age / .08), fadeOut = Math.min(1, (drop.life - drop.age) / .6);
          const smear = drop.kind === 'smear', spray = drop.kind === 'spray';
          // A hard landing spreads wide and flat for a moment before it draws back into a bead.
          const splat = drop.impact ? Math.exp(-drop.age / .07) : 0;
          dropData[i * 4] = drop.x; dropData[i * 4 + 1] = drop.y; dropData[i * 4 + 2] = drop.radius * (1 + .8 * splat);
          dropData[i * 4 + 3] = (smear ? .88 * Math.min(1, drop.age / .35) : spray ? .8 * fadeIn : .92 * fadeIn) * Math.max(0, smear ? Math.min(1, (drop.life - drop.age) / 1.2) : fadeOut);
          shapeData[i * 4] = smear ? .15 : spray ? drop.stretch ?? 1 : Math.min(drop.splash?2.4:.9, drop.speed * (drop.splash?5:2.2)); shapeData[i * 4 + 1] = drop.seed;
          shapeData[i * 4 + 2] = smear ? 1 : .5 * splat; shapeData[i * 4 + 3] = spray ? drop.angle ?? 0 : 0;
        }
        dropAttribute.clearUpdateRanges(); dropAttribute.addUpdateRange(0, drops * 4); dropAttribute.needsUpdate = true;
        shapeAttribute.clearUpdateRanges(); shapeAttribute.addUpdateRange(0, drops * 4); shapeAttribute.needsUpdate = true;
        dropGeometry.instanceCount = drops;
        dropMaterial.uniforms.tFrame.value = frame; dropMaterial.uniforms.uResolution.value.copy(size); dropMaterial.uniforms.uAspect.value = aspect;
        renderer.render(dropScene, quadCamera);
      }
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    },
    dispose() {
      frame?.dispose(); visible.dispose(); geometry.dispose(); dropGeometry.dispose();
      visibility.dispose(); air.dispose(); refraction.dispose(); film.dispose(); dropMaterial.dispose(); rain.clear();
    },
  };
}
