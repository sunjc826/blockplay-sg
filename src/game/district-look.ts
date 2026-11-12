import * as THREE from 'three';
import type { Direction } from './world-lighting';
import type { Rgb } from './world-sky-light';

/**
 * A district's deliberate look, opt-in per scene (`scene.userData.districtLook`,
 * or the scene kit's `look` option). Three parts, all extending what the world
 * atmosphere already drives, so districts without a look keep theirs unchanged:
 *
 * - Indirect light: a daytime sky-visibility channel baked into the natural-light
 *   field of `night-exposure` (same grid, same material patch, instancing and
 *   merged geometry included since it is sampled by world position). It scales
 *   only the sky/ambient light, never the sun, and adds a ground-coloured bounce
 *   where the sky is hidden, so street canyons, the feet of walls and the
 *   undersides of decks pool shade that has shape. It works at the scale of
 *   metres; the screen-space GTAO keeps the corners under three metres.
 * - Sky and haze: a gradient dome (zenith, horizon, sun glow, a warm sun-side
 *   horizon at dusk) with flat-shaded, blocky clouds, behind everything; the
 *   same sky colour, without clouds, is what height-aware haze fades scenery
 *   into, so a far tower recedes into the sky actually behind it.
 * - Colour grade: a small split-tone, saturation and contrast step applied in
 *   the post chain's output pass, after tone mapping.
 *
 * The palette is designed as the colours that should reach the screen (linear).
 * The dome shows them as they are, like the plain clear-colour sky it replaces;
 * the haze uses `inverseAcesFilmic` to turn them into scene values that tone-map
 * back onto the sky behind, at the hour's exposure. `skyColorAt`, `hazeAmount`,
 * `gradeColor` and `acesFilmic` are the CPU mirrors of the GLSL, for tests and
 * for the lens flare's test of whether the sun is still in clear sky.
 */
export interface GradeStop {
  /** Multipliers in display space: shadows and highlights are tinted by these. */
  shadows: Rgb; highlights: Rgb;
  saturation: number; contrast: number;
}
export interface ColorGrade extends GradeStop { amount: number }
export interface DistrictLook {
  /** Strength of the baked sky visibility on ambient light, 0–1. */
  indirect: number;
  /** Ambient light kept where no sky is visible at all, before the bounce is added. */
  indirectFloor: number;
  /** Ground-coloured light bounced into sky-occluded places and onto the lower walls, as a share of the sun's horizontal irradiance. */
  bounce: number;
  /**
   * Walls near the ground: ambient darkens over the first `fade` metres above `base` (by `darken`,
   * less where GTAO already darkens corners) and ground bounce warms them over `reach` metres.
   */
  contact: { base: number; darken: number; fade: number; reach: number };
  clouds: { height: number; cell: number };
  /** Haze thins with height above `base` over `height` metres; `floor` of it never thins. */
  haze: { base: number; height: number; floor: number };
  grade: { amount: number; day: GradeStop; dusk: GradeStop; night: GradeStop; storm: GradeStop };
  /** Procedural surface variation on lit materials; none when absent. See `SurfaceVariation`. */
  surface?: SurfaceVariation;
}

/**
 * Flat colours that vary like real materials, without textures or geometry. All three
 * parts multiply the material's own colour and roughness in the lit-material patch,
 * from coordinates that move with the mesh (instance space, or scaled object space),
 * so instanced, merged and moving geometry keep a fixed pattern and never shimmer.
 */
export interface SurfaceVariation {
  /**
   * Per building: instances are grouped by the `cell` (metres) their origin falls in, so the
   * stacked boxes of one tower share a seed while neighbouring towers differ. `value` and `hue`
   * (warm/cool) are ± shares of the colour, `roughness` of the roughness. Halved on up-facing faces.
   * Plain (non-instanced) meshes have no seed: game code may move them, and a seed from their
   * position would flicker.
   */
  building: { cell: number; value: number; hue: number; roughness: number };
  /**
   * Up-facing faces (paving, lawns, roads, roofs): two scales of blocky cells, `coarse` and `fine`
   * metres across, varying value, grass hue (yellower where lighter) and roughness by ± these
   * shares. Cells fade to their mean once smaller than a pixel or two, so the far field is calm.
   */
  ground: { coarse: number; fine: number; value: number; hue: number; roughness: number };
  /**
   * Walls: a grimy foot over the first `grimeHeight` metres above the look's contact base (less
   * where the contact term already darkens the ambient, so the two do not double up), and a lift
   * of up to `lift` towards `liftHeight` metres, so towers lighten upwards. Blocky `panel` cells
   * (width, height in metres) on each face vary value and roughness by ± `value` and `roughness`,
   * so a curtain wall reflects pane by pane and a render wall is not one flat sheet.
   */
  wall: { grime: number; grimeHeight: number; lift: number; liftHeight: number; panel: [number, number]; value: number; roughness: number };
}

export const MARINA_LOOK: DistrictLook = {
  indirect: 1, indirectFloor: .4, bounce: .22,
  surface: {
    building: { cell: 8, value: .12, hue: .035, roughness: .15 },
    ground: { coarse: 9, fine: 2.25, value: .1, hue: .06, roughness: .3 },
    wall: { grime: .25, grimeHeight: 1.2, lift: .1, liftHeight: 60, panel: [4.5, 3.3], value: .04, roughness: .25 },
  },
  contact: { base: 0, darken: .45, fade: 3, reach: 9 },
  clouds: { height: 900, cell: 70 },
  haze: { base: 0, height: 60, floor: .22 },
  grade: {
    amount: 1,
    // Warm sun on stone and glass, teal-blue shade: the bay's daytime palette.
    day: { shadows: [.95, 1.0, 1.06], highlights: [1.04, 1.0, .94], saturation: 1.1, contrast: 1.1 },
    dusk: { shadows: [.96, .97, 1.07], highlights: [1.05, 1.0, .94], saturation: 1.04, contrast: 1.04 },
    night: { shadows: [.92, .98, 1.1], highlights: [1.04, 1.0, .94], saturation: 1.05, contrast: 1.05 },
    storm: { shadows: [.96, 1.0, 1.04], highlights: [1.0, 1.0, .99], saturation: .92, contrast: 1.04 },
  },
};

