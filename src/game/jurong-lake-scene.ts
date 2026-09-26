import * as THREE from 'three';
import { JURONG_LAKE_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';
import { withVerticalRoutes } from './vertical-routes';

export const JURONG_LAKE_SPAWN = { x: -20, z: 20, yaw: Math.PI / 2 };
export const JURONG_LAKE_BOUNDS = { minX: -270, maxX: 270, minZ: -230, maxZ: 230 };
export { JURONG_LAKE_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-130, 170], NS_ROADS = [10, 120];
const EDGE_X = 245, EDGE_Z = 200;
/** Lake, island and causeway share these extents with the collision rectangles. */
const LAKE = { minX: -230, maxX: -30, minZ: -80, maxZ: 120 };
const ISLAND = { minX: -175, maxX: -110, minZ: -25, maxZ: 65 };
const CAUSEWAY = { minZ: 12, maxZ: 28 };
export const JURONG_LAKE_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Jurong Lake district: a garden
 * lake with a tiered pagoda on a causeway island, a lakeside promenade, and the
 * mall, science-hall and interchange cluster on the eastern shore. Compressed for play; researched landmark corrections are documented in
 * docs/WEST-DISTRICT-REVIEW.md. Garden-path Street View is reviewed; pagoda imagery remains unverified.
 */
export function buildJurongLakeScene() {
  const kit = createSceneKit({
    background: '#c6d9e2', fogNear: 300, fogFar: 900,
    sun: { x: 140, y: 210, z: 120 }, shadow: { extent: 260, far: 660 },
    hemisphere: { sky: '#f2f8fb', ground: '#74795f', intensity: 1.85 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#575e62'), white = mat('#e9e7d8'), paving = mat('#bdb9ac'), kerb = mat('#cec9ba');
  const water = mat('#5d93a4', 0.42), shallow = mat('#6fa5b2', 0.4), grass = mat('#87a06c'), lawn = mat('#93ac74');
  // Shots into these splash rather than spark; see water.ts.
  markWater(water, shallow);
  const stone = mat('#b6b5ac'), pale = mat('#ded8c8'), dark = mat('#39464a'), wood = mat('#7c6046');
  const lacquer = mat('#a8402f'), gold = mat('#c59a34', 0.42, 0.55);
  const leaf = mat('#4e7444'), willow = mat('#6f9153'), orange = mat('#f0a044'), skin = mat('#b18c71');
  const glass = mat('#6d90a0', 0.24, 0.3), steel = mat('#adb5b8', 0.3, 0.55), concrete = mat('#a8a79d');

  box(0, -0.5, 0, 620, 1, 540, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // Lake surface, then the five water rectangles that leave the causeway and
  // the garden island walkable. Collision and geometry read the same extents.
  box((LAKE.minX + LAKE.maxX) / 2, -0.06, (LAKE.minZ + LAKE.maxZ) / 2, LAKE.maxX - LAKE.minX, 0.36, LAKE.maxZ - LAKE.minZ, water);
  const pools: [number, number, number, number][] = [
    [LAKE.minX, ISLAND.minX, LAKE.minZ, LAKE.maxZ],
    [ISLAND.minX, ISLAND.maxX, LAKE.minZ, ISLAND.minZ],
    [ISLAND.minX, ISLAND.maxX, ISLAND.maxZ, LAKE.maxZ],
    [ISLAND.maxX, LAKE.maxX, LAKE.minZ, CAUSEWAY.minZ],
    [ISLAND.maxX, LAKE.maxX, CAUSEWAY.maxZ, LAKE.maxZ],
  ];
  for (const [minX, maxX, minZ, maxZ] of pools) solid((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ);
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 26; i++) {
    const ripple = box(LAKE.minX + 14 + (i * 37) % 176, 0.14, LAKE.minZ + 12 + (i * 53) % 188, 9 + i % 4, 0.02, 0.2, shallow);
    ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
  }

  // Island platform, causeway deck and the shoreline edging around both.
  box((ISLAND.minX + ISLAND.maxX) / 2, 0.14, (ISLAND.minZ + ISLAND.maxZ) / 2, ISLAND.maxX - ISLAND.minX, 0.44, ISLAND.maxZ - ISLAND.minZ, lawn);
  box((ISLAND.minX + ISLAND.maxX) / 2, 0.18, (ISLAND.minZ + ISLAND.maxZ) / 2, ISLAND.maxX - ISLAND.minX + 4, 0.3, ISLAND.maxZ - ISLAND.minZ + 4, stone);
  box((ISLAND.maxX + LAKE.maxX) / 2, 0.18, (CAUSEWAY.minZ + CAUSEWAY.maxZ) / 2, LAKE.maxX - ISLAND.maxX, 0.36, CAUSEWAY.maxZ - CAUSEWAY.minZ, paving);
  for (const z of [CAUSEWAY.minZ + 0.8, CAUSEWAY.maxZ - 0.8]) {
    box((ISLAND.maxX + LAKE.maxX) / 2, 1.05, z, LAKE.maxX - ISLAND.maxX, 0.4, 0.6, pale);
    for (let x = ISLAND.maxX + 3; x < LAKE.maxX; x += 5) cylinder(x, 0.6, z, 0.16, 1.2, pale);
  }
  // The playable raised causeway now supplies the upper deck and continuous
  // rails. Remove the old disconnected arch blocks outside its footprint.

  /** Cloud Pagoda: seven octagonal storeys, pale galleries and tiled eaves.
   * Form follows NParks' Cloud Pagoda description; see WEST-DISTRICT-REVIEW.md.
   * The footprint remains compressed within the existing walkable island.
   */
  function pagoda(x: number, z: number) {
    box(x, 0.3, z, 34, 0.6, 34, stone); solid(x, z, 24, 24);
    const roofTile = mat('#b98b39'), plaster = mat('#f0ebdc');
    function octagon(y: number, radius: number, height: number, material: THREE.Material, top = radius) {
      const mesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(top, radius, height, 8)), material);
      mesh.position.set(x, y, z); mesh.rotation.y = Math.PI / 8;
      mesh.castShadow = true; scene.add(mesh);
    }
    for (let tier = 0; tier < 7; tier++) {
      const r = 10.8 - tier * 0.82, y = 3.7 + tier * 6.2;
      octagon(y, r, 5.8, plaster);
      octagon(y + 2.6, r + 2.2, 0.45, plaster);
      octagon(y + 3.7, r + 3.2, 1.5, roofTile, r - 0.6);
      // Eight repeated recessed openings and open gallery balustrades.
      for (let face = 0; face < 8; face++) {
        const angle = face * Math.PI / 4, nx = Math.sin(angle), nz = Math.cos(angle);
        const opening = box(x + nx * r * 0.925, y, z + nz * r * 0.925, 2.5, 3.6, 0.2, dark);
        opening.rotation.y = angle;
        const rail = box(x + nx * (r + 1.6), y + 1.8, z + nz * (r + 1.6), r * 0.8, 0.3, 0.35, plaster);
        rail.rotation.y = angle;
        for (const offset of [-0.25, 0, 0.25]) {
          cylinder(x + nx * (r + 1.6) + Math.cos(angle) * r * offset, y + 1.2,
            z + nz * (r + 1.6) - Math.sin(angle) * r * offset, 0.12, 1.3, plaster);
        }
      }
    }
    cylinder(x, 47.5, z, 0.55, 6, gold);
    sign('CLOUD PAGODA', x, 3, z + 18, 17, 1.5, '#4c5543');
  }

  /** Moon gate, guardian plinths and stone lanterns at the causeway landing. */
  function gardenGate(x: number, z: number) {
    const ringGeo = geo(new THREE.TorusGeometry(5.4, 1.1, 6, 22));
    const gate = new THREE.Mesh(ringGeo, lacquer); gate.position.set(x, 6.4, z); gate.rotation.y = Math.PI / 2; scene.add(gate);
    for (const side of [-1, 1]) { box(x, 3, z + side * 6.6, 2.6, 6, 2.6, pale); solid(x, z + side * 6.6, 2.8, 2.8); }
    for (const side of [-1, 1]) {
      const px = x - 14, pz = z + side * 9;
      box(px, 0.9, pz, 2.4, 1.8, 2.4, stone); solid(px, pz, 2.6, 2.6);
      cylinder(px, 2.4, pz, 0.5, 1.6, stone); cylinder(px, 3.6, pz, 1.5, 1.2, pale);
      const cap = new THREE.Mesh(geo(new THREE.ConeGeometry(1.7, 1.5, 6)), stone); cap.position.set(px, 4.9, pz); scene.add(cap);
    }
  }

  // Reviewed June 2016 garden preview: unmarked asphalt, shallow drain and
  // disc-top lamps. It does not show the pagoda or the redeveloped garden.
  box(-142, 0.36, 54, 55, 0.08, 6, asphalt);
  box(-169, 0.36, 17, 5, 0.08, 74, asphalt);
  box(-173, 0.39, 2, 0.7, 0.15, 34, dark);
  for (const z of [-18, 54]) {
    cylinder(-162, 3.1, z, 0.11, 6.2, dark); solid(-162, z, 0.25, 0.25);
    cylinder(-162, 6.3, z, 0.9, 0.12, dark);
    cylinder(-162, 6.05, z, 0.25, 0.45, white);
  }
  pagoda(-142, 20);
  gardenGate(-32, 20);
  for (const x of [-168, -118]) for (const z of [-14, 48]) {
    cylinder(x, 4, z, 0.5, 8, wood); solid(x, z, 1, 1);
    for (let i = 0; i < 5; i++) blob(x + (i - 2) * 1.5, 8.6 - Math.abs(i - 2) * 0.6, z, 2.2, 2.6, 2.2, willow);
  }
  for (const z of [-18, 56]) { box(-142, 0.85, z, 7, 0.22, 2.4, wood); solid(-142, z, 7, 2.4); }

  // Eastern shore: seawall, boardwalk, lamps, benches and viewing platforms.
  // The wall runs only as far as the lake, so the cross streets stay open.
  box(-22, 0.16, 20, 16, 0.36, 210, paving);
  // Two runs, parted at the causeway mouth so the island stays reachable.
  for (const [from, to] of [[-85, CAUSEWAY.minZ], [CAUSEWAY.maxZ, 125]] as const) {
    box(-30.6, 0.6, (from + to) / 2, 1.6, 1.2, to - from, stone);
    solid(-30.6, (from + to) / 2, 1.6, to - from);
  }
  for (let z = -84; z < 124; z += 9) box(-22, 0.36, z, 15, 0.06, 6.4, wood);
  for (let z = -80; z < 120; z += 26) { box(-14, 3.6, z, 0.18, 7.2, 0.18, dark); box(-14, 6.9, z - 1, 0.24, 0.3, 2.2, white); solid(-14, z, 0.4, 0.4); }
  for (const z of [-60, 40, 100]) { box(-20, 0.85, z, 3.4, 0.22, 1.1, wood); box(-20, 1.3, z + 0.5, 3.4, 0.9, 0.12, wood); solid(-20, z, 3.6, 1.2); }
  for (let z = -80; z < 120; z += 30) tree(-8, z, 8, wood, leaf);

  /** Glass retail box over a banded podium, with a canopied entrance. */
  function mall(x: number, z: number, w: number, d: number, label: string, height = 30) {
    box(x, height / 2, z, w, height, d, concrete, scene, true); solid(x, z, w, d);
    for (let y = 4; y < height; y += 5.4) for (let dx = -w / 2 + 4; dx < w / 2 - 2; dx += 7) {
      box(x + dx, y, z - d / 2 - 0.3, 6, 3.4, 0.5, glass);
      box(x + dx, y, z + d / 2 + 0.3, 6, 3.4, 0.5, glass);
    }
    for (let dz = -d / 2 + 4; dz < d / 2 - 2; dz += 7) for (const side of [-1, 1]) box(x + side * (w / 2 + 0.3), 12, z + dz, 0.5, 20, 6, glass);
    box(x, height + 1.4, z, w + 3, 2.2, d + 3, steel);
    for (let dx = -w / 2 + 6; dx < w / 2 - 4; dx += 9) box(x + dx, height + 4, z, 3, 3.4, d - 10, concrete);
    box(x, 6.4, z - d / 2 - 5, w * 0.5, 0.6, 10, steel, scene, true);
    for (const dx of [-w * 0.22, w * 0.22]) { cylinder(x + dx, 3.2, z - d / 2 - 8, 0.5, 6.4, steel); solid(x + dx, z - d / 2 - 8, 1.1, 1.1); }
    if (label === 'JEM') {
      // March 2025 exterior preview: broad white overhangs, recessed glazing
      // and a planted balcony give JEM a distinct frontage from the other malls.
      const facadeWhite = mat('#edece6'), terraceLeaf = mat('#537746');
      const front = z - d / 2;
      box(x, 6, front - 0.7, w - 4, 11, 0.6, glass);
      for (let dx = -w / 2 + 4; dx < w / 2; dx += 8) box(x + dx, 6, front - 1.1, 0.3, 11, 0.3, dark);
      box(x, 14, front - 2, w + 2, 5, 7, facadeWhite, scene, true);
      box(x + 17, 23, front - 1, w * 0.46, 12, 3, facadeWhite, scene, true);
      box(x - 22, 21, front - 0.5, w * 0.38, 7, 0.6, glass);
      for (let dx = -32; dx <= 32; dx += 8) blob(x + dx, 17.4, front - 2.4, 4, 0.8, 1.4, terraceLeaf);
      box(x, 8.4, front - 5.5, w - 8, 0.3, 8, steel);
    }
    sign(label, x, 8.4, z - d / 2 - 5.4, w * 0.45, 2.4, '#2f4a56');
  }

  mall(65, -60, 80, 70, 'JEM');
  mall(65, 60, 80, 70, 'WESTGATE', 26);
  mall(172, 80, 80, 80, 'IMM', 22);

  /** Faceted science hall: a stepped drum beside a long exhibition block. */
  function scienceHall(x: number, z: number) {
    box(x, 8, z, 80, 16, 60, pale, scene, true); solid(x, z, 80, 70);
    for (let n = 0; n < 5; n++) {
      const facet = box(x - 6 + n * 3, 17 + n * 2.6, z, 78 - n * 12, 2.8, 58 - n * 9, n % 2 ? steel : pale, scene, true);
      facet.rotation.y = n * 0.06;
    }
    for (let dx = -34; dx < 36; dx += 8) { box(x + dx, 8, z - 31, 5.4, 12, 0.6, glass); box(x + dx, 15, z - 31.4, 6.4, 1, 1.2, steel); }
    cylinder(x + 30, 14, z + 26, 13, 28, steel); solid(x + 30, z + 26, 27, 27);
    for (let ring = 0; ring < 6; ring++) cylinder(x + 30, 28 + ring * 1.7, z + 26, 12.4 * Math.cos(ring / 6 * Math.PI / 2.1), 1.8, glass);
    for (let dz = -10; dz <= 10; dz += 5) box(x - 41, 6, z + dz, 0.6, 12, 3.4, glass);
    box(x, 0.2, z - 38, 92, 0.4, 20, paving);
    sign('SCIENCE CENTRE', x, 6.4, z - 31.6, 30, 2.3, '#2f4a56');
  }
  scienceHall(170, -70);

  // Elevated rail: viaduct deck on piers, with a station over the east road.
  for (let x = -240; x <= 240; x += 30) { cylinder(x, 6, 140, 1.7, 12, concrete); solid(x, 140, 3.6, 3.6); }
  box(0, 12.6, 140, 500, 1.6, 11, concrete);
  for (const side of [-1, 1]) box(0, 14.2, 140 + side * 5, 500, 1.6, 1, pale);
  for (let x = -238; x < 240; x += 6) box(x, 13.6, 140, 1.2, 0.4, 9, dark);
  box(65, 18, 140, 62, 9, 24, pale, scene, true); solid(65, 140, 40, 16);
  for (let dx = -28; dx < 30; dx += 6) box(65 + dx, 18, 128, 4.6, 6.4, 0.5, glass);
  for (const side of [-1, 1]) { const roof = box(65, 23.6, 140 + side * 7, 64, 0.6, 16, steel, scene, true); roof.rotation.x = side * 0.16; }
  box(52, 6.5, 128, 8, 13, 5, concrete); solid(52, 128, 8, 5);
  sign('EW24 / NS1  JURONG EAST', 65, 14.6, 127.4, 26, 2.2, '#1c6b4f');

  // Bus interchange: sawtooth berths under a long shelter.
  box(65, 0.18, 187, 150, 0.35, 30, asphalt);
  box(65, 4.6, 187, 70, 0.5, 16, steel, scene, true); solid(65, 187, 70, 16);
  for (let dx = -30; dx < 32; dx += 10) { cylinder(65 + dx, 2.3, 193, 0.35, 4.6, steel); solid(65 + dx, 193, 0.8, 0.8); }
  for (let dx = -32; dx < 34; dx += 11) { box(65 + dx, 1.5, 178, 9, 3, 3.4, mat(['#c4d0cf', '#5f8f7c', '#c98a4a'][Math.abs(Math.round(dx / 11)) % 3])); solid(65 + dx, 178, 9, 3.4); }
  sign('JURONG EAST INTERCHANGE', 65, 6, 195.4, 36, 2.2, '#2f4a56');

  /** Small pond garden: raked gravel, a red arched bridge and stone lanterns. */
  function pondGarden(x: number, z: number) {
    box(x, 0.18, z, 96, 0.35, 76, lawn);
    box(x, 0.02, z + 8, 60, 0.4, 30, water); solid(x - 22, z + 8, 16, 30); solid(x + 22, z + 8, 16, 30);
    for (let n = 0; n <= 12; n++) {
      const angle = Math.PI * n / 12, bx = x + Math.cos(angle) * 11;
      box(bx, 0.8 + Math.sin(angle) * 2.6, z + 8, 2.4, 0.5, 7, lacquer);
      for (const side of [-1, 1]) box(bx, 1.9 + Math.sin(angle) * 2.6, z + 8 + side * 3.2, 2.3, 1.1, 0.3, lacquer);
    }
    for (let gx = -40; gx < 42; gx += 4) box(x + gx, 0.38, z - 24, 3.4, 0.03, 22, pale);
    for (const dx of [-34, 34]) for (const dz of [-26, 24]) {
      box(x + dx, 0.8, z + dz, 2.2, 1.6, 2.2, stone); cylinder(x + dx, 2.2, z + dz, 0.45, 1.4, stone);
      cylinder(x + dx, 3.3, z + dz, 1.4, 1.1, pale); solid(x + dx, z + dz, 2.4, 2.4);
      const cap = new THREE.Mesh(geo(new THREE.ConeGeometry(1.6, 1.4, 6)), stone); cap.position.set(x + dx, 4.5, z + dz); scene.add(cap);
    }
    for (const dx of [-42, -14, 14, 42]) tree(x + dx, z + 32, 8, wood, willow);
    sign('JAPANESE GARDEN', x, 5.2, z - 36.4, 28, 2.1, '#2e6b52');
  }
  pondGarden(-200, 150);

  // Southern park: open lawn, a pavilion, planting beds and a playing field.
  box(-60, 0.18, -160, 180, 0.35, 70, lawn);
  solid(-130, -160, 2, 2);

  for (const x of [-148, -126, 10, 26]) for (const z of [-188, -166, -140]) tree(x, z, 8, wood, leaf);
  // The Lone Tree is a recycled-iron sculpture, not a leafy living tree.
  // A small garden counterpart replaces the anonymous shelter silhouette.
  const iron = mat('#544a40');
  cylinder(-130, 8, -160, 0.6, 16, iron);
  for (const [dx, dz, height] of [[-9, -3, 15], [8, 2, 17], [-5, 7, 19], [5, -7, 20]]) {
    beam(new THREE.Vector3(-130, 8, -160), new THREE.Vector3(-130 + dx, height, -160 + dz), 0.25, iron);
    beam(new THREE.Vector3(-130 + dx, height, -160 + dz), new THREE.Vector3(-130 + dx * 1.3, height + 3, -160 + dz * 1.2), 0.12, iron);
  }
  for (const z of [-186, -136]) { box(-108, 0.85, z, 8, 0.22, 2.4, wood); solid(-108, z, 8, 2.4); }
  for (let x = -20; x < 24; x += 10) box(x, 0.4, -160, 8, 0.15, 44, grass);
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -190; z < 200; z += 30) tree(x, z, 7, wood, leaf);
  for (let x = -230; x < 240; x += 34) tree(x, EDGE_Z + 16, 7, wood, leaf);

  const pedestrians = ['#e9e7d8', '#6d90a0', '#c98a4a', '#5f8f7c'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-20, 40 + index * 18, shirt, skin, dark), walker(-100 + index * 16, 20, shirt, skin, dark)]);
  const car = kit.car(mat('#7f9aa4'), glass, mat('#d9d4c4'), dark);
  const stamps = stampRings(JURONG_LAKE_STAMPS, orange);
  scene.userData.districtFeatures = ['seven-tier-octagonal-pagoda', 'pale-gallery-balustrades', 'raised-garden-causeway', 'moon-gate', 'stone-lanterns', 'lake-boardwalk', 'faceted-science-drum', 'elevated-viaduct', 'sawtooth-interchange', 'raked-gravel-garden'];
  scene.userData.referenceFeatures = ['chinese-garden-2016-asphalt-path-drain-disc-lamps', 'jem-2025-white-overhang-recessed-glazing-planted-ledge'];

  return withVerticalRoutes(kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.4 + index) * 1.6; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -104 + ((time * 1.2 + index * 21) % 76); person.rotation.y = -Math.PI / 2; }
        else { person.position.z = -40 + ((time * 1.4 + index * 27) % 150); person.rotation.y = Math.PI; }
      });
    },
  }), [
    { id: 'causeway-garden-bridge', name: 'Raised garden causeway', width: 5, color: '#c6c1b2', railColor: '#ded8c8',
      points: [{ x: -103, z: 20, y: 0 }, { x: -93, z: 20, y: 3 }, { x: -49, z: 20, y: 3 }, { x: -39, z: 20, y: 0 }],
      note: 'Playable rise within the existing compressed garden causeway; the neighbouring level lane remains an alternative.' },
    { id: 'jem-forecourt-terrace', foundation: 'solid', name: 'JEM forecourt terrace', width: 6, color: '#d6d5cb', railColor: '#81999b',
      points: [{ x: 35, z: -15, y: 0 }, { x: 47, z: -15, y: 3.2 }, { x: 83, z: -15, y: 3.2 }, { x: 95, z: -15, y: 0 }],
      note: 'Authored low retail terrace with two approaches, preserving ground circulation between the mall blocks; not a surveyed JEM floor.' },
  ]);
}
