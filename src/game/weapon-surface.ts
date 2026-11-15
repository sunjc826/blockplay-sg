import * as THREE from 'three';

/** Close-range surface detail for the carried guns.
 *
 * The gun builders give every material one colour, one roughness and one metalness, and no unwrapped
 * UVs. This adds two small tiling textures per material family, projected along the three model axes:
 *   - a packed map: R cavity occlusion, G roughness (0.5 leaves the material's value alone), B metalness;
 *   - a tangent-space detail normal map.
 * Both multiply or bend what the material already has, so skins, accents and wet weather still apply. */
export type SurfaceFamily = 'steel' | 'polymer' | 'rubber';

/** Texels a side, metres one repeat covers, then how strongly the normal, roughness/metalness and occlusion apply.
 * Steel carries hand-sized smudges as well as its grain, so it needs the larger repeat and the texels to match. */
export const SURFACE: Record<SurfaceFamily, { size: number; tile: number; normal: number; gloss: number; occlusion: number }> = {
  steel: { size: 512, tile: .16, normal: .4, gloss: 1, occlusion: 1 },
  polymer: { size: 256, tile: .06, normal: .5, gloss: 1, occlusion: 1 },
  rubber: { size: 256, tile: .026, normal: .9, gloss: 1, occlusion: 1 },
};

/** Repeating value noise: `cells` random values a side, smoothly interpolated and wrapped. */
function lattice(seed: number, cells: number) {
  const values = new Float32Array(cells * cells); let s = seed >>> 0;
  for (let i = 0; i < values.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; values[i] = s / 4294967296; }
  const at = (x: number, y: number) => values[(y % cells) * cells + (x % cells)];
  return (u: number, v: number) => {
    const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Sample { height: number; roughness: number; occlusion: number; metalness: number }
/** Each family's surface at (u, v) in one repeat. `roughness` multiplies the material's own (1 = unchanged). */
function sampler(family: SurfaceFamily): { bump: number; at(u: number, v: number): Sample } {
  if (family === 'steel') {
    // Parkerised or anodised finish: a fine grain, broad handling smudges and the odd dull patch.
    const fine = lattice(11, 512), coarse = lattice(23, 220), smudge = lattice(37, 3), wipe = lattice(41, 9), dull = lattice(53, 6);
    return { bump: .7, at(u, v) {
      const grain = fine(u, v) * .7 + coarse(u, v) * .3, handled = smudge(u, v) * .65 + wipe(u, v) * .35;
      return { height: grain, roughness: 1 + (handled - .5) * .6 + (grain - .5) * .22,
        occlusion: 1 - smooth(.5, .2, grain) * .12, metalness: 1 - smooth(.62, .85, dull(u, v)) * .1 };
    } };
  }
  if (family === 'polymer') {
    // Moulded polymer: a soft pebble texture, glossier where hands have worn it.
    const pebble = lattice(71, 100), fine = lattice(83, 256), worn = lattice(97, 4);
    return { bump: 1.6, at(u, v) {
      const height = pebble(u, v) * .8 + fine(u, v) * .2;
      return { height, roughness: 1 + (worn(u, v) - .5) * .45 - (height - .5) * .2, occlusion: .86 + .14 * smooth(.25, .6, height), metalness: 1 };
    } };
  }
  // Grip stippling: staggered domes, eight rows to a repeat.
  const rows = 8, wear = lattice(113, 5);
  return { bump: 5, at(u, v) {
    const row = Math.floor(v * rows), x = (u * rows + (row % 2) * .5) % 1 - .5, y = v * rows - row - .5;
    const dome = Math.max(0, 1 - (x * x + y * y) / .16);
    return { height: dome, roughness: 1.08 - dome * .2 + (wear(u, v) - .5) * .2, occlusion: .68 + .32 * smooth(0, .5, dome), metalness: 1 };
  } };
}

const byte = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
/** Raw RGBA bytes for one family: the packed map and its detail normal map. */
export function surfacePixels(family: SurfaceFamily, size = SURFACE[family].size) {
  const { bump, at } = sampler(family), heights = new Float32Array(size * size);
  const packed = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sample = at(x / size, y / size), i = y * size + x;
    heights[i] = sample.height;
    packed.set([byte(sample.occlusion), byte(sample.roughness / 2), byte(sample.metalness), 255], i * 4);
  }
  const slope = bump * size / SURFACE[family].size;
  const height = (x: number, y: number) => heights[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Slope across neighbouring texels, wrapped so the map tiles and scaled so a smaller copy is no steeper.
    const dx = (height(x + 1, y) - height(x - 1, y)) * slope, dy = (height(x, y + 1) - height(x, y - 1)) * slope;
    const length = Math.hypot(dx, dy, 1);
    normal.set([byte(.5 - dx / length / 2), byte(.5 - dy / length / 2), byte(.5 + 1 / length / 2), 255], (y * size + x) * 4);
  }
  return { packed, normal };
}

const cache = new Map<SurfaceFamily, { packed: THREE.DataTexture; normal: THREE.DataTexture }>();
/** Shared by every carried gun for the life of the page; about three megabytes of texture in total. */
export function surfaceTextures(family: SurfaceFamily) {
  let textures = cache.get(family);
  if (!textures) {
    const pixels = surfacePixels(family), size = SURFACE[family].size;
    const texture = (data: Uint8Array) => {
      const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true; map.anisotropy = 4; map.colorSpace = THREE.NoColorSpace; map.needsUpdate = true; return map;
    };
    cache.set(family, textures = { packed: texture(pixels.packed), normal: texture(pixels.normal) });
  }
  return textures;
}

/** Which family a gun material belongs to, or null for glass, sights, cartridges and anything see-through. */
export function surfaceFamily(material: THREE.Material): SurfaceFamily | null {
  if (!(material instanceof THREE.MeshStandardMaterial) || material instanceof THREE.MeshPhysicalMaterial) return null;
  if (material.transparent || material.opacity < 1) return null;
  if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) return null;
  const name = material.name;
  if (/glass|lens|dot|reticle|smoke|translucent|interior|brass|copper|cartridge/i.test(name)) return null;
  if (/rubber|grip/i.test(name)) return 'rubber';
  if (/polymer|olive|furniture|follower|panel|identification/i.test(name)) return 'polymer';
  if (/steel|metal|machined|receiver|hardware/i.test(name)) return 'steel';
  return material.metalness >= .3 ? 'steel' : material.roughness >= .92 ? 'rubber' : 'polymer';
}