export interface LookPalette {
  zenith: Rgb; horizon: Rgb; ground: Rgb; sunGlow: Rgb; duskTint: Rgb;
  cloudLit: Rgb; cloudMid: Rgb; cloudShade: Rgb;
  /** Share of the sky the cloud field covers, 0–1, and how opaque its cells are. */
  coverage: number; cloudOpacity: number;
}
export interface LookPaletteInput {
  /** The flat sky colour the atmosphere would otherwise show: the weather's sky towards the hour's. */
  background: Rgb;
  keyColor: Rgb; keyDirection: Direction;
  /** Sun elevation in degrees. */
  elevation: number;
  /** 0 full day to 1 night (`LightingState.shift`), and the night-exposure amount. */
  shift: number; night: number;
  /** Eased weather: sunlight share 0–1, rain 0–1, haze 0–1. */
  sun: number; rain: number; haze: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];
const times = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const luminance = (c: Rgb) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
/** A colour's hue at unit luminance, so a tint carries no brightness of its own. */
const hue = (c: Rgb): Rgb => scale(c, 1 / Math.max(1e-4, luminance(c)));

/** Clear-day zenith over the weather's flat sky colour, as displayed: a deliberate, saturated blue. */
const ZENITH_TINT: Rgb = [.17, .4, .84];
const DUSK_ZENITH: Rgb = [.42, .4, .78];
/** Night glow off the city on the underside of the sky: warm sodium and white LED. */
/** Dusk air away from the sun, as a tint on the sky's own grey: cooler than the weather's pink. */
const DUSK_AIR: Rgb = [.96, .93, 1.12];
const CITY_GLOW: Rgb = [.034, .026, .03];

/** The hour's and weather's sky, haze and cloud colours as displayed. Pure, so tests can hold it to day, dusk, night and storm. */
export function lookPalette(input: LookPaletteInput): LookPalette {
  const { background, keyColor, shift, night } = input;
  const clear = smoothstep(.3, 1, input.sun), day = 1 - night, dusk = clamp01(shift * 1.25) * day;
  const L = luminance(background), grey: Rgb = [L, L, L];
  // Day: a deeper, bluer zenith over a paler horizon. Overcast flattens both towards the weather's grey.
  let zenith = mix(scale(background, .82), times(background, mix(ZENITH_TINT, DUSK_ZENITH, dusk)), clear);
  // A paler, slightly warm haze at the horizon, so distance reads as air rather than as more blue.
  let horizon = mix(background, times(grey, [1.12, 1.1, 1.04]), .42 * (.4 + .6 * clear) * (1 - dusk));
  // Dusk: the air away from the sun cools to mauve, so haze does not wash the whole district one pink;
  // the warmth sits on the sun's side (see duskTint).
  horizon = mix(horizon, times(grey, DUSK_AIR), dusk * .5 * clear);
  // Night: a dark zenith over a horizon lifted by the city's own glow.
  zenith = mix(zenith, scale(background, .62), night);
  horizon = mix(horizon, [background[0] * 1.45 + CITY_GLOW[0], background[1] * 1.45 + CITY_GLOW[1], background[2] * 1.45 + CITY_GLOW[2]], night);
  const ground = scale(horizon, .82);
  const sunUp = smoothstep(-5, 1.5, input.elevation);
  const sunGlow = scale(keyColor, (.55 * sunUp + .05 * night) * input.sun ** 1.5 * (1 - input.haze * .4));
  const duskTint = scale(keyColor, .42 * dusk * input.sun);
  const coverage = clamp01(.24 + (1 - input.sun) * .85 + input.rain * .12);
  const lightHue = mix([1, 1, 1], hue(keyColor), .35 + .45 * dusk);
  // Sunlit cloud is brighter than the horizon; under rain the cloud base is darker than the haze below it.
  const lit = scale(lightHue, Math.max(luminance(horizon) * (1.22 - .34 * (1 - clear)), .02));
  let cloudLit = mix(lit, scale(grey, .95), (1 - clear) * .55);
  let cloudMid = mix(scale(cloudLit, .86), zenith, .12);
  let cloudShade = scale(mix(scale(cloudLit, .64), zenith, .28), 1 - .38 * input.rain);
  // Overcast and rain: a darker deck against the grey sky, not pale cells that read as gaps in it.
  const overcast = (1 - clear) * .85;
  cloudLit = mix(cloudLit, scale(zenith, .96), overcast); cloudMid = mix(cloudMid, scale(zenith, .87), overcast); cloudShade = mix(cloudShade, scale(zenith, .76 - .1 * input.rain), overcast);
  // Night clouds: barely brighter than the sky, lit from below by the city.
  cloudLit = mix(cloudLit, scale(horizon, 1.5), night); cloudMid = mix(cloudMid, scale(horizon, 1.22), night); cloudShade = mix(cloudShade, scale(mix(zenith, horizon, .5), 1.15), night);
  return { zenith, horizon, ground, sunGlow, duskTint, cloudLit, cloudMid, cloudShade, coverage, cloudOpacity: .96 * (1 - input.haze * .55) };
}

/** Clear-sky colour (no clouds) seen along unit direction `d`. Mirrors `lookSkyColor` in the GLSL. */
export function skyColorAt(p: Pick<LookPalette, 'zenith' | 'horizon' | 'ground' | 'sunGlow' | 'duskTint'>, d: Direction, sun: Direction): Rgb {
  const up = clamp01(d.y);
  let sky = mix(p.horizon, p.zenith, up ** .55);
  const flat = Math.hypot(d.x, d.z) || 1e-5, sunFlat = Math.hypot(sun.x, sun.z) || 1e-5;
  const side = Math.max(0, (d.x * sun.x + d.z * sun.z) / (flat * sunFlat));
  const band = side ** 3 * Math.exp(-up * 5);
  const facing = Math.max(0, d.x * sun.x + d.y * sun.y + d.z * sun.z);
  const glow = facing ** 48 * .55 + facing ** 6 * .18;
  sky = [0, 1, 2].map(c => sky[c] + p.duskTint[c] * band + p.sunGlow[c] * glow) as unknown as Rgb;
  if (d.y < 0) sky = mix(sky, p.ground, smoothstep(0, .25, -d.y));
  return sky;
}

