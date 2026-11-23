import * as THREE from 'three';
import { treePart } from './tree-wind';
import { shadeLeaves } from './leaf-shading';
import { DEG, Mesher, add, clamp01, cross, frame, mix, mix3, random, rgb, smooth, sub, unit, type V3 } from './palm-models';
import { PLANT_SPECS, type HerbSpec, type PlantSpecies, type TreeSpec } from './plant-species';

/**
 * Broadleaf trees and garden herbs as plants: a bole with its own bark, buttresses and branching habit,
 * limbs that carry leaf sprays where the species carries them, and herb clumps of leafy stems with the
 * species' flower heads. Original procedural geometry from the notes in plant-species.ts and
 * docs/SINGAPORE-VEGETATION.md; no photographs or outside models.
 *
 * Like a palm, one plant is two meshes, wood and leaf, so the wind batcher keeps every plant of a
 * shape in two instanced draws. Colour is in the vertices and both materials are white.
 */
export interface PlantModel {
  species: PlantSpecies;
  wood: THREE.BufferGeometry;
  leaf: THREE.BufferGeometry;
  /** Ground to the top of the crown (m). */
  height: number;
  /** Trunk radius at chest height, or a herb clump's radius (m). */
  radius: number;
  /** How far the buttress roots reach from the centre (m); 0 without them. */
  footing: number;
  /** The level run of a long low limb, in the model's own space, for a collider. */
  lowLimb?: { from: V3; to: V3 };
  triangles: { wood: number; leaf: number };
}

const scaled = (c: V3, k: number): V3 => [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];
const polar = (azimuth: number, rise: number): V3 => [Math.cos(azimuth) * Math.cos(rise), Math.sin(rise), Math.sin(azimuth) * Math.cos(rise)];

/** A leaf spray mass: flat sprays turned outward round a centre, over a dark core that closes the silhouette. */
function cluster(leaf: Mesher, spec: TreeSpec, centre: V3, radius: number, rand: () => number) {
  const c = spec.crown, green = rgb(c.leaf), tip = rgb(c.tip), young = rgb(c.young), accent = c.accent ? rgb(c.accent.colour) : green;
  leaf.lump(centre, [radius * .55, radius * .42, radius * .55], scaled(green, .55), scaled(green, .4));
  for (let i = 0; i < c.sprays; i++) {
    const y = mix(-.3, 1, (i + .5) / c.sprays), ring = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + rand() * .5;
    const out = unit([Math.cos(a) * ring, y * c.flatten, Math.sin(a) * ring]);
    const at = add(centre, [out[0] * radius, out[1] * radius * c.flatten, out[2] * radius], .6 + .4 * rand());
    // The spray lies across the outward direction, sagging at its tip.
    const { u, v } = frame(out), roll = rand() * Math.PI, along = unit(add([u[0] * Math.cos(roll), u[1] * Math.cos(roll), u[2] * Math.cos(roll)], v, Math.sin(roll)));
    const across = unit(cross(out, along)), size = c.spray * (.75 + .5 * rand());
    const base = add(at, along, -size * .5), end = add(add(at, along, size * .55), [0, -1, 0], size * c.droop);
    const left = add(add(at, across, size * .36), out, size * .08), right = add(add(at, across, -size * .36), out, size * .08);
    const light = .62 + .38 * clamp01(.5 + out[1] * .7), flush = rand() < c.flush;
    const body = scaled(flush ? young : green, light), far = scaled(mix3(flush ? young : green, tip, .6), light);
    leaf.flat(base, left, right, out, .8, scaled(body, .85), body, body);
    leaf.flat(left, end, right, out, .8, body, far, body);
    if (c.accent && rand() < c.accent.share) leaf.lump(add(at, out, size * .12), [c.accent.size, c.accent.size, c.accent.size], accent, scaled(accent, .7));
  }
}

