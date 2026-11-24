import * as THREE from 'three';
import { LEAF_GLOSS } from './leaf-cards';
import { treePart } from './tree-wind';
import { shadeLeaves } from './leaf-shading';
import { PALM_SPECS, type PalmSpec, type PalmSpecies } from './palm-species';

/**
 * Palms as plants, not poles with a star on top: a ringed trunk that leans, swells or bulges as the
 * species does, a crownshaft where the species has one, and fronds of different ages, each a curved
 * rachis carrying its own leaflets (or a pleated fan). Original procedural geometry from the species
 * notes in docs/SINGAPORE-VEGETATION.md; no photographs or outside models.
 *
 * One palm is two meshes, trunk and crown, so the wind batcher (tree-wind.ts) can keep every palm of a
 * shape in two instanced draws and flutter only the leaves. Colour is in the vertices: ring scars,
 * the paler rachis, darker leaflet tips, yellowing old fronds and the shade inside the crown. Both
 * materials are white, so each declares what a round strikes (`impactSurface`).
 */
export interface PalmModel {
  species: PalmSpecies;
  trunk: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  /** Ground to the point the fronds leave from, for the tallest stem (m). */
  height: number;
  /** Trunk radius at chest height (m), for a collider. */
  radius: number;
  /** Where the crown sits relative to the foot (m), before the placement's yaw. */
  crownOffset: { x: number; z: number };
  triangles: { trunk: number; crown: number };
}

