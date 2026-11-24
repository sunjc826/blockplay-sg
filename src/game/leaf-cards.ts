import * as THREE from 'three';

/**
 * Leaves on a tree's sprays. A spray is a flat card a metre or two across (plant-models.ts); this draws
 * it as a twig carrying separate leaves in the arrangement the species has, cut out of the card, and
 * lets each leaf swing about its own stalk in the wind. Presentation only: the card's geometry, cover
 * and what a round strikes are unchanged.
 *
 * - The atlas is drawn here, from numbers, the first time a leaf material compiles: sixteen tiles, three
 *   sprays for each of five arrangements and one clump of blades. No photographs.
 * - A second small texture says, for every point of a tile, which leaf is nearest and where its stalk
 *   meets the twig. The fragment shader turns the lookup about that point by a few degrees on the
 *   leaf's own clock, so neighbouring leaves move apart and together instead of as one sheet.
 * - The vertex shader flaps and twists each card about its base on the card's own clock.
 * Both follow the tree wind's strength and gust fronts, and stop when reduced effects are on.
 *
 * Leaves are drawn about twice life size, as the sprays themselves are: each stands for several.
 */
export type LeafPattern = 'opposite' | 'alternate' | 'whorl' | 'rosette' | 'bipinnate';
/** Long blades rising from one foot, for reeds and sedges: the atlas's sixteenth tile, a single spray. */
export type BladePattern = 'blades';
export const LEAF_PATTERNS: readonly LeafPattern[] = ['opposite', 'alternate', 'whorl', 'rosette', 'bipinnate'];
export const LEAF_VARIANTS = 3;
const GRID = 4, TILE = 256, ID_TILE = 64, SIZE = GRID * TILE, ID_SIZE = GRID * ID_TILE;
/** Leaves thinner than this share of opaque are cut away. */
const CUT = .4;

/** Where tile `variant` of a pattern sits in the atlas: its lower-left corner and its side, in UV. */
export function leafTile(pattern: LeafPattern | BladePattern, variant: number) {
  const index = pattern === 'blades' ? GRID * GRID - 1 : LEAF_PATTERNS.indexOf(pattern) * LEAF_VARIANTS + ((variant % LEAF_VARIANTS) + LEAF_VARIANTS) % LEAF_VARIANTS;
  return { u: (index % GRID) / GRID, v: Math.floor(index / GRID) / GRID, side: 1 / GRID, index };
}

type Shape = 'elliptic' | 'ovate' | 'obovate' | 'oblong' | 'blade';
/** Half-width along a leaf from stalk (0) to tip (1), as a share of its greatest half-width. */
const PROFILE: Record<Shape, (s: number) => number> = (() => {
  const raw: Record<Shape, (s: number) => number> = {
    elliptic: s => Math.pow(Math.sin(Math.PI * s), .8),
    ovate: s => Math.pow(s, .45) * Math.pow(1 - s, .85),
    obovate: s => Math.pow(s, 1.15) * Math.pow(1 - s, .4),
    oblong: s => Math.pow(Math.sin(Math.PI * s), .4),
    blade: s => Math.pow(s, .3) * Math.pow(1 - s, 1.1),
  };
  const out = {} as Record<Shape, (s: number) => number>;
  for (const key of Object.keys(raw) as Shape[]) {
    let peak = 0; for (let i = 1; i < 64; i++) peak = Math.max(peak, raw[key](i / 64));
    out[key] = s => raw[key](s) / peak;
  }
  return out;
})();

/** Everything that turns together: one simple leaf, or one pinna of a compound leaf with its leaflets. */
interface Group { x: number; y: number; tx: number; ty: number; phase: number }
interface Leaf { x: number; y: number; angle: number; length: number; width: number; shape: Shape; shade: number }
interface Twig { x0: number; y0: number; x1: number; y1: number; width: number }
interface Spray { leaves: Leaf[]; groups: Group[]; twigs: Twig[] }