/** A limb or the bole: a tube along `points` with its own radii; bark darkens in alternate strips where the species is fissured. */
function bark(wood: Mesher, spec: TreeSpec, points: V3[], radii: number[], sides: number) {
  const t = spec.trunk, pale = rgb(t.colour), dark = rgb(t.dark);
  const rings = points.map((at, i) => {
    const tangent = unit(sub(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]));
    return { at, ...frame(tangent), radius: radii[i] };
  });
  const point = (ring: typeof rings[number], k: number) => {
    const a = k / sides * Math.PI * 2, n = unit(add([ring.u[0] * Math.cos(a), ring.u[1] * Math.cos(a), ring.u[2] * Math.cos(a)], ring.v, Math.sin(a)));
    return { p: add(ring.at, n, ring.radius), n };
  };
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < sides; k++) {
    const a = point(rings[i], k), b = point(rings[i], k + 1), c = point(rings[i + 1], k), d = point(rings[i + 1], k + 1);
    const colour = mix3(pale, dark, k % 2 ? t.fissure : 0), low = scaled(colour, i ? 1 : .82);
    if (rings[i].radius > 1e-4) wood.tri(a.p, b.p, c.p, a.n, b.n, c.n, low, low, colour);
    if (rings[i + 1].radius > 1e-4) wood.tri(b.p, d.p, c.p, b.n, d.n, c.n, low, colour, colour);
  }
}

/** A limb that leaves at `rise` and turns toward `turn` along its length, with sprays at its end and along it. */
function limb(spec: TreeSpec, wood: Mesher, leaf: Mesher, from: V3, azimuth: number, rise: number, turn: number, length: number, radius: number, clusters: number, rand: () => number) {
  const steps = 3, points: V3[] = [from], radii = [radius];
  for (let k = 1; k <= steps; k++) {
    const pitch = mix(rise, turn, Math.pow(k / steps, 1.3)), d = polar(azimuth + (rand() - .5) * .25, pitch);
    points.push(add(points[k - 1], d, length / steps)); radii.push(radius * mix(1, .3, k / steps));
  }
  bark(wood, spec, points, radii, 5);
  const c = spec.crown;
  for (let n = 0; n < clusters; n++) {
    // The end of the limb first, then back along it, each mass a little off the wood.
    const s = 1 - n * .34, k = Math.min(steps - 1, Math.floor(s * steps)), on = add(points[k], sub(points[k + 1], points[k]), s * steps - k);
    const off: V3 = n ? [(rand() - .5) * c.radius * 1.4, c.radius * (.3 + rand() * .5), (rand() - .5) * c.radius * 1.4] : [0, c.radius * .25, 0];
    const centre = add(on, off);
    if (n) bark(wood, spec, [on, centre], [radius * .3, 0], 3);
    cluster(leaf, spec, centre, c.radius * (n ? .8 : 1) * (.85 + rand() * .3), rand);
  }
  return points[steps];
}

