import * as THREE from 'three';
import { SENTOSA_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';

// Just inside the boardwalk landing, looking down the island's spine.
export const SENTOSA_SPAWN = { x: 108, z: -168, yaw: Math.PI };
export const SENTOSA_BOUNDS = { minX: -250, maxX: 250, minZ: -210, maxZ: 210 };
export { SENTOSA_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-110, 20, 130], NS_ROADS = [-150, -30, 90];
const EDGE_X = 225, EDGE_Z = 180;
/**
 * Both seas sit outside the perimeter loop, so no street ever runs into one.
 * The strait is the exception and is parted where the boardwalk lands, which
 * is the island's only way on or off.
 */
const SEA = { minZ: 196, maxZ: 210 }, STRAIT = { minZ: -210, maxZ: -190 };
const STRAIT_SPANS: readonly (readonly [number, number])[] = [[-215, 100], [116, 215]];
const LANDING_X = 108, LAGOON = { x: -90, z: 75, width: 62, depth: 44 };
export const SENTOSA_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
  { points: [{ x: LANDING_X, z: -EDGE_Z }, { x: LANDING_X, z: -200 }] },
];

/**
 * An authored, compressed interpretation of the Sentosa resort island: a
 * boardwalk landing across the strait, a monorail down the spine, a resort
 * podium and hotel pair, a headland battery, a lagoon, and the beach strip
 * along the southern shore. Compressed for play; reviewed exterior features are listed in referenceFeatures.
 */
