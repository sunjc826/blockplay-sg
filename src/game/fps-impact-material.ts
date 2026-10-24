import * as THREE from 'three';
import { DECAL_KINDS, type DecalKind } from './fps-surfaces';

const smooth = (lo: number, hi: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
/** A recessed bowl with an uneven chipped lip, in tangent-space coordinates. */
export function craterHeight(x: number, y: number) {
  const angle = Math.atan2(y, x);
  const edge = .65 + .045 * Math.sin(angle * 5) + .025 * Math.cos(angle * 11);
  const r = Math.hypot(x, y) / edge;
  const cavity = -.22 * (1 - smooth(.12, .95, r));
  const rim = .055 * Math.exp(-Math.pow((r - 1) / .12, 2));
  return cavity + rim;
}
type Rgba = readonly [number, number, number, number];
/**
 * One decal, in tangent-space coordinates on [-1, 1]². `height` drives the
 * normal map by finite differences; `paint` returns sRGB colour and alpha in
 * [0, 1]. Every painter must reach zero alpha and zero height before the tile
 * edge, so neighbouring atlas tiles never bleed into each other.
 */
interface DecalPainter { height(u: number, v: number): number; paint(u: number, v: number, h: number): Rgba; cavity?(h: number): number }
const fract = (x: number) => x - Math.floor(x);
/** Cheap deterministic value noise; the atlas is the same on every load. */
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const noise = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * sx;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Chipped masonry: the original crater. */
const CRATER: DecalPainter = {
  height: craterHeight,
  paint(u, v, h) {
    const grain = Math.sin(u * 173 + Math.cos(v * 113)) * Math.sin(v * 157 + u * 71);
    const shade = .32 + h * 1.1 + grain * .025;
    const angle = Math.atan2(v, u);
    const radius = Math.hypot(u, v) / (.84 + .035 * Math.sin(angle * 5));
    return [shade, shade, shade, 1 - smooth(.82, 1, radius)];
  },
};
/** Torn timber: a hole stretched along the grain, ringed by pale raised fibres. */
const SPLINTER: DecalPainter = {
  height(u, v) {
    const angle = Math.atan2(v, u), edge = 1 + .09 * Math.sin(angle * 7) + .05 * Math.cos(angle * 13);
    const hole = Math.hypot(u / .4, v / .24) / edge, torn = Math.hypot(u / .86, v / .44);
    const fibre = Math.pow(.5 + .5 * Math.sin(v * 70 + Math.sin(u * 6) * 1.4), 4);
    return -.24 * (1 - smooth(.1, 1, hole)) + .05 * fibre * smooth(.85, 1.1, hole) * (1 - smooth(.55, 1, torn));
  },
  paint(u, v) {
    const angle = Math.atan2(v, u), edge = 1 + .09 * Math.sin(angle * 7) + .05 * Math.cos(angle * 13);
    const hole = Math.hypot(u / .4, v / .24) / edge, torn = Math.hypot(u / .86, v / .44);
    const fibre = .5 + .5 * Math.sin(v * 70 + Math.sin(u * 6) * 1.4), raw = smooth(1.05, .7, torn) * (.75 + .25 * fibre);
    const depth = 1 - smooth(.6, 1.05, hole);
    const r = mix(mix(.62, .9, raw), .14, depth), g = mix(mix(.46, .74, raw), .09, depth), b = mix(mix(.3, .52, raw), .05, depth);
    const outline = Math.hypot(u / .92, v / .5) * (1 + .07 * Math.sin(angle * 9) + .05 * noise(u * 9, v * 9));
    return [r, g, b, (1 - smooth(.78, 1, outline)) * mix(.55, 1, Math.max(raw, depth))];
  },
};
/** Struck steel: a small dark hole in a dimple, ringed by paint scraped to bare metal. */
const DENT: DecalPainter = {
  height(u, v) {
    const r = Math.hypot(u, v);
    return -.2 * (1 - smooth(.06, .3, r)) - .06 * (1 - smooth(.2, .75, r)) + .04 * Math.exp(-Math.pow((r - .36) / .06, 2));
  },
  paint(u, v) {
    const r = Math.hypot(u, v), angle = Math.atan2(v, u);
    const scratch = .5 + .5 * Math.sin(angle * 41 + noise(u * 6, v * 6) * 4);
    const bare = (1 - smooth(.45, .62, r)) * smooth(.22, .3, r);
    const shade = mix(mix(.4, .82 + scratch * .1, bare), .04, 1 - smooth(.18, .28, r));
    const outline = r * (1 + .05 * Math.sin(angle * 6));
    return [shade, shade * 1.01, shade * 1.03, (1 - smooth(.6, .82, outline)) * mix(.45, 1, Math.max(bare, 1 - smooth(.2, .3, r)))];
  },
};
const CRACK_SPOKES = [0, .62, 1.31, 1.83, 2.54, 3.12, 3.71, 4.38, 4.97, 5.61].map((angle, i) => ({ angle, length: .62 + hash(i, 3) * .3 }));
/** Struck glass: a crushed pit, radial cracks and two broken rings of conchoidal fracture. */
const CRACK: DecalPainter = {
  height(u, v) { return -.1 * (1 - smooth(.04, .12, Math.hypot(u, v))); },
  paint(u, v) {
    const r = Math.hypot(u, v), angle = Math.atan2(v, u);
    let line = 0;
    for (const spoke of CRACK_SPOKES) {
      // Distance from this pixel to the spoke's ray, with a slight wander.
      const a = spoke.angle + Math.sin(r * 9 + spoke.angle * 3) * .05;
      const along = u * Math.cos(a) + v * Math.sin(a), across = -u * Math.sin(a) + v * Math.cos(a);
      if (along > 0 && along < spoke.length) line = Math.max(line, Math.exp(-across * across / .00035) * (1 - along / spoke.length * .5));
    }
    for (const [ring, width] of [[.3, .0003], [.56, .00025]] as const) {
      const broken = noise(angle * 3 + ring * 10, ring * 7) > .45 ? 1 : 0;
      line = Math.max(line, Math.exp(-Math.pow(r - ring - noise(angle * 5, ring) * .03, 2) / width) * broken * .8);
    }
    const crushed = 1 - smooth(.06, .2, r), frost = (1 - smooth(.12, .36, r)) * .6;
    const alpha = Math.max(line, crushed, frost) * (1 - smooth(.88, .98, r));
    const shade = mix(.94, .7, crushed * .6);
    return [shade, shade * 1.02, shade * 1.04, alpha];
  },
  cavity: () => 0,
};
/** Struck earth: a shallow dark scoop with a ragged edge. */
const SOIL: DecalPainter = {
  height(u, v) {
    const r = Math.hypot(u, v) * (1 + .18 * (noise(u * 4 + 5, v * 4) - .5));
    return -.12 * (1 - smooth(.05, .7, r));
  },
  paint(u, v, h) {
    const r = Math.hypot(u, v) * (1 + .3 * (noise(u * 4 + 5, v * 4) - .5)), grain = noise(u * 22, v * 22);
    const shade = .2 + h * .6 + grain * .06;
    return [shade * 1.12, shade * .86, shade * .62, (1 - smooth(.62, .95, r)) * .92];
  },
};
const DROPS = [[.58, .14, .07], [.7, -.22, .05], [.5, .42, .045], [.78, .05, .04], [-.42, .5, .05], [-.55, -.38, .06], [.12, -.66, .045], [.83, .34, .03]];
/** A spray of blood: a lobed splat, a run of satellite drops and streaks thrown along +u. */
const BLOOD: DecalPainter = {
  height: () => 0,
  paint(u, v) {
    const angle = Math.atan2(v, u);
    const lobes = .4 + .08 * Math.sin(angle * 5 + 1) + .05 * Math.sin(angle * 11) + .06 * (noise(Math.cos(angle) * 3 + 2, Math.sin(angle) * 3) - .5);
    let cover = 1 - smooth(lobes - .03, lobes + .015, Math.hypot(u * .92, v));
    for (const [x, y, size] of DROPS) {
      // Each drop trails a short tail back towards the splat it left.
      const dx = u - x, dy = v - y, tail = Math.hypot(dx * Math.abs(x) / Math.hypot(x, y) * .5 + dx * .5, dy);
      cover = Math.max(cover, 1 - smooth(size * .8, size, Math.min(Math.hypot(dx, dy), tail * 1.6)));
    }
    const wet = noise(u * 7, v * 7);
    const dark = 1 - smooth(0, .35, Math.hypot(u, v));
    return [mix(.36, .22, dark) + wet * .05, .015 + wet * .01, .015, cover * .94 * (1 - smooth(.9, .97, Math.hypot(u, v)))];
  },
  cavity: () => 0,
};
const PAINTERS: Record<DecalKind, DecalPainter> = { crater: CRATER, splinter: SPLINTER, dent: DENT, crack: CRACK, soil: SOIL, blood: BLOOD };

function paintTile(colour: Uint8Array, normal: Uint8Array, stride: number, x0: number, y0: number, size: number, painter: DecalPainter) {
  const step = 2 / size, byte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) * step - 1, v = (y + .5) * step - 1;
    const h = painter.height(u, v), i = ((y0 + y) * stride + x0 + x) * 4;
    const dx = (painter.height(u + step, v) - painter.height(u - step, v)) / (2 * step);
    const dy = (painter.height(u, v + step) - painter.height(u, v - step)) / (2 * step);
    const length = Math.hypot(dx, dy, 1);
    normal[i] = Math.round((-.5 * dx / length + .5) * 255);
    normal[i + 1] = Math.round((-.5 * dy / length + .5) * 255);
    normal[i + 2] = Math.round((.5 / length + .5) * 255);
    // Cavity mask gives the deeper variants stronger local occlusion too.
    normal[i + 3] = byte(painter.cavity ? painter.cavity(h) : Math.max(0, -h / .22));
    const [r, g, b, a] = painter.paint(u, v, h);
    // Belt and braces: nothing reaches the tile border, whatever the painter does.
    const border = 1 - smooth(.9, .99, Math.max(Math.abs(u), Math.abs(v)));
    colour[i] = byte(r); colour[i + 1] = byte(g); colour[i + 2] = byte(b); colour[i + 3] = byte(a * border);
  }
}
function decalTextures(colour: Uint8Array, normal: Uint8Array, size: number) {
  const texture = (bytes: Uint8Array, colourSpace: THREE.ColorSpace) => {
    const map = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    map.colorSpace = colourSpace;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true;
    return map;
  };
  return { map: texture(colour, THREE.SRGBColorSpace), normalMap: texture(normal, THREE.NoColorSpace) };
}
/** Procedural paired maps: colour is sRGB; the normal and cavity mask are linear data. */
export function createBulletHoleTextures(size = 128) {
  const colour = new Uint8Array(size * size * 4), normal = new Uint8Array(colour.length);
  paintTile(colour, normal, size, 0, 0, size, CRATER);
  return decalTextures(colour, normal, size);
}
/** Square tiles per side of the decal atlas; square, so the normal map's slopes stay isotropic. */
export const DECAL_ATLAS_COLUMNS = 3;
export const decalTile = (kind: DecalKind) => Math.max(0, DECAL_KINDS.indexOf(kind));
/** Every mark in one pair of maps, in `DECAL_KINDS` order, left to right then down. */
export function createDecalAtlas(tile = 128) {
  const size = tile * DECAL_ATLAS_COLUMNS;
  const colour = new Uint8Array(size * size * 4), normal = new Uint8Array(colour.length);
  for (let i = 0; i < normal.length; i += 4) { normal[i] = normal[i + 1] = 128; normal[i + 2] = 255; }
  DECAL_KINDS.forEach((kind, i) => paintTile(colour, normal, size, (i % DECAL_ATLAS_COLUMNS) * tile, Math.floor(i / DECAL_ATLAS_COLUMNS) * tile, tile, PAINTERS[kind]));
  return { ...decalTextures(colour, normal, size), columns: DECAL_ATLAS_COLUMNS };
}

