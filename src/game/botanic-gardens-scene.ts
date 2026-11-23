import * as THREE from 'three';
import { treePart } from './tree-wind';
import { createSceneKit } from './scene-kit';
import { withVerticalPlaces, type VerticalPlace } from './vertical-places';
import { stageTree } from './stage-props';
import { BOTANIC_GARDENS_STAMPS } from '../data/region-stamps';
import { PALM_SPECS, type PalmSpecies } from './palm-species';
import {
  BOTANIC_EDGE, BOTANIC_EXTENT, BOTANIC_PADS, BOTANIC_RING, GAZEBO_LANDING, SWAN_ISLAND, SWAN_LAKE, SYMPHONY_LAKE,
  botanicGroundHeight as ground, buildBotanicGround, distanceToRing, inLake, lakeSpans, type GroundRibbon,
} from './botanic-gardens-ground';

export const BOTANIC_GARDENS_SPAWN = { x: 56, z: 244, yaw: 0 };
export const BOTANIC_GARDENS_BOUNDS = { ...BOTANIC_EXTENT, groundHeight: ground };
const E = BOTANIC_EDGE;
export const BOTANIC_GARDENS_MAP_ROADS = [
  { points: [{ x: E.x, z: -E.z }, { x: E.x, z: E.z }] },
  { points: [{ x: -E.x, z: E.z }, { x: E.x, z: E.z }] },
  { points: [{ x: -E.x, z: E.z }, { x: -E.x, z: -E.z }] },
  { points: [{ x: -E.x, z: -E.z }, { x: E.x, z: -E.z }] },
  { points: BOTANIC_RING },
];
const line = (...flat: number[]) => Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2], z: flat[i * 2 + 1] }));
/**
 * Footpaths, from the level plan (docs/level-reviews/botanic-gardens-plan.json). The first three are
 * its lanes between the two command posts: over the Orchid hill, down Palm Valley, through the Rain Forest.
 */
export const BOTANIC_GARDENS_PATHS: readonly { id: string; width: number; points: readonly { x: number; z: number }[] }[] = [
  { id: 'lane-hill', width: 5, points: line(56, 244, -30, 212, -34, 160, -78, 124, -120, 100, -130, 64, -124, 26, -120, -12, -112, -38, -104, -90, -96, -135, -112, -206) },
  { id: 'lane-valley', width: 6, points: line(56, 244, 24, 232, 10, 200, 8, 160, 12, 104, 12, 74, 2, 48, 12, 30, 12, 4, 6, -12, 0, -60, -4, -110, -12, -150, -12, -170, -40, -190, -50, -214, -112, -206) },
  { id: 'lane-forest', width: 5, points: line(56, 244, 104, 236, 108, 196, 112, 150, 126, 112, 136, 60, 140, 0, 118, -46, 68, -100, 40, -152, 10, -164, -12, -170) },
  { id: 'maranta', width: 4, points: line(12, 74, 36, 70, 64, 52, 56, 28) },
  { id: 'flank', width: 4, points: line(118, -46, 130, -100, 152, -140, 150, -176, 126, -190, 126, -232, 72, -244, -8, -246, -50, -214) },
  { id: 'orchid', width: 4, points: line(-30, 16, -58, 6, -80, -20, -100, -36, -112, -38) },
  { id: 'swan-lake', width: 4, points: line(-30, 212, -60, 236, -100, 238, -150, 226, -176, 190, -150, 146, -100, 140, -56, 150, -34, 160) },
];
const distanceToPaths = (x: number, z: number) => {
  let best = Infinity;
  for (const path of BOTANIC_GARDENS_PATHS) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz) - path.width / 2);
  }
  return best;
};
/** Building footprints (centre, width, depth). The map draws them and planting keeps off them. */
export const BOTANIC_GARDENS_BUILDINGS = {
  botanyCentre: { x: 66, z: 214, w: 56, d: 24 }, botanyNorth: { x: 132, z: 180, w: 24, d: 40 }, holttum: { x: 52, z: 176, w: 18, d: 14 },
  bandstand: BOTANIC_PADS.bandstand, burkill: BOTANIC_PADS.burkill, corner: BOTANIC_PADS.corner,
  coolHouse: { x: -128, z: -168, w: 36, d: 18 }, stage: { x: -12, z: -189, w: 22, d: 10 }, visitorCentre: { x: 158, z: -214, w: 50, d: 22 },
  gazebo: { x: GAZEBO_LANDING.x, z: GAZEBO_LANDING.z, w: 9, d: 9 }, waterfall: { x: -152, z: 65, w: 20, d: 8 },
} as const;
/** The north-west lawn: the practice range and the Cool House arena, kept clear of planting. */
const RANGE = { minX: -196, maxX: -106, minZ: -252, maxZ: -180 };
const PALM_PLOTS: readonly (readonly [number, number, readonly PalmSpecies[]])[] = [
  [-14, -12, ['footstool', 'sealing-wax']], [30, -28, ['royal']], [-26, -52, ['coconut', 'footstool']],
  [36, -82, ['sealing-wax', 'royal']], [-12, -104, ['footstool']], [40, -128, ['coconut', 'royal']],
];
const hash = (x: number, z: number, salt = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453; return n - Math.floor(n); };

