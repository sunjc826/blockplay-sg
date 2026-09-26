import * as THREE from 'three';
import { TUAS_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';
import { withVerticalRoutes } from './vertical-routes';

// On the verge between the tank farm and the plant road, looking west.
export const TUAS_SPAWN = { x: -70, z: 18, yaw: Math.PI / 2 };
export const TUAS_BOUNDS = { minX: -280, maxX: 260, minZ: -215, maxZ: 215 };
export { TUAS_STAMPS } from '../data/region-stamps.ts';

/** Industrial blocks are large, so the grid is coarse: two roads each way. */
const EW_ROADS = [-110, 30], NS_ROADS = [-130, 40];
const EDGE_X = 235, EDGE_Z = 185;
/** The strait sits outside the perimeter loop, so no street runs into it. */
const SEA = { minX: -280, maxX: -248 };
/** The dock is a hole in the ground: a collider, with the vessel inside it. */
const DOCK = { x: -182, z: -40, width: 56, depth: 96 };
export const TUAS_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Tuas industrial west: a tank
 * farm behind its bunds, a process plant of columns and pipe racks under a
 * flare, a dry dock with a hull in it, automated container stacks, and the
 * coast road along the strait. Compressed for play; see docs/WEST-DISTRICT-REVIEW.md for researched
 * corrections. Lower station elevation and industrial streetscape Street View are reviewed.
 */
export function buildTuasScene() {
  const kit = createSceneKit({
    background: '#c6ced3', fogNear: 300, fogFar: 940,
    sun: { x: 160, y: 205, z: -90 }, shadow: { extent: 270, far: 700 },
    hemisphere: { sky: '#eef4f7', ground: '#7a776c', intensity: 1.75 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#4f5558'), white = mat('#e6e4d6'), paving = mat('#b0aca0'), kerb = mat('#c4bfb2');
  const sea = mat('#3d7b90', 0.42), shallow = mat('#549aad', 0.38), gravel = mat('#9a958a');
  // Shots into these splash rather than spark; see water.ts.
  markWater(sea, shallow);
  const concrete = mat('#a8a79e'), pale = mat('#dcd6c8'), stone = mat('#b0afa6'), dark = mat('#333e44');
  const steel = mat('#9ba4a8', 0.32, 0.6), galv = mat('#b9c0c2', 0.3, 0.7), tank = mat('#d8d6cc', 0.5, 0.25);
  const rust = mat('#a05a38'), safety = mat('#d8a02a'), hazard = mat('#c4472e'), pipe = mat('#8e9698', 0.36, 0.55);
  const glass = mat('#6d90a0', 0.24, 0.3), hull = mat('#2b4652'), boot = mat('#8c3a2c'), deck = mat('#cfc9b8');
  const orange = mat('#f0a044'), skin = mat('#b18c71'), wood = mat('#7b6148'), leaf = mat('#4a7040');
  const boxes = ['#a8563a', '#2f6b78', '#4f7a45', '#93938a', '#b08a3a', '#7a5c86'].map(color => mat(color));

  box(0, -0.6, 0, 600, 1, 500, gravel);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // The strait, beyond the coast road, with a quay edge on the landward side.
  box((SEA.minX + SEA.maxX) / 2, -0.06, 0, SEA.maxX - SEA.minX, 0.4, 460, sea);
  solid((SEA.minX + SEA.maxX) / 2, 0, SEA.maxX - SEA.minX, 460);
  box(SEA.maxX + 3, 0.7, 0, 6, 1.4, 460, concrete);
  for (let z = -210; z <= 210; z += 14) { cylinder(SEA.maxX + 5.4, 1.3, z, 0.55, 1.6, dark); solid(SEA.maxX + 5.4, z, 1.3, 1.3); }
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 26; i++) {
    const ripple = box(SEA.minX + 6 + (i * 19) % 24, 0.16, -206 + (i * 37) % 412, 8 + i % 4, 0.02, 0.22, shallow);
    ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
  }

  /** Storage tank: a shell in plate courses, a domed top and a spiral stair. */
  function storageTank(x: number, z: number, radius: number, height: number) {
    cylinder(x, height / 2, z, radius, height, tank); solid(x, z, radius * 2, radius * 2);
    for (let course = 1; course * 4 < height; course++) cylinder(x, course * 4, z, radius + 0.12, 0.3, steel);
    cylinder(x, height + 0.4, z, radius + 0.5, 0.8, galv);
    const cap = new THREE.Mesh(geo(new THREE.SphereGeometry(radius, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.6)), tank);
    cap.position.set(x, height + 0.6, z); cap.castShadow = true; scene.add(cap);
    // Spiral stair wrapping the shell, with a landing at the top.
    for (let n = 0; n < 26; n++) {
      const angle = n * 0.34, y = n * height / 26;
      const tread = box(x + Math.cos(angle) * (radius + 1.1), y, z + Math.sin(angle) * (radius + 1.1), 2.2, 0.18, 1.1, galv);
      tread.rotation.y = -angle;
      if (n % 3 === 0) cylinder(x + Math.cos(angle) * (radius + 2), y / 2, z + Math.sin(angle) * (radius + 2), 0.1, y, galv);
    }
    for (let n = 0; n < 10; n++) {
      const angle = n * 0.3 + 0.2;
      box(x + Math.cos(angle) * (radius - 1), height + 1.4, z + Math.sin(angle) * (radius - 1), 2.4, 0.12, 0.8, galv);
    }
    for (const dy of [0.6, height * 0.5]) box(x + radius + 0.4, dy + 1.2, z, 0.5, 1.2, 1.2, safety);
  }

  /** Bund: a low wall around a tank group. Drawn only — the tanks collide. */
  function bund(x: number, z: number, width: number, depth: number) {
    for (const side of [-1, 1]) {
      box(x, 1.1, z + side * depth / 2, width, 2.2, 1.4, concrete);
      box(x + side * width / 2, 1.1, z, 1.4, 2.2, depth, concrete);
    }
    for (const side of [-1, 1]) box(x, 2.3, z + side * depth / 2, width, 0.3, 2, stone);
  }

  /** Distillation column: a slim vessel ringed with platforms and a cage ladder. */
  function column(x: number, z: number, radius: number, height: number) {
    cylinder(x, height / 2, z, radius, height, pale); solid(x, z, radius * 2.4, radius * 2.4);
    const top = new THREE.Mesh(geo(new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), pale);
    top.position.set(x, height, z); scene.add(top);
    for (let level = 1; level * 9 < height; level++) {
      const y = level * 9;
      cylinder(x, y, z, radius + 1.6, 0.25, galv);
      for (let n = 0; n < 10; n++) { const angle = n * 0.63; cylinder(x + Math.cos(angle) * (radius + 1.5), y + 0.7, z + Math.sin(angle) * (radius + 1.5), 0.07, 1.3, galv); }
      box(x + radius + 1, y + 0.7, z, 0.6, 1.4, 0.6, safety);
    }
    for (let y = 1; y < height; y += 1.4) box(x - radius - 0.8, y, z, 1.2, 0.12, 0.7, galv);
    for (let y = 2; y < height; y += 6) box(x - radius - 1.2, y, z, 0.12, 1.4, 1.6, galv);
  }

  /** Pipe rack: trestles carrying bundles, with an expansion loop midway. */
  function pipeRack(fromX: number, toX: number, z: number) {
    for (let x = fromX; x <= toX; x += 18) {
      if (NS_ROADS.some(road => Math.abs(x - road) < 20)) continue;
      for (const dz of [-4, 4]) { cylinder(x, 5, z + dz, 0.5, 10, steel); solid(x, z + dz, 1.2, 1.2); }
      box(x, 10.2, z, 1.4, 0.6, 9.6, steel);
      box(x, 6.4, z, 1, 0.5, 9.6, steel);
    }
    for (const dz of [-3.2, -1, 1.2, 3.4]) {
      const r = 0.3 + Math.abs(dz) * 0.06;
      cylinder((fromX + toX) / 2, 10.9, z + dz, r, toX - fromX, [pipe, galv, rust, pipe][Math.abs(Math.round(dz)) % 4]).rotation.z = Math.PI / 2;
      cylinder((fromX + toX) / 2, 7, z + dz, r * 0.8, toX - fromX, pipe).rotation.z = Math.PI / 2;
    }
    // Expansion loop: the bundle steps up and back before carrying on.
    const loop = (fromX + toX) / 2 + 30;
    for (const dz of [-3.2, -1, 1.2, 3.4]) {
      for (const dy of [0, 3.4]) cylinder(loop, 10.9 + dy, z + dz, 0.3, 9, pipe).rotation.z = Math.PI / 2;
      for (const dx of [-4.5, 4.5]) cylinder(loop + dx, 12.6, z + dz, 0.3, 3.4, pipe);
    }
  }

  /** Flare: a lattice mast with a tip, guyed, burning a small plume. */
  function flareStack(x: number, z: number) {
    for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) cylinder(x + dx, 28, z + dz, 0.4, 56, steel);
    for (let y = 5; y < 56; y += 5) {
      for (const dx of [-2.6, 2.6]) box(x + dx, y, z, 0.32, 0.32, 5.4, steel);
      for (const dz of [-2.6, 2.6]) box(x, y, z + dz, 5.4, 0.32, 0.32, steel);
      const brace = box(x, y + 2.5, z + 2.6, 5.4, 0.28, 0.28, steel); brace.rotation.z = 0.7;
    }
    solid(x, z, 7, 7);
    cylinder(x, 58, z, 1.1, 8, rust);
    cylinder(x, 63, z, 1.6, 2.4, hazard);
    for (let i = 0; i < 3; i++) blob(x, 65 + i * 1.6, z, 1.5 - i * 0.35, 1.9 - i * 0.4, 1.5 - i * 0.35, i ? safety : hazard);
    for (const angle of [0.4, 2.5, 4.6]) beam(new THREE.Vector3(x, 48, z), new THREE.Vector3(x + Math.cos(angle) * 26, 0.5, z + Math.sin(angle) * 26), 0.12, galv);
  }

  /** Dry dock: a stepped pit with a hull sitting on blocks inside it. */
  function dryDock() {
    const { x, z, width, depth } = DOCK;
    box(x, 0.12, z, width + 26, 0.3, depth + 26, concrete);
    solid(x, z, width, depth);
    for (let step = 0; step < 4; step++) {
      const w = width - step * 6, d = depth - step * 6;
      for (const side of [-1, 1]) {
        box(x, -0.4 - step * 1.4, z + side * d / 2, w, 1.4, 3, step % 2 ? concrete : stone);
        box(x + side * w / 2, -0.4 - step * 1.4, z, 3, 1.4, d, step % 2 ? concrete : stone);
      }
    }
    box(x, -5.4, z, width - 22, 1.2, depth - 22, stone);
    // Hull on keel blocks, boot-topping showing where the waterline sits.
    for (let dz = -34; dz <= 34; dz += 8) box(x, -4.2, z + dz, 12, 1.6, 3.4, concrete);
    box(x, 0.4, z, 26, 9, 74, hull, scene, true);
    for (const end of [-1, 1]) { const bow = box(x, 0.4, z + end * 39, 18, 8.4, 12, hull, scene, true); bow.rotation.y = end * 0.2; }
    box(x, -2.6, z, 26.6, 3, 76, boot);
    box(x, 5.2, z, 27, 1.4, 76, deck);
    box(x - 1, 11, z - 22, 16, 10, 20, deck, scene, true);
    for (let y = 8; y < 15; y += 2.6) for (let dx = -6; dx <= 6; dx += 4) box(x - 1 + dx, y, z - 32.2, 3, 1.4, 0.5, glass);
    cylinder(x - 1, 19, z - 22, 2.2, 6, rust);
    for (const dz of [-6, 12]) { cylinder(x, 11, z + dz, 0.8, 12, galv); box(x, 17.4, z + dz, 12, 0.5, 0.9, galv); }
    // Dockside cranes on rails, one each side.
    for (const side of [-1, 1]) for (const dz of [-24, 22]) {
      const cx = x + side * (width / 2 + 9);
      cylinder(cx, 11, z + dz, 1.1, 22, safety); solid(cx, z + dz, 3, 3);
      box(cx - side * 6, 22.6, z + dz, 14, 1.4, 2.4, safety);
      beam(new THREE.Vector3(cx, 28, z + dz), new THREE.Vector3(cx - side * 12, 22.6, z + dz), 0.22, steel);
      cylinder(cx, 25, z + dz, 0.6, 5, rust);
    }
    sign('DRY DOCK NO. 1', x, 8.4, z + depth / 2 + 14, 30, 2.4, '#2c4450');
  }

  /** Stacking crane: a rail gantry straddling the container rows beneath it. */
  function stackingCrane(x: number, z: number) {
    for (const dx of [-17, 17]) {
      for (const dz of [-8, 8]) { cylinder(x + dx, 11, z + dz, 0.75, 22, safety); solid(x + dx, z + dz, 2, 2); }
      box(x + dx, 22.4, z, 2.4, 1.6, 18, safety);
    }
    box(x, 23.6, z, 38, 2, 4.4, safety);
    for (const dz of [-1.6, 1.6]) box(x, 24.8, z + dz, 38, 0.5, 0.5, steel);
    box(x + 6, 21.6, z, 5.4, 3.4, 5.4, dark);
    for (const dz of [-1.4, 1.4]) cylinder(x + 6, 17, z + dz, 0.07, 9, steel);
    box(x + 6, 12.6, z, 7, 1.2, 3, galv);
    for (const dx of [-17, 17]) for (let dz = -9; dz <= 9; dz += 18) box(x + dx, 0.3, z + dz, 3.4, 0.1, 1, steel);
  }

  /** Container rows: stacked boxes with corrugated ends and door furniture. */
  function containerStack(x: number, z: number, rows: number, tall: number) {
    for (let r = 0; r < rows; r++) for (let level = 0; level < tall; level++) {
      const cx = x + (r - (rows - 1) / 2) * 3.2, body = boxes[(r + level * 3) % boxes.length];
      if ((r + level) % 7 === 5 && level) continue;
      box(cx, 1.4 + level * 2.7, z, 3, 2.6, 12.2, body, scene, level === tall - 1);
      for (let n = -5; n <= 5; n += 1.2) box(cx + 1.55, 1.4 + level * 2.7, z + n, 0.16, 2.3, 0.5, body);
      box(cx, 1.4 + level * 2.7, z + 6.2, 2.8, 2.2, 0.2, dark);
      if (!level) solid(cx, z, 3.2, 12.4);
    }
  }

  /** Lattice pylon carrying a catenary span to the next tower. */
  function pylon(x: number, z: number, next?: number) {
    for (const dx of [-5, 5]) for (const dz of [-5, 5]) {
      const legTop = new THREE.Vector3(x + dx * 0.24, 34, z + dz * 0.24);
      beam(new THREE.Vector3(x + dx, 0, z + dz), legTop, 0.28, galv);
    }
    solid(x, z, 11, 11);
    for (let y = 6; y < 34; y += 7) {
      const spread = 5 - (y / 34) * 3.8;
      for (const dx of [-spread, spread]) box(x + dx, y, z, 0.3, 0.3, spread * 2, galv);
      for (const dz of [-spread, spread]) box(x, y, z + dz, spread * 2, 0.3, 0.3, galv);
    }
    for (const y of [26, 33, 40]) {
      box(x, y, z, 26, 0.4, 0.4, galv);
      for (const dx of [-12, 12]) { cylinder(x + dx, y - 1.4, z, 0.16, 2.4, dark); cylinder(x + dx, y - 2.8, z, 0.5, 0.5, galv); }
    }
    cylinder(x, 42, z, 0.3, 4, galv);
    if (next === undefined) return;
    for (const y of [26, 33, 40]) for (const dx of [-12, 12]) for (let n = 0; n < 8; n++) {
      const t0 = n / 8, t1 = (n + 1) / 8;
      beam(new THREE.Vector3(x + dx, y - 2.8 - Math.sin(Math.PI * t0) * 5, z + (next - z) * t0),
        new THREE.Vector3(x + dx, y - 2.8 - Math.sin(Math.PI * t1) * 5, z + (next - z) * t1), 0.07, dark);
    }
  }

  /** Industrial frontage: long low shed with loading doors and a small office.
   * The same footprint keeps the truck apron open; container operations remain
   * farther inside the compressed industrial district.
   */
  function industrialShed(x: number, z: number) {
    box(x, 8, z, 110, 16, 20, pale, scene, true); solid(x, z, 110, 20);
    for (const side of [-1, 1]) {
      const roof = box(x, 17.2, z + side * 5.5, 114, 0.6, 12, galv, scene, true);
      roof.rotation.x = side * 0.18;
    }
    const workshopBlue = mat('#3377aa');
    for (let dx = -45; dx <= 45; dx += 18) {
      box(x + dx, 4.6, z - 10.2, 12, 8.4, 0.3, dark);
      for (let y = 1; y < 9; y += 0.6) box(x + dx, y, z - 10.4, 11.4, 0.1, 0.15, steel);
      box(x + dx, 12.2, z - 10.3, 12, 4.3, 0.4, workshopBlue);
      for (const offset of [-3.8, 0, 3.8]) {
        box(x + dx + offset, 13.2, z - 10.55, 2.7, 2.1, 0.25, glass);
        box(x + dx + offset - 1.6, 12.2, z - 10.7, 0.35, 4.6, 1.1, pale);
      }
      box(x + dx, 9.2, z - 12.5, 14, 0.4, 5, galv);
    }
    sign('TUAS INDUSTRIAL WORKSHOPS', x, 14, z - 10.6, 44, 2, '#3b555d')?.rotateY(Math.PI);
  }

  /** Elevated terminus over the eastern approach. */
  function terminus(x: number, z: number) {
    for (let dz = -40; dz <= 40; dz += 20) { cylinder(x, 6, z + dz, 1.8, 12, concrete); solid(x, z + dz, 4, 4); }
    box(x, 12.8, z, 9, 1.6, 100, concrete);
    // Station box rides over the road; only the piers and the stair core stand
    // in it, in the manner of Queenstown's viaduct.
    box(x, 19, z, 30, 11, 56, pale, scene, true);
    for (let dz = -24; dz < 26; dz += 6) for (const side of [-1, 1]) box(x + side * 15.4, 19, z + dz, 0.5, 7, 4.4, glass);
    // Tuas Link's unusual concourse sits above the platforms.
    box(x, 27.6, z, 28, 5, 50, glass, scene, true);
    for (const side of [-1, 1]) box(x + side * 14.4, 25.2, z, 0.8, 0.8, 52, pale);
    for (let n = 0; n < 12; n++) {
      const a = Math.PI * (n + 0.5) / 12;
      const panel = box(x + Math.cos(a) * 17, 30 + Math.sin(a) * 6, z, 4.6, 0.45, 60, steel, scene, true);
      panel.rotation.z = Math.atan2(-6 * Math.cos(a), 17 * Math.sin(a));
    }
    // Reviewed roadside station elevation: green louver bands and deep pale
    // concrete beams, not an all-glass facade at the lower level.
    const louverGreen = mat('#1d593e');
    for (const side of [-1, 1]) {
      for (const y of [16, 21]) {
        box(x + side * 15.7, y, z, 0.4, 1.8, 52, louverGreen);
        for (let dz = -25; dz < 26; dz += 1) box(x + side * 16, y, z + dz, 0.12, 1.7, 0.06, dark);
      }
      box(x + side * 16.2, 13.2, z, 3, 2.6, 58, concrete);
    }
    box(x - 13, 8, z - 34, 8, 16, 7, concrete); solid(x - 13, z - 34, 8, 7);
    sign('EW33  TUAS LINK', x, 15.4, z - 30, 22, 2.1, '#1c6b4f');
  }

  // Tank farm: two bunded groups behind the coast road.
  for (const [cz, radii] of [[-62, [13, 10, 13]], [-18, [10, 13]]] as const) {
    radii.forEach((r, i) => storageTank(-92 + i * 34, cz, r, 14 + (i % 2) * 6));
    bund(-92 + (radii.length - 1) * 17, cz, radii.length * 34 + 8, 40);
  }

  // Process plant: columns, the rack that feeds them and the flare beyond.
  for (const [dx, h] of [[-60, 46], [-32, 34], [-8, 40], [18, 28]] as const) column(dx, 100, 4.4, h);
  pipeRack(-110, 20, 140);
  flareStack(-96, 72);
  dryDock();
  for (let i = 0; i < 4; i++) containerStack(80 + i * 34, -40, 7, 4);
  for (const x of [97, 165]) stackingCrane(x, -40);
  containerStack(112, 100, 9, 3);
  industrialShed(137, -160);
  terminus(235, 100);
  for (const [z, next] of [[-200, -60], [-60, 70], [70, 200]] as const) pylon(200, z, next);
  pylon(200, 200);

  // Laydown yard: hardstanding for the range, with stacked plant at its edges.
  box(137, 0.18, 140, 150, 0.35, 80, paving);
  for (let x = 74; x <= 200; x += 18) box(x, 0.36, 140, 1, 0.02, 78, white);
  for (const z of [112, 168]) for (const x of [72, 202]) { box(x, 1.2, z, 6, 2.4, 6, boxes[(x + z) % boxes.length]); solid(x, z, 6.2, 6.2); }
  for (const z of [114, 166]) { box(64, 1.4, z, 4.4, 2.8, 9, safety); solid(64, z, 4.6, 9.2); }

  // Coast road strip, truck park and perimeter planting.
  for (let z = -200; z <= 200; z += 40) { box(-224, 1.6, z, 9, 3.2, 3.4, boxes[Math.abs(Math.round(z / 40)) % boxes.length]); solid(-224, z, 9.2, 3.6); }
  box(0, 0.18, -148, 240, 0.35, 34, asphalt);
  for (let x = -100; x <= 100; x += 25) {
    box(x, 2.2, -148, 10, 4.4, 4.4, [pale, boxes[1], boxes[4]][Math.abs(Math.round(x / 25)) % 3]); solid(x, -148, 10.2, 4.6);
    box(x - 6.4, 1.6, -148, 3.4, 3.2, 4, dark);
  }
  sign('BENOI TRUCK PARK', 0, 6.4, -166, 30, 2.4, '#4a5560');
  for (let z = -170; z <= 170; z += 34) tree(EDGE_X + 16, z, 14, wood, leaf);
  for (let x = -60; x <= 200; x += 36) tree(x, -EDGE_Z - 16, 14, wood, leaf);

  const pedestrians = ['#e6e4d6', '#d8a02a', '#6d90a0', '#a05a38'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-70 + index * 18, 20, shirt, skin, dark), walker(137 + index * 12, -145, shirt, skin, dark)]);
  const car = kit.car(mat('#c2a34a'), glass, mat('#d6d1c1'), dark);
  const stamps = stampRings(TUAS_STAMPS, orange);
  scene.userData.districtFeatures = ['plate-course-tank-shells', 'spiral-stair-wraps', 'bund-walls', 'trayed-columns', 'pipe-rack-expansion-loop', 'guyed-flare-mast', 'stepped-dry-dock', 'boot-topping-hull', 'rail-stacking-gantry', 'lattice-pylon-catenary', 'industrial-loading-bays', 'upper-concourse-terminus'];
  scene.userData.referenceFeatures = ['tuas-link-2024-green-louver-concrete-elevation', 'tuas-avenue-12-2024-tall-roadside-tree-verge'];

  return withVerticalRoutes(kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.3 + index) * 1.6; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = 90 + ((time * 1.1 + index * 17) % 110); person.rotation.y = -Math.PI / 2; }
        else { person.position.x = -100 + ((time * 1.3 + index * 23) % 120); person.rotation.y = -Math.PI / 2; }
      });
    },
  }), [
    { id: 'dock-inspection-walk', name: 'Dock inspection walkway', width: 3, color: '#899494', railColor: '#d9ab34',
      points: [{ x: -214, z: -80, y: 0 }, { x: -214, z: -68, y: 4 }, { x: -214, z: -12, y: 4 }, { x: -214, z: 0, y: 0 }],
      note: 'Dockside maintenance access between the dry-dock lip and crane line, with separate entry and exit ramps.' },
    { id: 'process-service-deck', name: 'Process plant service deck', width: 5, color: '#899494', railColor: '#d9ab34',
      points: [{ x: -88, z: 160, y: 0 }, { x: -76, z: 160, y: 4 }, { x: -12, z: 160, y: 4 }, { x: 0, z: 160, y: 0 }],
      note: 'Industrial service route alongside the pipe rack, overlooking the plant with ground access retained below the level span.' },
  ]);
}