function buildTree(spec: TreeSpec, rand: () => number) {
  const wood = new Mesher(), leaf = new Mesher(), t = spec.trunk, H = spec.height;
  const heading = rand() * Math.PI * 2, lean = t.lean * (.4 + rand() * .6);
  const centre = (y: number): V3 => [Math.cos(heading) * lean * y * y / H, y, Math.sin(heading) * lean * y * y / H];
  const bole = H * spec.bole, top = H * (spec.limbs.leader ? .93 : spec.bole + (1 - spec.bole) * .35);
  const radiusAt = (y: number) => t.radius * (mix(1, t.taper, clamp01(y / top)) + t.flare * Math.exp(-y / t.flareHeight));
  const levels = [0, t.flareHeight * .6, t.flareHeight * 1.6, bole * .5, bole, mix(bole, top, .5), top].filter((y, i, all) => !i || y > all[i - 1] + .05);
  bark(wood, spec, levels.map(centre), levels.map((y, i) => i === levels.length - 1 ? radiusAt(y) * (spec.limbs.leader ? .25 : .7) : radiusAt(y)), t.sides);
  let footing = 0;
  if (spec.buttress) {
    // Plank buttresses: thin triangular fins from the bole out to the ground, each a little different.
    const b = spec.buttress, pale = rgb(t.colour), dark = rgb(t.dark);
    for (let i = 0; i < b.count; i++) {
      const a = heading + i / b.count * Math.PI * 2 + (rand() - .5) * .5, out: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)];
      const reach = b.spread * (.8 + rand() * .4), rise = b.height * (.75 + rand() * .4), inner = radiusAt(rise) * .6;
      footing = Math.max(footing, reach);
      const high = add(centre(rise), out, inner), toe = add([0, -.05, 0], out, reach), root = add([0, -.05, 0], out, inner * .5), knee = add(add([0, rise * .32, 0], out, mix(inner, reach, .5)), [0, 0, 0]);
      for (const hand of [-1, 1]) {
        const w = b.thickness / 2 * hand, n: V3 = [side[0] * hand, 0, side[2] * hand];
        const p = [high, knee, toe, root].map(q => add(q, side, w)) as [V3, V3, V3, V3];
        wood.flat(p[0], p[1], p[3], n, .2, pale, mix3(pale, dark, .4), dark);
        wood.flat(p[1], p[2], p[3], n, .2, mix3(pale, dark, .4), dark, dark);
      }
      // The ridge that closes the two faces along the top.
      const up = unit(add(out, [0, 1, 0], 1.2));
      wood.flat(add(high, side, b.thickness / 2), add(high, side, -b.thickness / 2), add(knee, side, b.thickness / 2), up, .3, pale, pale, pale);
      wood.flat(add(high, side, -b.thickness / 2), add(knee, side, -b.thickness / 2), add(knee, side, b.thickness / 2), up, .3, pale, pale, pale);
      wood.flat(add(knee, side, b.thickness / 2), add(knee, side, -b.thickness / 2), add(toe, side, b.thickness / 2), up, .3, pale, pale, dark);
      wood.flat(add(knee, side, -b.thickness / 2), add(toe, side, -b.thickness / 2), add(toe, side, b.thickness / 2), up, .3, pale, dark, dark);
    }
  }
  const l = spec.limbs, tiers = l.tiers;
  let crownTop = top, lowRun: { from: V3; to: V3 } | undefined;
  for (let tier = 0; tier < tiers; tier++) {
    const share = tiers > 1 ? tier / (tiers - 1) : 0, y = mix(bole, top, tiers > 1 ? share * .92 : 0), from = centre(y);
    // Lower limbs are longer and flatter; the top ones short and steep.
    const reach = H * l.length * mix(1, l.topShare, share), start = rand() * Math.PI * 2;
    for (let i = 0; i < l.perTier; i++) {
      const azimuth = start + i / l.perTier * Math.PI * 2 + (rand() - .5) * .5, rise = mix(l.rise[0], l.rise[1], share) * DEG + (rand() - .5) * .16;
      const end = limb(spec, wood, leaf, add(from, [0, (rand() - .5) * l.scatter, 0]), azimuth, rise, mix(l.turn[0], l.turn[1], share) * DEG, reach * (.82 + rand() * .36), radiusAt(y) * l.girth * mix(1, .6, share), l.clusters, rand);
      crownTop = Math.max(crownTop, end[1] + spec.crown.radius);
    }
  }
  if (l.leader) { cluster(leaf, spec, centre(top + spec.crown.radius * .3), spec.crown.radius, rand); crownTop = Math.max(crownTop, top + spec.crown.radius * 1.2); }
  if (spec.lowLimb) {
    // One long limb that leaves low and level, then turns up at its end.
    const low = spec.lowLimb, azimuth = heading + Math.PI * .5, from = centre(low.at), points: V3[] = [from], radii = [radiusAt(low.at) * low.girth];
    for (let k = 1; k <= 5; k++) {
      const s = k / 5, pitch = (s < .7 ? low.sag : mix(low.sag, low.upturn, smooth(.7, 1, s))) * DEG;
      points.push(add(points[k - 1], polar(azimuth + (k - 2.5) * .05, pitch), low.length / 5)); radii.push(radii[0] * mix(1, .35, s));
    }
    bark(wood, spec, points, radii, 6); lowRun = { from: points[0], to: points[3] };
    cluster(leaf, spec, add(points[5], [0, spec.crown.radius * .5, 0]), spec.crown.radius * .9, rand);
    cluster(leaf, spec, add(points[4], [0, spec.crown.radius * .9, 0]), spec.crown.radius * .7, rand);
  }
  return { wood, leaf, height: crownTop, radius: radiusAt(1.3), footing, lowLimb: lowRun };
}

/** One leaf blade: stalk, then a blade folded a little along its midrib, the tip sagging. */
function blade(leaf: Mesher, from: V3, dir: V3, up: V3, length: number, width: number, stalk: number, droop: number, colour: V3, tip: V3, rib: V3) {
  const side = unit(cross(dir, up)), start = add(from, dir, length * stalk);
  if (stalk > .05) leaf.flat(add(from, side, width * .05), add(from, side, -width * .05), start, up, .5, rib, rib, rib);
  const span = length * (1 - stalk), mid = add(add(start, dir, span * .45), [0, -1, 0], span * droop * .2), end = add(add(start, dir, span), [0, -1, 0], span * droop);
  const left = add(add(mid, side, width / 2), up, width * .12), right = add(add(mid, side, -width / 2), up, width * .12);
  leaf.flat(start, left, mid, up, .6, rib, colour, mix3(colour, rib, .5)); leaf.flat(start, mid, right, up, .6, rib, mix3(colour, rib, .5), colour);
  leaf.flat(left, end, mid, up, .6, colour, tip, mix3(colour, rib, .5)); leaf.flat(mid, end, right, up, .6, mix3(colour, rib, .5), tip, colour);
}

