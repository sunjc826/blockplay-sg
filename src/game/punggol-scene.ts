import * as THREE from 'three';
import { PUNGGOL_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// On the north promenade, looking across the waterway at the arch bridge.
export const PUNGGOL_SPAWN = { x: 20, z: -58, yaw: 0 };
export const PUNGGOL_BOUNDS = { minX: -270, maxX: 270, minZ: -230, maxZ: 230 };
export { PUNGGOL_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-180, 20, 160], NS_ROADS = [-160, -40, 80, 190];
const EDGE_X = 245, EDGE_Z = 205;
/**
 * The waterway is a channel, and a continuous one would cut the district in
 * two. It is cast as a run of segments instead, with a gap at every crossing:
 * one per cross street, plus the pair either side of the arch bridge, which is
 * therefore a real crossing on foot rather than scenery.
 */
const CHANNEL = { nearZ: -105, farZ: -75 }, ARCH_X = 20;
const CHANNEL_SPANS: readonly (readonly [number, number])[] = [
  [-233, -172], [-148, -52], [-28, 14], [26, 68], [92, 178], [202, 233],
];
/** Sheltered bay in the north-east corner, parted under the jetty. */
const BAY = { minZ: 160, maxZ: 193 }, JETTY_X = 215;
const BAY_SPANS: readonly (readonly [number, number])[] = [[202, 210], [220, 238]];
export const PUNGGOL_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Punggol waterfront town: a
 * planted waterway with promenades on both banks and an arched crossing, a
 * mall over the interchange, precinct slabs on void decks, an elevated light
 * rail loop, and a jetty out into a sheltered bay. Invented for play, without
 * reference capture.
 */
export function buildPunggolScene() {
  const kit = createSceneKit({
    background: '#c8dce6', fogNear: 300, fogFar: 920,
    sun: { x: -150, y: 215, z: 130 }, shadow: { extent: 270, far: 700 },
    hemisphere: { sky: '#f4fafd', ground: '#757a66', intensity: 1.86 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#575d61'), white = mat('#eae8da'), paving = mat('#bcb7aa'), kerb = mat('#cfc9bb');
  const water = mat('#4e8ba1', 0.4), shallow = mat('#63a2b2', 0.38), lawn = mat('#8ba76c'), grass = mat('#7d9761');
  const concrete = mat('#adaca2'), pale = mat('#e5dfd1'), stone = mat('#b5b4ab'), dark = mat('#37444b');
  const glass = mat('#6f95a6', 0.22, 0.32), steel = mat('#b0b8bb', 0.28, 0.55), wood = mat('#7b6148'), plank = mat('#9c7c57');
  const leaf = mat('#48733f'), reed = mat('#7d9a4e'), fern = mat('#5b8a4c'), orange = mat('#f0a044');
  const skin = mat('#b18c71'), teal = mat('#2f6b78'), rust = mat('#a8563a');
  const panels = ['#dcc98f', '#8fb6ae', '#c9a2a8', '#9db2c6', '#cfd3b6'].map(color => mat(color));

  box(0, -0.6, 0, 640, 1, 560, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // Waterway: one pool per span, with planted banks and reed beds that stop at
  // the same gaps so nothing sneaks a collider across a crossing.
  const ripples: THREE.Mesh[] = [];
  const midZ = (CHANNEL.nearZ + CHANNEL.farZ) / 2, depthZ = CHANNEL.farZ - CHANNEL.nearZ;
  for (const [fromX, toX] of CHANNEL_SPANS) {
    const width = toX - fromX, cx = (fromX + toX) / 2;
    box(cx, -0.06, midZ, width, 0.36, depthZ, water);
    solid(cx, midZ, width, depthZ);
    for (const side of [-1, 1]) {
      box(cx, 0.5, midZ + side * (depthZ / 2 + 3), width, 1, 6, lawn);
      box(cx, 1.1, midZ + side * (depthZ / 2 + 6.6), width, 0.5, 1.4, stone);
      for (let x = fromX + 4; x < toX; x += 7) {
        for (let r = 0; r < 3; r++) blob(x + r * 1.6, 1.5 + r * 0.3, midZ + side * (depthZ / 2 - 1.5), 0.9, 1.7, 0.7, reed);
      }
    }
    for (let i = 0; i * 19 < width; i++) {
      const ripple = box(fromX + 6 + i * 19, 0.14, midZ + ((i * 7) % 20) - 10, 7 + i % 4, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
  }
  // Promenades on both banks, and a deck over each cross-street crossing.
  for (const side of [-1, 1]) {
    box(0, 0.2, midZ + side * (depthZ / 2 + 11), 480, 0.4, 9, paving);
    for (let x = -230; x <= 230; x += 24) {
      cylinder(x, 3.4, midZ + side * (depthZ / 2 + 13.5), 0.16, 6.8, dark); solid(x, midZ + side * (depthZ / 2 + 13.5), 0.5, 0.5);
      box(x, 6.6, midZ + side * (depthZ / 2 + 13.5), 0.9, 0.35, 0.9, pale);
    }
  }
  for (const x of NS_ROADS) {
    box(x, 0.24, midZ, 26, 0.5, depthZ + 20, asphalt);
    for (const side of [-1, 1]) {
      box(x + side * 13.6, 1.2, midZ, 1.4, 1.8, depthZ + 20, concrete);
      solid(x + side * 13.6, midZ, 1.4, depthZ + 20);
    }
  }

  /** Arched footbridge: a rising deck on ribs, over the gap left for it. */
  function archBridge(x: number) {
    for (let n = 0; n <= 24; n++) {
      const t = n / 24, z = CHANNEL.nearZ - 12 + t * (depthZ + 24), rise = Math.sin(Math.PI * t) * 6.4;
      box(x, 0.6 + rise, z, 11, 0.4, (depthZ + 24) / 24 + 0.3, plank);
      for (const side of [-1, 1]) {
        box(x + side * 5.4, 1.5 + rise, z, 0.3, 1.5, (depthZ + 24) / 24 + 0.3, steel);
        if (n % 3 === 0) cylinder(x + side * 5.4, 1.2 + rise, z, 0.12, 1.4, steel);
      }
      if (n % 4 === 0 && rise > 0.6) for (const side of [-1, 1]) cylinder(x + side * 4.6, rise / 2, z, 0.2, rise, steel);
    }
    for (const side of [-1, 1]) {
      const zEnd = midZ + side * (depthZ / 2 + 12);
      for (let n = 0; n < 12; n++) {
        const t = n / 12;
        beam(new THREE.Vector3(x - 5.4, 2.4 + Math.sin(Math.PI * (0.5 + side * t * 0.5)) * 7, zEnd - side * t * 8),
          new THREE.Vector3(x + 5.4, 2.4 + Math.sin(Math.PI * (0.5 + side * t * 0.5)) * 7, zEnd - side * t * 8), 0.09, steel);
      }
    }
    sign('WATERWAY CROSSING', x, 9.4, CHANNEL.nearZ - 14, 22, 2.1, '#2f6b78');
  }
  archBridge(ARCH_X);

  /** Precinct slab: coloured panel bands over an open void deck on columns. */
  function hdbTower(x: number, z: number, height: number, width = 30) {
    for (const dx of [-width / 2 + 3, 0, width / 2 - 3]) for (const dz of [-8, 8]) {
      box(x + dx, 3, z + dz, 2.4, 6, 2.4, concrete); solid(x + dx, z + dz, 2.8, 2.8);
    }
    box(x, 6.4, z, width, 0.8, 22, concrete);
    box(x, height / 2 + 7, z, width, height, 20, pale, scene, true); solid(x, z, width, 20);
    for (let y = 9; y < height + 6; y += 3.2) {
      const band = panels[(Math.round(y / 3.2) + Math.round(x / 30)) % panels.length];
      for (const side of [-1, 1]) {
        box(x, y, z + side * 10.3, width - 2, 2.2, 0.5, band);
        for (let dx = -width / 2 + 3; dx < width / 2 - 1; dx += 5) box(x + dx, y, z + side * 10.6, 3, 1.5, 0.4, glass);
      }
      if (Math.round(y) % 4 === 0) for (const side of [-1, 1]) box(x + side * (width / 2 + 0.4), y, z, 0.5, 2.2, 18, band);
    }
    // Service core and the sky terrace that caps it.
    box(x, height / 2 + 9, z - 12, 9, height - 4, 6, concrete, scene, true); solid(x, z - 12, 9, 6);
    for (let y = 12; y < height + 4; y += 6) box(x, y, z - 15.3, 7, 3.4, 0.5, glass);
    box(x, height + 8, z, width + 3, 1.4, 23, stone);
    for (const dx of [-width / 4, width / 4]) box(x + dx, height + 10, z, 6, 2.6, 8, steel);
  }

  /** Playground court: rubber mat, climbing frame and a shade sail. */
  function precinctCourt(x: number, z: number) {
    box(x, 0.22, z, 44, 0.4, 34, mat('#b06a4a'));
    for (const dx of [-9, 9]) for (const dz of [-6, 6]) { cylinder(x + dx, 2, z + dz, 0.26, 4, steel); solid(x + dx, z + dz, 0.7, 0.7); }
    for (const dx of [-9, 9]) box(x + dx, 4.1, z, 0.6, 0.35, 12.6, steel);
    for (let dz = -6; dz <= 6; dz += 3) box(x, 4.1, z + dz, 18.6, 0.35, 0.6, steel);
    for (const dx of [-4, 4]) { const slide = box(x + dx, 2.4, z + 9, 2.2, 0.3, 7, panels[2], scene, true); slide.rotation.x = 0.5; }
    for (const [dx, dz] of [[-16, -11], [16, -11], [-16, 11], [16, 11]] as const) { cylinder(x + dx, 3.4, z + dz, 0.22, 6.8, steel); solid(x + dx, z + dz, 0.6, 0.6); }
    for (const side of [-1, 1]) { const sail = box(x, 6.6, z + side * 6, 34, 0.18, 14, panels[1], scene, true); sail.rotation.x = side * 0.14; }
    for (const dz of [-14, 14]) { box(x + 18, 0.85, z + dz, 3.4, 0.22, 1.2, wood); solid(x + 18, z + dz, 3.6, 1.2); }
  }

  /** Mall over the interchange: glazed box, a deep canopy and a bus apron. */
  function waterwayMall(x: number, z: number) {
    box(x, 14, z, 80, 28, 100, concrete, scene, true); solid(x, z, 80, 100);
    for (let y = 5; y < 28; y += 5.4) {
      for (let dx = -36; dx < 38; dx += 7) for (const side of [-1, 1]) box(x + dx, y, z + side * 50.4, 5.6, 3.4, 0.6, glass);
      for (let dz = -44; dz < 46; dz += 7) for (const side of [-1, 1]) box(x + side * 40.4, y, z + dz, 0.6, 3.4, 5.6, glass);
    }
    box(x, 29.6, z, 84, 2.2, 104, steel);
    for (let dx = -30; dx < 32; dx += 10) box(x + dx, 32, z, 4.4, 3.4, 90, concrete);
    box(x, 8.4, z - 56, 48, 0.8, 16, steel, scene, true);
    for (const dx of [-20, 20]) { cylinder(x + dx, 4.2, z - 62, 0.6, 8.4, steel); solid(x + dx, z - 62, 1.3, 1.3); }
    sign('WATERWAY POINT', x, 11.6, z - 56.4, 34, 2.4, '#2f6b78');
  }

  /**
   * Bus berths in the open block rather than against a kerb: the rank is split
   * either side of the entrance so the middle stays walkable.
   */
  function busApron(x: number, z: number) {
    box(x, 0.18, z, 96, 0.35, 26, asphalt);
    for (let dx = -32; dx <= 32; dx += 8) box(x + dx, 0.36, z + 9, 5, 0.02, 0.4, white);
    for (const dx of [-30, -18, 18, 30]) {
      box(x + dx, 1.5, z - 4, 9, 3, 3.4, panels[Math.abs(Math.round(dx / 12)) % panels.length]);
      solid(x + dx, z - 4, 9, 3.4);
    }
    box(x, 3.2, z + 6, 30, 0.35, 9, steel, scene, true);
    for (const dx of [-12, 12]) { cylinder(x + dx, 1.6, z + 9.4, 0.2, 3.2, steel); solid(x + dx, z + 9.4, 0.6, 0.6); }
    sign('PUNGGOL INTERCHANGE', x, 5.4, z + 11, 26, 2, '#2f6b78');
  }

  /** Elevated light rail: a slim deck on paired piers, with a station box. */
  function lrtViaduct(x: number, fromZ: number, toZ: number) {
    for (let z = fromZ; z <= toZ; z += 30) {
      for (const dx of [-3, 3]) cylinder(x + dx, 5.5, z, 1.1, 11, concrete);
      box(x, 11.4, z, 9, 1.4, 3.4, concrete); solid(x, z, 8, 3.6);
    }
    box(x, 12.8, (fromZ + toZ) / 2, 7.6, 1.4, toZ - fromZ, concrete);
    for (const side of [-1, 1]) box(x + side * 3.4, 14.2, (fromZ + toZ) / 2, 0.8, 1.6, toZ - fromZ, pale);
    for (let z = fromZ; z < toZ; z += 5) box(x, 13.8, z, 4.4, 0.3, 3.4, dark);
  }
  function lrtStation(x: number, z: number) {
    box(x, 16, z, 26, 10, 44, pale, scene, true); solid(x, z, 24, 44);
    for (let dz = -18; dz < 20; dz += 6) for (const side of [-1, 1]) box(x + side * 13.4, 16, z + dz, 0.5, 6.4, 4.4, glass);
    for (const side of [-1, 1]) { const roof = box(x, 21.6, z + side * 12, 30, 0.6, 26, steel, scene, true); roof.rotation.x = side * 0.16; }
    box(x - 11, 7.5, z - 26, 7, 15, 6, concrete); solid(x - 11, z - 26, 7, 6);
    box(x, 3.4, z - 30, 18, 0.5, 10, steel, scene, true);
    sign('PUNGGOL LRT', x, 13.4, z - 23.4, 20, 2, '#1c6b4f');
  }

  /** Bay jetty: a plank deck on piles reaching the gap left in the water. */
  function jetty(x: number) {
    box(x, 0.45, (BAY.minZ + BAY.maxZ) / 2 + 4, 9, 0.3, BAY.maxZ - BAY.minZ + 10, plank);
    for (let z = BAY.minZ - 4; z <= BAY.maxZ; z += 5) {
      box(x, 0.62, z, 8.6, 0.06, 1.8, wood);
      for (const dx of [-3.8, 3.8]) { cylinder(x + dx, 0.1, z, 0.28, 1.1, wood); if (z % 15 < 5) { cylinder(x + dx, 1.5, z, 0.18, 2.6, wood); solid(x + dx, z, 0.6, 0.6); } }
    }
    for (const dx of [-3.6, 3.6]) box(x + dx, 1.6, (BAY.minZ + BAY.maxZ) / 2 + 4, 0.14, 0.9, BAY.maxZ - BAY.minZ + 10, wood);
    for (const dx of [-3.2, 3.2]) for (const z of [BAY.minZ + 6, BAY.maxZ - 4]) {
      cylinder(x + dx, 3.4, z, 0.16, 6.8, dark); box(x + dx, 6.6, z, 0.9, 0.35, 0.9, pale); solid(x + dx, z, 0.5, 0.5);
    }
    box(x, 1.4, BAY.maxZ - 1, 11, 2, 5, plank); solid(x, BAY.maxZ - 1, 11, 5);
    sign('PUNGGOL POINT', x, 4.4, BAY.minZ - 6, 20, 2, '#2f6b78');
  }

  // Bay water, parted under the jetty, with a sand edge on its landward side.
  for (const [fromX, toX] of BAY_SPANS) {
    box((fromX + toX) / 2, -0.06, (BAY.minZ + BAY.maxZ) / 2, toX - fromX, 0.36, BAY.maxZ - BAY.minZ, water);
    solid((fromX + toX) / 2, (BAY.minZ + BAY.maxZ) / 2, toX - fromX, BAY.maxZ - BAY.minZ);
    for (let i = 0; i * 13 < toX - fromX; i++) {
      const ripple = box(fromX + 4 + i * 13, 0.14, BAY.minZ + 6 + ((i * 11) % 22), 6 + i % 3, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
  }
  box(220, 0.18, BAY.minZ - 8, 40, 0.35, 14, mat('#d8cda6'));
  jetty(JETTY_X);

  hdbTower(-120, 66, 44); hdbTower(-120, 114, 38); hdbTower(-72, 66, 50); hdbTower(-72, 114, 42);
  precinctCourt(-100, 30);
  waterwayMall(20, 90);
  hdbTower(135, 66, 40); hdbTower(135, 118, 46);
  lrtViaduct(215, -150, 120); lrtStation(215, 108);
  busApron(20, -30);

  // South bank: a linear park, a community club and the older precinct.
  box(-100, 0.2, -142, 120, 0.4, 36, lawn);
  box(-100, 5, -142, 76, 10, 26, pale, scene, true); solid(-100, -142, 76, 26);
  for (let dx = -32; dx < 34; dx += 7) { box(-100 + dx, 5, -128.6, 5.4, 6.4, 0.5, glass); box(-100 + dx, 9, -128.2, 6, 1.3, 0.9, [teal, rust, orange][Math.abs(Math.round(dx / 7)) % 3]); }
  for (const side of [-1, 1]) { const roof = box(-100, 10.8, -142 + side * 7, 80, 0.5, 18, steel, scene, true); roof.rotation.x = side * 0.15; }
  sign('PUNGGOL COMMUNITY CLUB', -100, 8.4, -128.4, 32, 2.2, '#a8563a');
  hdbTower(120, -142, 34, 26); hdbTower(-220, -142, 30, 26);
  for (let x = -200; x <= 200; x += 40) if (NS_ROADS.every(road => Math.abs(x - road) > 16)) tree(x, -172, 8, wood, leaf);

  // East park: open lawn for the range, planting kept to its margins.
  box(139, 0.18, -28, 78, 0.35, 58, lawn);
  for (const z of [-54, 0]) { tree(106, z, 9, wood, leaf); tree(172, z - 8, 8, wood, leaf); }
  for (const z of [-44, -8]) { box(168, 0.85, z, 3.4, 0.22, 1.2, wood); solid(168, z, 3.6, 1.2); }

  // West end: a park connector, a boat shelter and perimeter planting.
  box(-212, 0.2, 40, 50, 0.4, 150, lawn);
  for (const z of [-20, 40, 100]) { box(-212, 2.8, z, 16, 0.35, 9, steel, scene, true); for (const dx of [-6, 6]) { cylinder(-212 + dx, 1.4, z + 3.4, 0.2, 2.8, steel); solid(-212 + dx, z + 3.4, 0.6, 0.6); } }
  for (let z = -140; z <= 180; z += 28) { tree(-236, z, 8, wood, fern); if (Math.abs(z - 40) > 90) tree(-196, z + 14, 9, wood, leaf); }
  for (let x = -210; x <= 210; x += 34) { tree(x, EDGE_Z + 16, 8, wood, leaf); tree(x, -EDGE_Z - 16, 8, wood, leaf); }

  const pedestrians = ['#eae8da', '#6f95a6', '#a8563a', '#8fb6ae'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-60 + index * 26, -58, shirt, skin, dark), walker(JETTY_X, 150 + index * 9, shirt, skin, dark)]);
  const car = kit.car(mat('#82a0a8'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(PUNGGOL_STAMPS, orange);
  scene.userData.districtFeatures = ['segmented-waterway', 'planted-channel-banks', 'reed-beds', 'arched-crossing', 'void-deck-columns', 'coloured-panel-bands', 'sky-terrace-caps', 'shade-sail-court', 'elevated-light-rail', 'pile-jetty'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.38 + index) * 1.7; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.z = 150 + ((time * 0.9 + index * 11) % 40); person.rotation.y = Math.PI; }
        else { person.position.x = -80 + ((time * 1.3 + index * 25) % 190); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
