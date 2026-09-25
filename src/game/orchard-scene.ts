import * as THREE from 'three';
import { ORCHARD_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// On the one-way shopping boulevard, looking along the belt.
export const ORCHARD_SPAWN = { x: 30, z: 5, yaw: Math.PI / 2 };
export const ORCHARD_BOUNDS = { minX: -260, maxX: 260, minZ: -205, maxZ: 205 };
export { ORCHARD_STAMPS } from '../data/region-stamps.ts';

/** The boulevard is the z = 0 run; the rest is the grid it hangs off. */
const EW_ROADS = [-130, 0, 140], NS_ROADS = [-170, -60, 60, 175];
const EDGE_X = 235, EDGE_Z = 180;
export const ORCHARD_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];
/** Rain trees and street furniture stand off the junctions by this much. */
const clearOfJunction = (x: number, margin: number) => NS_ROADS.every(road => Math.abs(x - road) > margin);

/**
 * An authored, compressed interpretation of the Orchard Road shopping belt: a
 * wide one-way boulevard under rain trees, a scalloped glass mall
 * at the junction, a granite twin-tower podium, a pitched-roof department
 * store, blue-glazed Wisma frontage and a peranakan side lane. Compressed for play; selected Orchard exterior captures were visually reviewed
 * in September 2026 (see docs/evidence/central-district-review.md).
 *
 * Every block takes a `facing` of 1 or -1 so its frontage, canopy and forecourt
 * turn toward the boulevard from whichever side of it the block sits on.
 */