function buildHerb(spec: HerbSpec, rand: () => number) {
  const wood = new Mesher(), leaf = new Mesher(), f = spec.leaf, green = rgb(f.colour), tip = rgb(f.tip), rib = rgb(f.rib), stalk = rgb(spec.stem);
  let top = 0;
  const tops: { at: V3; out: V3 }[] = [];
  for (let s = 0; s < spec.stems; s++) {
    const a = s * 2.39996 + rand() * .6, r = spec.spread * Math.sqrt((s + .3) / spec.stems), out: V3 = [Math.cos(a), 0, Math.sin(a)];
    const height = spec.height * (.62 + .38 * rand()), lean = spec.lean * (.4 + rand() * .9) * (.4 + r / spec.spread);
    const foot: V3 = [out[0] * r, 0, out[2] * r], at = (t: number): V3 => add(add(foot, [0, 1, 0], height * t), out, lean * height * t * t);
    const points = [0, .5, 1].map(at);
    leaf.tube(points.map((p, i) => ({ at: p, ...frame(unit(sub(at(Math.min(1, i / 2 + .05)), at(Math.max(0, i / 2 - .05))))), radius: spec.stemRadius * (i === 2 ? .5 : 1), colour: scaled(stalk, i ? 1 : .7) })), 3);
    // Leaves in two ranks, in the plane the stem leans in, alternating up the stem.
    const across: V3 = [-out[2], 0, out[0]], plane = f.ranked ? across : out;
    for (let j = 0; j < f.count; j++) {
      const t = mix(f.from, 1, (j + .5) / f.count), here = at(t), tangent = unit(sub(at(Math.min(1, t + .05)), at(t - .05))), hand = j % 2 ? 1 : -1;
      const turn = f.ranked ? 0 : j * 2.39996, lateral: V3 = f.ranked ? [plane[0] * hand, 0, plane[2] * hand] : [Math.cos(a + turn), 0, Math.sin(a + turn)];
      const rise = mix(f.rise[0], f.rise[1], (j + .5) / f.count) * DEG, dir = unit(add([lateral[0] * Math.cos(rise), 0, lateral[2] * Math.cos(rise)], tangent, Math.sin(rise)));
      const up = unit(cross(cross(dir, [0, 1, 0]), dir)), length = f.length * (.7 + .3 * Math.sin(Math.PI * (j + .5) / f.count)) * (.85 + rand() * .3);
      const shade = .68 + .32 * t;
      blade(leaf, here, dir, up[1] < 0 ? scaled(up, -1) as V3 : up, length, f.width * (.85 + rand() * .3), f.stalk, f.droop, scaled(green, shade), scaled(tip, shade), scaled(rib, shade));
      top = Math.max(top, here[1] + dir[1] * length);
    }
    tops.push({ at: at(1), out }); top = Math.max(top, height);
  }
  const b = spec.bloom, colours = b.colours.map(rgb);
  for (let i = 0; i < b.count; i++) {
    const c = colours[i % colours.length], pale = colours[(i + 1) % colours.length];
    if (b.kind === 'torch') {
      // A leafless stalk straight from the ground, ending in a waxy head over a skirt of bracts.
      const a = i * 2.39996 + rand(), r = spec.spread * (.5 + .6 * rand()), foot: V3 = [Math.cos(a) * r, 0, Math.sin(a) * r], height = b.height * (.75 + .5 * rand()), head = add(foot, [0, height, 0]);
      const { u, v } = frame([0, 1, 0]);
      leaf.tube([{ at: foot, u, v, radius: spec.stemRadius * .8, colour: scaled(stalk, .8) }, { at: head, u, v, radius: spec.stemRadius * .6, colour: stalk }], 3);
      leaf.lump(add(head, [0, b.size * .7, 0]), [b.size * .55, b.size * .9, b.size * .55], c, scaled(c, .75));
      for (let k = 0; k < 6; k++) { const q = k / 6 * Math.PI * 2, o: V3 = [Math.cos(q), 0, Math.sin(q)], s: V3 = [-Math.sin(q), 0, Math.cos(q)]; leaf.flat(add(head, s, b.size * .32), add(head, s, -b.size * .32), add(add(head, o, b.size * 1.05), [0, -1, 0], b.size * .2), unit(add(o, [0, 1, 0])), .4, c, c, pale); }
      top = Math.max(top, height + b.size * 1.6);
    } else {
      // A chain of boat-shaped bracts, alternating left and right down a hanging stalk.
      const host = tops[i % tops.length], side: V3 = [-host.out[2], 0, host.out[0]], start = add(host.at, host.out, .08);
      for (let k = 0; k < b.bracts; k++) {
        const at = add(add(start, [0, -1, 0], b.size * .62 * (k + .5)), host.out, .05 * k), hand = k % 2 ? 1 : -1, o: V3 = [side[0] * hand, 0, side[2] * hand];
        const end = add(add(at, o, b.size), [0, -1, 0], b.size * .25), under = add(at, [0, -1, 0], b.size * .5);
        leaf.flat(at, end, under, unit(add(host.out, o, .4)), .3, c, pale, c); leaf.flat(at, under, end, unit(add(scaled(host.out, -1) as V3, o, .4)), .3, c, c, pale);
      }
    }
  }
  return { wood, leaf, height: top, radius: spec.spread, footing: 0, lowLimb: undefined };
}