export function buildSentosaScene() {
  const kit = createSceneKit({
    background: '#cfe1e7', fogNear: 300, fogFar: 920,
    sun: { x: 110, y: 215, z: 150 }, shadow: { extent: 265, far: 690 },
    hemisphere: { sky: '#f6fcfd', ground: '#7c7a63', intensity: 1.9 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#575d5e'), white = mat('#eae8da'), paving = mat('#c0bbae'), kerb = mat('#d1cbbd');
  const sea = mat('#3f88a4', 0.4), shallow = mat('#63aec0', 0.36), sand = mat('#ded0a6'), lawn = mat('#89a76a');
  // Shots into these splash rather than spark; see water.ts.
  markWater(sea, shallow);
  const pale = mat('#e8e1d1'), stone = mat('#b7b5ab'), concrete = mat('#adaca2'), dark = mat('#36434a');
  const glass = mat('#72a0b2', 0.22, 0.32), steel = mat('#b2babd', 0.28, 0.58), wood = mat('#7c6248'), plank = mat('#a07f58');
  const terra = mat('#b3684c'), gold = mat('#c59a34', 0.42, 0.55), rust = mat('#a8563a');
  const palmLeaf = mat('#4f8a4a'), leaf = mat('#44703d'), fern = mat('#5b8a4c'), orange = mat('#f0a044'), skin = mat('#b18c71');
  const cloth = ['#e6dcc4', '#c96a4a', '#4f8fa0', '#d8b24a'].map(color => mat(color));
  const turf = mat('#93a374');

  box(0, -0.6, 0, 600, 1, 520, lawn);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  const ripples: THREE.Mesh[] = [];
  function openWater(minX: number, maxX: number, minZ: number, maxZ: number, count: number) {
    box((minX + maxX) / 2, -0.06, (minZ + maxZ) / 2, maxX - minX, 0.4, maxZ - minZ, sea);
    solid((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ);
    for (let i = 0; i < count; i++) {
      const ripple = box(minX + 8 + (i * 43) % Math.max(12, maxX - minX - 16), 0.16, minZ + 3 + (i * 13) % Math.max(6, maxZ - minZ - 6), 8 + i % 5, 0.02, 0.22, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
  }
  openWater(-215, 215, SEA.minZ, SEA.maxZ, 30);
  for (const [fromX, toX] of STRAIT_SPANS) openWater(fromX, toX, STRAIT.minZ, STRAIT.maxZ, 10);
  box(0, 0.16, 191, 440, 0.34, 12, sand);
  box(0, 0.16, -186, 440, 0.34, 10, sand);

  /** Boardwalk across the strait: the island's only landing. */
  function landing(x: number) {
    box(x, 0.45, -192, 14, 0.3, 30, plank);
    for (let z = -206; z <= -178; z += 4) {
      box(x, 0.62, z, 13.6, 0.06, 1.8, wood);
      for (const dx of [-6, 6]) { cylinder(x + dx, 0.2, z, 0.26, 1, wood); if (z % 12 < 4) { cylinder(x + dx, 1.6, z, 0.16, 2.8, wood); solid(x + dx, z, 0.5, 0.5); } }
    }
    for (const dx of [-5.8, 5.8]) box(x + dx, 1.7, -192, 0.14, 0.9, 30, wood);
    for (let n = 0; n < 6; n++) {
      const cz = -206 + n * 6;
      for (const dx of [-6.8, 6.8]) { const rib = box(x + dx, 4.4, cz, 0.5, 8, 1.2, steel, scene, true); rib.rotation.z = dx > 0 ? -0.22 : 0.22; }
      box(x, 8.2, cz, 15, 0.4, 1.2, steel);
    }
    sign('SENTOSA BOARDWALK', x, 6.4, -176, 22, 2.1, '#2f6b78');
  }
  landing(LANDING_X);

  /** Palm: a leaning trunk in collars under a crown of fronds. */
  function palm(x: number, z: number, height: number, lean = 0) {
    for (let i = 0; i < 6; i++) cylinder(x + lean * i * 0.5, height * (i + 0.5) / 6, z, 0.42 - i * 0.02, height / 6, wood);
    solid(x, z, 1, 1);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const frond = blob(x + lean * 3 + Math.cos(angle) * 3.2, height + 0.4 - (i % 3) * 0.5, z + Math.sin(angle) * 3.2, 3.6, 0.7, 1.5, palmLeaf);
      frond.rotation.y = angle;
    }
    for (const dz of [-0.9, 0.9]) blob(x + lean * 3, height - 0.5, z + dz, 1, 0.7, 1, terra);
  }
  for (let x = -208; x <= 208; x += 13) {
    if (NS_ROADS.some(road => Math.abs(x - road) < 14) || Math.abs(x - LANDING_X) < 14) continue;
    palm(x, 187, 11 + (Math.abs(Math.round(x)) % 4), ((Math.round(x / 13)) % 3 - 1) * 0.12);
  }

  /** Resort podium: arcaded base, domed pavilions and a stepped water stair. */
  function resortPodium(x: number, z: number) {
    box(x, 0.2, z, 84, 0.4, 94, paving);
    box(x, 8, z, 76, 16, 82, pale, scene, true); solid(x, z, 76, 82);
    for (let dx = -34; dx < 36; dx += 8.5) for (const side of [-1, 1]) {
      cylinder(x + dx, 5, z + side * 42.4, 1.5, 10, pale);
      for (let n = 0; n <= 6; n++) { const angle = Math.PI * n / 6; box(x + dx + 4.25 - Math.cos(angle) * 4.25, 10 + Math.sin(angle) * 3.4, z + side * 42.4, 1.6, 1.4, 3, pale); }
    }
    for (const side of [-1, 1]) box(x, 17.4, z + side * 42, 80, 2, 6, terra);
    for (const [dx, dz, r] of [[-26, -22, 11], [26, -22, 11], [0, 16, 15]] as const) {
      cylinder(x + dx, 18.4, z + dz, r, 2.4, pale);
      for (let ring = 0; ring < 5; ring++) cylinder(x + dx, 20 + ring * 1.9, z + dz, r * Math.cos(ring / 5 * Math.PI / 2.2), 2, ring % 2 ? terra : gold);
      const finial = new THREE.Mesh(geo(new THREE.ConeGeometry(1.5, 4.4, 8)), gold);
      finial.position.set(x + dx, 30.6, z + dz); scene.add(finial);
    }
    // Water stair down the forecourt, with basins a walker passes between.
    for (let step = 0; step < 5; step++) {
      box(x, 0.4 + step * 0.5, z - 52 + step * 2.4, 26 - step * 3, 0.9, 2.2, stone);
      box(x, 0.8 + step * 0.5, z - 52 + step * 2.4, 22 - step * 3, 0.3, 1.6, shallow);
    }
    solid(x, z - 47, 26, 12);
    for (const dx of [-30, 30]) { cylinder(x + dx, 3.4, z - 50, 0.9, 6.8, pale); solid(x + dx, z - 50, 2, 2); }
    sign('RESORT PODIUM', x, 12.4, z - 42.4, 30, 2.4, '#2f6b78');
  }

  /** Hotel pair: two balconied slabs joined by a sky bridge. */
  function hotelPair(x: number, z: number) {
    for (const dz of [-24, 24]) {
      box(x, 26, z + dz, 66, 52, 26, pale, scene, true); solid(x, z + dz, 66, 26);
      for (let y = 6; y < 52; y += 4.2) for (let dx = -28; dx < 30; dx += 6) for (const side of [-1, 1]) {
        box(x + dx, y, z + dz + side * 13.4, 4.6, 2.6, 0.6, glass);
        box(x + dx, y - 1.5, z + dz + side * 14.2, 5.2, 0.35, 1.6, stone);
      }
      box(x, 53, z + dz, 70, 2.2, 30, steel);
    }
    box(x - 22, 44, z, 8, 5, 24, steel, scene, true);
    box(x + 22, 44, z, 8, 5, 24, steel, scene, true);
    for (const dx of [-22, 22]) for (let dz = -10; dz <= 10; dz += 4) box(x + dx, 46.6, z + dz, 7, 0.4, 1.2, glass);
    box(x, 6, z, 40, 12, 22, concrete, scene, true); solid(x, z, 40, 22);
    for (let dx = -16; dx < 18; dx += 7) box(x + dx, 6, z - 11.4, 5.4, 8, 0.6, glass);
    sign('ISLAND HOTELS', x, 14.4, z - 11.6, 28, 2.4, '#2f4a56');
  }

  /** Headland battery: a sloped rampart, a parapet and its guns. */
  function battery(x: number, z: number) {
    for (let step = 0; step < 4; step++) {
      const w = 76 - step * 12, d = 86 - step * 14, y = 3 + step * 2.6;
      box(x, y / 2, z, w, y, d, step % 2 ? lawn : turf, scene, true); solid(x, z, w, d);
    }
    box(x, 11.4, z, 34, 1.6, 44, stone);
    for (const side of [-1, 1]) {
      box(x + side * 17, 13.4, z, 2.6, 3.4, 44, stone);
      // Low continuous gun parapets, not medieval battlements.
    }
    for (const dz of [-13, 0, 13]) {
      const barrel = cylinder(x + 13, 13.4, z + dz, 0.7, 9, dark);
      barrel.rotation.z = -Math.PI / 2 + 0.22;
      for (const dx of [-1.6, 1.6]) cylinder(x + 9 + dx, 12, z + dz, 1.3, 0.5, wood);
      box(x + 8, 12.4, z + dz, 4.4, 1.4, 2.6, wood);
    }
    cylinder(x - 24, 19, z, 0.35, 22, pale); solid(x - 24, z, 0.9, 0.9);
    box(x - 21.4, 27.4, z, 5.4, 3.4, 0.16, rust);
    sign('FORT SILOSO', x, 16.4, z - 44.4, 26, 2.2, '#5c6b3f');
  }

  /** Monorail: a slim beam on single piers, with a platform box midway. */
  function monorail(z: number, fromX: number, toX: number) {
    for (let x = fromX; x <= toX; x += 60) {
      if (NS_ROADS.some(road => Math.abs(x - road) < 20)) continue;
      cylinder(x, 6, z, 1.4, 12, concrete); solid(x, z, 3.6, 3.6);
      box(x, 12.4, z, 6.4, 1.4, 4.4, concrete);
    }
    box((fromX + toX) / 2, 13.6, z, toX - fromX, 1.6, 4.4, concrete);
    box((fromX + toX) / 2, 14.8, z, toX - fromX, 0.8, 1.6, pale);
    const train = new THREE.Group();
    for (let car = 0; car < 3; car++) {
      box(car * 13, 17.4, 0, 12, 4.4, 5, car % 2 ? pale : cloth[2], train, true);
      box(car * 13, 18.2, 0, 12.2, 2, 5.2, glass, train);
      box(car * 13, 15.2, 0, 9, 1.6, 3, dark, train);
    }
    train.position.set(fromX, 0, z); scene.add(train);
    box(0, 15, z + 14, 44, 10, 20, pale, scene, true); solid(0, z + 14, 44, 20);
    for (const side of [-1, 1]) { const roof = box(0, 20.6, z + 14 + side * 6, 48, 0.6, 14, steel, scene, true); roof.rotation.x = side * 0.16; }
    for (let dx = -18; dx < 20; dx += 6) box(dx, 15, z + 23.4, 4.6, 6.4, 0.5, glass);
    box(-20, 7.5, z + 26, 7, 15, 8, concrete); solid(-20, z + 26, 7, 8);
    sign('IMBIAH STATION', 0, 11.4, z + 24.4, 22, 2.1, '#2f6b78');
    return train;
  }

  /** Lagoon: water with a sand rim, stepping stones and a rope bridge islet. */
  function lagoon() {
    const { x, z, width, depth } = LAGOON;
    box(x, 0.14, z, width + 16, 0.32, depth + 16, sand);
    box(x, 0.36, z, width, 0.1, depth, sea);
    // Leave a genuine traversable route under the Palawan suspension deck.
    for (const side of [-1, 1]) solid(x, z + side * (depth / 4 + 2.5), width, depth / 2 - 5);
    box(x, 0.36, z, width + 6, 0.35, 8, plank);
    for (let dx = -width / 2; dx <= width / 2; dx += 2) box(x + dx, 0.58, z, 0.15, 0.08, 8, wood);
    for (const dz of [-4.5, 4.5]) {
      for (const dx of [-width / 2, width / 2]) {
        cylinder(x + dx, 4.4, z + dz, 0.42, 8.8, wood);
        solid(x + dx, z + dz, 1, 1);
      }
      for (let segment = 0; segment < 20; segment++) {
        const a = segment / 20, b = (segment + 1) / 20;
        const height = (t: number) => 3 + 5 * Math.pow(2 * t - 1, 2);
        beam(new THREE.Vector3(x - width / 2 + a * width, height(a), z + dz),
          new THREE.Vector3(x - width / 2 + b * width, height(b), z + dz), 0.12, wood);
        cylinder(x - width / 2 + a * width, (height(a) + 1) / 2, z + dz, 0.06, height(a) - 1, wood);
      }
    }
    sign('PALAWAN BEACH', x, 4.8, z - depth / 2 - 1, 25, 2.1, '#426445');
    // February 2015 preview: vegetated islet and paired roofed lookouts.
    // Kept within the existing water envelope, away from the crossing lane.
    for (const dz of [-15, 15]) {
      const tx = x + width / 2 - 5, tz = z + dz;
      blob(tx, 0.7, tz, 10, 1.4, 7, sand);
      blob(tx + 2, 2, tz, 7, 2.2, 5, leaf);
      for (const dx of [-2.8, 2.8]) for (const dd of [-2.8, 2.8]) cylinder(tx + dx, 7, tz + dd, 0.25, 14, wood);
      for (const y of [7, 13]) {
        box(tx, y, tz, 7.5, 0.5, 7.5, wood);
        const roof = new THREE.Mesh(geo(new THREE.ConeGeometry(6.2, 2.4, 4)), wood);
        roof.position.set(tx, y + 4, tz); roof.rotation.y = Math.PI / 4; scene.add(roof);
        for (const dd of [-3.2, 3.2]) box(tx, y + 1.1, tz + dd, 7, 0.18, 0.18, wood);
      }
    }

    for (let i = 0; i < 12; i++) {
      const ripple = box(x - width / 2 + 6 + (i * 17) % (width - 12), 0.43, z - depth / 2 + 5 + (i * 11) % (depth - 10), 6 + i % 3, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
    for (const dz of [-depth / 2 - 11, depth / 2 + 11]) for (let dx = -width / 2; dx <= width / 2; dx += 11) palm(x + dx, z + dz, 10 + (Math.abs(Math.round(dx)) % 3), 0.1);
    for (const dx of [-width / 2 - 10, width / 2 + 10]) { box(x + dx, 0.9, z, 3.4, 0.24, 8, plank); solid(x + dx, z, 3.6, 8); }
  }

  /** Beach club: a raised deck, a bar, loungers and a volleyball net. */
  function beachClub(x: number, z: number) {
    box(x, 0.5, z, 70, 0.8, 52, plank); solid(x, z - 18, 70, 16);
    box(x, 4.4, z - 14, 44, 7, 14, pale, scene, true);
    for (const side of [-1, 1]) { const roof = box(x, 8.6, z - 14 + side * 5, 50, 0.4, 14, terra, scene, true); roof.rotation.x = side * 0.28; }
    for (let dx = -18; dx < 20; dx += 6) box(x + dx, 3.4, z - 7.4, 4.4, 4, 0.5, dark);
    for (const dx of [-24, 24]) { cylinder(x + dx, 3.4, z - 7, 0.4, 6.8, wood); solid(x + dx, z - 7, 1, 1); }
    for (let dx = -26; dx <= 26; dx += 13) for (const dz of [6, 18]) {
      box(x + dx, 1.3, z + dz, 2.2, 0.24, 5.4, cloth[Math.abs(Math.round(dx / 13)) % 4]);
      for (const dd of [-2.2, 2.2]) cylinder(x + dx, 1, z + dz + dd, 0.14, 0.7, wood);
    }
    for (const dx of [-16, 16]) { cylinder(x + dx, 2.6, z + 32, 0.16, 5.2, steel); solid(x + dx, z + 32, 0.5, 0.5); }
    for (let dy = 0; dy < 5; dy++) box(x, 3.6 + dy * 0.4, z + 32, 32, 0.06, 0.06, pale);
    sign('BEACH CLUB', x, 10.4, z - 21.4, 24, 2.2, '#c96a4a');
  }

  /** Fort Siloso Skywalk: open lift/stair tower and a slim treetop bridge. */
  function skywalk(x: number, z: number) {
    box(x, 19, z, 8, 38, 8, glass, scene, true); solid(x, z, 9, 9);
    for (const dx of [-4.6, 4.6]) for (const dz of [-4.6, 4.6]) {
      box(x + dx, 20, z + dz, 0.7, 40, 0.7, steel);
    }
    for (let level = 0; level < 10; level++) {
      box(x, 2 + level * 4, z, 10, 0.4, 10, pale);
      beam(new THREE.Vector3(x - 4.6, level * 4, z + 4.7),
        new THREE.Vector3(x + 4.6, 4 + level * 4, z + 4.7), 0.2, steel);
    }
    box(x + 44, 38, z, 88, 0.8, 4.4, wood, scene, true);
    for (const dz of [-2.1, 2.1]) {
      box(x + 44, 39.3, z + dz, 88, 0.14, 0.14, steel);
      for (let dx = 0; dx <= 88; dx += 4) cylinder(x + dx, 38.7, z + dz, 0.09, 1.5, steel);
    }
    sign('FORT SILOSO SKYWALK', x, 8, z + 5, 24, 2.2, '#426445');
  }

  battery(-90, -45);
  resortPodium(30, -45);
  hotelPair(165, -45);
  lagoon();
  beachClub(30, 75);
  skywalk(-187, -60);
  const train = monorail(-145, -200, 200);

  // Landing plaza, island spine planting and the east lawn that holds the range.
  box(LANDING_X, 0.2, -158, 44, 0.4, 40, paving);
  for (const dx of [-16, 16]) for (const dz of [-14, 12]) { cylinder(LANDING_X + dx, 2.4, -158 + dz, 0.3, 4.8, steel); solid(LANDING_X + dx, -158 + dz, 0.8, 0.8); }
  box(LANDING_X, 5.2, -158, 42, 0.35, 12, cloth[0], scene, true);
  box(165, 0.18, 75, 90, 0.35, 70, lawn);
  for (const z of [46, 104]) { palm(126, z, 12, 0.1); tree(204, z - 6, 9, wood, fern); }
  for (const z of [56, 96]) { box(206, 0.85, z, 3.4, 0.22, 1.2, wood); solid(206, z, 3.6, 1.2); }
  box(-187, 0.18, 0, 36, 0.35, 300, lawn);
  for (let z = -140; z <= 140; z += 26) if (Math.abs(z - 8) > 20) { palm(-198, z, 11, 0.12); tree(-176, z + 13, 9, wood, leaf); }
  for (let x = -200; x <= 200; x += 34) if (Math.abs(x - LANDING_X) > 24) palm(x, -184, 10, -0.1);
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -150; z <= 150; z += 30) palm(x, z, 12, 0.1);

  const pedestrians = ['#eae8da', '#72a0b2', '#c96a4a', '#d8b24a'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(LANDING_X, -175 + index * 7, shirt, skin, dark), walker(-30 + index * 22, 186, shirt, skin, dark)]);
  const car = kit.car(mat('#8aa3ac'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(SENTOSA_STAMPS, orange);
  scene.userData.districtFeatures = ['strait-boardwalk-ribs', 'leaning-palm-collars', 'arcaded-podium', 'tiered-pavilion-domes', 'water-stair', 'balcony-band-slabs', 'sky-bridge', 'earthwork-gun-emplacements', 'palawan-suspension-bridge', 'monorail-beam', 'fort-siloso-skywalk'];
  scene.userData.referenceFeatures = ['palawan-suspension-bridge', 'palawan-paired-roofed-lookouts', 'palawan-palm-lined-sand-shore'];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.36 + index) * 1.8; });
      const run = (time * 16) % 800;
      train.position.x = -200 + (run < 400 ? run : 800 - run);
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -60 + ((time * 1.2 + index * 21) % 140); person.rotation.y = -Math.PI / 2; }
        else { person.position.z = -180 + ((time * 1.1 + index * 9) % 26); person.rotation.y = Math.PI; }
      });
    },
  });
}