export function buildOrchardScene() {
  const kit = createSceneKit({
    background: '#cddbe4', fogNear: 280, fogFar: 840,
    sun: { x: -140, y: 205, z: -110 }, shadow: { extent: 250, far: 640 },
    hemisphere: { sky: '#f5f8fc', ground: '#79766b', intensity: 1.8 },
  });
  const { scene, box, cylinder, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#565c60'), white = mat('#eae8da'), paving = mat('#bdb8ac'), kerb = mat('#d0cabc');
  const granite = mat('#9d655a'), pale = mat('#e4ded0'), cream = mat('#e8dfc9'), concrete = mat('#aeaca2');
  const glass = mat('#7ba0b2', 0.22, 0.34), deepGlass = mat('#5f8798', 0.18, 0.42), steel = mat('#b0b7ba', 0.3, 0.55);
  const brass = mat('#c0982f', 0.4, 0.6), dark = mat('#36434a'), wood = mat('#7d6248'), skin = mat('#b18c71');
  const leaf = mat('#49713f'), canopy = mat('#5c8a4a'), lawn = mat('#8ea86d');
  const tileGreen = mat('#39614a'), orange = mat('#f0a044'), banner = mat('#a8402f'), awning = mat('#d8b24a');
  const teal = mat('#3f6f8c');
  const peranakan = ['#e7e5dc', '#e1e6d9', '#f1eee3', '#e2e7df', '#e9e6db'].map(color => mat(color));

  box(0, -0.6, 0, 600, 1, 500, paving);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // Orchard Road has an uninterrupted one-way carriageway here; trees belong
  // on the generous shopping footways, not an invented central garden.
  for (let x = -210; x < 220; x += 30) {
    if (!clearOfJunction(x, 18)) continue;
    box(x, 0.13, 0, 9, 0.025, 0.35, white);
    for (const side of [-1, 1]) {
      const arrow = box(x + 4, 0.14, side * 1.2, 3.4, 0.03, 0.35, white);
      arrow.rotation.y = side * 0.7;
    }
  }

  /** Rain tree: a broad flat crown on a short trunk, the boulevard's signature. */
  function rainTree(x: number, z: number, scale = 1) {
    cylinder(x, 4 * scale, z, 0.7 * scale, 8 * scale, wood); solid(x, z, 1.6, 1.6);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      blob(x + Math.cos(angle) * 5 * scale, (8.4 + (i % 2) * 0.9) * scale, z + Math.sin(angle) * 5 * scale, 5.4 * scale, 1.9 * scale, 5.4 * scale, i % 2 ? canopy : leaf);
    }
    blob(x, 9.6 * scale, z, 6.4 * scale, 2.1 * scale, 6.4 * scale, canopy);
  }
  for (let x = -222; x <= 222; x += 18) for (const z of [-13.5, 13.5]) if (clearOfJunction(x, 14)) rainTree(x, z);

  /** Faceted glass shell over a retail podium, twisted a little at each ring. */
  function crystalMall(x: number, z: number, facing: 1 | -1) {
    box(x, 12, z, 66, 24, 78, concrete, scene, true); solid(x, z, 66, 78);
    // Draped, scalloped metallic/glass skin seen in junction-road-02-180.
    // Alternating diagonal mullions form the visible triangular net.
    for (let col = 0; col < 18; col++) {
      const dx = -34 + col * 4, crown = 24 + 6 * Math.cos(dx / 11);
      for (let row = 0; row < 6; row++) {
        const y = 3 + row * (crown - 3) / 6;
        const bulge = 3.5 * Math.sin(row / 6 * Math.PI);
        box(x + dx, y, z + facing * (40 + bulge), 4.1, (crown - 3) / 6, 0.6, (col + row) % 4 ? glass : steel);
        const mesh = box(x + dx, y, z + facing * (40.6 + bulge), 0.24, 6.2, 0.25, steel);
        mesh.rotation.z = (col + row) % 2 ? 0.65 : -0.65;
      }
    }
    // Slender tower set back from the frontage, banded in glass and steel.
    box(x + 6, 52, z - facing * 8, 30, 56, 34, pale, scene, true);
    for (let y = 28; y < 78; y += 3.8) for (const side of [-1, 1]) {
      box(x + 6 + side * 15.4, y, z - facing * 8, 0.6, 2.6, 30, glass);
      box(x + 6, y, z - facing * 8 + side * 17.4, 26, 2.6, 0.6, glass);
    }
    box(x + 6, 81, z - facing * 8, 34, 2.4, 38, steel);
    for (const dx of [-11, 11]) cylinder(x + 6 + dx, 86, z - facing * 8, 0.5, 8, steel);
    // Entrance: a cantilevered canopy over a glazed wall facing the boulevard.
    box(x, 9.4, z + facing * 44, 34, 0.7, 14, steel, scene, true);
    for (const dx of [-13, 13]) { cylinder(x + dx, 4.6, z + facing * 49, 0.6, 9.2, steel); solid(x + dx, z + facing * 49, 1.3, 1.3); }
    for (let dx = -15; dx <= 15; dx += 5) box(x + dx, 6.4, z + facing * 39.2, 4.4, 12.8, 0.5, glass);
    sign('ION ORCHARD', x, 12.4, z + facing * 44.4, 30, 2.4, '#26343d');
  }

  /** Twin granite towers on a banded podium, behind a civic forecourt. */
  function civicTwins(x: number, z: number, facing: 1 | -1) {
    box(x, 8, z, 76, 16, 80, granite, scene, true); solid(x, z, 76, 80);
    box(x, 16.6, z, 80, 1.4, 84, pale);
    for (const dx of [-19, 19]) box(x + dx, 46, z - facing * 6, 28, 76, 30, granite, scene, true);
    for (const dx of [-19, 19]) for (let y = 20; y < 82; y += 4.4) for (const side of [-1, 1]) {
      box(x + dx, y, z - facing * 6 + side * 15.4, 24, 3, 0.6, glass);
      box(x + dx + side * 14.4, y, z - facing * 6, 0.6, 3, 26, glass);
    }
    for (const dx of [-19, 19]) { box(x + dx, 85, z - facing * 6, 30, 3.4, 32, pale); cylinder(x + dx, 92, z - facing * 6, 0.6, 10, steel); }
    // Forecourt: granite grid paving, monumental columns and flag masts.
    box(x, 0.2, z + facing * 48, 78, 0.4, 28, paving);
    // Takashimaya Square is a tiled forecourt, not the invented fountain.
    for (let dx = -36; dx <= 36; dx += 9) box(x + dx, 0.43, z + facing * 48, 0.7, 0.04, 28, granite);
    for (let dz = 36; dz <= 60; dz += 8) box(x, 0.43, z + facing * dz, 78, 0.04, 0.7, granite);
    for (const dx of [-29, -14, 14, 29]) {
      box(x + dx, 7, z + facing * 40.8, 3.4, 14, 3.2, granite);
      solid(x + dx, z + facing * 40.8, 3.4, 3.2);
    }
    for (const dx of [-30, -22, 22, 30]) {
      cylinder(x + dx, 7, z + facing * 40, 0.22, 14, steel); solid(x + dx, z + facing * 40, 0.6, 0.6);
      box(x + dx + 1.8, 12.4, z + facing * 40, 3.4, 2.2, 0.16, banner);
    }
    for (let dx = -32; dx <= 32; dx += 8) box(x + dx, 9, z - facing * 33.4, 5.4, 16, 0.6, deepGlass);
    sign('NGEE ANN CITY', x, 12.6, z + facing * 41.8, 34, 2.4, '#3a3a36');
  }

  /** Cream retail block under layered green eaves. */
  function pitchedStore(x: number, z: number, facing: 1 | -1) {
    box(x, 9, z, 70, 18, 74, cream, scene, true); solid(x, z, 70, 74);
    for (const side of [-1, 1]) {
      const roof = box(x, 22.4, z + side * 19, 72, 0.8, 40, tileGreen, scene, true);
      roof.rotation.x = side * 0.42;
    }
    for (let t = -30; t <= 30; t += 2.4) box(x, 23.2 - Math.abs(t) * 0.42, z + t, 71, 0.16, 2.1, tileGreen);
    box(x, 30.6, z, 74, 1.2, 5, tileGreen);
    for (const dx of [-28, 0, 28]) { const ridge = box(x + dx, 31.8, z, 6.4, 1.6, 6.4, brass, scene, true); ridge.rotation.y = 0.4; }
    // Broad stacked green eaves, as seen from tangs-road-02-0. The old
    // free-standing corner rotunda was invented and has been removed.
    for (const y of [11, 18, 25]) {
      box(x, y, z + facing * 37, 72, 0.7, 6, tileGreen);
      for (const side of [-1, 1]) {
        const tip = box(x + side * 35, y + 0.8, z + facing * 37, 6, 0.6, 6, tileGreen);
        tip.rotation.z = side * 0.24;
      }
    }
    for (let dx = -30; dx < 32; dx += 7.5) { box(x + dx, 5.4, z + facing * 37.4, 6, 10.4, 0.5, glass); box(x + dx, 11.4, z + facing * 37.8, 6.6, 1.5, 0.9, tileGreen); }
    for (let dz = -26; dz < 28; dz += 7.5) box(x + 35.4, 5.4, z + dz, 0.5, 10.4, 6, glass);
    const tangsSign = sign('TANGS', x + 8, 13.4, z + facing * 37.9, 16, 2.6, '#2f5140');
    if (tangsSign && facing === -1) tangsSign.rotation.y = Math.PI;
  }

  /** Wisma Atria: a blue glazed frontage, broad retail podium and tower. */
  function terraceMall(x: number, z: number, facing: 1 | -1) {
    box(x, 10, z, 68, 20, 76, deepGlass, scene, true); solid(x, z, 68, 76);
    for (let dx = -32; dx <= 32; dx += 4) {
      box(x + dx, 10, z + facing * 38.4, 0.35, 20, 0.6, steel);
    }
    for (const y of [5, 10, 15, 20]) box(x, y, z + facing * 38.6, 68, 0.4, 0.5, steel);
    box(x, 42, z - facing * 15, 36, 44, 34, pale, scene, true);
    for (let y = 24; y < 64; y += 3.6) box(x, y, z - facing * 15 + facing * 17.3, 33, 2.4, 0.6, glass);
    box(x, 6, z + facing * 43, 56, 0.6, 10, glass);
    sign('WISMA ATRIA', x, 13, z + facing * 39, 28, 2.4, '#23455e');
  }

  /** Open youth plaza: a screen wall, seating steps and a skate bowl rim. */
  function youthPlaza(x: number, z: number, facing: 1 | -1) {
    box(x, 0.2, z, 74, 0.4, 82, paving);
    box(x + 24, 14, z + facing * 16, 26, 28, 48, concrete, scene, true); solid(x + 24, z + facing * 16, 26, 48);
    for (let y = 4; y < 27; y += 3.6) for (let dz = -20; dz < 22; dz += 6) box(x + 10.6, y, z + facing * 16 + dz, 0.6, 2.6, 4.6, glass);
    box(x + 24, 29.4, z + facing * 16, 30, 1.6, 52, steel);
    // Screen wall and its frame, turned toward the plaza.
    box(x - 16, 10, z + facing * 30, 34, 20, 2.4, dark, scene, true); solid(x - 16, z + facing * 30, 34, 2.6);
    box(x - 16, 11.4, z + facing * 28.6, 29, 15, 0.4, deepGlass);
    for (const dx of [-17.4, 17.4]) cylinder(x - 16 + dx, 10, z + facing * 30, 0.7, 20, steel);
    for (let step = 0; step < 4; step++) {
      const cz = z + facing * (16 + step * 4);
      box(x - 16, 0.4 + step * 0.9, cz, 34, 0.9 + step * 0.8, 4, concrete); solid(x - 16, cz, 34, 4);
    }
    // Bowl rim: low blocks the player walks between, not a closed ring wall.
    for (let i = 0; i < 14; i++) {
      const angle = i * Math.PI * 2 / 14, bx = x - 10 + Math.cos(angle) * 20, bz = z - facing * 22 + Math.sin(angle) * 14;
      const lip = box(bx, 0.6, bz, 5, 1.2, 3, concrete); lip.rotation.y = -angle; solid(bx, bz, 3.4, 3.4);
    }
    for (const dx of [-30, 30]) for (const dz of [-34, 34]) tree(x + dx, z + dz, 8, wood, leaf);
    const somersetSign = sign('SOMERSET', x - 16, 21.4, z + facing * 31.4, 28, 2.3, '#2c3a44');
    if (somersetSign && facing === -1) somersetSign.rotation.y = Math.PI;
  }

  /** Peranakan terrace: pastel facades, louvred shutters and pilasters. */
  function peranakanRow(startX: number, z: number, count: number, facing: 1 | -1, width = 11) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, body = peranakan[(i + (z > 0 ? 1 : 0)) % peranakan.length];
      box(x, 6, z, width - 0.4, 12, 16, body, scene, true); solid(x, z, width, 16);
      const front = z + facing * 8;
      box(x, 12.6, z, width, 1, 17, cream);
      for (const dx of [-width / 2 + 0.6, width / 2 - 0.6]) box(x + dx, 6.4, z, 1.1, 12.8, 17, cream);
      for (const dx of [-3, 3]) {
        box(x + dx, 8.4, front + facing * 0.12, 2.4, 4, 0.24, wood);
        for (let y = 6.8; y < 10.4; y += 0.45) box(x + dx, y, front + facing * 0.26, 2.2, 0.14, 0.16, cream);
        box(x + dx, 10.8, front + facing * 0.34, 3, 0.4, 0.5, cream);
      }
      box(x, 2.3, front + facing * 0.14, 3.6, 4.6, 0.22, wood);
      box(x, 4.9, front + facing * 0.5, width - 1, 0.35, 1.4, awning);
      for (const dx of [-width / 2 + 1.4, width / 2 - 1.4]) { cylinder(x + dx, 2.3, front + facing * 2.6, 0.3, 4.6, cream); solid(x + dx, front + facing * 2.6, 0.8, 0.8); }
      box(x, 4.7, front + facing * 2.6, width, 0.4, 4.4, cream, scene, true);
      box(x, 0.24, front + facing * 2.5, width, 0.3, 4.2, paving);
    }
  }

  /** Street-level MRT entrance under a glass shell. */
  function mrtEntrance(x: number, z: number, label: string) {
    box(x, 1.5, z, 13, 3, 8, dark); solid(x, z, 13, 8);
    box(x, 3.5, z, 15, 0.4, 10, glass, scene, true);
    for (const dx of [-6, 6]) { cylinder(x + dx, 1.8, z + 4.2, 0.26, 3.6, steel); solid(x + dx, z + 4.2, 0.7, 0.7); }
    box(x, 1.7, z + 4.3, 12, 2.9, 0.14, glass);
    sign(label, x, 4.5, z + 5.2, 12, 1.3, '#b8342c');
  }

  /** Covered footway: paired columns under a shallow roof, set behind the kerb. */
  function covered(fromX: number, toX: number, z: number) {
    box((fromX + toX) / 2, 5.2, z, toX - fromX, 0.4, 7, pale, scene, true);
    for (let x = fromX + 3; x < toX; x += 9) for (const dz of [-3, 3]) { cylinder(x, 2.6, z + dz, 0.26, 5.2, pale); solid(x, z + dz, 0.7, 0.7); }
    for (let x = fromX + 4; x < toX; x += 18) box(x, 4.7, z, 4.4, 0.3, 6, awning);
  }

  /** Pedestrian bridge across the boulevard, landing clear of the median. */
  function overheadBridge(x: number) {
    for (const side of [-1, 1]) {
      box(x, 4.4, side * 16, 4.4, 8.8, 4.4, concrete); solid(x, side * 16, 4.6, 4.6);
      for (let step = 0; step < 6; step++) box(x + 3.4, 1.2 + step * 1.3, side * (19 + step * 1.6), 3, 0.5, 2.6, concrete);
    }
    box(x, 9.2, 0, 4.6, 0.6, 32, concrete, scene, true);
    for (const side of [-1, 1]) {
      box(x + side * 2.3, 10.4, 0, 0.35, 2.2, 32, steel);
      for (let dz = -14; dz <= 14; dz += 3.5) cylinder(x + side * 2.3, 10.4, dz, 0.12, 2.2, steel);
    }
    for (let dz = -14; dz <= 14; dz += 7) box(x, 11.8, dz, 5.4, 0.3, 1.4, pale);
  }

  crystalMall(-115, -65, 1);
  terraceMall(0, -65, 1);
  pitchedStore(-115, 70, -1);
  // The hotel tower rises behind the Chinese tiled TANGS podium.
  box(-112, 54, 76, 30, 70, 30, cream);
  for (let y = 24; y < 89; y += 3.8) for (const side of [-1, 1]) {
    box(-112, y, 76 + side * 15.2, 26, 1.8, 0.4, glass);
    box(-112 + side * 15.2, y, 76, 0.4, 1.8, 26, glass);
  }
  const hotelRoof = new THREE.Mesh(geo(new THREE.ConeGeometry(21, 17, 8)), tileGreen);
  hotelRoof.position.set(-112, 97, 76); scene.add(hotelRoof);
  civicTwins(117, -65, 1);
  youthPlaza(0, 70, -1);
  // Emerald Hill is at the Somerset end, east of the ION/Wisma/Ngee Ann run.
  peranakanRow(84, 52, 6, -1);
  peranakanRow(84, 96, 6, 1);
  mrtEntrance(-33, -16, 'NS22 / TE14  ORCHARD');
  mrtEntrance(147, -16, 'NS23  SOMERSET');
  covered(-206, -132, -17);
  covered(24, 96, -17);
  covered(-96, -24, 17);
  overheadBridge(165);
  // Orchard Gateway's enclosed glazed link, near Somerset rather than ION.
  box(165, 11.5, 0, 5.4, 4, 32, glass);
  for (const y of [9.5, 13.5]) box(165, y, 0, 5.8, 0.3, 32, steel);

  // East park: open lawn and a bandstand, kept clear of the practice range.
  box(205, 0.18, 60, 44, 0.35, 210, lawn);
  for (let step = 0; step < 3; step++) cylinder(205, 0.5 + step * 0.5, -20, 11 - step * 2.6, 1 + step * 0.4, step % 2 ? pale : concrete);
  for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; cylinder(205 + Math.cos(angle) * 8, 3.4, -20 + Math.sin(angle) * 8, 0.35, 6.8, pale); }
  const dome = new THREE.Mesh(geo(new THREE.SphereGeometry(9, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2)), tileGreen);
  dome.position.set(205, 7, -20); dome.castShadow = true; scene.add(dome); solid(205, -20, 20, 20);
  for (const z of [-52, 8, 168]) { box(197, 0.85, z, 3.4, 0.22, 1.2, wood); solid(197, z, 3.6, 1.2); }
  for (const z of [-56, -34, 8, 30, 166]) { tree(228, z, 9, wood, leaf); tree(186, z + 12, 8, wood, leaf); }

  // West strip: a hotel slab, its porte-cochere and a taxi queue.
  box(-202, 26, -60, 24, 52, 88, pale, scene, true); solid(-202, -60, 24, 88);
  for (let y = 5; y < 52; y += 4) for (let dz = -38; dz < 40; dz += 6) {
    box(-190.4, y, -60 + dz, 0.5, 2.6, 4.6, glass);
    if ((Math.round(dz / 6) + Math.round(y)) % 3 === 0) box(-190.8, y - 1.4, -60 + dz, 1.2, 0.4, 5, steel);
  }
  box(-202, 53.4, -60, 28, 2.2, 92, steel);
  box(-196, 6.4, -14, 20, 0.6, 14, steel, scene, true);
  for (const dx of [-8, 8]) { cylinder(-196 + dx, 3.2, -9, 0.5, 6.4, steel); solid(-196 + dx, -9, 1.1, 1.1); }
  for (let z = 24; z < 96; z += 12) { box(-206, 1.4, z, 4.4, 2.6, 8, teal); solid(-206, z, 4.6, 8.2); }
  sign('TAXI STAND', -206, 5, 20, 18, 1.8, '#2c4450');

  // Bus shelters and banner poles down both footways, off the junctions.
  for (let x = -214; x <= 214; x += 34) {
    if (!clearOfJunction(x, 16)) continue;
    for (const side of [-1, 1]) {
      box(x, 2.9, side * 22, 9, 0.3, 4.4, awning, scene, true);
      for (const dx of [-4, 4]) { cylinder(x + dx, 1.45, side * 23.6, 0.16, 2.9, steel); solid(x + dx, side * 23.6, 0.5, 0.5); }
      box(x - 4.6, 1.6, side * 22, 0.3, 3.2, 4.2, deepGlass);
    }
  }
  for (let x = -200; x <= 200; x += 50) if (clearOfJunction(x, 20)) for (const side of [-1, 1]) {
    cylinder(x, 5.4, side * 26, 0.2, 10.8, dark); solid(x, side * 26, 0.6, 0.6);
    for (const dy of [-1.4, 1.6]) box(x + 1.6, 8.4 + dy, side * 26, 2.8, 1.4, 0.12, banner);
  }

  // Low shop rows close the long blocks; perimeter planting frames the grid.
  peranakanRow(-224, -155, 4, 1, 12);
  peranakanRow(-40, -155, 5, 1, 12);
  peranakanRow(78, -155, 6, 1, 12);
  peranakanRow(-158, 160, 6, -1, 12);
  peranakanRow(-40, 160, 5, -1, 12);
  for (const z of [-EDGE_Z - 14, EDGE_Z + 14]) for (let x = -210; x <= 210; x += 30) rainTree(x, z, 0.8);
  for (const x of [-EDGE_X - 14, EDGE_X + 14]) for (let z = -160; z <= 160; z += 28) tree(x, z, 8, wood, leaf);

  const pedestrians = ['#eae8da', '#7ba0b2', '#d8b24a', '#8fb6ae'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-40 + index * 24, -17, shirt, skin, dark), walker(-30 + index * 20, 17, shirt, skin, dark)]);
  const car = kit.car(mat('#8a9fae'), glass, mat('#dcd7c7'), dark);
  const stamps = stampRings(ORCHARD_STAMPS, orange);
  scene.userData.districtFeatures = ['one-way-boulevard', 'rain-tree-crowns', 'faceted-glass-shell', 'granite-twin-towers', 'steep-pitched-tile-roof', 'tangs-layered-eaves', 'wisma-blue-glass', 'peranakan-shutters', 'covered-footway', 'overhead-crossing'];
  scene.userData.referenceFeatures = ['orchard-one-way-carriageway', 'ion-scalloped-diagrid', 'tangs-green-eaves-hotel-tower', 'ngee-ann-red-granite-square', 'emerald-pale-arcades', 'gateway-glass-link'];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      pedestrians.forEach((person, index) => {
        const lane = index % 2 ? 17 : -17;
        person.position.x = -120 + ((time * 1.4 + index * 31) % 250);
        person.position.z = lane + (index % 4 - 1.5) * 1.3;
        person.rotation.y = -Math.PI / 2;
      });
    },
  });
}