function random(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const inside = (x: number, y: number) => x > .03 && x < .97 && y > .02 && y < .98;

/** One spray in tile space: the twig enters at the middle of the bottom edge and grows up the tile. */
export function layoutSpray(pattern: LeafPattern | BladePattern, variant: number): Spray {
  const rand = random((pattern === 'blades' ? 5 : LEAF_PATTERNS.indexOf(pattern)) * 977 + variant * 131 + 7), spray: Spray = { leaves: [], groups: [], twigs: [] };
  const leaf = (x: number, y: number, angle: number, length: number, width: number, shape: Shape, group?: Group) => {
    const tx = x + Math.cos(angle) * length, ty = y + Math.sin(angle) * length;
    if (!inside(tx, ty) || !inside(x, y)) return;
    spray.leaves.push({ x, y, angle, length, width, shape, shade: .72 + .28 * rand() });
    if (!group) spray.groups.push({ x, y, tx, ty, phase: .04 + .96 * rand() });
  };
  const twig = (x0: number, y0: number, angle: number, length: number, width: number, each: (x: number, y: number, angle: number, t: number) => void, spacing: number) => {
    // A twig wanders a little and stops at the tile's edge.
    let x = x0, y = y0, a = angle, run = 0, next = spacing * (.4 + .5 * rand());
    while (run < length) {
      const step = Math.min(.02, length - run), nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      if (!inside(nx, Math.max(.021, ny))) break;
      spray.twigs.push({ x0: x, y0: y, x1: nx, y1: ny, width: width * (1 - .6 * run / length) });
      x = nx; y = ny; run += step; a += (rand() - .5) * .12; next -= step;
      if (next <= 0) { each(x, y, a, run / length); next = spacing * (.8 + .4 * rand()); }
    }
    return { x, y, angle: a };
  };
  const UP = Math.PI / 2;
  if (pattern === 'blades') {
    // A clump seen from the side: blades fan from the foot, the outer ones leaning further and shorter.
    for (let i = 0; i < 46; i++) {
      const t = (i + .5) / 46 * 2 - 1, lean = t * .5 + (rand() - .5) * .16, length = (.9 - .34 * Math.abs(t)) * (.72 + .28 * rand());
      leaf(.5 + t * .2 + (rand() - .5) * .04, .03, UP - lean, length, .034 + .014 * rand(), 'blade');
    }
    return spray;
  }
  /** The branching every arrangement shares: a leader up the tile with side twigs to left and right. */
  const branch = (sides: number, reach: number, spacing: number, each: (x: number, y: number, angle: number, t: number) => void, tip: (x: number, y: number, angle: number) => void) => {
    let hand = rand() < .5 ? 1 : -1, count = 0;
    const end = twig(.5, 0, UP + (rand() - .5) * .1, .93, .012, (x, y, a, t) => {
      if (count < sides && t < .86 && count / sides <= t + .08) {
        count++; hand = -hand;
        const side = twig(x, y, a - hand * (.75 + .35 * rand()), reach * (1 - .55 * t) * (.8 + .4 * rand()), .008, each, spacing);
        tip(side.x, side.y, side.angle);
      }
      each(x, y, a, t);
    }, Math.min(spacing, .9 / (sides + 1)));
    tip(end.x, end.y, end.angle);
  };
  if (pattern === 'opposite') {
    // Tembusu, FFW 2895: opposite elliptic leaves, 5-13 by 2-5.5 cm.
    const pair = (x: number, y: number, a: number) => { const l = .1 + .035 * rand(); for (const hand of [-1, 1]) leaf(x, y, a + hand * (.85 + .25 * rand()), l * (.9 + .2 * rand()), l * .44, 'elliptic'); };
    branch(7, .44, .062, pair, (x, y, a) => { pair(x, y, a); leaf(x, y, a, .11, .048, 'elliptic'); });
  } else if (pattern === 'alternate') {
    // Kapur, FFW 2862: broadly ovate leathery leaves, 4-6 by 2-4 cm, on fine twigs.
    let hand = 1;
    const one = (x: number, y: number, a: number) => { hand = -hand; const l = .07 + .022 * rand(); leaf(x, y, a + hand * (.8 + .3 * rand()), l, l * .62, 'ovate'); };
    branch(13, .46, .027, one, (x, y, a) => leaf(x, y, a, .07, .042, 'ovate'));
  } else if (pattern === 'whorl') {
    // Jelutong, FFW 2866: leathery leaves in whorls of 4-8, 5.5-42 cm long.
    const whorl = (x: number, y: number, a: number) => { const n = 5 + Math.floor(rand() * 3), turn = rand() * 6.28; for (let i = 0; i < n; i++) { const l = .12 + .04 * rand(); leaf(x, y, a + turn + i / n * 6.283 + (rand() - .5) * .3, l, l * .3, 'elliptic'); } };
    branch(5, .42, .17, whorl, whorl);
  } else if (pattern === 'rosette') {
    // Jelawai Jaha, FFW 3302: glossy spoon-shaped leaves 4-14 cm, spiralled at the twig ends.
    const rosette = (x: number, y: number, a: number) => { const n = 7 + Math.floor(rand() * 3); for (let i = 0; i < n; i++) { const l = .085 + .035 * rand(); leaf(x, y, a + (i / (n - 1) - .5) * 4.6 + (rand() - .5) * .25, l, l * .5, 'obovate'); } };
    branch(9, .4, .11, (x, y, a) => { if (rand() < .45) { const side = twig(x, y, a + (rand() < .5 ? 1 : -1) * (.6 + .5 * rand()), .07 + .05 * rand(), .006, () => {}, 1); rosette(side.x, side.y, side.angle); } }, rosette);
  } else {
    // Rain tree, FFW 3106: bipinnate leaves, each pinna a row of small leaflets, larger toward its tip.
    let hand = 1;
    const compound = (x: number, y: number, a: number) => {
      hand = -hand;
      const pairs = 3 + Math.floor(rand() * 2), heading = a + hand * (.7 + .3 * rand()), reach = .2 + .06 * rand();
      const pinna = (px: number, py: number, pa: number, length: number) => {
        const tx = px + Math.cos(pa) * length, ty = py + Math.sin(pa) * length;
        if (!inside(tx, ty) || !inside(px, py)) return;
        const group: Group = { x: px, y: py, tx, ty, phase: .04 + .96 * rand() }; spray.groups.push(group);
        spray.twigs.push({ x0: px, y0: py, x1: tx, y1: ty, width: .004 });
        const n = 5;
        for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
          const s = (i + .6) / n, l = .03 + .022 * s;
          leaf(px + Math.cos(pa) * length * s, py + Math.sin(pa) * length * s, pa + side * (1.05 - .25 * s), l, l * .52, 'oblong', group);
        }
        leaf(tx, ty, pa, .045, .024, 'oblong', group);
      };
      const end = twig(x, y, heading, reach, .006, (px, py, pa, t) => { for (const side of [-1, 1]) pinna(px, py, pa + side * (1 + .2 * rand()), .1 + .07 * t); }, reach / (pairs + .2));
      pinna(end.x, end.y, end.angle - .35, .15); pinna(end.x, end.y, end.angle + .35, .15);
    };
    branch(4, .3, .15, compound, compound);
  }
  return spray;
}