/** The pool can fade each decal/puff without changing the opacity of its neighbours. */
export function withInstanceOpacity<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float effectOpacity; varying float vEffectOpacity;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEffectOpacity = effectOpacity;');
    shader.fragmentShader = 'varying float vEffectOpacity;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vEffectOpacity;');
  };
  material.customProgramCacheKey = () => 'impact-opacity-v1';
  return material;
}

/**
 * `columns` > 1 reads `textures` as a square atlas and picks each instance's
 * tile from its `decalTile` attribute (see `createDecalAtlas`).
 */
export function createBulletHoleMaterial(textures: ReturnType<typeof createBulletHoleTextures>, columns = 1) {
  const material = withInstanceOpacity(new THREE.MeshStandardMaterial({
    map: textures.map, normalMap: textures.normalMap, color: '#ffffff', roughness: .95, metalness: 0,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const opacityPatch = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    opacityPatch.call(material, shader, renderer);
    shader.vertexShader = 'attribute float impactDepth; varying float vImpactDepth;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvImpactDepth = impactDepth;');
    if (columns > 1) {
      shader.vertexShader = 'attribute float decalTile;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vec2 decalCell = vec2(mod(decalTile, ${columns.toFixed(1)}), floor(decalTile / ${columns.toFixed(1)} + .001));
        vMapUv = (vMapUv + decalCell) / ${columns.toFixed(1)};
        vNormalMapUv = (vNormalMapUv + decalCell) / ${columns.toFixed(1)};`);
    }
    shader.fragmentShader = 'varying float vImpactDepth;\n' + shader.fragmentShader;
    // Stock lighting, tangent basis and shadows, with per-instance normal strength.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vImpactDepth;'));
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float cavity = texture2D(normalMap, vNormalMapUv).a;
      diffuseColor.rgb *= mix(1.0, 1.0 / (1.0 + vImpactDepth * .55), cavity);`);
  };
  material.customProgramCacheKey = () => `impact-crater-v2-${columns}`;
  return material;
}