export type V3 = [number, number, number];
export const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const rgb = (hex: string): V3 => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const DEG = Math.PI / 180;
export function random(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Triangle soup with normals and vertex colours, shared by the palm and plant builders. */
/** u, v, phase, size, across, along, and optionally how glossy the leaf is (0 matte to 1 waxy). */
export type CardVertex = readonly [number, number, number, number, number, number, number?];
export class Mesher {
  position: number[] = []; normal: number[] = []; color: number[] = [];
  /** Leaf-card data per vertex (leaf-cards.ts), only where a caller gives it: u, v, phase, size, then across, along and gloss. */
  card: number[] = []; lever: number[] = [];
  /** Wound to face the first normal, so double-sided materials light the right side. */
  tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, ca: V3, cb: V3, cc: V3, cards?: readonly [CardVertex, CardVertex, CardVertex]) {
    let [ka, kb, kc] = cards ?? [];
    if (dot(cross(sub(b, a), sub(c, a)), na) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; [cb, cc] = [cc, cb]; [kb, kc] = [kc, kb]; }
    if (ka && kb && kc) {
      this.padCards();
      for (const k of [ka, kb, kc]) { this.card.push(k[0], k[1], k[2], k[3]); this.lever.push(k[4], k[5], k[6] ?? LEAF_GLOSS); }
    }
    this.position.push(...a, ...b, ...c); this.normal.push(...na, ...nb, ...nc); this.color.push(...ca, ...cb, ...cc);
  }
  private padCards() { const n = this.position.length / 3; while (this.card.length < n * 4) this.card.push(0); while (this.lever.length < n * 3) this.lever.push(0); }
  /** One face, one normal: the face's own, turned toward `toward` and softened by it. */
  flat(a: V3, b: V3, c: V3, toward: V3, soften: number, ca: V3, cb: V3, cc: V3, cards?: readonly [CardVertex, CardVertex, CardVertex]) {
    let n = unit(cross(sub(b, a), sub(c, a)));
    if (dot(n, toward) < 0) n = [-n[0], -n[1], -n[2]];
    n = unit(add(n, toward, soften));
    this.tri(a, b, c, n, n, n, ca, cb, cc, cards);
  }
  /** A tube of rings: each ring is centre, two perpendicular axes, radius and colour. */
  tube(rings: { at: V3; u: V3; v: V3; radius: number; colour: V3 }[], sides: number) {
    const point = (ring: typeof rings[number], k: number) => {
      const a = k / sides * Math.PI * 2, n = unit(add([ring.u[0] * Math.cos(a), ring.u[1] * Math.cos(a), ring.u[2] * Math.cos(a)], ring.v, Math.sin(a)));
      return { p: add(ring.at, n, ring.radius), n };
    };
    for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < sides; k++) {
      const a = point(rings[i], k), b = point(rings[i], k + 1), c = point(rings[i + 1], k), d = point(rings[i + 1], k + 1);
      // Shade a little by side so a plain round trunk still shows its roundness in flat light.
      const ca = rings[i].colour, cc = rings[i + 1].colour;
      if (rings[i].radius > 1e-4) this.tri(a.p, b.p, c.p, a.n, b.n, c.n, ca, ca, cc);
      if (rings[i + 1].radius > 1e-4) this.tri(b.p, d.p, c.p, b.n, d.n, c.n, ca, cc, cc);
    }
  }
  /** A closed lump (fruit, leaf-base boss): an octahedron pulled to `size`. */
  lump(at: V3, size: V3, colour: V3, shade: V3) {
    const tips: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [i, j, k] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) {
      const p = [tips[i], tips[j], tips[k]].map(t => add(at, [t[0] * size[0], t[1] * size[1], t[2] * size[2]])) as [V3, V3, V3];
      const c = [tips[i], tips[j], tips[k]].map(t => t[1] < 0 ? shade : colour) as [V3, V3, V3];
      this.tri(p[0], p[1], p[2], tips[i], tips[j], tips[k], c[0], c[1], c[2]);
    }
  }
  /** `cards` adds the leaf-card attributes even when no face is a card, for a material that reads them. */
  geometry(cards = this.card.length > 0) {
    const g = new THREE.BufferGeometry();
    if (cards) {
      this.padCards();
      g.setAttribute('leafCard', new THREE.Float32BufferAttribute(this.card, 4)); g.setAttribute('leafLever', new THREE.Float32BufferAttribute(this.lever, 3));
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

interface Stem { foot: V3; height: number; lean: number; heading: number; girth: number }
/** The trunk's centre line: leaning from the foot and growing back toward upright, as a palm reaching for light does. */
function trunkAt(stem: Stem, t: number): V3 {
  const out = stem.lean * stem.height * (1 - (1 - t) * (1 - t));
  return [stem.foot[0] + Math.cos(stem.heading) * out, stem.foot[1] + stem.height * t, stem.foot[2] + Math.sin(stem.heading) * out];
}
export function frame(tangent: V3): { u: V3; v: V3 } {
  const u = unit(cross(tangent, Math.abs(tangent[1]) > .95 ? [1, 0, 0] : [0, 1, 0]));
  return { u, v: unit(cross(tangent, u)) };
}

function buildStem(spec: PalmSpec, stem: Stem, trunk: Mesher, crown: Mesher, rand: () => number) {
  const t = spec.trunk, bark = rgb(t.colour), scar = rgb(t.scar), young = rgb(t.young);
  const radiusAt = (v: number) => stem.girth * (mix(t.base, t.top, Math.pow(v, t.taper))
    + t.flare * Math.exp(-v * stem.height / t.flareHeight) + t.bulge * Math.exp(-(((v - t.bulgeAt) / t.bulgeWidth) ** 2)));
  // Leaf scars: a narrow raised dark ring, then the smooth internode above it.
  const nodes = Math.max(4, Math.min(t.maxRings, Math.round(stem.height / t.ringSpacing)));
  const rings: Parameters<Mesher['tube']>[0] = [];
  for (let i = 0; i <= nodes; i++) {
    const v = i / nodes, at = trunkAt(stem, v), next = trunkAt(stem, Math.min(1, v + .02)), before = trunkAt(stem, Math.max(0, v - .02));
    const axes = frame(unit(sub(next, before))), r = radiusAt(v);
    const base = mix3(mix3(bark, [bark[0] * .8, bark[1] * .8, bark[2] * .82], Math.exp(-v * stem.height / .9)), young, smooth(.72, 1, v));
    rings.push({ at, ...axes, radius: r * (1 + t.ridge), colour: mix3(base, scar, t.scarDepth) });
    if (i < nodes) {
      const up = trunkAt(stem, v + .22 / nodes);
      rings.push({ at: up, ...axes, radius: radiusAt(v + .22 / nodes), colour: base });
    }
  }
  trunk.tube(rings, t.sides);
  if (t.spines) {
    // Spines stand straight off the trunk, scattered up its length.
    const colour = rgb(t.spines.colour);
    for (let i = 0; i < t.spines.count; i++) {
      const v = .06 + .9 * (i + rand()) / t.spines.count, a = i * 2.39996 + rand(), at = trunkAt(stem, v), out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const root = add(at, out, radiusAt(v) * .9), length = t.spines.length * (.7 + .6 * rand());
      trunk.flat(add(root, [0, .02, 0]), add(root, [0, -.02, 0]), add(add(root, out, length), [0, -.02, 0]), [-out[2], 0, out[0]], .2, colour, colour, colour);
    }
  }
  let top = trunkAt(stem, 1);
  const tangent = unit(sub(top, trunkAt(stem, .97)));
  const shaft = spec.crownshaft;
  if (shaft) {
    const axes = frame(tangent), colour = rgb(shaft.colour), pale = rgb(shaft.top), r = radiusAt(1), length = shaft.length * stem.girth;
    trunk.tube([
      { at: top, ...axes, radius: r * 1.02, colour: mix3(colour, bark, .35) },
      { at: add(top, tangent, length * .12), ...axes, radius: r * shaft.swell, colour },
      { at: add(top, tangent, length * .55), ...axes, radius: r * mix(shaft.swell, shaft.neck, .55), colour: mix3(colour, pale, .4) },
      { at: add(top, tangent, length), ...axes, radius: r * shaft.neck, colour: pale },
    ], t.sides);
    top = add(top, tangent, length);
  } else {
    // No crownshaft: the old leaf bases and their fibre make a rough boss under the fronds.
    trunk.lump(add(top, tangent, .05), [radiusAt(1) * 1.9, .42 * stem.girth, radiusAt(1) * 1.9], rgb(t.boss), [bark[0] * .6, bark[1] * .6, bark[2] * .6]);
  }
  const scale = stem.girth;
  if (spec.fruit) {
    const fruit = spec.fruit, colours = fruit.colours.map(rgb);
    for (let i = 0; i < fruit.count; i++) {
      const a = i * 2.399 + rand() * .6, r = (radiusAt(1) + fruit.size * (.7 + (i % 3) * .45)) * 1, drop = fruit.drop + (i % 3) * fruit.size * .7;
      const c = colours[i % colours.length];
      trunk.lump(add(top, [Math.cos(a) * r, -drop * scale, Math.sin(a) * r]), [fruit.size * scale, fruit.size * 1.15 * scale, fruit.size * scale], c, [c[0] * .6, c[1] * .6, c[2] * .6]);
    }
  }
  buildCrown(spec, top, tangent, scale, crown, rand);
  return top;
}

function buildCrown(spec: PalmSpec, origin: V3, axis: V3, scale: number, crown: Mesher, rand: () => number) {
  const f = spec.frond, leaf = rgb(f.leaf), tip = rgb(f.tip), old = rgb(f.old), dead = rgb(f.dead), rib = rgb(f.rib);
  const count = f.count, start = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    // Youngest first: upright in the middle; the oldest hang lowest and yellow before they drop.
    const age = count > 1 ? i / (count - 1) : 0, azimuth = start + i * 2.39996 + (rand() - .5) * .3;
    const out: V3 = [Math.cos(azimuth), 0, Math.sin(azimuth)], side: V3 = [-Math.sin(azimuth), 0, Math.cos(azimuth)];
    const rise = mix(f.rise[0], f.rise[1], Math.pow(age, f.spread)) * DEG + (rand() - .5) * .12;
    const bend = mix(f.bend[0], f.bend[1], age) * DEG * (.85 + rand() * .3);
    const length = f.length * scale * (.72 + .28 * Math.sin(Math.PI * Math.min(1, .25 + age * 1.1))) * (.92 + rand() * .16);
    const isDead = f.deadFronds > 0 && i >= count - f.deadFronds;
    const tone = isDead ? 1 : smooth(.62, 1, age) * f.yellowing;
    const pitchAt = (s: number) => rise - bend * Math.pow(s, f.curve);
    // The crown leans with the trunk: fronds leave along the trunk's own axis.
    const base = add(add(origin, axis, mix(.18, -.1, age) * f.spreadHeight * scale), out, f.hub * scale);
    const steps = f.segments, points: V3[] = [base], tangents: V3[] = [];
    for (let k = 0; k < steps; k++) {
      const p = pitchAt((k + .5) / steps), d: V3 = [out[0] * Math.cos(p), Math.sin(p), out[2] * Math.cos(p)];
      tangents.push(d); points.push(add(points[k], d, length / steps));
    }
    const at = (s: number) => {
      const x = clamp01(s) * steps, k = Math.min(steps - 1, Math.floor(x)), d = tangents[k];
      const up = unit(cross(side, d));
      return { p: add(points[k], d, (x - k) * length / steps), d, up: up[1] < 0 && Math.abs(d[1]) < .98 ? ([-up[0], -up[1], -up[2]] as V3) : up };
    };
    const shade = (s: number) => .7 + .3 * smooth(.02, .45, s);
    const ribColour = (s: number): V3 => { const c = mix3(mix3(rib, leaf, s * .6), isDead ? dead : old, tone * .8), k = shade(s); return [c[0] * k, c[1] * k, c[2] * k]; };
    // Rachis: a keeled rib, wide where it clasps the trunk and tapering to nothing.
    // Half as many sections as the curve the leaflets follow: the rib is thin enough not to show it.
    const ribSteps = Math.max(2, Math.ceil(steps / 2));
    const ribRings = Array.from({ length: ribSteps + 1 }, (_, k) => {
      const s = k / ribSteps, here = at(s);
      return { at: here.p, u: side, v: here.up, radius: f.ribWidth * scale * mix(1, .12, Math.pow(s, .8)) * (k === ribSteps ? 0 : 1), colour: ribColour(s) };
    });
    crown.tube(ribRings, 3);
    if (f.fan) { fanBlade(spec, crown, at(1), side, scale, age, tone, isDead, rand); continue; }
    const pairs = f.pairs, planes = f.planes;
    for (let j = 0; j < pairs; j++) {
      const v = (j + .5) / pairs, s = f.petiole + (1 - f.petiole) * v, here = at(s);
      const profile = Math.pow(Math.sin(Math.PI * (.1 + .84 * v)), .7);
      const span = f.leaflet * scale * profile * (.9 + rand() * .2), width = f.leafletWidth * scale * (.55 + .45 * profile);
      for (const hand of [-1, 1]) {
        const lift = planes[(j * 2 + (hand > 0 ? 1 : 0)) % planes.length] * DEG + (rand() - .5) * .2;
        const sweep = (f.sweep + 22 * v) * DEG;
        let dir = unit(add([side[0] * hand * Math.cos(lift), 0, side[2] * hand * Math.cos(lift)], here.up, Math.sin(lift)));
        dir = unit(add([dir[0] * Math.cos(sweep), dir[1] * Math.cos(sweep), dir[2] * Math.cos(sweep)], here.d, Math.sin(sweep)));
        const droop = f.droop * (.5 + .9 * age) * (isDead ? 1.8 : 1);
        const mid = add(add(here.p, dir, span * .42), [0, -1, 0], span * droop * .12);
        const end = add(add(here.p, dir, span), [0, -1, 0], span * droop * .55);
        const across = unit(cross(dir, here.up)), a = add(mid, across, width / 2), b = add(mid, across, -width / 2);
        const k = shade(s), tint = mix3(leaf, isDead ? dead : old, tone);
        const near: V3 = [mix(tint[0], rib[0], .25) * k, mix(tint[1], rib[1], .25) * k, mix(tint[2], rib[2], .25) * k];
        const body: V3 = [tint[0] * k, tint[1] * k, tint[2] * k];
        const far = mix3(body, isDead ? dead : tip, isDead ? .6 : .7).map(c => c * (isDead ? .8 : 1)) as V3;
        crown.flat(here.p, a, b, here.up, .7, near, body, body);
        crown.flat(a, end, b, here.up, .7, body, far, body);
      }
    }
  }
  if (f.spear > 0) {
    // The unopened spear leaf, straight up the middle.
    const pale = mix3(leaf, rib, .55), { u, v } = frame(axis), length = f.length * scale * f.spear;
    crown.tube([{ at: origin, u, v, radius: f.ribWidth * scale * 1.3, colour: pale }, { at: add(origin, axis, length * .6), u, v, radius: f.ribWidth * scale * .9, colour: pale },
      { at: add(origin, axis, length), u, v, radius: 0, colour: mix3(pale, leaf, .5) }], 3);
  }
}

/** A costapalmate blade: pleated segments joined for most of their length, the tips free and drooping with age. */
function fanBlade(spec: PalmSpec, crown: Mesher, hub: { p: V3; d: V3; up: V3 }, side: V3, scale: number, age: number, tone: number, isDead: boolean, rand: () => number) {
  const f = spec.frond, fan = f.fan!, leaf = rgb(f.leaf), tip = rgb(f.tip), old = rgb(f.old), dead = rgb(f.dead), rib = rgb(f.rib);
  const radius = fan.radius * scale * (.9 + rand() * .2), half = fan.arc * DEG / 2, n = fan.segments;
  // The blade continues the stalk, tipped down a little more the older the leaf.
  const tilt = (fan.tilt + 30 * age) * DEG;
  const forward = unit(add([hub.d[0] * Math.cos(tilt), hub.d[1] * Math.cos(tilt), hub.d[2] * Math.cos(tilt)], hub.up, -Math.sin(tilt)));
  const normal = unit(cross(side, forward)), up: V3 = normal[1] < 0 ? [-normal[0], -normal[1], -normal[2]] : normal;
  const tint = mix3(leaf, isDead ? dead : old, tone), centre = mix3(tint, rib, .45), edge = mix3(tint, isDead ? dead : tip, .6);
  const rim = (angle: number, r: number, pleat: number, sag: number): V3 => add(add(add(add(hub.p, forward, Math.cos(angle) * r), side, Math.sin(angle) * r), up, pleat), [0, -1, 0], sag);
  for (let k = 0; k < n; k++) {
    const a0 = -half + k / n * half * 2, a1 = -half + (k + 1) / n * half * 2, am = (a0 + a1) / 2;
    const fold = fan.pleat * radius, sag = fan.droop * radius * (.35 + age) * (isDead ? 2 : 1);
    // Ridge at each segment boundary, valley down its middle: the pleating that stiffens a fan leaf.
    const r0 = rim(a0, radius * fan.joined, fold, sag * .25), r1 = rim(a1, radius * fan.joined, fold, sag * .25), valley = rim(am, radius * fan.joined, -fold, sag * .25);
    const point = rim(am, radius, -fold * .3, sag);
    crown.flat(hub.p, r0, valley, up, .35, centre, tint, tint);
    crown.flat(hub.p, valley, r1, up, .35, centre, tint, tint);
    crown.flat(r0, point, valley, up, .35, tint, edge, tint);
    crown.flat(valley, point, r1, up, .35, tint, edge, tint);
  }
}

export const PALM_VARIANTS = 3;
/** One palm of a species. `variant` picks one of a few fixed shapes, so palms of a kind batch together. */
export function buildPalm(species: PalmSpecies, variant = 0): PalmModel {
  const spec = PALM_SPECS[species], rand = random(spec.seed * 31 + (variant % PALM_VARIANTS) * 977 + 5);
  const trunk = new Mesher(), crown = new Mesher();
  const heading = rand() * Math.PI * 2, lean = spec.trunk.lean[0] + (spec.trunk.lean[1] - spec.trunk.lean[0]) * rand();
  const stems: Stem[] = [{ foot: [0, 0, 0], height: spec.height, lean, heading, girth: 1 }];
  const clump = spec.clump;
  if (clump) for (let i = 1; i < clump.stems; i++) {
    // Suckers ring the oldest stem, shorter and leaning outward for light.
    const a = heading + i * 2.39996, r = clump.spread * (.45 + .55 * rand()) * Math.sqrt(i / clump.stems + .2);
    const share = mix(clump.shortest, .95, Math.pow(rand(), 1.4));
    stems.push({ foot: [Math.cos(a) * r, 0, Math.sin(a) * r], height: spec.height * share, lean: clump.lean * (.6 + .8 * rand()), heading: a, girth: mix(.72, 1, share) });
  }
  let top: V3 = [0, 0, 0];
  stems.forEach((stem, i) => { const at = buildStem(spec, stem, trunk, crown, rand); if (i === 0) top = at; });
  const chest = Math.min(1, 1.3 / spec.height), t = spec.trunk;
  return {
    species, trunk: trunk.geometry(), crown: crown.geometry(), height: top[1],
    radius: clump ? clump.spread * .6 : mix(t.base, t.top, Math.pow(chest, t.taper)) + t.flare * Math.exp(-1.3 / t.flareHeight),
    crownOffset: { x: top[0], z: top[2] },
    triangles: { trunk: trunk.position.length / 9, crown: crown.position.length / 9 },
  };
}

const hash = (x: number, z: number) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
export interface PalmPlacement { trunk: THREE.Mesh; crown: THREE.Mesh; model: PalmModel; scale: number; yaw: number }
/**
 * Shared palm shapes and their two materials for one scene. The scene owns disposal through `track`.
 * `place` roots a palm at (x, base, z) with its fronds leaving the trunk `height` metres up, turned and
 * varied by where it stands, so a district builds the same every time.
 */
export function createPalmKit(track: { geometry: (g: THREE.BufferGeometry) => unknown; material: (m: THREE.Material) => unknown }) {
  const models = new Map<string, PalmModel>();
  const wood = new THREE.MeshStandardMaterial({ name: 'palm trunk wood', color: '#ffffff', vertexColors: true, roughness: .86 });
  const leaf = shadeLeaves(new THREE.MeshStandardMaterial({ name: 'palm leaf foliage', color: '#ffffff', vertexColors: true, roughness: .5, side: THREE.DoubleSide }), { thin: true, transmit: .45 });
  wood.userData.impactSurface = 'wood'; leaf.userData.impactSurface = 'foliage';
  track.material(wood); track.material(leaf);
  function model(species: PalmSpecies, variant: number) {
    const key = `${species}:${variant}`;
    let value = models.get(key);
    if (!value) { value = buildPalm(species, variant); track.geometry(value.trunk); track.geometry(value.crown); models.set(key, value); }
    return value;
  }
  function place(species: PalmSpecies, parent: THREE.Object3D, x: number, base: number, z: number, height = PALM_SPECS[species].height): PalmPlacement {
    const pick = hash(x, z), value = model(species, Math.floor(pick * PALM_VARIANTS) % PALM_VARIANTS);
    const scale = height / value.height, yaw = hash(z + 3.1, x - 1.7) * Math.PI * 2;
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, flutter: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, base, z); mesh.rotation.y = yaw; mesh.scale.setScalar(scale);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
      return treePart(mesh, x, base, z, height, flutter);
    };
    return { trunk: make(value.trunk, wood, 0), crown: make(value.crown, leaf, 1.8), model: value, scale, yaw };
  }
  return { place, model, wood, leaf };
}
export type PalmKit = ReturnType<typeof createPalmKit>;