export interface LeafAtlasData {
  /** RGBA per texel: leaf shade, twig, unused, cover. */
  map: Uint8Array; size: number;
  /** RGBA per texel: the nearest leaf's stalk as an offset from this texel (two channels), its phase, unused. */
  ids: Uint8Array; idSize: number;
  /** Share of each tile the leaves and twigs cover. */
  cover: number[];
}
/** The atlas as plain numbers. Deterministic; exported for the tests. */
export function drawLeafAtlas(): LeafAtlasData {
  const map = new Uint8Array(SIZE * SIZE * 4), ids = new Uint8Array(ID_SIZE * ID_SIZE * 4), cover: number[] = [];
  // Open texels carry a leaf's average shade, so the smaller mip levels do not darken toward the gaps.
  for (let i = 0; i < map.length; i += 4) map[i] = 168;
  const sprays: [LeafPattern | BladePattern, number][] = [...LEAF_PATTERNS.flatMap(pattern => Array.from({ length: LEAF_VARIANTS }, (_, variant): [LeafPattern, number] => [pattern, variant])), ['blades', 0]];
  for (const [pattern, variant] of sprays) {
    const tile = leafTile(pattern, variant), ox = Math.round(tile.u * SIZE), oy = Math.round(tile.v * SIZE), spray = layoutSpray(pattern, variant);
    const put = (px: number, py: number, alpha: number, shade: number, wood: number) => {
      const i = ((oy + py) * SIZE + ox + px) * 4, a = Math.round(alpha * 255);
      if (wood) { map[i + 1] = Math.max(map[i + 1], Math.round(wood * 255)); return; }
      if (a < map[i + 3] && a < 128) return;
      map[i] = Math.round(Math.min(1, shade / 1.3) * 255); map[i + 3] = Math.max(a, map[i + 3]);
    };
    for (const t of spray.twigs) {
      const lo = (v: number) => Math.max(0, Math.floor(v * TILE) - 2), hi = (v: number) => Math.min(TILE - 1, Math.ceil(v * TILE) + 2);
      const dx = t.x1 - t.x0, dy = t.y1 - t.y0, len2 = dx * dx + dy * dy || 1e-9;
      for (let py = lo(Math.min(t.y0, t.y1)); py <= hi(Math.max(t.y0, t.y1)); py++) for (let px = lo(Math.min(t.x0, t.x1)); px <= hi(Math.max(t.x0, t.x1)); px++) {
        const x = (px + .5) / TILE, y = (py + .5) / TILE, s = Math.max(0, Math.min(1, ((x - t.x0) * dx + (y - t.y0) * dy) / len2));
        const d = (t.width / 2 - Math.hypot(x - t.x0 - dx * s, y - t.y0 - dy * s)) * TILE, a = Math.max(0, Math.min(1, .5 + d / 1.6));
        if (a > 0) put(px, py, 0, 0, a);
      }
    }
    for (const l of spray.leaves) {
      const cx = Math.cos(l.angle), cy = Math.sin(l.angle), profile = PROFILE[l.shape], reach = l.width / 2 + 2 / TILE;
      const x0 = Math.min(l.x, l.x + cx * l.length) - reach, x1 = Math.max(l.x, l.x + cx * l.length) + reach, y0 = Math.min(l.y, l.y + cy * l.length) - reach, y1 = Math.max(l.y, l.y + cy * l.length) + reach;
      for (let py = Math.max(0, Math.floor(y0 * TILE)); py <= Math.min(TILE - 1, Math.ceil(y1 * TILE)); py++) for (let px = Math.max(0, Math.floor(x0 * TILE)); px <= Math.min(TILE - 1, Math.ceil(x1 * TILE)); px++) {
        const x = (px + .5) / TILE - l.x, y = (py + .5) / TILE - l.y, s = (x * cx + y * cy) / l.length, t = Math.abs(-x * cy + y * cx);
        if (s <= 0 || s >= 1) continue;
        const half = l.width / 2 * profile(s), d = (half - t) * TILE, alpha = Math.max(0, Math.min(1, .5 + d / 2.4));
        if (alpha <= 0) continue;
        // Paler along the midrib, darker toward the margin and the stalk.
        const rib = Math.max(0, 1 - t * TILE / 1.1), across = half > 0 ? t / half : 1;
        put(px, py, alpha, l.shade * (1 - .22 * across * across) * (.86 + .14 * s) + .22 * rib, 0);
      }
    }
    let covered = 0;
    for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) { const i = ((oy + py) * SIZE + ox + px) * 4; if (map[i + 3] >= CUT * 255 || map[i + 1] >= CUT * 255) covered++; }
    cover.push(covered / (TILE * TILE));
    // Which group each point of the tile belongs to: the one whose axis is nearest.
    const iox = Math.round(tile.u * ID_SIZE), ioy = Math.round(tile.v * ID_SIZE);
    for (let py = 0; py < ID_TILE; py++) for (let px = 0; px < ID_TILE; px++) {
      const x = (px + .5) / ID_TILE, y = (py + .5) / ID_TILE, i = ((ioy + py) * ID_SIZE + iox + px) * 4;
      let best: Group | undefined, near = Infinity;
      for (const g of spray.groups) {
        const dx = g.tx - g.x, dy = g.ty - g.y, s = Math.max(0, Math.min(1, ((x - g.x) * dx + (y - g.y) * dy) / (dx * dx + dy * dy || 1e-9)));
        const d = (x - g.x - dx * s) ** 2 + (y - g.y - dy * s) ** 2;
        if (d < near) { near = d; best = g; }
      }
      const byte = (v: number) => Math.max(0, Math.min(255, Math.round((v + .5) * 255)));
      ids[i] = best ? byte(best.x - x) : 128; ids[i + 1] = best ? byte(best.y - y) : 128; ids[i + 2] = best ? Math.round(best.phase * 255) : 0; ids[i + 3] = 255;
    }
  }
  return { map, size: SIZE, ids, idSize: ID_SIZE, cover };
}

