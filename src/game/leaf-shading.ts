import * as THREE from 'three';

/**
 * How plants take light. Presentation only: nothing here changes geometry, cover or what a round strikes.
 *
 * A leaf is thin: about a third to a half of the sunlight landing on one side comes out of the other,
 * yellower than the leaf looks from above. Without that a frond seen against the sun is a black
 * cut-out. `shadeLeaves` gives a standard material that second term for every light the engine already
 * evaluates (the sun, the moon, street lamps), using the light after its shadow, so a frond in the
 * shade of a tower does not glow.
 *
 * - `thin` (fronds, blades, anything modelled as a double-sided sheet): light arriving on the far
 *   face is transmitted, strongest looking toward the light.
 * - thick (closed crown shapes): the lit side wraps a little further round than a hard surface would.
 * - both: the far side of a crown is in its own shadow, so the shadowed term never reaches it. It
 *   gets a small unshadowed share of the first directional light instead, as the light a real crown
 *   passes down through its leaves.
 */
export interface LeafShade {
  /** Double-sided sheet geometry. Closed crowns leave this off. */
  thin?: boolean;
  /** Share of incident light passed through, before the tint. About .45 for a soft leaf, .3 for a leathery one. */
  transmit?: number;
  /** What the leaf does to the light on its way through, as multipliers on the leaf's own colour. */
  tint?: readonly [number, number, number];
  /** How much the leaf's upper face shines beyond a plain surface: 0 matte, 1 waxy (a palm frond). Cut leaves carry their own (leaf-cards.ts). */
  gloss?: number;
}
export const LEAF_TRANSMIT_TINT: readonly [number, number, number] = [1.35, 1.25, .35];
const KEY = 'leaf-shade-v3';
/** How wet the plants are, 0 dry to 1 soaked. world-atmosphere.ts moves it with the rain; one value for whichever world is drawn. */
export const leafWetness = { value: 0 };
/** Guarded, because a material can be both shaded here and cut into leaves, and each adds it. */
export const leafWetDeclarations = /* glsl */`
#ifndef LEAF_WET
#define LEAF_WET
uniform float leafWet;
#endif
`;
/** Under cloud there is no sun to mirror, but a wet leaf still shows the sky, most at a glancing angle. The
 * scene's ambient light stands in for the sky's colour. Goes before the lights are summed. */
export const leafWetSky = /* glsl */`
reflectedLight.indirectSpecular += ambientLightColor * leafWet * (.04 + .35 * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 4.0));
`;
/** A film of water is smoother than any leaf: a wet leaf's highlight is tight and bright. */
export const leafWetRoughness = /* glsl */`
roughnessFactor = mix(roughnessFactor, min(roughnessFactor, .4), leafWet);
`;
const shaded = new WeakMap<THREE.Material, Required<LeafShade>>();
export const leafShade = (material: THREE.Material) => shaded.get(material);

const n = (value: number) => value.toFixed(3);
/** The GLSL added after the standard material's light functions. Exported for the tests. */
export function leafLightChunk(shade: Required<LeafShade>) {
  const tint = `vec3(${shade.tint.map(n).join(', ')})`;
  return /* glsl */`
void RE_Direct_Leaf(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float leafFar = saturate(dot(-geometryNormal, directLight.direction));
  // Brightest looking up the beam, as a leaf held against the sun is.
  float leafToward = saturate(dot(-geometryViewDir, directLight.direction));
  ${shade.thin
    ? `reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor * ${tint}) * leafFar * ${n(shade.transmit)} * (.65 + .6 * leafToward * leafToward);`
    : `float leafWrap = saturate((dot(geometryNormal, directLight.direction) + .35) / 1.35) - saturate(dot(geometryNormal, directLight.direction));
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * leafWrap * .6;`}
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf
`;
}
/**
 * Light passed down through a crown, which the crown's own shadow would otherwise remove: the far side
 * of a closed crown shape, and the lower fronds of a palm shaded by the ones above. A smaller share for
 * thin leaves, which already pass the light that reaches them.
 */
export function leafCrownChunk(shade: Required<LeafShade>) {
  return /* glsl */`
#if NUM_DIR_LIGHTS > 0
  reflectedLight.directDiffuse += directionalLights[0].color * BRDF_Lambert(material.diffuseColor * vec3(${shade.tint.map(n).join(', ')}))
    * saturate(dot(-geometryNormal, directionalLights[0].direction) + .25) * ${n(shade.transmit * (shade.thin ? .4 : .5))};
#endif
`;
}

/** Idempotent. Keeps whatever the material already compiles (wind, district look, wetness). */
export function shadeLeaves<T extends THREE.Material>(material: T, options: LeafShade = {}): T {
  if (shaded.has(material) || !(material as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial) return material;
  const shade = { thin: options.thin ?? material.side === THREE.DoubleSide, transmit: options.transmit ?? .42, tint: options.tint ?? LEAF_TRANSMIT_TINT, gloss: options.gloss ?? 0 };
  shaded.set(material, shade);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + leafLightChunk(shade));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_end>', leafCrownChunk(shade) + leafWetSky + '#include <lights_fragment_end>');
    // Shine: the species' gloss, and more of it under a film of rain. `max`, so the order this and the leaf cut run in does not matter.
    shader.uniforms.leafWet = leafWetness;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + leafWetDeclarations)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + leafWetRoughness)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\nmaterial.specularColor = max(material.specularColor, vec3(${n(.04 + .13 * shade.gloss)} + .03 * leafWet));\n`);
  };
  material.customProgramCacheKey = function() {
    return `${key.call(this)}|${KEY}-${shade.thin ? 'thin' : 'thick'}-${n(shade.transmit)}-${shade.tint.map(n).join('-')}-${n(shade.gloss)}`;
  };
  material.needsUpdate = true;
  return material;
}
/** A clone made for batching carries the same leaf light as its source. */
export function inheritLeafShade(source: THREE.Material, target: THREE.Material) {
  const shade = shaded.get(source);
  if (shade && !shaded.has(target)) shaded.set(target, shade);
}