/**
 * Share of a surface's colour replaced by haze: exponential fog starting at half
 * the weather's fog near, reaching half at 45% of the way from near to far
 * (at ground level), thinning with height above `base` (a `floor` share never
 * thins), integrated along the ray.
 */
export function hazeAmount(distance: number, eyeY: number, pointY: number, fogNear: number, fogFar: number, haze: DistrictLook['haze']) {
  const start = fogNear * .5, density = Math.LN2 / Math.max(1, fogNear + (fogFar - fogNear) * .45 - start);
  const h0 = Math.max(eyeY - haze.base, 0) / haze.height, h1 = Math.max(pointY - haze.base, 0) / haze.height, dh = h1 - h0;
  const heightTerm = Math.abs(dh) < 1e-3 ? Math.exp(-h0) : (Math.exp(-h0) - Math.exp(-h1)) / dh;
  return 1 - Math.exp(-density * Math.max(0, distance - start) * (haze.floor + (1 - haze.floor) * heightTerm));
}

/** Three's ACES filmic tone mapping (r180), for the colour a linear value lands on the canvas as. */
export function acesFilmic(c: Rgb, exposure: number): Rgb {
  const s = exposure / .6, r = c[0] * s, g = c[1] * s, b = c[2] * s;
  const i = [.59719 * r + .35458 * g + .04823 * b, .076 * r + .90834 * g + .01566 * b, .0284 * r + .13383 * g + .83777 * b];
  const f = i.map(v => (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .432951) + .238081));
  return [clamp01(1.60475 * f[0] - .53108 * f[1] - .07367 * f[2]), clamp01(-.10208 * f[0] + 1.10813 * f[1] - .00605 * f[2]), clamp01(-.00327 * f[0] - .07276 * f[1] + 1.07602 * f[2])];
}

/** The scene colour that `acesFilmic` maps to `c` (a displayed linear colour) at this exposure; out-of-range parts clamp. */
export function inverseAcesFilmic(c: Rgb, exposure: number): Rgb {
  const o = c.map(v => Math.min(.985, Math.max(0, v)));
  // Inverse of the output matrix, then of the rational fit (a quadratic), then of the input matrix.
  const f = [.64304 * o[0] + .31119 * o[1] + .04578 * o[2], .05927 * o[0] + .93144 * o[1] + .00929 * o[2], .00596 * o[0] + .06393 * o[1] + .93012 * o[2]];
  const v = f.map(x => { const y = Math.min(1.01, Math.max(0, x)), A = 1 - .983729 * y, B = .0245786 - .432951 * y, C = -(.000090537 + .238081 * y);
    return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A); });
  const s = .6 / exposure;
  return [Math.max(0, (1.76474 * v[0] - .67578 * v[1] - .08896 * v[2]) * s), Math.max(0, (-.14703 * v[0] + 1.16025 * v[1] - .01322 * v[2]) * s), Math.max(0, (-.03634 * v[0] - .16244 * v[1] + 1.19878 * v[2]) * s)];
}

/** The grade on a tone-mapped linear colour. Mirrors `lookGrade` in the output pass. */
export function gradeColor(c: Rgb, grade: ColorGrade): Rgb {
  if (grade.amount <= 0) return c;
  let g = c.map(v => Math.max(v, 0) ** (1 / 2.2)) as unknown as Rgb;
  const l = luminance(g);
  g = g.map(v => { const c = clamp01(v); return v + (c * c * (3 - 2 * c) - v) * (grade.contrast - 1) * 2; }) as unknown as Rgb;
  const grey = luminance(g);
  g = g.map(v => grey + (v - grey) * grade.saturation) as unknown as Rgb;
  // Tints carry hue only: normalised to unit luminance, so the grade never darkens shade by itself.
  const t = smoothstep(0, 1, l), tint = mix(grade.shadows, grade.highlights, t), unit = luminance(tint);
  const graded = g.map((v, i) => clamp01(v * tint[i] / unit) ** 2.2) as unknown as Rgb;
  return mix(c, graded, grade.amount);
}

const mixStop = (a: GradeStop, b: GradeStop, t: number): GradeStop => ({ shadows: mix(a.shadows, b.shadows, t), highlights: mix(a.highlights, b.highlights, t),
  saturation: a.saturation + (b.saturation - a.saturation) * t, contrast: a.contrast + (b.contrast - a.contrast) * t });
/** The grade for the hour and weather: day to dusk to night, pulled towards the storm grade by rain and lost sun. */
export function blendGrade(grade: DistrictLook['grade'], shift: number, night: number, storm: number): ColorGrade {
  const dusk = clamp01(shift * 1.25) * (1 - night);
  const lit = mixStop(mixStop(grade.day, grade.dusk, dusk), grade.night, night);
  return { amount: grade.amount, ...mixStop(lit, grade.storm, clamp01(storm) * (1 - night * .6)) };
}

/** Twelve cosine-weighted directions over the upper hemisphere, for baked sky visibility. */
export const DAY_SKY_RAYS: readonly Direction[] = Array.from({ length: 12 }, (_, i) => {
  const u = (i + .5) / 12, angle = i * 2.399963229728653, radius = Math.sqrt(u);
  return { x: Math.cos(angle) * radius, y: Math.sqrt(1 - u), z: Math.sin(angle) * radius };
});