let atlas: { map: THREE.DataTexture; ids: THREE.DataTexture } | undefined;
/** One atlas for the page, drawn when first needed and kept: districts come and go, the leaves do not change. */
export function leafAtlas() {
  if (atlas) return atlas;
  const data = drawLeafAtlas();
  const map = new THREE.DataTexture(data.map, data.size, data.size, THREE.RGBAFormat);
  map.name = 'leaf sprays'; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 4; map.needsUpdate = true;
  const ids = new THREE.DataTexture(data.ids, data.idSize, data.idSize, THREE.RGBAFormat);
  ids.name = 'leaf stalks'; ids.minFilter = ids.magFilter = THREE.NearestFilter; ids.needsUpdate = true;
  return atlas = { map, ids };
}

/** Per vertex: atlas u and v, the card's phase (0 where the surface is not a card) and its size in metres. */
export const LEAF_CARD_ATTRIBUTE = 'leafCard';
/** Per vertex: across the card (-.5 to .5) and along it from its base (0 to 1). */
export const LEAF_LEVER_ATTRIBUTE = 'leafLever';
/** The gloss of a leaf whose species is not known: 0 matte, 1 waxy. Third component of the lever attribute. */
export const LEAF_GLOSS = .35;

export const leafCardVertexDeclarations = /* glsl */`
attribute vec4 leafCard;
attribute vec3 leafLever;
varying vec4 vLeafCard;
varying vec2 vLeafWind;
varying float vLeafGloss;
`;
/** After the tree wind's bend, which defines TREE_WIND and the gust it rides on. */
export const leafCardVertex = /* glsl */`
vLeafCard = leafCard; vLeafWind = vec2(0.0); vLeafGloss = leafLever.z;
#ifdef TREE_WIND
if (leafCard.z > 0.0) {
  float leafBlow = treeStrength * treeRustle * (.55 + .9 * treeWave);
  float leafClock = treeTime * (2.3 + 1.9 * leafCard.z) + leafCard.z * 41.0 + treePhase;
  float leafFlap = sin(leafClock) + .5 * sin(leafClock * 2.3 + 1.3);
  float leafTwist = sin(leafClock * 1.6 + 2.1);
  transformed += normal * leafCard.w * leafBlow * (leafLever.y * leafLever.y * leafFlap * 1.1 + leafLever.x * (.3 + leafLever.y) * leafTwist * 1.3);
  vLeafCard.z = fract(leafCard.z + treePhase * .37) * .96 + .04;
  vLeafWind = vec2(treeTime, min(.42, leafBlow * 4.5));
}
#endif
`;
export const leafCardFragmentDeclarations = /* glsl */`
uniform sampler2D leafAtlas;
uniform sampler2D leafStalks;
varying vec4 vLeafCard;
varying vec2 vLeafWind;
varying float vLeafGloss;
// Set per leaf below and read after the material's own roughness and normal: negative means not a leaf.
float leafRough = -1.0;
vec3 leafTilt = vec3(0.0);
`;
/** After the material's roughness: each leaf has its own, about the species' gloss. */
export const leafCardRoughness = /* glsl */`
if (leafRough >= 0.0) roughnessFactor = leafRough;
`;
/** After the material's surface is set up: a waxy cuticle mirrors more of the sun than the engine's stock
 * four percent, by eye rather than by measurement, so a glossy crown visibly glitters. */
