import * as THREE from 'three';
import { KAMPONG_GLAM_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { withVerticalRoutes } from './vertical-routes';

export const KAMPONG_GLAM_SPAWN = { x: 10, z: -85, yaw: Math.PI };
export const KAMPONG_GLAM_BOUNDS = { minX: -230, maxX: 230, minZ: -200, maxZ: 200 };
export { KAMPONG_GLAM_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-120, -30, 60, 160], NS_ROADS = [-140, -40, 60, 160];
const EDGE_X = 205, EDGE_Z = 175;
export const KAMPONG_GLAM_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Kampong Glam quarter: a domed
 * mosque closing a palm-lined pedestrian mall, painted lanes, textile terraces
 * and a heritage villa. Two outdoor previews were reviewed in September 2026;
 * Bussorah frontages are informed by that view. The outer grid is compressed.
 */
export function buildKampongGlamScene() {
  const kit = createSceneKit({
    background: '#cfdce0', fogNear: 250, fogFar: 740,
    sun: { x: -90, y: 200, z: -120 }, shadow: { extent: 240, far: 600 },
    hemisphere: { sky: '#f8f5ec', ground: '#7d7566', intensity: 1.8 },
  });
  const { scene, box, cylinder, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#5b6164'), white = mat('#eae7d9'), paving = mat('#c3bba9'), kerb = mat('#d3ccbc');
  const plaster = mat('#efe7d6'), cream = mat('#e6dcc2'), dark = mat('#3a4448'), wood = mat('#7d6146');
  const gold = mat('#c6a13c', 0.4, 0.6), domeGold = mat('#cfa73f', 0.35, 0.62), teal = mat('#2c7a74');
  const terra = mat('#b2694c'), leaf = mat('#4f7546'), grass = mat('#8ca071'), orange = mat('#f0a044');
  const glass = mat('#61818d', 0.28, 0.25), stone = mat('#bcbcb4'), skin = mat('#b18c71');
  const lane = ['#d96a8f', '#57a6c4', '#e0b13f', '#6fae72', '#c9705a', '#8d78bb'].map(color => mat(color));
  const fabric = ['#b23a48', '#2f6b9c', '#d6a12d', '#3f8f6b', '#8b4f9e'].map(color => mat(color));

  box(0, -0.6, 0, 520, 1, 460, paving);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  /** Two-storey terrace with a five-foot way; `palette` drives the facade. */
  function terrace(startX: number, z: number, count: number, facing: 1 | -1, palette: THREE.Material[], width = 11, height = 10) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, body = palette[i % palette.length], front = z + facing * 7;
      box(x, height / 2, z, width - 0.4, height, 14, body, scene, true); solid(x, z, width, 14);
      for (const side of [-1, 1]) { const roof = box(x, height + 0.7, z + side * 3.9, width, 0.4, 8.8, terra, scene, true); roof.rotation.x = side * 0.19; }
      box(x, height + 1.5, z, width + 0.6, 0.5, 15, cream);
      box(x, height * 0.42, front + facing * 1.8, width, 0.4, 4, plaster, scene, true);
      for (const dx of [-width / 2 + 1.1, width / 2 - 1.1]) { cylinder(x + dx, height * 0.21, front + facing * 3.2, 0.32, height * 0.42, plaster); solid(x + dx, front + facing * 3.2, 0.8, 0.8); }
      for (const dx of [-3, 0, 3]) {
        box(x + dx, height * 0.74, front + facing * 0.1, 2.2, 3.2, 0.22, dark);
        for (let y = height * 0.74 - 1.4; y < height * 0.74 + 1.5; y += 0.4) box(x + dx, y, front + facing * 0.26, 2, 0.12, 0.16, cream);
        box(x + dx, height * 0.9, front + facing * 0.34, 2.8, 0.24, 0.42, cream);
      }
      box(x, 2, front + facing * 0.12, 3.2, 4, 0.2, wood);
      box(x, 4.6, front + facing * 0.55, width - 1.6, 1.2, 0.25, cream);
    }
  }

  /** Domed prayer hall with corner minarets and an arcaded forecourt. */
  function mosque(x: number, z: number) {
    box(x, 0.2, z, 96, 0.4, 80, paving);
    box(x, 9, z, 60, 18, 46, cream, scene, true); solid(x, z, 70, 54);
    box(x, 18.6, z, 64, 1.6, 50, plaster);
    // Arcaded facade: horseshoe openings under a banded parapet.
    const archGeo = geo(new THREE.TorusGeometry(2.4, 0.42, 6, 14, Math.PI));
    for (let dx = -26; dx <= 26; dx += 8.6) {
      box(x + dx, 4.2, z - 23.4, 1.5, 8.4, 1.5, plaster);
      const arch = new THREE.Mesh(archGeo, plaster); arch.position.set(x + dx + 4.3, 8.4, z - 23.4); scene.add(arch);
      box(x + dx + 4.3, 3.4, z - 23.6, 5.6, 6.8, 0.3, dark);
    }
    for (const band of [11.4, 12.6, 13.8]) box(x, band, z - 23.6, 62, 0.45, 0.35, teal);
    // The Bussorah photo has a tall central entrance bay beneath the dome,
    // with narrow pointed windows; avoid a uniformly low arcade silhouette.
    box(x, 13.5, z - 19, 25, 27, 10, plaster);
    for (const dx of [-9, 0, 9]) {
      box(x + dx, 19, z - 24.2, 3.5, 7, 0.4, wood);
      const point = new THREE.Mesh(geo(new THREE.ConeGeometry(2, 2.8, 4)), dark);
      point.position.set(x + dx, 23.6, z - 24.4); point.scale.z = 0.2; scene.add(point);
      for (const edge of [-2.4, 2.4]) box(x + dx + edge, 19, z - 24.5, 0.45, 9, 0.5, cream);
    }
    box(x, 27, z - 19, 27, 0.8, 12, cream);
    // Two onion domes along the prayer hall axis, each with the dark bottle
    // band beneath its gold shell (NHB Sultan Mosque architectural record).
    for (const dz of [-13, 13]) {
      cylinder(x, 28.5, z + dz, 11, 4, plaster);
      cylinder(x, 30.5, z + dz, 11.2, 1.5, dark);
      const profile = [[0, 10.7], [2, 12], [5, 12.8], [8, 11.9], [11, 9.1], [14, 5.4], [17, 1.2]];
      const points = profile.map(([height, radius]) => new THREE.Vector2(radius, height));
      const dome = new THREE.Mesh(geo(new THREE.LatheGeometry(points, 28)), domeGold);
      dome.position.set(x, 31.2, z + dz); scene.add(dome);
      cylinder(x, 50, z + dz, 0.3, 4, gold);
      const crescent = new THREE.Mesh(geo(new THREE.TorusGeometry(1.3, 0.24, 6, 16, Math.PI * 1.55)), gold);
      crescent.position.set(x, 52, z + dz); crescent.rotation.z = 0.7; scene.add(crescent);
    }
    // Corner minarets with balconies and capped lanterns.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const mx = x + sx * 36, mz = z + sz * 27;
      cylinder(mx, 14, mz, 3.1, 28, plaster); solid(mx, mz, 6.6, 6.6);
      for (const y of [12, 20]) { cylinder(mx, y, mz, 4.1, 0.9, teal); cylinder(mx, y + 1.4, mz, 3.6, 1.8, plaster); }
      cylinder(mx, 29.6, mz, 3.6, 3.2, plaster);
      for (let dy = 0; dy < 5; dy++) cylinder(mx, 31.6 + dy * 1.2, mz, 3.4 * Math.cos(dy / 5 * Math.PI / 2.1), 1.3, domeGold);
      cylinder(mx, 38.6, mz, 0.55, 3, gold);
    }
    const mosqueSign = sign('SULTAN MOSQUE', x, 15.8, z - 24.2, 30, 2.2, '#1f5b57');
    if (mosqueSign) mosqueSign.rotation.y = Math.PI;
  }

  /** Pedestrian mall: banded paving, palms, cafe seating and a view corridor. */
  function palmMall(x: number, fromZ: number, toZ: number) {
    box(x, 0.16, (fromZ + toZ) / 2, 44, 0.3, toZ - fromZ, paving);
    for (let z = fromZ; z < toZ; z += 6) box(x, 0.32, z, 42, 0.02, 4.4, (Math.round(z / 6) % 2) ? cream : stone);
    for (let z = fromZ + 8; z < toZ - 12; z += 18) for (const side of [-1, 1]) {
      const px = x + side * 17;
      cylinder(px, 4.4, z, 0.45, 8.8, wood); solid(px, z, 1, 1);
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const frond = blob(px + Math.cos(angle) * 2.6, 9.2 + (i % 3) * 0.5, z + Math.sin(angle) * 2.6, 3.2, 0.7, 1.5, leaf);
        frond.rotation.y = angle;
      }
      box(px + side * 3.6, 0.85, z + 4, 3.2, 0.2, 3.2, wood); solid(px + side * 3.6, z + 4, 3.4, 3.4);
      for (const dz of [-1.3, 1.3]) box(px + side * 3.6, 0.5, z + 4 + dz, 2.6, 1, 0.9, cream);
    }
  }

  /** Narrow painted lane: mural panels, awnings and first-floor planter boxes. */
  function paintedLane(fromX: number, toX: number, z: number, label: string) {
    box((fromX + toX) / 2, 0.16, z, toX - fromX + 14, 0.3, 22, paving);
    for (const side of [-1, 1]) {
      terrace(fromX, z + side * 15, Math.round((toX - fromX) / 9) + 1, side === 1 ? -1 : 1, lane, 9, 8.4);
      for (let x = fromX; x <= toX; x += 9) {
        // Mural band and a canvas awning over each shopfront.
        box(x, 5.4, z + side * 8.2, 8, 3.2, 0.2, lane[(Math.abs(Math.round(x / 9)) + 2) % lane.length]);
        for (let dy = -1.2; dy < 1.3; dy += 0.6) box(x + (dy > 0 ? 1 : -1), 5.4 + dy, z + side * 8.05, 4.4, 0.35, 0.18, cream);
        const awning = box(x, 3.6, z + side * 6.6, 8, 0.15, 3.4, lane[Math.abs(Math.round(x / 9)) % lane.length], scene, true);
        awning.rotation.x = -side * 0.3;
        box(x, 8.2, z + side * 7.6, 7, 0.9, 1.1, grass);
      }
    }
    sign(label, (fromX + toX) / 2, 9.6, z - 11.4, 24, 2, '#3a4448');
  }

  /** Textile terrace: bolts of cloth stacked under deep shop awnings. */
  function textileStreet(fromX: number, toX: number, z: number) {
    terrace(fromX, z + 16, Math.round((toX - fromX) / 11) + 1, -1, [cream, plaster, lane[1], lane[4]], 11, 11);
    for (let x = fromX; x <= toX; x += 11) {
      const awning = box(x, 4, z + 5.4, 10, 0.16, 5, fabric[Math.abs(Math.round(x / 11)) % fabric.length], scene, true);
      awning.rotation.x = 0.26;
      for (const dx of [-4.4, 4.4]) cylinder(x + dx, 2, z + 7.6, 0.1, 4, dark);
      for (let i = 0; i < 5; i++) {
        const bolt = cylinder(x - 3.6 + i * 1.8, 1.4, z + 6.4, 0.4, 2.8, fabric[(i + Math.abs(Math.round(x / 11))) % fabric.length]);
        bolt.rotation.z = 0.12;
      }
      box(x, 0.7, z + 8.6, 8, 1.4, 1.6, wood); solid(x, z + 8.6, 8, 1.6);
    }
    sign('ARAB STREET', (fromX + toX) / 2, 6.6, z + 9.6, 26, 2, '#7c2a38');
  }

  /** Two-storey heritage villa with a hipped roof, verandah and walled grounds. */
  function heritageVilla(x: number, z: number) {
    box(x, 0.2, z, 96, 0.4, 84, grass);
    box(x, 8, z, 52, 16, 34, cream, scene, true); solid(x, z, 54, 36);
    for (const side of [-1, 1]) { const roof = box(x, 17, z + side * 9.6, 56, 0.6, 21, terra, scene, true); roof.rotation.x = side * 0.28; }
    // Broad hipped Malay limas roof, without the previously invented cupola.
    const hip = new THREE.Mesh(geo(new THREE.ConeGeometry(1, 1, 4)), terra);
    hip.position.set(x, 20, z); hip.scale.set(40, 10, 27); hip.rotation.y = Math.PI / 4; scene.add(hip);
    for (const level of [4.4, 11.4]) for (let dx = -22; dx <= 22; dx += 7.4) {
      box(x + dx, level, z - 17.3, 3, 4.4, 0.25, dark);
      box(x + dx, level + 2.6, z - 17.5, 3.8, 0.3, 0.5, cream);
      for (const side of [-1, 1]) { const shutter = box(x + dx + side * 2.1, level, z - 17.6, 0.9, 4.2, 0.14, teal); shutter.rotation.y = side * 0.4; }
    }
    box(x, 5.4, z - 19.4, 56, 0.4, 5, cream, scene, true);
    for (let dx = -24; dx <= 24; dx += 8) { cylinder(x + dx, 2.7, z - 21.4, 0.34, 5.4, cream); solid(x + dx, z - 21.4, 0.8, 0.8); }
    for (let dx = -44; dx <= 44; dx += 4) box(x + dx, 1.1, z - 41, 0.4, 2.2, 0.4, teal);
    box(x, 2.3, z - 41, 90, 0.35, 0.5, teal);
    for (const dx of [-30, 30]) for (const dz of [-30, 6]) tree(x + dx, z + dz, 9, wood, leaf);
    const heritageSign = sign('MALAY HERITAGE CENTRE', x, 7.4, z - 20.1, 32, 2.1, '#1f5b57');
    if (heritageSign) heritageSign.rotation.y = Math.PI;
  }

  /** Glass retail block over a podium, with a street-level station entrance. */
  function mallBlock(x: number, z: number) {
    box(x, 7, z, 84, 14, 62, stone, scene, true); solid(x, z, 86, 64);
    for (let y = 3; y < 14; y += 3.4) for (let dx = -38; dx < 40; dx += 6.4) {
      box(x + dx, y, z - 31.3, 5.6, 2.4, 0.4, glass);
      box(x + dx, y, z + 31.3, 5.6, 2.4, 0.4, glass);
    }
    box(x, 22, z - 6, 62, 16, 44, glass, scene, true);
    for (let dx = -30; dx < 32; dx += 5.2) box(x + dx, 22, z - 28.2, 0.5, 16, 0.6, stone);
    box(x, 30.6, z - 6, 66, 1.4, 48, stone);
    box(x - 30, 2.4, z + 34, 16, 4.8, 8, dark); solid(x - 30, z + 34, 16, 8);
    box(x - 30, 5.2, z + 34, 18, 0.4, 10, glass, scene, true);
    sign('DT14  BUGIS', x - 30, 6.2, z + 38.4, 14, 1.4, '#1c4f8a');
    sign('BEACH ROAD SHOPS', x, 15.6, z + 32.4, 40, 2.3, '#3a4448');
  }

  mosque(10, 20);
  palmMall(10, -118, -34);
  // Bussorah's reviewed view is a close, shop-lined pedestrian corridor.
  // Low cream terraces frame the mosque rather than leaving an empty lawn.
  for (const side of [-1, 1]) for (let z = -108; z <= -48; z += 12) {
    const x = 10 + side * 30, front = x - side * 7.2;
    box(x, 5.2, z, 14, 10.4, 11.6, plaster, scene, true); solid(x, z, 14, 11.6);
    box(x, 11, z, 15, 0.6, 12, terra);
    box(front, 5, z, 4, 0.4, 12, cream);
    for (const dz of [-4.8, 4.8]) {
      cylinder(front - side * 1.7, 2.4, z + dz, 0.28, 4.8, cream);
      solid(front - side * 1.7, z + dz, 0.7, 0.7);
    }
    for (const dz of [-3, 0, 3]) {
      box(front, 7.7, z + dz, 0.25, 3.3, 2.2, wood);
      box(front - side * 0.2, 9.5, z + dz, 0.4, 0.25, 2.8, cream);
    }
    const shade = box(front - side * 1.4, 3.6, z, 3.6, 0.2, 10.4, side === -1 ? teal : lane[1]);
    shade.rotation.z = side * 0.18;
  }

  paintedLane(-124, -56, -75, 'HAJI LANE');
  textileStreet(72, 138, -86);
  heritageVilla(-90, 10);
  mallBlock(110, 15);

  // Northern blocks: cafe terraces, a pocket park and a surfaced car park.
  terrace(-128, 88, 8, 1, [cream, lane[2], plaster, lane[3]], 11, 9);
  terrace(-128, 132, 8, -1, [lane[0], cream, lane[5], plaster], 11, 9);
  box(-90, 0.18, 110, 96, 0.35, 28, paving);
  for (const x of [-120, -90, -60]) { box(x, 0.8, 110, 9, 0.22, 3.2, wood); solid(x, 110, 9, 3.2); tree(x + 14, 110, 8, wood, leaf); }
  terrace(-30, 88, 8, 1, [lane[1], cream, lane[4], plaster], 11, 9);
  terrace(-30, 132, 8, -1, [cream, lane[2], plaster, lane[0]], 11, 9);
  box(10, 0.18, 110, 88, 0.35, 26, paving);
  for (let x = -28; x < 52; x += 16) { cylinder(x, 1.5, 104, 0.09, 3, dark); box(x, 3.1, 104, 3.6, 0.14, 3, lane[Math.abs(Math.round(x / 16)) % lane.length], scene, true); box(x, 0.7, 104, 2.4, 0.16, 2.4, wood); solid(x, 104, 2.6, 2.6); }
  box(110, 0.18, 110, 92, 0.35, 76, asphalt);
  for (let x = 74; x < 148; x += 12) for (const z of [86, 110, 134]) { box(x, 0.7, z, 4.4, 1.4, 2, lane[Math.abs(Math.round(x / 12 + z / 24)) % lane.length]); solid(x, z, 4.6, 2.2); }
  for (const x of [70, 150]) for (const z of [86, 110, 134]) tree(x, z, 7, wood, leaf);

  // Southern strip, canal walk and outer verges.
  terrace(-128, -158, 8, 1, [plaster, lane[3], cream, lane[5]], 11, 9);
  terrace(74, -158, 7, 1, [cream, lane[4], plaster, lane[1]], 11, 9);
  // The mosque quarter is inland: replace the invented waterside canal with
  // an ordinary paved Beach Road edge. Keep this verge as a usable route.
  box(186, 0.14, -6, 24, 0.3, 308, paving);
  for (let z = -150; z < 160; z += 30) { box(172, 3.4, z, 0.18, 6.8, 0.18, dark); box(172, 6.6, z + 1, 0.24, 0.3, 2.2, white); solid(172, z, 0.4, 0.4); }
  for (let z = -140; z < 160; z += 24) tree(175, z, 8, wood, leaf);
  box(-180, 0.18, 0, 44, 0.35, 300, grass);
  for (let z = -140; z < 150; z += 26) tree(-180 + (z % 52 ? 10 : -10), z, 8, wood, leaf);
  for (const z of [-60, 0, 60]) { box(-180, 0.8, z, 9, 0.22, 3.2, wood); solid(-180, z, 9, 3.2); }
  for (const x of [-EDGE_X - 14, EDGE_X + 14]) for (let z = -160; z < 170; z += 28) tree(x, z, 7, wood, leaf);
  for (const z of [-EDGE_Z - 14, EDGE_Z + 14]) for (let x = -190; x < 200; x += 30) tree(x, z, 7, wood, leaf);

  const pedestrians = ['#eae7d9', '#57a6c4', '#d96a8f', '#6fae72'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(10 + (index - 1.5) * 7, -90, shirt, skin, dark), walker(-90 + (index - 1.5) * 8, -75, shirt, skin, dark)]);
  const car = kit.car(mat('#8a9ba6'), glass, mat('#ded9c9'), dark);
  const stamps = stampRings(KAMPONG_GLAM_STAMPS, orange);
  scene.userData.districtFeatures = ['ribbed-onion-dome', 'corner-minarets', 'horseshoe-arcade', 'palm-lined-mall', 'painted-lane-murals', 'textile-awnings', 'limas-hipped-roof', 'louvred-shutters', 'beach-road-edge', 'banded-paving'];
  scene.userData.referenceFeatures = ['bussorah-axial-gold-dome', 'bussorah-close-cream-frontages', 'bussorah-palms-and-awnings'];

  return withVerticalRoutes(kit.finish({
    car, stamps,
    animate(time: number) {
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -124 + ((time * 1.1 + index * 15) % 70); person.rotation.y = -Math.PI / 2; }
        else { person.position.z = -118 + ((time * 1.3 + index * 19) % 84); person.rotation.y = Math.PI; }
      });
    },
  }), [
    {
      id: 'haji-rear-gallery', name: 'Haji rear service gallery', width: 3.4,
      points: [
        { x: -128, z: -104, y: 0 },
        { x: -116, z: -104, y: 2.8 },
        { x: -68, z: -104, y: 2.8 },
        { x: -56, z: -104, y: 0 },
      ],
      color: '#c3bba9', railColor: '#2c7a74',
      note: 'Authored rear service gallery; leaves the painted pedestrian lane and mosque sightline at street level.',
    },
    {
      id: 'beach-retail-terrace', name: 'Beach Road retail terrace', width: 3.4,
      points: [
        { x: 96, z: 51, y: 0 },
        { x: 106, z: 51, y: 3.2 },
        { x: 134, z: 51, y: 3.2 },
        { x: 144, z: 51, y: 0 },
      ],
      color: '#bcbcb4',
      note: 'Authored retail frontage terrace on the compressed modern block, not a real landmark or surveyed route.',
    },
  ]);
}