export const PLANT_VARIANTS = 3;
/** One plant of a species. `variant` picks one of a few fixed shapes, so plants of a kind batch together. */
export function buildPlant(species: PlantSpecies, variant = 0): PlantModel {
  const spec = PLANT_SPECS[species], rand = random(spec.seed * 37 + (variant % PLANT_VARIANTS) * 613 + 11);
  const built = spec.kind === 'tree' ? buildTree(spec, rand) : buildHerb(spec, rand);
  return { species, wood: built.wood.geometry(), leaf: built.leaf.geometry(), height: built.height, radius: built.radius, footing: built.footing, lowLimb: built.lowLimb,
    triangles: { wood: built.wood.position.length / 9, leaf: built.leaf.position.length / 9 } };
}

const hash = (x: number, z: number) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
export interface PlantPlacement { wood?: THREE.Mesh; leaf: THREE.Mesh; model: PlantModel; scale: number; yaw: number }
/**
 * Shared plant shapes and their two materials for one scene; the scene owns disposal through `track`.
 * `place` roots a plant at (x, base, z) scaled to stand `height` metres tall, turned and varied by where
 * it stands, so a district builds the same every time.
 */
export function createPlantKit(track: { geometry: (g: THREE.BufferGeometry) => unknown; material: (m: THREE.Material) => unknown }) {
  const models = new Map<string, PlantModel>();
  const wood = new THREE.MeshStandardMaterial({ name: 'tree bark wood', color: '#ffffff', vertexColors: true, roughness: .92 });
  const leaf = shadeLeaves(new THREE.MeshStandardMaterial({ name: 'broadleaf foliage', color: '#ffffff', vertexColors: true, roughness: .55, side: THREE.DoubleSide }), { thin: true, transmit: .35 });
  wood.userData.impactSurface = 'wood'; leaf.userData.impactSurface = 'foliage';
  track.material(wood); track.material(leaf);
  function model(species: PlantSpecies, variant: number) {
    const key = `${species}:${variant}`;
    let value = models.get(key);
    if (!value) { value = buildPlant(species, variant); track.geometry(value.wood); track.geometry(value.leaf); models.set(key, value); }
    return value;
  }
  function place(species: PlantSpecies, parent: THREE.Object3D, x: number, base: number, z: number, height = PLANT_SPECS[species].height): PlantPlacement {
    const value = model(species, Math.floor(hash(x, z) * PLANT_VARIANTS) % PLANT_VARIANTS);
    const scale = height / value.height, yaw = hash(z + 3.1, x - 1.7) * Math.PI * 2, herb = PLANT_SPECS[species].kind === 'herb';
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, flutter: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, base, z); mesh.rotation.y = yaw; mesh.scale.setScalar(scale);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
      return treePart(mesh, x, base, z, height, flutter);
    };
    return { wood: value.triangles.wood ? make(value.wood, wood, 0) : undefined, leaf: make(value.leaf, leaf, herb ? 2.4 : 1.2), model: value, scale, yaw };
  }
  return { place, model, wood, leaf };
}
export type PlantKit = ReturnType<typeof createPlantKit>;