export const leafCardSpecular = /* glsl */`
if (leafRough >= 0.0 && leafRough < .9) material.specularColor = vec3(.04 + .13 * vLeafGloss);
`;
/** After the material's normal: each leaf faces a little its own way, and turns as it flaps, so the sun
 * glints off one leaf and then its neighbour instead of lying across the whole spray as one sheen. */
export const leafCardNormal = /* glsl */`
normal = normalize(normal + leafTilt);
`;
/** Before the alpha test: turn the lookup about the nearest leaf's stalk, shade by the leaf, cut away the rest. */
export const leafCardFragment = /* glsl */`
if (vLeafCard.z > 0.0) {
  vec4 leafStalk = texture2D(leafStalks, vLeafCard.xy);
  vec2 leafPivot = (floor(vLeafCard.xy * ${ID_SIZE}.0) + .5) / ${ID_SIZE}.0 + (leafStalk.xy - .5) / ${GRID}.0;
  float leafClock = vLeafWind.x * (4.2 + 3.1 * leafStalk.z) + leafStalk.z * 37.0 + vLeafCard.z * 23.0;
  float leafTurn = vLeafWind.y * (sin(leafClock) + .5 * sin(leafClock * 1.9 + 1.0));
  vec2 leafArm = vLeafCard.xy - leafPivot;
  float leafCos = cos(leafTurn), leafSin = sin(leafTurn);
  vec4 leafTexel = texture2D(leafAtlas, leafPivot + vec2(leafCos * leafArm.x - leafSin * leafArm.y, leafSin * leafArm.x + leafCos * leafArm.y));
  float leafTwig = texture2D(leafAtlas, vLeafCard.xy).g;
  float leafCut = ${CUT.toFixed(2)};
#ifdef STANDARD
  // A card seen edge-on would smear its leaves into a streak.
  vec3 leafFace = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  if (abs(dot(leafFace, normalize(vViewPosition))) < .17) discard;
  // Far off, where a leaf is smaller than a pixel, the gaps close a little so a crown does not turn to speckle.
  leafCut *= 1.0 - .5 * smoothstep(35.0, 110.0, length(vViewPosition));
#endif
  if (max(leafTexel.a, leafTwig) < leafCut) discard;
  // A leaf that turns catches the light differently; a twig is bark.
  diffuseColor.rgb *= leafTexel.a >= leafTwig ? leafTexel.r * 1.55 * (1.0 + .45 * leafTurn) : .0;
  diffuseColor.rgb += leafTexel.a >= leafTwig ? vec3(0.0) : vec3(.16, .12, .09);
#ifdef STANDARD
  // The waxy upper face of a leaf mirrors the sun; bark does not. Beyond 80 m a leaf is too small to glint alone.
  float leafSeed = fract(leafStalk.z * 7.31 + vLeafCard.z * 3.17), leafLone = 1.0 - smoothstep(30.0, 80.0, length(vViewPosition));
  if (leafTexel.a >= leafTwig) {
    leafRough = clamp(mix(.82, .32, vLeafGloss) * (.85 + .4 * fract(leafSeed * 5.3)), .2, 1.0);
    leafTilt = (vec3(cos(leafSeed * 6.283), sin(leafSeed * 6.283), 0.0) * .38
      + vec3(leafTurn * 1.4, vLeafWind.y * sin(leafClock * 1.3 + 2.0) * 1.1, 0.0)) * leafLone;
  } else leafRough = .92;
#endif
}
`;

