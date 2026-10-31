import * as THREE from 'three';

/**
 * What a round struck, as far as the impact it leaves is concerned. Districts
 * are built from plain coloured materials rather than tagged ones, so the
 * kind is read from the material itself (metalness, transparency, colour,
 * name) unless something along the hit object's parent chain, or its
 * material, declares one outright with `userData.impactSurface`.
 *
 * This decides how the hit looks and sounds: chips, splinters, shards or
 * blood, its impact sound and its mark. Damage and penetration never read it.
 */
export type SurfaceKind = 'concrete' | 'metal' | 'wood' | 'glass' | 'foliage' | 'dirt' | 'flesh';
export const SURFACE_KINDS: readonly SurfaceKind[] = ['concrete', 'metal', 'wood', 'glass', 'foliage', 'dirt', 'flesh'];
/** The decal atlas, in tile order. `blood` is only ever left on what stood behind a body. */
export type DecalKind = 'crater' | 'splinter' | 'dent' | 'crack' | 'soil' | 'blood';
export const DECAL_KINDS: readonly DecalKind[] = ['crater', 'splinter', 'dent', 'crack', 'soil', 'blood'];

export interface SurfaceLook {
  /** Multiplier on the spark count the weapon's impact profile asks for. */
  sparks: number;
  /** Multiplier on the brightness of the flash ring. */
  flash: number;
  /** What the struck surface throws up as dust, mist or powder. */
  dust: { colour: string; scale: number; opacity: number; life: number };
  /**
   * Solid fragments: chips, splinters, shards, leaves or droplets. `shape` is
   * the per-axis stretch of one fragment, so a splinter is long and a leaf flat.
   */
  debris: { count: number; colours: readonly string[]; size: number; shape: readonly [number, number, number]; speed: number; gravity: number; drag: number; life: number; spread: number };
  /** The mark left behind, or null where nothing would hold one. */
  decal: DecalKind | null;
  decalScale: number;
}

export const SURFACE_LOOKS: Readonly<Record<SurfaceKind, SurfaceLook>> = {
  // Chipped masonry: a grey powder cloud, a few stone chips, the odd spark.
  concrete: {
    sparks: .5, flash: .8, dust: { colour: '#bfb8a8', scale: 1, opacity: 1, life: 1 },
    debris: { count: 6, colours: ['#9d978c', '#b9b3a6', '#7f7a72'], size: .011, shape: [1, .8, .9], speed: 3.2, gravity: 9.8, drag: 1.2, life: .7, spread: .9 },
    decal: 'crater', decalScale: 1,
  },
  // Steel rings: a shower of sparks, almost no dust and a small bright dent.
  metal: {
    sparks: 1.7, flash: 1.45, dust: { colour: '#55575a', scale: .4, opacity: .55, life: .6 },
    debris: { count: 2, colours: ['#d4d8dc', '#8e9499'], size: .006, shape: [1, .25, .8], speed: 4.2, gravity: 9.8, drag: 1.5, life: .4, spread: .7 },
    decal: 'dent', decalScale: .62,
  },
  // Timber tears rather than chips: no sparks, pale splinters and sawdust.
  wood: {
    sparks: 0, flash: .3, dust: { colour: '#b0916a', scale: .7, opacity: .8, life: .9 },
    debris: { count: 8, colours: ['#d2b083', '#a77f54', '#e6caa0'], size: .011, shape: [.22, .22, 2.6], speed: 3, gravity: 9.8, drag: 1.6, life: .9, spread: .8 },
    decal: 'splinter', decalScale: 1.05,
  },
  // Glass crazes: a spray of glinting shards and a crack star much wider than the hole.
  glass: {
    sparks: 0, flash: .6, dust: { colour: '#e4eef0', scale: .3, opacity: .45, life: .45 },
    debris: { count: 10, colours: ['#eefaff', '#bfe3ea', '#ffffff'], size: .012, shape: [1, .06, .7], speed: 2.6, gravity: 9.8, drag: .8, life: .8, spread: 1 },
    decal: 'crack', decalScale: 2.8,
  },
  // Leaves flutter down instead of falling; a crown holds no mark.
  foliage: {
    sparks: 0, flash: 0, dust: { colour: '#71894f', scale: .45, opacity: .5, life: .8 },
    debris: { count: 7, colours: ['#5b8a4c', '#44703d', '#86a55a'], size: .022, shape: [1, .05, .7], speed: 1.8, gravity: 2.2, drag: 4, life: 1.4, spread: 1.1 },
    decal: null, decalScale: 0,
  },
  // Earth kicks up a tall brown plume and clods, and darkens where it was struck.
  dirt: {
    sparks: 0, flash: .15, dust: { colour: '#8f7656', scale: 1.35, opacity: 1.1, life: 1.3 },
    debris: { count: 8, colours: ['#5e4a35', '#7a6249', '#4a3a2a'], size: .014, shape: [1, .9, 1], speed: 3.6, gravity: 9.8, drag: 1, life: .8, spread: .45 },
    decal: 'soil', decalScale: 1.2,
  },
  // A body: red mist and droplets, no flash and nothing left on a moving figure.
  flesh: {
    sparks: 0, flash: 0, dust: { colour: '#7a0d0b', scale: .55, opacity: .95, life: .45 },
    debris: { count: 9, colours: ['#6b0b09', '#8a1310', '#4d0606'], size: .009, shape: [1, 1, 1], speed: 2.4, gravity: 9.8, drag: 1.2, life: .6, spread: 1.2 },
    decal: null, decalScale: 0,
  },
};

