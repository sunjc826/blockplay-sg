import * as THREE from 'three';
import { UPPER_THOMSON_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';

// On the eating strip's five-foot way, looking west toward the reservoir.
export const UPPER_THOMSON_SPAWN = { x: -50, z: -12, yaw: Math.PI / 2 };
export const UPPER_THOMSON_BOUNDS = { minX: -260, maxX: 260, minZ: -220, maxZ: 220 };
export { UPPER_THOMSON_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-140, 0, 140], NS_ROADS = [-120, 20, 150];
const EDGE_X = 235, EDGE_Z = 195;
/**
 * The reservoir is two pools, not one: the z = 0 road runs between them on a
 * causeway, so the water never cuts the district in half. Collision and
 * geometry read these same extents.
 */
const WATER = { minX: -215, maxX: -168, nearZ: -120, farZ: 120, gap: 14 };
const SHORE = -166.5, FOREST = { minX: -158, maxX: -132, step: 6.5 }, BRIDGE_X = -146;
export const UPPER_THOMSON_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Upper Thomson stretch: a
 * low-rise eating strip and its five-foot ways, a neighbourhood mall under a
 * rooftop car park, terrace housing, and the reservoir edge behind it —
 * boardwalk, secondary forest and a suspension bridge strung through the
 * canopy. Invented for play, without reference capture.
 */
export function buildUpperThomsonScene() {
  const kit = createSceneKit({
    background: '#c7dae0', fogNear: 290, fogFar: 880,
    sun: { x: 150, y: 210, z: -120 }, shadow: { extent: 260, far: 660 },
    hemisphere: { sky: '#f3f9fb', ground: '#6f7360', intensity: 1.82 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat } = kit;

  const asphalt = mat('#575d5f'), white = mat('#e9e7d8'), paving = mat('#bab5a8'), kerb = mat('#cdc7b9');
  const water = mat('#4f8496', 0.42), shallow = mat('#659cab', 0.4), grass = mat('#87a06c'), lawn = mat('#93ac74');
  // Shots into these splash rather than spark; see water.ts.
  markWater(water, shallow);
  const plaster = mat('#e6dfcd'), stone = mat('#b4b3aa'), concrete = mat('#a8a79d'), dark = mat('#36434a');
  const wood = mat('#7a6046'), plank = mat('#9a7a55'), zinc = mat('#9fa6a4', 0.34, 0.5), steel = mat('#adb5b8', 0.3, 0.55);
  const glass = mat('#6d90a0', 0.24, 0.3), leaf = mat('#3f6b3a'), fern = mat('#57854a'), deep = mat('#2f5a38');
  const orange = mat('#f0a044'), skin = mat('#b18c71'), tealSign = mat('#2f6b6b'), rust = mat('#a8563a');
  const shopColors = ['#e0d3ae', '#a9c2b4', '#d9bfa2', '#9fb4c6', '#cfa79b', '#d8cf9e'].map(color => mat(color));

  box(0, -0.6, 0, 620, 1, 540, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // Reservoir: surface, the two collision pools and a drift of ripples.
  const pools: [number, number][] = [[WATER.nearZ, -WATER.gap], [WATER.gap, WATER.farZ]];
  for (const [minZ, maxZ] of pools) {
    box((WATER.minX + WATER.maxX) / 2, -0.06, (minZ + maxZ) / 2, WATER.maxX - WATER.minX, 0.36, maxZ - minZ, water);
    solid((WATER.minX + WATER.maxX) / 2, (minZ + maxZ) / 2, WATER.maxX - WATER.minX, maxZ - minZ);
    // Bund along the near shore, parted at the causeway so it is never a wall
    // across the only crossing.
    box(SHORE, 0.7, (minZ + maxZ) / 2, 1.8, 1.4, maxZ - minZ, stone);
    solid(SHORE, (minZ + maxZ) / 2, 1.8, maxZ - minZ);
  }
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 28; i++) {
    const z = WATER.nearZ + 8 + (i * 47) % 224;
    if (Math.abs(z) < WATER.gap + 3) continue;
    const ripple = box(WATER.minX + 9 + (i * 31) % 40, 0.14, z, 8 + i % 4, 0.02, 0.2, shallow);
    ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
  }

  // Causeway: a low deck across the water with parapets clear of both lanes.
  box((WATER.minX + WATER.maxX) / 2, 0.2, 0, WATER.maxX - WATER.minX + 8, 0.4, 26, paving);
  for (const side of [-1, 1]) {
    box((WATER.minX + WATER.maxX) / 2, 1.1, side * 11, WATER.maxX - WATER.minX + 8, 1.5, 0.7, stone);
    solid((WATER.minX + WATER.maxX) / 2, side * 11, WATER.maxX - WATER.minX + 8, 0.7);
    for (let x = WATER.minX; x <= WATER.maxX + 4; x += 6) cylinder(x, 0.9, side * 11, 0.2, 1.8, stone);
  }

  /** Boardwalk on piles, hugging the shore between the two pools' runs. */
  function boardwalk(fromZ: number, toZ: number) {
    box(-162, 0.42, (fromZ + toZ) / 2, 8, 0.24, toZ - fromZ, plank);
    for (let z = fromZ; z <= toZ; z += 4) {
      box(-162, 0.56, z, 7.6, 0.06, 1.6, wood);
      for (const dx of [-3.4, 3.4]) cylinder(-162 + dx, 0.2, z, 0.22, 0.9, wood);
    }
    for (let z = fromZ; z <= toZ; z += 8) {
      cylinder(-158.6, 1.1, z, 0.16, 2.2, wood); solid(-158.6, z, 0.5, 0.5);
      if (z + 8 <= toZ) box(-158.6, 1.5, z + 4, 0.1, 0.9, 8, wood);
    }
  }
  boardwalk(-116, -20); boardwalk(20, 116);
  for (const z of [-64, 68]) {
    box(-172, 0.42, z, 20, 0.24, 9, plank); solid(-176, z, 12, 9);
    for (const dz of [-4, 4]) for (const dx of [-8, 0, 8]) cylinder(-172 + dx, 0.2, z + dz, 0.24, 0.9, wood);
    box(-172, 1.1, z + 4.4, 20, 1.2, 0.2, wood);
  }

  /** Secondary forest: bare trunks under a layered canopy, thinning at the road. */
  function forestTree(x: number, z: number, height: number) {
    cylinder(x, height / 2, z, 0.42, height, wood); solid(x, z, 0.9, 0.9);
    for (let layer = 0; layer < 3; layer++) {
      const y = height - layer * 2.6, spread = 4.4 - layer * 0.9;
      blob(x + (layer % 2 ? 1.2 : -1.2), y, z + (layer % 2 ? -1 : 1), spread, 1.5, spread, [leaf, fern, deep][layer % 3]);
    }
  }
  for (let x = FOREST.minX; x <= FOREST.maxX; x += FOREST.step) for (let z = -132; z <= 132; z += 9) {
    if (Math.abs(z) < 24 || Math.abs(x - BRIDGE_X) < 7) continue;
    forestTree(x, z, 11 + ((Math.round(x) + Math.round(z)) % 5));
  }

  /** Suspension bridge strung through the canopy on two lattice towers. */
  function treetopBridge(x: number, fromZ: number, toZ: number) {
    const deck = 22, span = toZ - fromZ;
    for (const z of [fromZ, toZ]) {
      for (const dx of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) cylinder(x + dx, 15, z + dz, 0.4, 30, steel);
      for (let y = 4; y < 30; y += 5) for (const dx of [-2.2, 2.2]) box(x + dx, y, z, 0.35, 0.35, 4.6, steel);
      for (let y = 4; y < 30; y += 5) box(x, y, z, 4.6, 0.35, 0.35, steel);
      box(x, 30.4, z, 6.4, 0.8, 6.4, steel); solid(x, z, 5.6, 5.6);
    }
    // Deck and its mesh sides, hung from a cable that sags between the towers.
    for (let n = 0; n <= 28; n++) {
      const z = fromZ + span * n / 28, sag = Math.sin(Math.PI * n / 28);
      box(x, deck, z, 3.4, 0.28, span / 28 + 0.4, plank);
      for (const side of [-1, 1]) {
        box(x + side * 1.7, deck + 0.7, z, 0.16, 1.4, span / 28 + 0.4, steel);
        const cableY = 29 - sag * 6.4;
        cylinder(x + side * 1.7, (cableY + deck) / 2, z, 0.05, cableY - deck, steel);
      }
    }
    for (const side of [-1, 1]) for (let n = 0; n < 28; n++) {
      const z0 = fromZ + span * n / 28, z1 = fromZ + span * (n + 1) / 28;
      beam(new THREE.Vector3(x + side * 1.7, 29 - Math.sin(Math.PI * n / 28) * 6.4, z0),
        new THREE.Vector3(x + side * 1.7, 29 - Math.sin(Math.PI * (n + 1) / 28) * 6.4, z1), 0.12, steel);
    }
    sign('TREETOP WALK', x, 26, fromZ - 5, 18, 2, '#2f5140');
  }
  treetopBridge(BRIDGE_X, -70, 70);

  /** Two-storey shop terrace: zinc awning, five-foot way, tiled upper facade. */
  function shopRow(startX: number, z: number, count: number, facing: 1 | -1, width = 15) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, body = shopColors[(i + (z > 0 ? 3 : 0)) % shopColors.length];
      box(x, 5.4, z, width - 0.5, 10.8, 16, body, scene, true); solid(x, z, width, 16);
      const front = z + facing * 8;
      box(x, 11.2, z, width, 0.7, 17, plaster);
      for (let dx = -width / 2 + 2; dx < width / 2 - 1; dx += 3.4) box(x + dx, 7.9, front + facing * 0.14, 2.4, 3.6, 0.24, glass);
      box(x, 10.2, front + facing * 0.3, width - 1, 1.5, 0.5, i % 2 ? tealSign : rust);
      // Zinc awning over the walkway, on slender posts set back from the kerb.
      const awn = box(x, 5.1, front + facing * 2.2, width, 0.22, 5, zinc, scene, true);
      awn.rotation.x = -facing * 0.13;
      for (const dx of [-width / 2 + 1.6, width / 2 - 1.6]) { cylinder(x + dx, 2.4, front + facing * 4.3, 0.22, 4.8, zinc); solid(x + dx, front + facing * 4.3, 0.6, 0.6); }
      box(x, 0.26, front + facing * 2.4, width, 0.3, 5.2, paving);
      box(x, 2.2, front + facing * 0.16, 4.4, 4.4, 0.22, glass);
      for (const dx of [-width / 2 + 2.6, width / 2 - 2.6]) cylinder(x + dx, 3.3, front + facing * 3.6, 0.3, 0.7, i % 3 ? rust : tealSign);
    }
  }

  /** Open-sided kopitiam: tiled floor, square columns, round tables and fans. */
  function coffeeShop(x: number, z: number) {
    box(x, 0.24, z, 46, 0.4, 34, paving);
    for (let dx = -20; dx <= 20; dx += 5) for (let dz = -14; dz <= 14; dz += 5) if ((Math.round(dx) + Math.round(dz)) % 10 === 0) box(x + dx, 0.46, z + dz, 4.6, 0.02, 4.6, plaster);
    box(x, 4.6, z - 13, 46, 9.2, 8, plaster, scene, true); solid(x, z - 13, 46, 8);
    for (let dx = -18; dx < 20; dx += 7.5) { box(x + dx, 3.2, z - 9.2, 6, 5.2, 0.5, dark); box(x + dx, 6.6, z - 8.8, 6.6, 1.5, 0.9, [tealSign, rust, orange][Math.abs(Math.round(dx / 7.5)) % 3]); }
    for (const dx of [-21, -7, 7, 21]) for (const dz of [-14, 14]) { box(x + dx, 3.6, z + dz, 1.1, 7.2, 1.1, plaster); solid(x + dx, z + dz, 1.4, 1.4); }
    for (const side of [-1, 1]) { const roof = box(x, 7.6, z + side * 8, 48, 0.4, 20, zinc, scene, true); roof.rotation.x = side * 0.1; }
    for (const dx of [-14, 0, 14]) for (const dz of [-7, 7]) {
      cylinder(x + dx, 6.9, z + dz, 0.12, 0.8, steel);
      for (let b = 0; b < 3; b++) { const blade = box(x + dx, 6.4, z + dz, 4.4, 0.08, 0.7, steel); blade.rotation.y = b * 2.1; }
    }
    for (const dx of [-16, -4, 8, 20]) for (const dz of [-8, 4]) {
      cylinder(x + dx, 0.75, z + dz, 1.5, 1.5, plaster); solid(x + dx, z + dz, 3.2, 3.2);
      for (let s = 0; s < 4; s++) { const angle = s * Math.PI / 2; cylinder(x + dx + Math.cos(angle) * 2.4, 0.5, z + dz + Math.sin(angle) * 2.4, 0.4, 1, rust); }
    }
    sign('THOMSON COFFEE SHOP', x, 9.4, z - 17.4, 30, 2.2, '#2f6b6b');
  }

  /** Squat mall with a glazed frontage and a rooftop car-park deck. */
  function neighbourhoodMall(x: number, z: number) {
    box(x, 9, z, 88, 18, 96, concrete, scene, true); solid(x, z, 88, 96);
    for (let y = 4; y < 18; y += 5) {
      for (let dx = -40; dx < 42; dx += 7) for (const side of [-1, 1]) box(x + dx, y, z + side * 48.4, 5.6, 3.4, 0.6, glass);
      for (let dz = -42; dz < 44; dz += 7) for (const side of [-1, 1]) box(x + side * 44.4, y, z + dz, 0.6, 3.4, 5.6, glass);
    }
    // Car-park deck: parapet, ranked bays and a helical ramp at one corner.
    box(x, 18.6, z, 92, 1.2, 100, stone);
    for (const side of [-1, 1]) box(x, 20.2, z + side * 49, 92, 2.2, 1.4, concrete);
    for (const side of [-1, 1]) box(x + side * 45.6, 20.2, z, 1.4, 2.2, 100, concrete);
    for (let dz = -44; dz < 46; dz += 6) for (const side of [-1, 1]) box(x + side * 30, 19.3, z + dz, 26, 0.04, 0.3, white);
    for (let ring = 0; ring < 10; ring++) {
      const angle = ring * 0.62, r = 13;
      const ramp = box(x - 32 + Math.cos(angle) * r, 2 + ring * 1.7, z + 34 + Math.sin(angle) * r, 9, 0.5, 9, concrete);
      ramp.rotation.y = -angle;
    }
    box(x, 6.4, z + 53, 34, 0.7, 12, steel, scene, true);
    for (const dx of [-14, 14]) { cylinder(x + dx, 3.2, z + 58, 0.5, 6.4, steel); solid(x + dx, z + 58, 1.1, 1.1); }
    sign('THOMSON PLAZA', x, 9.2, z + 53.4, 30, 2.4, '#2c4450');
  }

  /** Terrace houses: pitched tile roof, a porch, a gate and a clipped hedge. */
  function landedRow(startX: number, z: number, count: number, facing: 1 | -1, width = 13) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, front = z + facing * 9;
      box(x, 4.6, z, width - 0.6, 9.2, 18, i % 2 ? plaster : shopColors[i % shopColors.length], scene, true);
      solid(x, z, width, 18);
      for (const side of [-1, 1]) { const roof = box(x, 10.4, z + side * 4.8, width, 0.5, 11, rust, scene, true); roof.rotation.x = side * 0.3; }
      box(x, 12.2, z, width + 0.6, 0.5, 1.6, rust);
      for (const dx of [-3.2, 3.2]) box(x + dx, 7.2, front + facing * 0.16, 2.6, 2.8, 0.22, glass);
      box(x, 2.6, front + facing * 0.18, 3, 5.2, 0.24, wood);
      box(x, 5.6, front + facing * 2.4, width - 2, 0.3, 5, concrete, scene, true);
      for (const dx of [-width / 2 + 2, width / 2 - 2]) { cylinder(x + dx, 2.8, front + facing * 4.6, 0.26, 5.6, plaster); solid(x + dx, front + facing * 4.6, 0.7, 0.7); }
      for (let dx = -width / 2 + 1; dx < width / 2; dx += 1.6) box(x + dx, 1.1, front + facing * 7.4, 0.14, 2.2, 0.14, dark);
      box(x, 2.3, front + facing * 7.4, width - 0.6, 0.18, 0.18, dark);
      blob(x, 0.9, front + facing * 8.6, width / 2 - 0.4, 0.9, 0.8, fern);
    }
  }

  /** Street-level station entrance under a folded canopy. */
  function stationEntrance(x: number, z: number) {
    box(x, 1.6, z, 15, 3.2, 9, dark); solid(x, z, 15, 9);
    for (const side of [-1, 1]) { const fold = box(x, 4.2, z + side * 3, 17, 0.4, 7, steel, scene, true); fold.rotation.x = side * 0.16; }
    for (const dx of [-7, 7]) { cylinder(x + dx, 2.1, z + 4.6, 0.3, 4.2, steel); solid(x + dx, z + 4.6, 0.8, 0.8); }
    box(x, 1.8, z + 4.7, 14, 3.1, 0.14, glass);
    sign('TE8  UPPER THOMSON', x, 5.4, z + 5.6, 14, 1.4, '#7b2b8f');
  }

  shopRow(-95, -32, 6, 1);
  shopRow(-95, -108, 6, -1);
  coffeeShop(-92, -70);
  neighbourhoodMall(85, -70);
  landedRow(-96, 40, 6, -1);
  landedRow(-96, 100, 6, 1);
  stationEntrance(85, 24);

  // Block D: a food centre, its forecourt and a bus bay off the cross street.
  box(110, 0.2, 86, 96, 0.4, 72, paving);
  box(110, 5, 92, 74, 10, 48, plaster, scene, true); solid(110, 92, 74, 48);
  for (const side of [-1, 1]) { const roof = box(110, 11.4, 92 + side * 12, 78, 0.6, 28, zinc, scene, true); roof.rotation.x = side * 0.17; }
  box(110, 13.2, 92, 78, 1, 9, zinc);
  for (let dx = -30; dx < 32; dx += 6.5) { box(110 + dx, 14.2, 92, 3.4, 1.3, 7, stone); box(110 + dx, 15.1, 92, 4, 0.35, 8, dark); }
  for (const side of [-1, 1]) for (let dx = -32; dx < 34; dx += 8) {
    box(110 + dx, 3.4, 92 + side * 24.2, 6, 6.2, 0.5, dark);
    box(110 + dx, 7.2, 92 + side * 24.6, 6.8, 1.3, 0.8, [tealSign, rust, orange][Math.abs(Math.round(dx / 8)) % 3]);
  }
  for (const dz of [-8, 6]) for (let dx = -24; dx < 26; dx += 12) { box(110 + dx, 0.8, 60 + dz, 4.4, 0.16, 4.4, stone); cylinder(110 + dx, 0.42, 60 + dz, 0.34, 0.85, dark); solid(110 + dx, 60 + dz, 4.6, 4.6); }
  sign('THOMSON FOOD CENTRE', 110, 9.4, 67.4, 32, 2.2, '#a8563a');
  box(150, 0.18, -40, 22, 0.35, 60, asphalt);
  for (const dz of [-22, 0, 22]) { box(158, 2.8, -40 + dz, 3.4, 0.3, 14, zinc, scene, true); for (const dd of [-6, 6]) { cylinder(158 + 1.4, 1.4, -40 + dz + dd, 0.16, 2.8, steel); solid(159.4, -40 + dz + dd, 0.5, 0.5); } }

  // East lawn: open ground for the range, with planting kept to its margins.
  box(192, 0.18, 0, 46, 0.35, 300, lawn);
  for (const z of [-140, -108, 96, 130]) { tree(178, z, 9, wood, leaf); tree(208, z + 14, 8, wood, leaf); }
  for (const z of [-120, 110]) { box(200, 0.85, z, 3.4, 0.22, 1.2, wood); solid(200, z, 3.6, 1.2); }
  for (let step = 0; step < 3; step++) box(192, 0.4 + step * 0.4, -100, 22 - step * 6, 0.9 + step * 0.3, 14 - step * 4, step % 2 ? stone : concrete);
  solid(192, -100, 24, 16);

  // Perimeter: planting strips, a reservoir sign and the far shore's tree line.
  for (let z = -180; z <= 180; z += 26) {
    if (Math.abs(z) < 20) continue;
    tree(-228, z, 9, wood, leaf); forestTree(-222, z + 13, 12);
  }
  for (let x = -210; x <= 210; x += 30) { tree(x, -EDGE_Z - 16, 8, wood, leaf); tree(x, EDGE_Z + 16, 8, wood, leaf); }
  for (const x of [-60, 60]) for (const z of [-170, 170]) tree(x, z, 9, wood, leaf);
  sign('MACRITCHIE RESERVOIR', -190, 6.4, 19, 34, 2.4, '#2f5140');

  const pedestrians = ['#e9e7d8', '#6d90a0', '#a8563a', '#57854a'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-90 + index * 22, -18, shirt, skin, dark), walker(-164, -40 + index * 18, shirt, skin, dark)]);
  const car = kit.car(mat('#7f9488'), glass, mat('#d9d4c4'), dark);
  const stamps = stampRings(UPPER_THOMSON_STAMPS, orange);
  scene.userData.districtFeatures = ['zinc-awning-five-foot-way', 'open-sided-kopitiam', 'ceiling-fan-bays', 'rooftop-car-park-deck', 'helical-ramp', 'terrace-house-porches', 'reservoir-causeway', 'pile-boardwalk', 'layered-secondary-forest', 'canopy-suspension-span'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.35 + index) * 1.5; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.z = -60 + ((time * 1.1 + index * 23) % 120); person.rotation.y = Math.PI; }
        else { person.position.x = -100 + ((time * 1.3 + index * 19) % 150); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