const KEY = 'leaf-cards-v2';
const carded = new WeakSet<THREE.Material>();
export const hasLeafCards = (material: THREE.Material) => carded.has(material);
/**
 * Cut a material's cards into leaves. Idempotent, and keeps whatever the material already compiles. Works
 * on the lit material and on the depth materials its shadows use, so a crown's shadow is leaves too.
 * Apply before the tree wind patches the material: the cards' motion reads the wind it declares.
 */
export function cutLeafCards<T extends THREE.Material>(material: T): T {
  if (carded.has(material)) return material;
  carded.add(material);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    const textures = leafAtlas();
    shader.uniforms.leafAtlas = { value: textures.map }; shader.uniforms.leafStalks = { value: textures.ids };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + leafCardVertexDeclarations)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + leafCardVertex);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + leafCardFragmentDeclarations)
      .replace('#include <alphatest_fragment>', leafCardFragment + '#include <alphatest_fragment>')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + leafCardRoughness)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + leafCardNormal)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + leafCardSpecular);
  };
  material.customProgramCacheKey = function() { return `${key.call(this)}|${KEY}`; };
  material.needsUpdate = true;
  return material;
}
/** A clone made for batching keeps the source's compile hook; this records that it is cut too. */
export function inheritLeafCards(source: THREE.Material, target: THREE.Material) { if (carded.has(source)) carded.add(target); }