const vertexDeclarations = 'varying vec3 vSurfacePosition;\nvarying vec3 vSurfaceNormal;';
// Model-space position in metres, whatever scale the part or the rig carries, so the grain keeps one size.
const vertexBody = `vSurfacePosition = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
vSurfaceNormal = normal;`;
const fragmentDeclarations = `uniform sampler2D surfacePacked;
uniform sampler2D surfaceNormal;
uniform vec4 surfaceTuning;
#ifndef USE_NORMALMAP_OBJECTSPACE
uniform mat3 normalMatrix;
#endif
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;`;
const fragmentGloss = `vec3 surfaceN = normalize(vSurfaceNormal);
vec3 surfaceW = pow(abs(surfaceN), vec3(4.));
surfaceW /= surfaceW.x + surfaceW.y + surfaceW.z;
vec3 surfaceP = vSurfacePosition * surfaceTuning.x;
vec4 surfaceData = texture2D(surfacePacked, surfaceP.zy) * surfaceW.x + texture2D(surfacePacked, surfaceP.xz) * surfaceW.y + texture2D(surfacePacked, surfaceP.xy) * surfaceW.z;
roughnessFactor = clamp(roughnessFactor * mix(1., surfaceData.g * 2., surfaceTuning.z), .045, 1.);`;
const fragmentMetal = 'metalnessFactor *= mix(1., surfaceData.b, surfaceTuning.z);';
// Each projection's tangent normal is swung onto the surface normal before blending, so curved parts stay smooth.
const fragmentNormal = `vec3 surfaceX = texture2D(surfaceNormal, surfaceP.zy).xyz * 2. - 1.;
vec3 surfaceY = texture2D(surfaceNormal, surfaceP.xz).xyz * 2. - 1.;
vec3 surfaceZ = texture2D(surfaceNormal, surfaceP.xy).xyz * 2. - 1.;
surfaceX = vec3(surfaceX.xy + surfaceN.zy, abs(surfaceX.z) * surfaceN.x);
surfaceY = vec3(surfaceY.xy + surfaceN.xz, abs(surfaceY.z) * surfaceN.y);
surfaceZ = vec3(surfaceZ.xy + surfaceN.xy, abs(surfaceZ.z) * surfaceN.z);
vec3 surfaceBend = normalMatrix * (normalize(surfaceX.zyx * surfaceW.x + surfaceY.xzy * surfaceW.y + surfaceZ * surfaceW.z) - surfaceN) * surfaceTuning.y;
#ifdef DOUBLE_SIDED
surfaceBend *= faceDirection;
#endif
normal = normalize(normal + surfaceBend);`;
const fragmentOcclusion = `float surfaceShade = mix(1., surfaceData.r, surfaceTuning.w);
reflectedLight.indirectDiffuse *= surfaceShade;
reflectedLight.indirectSpecular *= surfaceShade;
reflectedLight.directDiffuse *= mix(1., surfaceShade, .5);`;

const after = (source: string, chunk: string, addition: string) => source.replace(`#include <${chunk}>`, `#include <${chunk}>\n${addition}`);

/** Give every opaque gun material under `root` its family's surface. The returned function takes it off again. */
export function applyWeaponSurface(root: THREE.Object3D) {
  const patched = new Map<THREE.Material, { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'] }>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of (Array.isArray(object.material) ? object.material : [object.material]) as THREE.Material[]) {
      const family = patched.has(material) ? null : surfaceFamily(material); if (!family) continue;
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey, tuning = SURFACE[family];
      patched.set(material, { compile, key });
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        const textures = surfaceTextures(family);
        Object.assign(shader.uniforms, { surfacePacked: { value: textures.packed }, surfaceNormal: { value: textures.normal },
          surfaceTuning: { value: new THREE.Vector4(1 / tuning.tile, tuning.normal, tuning.gloss, tuning.occlusion) } });
        shader.vertexShader = after(shader.vertexShader, 'common', vertexDeclarations);
        shader.vertexShader = after(shader.vertexShader, 'begin_vertex', vertexBody);
        let fragment = after(shader.fragmentShader, 'common', fragmentDeclarations);
        fragment = after(fragment, 'roughnessmap_fragment', fragmentGloss);
        fragment = after(fragment, 'metalnessmap_fragment', fragmentMetal);
        fragment = after(fragment, 'normal_fragment_maps', fragmentNormal);
        shader.fragmentShader = after(fragment, 'aomap_fragment', fragmentOcclusion);
      };
      // The textures and tuning are uniforms, so every family shares one program per base material variant.
      material.customProgramCacheKey = function () { return `${key.call(this)}|weapon-surface-v1`; };
      material.userData.weaponSurface = family; material.needsUpdate = true;
    }
  });
  return () => {
    for (const [material, original] of patched) {
      material.onBeforeCompile = original.compile; material.customProgramCacheKey = original.key;
      delete material.userData.weaponSurface; material.needsUpdate = true;
    }
    patched.clear();
  };
}
