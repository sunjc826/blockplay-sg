import * as THREE from 'three';
import { CHINATOWN_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

export const CHINATOWN_SPAWN = { x: -55, z: 80, yaw: -Math.PI / 2 };
export const CHINATOWN_BOUNDS = { minX: -250, maxX: 250, minZ: -210, maxZ: 210 };
export { CHINATOWN_STAMPS } from '../data/region-stamps.ts';

/** Street grid shared by the schematic map, the FPS minimap and the scene. */
const EW_ROADS = [-140, -60, 30, 120], NS_ROADS = [-170, -70, 40, 150];
const EDGE_X = 225, EDGE_Z = 180;
export const CHINATOWN_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Chinatown streets: shophouse
 * terraces, a market lane, a food street and the two temples that anchor the
 * district. Layout is invented for play, not surveyed, and this region was
 * composed without new street-level reference capture.
 */
export function buildChinatownScene() {
  const kit = createSceneKit({
    background: '#c8d8dc', fogNear: 260, fogFar: 760,
    sun: { x: 120, y: 200, z: -90 }, shadow: { extent: 250, far: 600 },
    hemisphere: { sky: '#f6f4ec', ground: '#7b7263', intensity: 1.75 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#575d60'), white = mat('#e9e7d8'), paving = mat('#b9b2a4'), kerb = mat('#cfc9bb');
  const plaster = mat('#e8e0cf'), stone = mat('#b8b9b5'), dark = mat('#38474b'), wood = mat('#80654d');
  const terra = mat('#b4654a'), tileDark = mat('#8d4b38'), lacquer = mat('#8c2f26'), gold = mat('#c9992f', 0.42, 0.55);
  const jade = mat('#2f6b52'), leaf = mat('#4d7243'), grass = mat('#8e9d70'), orange = mat('#f0a044');
  const glass = mat('#5f7f8a', 0.28, 0.25), concrete = mat('#a9a79c'), skin = mat('#b18c71');
  const shopColors = ['#d9b98a', '#a8c3b0', '#e0c2ae', '#9fb4c6', '#e3d39a', '#cf9f93'].map(color => mat(color));
  const shutter = ['#2f6b52', '#8c2f26', '#2b4f6e'].map(color => mat(color));
  const lanternRed = mat('#b8342c'), canopyRed = mat('#a5392f'), canopyYellow = mat('#d8a63a');

  // Ground, streets and lane markings. Footpaths stay clear of every centreline.
  box(0, -0.6, 0, 560, 1, 480, paving);
  for (const z of EW_ROADS) {
    box(0, 0, z, EDGE_X * 2, 0.12, 16, asphalt);
    for (let x = -EDGE_X + 6; x < EDGE_X; x += 12) box(x, 0.09, z, 5, 0.025, 0.16, white);
    for (const side of [-10.5, 10.5]) box(0, 0.12, z + side, EDGE_X * 2, 0.22, 3, kerb);
  }
  for (const x of NS_ROADS) {
    box(x, 0, 0, 16, 0.12, EDGE_Z * 2, asphalt);
    for (let z = -EDGE_Z + 6; z < EDGE_Z; z += 12) box(x, 0.09, z, 0.16, 0.025, 5, white);
    for (const side of [-10.5, 10.5]) box(x + side, 0.12, 0, 3, 0.22, EDGE_Z * 2, kerb);
  }
  for (const z of [-EDGE_Z, EDGE_Z]) { box(0, 0, z, EDGE_X * 2 + 16, 0.12, 16, asphalt); for (let x = -EDGE_X; x < EDGE_X; x += 12) box(x, 0.09, z, 5, 0.025, 0.16, white); }
  for (const x of [-EDGE_X, EDGE_X]) { box(x, 0, 0, 16, 0.12, EDGE_Z * 2, asphalt); for (let z = -EDGE_Z; z < EDGE_Z; z += 12) box(x, 0.09, z, 0.16, 0.025, 5, white); }

  /** Two-storey terrace with a five-foot way, shutters and a pitched roof. */
  function shophouseRow(startX: number, z: number, count: number, facing: 1 | -1, width = 12) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, body = shopColors[(i + (z > 0 ? 2 : 0)) % shopColors.length];
      box(x, 5.2, z, width - 0.4, 10.4, 15, body, scene, true); solid(x, z, width, 15);
      const front = z + facing * 7.5;
      // Pitched terracotta roof with small tile courses.
      for (const side of [-1, 1]) { const roof = box(x, 11, z + side * 4.2, width, 0.4, 9.4, terra, scene, true); roof.rotation.x = side * 0.2; }
      for (let t = -6.4; t <= 6.4; t += 1.2) box(x, 11.45 - Math.abs(t) * 0.2, z + t, width - 0.5, 0.12, 1.1, tileDark);
      // Five-foot way: columns, arched beam and a shaded walkway.
      box(x, 4.3, front + facing * 1.9, width, 0.45, 4.2, plaster, scene, true);
      for (const dx of [-width / 2 + 1.2, width / 2 - 1.2]) { cylinder(x + dx, 2.1, front + facing * 3.4, 0.36, 4.2, plaster); solid(x + dx, front + facing * 3.4, 0.9, 0.9); }
      box(x, 0.2, front + facing * 2, width, 0.3, 4, paving);
      // Upper shutters with louvres, lower doorway and a vertical signboard.
      for (const dx of [-3.2, 0, 3.2]) {
        box(x + dx, 7.6, front + facing * 0.1, 2.3, 3.4, 0.22, shutter[(i + Math.abs(Math.round(dx))) % 3]);
        for (let y = 6.2; y < 9; y += 0.42) box(x + dx, y, front + facing * 0.24, 2.1, 0.13, 0.16, plaster);
        box(x + dx, 9.5, front + facing * 0.3, 2.9, 0.26, 0.4, plaster);
      }
      box(x, 2.1, front + facing * 0.12, 3.4, 4.2, 0.2, wood);
      box(x + width / 2 - 1.4, 6.2, front + facing * 0.5, 0.9, 5.4, 0.3, i % 2 ? lacquer : jade);
      for (const dy of [-1.6, 0, 1.6]) box(x + width / 2 - 1.4, 6.2 + dy, front + facing * 0.68, 0.55, 0.55, 0.1, gold);
      // Red lantern pair at the walkway edge.
      for (const dx of [-width / 2 + 2.4, width / 2 - 2.4]) cylinder(x + dx, 3.7, front + facing * 3.2, 0.42, 0.75, lanternRed);
    }
  }

  /** Stall rows with striped canopies and a lantern string overhead. */
  function marketLane(fromX: number, toX: number, z: number, label: string) {
    box((fromX + toX) / 2, 0.16, z, toX - fromX + 12, 0.3, 26, paving);
    for (let x = fromX; x <= toX; x += 9) for (const side of [-1, 1]) {
      const stallZ = z + side * 8.5, cloth = (Math.round(x / 9) + side) % 2 ? canopyRed : canopyYellow;
      // Stall body, counter and the goods stacked on it.
      box(x, 1.2, stallZ, 6.4, 2.4, 3.6, shopColors[Math.abs(Math.round(x / 9) + side) % shopColors.length]); solid(x, stallZ, 6.6, 3.8);
      box(x, 2.5, stallZ - side * 1.9, 6.8, 0.28, 0.7, wood);
      for (const dx of [-2.1, 0, 2.1]) box(x + dx, 2.75, stallZ - side * 1.3, 1.6, 0.6, 1, (Math.round(x + dx) % 3) ? orange : jade);
      // Tented awning: two sloped panels meeting at a ridge, with a valance.
      const front = stallZ - side * 2.2;
      for (const panel of [-1, 1]) {
        const cover = box(x, 3.75, front + panel * side * 1.5, 7, 0.16, 3.4, cloth, scene, true);
        cover.rotation.x = panel * side * 0.5;
      }
      box(x, 4.35, front, 7.1, 0.2, 0.28, cloth);
      box(x, 3.05, front - side * 1.7, 7, 0.5, 0.14, cloth);
      for (const dx of [-3.2, 3.2]) for (const dz of [-1.8, 1.3]) cylinder(x + dx, 1.8, front + side * dz, 0.07, 3.6, dark);
    }
    // Paired lantern posts at the kerbs, with wires strung across and along the
    // lane. The centre of the lane stays clear so a car can still follow it.
    for (let x = fromX - 3; x <= toX + 3; x += 12) {
      for (const side of [-1, 1]) {
        cylinder(x, 4.9, z + side * 6.4, 0.09, 9.8, dark); solid(x, z + side * 6.4, 0.3, 0.3);
        box(x, 9.5, z + side * 6.4, 0.5, 0.45, 0.5, lacquer);
        if (x + 12 <= toX + 3) box(x + 6, 9.5, z + side * 6.4, 12, 0.07, 0.07, dark);
      }
      box(x, 9.5, z, 0.07, 0.07, 12.8, dark);
      for (const dz of [-4.2, 0, 4.2]) cylinder(x, 9.05, z + dz, 0.42, 0.72, lanternRed);
    }
    sign(label, (fromX + toX) / 2, 10.4, z - 13.2, 26, 2.1, '#8c2f26');
  }

  /** Tang-style hall: stacked hipped roofs, a colonnade and a rooftop stupa. */
  function reliquaryTemple(x: number, z: number) {
    box(x, 7, z, 54, 14, 40, lacquer, scene, true); solid(x, z, 56, 42);
    for (const dx of [-22, -11, 0, 11, 22]) { cylinder(x + dx, 4, z + 21.6, 0.85, 8, lacquer); solid(x + dx, z + 21.6, 1.8, 1.8); }
    box(x, 8.4, z + 21.8, 54, 0.6, 5, gold);
    for (let tier = 0; tier < 3; tier++) {
      const span = 58 - tier * 12, y = 14.6 + tier * 4.6;
      for (const side of [-1, 1]) {
        const roof = box(x, y, z + side * (span / 4.2), span, 0.7, span / 2, tileDark, scene, true);
        roof.rotation.x = side * 0.34;
      }
      box(x, y + 1.9, z, span - 6, 0.5, span / 2.2, tileDark);
      box(x, y - 0.9, z, span + 2, 0.45, span / 1.9, gold);
      // Upswept eave tips read as the district's silhouette from across the grid.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const tip = box(x + sx * span / 2, y + 1.2, z + sz * span / 3.8, 3.4, 0.5, 1.1, gold, scene, true);
        tip.rotation.z = sx * 0.5; tip.rotation.y = sz * 0.3;
      }
    }
    for (let y = 16; y < 26; y += 4.6) for (let dx = -20; dx <= 20; dx += 8) box(x + dx, y, z - 20.4, 4.6, 2.4, 0.3, gold);
    cylinder(x, 30, z, 4.2, 6, gold); cylinder(x, 34.4, z, 2.4, 4.4, gold);
    const finial = new THREE.Mesh(geo(new THREE.ConeGeometry(1.6, 5.4, 8)), gold); finial.position.set(x, 39, z); scene.add(finial);
    sign('BUDDHA TOOTH RELIC TEMPLE', x, 10.4, z + 24.4, 40, 2.3, '#6d1f19');
  }

  /** Stepped gopuram tower with tiered figure bands above a walled courtyard. */
  function gopuramTemple(x: number, z: number) {
    box(x, 2.6, z, 60, 5.2, 46, plaster, scene, true); solid(x, z, 62, 48);
    box(x, 0.18, z, 66, 0.35, 52, paving);
    for (const sx of [-1, 1]) { const wall = box(x + sx * 31, 2.2, z, 1.4, 4.4, 50, plaster); solid(x + sx * 31, z, 1.6, 50); void wall; }
    for (let tier = 0; tier < 6; tier++) {
      const w = 22 - tier * 2.6, d = 15 - tier * 1.7, y = 6.4 + tier * 3.4;
      box(x, y, z - 18, w, 2.6, d, tier % 2 ? plaster : mat(['#c8543f', '#2f6b52', '#d8a63a', '#2b4f6e'][tier % 4]), scene, true);
      box(x, y + 1.6, z - 18, w + 1.8, 0.5, d + 1.4, plaster);
      for (let dx = -w / 2 + 1.4; dx < w / 2; dx += 3.2) {
        box(x + dx, y - 0.2, z - 18 - d / 2 - 0.2, 1.1, 1.9, 0.5, ['#c8543f', '#2f6b52', '#d8a63a', '#e8e0cf'][(tier + Math.round(dx)) % 4] === '#e8e0cf' ? plaster : mat(['#c8543f', '#2f6b52', '#d8a63a'][(tier + Math.abs(Math.round(dx))) % 3]));
        blob(x + dx, y + 0.9, z - 18 - d / 2 - 0.3, 0.45, 0.5, 0.35, gold);
      }
    }
    box(x, 23.6, z - 18, 6.4, 1.2, 4.4, gold, scene, true);
    for (const dx of [-2.2, 0, 2.2]) { const pot = new THREE.Mesh(geo(new THREE.ConeGeometry(0.9, 2.6, 7)), gold); pot.position.set(x + dx, 25.4, z - 18); scene.add(pot); }
    box(x, 3.4, z - 12, 7, 6.8, 1.2, jade);
    sign('SRI MARIAMMAN TEMPLE', x, 8.2, z + 24.4, 34, 2.1, '#2f6b52');
  }

  /** Long residential slab with a coloured panel grid and a podium of shops. */
  function slabComplex(x: number, z: number) {
    box(x, 5, z, 76, 10, 44, concrete, scene, true); solid(x, z, 78, 46);
    box(x, 10.4, z, 80, 1, 48, stone);
    box(x, 36, z - 4, 66, 52, 26, concrete, scene, true);
    const panels = ['#d8a63a', '#a8c3b0', '#cf9f93', '#9fb4c6'].map(color => mat(color));
    for (let y = 13; y < 60; y += 3.6) for (let dx = -31; dx < 32; dx += 5.2) {
      box(x + dx, y, z + 9.2, 4.4, 2.6, 0.35, panels[(Math.round(dx / 5.2) + Math.round(y)) % 4]);
      box(x + dx, y, z - 17.2, 4.4, 2.6, 0.35, panels[(Math.round(dx / 5.2) + Math.round(y) + 2) % 4]);
      if ((Math.round(dx / 5.2) + Math.round(y)) % 3 === 0) box(x + dx, y - 0.4, z + 9.6, 3.6, 1.4, 0.5, glass);
    }
    for (let dx = -30; dx < 32; dx += 8) box(x + dx, 62.6, z - 4, 4, 1.6, 26, stone);
    for (let dx = -33; dx < 36; dx += 11) { box(x + dx, 2.3, z + 22.6, 8.6, 3.4, 0.4, glass); box(x + dx, 5.2, z + 22.8, 9.4, 1.5, 0.8, ['#8c2f26', '#2f6b52', '#d8a63a'][Math.abs(Math.round(dx / 11)) % 3] === '#8c2f26' ? lacquer : jade); }
    sign('PEOPLE’S PARK COMPLEX', x, 8.4, z + 23.4, 42, 2.3, '#3a4a55');
  }

  /** Wide low hawker hall: vented roof, open sides and rows of tables. */
  function hawkerHall(x: number, z: number) {
    box(x, 0.2, z, 84, 0.4, 62, paving);
    box(x, 5, z, 74, 10, 52, plaster, scene, true); solid(x, z, 76, 54);
    for (const side of [-1, 1]) { const roof = box(x, 11.4, z + side * 13, 78, 0.6, 30, terra, scene, true); roof.rotation.x = side * 0.18; }
    box(x, 13.4, z, 78, 1.1, 10, tileDark);
    for (let dx = -32; dx < 34; dx += 6.5) { box(x + dx, 14.4, z, 3.6, 1.4, 8, stone); box(x + dx, 15.4, z, 4.2, 0.4, 9, dark); }
    for (const side of [-1, 1]) for (let dx = -34; dx < 36; dx += 8.5) {
      box(x + dx, 3.4, z + side * 26.2, 6.4, 6.4, 0.5, dark);
      box(x + dx, 7.4, z + side * 26.6, 7.2, 1.3, 0.8, [lacquer, jade, canopyYellow][Math.abs(Math.round(dx / 8.5)) % 3]);
    }
    for (const dz of [-16, 0, 16]) for (let dx = -26; dx < 28; dx += 13) {
      box(x + dx, 0.85, z + dz, 4.6, 0.18, 4.6, stone); cylinder(x + dx, 0.45, z + dz, 0.35, 0.9, dark); solid(x + dx, z + dz, 4.8, 4.8);
    }
    sign('CHINATOWN COMPLEX', x, 9.4, z + 27.4, 34, 2.2, '#8c2f26');
  }

  /** Street-level MRT entrance with a glass canopy and a line sign. */
  function stationEntrance(x: number, z: number) {
    box(x, 1.5, z, 14, 3, 8, dark); solid(x, z, 14, 8);
    box(x, 3.4, z, 16, 0.4, 10, glass, scene, true);
    for (const dx of [-6.4, 6.4]) { cylinder(x + dx, 1.7, z + 4.2, 0.28, 3.4, stone); solid(x + dx, z + 4.2, 0.7, 0.7); }
    box(x, 1.6, z + 4.3, 13, 2.8, 0.14, glass);
    sign('NE4 / DT19  CHINATOWN', x, 4.4, z + 5.2, 13, 1.3, '#7b2b8f');
  }

  // Blocks. Every footprint keeps twelve metres of clearance from the streets.
  shophouseRow(-52, -114, 7, 1);      // Trengganu Street terrace, facing the lane
  shophouseRow(-52, -86, 7, -1);
  marketLane(-46, 22, -15, 'PAGODA STREET');
  shophouseRow(-52, -38, 7, 1);
  shophouseRow(-52, 8, 7, -1);
  marketLane(-46, 22, 80, 'SMITH STREET');
  shophouseRow(-52, 57, 7, 1);
  shophouseRow(-52, 103, 7, -1);
  reliquaryTemple(-120, -18);
  gopuramTemple(95, -92);
  slabComplex(-120, -104);
  hawkerHall(95, -14);
  stationEntrance(-90, 100);

  // Kreta Ayer square: paved forecourt, planting beds, benches and a stage wall.
  box(-124, 0.16, 78, 76, 0.3, 58, paving);
  for (let x = -158; x < -90; x += 5) for (let z = 52; z < 106; z += 5) if ((Math.round(x / 5) + Math.round(z / 5)) % 3 === 0) box(x, 0.32, z, 4.6, 0.02, 4.6, kerb);
  box(-150, 3.2, 78, 3, 6.4, 34, plaster, scene, true); solid(-150, 78, 3.2, 34);
  for (let z = 63; z < 95; z += 7) box(-148.2, 4.2, z, 0.5, 3.4, 4.4, lacquer);
  for (const z of [60, 96]) { box(-110, 0.8, z, 10, 0.24, 3.4, wood); solid(-110, z, 10, 3.4); }
  for (const x of [-140, -104]) for (const z of [58, 98]) tree(x, z, 8, wood, leaf);

  // Club Street slope: terraced shophouses stepped up a planted bank.
  for (let step = 0; step < 3; step++) {
    box(95, 0.4 + step * 1.1, 96 - step * 22, 84, 0.9 + step * 2.2, 18, grass);
    shophouseRow(62, 96 - step * 22, 6, -1, 11);
  }
  for (const x of [52, 140]) for (const z of [46, 68, 106]) tree(x, z, 7, wood, leaf);

  // Outer strips: a temple garden, low shops, a car park and street furniture.
  box(192, 0.2, 0, 44, 0.4, 150, grass);
  for (const z of [-56, -14, 28, 70]) { tree(186, z, 9, wood, leaf); tree(202, z + 18, 8, wood, leaf); }
  for (const z of [-30, 40]) { box(196, 0.75, z, 9, 0.22, 3.2, wood); solid(196, z, 9, 3.2); }
  box(-196, 0.18, -104, 44, 0.35, 62, asphalt);
  for (let z = -128; z < -78; z += 7) for (const x of [-208, -184]) { box(x, 0.7, z, 4.4, 1.4, 2, shopColors[Math.abs(Math.round(z / 7)) % 6]); solid(x, z, 4.6, 2.2); }
  shophouseRow(-210, 150, 3, 1, 11);
  shophouseRow(-52, 150, 6, 1, 11);
  shophouseRow(166, 150, 4, 1, 11);
  shophouseRow(-52, -160, 6, -1, 11);
  for (let x = -214; x < 216; x += 34) { box(x, 3.6, -150, 0.18, 7.2, 0.18, dark); box(x, 7.1, -149, 0.24, 0.3, 2.2, white); solid(x, -150, 0.4, 0.4); }
  for (const x of [-EDGE_X - 12, EDGE_X + 12]) for (let z = -170; z < 180; z += 26) tree(x, z, 8, wood, leaf);
  for (const z of [-EDGE_Z - 12, EDGE_Z + 12]) for (let x = -200; x < 210; x += 30) tree(x, z, 7, wood, leaf);

  // Gateway arch over the market lane approach; read from the main streets.
  for (const sx of [-1, 1]) { cylinder(-15 + sx * 14, 5.4, 22, 1.1, 10.8, lacquer); solid(-15 + sx * 14, 22, 2.4, 2.4); }
  box(-15, 11.4, 22, 34, 1.2, 3.4, tileDark, scene, true);
  box(-15, 13, 22, 29, 1, 2.6, gold);
  for (const sx of [-1, 1]) { const brace = box(-15 + sx * 16.6, 12.4, 22, 4.4, 0.6, 2.2, gold, scene, true); brace.rotation.z = sx * 0.45; }
  beam(new THREE.Vector3(-29, 10.4, 22), new THREE.Vector3(-1, 10.4, 22), 0.14, gold);

  const pedestrians = ['#e9e7d8', '#a8c3b0', '#cf9f93', '#9fb4c6'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-40 + index * 22, -15, shirt, skin, dark), walker(-34 + index * 20, 80, shirt, skin, dark)]);
  const car = kit.car(mat('#6f8f9c'), glass, mat('#dad6c8'), dark);
  const stamps = stampRings(CHINATOWN_STAMPS, orange);
  scene.userData.districtFeatures = ['shophouse-five-foot-way', 'pitched-tile-courses', 'market-canopy-lane', 'lantern-string', 'stacked-hipped-roofs', 'tiered-gopuram', 'slab-panel-grid', 'vented-hawker-roof', 'street-gateway-arch', 'terraced-slope'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      pedestrians.forEach((person, index) => {
        const lane = index % 2 ? 80 : -15;
        person.position.x = -46 + ((time * 1.2 + index * 17) % 74);
        person.position.z = lane + (index % 4 - 1.5) * 1.6;
        person.rotation.y = -Math.PI / 2;
      });
    },
  });
}