let mass: THREE.BufferGeometry | undefined;
/** Triangles in one leaf mass. */
export const LEAF_MASS_TRIANGLES = 96;
/**
 * A crown of leaf sprays filling the unit sphere, for the trees that are a trunk under rounded crown shapes
 * (tree-wind.ts scales one to each crown). Forty-four sprays face outward over four that cross the middle;
 * colour is in the vertices, paler above. One shared shape: callers clone it and turn each crown differently.
 */
export function leafMassGeometry(pattern: LeafPattern = 'opposite') {
  if (mass) return mass;
  const rand = random(4219), position: number[] = [], normal: number[] = [], color: number[] = [], card: number[] = [], lever: number[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const spray = (at: THREE.Vector3, out: THREE.Vector3, size: number, droop: number, shade: number) => {
    const side = v(0, 1, 0).cross(out); if (side.lengthSq() < .01) side.set(1, 0, 0);
    const along = side.normalize().applyAxisAngle(out, rand() * Math.PI * 2), across = out.clone().cross(along).normalize();
    const base = at.clone().addScaledVector(along, -size * .58).addScaledVector(out, -size * .06), end = at.clone().addScaledVector(along, size * .62).addScaledVector(out, size * .1); end.y -= size * droop;
    const tile = leafTile(pattern, Math.floor(rand() * LEAF_VARIANTS)), phase = .04 + .96 * rand(), flip = rand() < .5 ? 1 : -1;
    const corner = (p: THREE.Vector3, x: number, y: number) => ({ p: p.clone().addScaledVector(across, x * size * 1.04), k: [tile.u + tile.side * (.5 + x * flip), tile.v + tile.side * y, phase, size, x, y], c: shade * (y ? 1 : .85) });
    const a = corner(base, -.5, 0), b = corner(base, .5, 0), c = corner(end, -.5, 1), d = corner(end, .5, 1);
    const face = b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).normalize(), flipped = face.dot(out) < 0, n = face.multiplyScalar(flipped ? -1 : 1).addScaledVector(out, .8).normalize();
    for (const tri of flipped ? [[a, c, b], [b, c, d]] : [[a, b, c], [b, d, c]]) for (const q of tri) {
      position.push(q.p.x, q.p.y, q.p.z); normal.push(n.x, n.y, n.z); color.push(q.c * .96, q.c, q.c * .9);
      card.push(q.k[0], q.k[1], q.k[2], q.k[3]); lever.push(q.k[4], q.k[5], LEAF_GLOSS);
    }
  };
  for (let i = 0; i < 4; i++) { const a = i * 1.571 + rand(), out = v(Math.cos(a) * .8, .35 + .4 * rand(), Math.sin(a) * .8).normalize(); spray(out.clone().multiplyScalar(.1), out, 1.2, 0, .5 + .1 * rand()); }
  for (let i = 0; i < 44; i++) {
    const y = -.6 + 1.6 * (i + .5) / 44, ring = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + rand() * .5, out = v(Math.cos(a) * ring, y, Math.sin(a) * ring).normalize();
    spray(out.clone().multiplyScalar(.74 + .24 * rand()), out, .52 + .2 * rand(), .14, (.68 + .32 * Math.max(0, Math.min(1, .5 + out.y * .7))) * (.92 + .16 * rand()));
  }
  mass = new THREE.BufferGeometry();
  mass.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); mass.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); mass.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  mass.setAttribute(LEAF_CARD_ATTRIBUTE, new THREE.Float32BufferAttribute(card, 4)); mass.setAttribute(LEAF_LEVER_ATTRIBUTE, new THREE.Float32BufferAttribute(lever, 3));
  mass.computeBoundingBox(); mass.computeBoundingSphere();
  return mass;
}