const fract = (v: number) => v - Math.floor(v);
/** Hash of a 2D point to 0–1: the `lookSurfaceHash` the surface GLSL uses (hash12, no sine), mirrored for tests. */
export function surfaceHash(x: number, y: number) {
  let a = fract(x * .1031), b = fract(y * .1031), c = fract(x * .1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
/** A building's two seeds, −1–1 (value, then warm/cool), from its instance origin: one per `cell` metres of footprint. */
export function buildingSeed(x: number, z: number, cell: number): [number, number] {
  const i = Math.floor(x / cell), j = Math.floor(z / cell);
  return [surfaceHash(i, j) * 2 - 1, surfaceHash(i + 19.19, j + 19.19) * 2 - 1];
}
/** Blocky ground cells at a point, −1–1, before any distance fade. Mirrors the GLSL away from cell edges. */
export function groundCells(x: number, z: number, ground: SurfaceVariation['ground']) {
  const coarse = surfaceHash(Math.floor(x / ground.coarse), Math.floor(z / ground.coarse));
  const fine = surfaceHash(Math.floor(x / ground.fine + 31.7), Math.floor(z / ground.fine + 31.7));
  return (.62 * coarse + .38 * fine - .5) * 2;
}
/** Wall panel cells at a point on a wall (`along` it and `y` up, metres), −1–1. Mirrors the GLSL on an axis-aligned wall. */
export function wallPanels(along: number, y: number, wall: SurfaceVariation['wall']) {
  return (surfaceHash(Math.floor(along / wall.panel[0] + 7.3), Math.floor(y / wall.panel[1] + 7.3)) - .5) * 2;
}
export interface SurfacePoint {
  /**
   * World normal's y, the height above the look's contact base (m), the building seed (none for plain meshes),
   * the ground cells and wall panels (`groundCells`, `wallPanels`) and how green the colour is (0–1).
   */
  normalY: number; height: number; seed: [number, number] | null; cells: number; panels: number; green: number;
}
/**
 * The colour and roughness multipliers the surface GLSL applies at a point. `contactDarken` is the
 * look's current wall-foot ambient darkening (`lookContact.y`), which eases the grime.
 */
export function surfaceShade(p: SurfacePoint, s: SurfaceVariation, contactDarken: number, amount = 1) {
  const up = smoothstep(.6, .9, p.normalY), side = 1 - smoothstep(.25, .5, Math.abs(p.normalY));
  const [value, warm] = p.seed ?? [0, 0], share = 1 - .5 * up;
  let tint: Rgb = [1 + s.building.value * value * share, 1 + s.building.value * value * share, 1 + s.building.value * value * share];
  tint = times(tint, [1 + s.building.hue * warm * share, 1, 1 - s.building.hue * warm * share]);
  const cells = p.cells * up;
  tint = scale(tint, 1 + s.ground.value * cells);
  tint = times(tint, mix([1, 1, 1], [1 + s.ground.hue * cells, 1, 1 - 1.6 * s.ground.hue * cells], p.green));
  const panels = p.panels * side;
  tint = scale(tint, 1 + s.wall.value * panels);
  const grime = s.wall.grime * side * Math.exp(-Math.max(p.height, 0) / s.wall.grimeHeight) * (1 - contactDarken);
  const lift = s.wall.lift * side * smoothstep(0, s.wall.liftHeight, p.height);
  tint = scale(times(tint, mix([1, 1, 1], [.86, .84, .8], grime)), 1 + lift);
  return { color: mix([1, 1, 1], tint, amount),
    roughness: 1 + amount * (s.ground.roughness * cells + s.wall.roughness * panels + s.building.roughness * value * share) };
}

/** Uniforms for the surface GLSL; amount (`lookSurface.x`) is set each frame and stays 0 without a `surface`. */
export function surfaceUniforms(s: SurfaceVariation | undefined) {
  return {
    lookSurface: { value: new THREE.Vector4(0, s?.building.value ?? 0, s?.building.hue ?? 0, s?.building.roughness ?? 0) },
    lookCells: { value: new THREE.Vector4(1 / (s?.ground.coarse ?? 1), 1 / (s?.ground.fine ?? 1), s?.ground.value ?? 0, s?.ground.roughness ?? 0) },
    lookWallTone: { value: new THREE.Vector4(s?.wall.grime ?? 0, s?.wall.grimeHeight ?? 1, s?.wall.lift ?? 0, s?.wall.liftHeight ?? 1) },
    lookPanels: { value: new THREE.Vector4(1 / (s?.wall.panel[0] ?? 1), 1 / (s?.wall.panel[1] ?? 1), s?.wall.value ?? 0, s?.wall.roughness ?? 0) },
    lookGrassHue: { value: s?.ground.hue ?? 0 },
    lookSeedCell: { value: s?.building.cell ?? 1 },
  };
}

/** Vertex side of the surface variation: coordinates that move with the mesh, and the building seed. */
export const LOOK_SURFACE_VERTEX_DECLARATIONS = /* glsl */`
uniform float lookSeedCell;
varying vec3 vLookCoord;
varying vec3 vLookNormal;
varying vec2 vLookSeed;
float lookSurfaceHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
`;
/**
 * After project_vertex. The undeformed position, so tree wind and skinning never slide the pattern,
 * and the normal in the same frame, so wall panels follow the mesh's own faces.
 */
export const LOOK_SURFACE_VERTEX = /* glsl */`
  vec3 lookScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  #ifdef USE_INSTANCING
    vLookCoord = (instanceMatrix * vec4(position, 1.0)).xyz * lookScale;
    vLookNormal = mat3(instanceMatrix) * objectNormal;
    vec2 lookCellId = floor(instanceMatrix[3].xz * lookScale.xz / lookSeedCell);
    vLookSeed = vec2(lookSurfaceHash(lookCellId), lookSurfaceHash(lookCellId + 19.19)) * 2.0 - 1.0;
  #else
    vLookCoord = position * lookScale;
    vLookNormal = objectNormal;
    vLookSeed = vec2(0.0);
  #endif
`;
const LOOK_SURFACE_GLSL = /* glsl */`
uniform vec4 lookSurface;
uniform vec4 lookCells;
uniform vec4 lookWallTone;
uniform vec4 lookPanels;
uniform float lookGrassHue;
varying vec3 vLookCoord;
varying vec3 vLookNormal;
varying vec2 vLookSeed;
float lookSurfaceHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// Nearest-cell value, blended across each cell edge over one pixel, settling to the mean once cells are pixel-sized.
// w is the cell coordinate's screen derivative, taken by the caller outside any branch.
float lookCellValue(vec2 p, vec2 w) {
  w = max(w, vec2(1e-4));
  float fade = smoothstep(0.25, 0.6, max(w.x, w.y));
  if (fade >= 1.0) return 0.5;
  vec2 u = p - 0.5, i = floor(u), f = fract(u);
  vec2 k = clamp((f - 0.5) / w + 0.5, 0.0, 1.0);
  float v = mix(mix(lookSurfaceHash(i), lookSurfaceHash(i + vec2(1.0, 0.0)), k.x), mix(lookSurfaceHash(i + vec2(0.0, 1.0)), lookSurfaceHash(i + vec2(1.0)), k.x), k.y);
  return mix(v, 0.5, fade);
}
`;
/** After color_fragment: the colour multipliers. Mirrors `surfaceShade`. Leaves `lookRoughness` for the roughness step. */
export const LOOK_SURFACE_ALBEDO = /* glsl */`
  float lookRoughness = 1.0;
  if (lookSurface.x > 0.0) {
    vec3 lookSurfaceN = normalize(vExposureNormal);
    float lookUp = smoothstep(0.6, 0.9, lookSurfaceN.y), lookSide = 1.0 - smoothstep(0.25, 0.5, abs(lookSurfaceN.y));
    float lookShare = 1.0 - 0.5 * lookUp;
    vec3 lookTint = vec3(1.0 + lookSurface.y * vLookSeed.x * lookShare);
    lookTint *= vec3(1.0 + lookSurface.z * vLookSeed.y * lookShare, 1.0, 1.0 - lookSurface.z * vLookSeed.y * lookShare);
    // Derivatives once, before the branches below skip faces a term does not touch.
    vec3 lookDeriv = fwidth(vLookCoord);
    float lookCellMix = 0.0;
    if (lookUp > 0.0) lookCellMix = (0.62 * lookCellValue(vLookCoord.xz * lookCells.x, lookDeriv.xz * lookCells.x)
      + 0.38 * lookCellValue(vLookCoord.xz * lookCells.y + 31.7, lookDeriv.xz * lookCells.y) - 0.5) * 2.0 * lookUp;
    lookTint *= 1.0 + lookCells.z * lookCellMix;
    float lookGreen = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) / max(diffuseColor.g, 1e-3) * 4.0, 0.0, 1.0);
    lookTint *= mix(vec3(1.0), vec3(1.0 + lookGrassHue * lookCellMix, 1.0, 1.0 - 1.6 * lookGrassHue * lookCellMix), lookGreen);
    // Wall panels on the mesh's own faces: x-facing walls run along z, z-facing along x, blended on curved ones.
    float lookPanelMix = 0.0;
    if (lookSide > 0.0) {
      vec3 lookFace = abs(normalize(vLookNormal));
      float lookAlongZ = lookFace.x > 0.01 ? lookCellValue(vLookCoord.zy * lookPanels.xy + 7.3, lookDeriv.zy * lookPanels.xy) : 0.5;
      float lookAlongX = lookFace.z > 0.01 ? lookCellValue(vLookCoord.xy * lookPanels.xy + 7.3, lookDeriv.xy * lookPanels.xy) : 0.5;
      lookPanelMix = ((lookAlongZ * lookFace.x + lookAlongX * lookFace.z) / max(lookFace.x + lookFace.z, 1e-3) - 0.5) * 2.0 * lookSide;
    }
    lookTint *= 1.0 + lookPanels.z * lookPanelMix;
    float lookHeight = max(vExposureWorld.y - lookContact.x, 0.0);
    float lookGrime = lookWallTone.x * lookSide * exp(-lookHeight / lookWallTone.y) * (1.0 - lookContact.y);
    float lookLift = lookWallTone.z * lookSide * smoothstep(0.0, lookWallTone.w, lookHeight);
    lookTint *= mix(vec3(1.0), vec3(0.86, 0.84, 0.8), lookGrime) * (1.0 + lookLift);
    diffuseColor.rgb *= mix(vec3(1.0), lookTint, lookSurface.x);
    lookRoughness = 1.0 + lookSurface.x * (lookCells.w * lookCellMix + lookPanels.w * lookPanelMix + lookSurface.w * vLookSeed.x * lookShare);
  }
`;
/** After roughnessmap_fragment (standard materials only). */
export const LOOK_SURFACE_ROUGHNESS = /* glsl */`
  roughnessFactor = clamp(roughnessFactor * lookRoughness, 0.03, 1.0);
`;

/** Haze, sky and indirect GLSL shared by the dome and every lit material's patch. */
export const LOOK_SKY_GLSL = /* glsl */`
uniform vec3 lookZenith;
uniform vec3 lookHorizon;
uniform vec3 lookGround;
uniform vec3 lookSunDir;
uniform vec3 lookSunGlow;
uniform vec3 lookDuskTint;
uniform float lookFlat;
uniform vec3 lookFlatColor;
vec3 lookSkyColor(vec3 d) {
  float up = clamp(d.y, 0.0, 1.0);
  vec3 sky = mix(lookHorizon, lookZenith, pow(up, 0.55));
  float side = max(0.0, dot(normalize(d.xz + vec2(1e-5)), normalize(lookSunDir.xz + vec2(1e-5))));
  sky += lookDuskTint * pow(side, 3.0) * exp(-up * 5.0);
  float facing = max(0.0, dot(d, lookSunDir));
  sky += lookSunGlow * (pow(facing, 48.0) * 0.55 + pow(facing, 6.0) * 0.18);
  if (d.y < 0.0) sky = mix(sky, lookGround, smoothstep(0.0, 0.25, -d.y));
  return mix(sky, lookFlatColor, lookFlat);
}
`;
export const LOOK_MATERIAL_GLSL = /* glsl */`${LOOK_SKY_GLSL}
uniform float lookIndirectFloor;
uniform vec3 lookBounce;
uniform vec4 lookContact;
uniform vec3 lookHaze;
`;
/** After the night factors, inside `RE_IndirectDiffuse`: `naturalVisibility.b` is the baked daytime sky visibility. */
export const LOOK_INDIRECT_GLSL = /* glsl */`
  // A wall's own building hides half its sky already, and the sky light's normal accounts for that half:
  // judge walls against what an unobstructed wall would see, so only other buildings and overhangs shade them.
  vec3 lookNormal = normalize(vExposureNormal);
  float lookSky = clamp(naturalVisibility.b / mix(0.5, 1.0, abs(lookNormal.y)), 0.0, 1.0);
  // Walls near the ground: a darker foot, then ground-coloured bounce fading up the wall.
  float lookWall = 1.0 - abs(lookNormal.y), lookAbove = max(vExposureWorld.y - lookContact.x, 0.0);
  float lookFoot = lookWall * exp(-lookAbove / lookContact.z), lookWarm = lookWall * exp(-lookAbove / lookContact.w);
  float lookOcclusion = mix(1.0, (lookIndirectFloor + (1.0 - lookIndirectFloor) * pow(lookSky, 1.2)) * (1.0 - lookContact.y * lookFoot), nightExposureDay);
  irradiance *= lookOcclusion; iblIrradiance *= lookOcclusion;
  irradiance += lookBounce * (1.0 - lookSky + lookWarm * 0.6 * (1.0 - lookFoot)) * nightExposureDay;
`;
export const LOOK_SPECULAR_GLSL = /* glsl */`
  radiance *= mix(1.0, clamp(naturalVisibility.b / mix(0.5, 1.0, abs(normalize(vExposureNormal).y)), 0.0, 1.0), nightExposureDay * 0.85);
`;
/** Replaces three's fog, before tone mapping on every path, towards the scene-referred sky that tone-maps onto the displayed dome. lookHaze: base, height, floor. */
export const LOOK_FOG_GLSL = /* glsl */`
#if defined( USE_FOG ) && !defined( FOG_EXP2 )
{
  vec3 lookRay = vExposureWorld - cameraPosition;
  float lookDistance = length(lookRay);
  float lookStart = fogNear * 0.5, lookDensity = 0.6931472 / max(1.0, fogNear + (fogFar - fogNear) * 0.45 - lookStart);
  float lookH0 = max(cameraPosition.y - lookHaze.x, 0.0) / lookHaze.y, lookH1 = max(vExposureWorld.y - lookHaze.x, 0.0) / lookHaze.y;
  float lookDh = lookH1 - lookH0;
  float lookHeight = abs(lookDh) < 1e-3 ? exp(-lookH0) : (exp(-lookH0) - exp(-lookH1)) / lookDh;
  float lookFog = 1.0 - exp(-lookDensity * max(0.0, lookDistance - lookStart) * (lookHaze.z + (1.0 - lookHaze.z) * lookHeight));
  vec3 lookDir = lookRay / max(lookDistance, 1e-4);
  vec3 lookFogColor = mix(lookSkyColor(normalize(vec3(lookDir.x, max(lookDir.y, 0.0), lookDir.z))), fogColor, lookFlat);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, lookFogColor, lookFog);
}
#endif
`;
/** The grade, spliced into the post chain's output pass after tone mapping. Mirrors `gradeColor`. */
export const GRADE_GLSL = /* glsl */`
uniform float gradeAmount;
uniform vec3 gradeShadows;
uniform vec3 gradeHighlights;
uniform float gradeSaturation;
uniform float gradeContrast;
vec3 lookGrade(vec3 c) {
  const vec3 w = vec3(0.2126, 0.7152, 0.0722);
  vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float l = dot(g, w);
  g = mix(g, g * g * (3.0 - 2.0 * g), (gradeContrast - 1.0) * 2.0);
  float grey = dot(g, w);
  g = grey + (g - grey) * gradeSaturation;
  vec3 tint = mix(gradeShadows, gradeHighlights, smoothstep(0.0, 1.0, l));
  g = clamp(g * tint / dot(tint, w), 0.0, 1.0);
  return mix(c, pow(g, vec3(2.2)), gradeAmount);
}
`;
/** Grade uniforms for a pass, and a setter from a `ColorGrade` (null leaves the picture untouched). */
export function createGradeUniforms() {
  const uniforms = { gradeAmount: { value: 0 }, gradeShadows: { value: new THREE.Vector3(1, 1, 1) }, gradeHighlights: { value: new THREE.Vector3(1, 1, 1) },
    gradeSaturation: { value: 1 }, gradeContrast: { value: 1 } };
  return {
    uniforms,
    set(grade: ColorGrade | null | undefined) {
      uniforms.gradeAmount.value = grade?.amount ?? 0;
      if (!grade) return false;
      uniforms.gradeShadows.value.set(...grade.shadows); uniforms.gradeHighlights.value.set(...grade.highlights);
      uniforms.gradeSaturation.value = grade.saturation; uniforms.gradeContrast.value = grade.contrast;
      return grade.amount > 0;
    },
  };
}

const DOME_VERTEX = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position * 100.0, 1.0); gl_Position = clip.xyww; }`;
const DOME_FRAGMENT = /* glsl */`
${LOOK_SKY_GLSL}
${GRADE_GLSL}
uniform vec4 lookCloud;
uniform vec2 lookCloudShape;
uniform float lookCloudOpacity;
uniform float lookCloudDetail;
uniform vec3 lookCloudLit;
uniform vec3 lookCloudMid;
uniform vec3 lookCloudShade;
varying vec3 vDir;
float lookHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float lookNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lookHash(i), lookHash(i + vec2(1.0, 0.0)), f.x), mix(lookHash(i + vec2(0.0, 1.0)), lookHash(i + vec2(1.0)), f.x), f.y);
}
// One cloud cell: flat colour by how deep inside the cloud it sits (bright rim, mid, dark core), alpha 0 or 1.
vec4 lookCell(vec2 c) {
  float n = 0.62 * lookNoise(c / 9.0) + 0.31 * lookNoise(c / 3.6 + 17.0) + 0.07 * lookHash(c);
  float t = n - (1.0 - lookCloud.z) * 0.62 - 0.19;
  if (t <= 0.0) return vec4(0.0);
  return vec4(t < 0.045 ? lookCloudLit : t < 0.12 ? lookCloudMid : lookCloudShade, 1.0);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 colour = lookSkyColor(d);
  if (d.y > 0.0 && lookFlat < 0.5 && lookCloudOpacity > 0.0) {
    vec2 p = d.xz / max(d.y, 0.03) * lookCloudShape.x + lookCloud.xy;
    vec4 cloud;
    if (lookCloudDetail > 0.5) {
      // Nearest-cell blocks, filtered across each cell edge over one pixel so they stay crisp without crawling.
      vec2 u = p / lookCloudShape.y - 0.5, i = floor(u), f = fract(u);
      vec2 k = clamp((f - 0.5) / max(fwidth(u), vec2(1e-4)) + 0.5, 0.0, 1.0);
      cloud = mix(mix(lookCell(i), lookCell(i + vec2(1.0, 0.0)), k.x), mix(lookCell(i + vec2(0.0, 1.0)), lookCell(i + vec2(1.0)), k.x), k.y);
    } else cloud = lookCell(floor(p / lookCloudShape.y));
    // Clouds melt into the horizon haze, so the far field never aliases.
    float fade = smoothstep(0.035, 0.24, d.y) * lookCloudOpacity;
    colour = mix(colour, cloud.rgb / max(cloud.a, 1e-4), cloud.a * fade);
  }
  // Display colours, like the plain sky it replaces: never tone-mapped, graded only with the post chain's grade.
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
  if (gradeAmount > 0.0) gl_FragColor.rgb = lookGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
}`;

export interface LookFrame {
  /** Eased flat sky colour (linear), the hour's key colour and direction, and the sun elevation. */
  background: THREE.Color; keyColor: THREE.Color; keyDirection: Direction; elevation: number;
  shift: number; night: number; sun: number; rain: number; haze: number; wind: number;
  /** Tone-mapping exposure the frame renders at: the palette is inverted through it. */
  exposure: number;
  /** Sun irradiance as the scene's directional light delivers it: colour × intensity. */
  sunIrradiance: THREE.Color;
  /** The hour's ground colour (the hemisphere's), whose hue the bounce takes. */
  groundColor: THREE.Color;
  /** Seconds, for the cloud drift; dt for its step. */
  dt: number; reduced: boolean;
  /** Reduced effects (the Low and Battery presets): no clouds and no baked indirect light, so phones pay only for the gradient and haze. */
  lowDetail: boolean;
  /** Whether screen-space ambient occlusion also darkens the frame. */
  gtao: boolean;
}

/** What world-occlusion needs of a district's sky (`scene.userData.skyDome`). */
export interface SkyDome {
  /** The dome inside the scene: hidden while the post chain draws the scene's HDR picture. */
  mesh: THREE.Mesh;
  /** Draws the dome alone (to the canvas, under the post chain's picture), with that frame's grade. */
  draw(renderer: THREE.WebGLRenderer, camera: THREE.Camera, grade: ColorGrade | null): void;
  /** The grade the in-scene dome carries: none on the plain one-render path. */
  setGrade(grade: ColorGrade | null): void;
}

/**
 * The dome, the shared uniforms, and the material-patch pieces `createNightExposure` splices in.
 * The dome shows display colours, as the plain clear-colour sky did: in the post chain it is drawn
 * on the canvas under the tone-mapped scene (so it never blooms or greys); on the plain path it is
 * drawn first in the scene, untone-mapped. Haze in lit materials uses the same sky turned into scene
 * values (inverse ACES), so it tone-maps back onto the sky behind it.
 */
export function createDistrictLook(look: DistrictLook, options: { software?: boolean } = {}) {
  const v3 = () => ({ value: new THREE.Vector3() });
  const shared = { lookSunDir: { value: new THREE.Vector3(0, 1, 0) }, lookFlat: { value: 0 }, lookFlatColor: v3() };
  /** Scene-referred sky for the haze, and the indirect-light terms: spliced into lit materials. */
  const uniforms = {
    ...shared, lookZenith: v3(), lookHorizon: v3(), lookGround: v3(), lookSunGlow: v3(), lookDuskTint: v3(),
    lookIndirectFloor: { value: look.indirectFloor }, lookBounce: v3(),
    lookContact: { value: new THREE.Vector4(look.contact.base, look.contact.darken, look.contact.fade, look.contact.reach) },
    lookHaze: { value: new THREE.Vector3(look.haze.base, look.haze.height, look.haze.floor) },
    ...surfaceUniforms(look.surface),
  };
  const grade = createGradeUniforms();
  const domeUniforms = { ...shared, lookZenith: v3(), lookHorizon: v3(), lookGround: v3(), lookSunGlow: v3(), lookDuskTint: v3(), ...grade.uniforms,
    lookCloud: { value: new THREE.Vector4(0, 0, .3, 0) }, lookCloudShape: { value: new THREE.Vector2(look.clouds.height, look.clouds.cell) },
    lookCloudOpacity: { value: 1 }, lookCloudDetail: { value: options.software ? 0 : 1 }, lookCloudLit: v3(), lookCloudMid: v3(), lookCloudShade: v3() };
  const material = new THREE.ShaderMaterial({ name: 'district-sky', uniforms: domeUniforms, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT,
    side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const dome = new THREE.Mesh(geometry, material), canvasDome = new THREE.Mesh(geometry, material), skyScene = new THREE.Scene();
  for (const mesh of [dome, canvasDome]) { mesh.name = 'district-sky'; mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.raycast = () => {}; mesh.userData.fpsEffect = true; }
  skyScene.add(canvasDome);
  /** What the atmosphere last set the background to: anything else (thermal's cold sky) flattens the sky to it. */
  const expected = new THREE.Color();
  let world: THREE.Scene | null = null;
  dome.onBeforeRender = canvasDome.onBeforeRender = () => {
    const background = world?.background instanceof THREE.Color ? world.background : null;
    const flat = !!background && (Math.abs(background.r - expected.r) + Math.abs(background.g - expected.g) + Math.abs(background.b - expected.b)) > 1e-4;
    shared.lookFlat.value = flat ? 1 : 0;
    if (background) shared.lookFlatColor.value.set(background.r, background.g, background.b);
  };
  const skyDome: SkyDome = {
    mesh: dome,
    setGrade(g) { grade.set(g); },
    draw(renderer, camera, g) {
      grade.set(g);
      const autoClear = renderer.autoClear; renderer.autoClear = false;
      renderer.render(skyScene, camera); renderer.autoClear = autoClear;
    },
  };
  const rgb = (c: THREE.Color): Rgb => [c.r, c.g, c.b];
  const set = (target: { value: THREE.Vector3 }, c: Rgb) => target.value.set(c[0], c[1], c[2]);
  let palette: LookPalette | null = null, drift = 0;
  const horizon = new THREE.Color();
  return {
    dome, uniforms, skyDome,
    /**
     * For `createNightExposure`: uniforms and GLSL spliced into its lit-material patch. None on a
     * software renderer, which keeps three's fog (towards the displayed horizon) and no daytime bake.
     */
    extension: options.software ? undefined : { uniforms, declarations: LOOK_MATERIAL_GLSL + (look.surface ? LOOK_SURFACE_GLSL : ''),
      indirect: LOOK_INDIRECT_GLSL, specular: LOOK_SPECULAR_GLSL, fog: LOOK_FOG_GLSL,
      ...(look.surface ? { vertexDeclarations: LOOK_SURFACE_VERTEX_DECLARATIONS, vertex: LOOK_SURFACE_VERTEX, albedo: LOOK_SURFACE_ALBEDO, roughness: LOOK_SURFACE_ROUGHNESS } : {}) },
    /** Average horizon colour for materials that keep three's own fog: scene-referred, or as displayed on a software renderer (fog there lands after tone mapping). */
    get horizon() { return horizon; },
    get palette() { return palette; },
    /** Puts the dome in the scene's atmosphere root and hands world-occlusion the sky. */
    attach(scene: THREE.Scene, root: THREE.Object3D) { world = scene; root.add(dome); scene.userData.skyDome = skyDome; },
    update(frame: LookFrame) {
      palette = lookPalette({ background: rgb(frame.background), keyColor: rgb(frame.keyColor), keyDirection: frame.keyDirection, elevation: frame.elevation,
        shift: frame.shift, night: frame.night, sun: frame.sun, rain: frame.rain, haze: frame.haze });
      set(domeUniforms.lookZenith, palette.zenith); set(domeUniforms.lookHorizon, palette.horizon); set(domeUniforms.lookGround, palette.ground);
      set(domeUniforms.lookSunGlow, palette.sunGlow); set(domeUniforms.lookDuskTint, palette.duskTint);
      set(domeUniforms.lookCloudLit, palette.cloudLit); set(domeUniforms.lookCloudMid, palette.cloudMid); set(domeUniforms.lookCloudShade, palette.cloudShade);
      domeUniforms.lookCloudOpacity.value = frame.lowDetail ? 0 : palette.cloudOpacity;
      // The haze's sky in scene values: ACES lands it on the displayed sky. Additive glows are matched at the horizon.
      const scene = (c: Rgb) => inverseAcesFilmic(c, frame.exposure), base = scene(palette.horizon);
      const added = (c: Rgb) => { const sum = scene([palette!.horizon[0] + c[0], palette!.horizon[1] + c[1], palette!.horizon[2] + c[2]]); return [0, 1, 2].map(i => Math.max(0, sum[i] - base[i])) as unknown as Rgb; };
      set(uniforms.lookZenith, scene(palette.zenith)); set(uniforms.lookHorizon, base); set(uniforms.lookGround, scene(palette.ground));
      set(uniforms.lookSunGlow, added(palette.sunGlow)); set(uniforms.lookDuskTint, added(palette.duskTint));
      shared.lookSunDir.value.set(frame.keyDirection.x, frame.keyDirection.y, frame.keyDirection.z).normalize();
      // Clouds drift with the wind; reduced motion holds them still.
      if (!frame.reduced) drift += frame.dt * (2.5 + frame.wind * 3);
      domeUniforms.lookCloud.value.set(drift * .8, drift * .35, palette.coverage, 0);
      horizon.setRGB(...(options.software ? palette.horizon : base));
      expected.copy(frame.background);
      // Bounce: ground of the hour's ground colour lit by the sun, reaching places the sky does not.
      const sunHeight = Math.max(0, frame.keyDirection.y) * (1 - frame.night);
      const g = frame.groundColor, albedo = 1 / Math.max(1e-4, .2126 * g.r + .7152 * g.g + .0722 * g.b);
      uniforms.lookBounce.value.set(frame.sunIrradiance.r * g.r * albedo, frame.sunIrradiance.g * g.g * albedo, frame.sunIrradiance.b * g.b * albedo).multiplyScalar(look.bounce * sunHeight);
      // GTAO already darkens the first few metres of every corner, over sun and sky alike: keep only a little of the foot.
      uniforms.lookContact.value.y = look.contact.darken * (frame.gtao ? .35 : 1);
      // Surface variation is off on reduced effects (phones and the Battery preset): the branch is skipped.
      uniforms.lookSurface.value.x = look.surface && !frame.lowDetail ? 1 : 0;
      return frame.lowDetail ? 0 : look.indirect * (frame.gtao ? .85 : 1) * (1 - frame.night);
    },
    /** The clear-sky colour at the sun as it reaches the canvas (with the post chain's grade, if any), for the lens flare's sky test. */
    skyAtSun(grade: ColorGrade | null, out: THREE.Color) {
      if (!palette) return null;
      const d = shared.lookSunDir.value;
      let c = skyColorAt(palette, d, d).map(v => Math.max(0, Math.min(1, v))) as unknown as Rgb;
      if (grade) c = gradeColor(c, grade);
      return out.setRGB(c[0], c[1], c[2]);
    },
    dispose() {
      geometry.dispose(); material.dispose(); dome.removeFromParent();
      if (world?.userData.skyDome === skyDome) delete world.userData.skyDome;
    },
  };
}
export type DistrictLookController = ReturnType<typeof createDistrictLook>;