export const isSurfaceKind = (value: unknown): value is SurfaceKind => typeof value === 'string' && (SURFACE_KINDS as readonly string[]).includes(value);

/** What a material offers to go on: colour as sRGB hue/saturation/lightness in [0, 1]. */
export interface SurfaceSample {
  h: number; s: number; l: number;
  metalness?: number; opacity?: number; transmission?: number; name?: string;
  /** World-space y of the struck face's normal: grass underfoot is earth, not leaves. */
  normalY?: number;
}
const NAME_HINTS: readonly [RegExp, SurfaceKind][] = [
  [/wood|timber|plank|bamboo|crate|pallet|parquet/i, 'wood'],
  [/glass|window|windscreen|pane/i, 'glass'],
  [/metal|steel|iron|chrome|alumin|brass|copper/i, 'metal'],
  [/leaf|leaves|foliage|hedge|canopy|grass/i, 'foliage'],
  [/soil|dirt|mud|sand|earth|gravel/i, 'dirt'],
  [/concrete|stone|brick|plaster|asphalt|tile|marble/i, 'concrete'],
];

/**
 * A best reading of an untagged material. Deliberately conservative: anything
 * it cannot place is concrete, which is what most of every district is.
 */
export function classifySurface(sample: SurfaceSample): SurfaceKind {
  const named = sample.name ? NAME_HINTS.find(([pattern]) => pattern.test(sample.name!)) : undefined;
  let kind: SurfaceKind = named?.[1] ?? 'concrete';
  if (!named) {
    const { h, s, l } = sample;
    if ((sample.transmission ?? 0) > .2 || (sample.opacity ?? 1) < .85) kind = 'glass';
    else if ((sample.metalness ?? 0) >= .45) kind = 'metal';
    // Leaf greens: from yellow-green to blue-green, never so pale it is paint.
    else if (h >= .17 && h <= .45 && s >= .2 && l >= .1 && l <= .6) kind = 'foliage';
    // Stained and raw timber is an orange-brown, darker and duller than an
    // awning; terracotta and brick sit redder than .055 and stay masonry.
    else if (h >= .055 && h <= .13 && s >= .18 && s <= .56 && l >= .12 && l <= .5) kind = 'wood';
  }
  // A green face pointing up is a lawn or a slope, and a lawn throws earth.
  if (kind === 'foliage' && (sample.normalY ?? 0) > .7) kind = 'dirt';
  return kind;
}

const hsl = { h: 0, s: 0, l: 0 };
/** Reads one material, preferring an explicit `userData.impactSurface` on it. */
export function materialSurface(material: THREE.Material | undefined, normalY = 0): SurfaceKind {
  if (!material) return 'concrete';
  if (isSurfaceKind(material.userData.impactSurface)) return material.userData.impactSurface;
  const coloured = material as THREE.Material & { color?: THREE.Color; metalness?: number; transmission?: number };
  // `isColor` rather than instanceof, so a colour from another copy of three still reads.
  if (coloured.color?.isColor) coloured.color.getHSL(hsl, THREE.SRGBColorSpace);
  else { hsl.h = 0; hsl.s = 0; hsl.l = .6; }
  return classifySurface({ ...hsl, metalness: coloured.metalness, transmission: coloured.transmission,
    opacity: material.transparent ? material.opacity : 1, name: material.name, normalY });
}

/**
 * The surface a raycast struck. An explicit tag anywhere up the parent chain
 * wins, so a whole character rig can be declared flesh once at its root; the
 * struck face's own material is read otherwise.
 */
export function hitSurface(hit: Pick<THREE.Intersection, 'object' | 'face'>, normalY = 0): SurfaceKind {
  for (let node: THREE.Object3D | null = hit.object; node; node = node.parent)
    if (isSurfaceKind(node.userData.impactSurface)) return node.userData.impactSurface;
  const material = (hit.object as THREE.Mesh).material;
  return materialSurface(Array.isArray(material) ? material[hit.face?.materialIndex ?? 0] : material, normalY);
}