let reeds: THREE.BufferGeometry | undefined;
/** Triangles in one clump of blades. */
export const LEAF_REED_TRIANGLES = 12;
/**
 * A clump of long blades filling the unit sphere, for reeds and sedges built as tall rounded shapes: six
 * upright cards through the middle, each a fan of blades from the foot, darker at the foot.
 */
export function leafReedGeometry() {
  if (reeds) return reeds;
  const rand = random(8111), position: number[] = [], normal: number[] = [], color: number[] = [], card: number[] = [], lever: number[] = [], tile = leafTile('blades', 0);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 6 + (rand() - .5) * .3, ax = Math.cos(a), az = Math.sin(a), nx = -az, nz = ax, tilt = (rand() - .5) * .3, phase = .04 + .96 * rand(), flip = rand() < .5 ? 1 : -1, shade = .86 + .14 * rand();
    const corner = (x: number, y: number) => ({ p: [ax * x * 1.05 + nx * tilt * y, -1 + y * 2.08, az * x * 1.05 + nz * tilt * y], k: [tile.u + tile.side * (.5 + x * flip * .5), tile.v + tile.side * y, phase, 1, x * .5, y], c: shade * (.6 + .4 * y) });
    const q = [corner(-1, 0), corner(1, 0), corner(-1, 1), corner(1, 1)];
    for (const v of [q[0], q[1], q[2], q[1], q[3], q[2]]) {
      position.push(v.p[0], v.p[1], v.p[2]); normal.push(nx * .6, .8, nz * .6); color.push(v.c * .96, v.c, v.c * .88);
      card.push(v.k[0], v.k[1], v.k[2], v.k[3]); lever.push(v.k[4], v.k[5], .45);
    }
  }
  reeds = new THREE.BufferGeometry();
  reeds.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); reeds.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); reeds.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  reeds.setAttribute(LEAF_CARD_ATTRIBUTE, new THREE.Float32BufferAttribute(card, 4)); reeds.setAttribute(LEAF_LEVER_ATTRIBUTE, new THREE.Float32BufferAttribute(lever, 3));
  reeds.computeBoundingBox(); reeds.computeBoundingSphere();
  return reeds;
}