/**
 * The Tanglin and Central cores of the Singapore Botanic Gardens, compressed to 430 m by 530 m and
 * built from the level plan as a first pass: the ground, water, buildings, paths and planting masses
 * are in place to be walked and judged, and most trees are stand-in shapes. Palms are the modelled
 * species (palm-species.ts). Named places are stylised counterparts, not surveys.
 */
export function buildBotanicGardensScene() {
  const k = createSceneKit({ look: 'nature', background: '#cfe0d6', fogNear: 300, fogFar: 1050, shadow: { extent: 290, far: 760 }, module: true });
  const { scene, box, cylinder, blob, solid, mat, sign, plant } = k;
  const grass = mat('#7f9c5c'), asphalt = mat('#5b5d5c', .9), paint = mat('#e9e4cf'), white = mat('#efe9da'), cream = mat('#e3d8bd');
  const roof = mat('#7d4f3f'), slate = mat('#59625f'), timber = mat('#7b5d45'), bark = mat('#6a5744'), rock = mat('#8f9186'), iron = mat('#3f4a47', .6, .3);
  const glass = mat('#a9cfc9', .15, .1); glass.transparent = true; glass.opacity = .38;
  const leaves = [mat('#3f6a3c'), mat('#557d43'), mat('#2f5a36'), mat('#6d8f45')], yellow = mat('#b9b54a'), ginger = [mat('#4d8040'), mat('#679647')], hedge = mat('#3c6b3b');
  const pane = mat('#5d7b78', .3, .1); pane.userData.nightWindow = true;
  const blooms = [mat('#b65aa6'), mat('#e6c64f'), mat('#d9d2e6')];
  for (const m of [...leaves, yellow, ...ginger, hedge, ...blooms]) m.userData.visualCover = true;
  const lake = k.water('#5d8f86', { choppiness: .2 }), falls = k.water('#9fc6c2', { falls: true });

  box(0, -.12, 0, 900, .2, 1000, grass);
  const B = BOTANIC_GARDENS_BUILDINGS, plaza = BOTANIC_PADS.plaza;
  const floor = (f: { x: number; z: number; w: number; d: number }, grow = 0): GroundRibbon => ({ points: [{ x: f.x - f.w / 2 - grow, z: f.z }, { x: f.x + f.w / 2 + grow, z: f.z }], width: f.d + grow * 2, color: '#cfc6ae', square: true });
  // Everything paved is one mesh draped on the ground: the ring road, then the paths over it, then the floors.
  const ribbons: GroundRibbon[] = [{ points: BOTANIC_RING, width: 11, color: '#5b5d5c' }, ...BOTANIC_GARDENS_PATHS.map(path => ({ points: path.points, width: path.width, color: '#cbbd9c' })),
    floor(plaza), floor(B.botanyCentre), floor(B.botanyNorth), floor(B.holttum), floor(B.burkill, 2.5), floor(B.corner, 2.5), floor(B.coolHouse), floor(B.visitorCentre, 1), floor({ ...B.stage, z: B.stage.z + 2, d: B.stage.d + 4 }),
    floor({ ...B.bandstand, w: 12.4, d: 12.4 }), floor({ ...B.gazebo, w: 8, d: 8 }), floor({ x: 56, z: 243, w: 100, d: 12 })];
  const terrain = buildBotanicGround(ribbons); scene.add(terrain.mesh, terrain.paths);
  k.freeform(() => {
    for (const x of [-E.x, E.x]) { box(x, 0, 0, 12, .12, E.z * 2 + 12, asphalt); for (let z = -E.z + 6; z < E.z; z += 12) box(x, .075, z, .2, .03, 5, paint); }
    for (const z of [-E.z, E.z]) { box(0, 0, z, E.x * 2 - 12, .12, 12, asphalt); for (let x = -E.x + 12; x < E.x - 6; x += 12) box(x, .075, z, 5, .03, .2, paint); }
  });

  // Water. The drawn lake is an ellipse; its collision is rows of rectangles parted around the land in it.
  const disc = k.geo(new THREE.CylinderGeometry(1, 1, 1, 48));
  for (const body of [SWAN_LAKE, SYMPHONY_LAKE]) {
    const mesh = new THREE.Mesh(disc, lake); mesh.position.set(body.cx, .04, body.cz); mesh.scale.set(body.rx, .08, body.rz); mesh.receiveShadow = true; scene.add(mesh);
    for (const span of lakeSpans(body)) k.obstacles.push({ ...span, maxY: .2 });
  }

  const post = (x: number, z: number, base: number, height: number, size: number, material: THREE.Material) => { box(x, base + height / 2, z, size, height, size, material, scene, true); solid(x, z, size, size); };
  /** A wall along x or z from `from` to `to`, left open at each door (a share of its length). */
  function wall(axis: 'x' | 'z', fixed: number, from: number, to: number, base: number, height: number, material: THREE.Material, doors: readonly number[] = [], doorWidth = 3.4) {
    let runs: [number, number][] = [[from, to]];
    for (const door of doors) { const c = from + (to - from) * door; runs = runs.flatMap(([a, b]) => [[a, Math.min(b, c - doorWidth / 2)], [Math.max(a, c + doorWidth / 2), b]].filter(([p, q]) => q - p > .3) as [number, number][]); }
    for (const [a, b] of runs) {
      const x = axis === 'x' ? (a + b) / 2 : fixed, z = axis === 'x' ? fixed : (a + b) / 2, w = axis === 'x' ? b - a : .4, d = axis === 'x' ? .4 : b - a;
      box(x, base + height / 2, z, w, height, d, material, scene, true); solid(x, z, w, d);
    }
  }
  type Doors = { n?: readonly number[]; s?: readonly number[]; e?: readonly number[]; w?: readonly number[] };
  function room(f: { x: number; z: number; w: number; d: number }, base: number, height: number, material: THREE.Material, doors: Doors) {
    wall('x', f.z - f.d / 2, f.x - f.w / 2, f.x + f.w / 2, base, height, material, doors.n);
    wall('x', f.z + f.d / 2, f.x - f.w / 2, f.x + f.w / 2, base, height, material, doors.s);
    wall('z', f.x - f.w / 2, f.z - f.d / 2, f.z + f.d / 2, base, height, material, doors.w);
    wall('z', f.x + f.w / 2, f.z - f.d / 2, f.z + f.d / 2, base, height, material, doors.e);
  }
  /** Two slopes meeting at a ridge along the longer side. */
  function pitched(f: { x: number; z: number; w: number; d: number }, eaves: number, material: THREE.Material, rise = 2.2, overhang = 1.4) {
    k.freeform(() => {
      const alongX = f.w >= f.d, span = (alongX ? f.d : f.w) / 2 + overhang, length = (alongX ? f.w : f.d) + overhang * 2, angle = Math.atan2(rise, span);
      for (const side of [-1, 1]) {
        const slope = box(f.x + (alongX ? 0 : side * span / 2), eaves + rise / 2, f.z + (alongX ? side * span / 2 : 0), alongX ? length : Math.hypot(span, rise), .25, alongX ? Math.hypot(span, rise) : length, material, scene, true);
        if (alongX) slope.rotation.x = side * angle; else slope.rotation.z = -side * angle;
      }
    });
  }
  /** An open, roofed pavilion on a ring of posts. */
  function pavilion(x: number, z: number, radius: number, posts: number, height: number) {
    const base = ground(x, z);
    k.freeform(() => {
      for (let i = 0; i < posts; i++) { const a = (i + .5) / posts * Math.PI * 2; post(x + Math.cos(a) * radius, z + Math.sin(a) * radius, base, height, .3, white); }
      cylinder(x, base + height + .15, z, radius + 1.3, .3, roof); cylinder(x, base + height + .6, z, radius * .6, .6, roof); cylinder(x, base + height + 1.2, z, radius * .22, .7, white);
    });
  }

  // Tanglin Gate: the Botany Centre is two raised blocks over an open ground-floor arcade.
  for (const f of [B.botanyCentre, B.botanyNorth]) {
    const alongX = f.w >= f.d, length = alongX ? f.w : f.d, breadth = alongX ? f.d : f.w, bays = Math.round(length / 8);
    for (let i = 0; i <= bays; i++) for (const side of [-1, 1]) {
      const along = -length / 2 + .6 + (length - 1.2) * i / bays, across = side * (breadth / 2 - .6);
      post(f.x + (alongX ? along : across), f.z + (alongX ? across : along), 0, 3.6, .6, cream);
    }
    box(f.x, 5.6, f.z, f.w, 4, f.d, cream, scene, true);
    for (let i = 0; i < bays; i++) for (const side of [-1, 1]) { const along = -length / 2 + (i + .5) * length / bays, across = side * (breadth / 2 + .05); box(f.x + (alongX ? along : across), 5.7, f.z + (alongX ? across : along), alongX ? 5 : .2, 2, alongX ? .2 : 5, pane); } box(f.x, 7.75, f.z, f.w + 1.6, .3, f.d + 1.6, slate, scene, true);
    box(f.x, 1.8, f.z, alongX ? 8 : 6, 3.6, alongX ? 6 : 8, slate); solid(f.x, f.z, alongX ? 8 : 6, alongX ? 6 : 8);
  }
  room(B.holttum, 0, 3.3, white, { s: [.5], n: [.5], e: [.5] });
  box(B.holttum.x, 4.95, B.holttum.z, B.holttum.w, 3.3, B.holttum.d, white, scene, true); pitched(B.holttum, 6.6, roof);
  for (const x of [38, 74]) post(x, 250, 0, 3.2, 1.2, cream);
  for (const [x, z] of [[20, 240], [32, 252], [80, 240], [92, 252]] as const) { k.palm('footstool', x, z, 6 + hash(x, z) * 2); solid(x, z, .5, .5); }
  sign('SINGAPORE BOTANIC GARDENS · TANGLIN GATE', 56, 4.4, 250.7, 34, 2, '#2f5a45');

  // The Bandstand on its hill, ringed by yellow-leaved rain trees, and the gazebo on Swan Lake.
  pavilion(B.bandstand.x, B.bandstand.z, 5.4, 8, 3.4); pavilion(B.gazebo.x, B.gazebo.z, 3.2, 6, 2.8);

  // The two black-and-white houses: walled ground floor, open upper verandah under the roof, one outside stair.
  const places: VerticalPlace[] = [];
  function villa(id: string, name: string, f: { x: number; z: number; w: number; d: number; y: number }, stairX: number) {
    const base = f.y, deck = base + 3.3, verandah = { x: f.x, z: f.z, w: f.w + 5, d: f.d + 5 };
    room(f, base, 3, white, { s: [.5], n: [.5], e: [.5], w: [.5] });
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
      const x = f.x + sx * (verandah.w / 2 - .5), z = f.z + sz * (verandah.d / 2 - .5);
      box(x, deck + 1.5, z, .3, 3, .3, iron); k.obstacles.push({ minX: x - .15, maxX: x + .15, minZ: z - .15, maxZ: z + .15, minY: deck, maxY: deck + 3 });
    }
    pitched(verandah, deck + 3, roof, 2.6, .8);
    const foot = f.z + verandah.d / 2 + 9.5, head = f.z + verandah.d / 2;
    places.push({ id, name, note: 'Authored upper verandah and stair; storey height and stair position are not surveyed.',
      floors: [{ id: 'verandah', x: f.x, z: f.z, y: deck, width: verandah.w, depth: verandah.d, color: '#d9d0b8' }],
      connections: [{ id: 'stair', from: { x: f.x + stairX, z: foot, y: ground(f.x + stairX, foot) }, to: { x: f.x + stairX, z: head, y: deck }, width: 3, stairs: true, color: '#d9d0b8' }] });
  }
  villa('burkill-hall', 'Burkill Hall verandah', BOTANIC_PADS.burkill, 7); villa('corner-house', 'Corner House verandah', BOTANIC_PADS.corner, -6);

  // Orchid Plaza: the paved saddle at the head of Palm Valley, with its clock tower and fountain.
    post(30, 10, plaza.y, 9, 1.6, cream); box(30, plaza.y + 9.4, 10, 2.2, .8, 2.2, slate, scene, true);
  k.freeform(() => { cylinder(-6, plaza.y + .3, 14, 3, .6, rock); const pool = cylinder(-6, plaza.y + .62, 14, 2.6, .06, lake); pool.castShadow = false; }); solid(-6, 14, 6, 6);
  sign('NATIONAL ORCHID GARDEN', -30, plaza.y + 4, 8, 22, 1.8, '#5a3f66'); sign('PALM VALLEY', 34, plaza.y + 3, 2.2, 9, 1.2, '#2f5a45');

  // The Cool House: a glasshouse with a door at each end.
  const cool = B.coolHouse, coolBase = ground(cool.x, cool.z);
  room(cool, coolBase, 5, glass, { w: [.5], e: [.5] }); pitched(cool, coolBase + 5, glass, 2.4, .4);
  for (let i = 0; i <= 6; i++) for (const side of [-1, 1]) box(cool.x - cool.w / 2 + cool.w * i / 6, coolBase + 2.5, cool.z + side * cool.d / 2, .25, 5, .5, iron);

  // The Symphony Stage on its islet: an open shell facing south up the valley.
  const stage = B.stage, stageBase = ground(stage.x, stage.z);
  wall('x', stage.z - stage.d / 2, stage.x - stage.w / 2, stage.x + stage.w / 2, stageBase, 5.4, white);
  for (const side of [-1, 1]) wall('z', stage.x + side * stage.w / 2, stage.z - stage.d / 2, stage.z, stageBase, 5.4, white);
  k.freeform(() => { const shell = box(stage.x, stageBase + 6.2, stage.z + 1.5, stage.w + 2, .3, stage.d + 5, white, scene, true); shell.rotation.x = -.16; });
  for (const side of [-1, 1]) post(stage.x + side * (stage.w / 2 - .4), stage.z + stage.d / 2 + 2, stageBase, 6.6, .4, iron);
  sign('SHAW FOUNDATION SYMPHONY STAGE', stage.x, stageBase + 4.2, stage.z - stage.d / 2 + .5, 18, 1.4, '#39524c');

  // Nassim Gate: a long roof on columns over an open concourse, with two kiosks under it.
  const visitor = B.visitorCentre;
  for (let i = 0; i <= 6; i++) for (const side of [-1, 1]) post(visitor.x - visitor.w / 2 + 1 + (visitor.w - 2) * i / 6, visitor.z + side * (visitor.d / 2 - 1), 0, 5, .5, cream);
  box(visitor.x, 5.2, visitor.z, visitor.w + 3, .4, visitor.d + 3, slate, scene, true);
  for (const dx of [-13, 13]) { box(visitor.x + dx, 1.6, visitor.z, 8, 3.2, 6, timber, scene, true); solid(visitor.x + dx, visitor.z, 8, 6); }
  sign('NASSIM GATE VISITOR CENTRE', visitor.x, 6.4, visitor.z + visitor.d / 2 + 1.6, 26, 1.8, '#2f5a45');

  // The Ginger Garden's waterfall: a rock wall, a curtain of water in front of it and a way through behind the water.
  const fall = B.waterfall;
  box(fall.x, 2.5, fall.z - 3, fall.w, 5, 2, rock, scene, true); solid(fall.x, fall.z - 3, fall.w, 2);
  box(fall.x, 5.2, fall.z - .5, fall.w, .6, 7, rock, scene, true);
  k.freeform(() => { box(fall.x, 2.45, fall.z + 2.2, fall.w - 4, 4.9, .12, falls); box(fall.x, .06, fall.z + 5.5, fall.w - 2, .1, 6, lake); });

  // Planting. `clear` is every place a trunk may not stand.
  const footprints = Object.values(B);
  const valleyFloor = (x: number, z: number) => { const t = (8 - z) / 158; return z < 44 && z > -168 && x > -44 - 20 * Math.max(0, t) && x < 60 + 20 * Math.max(0, t); };
  const inForest = (x: number, z: number) => x > 86 && x < 197 && Math.abs(z) < 108;
  function clear(x: number, z: number, margin = 0) {
    if (Math.abs(x) > E.x - 11 - margin || Math.abs(z) > E.z - 11 - margin || distanceToRing(x, z) < 10 + margin || distanceToPaths(x, z) < 2.5 + margin) return false;
    if (inLake(SWAN_LAKE, x, z, 4 + margin) || inLake(SYMPHONY_LAKE, x, z, 4 + margin)) return false;
    if (x > RANGE.minX && x < RANGE.maxX && z > RANGE.minZ && z < RANGE.maxZ) return false;
    if (footprints.some(f => Math.abs(x - f.x) < f.w / 2 + 5 + margin && Math.abs(z - f.z) < f.d / 2 + 5 + margin)) return false;
    if (Math.abs(x - plaza.x) < plaza.w / 2 + 2 && Math.abs(z - plaza.z) < plaza.d / 2 + 2 || x > -10 && x < 122 && z > 234) return false;
    return !BOTANIC_GARDENS_STAMPS.some(stamp => Math.hypot(x - stamp.x, z - stamp.z) < 7 + margin);
  }
  /** A stand-in tree: a trunk that stops rounds and a crown that only hides. */
  function tree(x: number, z: number, height: number, trunk: THREE.Material, leaf: THREE.Material, spread = 1, girth = .6) {
    const base = ground(x, z);
    treePart(box(x, base + height / 2, z, girth, height, girth, trunk, scene, true), x, base, z, height); solid(x, z, girth + .2, girth + .2);
    for (let i = 0; i < 3; i++) treePart(blob(x + (i - 1) * 1.7 * spread, base + height + i % 2, z + (i - 1) * .6 * spread, 3.6 * spread, 2.5 * spread, 3.5 * spread, leaf), x, base, z, height, 1);
  }
  // Rain Forest: a closed canopy on the ridge, with emergents on buttress roots and two clearings.
  const clearings = [{ x: 150, z: 62 }, { x: 132, z: -52 }];
  for (let x = 90; x <= 194; x += 11) for (let z = -104; z <= 104; z += 11) {
    const px = x + (hash(x, z) - .5) * 6, pz = z + (hash(x, z, 1) - .5) * 6;
    if (!clear(px, pz, 1) || clearings.some(c => Math.hypot(px - c.x, pz - c.z) < 11)) continue;
    // One tree in six is an emergent Jelawai Jaha on plank buttresses; the buttresses are part of what stops a round.
    if (hash(x, z, 2) > .83) { const giant = plant('jelawai-jaha', px, pz, 25 + hash(x, z, 3) * 6); solid(px, pz, giant.model.footing * giant.scale * 1.1, giant.model.footing * giant.scale * 1.1); continue; }
    tree(px, pz, 11 + hash(x, z, 3) * 7, bark, leaves[Math.floor(hash(x, z, 4) * 3)], 1.35, .7);
  }
  // Lawn and garden trees everywhere else, off the valley floor, which stays open between the palm plots.
  for (let x = -190; x <= 190; x += 21) for (let z = -236; z <= 236; z += 21) {
    const px = x + (hash(x, z, 5) - .5) * 12, pz = z + (hash(x, z, 6) - .5) * 12;
    if (hash(x, z, 7) < .42 || inForest(px, pz) || valleyFloor(px, pz) || !clear(px, pz, 2) || Math.hypot(px + 1, pz - 89) < 24 || Math.hypot(px + 8, pz - 168) < 22) continue;
    // Half the lawn trees are Tembusu; the rest are still stand-ins.
    if (hash(x, z, 9) < .5) { const t = plant('tembusu', px, pz, 11 + hash(x, z, 8) * 6); solid(px, pz, t.model.radius * t.scale * 2.2, t.model.radius * t.scale * 2.2); continue; }
    tree(px, pz, 8 + hash(x, z, 8) * 6, bark, leaves[Math.floor(hash(x, z, 9) * 4)], 1.2 + hash(x, z, 10) * .5);
  }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .2, x = -1 + Math.cos(a) * 16, z = 89 + Math.sin(a) * 15; if (clear(x, z)) tree(x, z, 8.5, bark, yellow, 1.5); }
  // The heritage Tembusu on Lawn E: 20 m tall, 5 m in girth, with its long low limb (Heritage Tree register HT 2001-26).
  const tembusu = { x: -8, z: 168 }, lawn = ground(tembusu.x, tembusu.z), heritage = plant('tembusu-heritage', tembusu.x, tembusu.z, 20, lawn);
  solid(tembusu.x, tembusu.z, 2.2, 2.2);
  // Broadleaf crowns hide a figure and are not hard cover, like every other crown here.
  (heritage.leaf.material as THREE.Material).userData.visualCover = true;
  const limb = heritage.model.lowLimb;
  if (limb) {
    // The limb is turned and scaled with the tree, so its collider is read off the placed model.
    const turn = (q: readonly number[]) => ({ x: tembusu.x + (q[0] * Math.cos(heritage.yaw) + q[2] * Math.sin(heritage.yaw)) * heritage.scale, y: lawn + q[1] * heritage.scale, z: tembusu.z + (-q[0] * Math.sin(heritage.yaw) + q[2] * Math.cos(heritage.yaw)) * heritage.scale });
    const from = turn(limb.from), to = turn(limb.to);
    for (let i = 0; i < 4; i++) {
      const x = from.x + (to.x - from.x) * (i + .5) / 4, z = from.z + (to.z - from.z) * (i + .5) / 4, y = from.y + (to.y - from.y) * (i + .5) / 4;
      k.obstacles.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, minY: y - .5, maxY: y + .5 });
    }
  }

  // Palm Valley: island beds of palms on the open lawn, one mix of species to a bed.
  for (const [x, z, mix] of PALM_PLOTS) {
    k.freeform(() => { const bed = cylinder(x, ground(x, z) + .06, z, 7, .12, hedge); bed.castShadow = false; });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + hash(x, z), r = i ? 3 + hash(x, z, i) * 2.6 : 0, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, species = mix[i % mix.length];
      k.palm(species, px, pz, PALM_SPECS[species].height * (.78 + hash(px, pz) * .4), ground(px, pz)); solid(px, pz, species === 'sealing-wax' ? 1.2 : .5, species === 'sealing-wax' ? 1.2 : .5);
    }
  }
  // Sealing wax palms, the palm of the Gardens' logo, by the water and at the Orchid Garden gate.
  for (const [x, z] of [[46, -166], [60, -170], [-34, 22], [-36, 8], [-62, 146], [-140, 150]] as const) { k.palm('sealing-wax', x, z, 5 + hash(x, z) * 1.6, ground(x, z)); solid(x, z, 1.2, 1.2); }
  // Nibong, the native clustering palm with spined trunks, on Swan Lake's island and at its shore.
  const island = SWAN_ISLAND;
  for (const [x, z, h] of [[island.x, island.z, 12], [island.x + 4, island.z - 3, 9.5], [-166, 214, 10.5], [-44, 222, 10]] as const) { k.palm('nibong', x, z, h, ground(x, z)); if (x !== island.x + 4) solid(x, z, 2, 2); }

  // Ginger Garden: head-high clumps that hide a standing figure and stop nothing.
  for (let x = -178; x <= -90; x += 7) for (let z = 74; z <= 122; z += 7) {
    const px = x + (hash(x, z, 11) - .5) * 3, pz = z + (hash(x, z, 12) - .5) * 3;
    if (hash(x, z, 13) < .25 || distanceToPaths(px, pz) < 2 || !clear(px, pz, -2)) continue;
    // Torch ginger clumps, taller than a standing figure, with a few stand-in masses left between them.
    if (hash(x, z, 14) < .7) { plant('torch-ginger', px, pz, 2.6 + hash(x, z, 15) * 1.2, ground(px, pz)); continue; }
    const m = ginger[Math.floor(hash(x, z, 14) * 2)]; blob(px, 1.1, pz, 1.7, 1.5, 1.7, m); blob(px + .5, 1.9, pz - .4, 1.2, 1.1, 1.2, m);
  }
  // The Heliwalk: hanging heliconias in drifts along the east rim of Palm Valley.
  for (let z = -6; z >= -140; z -= 5.5) for (const row of [0, 1]) {
    const t = (8 - z) / 158, x = 62 + 20 * t + row * 2.6 + (hash(z, row, 16) - .5) * 1.6, pz = z + (hash(z, row, 17) - .5) * 2;
    if (hash(z, row, 18) < .25 || distanceToPaths(x, pz) < 1.5 || distanceToRing(x, pz) < 8) continue;
    plant('heliconia', x, pz, 1.5 + hash(z, row, 19) * .5, ground(x, pz));
  }
  // National Orchid Garden: trellis arches over the path up the hill, flower beds beside it and hedged rooms on the middle terrace.
  const orchid = BOTANIC_GARDENS_PATHS.find(path => path.id === 'orchid')!.points;
  for (let s = 1; s < orchid.length; s++) {
    const a = orchid[s - 1], b = orchid[s], length = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
    for (let d = 3; d < length - 2; d += 6) {
      const x = a.x + (b.x - a.x) * d / length, z = a.z + (b.z - a.z) * d / length, feet = [-1, 1].map(side => new THREE.Vector3(x + nx * side * 2.6, 0, z + nz * side * 2.6));
      feet.forEach(p => { p.y = ground(p.x, p.z); post(p.x, p.z, p.y, 2.9, .2, iron); });
      k.freeform(() => k.beam(feet[0].clone().setY(feet[0].y + 2.9), feet[1].clone().setY(feet[1].y + 2.9), .1, iron));
      feet.forEach((p, i) => blob(p.x + nx * (i ? 1.3 : -1.3), p.y + .35, p.z + nz * (i ? 1.3 : -1.3), .7, .4, .7, blooms[Math.floor(hash(x, z, i) * 3)]));
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = -125 + Math.cos(a) * 78 * .51, z = -50 + Math.sin(a) * 72 * .51, alongX = Math.abs(Math.sin(a)) > .7;
    if (distanceToPaths(x, z) < 6 || !clear(x, z)) continue;
    box(x, ground(x, z) + .9, z, alongX ? 9 : 1.2, 1.8, alongX ? 1.2 : 9, hedge, scene, true); solid(x, z, alongX ? 9 : 1.2, alongX ? 1.2 : 9);
  }
  // Secret Ravine: rock walls either side of the path down to the Cool House.
  for (let z = -96; z >= -132; z -= 6) for (const side of [-1, 1]) {
    const x = -104 + (z + 90) * -.18 + side * 6.5; if (distanceToPaths(x, z) < 2.5) continue;
    blob(x, ground(x, z) + 1.4, z, 3, 2.6 + hash(x, z) * 1.2, 3.2, rock); solid(x, z, 4, 4);
  }
  // Evolution Garden: petrified trunks, cycads and tree ferns along the north edge.
  for (let i = 0; i < 9; i++) {
    const x = 84 + i * 12.5, z = -236 - hash(i, 3) * 8;
    if (!clear(x, z)) continue;
    k.freeform(() => {
      if (i % 3 === 0) { cylinder(x, 1.6, z, .45, 3.2, rock); solid(x, z, .9, .9); }
      else if (i % 3 === 1) { cylinder(x, .6, z, .32, 1.2, bark); blob(x, 1.5, z, 1.9, .5, 1.9, leaves[2]); solid(x, z, .7, .7); }
      else { cylinder(x, 1.7, z, .16, 3.4, bark); blob(x, 3.5, z, 2.4, .45, 2.4, leaves[1]); solid(x, z, .4, .4); }
    });
  }
  sign('RAIN FOREST', 96, ground(96, 44) + 3.6, 47, 12, 1.6, '#2f5a45');

  // Levolution (docs/LEVOLUTION.md): a tree on the north-west lawn comes down north across the open ground in front of the Cool House.
  stageTree(k, 'lawn-tree', -146, -196, Math.PI, 12);
  const car = k.car(mat('#93a886'), mat('#789c9c', .3, .2), white, mat('#3a403e')), stamps = k.stampRings(BOTANIC_GARDENS_STAMPS, mat('#eda047'));
  stamps.forEach((stamp, i) => { stamp.userData.baseY = ground(BOTANIC_GARDENS_STAMPS[i].x, BOTANIC_GARDENS_STAMPS[i].z); });
  // No reviewed photograph informed this geometry: positions come from the official visitor map and NParks pages, heights are authored.
  scene.userData.referenceFeatures = [];
  scene.userData.districtFeatures = ['graded-hills-and-valley', 'swan-lake', 'symphony-lake-stage', 'bandstand', 'palm-valley-species-beds', 'rain-forest-ridge', 'orchid-terraces', 'ginger-garden-waterfall', 'black-and-white-verandahs', 'cool-house'];
  const world = withVerticalPlaces(k.finish({ car, stamps, animate: () => stamps.forEach(stamp => { stamp.position.y += stamp.userData.baseY; }) }), places);
  const dispose = world.dispose;
  world.dispose = () => { terrain.dispose(); dispose(); };
  return world;
}
