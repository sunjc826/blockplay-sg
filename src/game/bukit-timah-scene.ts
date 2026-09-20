import * as THREE from 'three';
import { BUKIT_TIMAH_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// On the corridor verge, under the truss bridge, looking up at the ridge.
export const BUKIT_TIMAH_SPAWN = { x: 60, z: 16, yaw: Math.PI / 2 };
export const BUKIT_TIMAH_BOUNDS = { minX: -255, maxX: 255, minZ: -210, maxZ: 210 };
export { BUKIT_TIMAH_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-90, 40], NS_ROADS = [-120, 10, 130];
const EDGE_X = 230, EDGE_Z = 180;
/**
 * Storm canal, trapezoidal and deep. It runs only east of the town centre, so
 * the ridge is never cut by it, and is gapped at each street it meets.
 */
const CANAL = { nearZ: -56, farZ: -32 };
const CANAL_SPANS: readonly (readonly [number, number])[] = [[30, 118], [142, 215]];
/** The old rail alignment: a green strip, bridged where it meets the road. */
const CORRIDOR_X = 60;
export const BUKIT_TIMAH_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of Bukit Timah: a forested ridge over
 * the western half, the old rail corridor crossing the road on a steel truss,
 * black-and-white bungalows on their piers, a market hall at the junction and
 * the storm canal behind. Invented for play, without reference capture.
 */
export function buildBukitTimahScene() {
  const kit = createSceneKit({
    background: '#c9dad6', fogNear: 280, fogFar: 880,
    sun: { x: -140, y: 200, z: -110 }, shadow: { extent: 260, far: 670 },
    hemisphere: { sky: '#f2f8f6', ground: '#6f7458', intensity: 1.76 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#565c5a'), white = mat('#e9e7d8'), paving = mat('#bab5a6'), kerb = mat('#cdc7b7');
  const water = mat('#4d8490', 0.42), shallow = mat('#63a0aa', 0.38), lawn = mat('#87a568'), grass = mat('#79935c');
  const concrete = mat('#a9a89d'), pale = mat('#efeade'), stone = mat('#b3b2a8'), dark = mat('#333f42');
  const glass = mat('#6d92a0', 0.24, 0.3), steel = mat('#9aa4a6', 0.3, 0.6), wood = mat('#6f5740'), timber = mat('#3a2f26');
  const leaf = mat('#3d6b38'), fern = mat('#548245'), deep = mat('#2c5230'), moss = mat('#6b8f4c');
  const terra = mat('#a9604a'), rust = mat('#8f4a32'), orange = mat('#f0a044'), skin = mat('#b18c71'), teal = mat('#2f7b7b');
  const ballast = mat('#8b8880'), bands = ['#e8e2d4', '#cfd6cc', '#ded4bd'].map(color => mat(color));

  const ripples: THREE.Mesh[] = [];
  box(0, -0.6, 0, 610, 1, 510, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // Storm canal: sloped concrete flanks, a low-flow invert and a rail either
  // side. Segments stop at each street, and so does everything drawn on them.
  const midZ = (CANAL.nearZ + CANAL.farZ) / 2, depthZ = CANAL.farZ - CANAL.nearZ;
  for (const [fromX, toX] of CANAL_SPANS) {
    const width = toX - fromX, cx = (fromX + toX) / 2;
    box(cx, -0.06, midZ, width, 0.4, depthZ - 10, water);
    solid(cx, midZ, width, depthZ);
    for (const side of [-1, 1]) {
      const flank = box(cx, -0.8, midZ + side * (depthZ / 2 - 3), width, 4.4, 9, concrete);
      flank.rotation.x = side * 0.42;
      box(cx, 1.3, midZ + side * (depthZ / 2 + 0.6), width, 0.5, 1.2, stone);
      for (let x = fromX + 4; x < toX; x += 8) cylinder(x, 1.9, midZ + side * (depthZ / 2 + 0.6), 0.1, 1.2, steel);
    }
    for (let i = 0; i * 21 < width; i++) {
      const ripple = box(fromX + 7 + i * 21, 0.16, midZ + ((i * 5) % 8) - 4, 7 + i % 3, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
  }
  for (const x of NS_ROADS) {
    if (!CANAL_SPANS.some(([from, to]) => x > from - 26 && x < to + 26)) continue;
    box(x, 0.3, midZ, 22, 0.6, depthZ + 14, asphalt);
    for (const side of [-1, 1]) { box(x + side * 11.6, 1.3, midZ, 1.2, 2, depthZ + 14, stone); solid(x + side * 11.6, midZ, 1.2, depthZ + 14); }
  }

  /** Forested ridge: terraces stepping up under dense canopy, to a marker. */
  function ridge(x: number, z: number, width: number, depth: number) {
    for (let step = 0; step < 6; step++) {
      const w = width - step * width / 7, d = depth - step * depth / 7, y = 4 + step * 5;
      box(x, y / 2, z, w, y, d, step % 2 ? lawn : mat('#7e9a5e'), scene, true);
      solid(x, z, w, d);
      for (let n = 0; n < 9; n++) {
        const angle = n * 0.7 + step, r = Math.min(w, d) / 2 - 4;
        const tx = x + Math.cos(angle) * r, tz = z + Math.sin(angle) * r * 0.8;
        cylinder(tx, y + 6, tz, 0.5, 12, wood);
        for (let layer = 0; layer < 2; layer++) blob(tx + (layer ? 1.6 : -1.6), y + 11 + layer * 2, tz, 5, 2.2, 5, [leaf, fern, deep][(n + layer) % 3]);
      }
    }
    // Summit: a trig marker on its plinth, with a rail around the clearing.
    box(x, 31, z, 5, 3, 5, concrete);
    const marker = new THREE.Mesh(geo(new THREE.ConeGeometry(1.8, 4.4, 4)), pale);
    marker.position.set(x, 34.6, z); marker.castShadow = true; scene.add(marker);
    for (let n = 0; n < 10; n++) { const a = n * Math.PI / 5; cylinder(x + Math.cos(a) * 9, 31.4, z + Math.sin(a) * 9, 0.12, 1.8, steel); }
    sign('BUKIT TIMAH SUMMIT', x, 36, z + 12, 26, 2.2, '#2f5140');
  }

  /** Rail corridor: ballast, sleepers and rails, under a keeping of tall grass. */
  function corridor(x: number) {
    box(x, 0.24, 0, 22, 0.4, 400, ballast);
    for (let z = -195; z <= 195; z += 4) box(x, 0.5, z, 12, 0.2, 1.6, timber);
    for (const dx of [-3.4, 3.4]) box(x + dx, 0.68, 0, 0.5, 0.26, 400, steel);
    for (let z = -190; z <= 190; z += 7) for (const dx of [-10, 10]) {
      if (Math.abs(z - 40) < 22) continue;
      for (let r = 0; r < 3; r++) blob(x + dx + r * 0.7, 1.1, z, 0.6, 2.2, 0.5, moss);
    }
    for (let z = -170; z <= 170; z += 34) { if (Math.abs(z - 40) < 26) continue; box(x + 13, 1.4, z, 1, 2.8, 0.6, rust); solid(x + 13, z, 1.2, 1.2); }
  }

  /** Through-truss bridge: abutments either side of the road, web overhead. */
  function trussBridge(x: number, z: number) {
    for (const side of [-1, 1]) {
      box(x, 3.4, z + side * 12, 24, 6.8, 8, stone, scene, true); solid(x, z + side * 12, 24, 8);
      for (let dx = -9; dx <= 9; dx += 6) box(x + dx, 3.4, z + side * 16.2, 4.4, 5.4, 0.5, concrete);
    }
    box(x, 7.4, z, 13, 0.7, 26, timber, scene, true);
    for (const dx of [-6, 6]) {
      box(x + dx, 9, z, 0.5, 2.6, 26, steel);
      box(x + dx, 13.4, z, 0.5, 0.9, 26, steel);
      // Warren web: alternating diagonals between the top and bottom chords.
      for (let n = 0; n < 8; n++) {
        const z0 = z - 13 + n * 3.25, z1 = z0 + 3.25;
        beam(new THREE.Vector3(x + dx, 9.6, n % 2 ? z0 : z1), new THREE.Vector3(x + dx, 13, n % 2 ? z1 : z0), 0.16, steel);
        cylinder(x + dx, 11.4, z0, 0.14, 4, steel);
      }
    }
    for (let dz = -12; dz <= 12; dz += 4) box(x, 13.9, z + dz, 12.6, 0.4, 0.4, steel);
    sign('RAIL CORRIDOR', x, 16, z - 15, 20, 2, '#4a5a3a');
  }

  /** Black-and-white bungalow: raised on piers, deep verandah, hipped roof. */
  function bungalow(x: number, z: number, facing: 1 | -1 = 1) {
    for (const dx of [-11, 0, 11]) for (const dz of [-8, 8]) { box(x + dx, 1.1, z + dz, 1.6, 2.2, 1.6, stone); solid(x + dx, z + dz, 2, 2); }
    box(x, 2.4, z, 26, 0.6, 20, pale); solid(x, z, 26, 20);
    box(x, 5.4, z, 22, 5.4, 16, pale, scene, true);
    // Exposed timbers on the render, the district's read at a glance.
    for (const dx of [-10.6, 10.6]) box(x + dx, 5.4, z, 0.5, 5.6, 16.4, timber);
    for (const dz of [-8.2, 8.2]) box(x, 5.4, z + dz, 22.4, 0.5, 0.5, timber);
    for (let dx = -8; dx <= 8; dx += 5.3) { box(x + dx, 5.4, z + facing * 8.2, 0.45, 5.4, 0.45, timber); box(x + dx, 4.4, z + facing * 8.3, 3.4, 2.6, 0.3, glass); }
    box(x, 8.4, z, 23, 0.5, 17, timber);
    // Verandah: posts and balustrade under the overhang, then the hipped roof.
    box(x, 7.4, z + facing * 12, 24, 0.5, 8, pale, scene, true);
    for (const dx of [-10, -3.4, 3.4, 10]) { cylinder(x + dx, 4.9, z + facing * 15, 0.3, 5, pale); solid(x + dx, z + facing * 15, 0.8, 0.8); }
    for (const dx of [-10, -3.4, 3.4, 10]) box(x + dx, 3.4, z + facing * 15, 0.4, 1.4, 0.4, timber);
    box(x, 3.6, z + facing * 15.4, 24, 1.1, 0.3, pale);
    for (let s = 0; s < 4; s++) box(x, 1.2 + s * 0.35, z + facing * (18 + s * 0.9), 7, 0.35, 1, stone);
    for (const side of [-1, 1]) { const pitch = box(x, 10.4, z + side * 5, 24, 0.6, 12, terra, scene, true); pitch.rotation.x = side * 0.46; }
    for (const side of [-1, 1]) { const hip = box(x + side * 10, 10.4, z, 8, 0.6, 18, terra, scene, true); hip.rotation.z = side * 0.5; }
    box(x, 13, z, 9, 0.7, 2.4, terra);
    cylinder(x - 7, 14.4, z - 3, 0.9, 3.4, rust);
  }

  /** Market hall with a raised clerestory over its aisles. */
  function marketHall(x: number, z: number) {
    box(x, 0.2, z, 78, 0.4, 58, paving);
    box(x, 4.6, z, 64, 9.2, 46, bands[0], scene, true); solid(x, z, 64, 46);
    for (const side of [-1, 1]) { const roof = box(x, 10.6, z + side * 12, 68, 0.5, 28, terra, scene, true); roof.rotation.x = side * 0.2; }
    box(x, 13.4, z, 40, 4.4, 14, bands[1]);
    for (let dx = -17; dx < 19; dx += 5) box(x + dx, 13.4, z, 3.4, 3, 15, glass);
    for (const side of [-1, 1]) { const clere = box(x, 16.2, z + side * 7, 42, 0.4, 16, terra, scene, true); clere.rotation.x = side * 0.28; }
    for (const side of [-1, 1]) for (let dx = -28; dx < 30; dx += 7.5) {
      box(x + dx, 3.2, z + side * 23.2, 5.4, 5.8, 0.5, dark);
      box(x + dx, 6.8, z + side * 23.6, 6, 1.2, 0.9, [teal, rust, orange][Math.abs(Math.round(dx / 7.5)) % 3]);
    }
    for (const dz of [-12, 4]) for (let dx = -20; dx < 22; dx += 13) { box(x + dx, 0.85, z + dz, 4.4, 0.16, 4.4, stone); cylinder(x + dx, 0.45, z + dz, 0.34, 0.9, dark); solid(x + dx, z + dz, 4.6, 4.6); }
    sign('BEAUTY WORLD MARKET', x, 8.6, z - 25.4, 30, 2.3, '#8f4a32');
  }

  /** Low shop terrace along the main road, with a covered five-foot way. */
  function shopRow(startX: number, z: number, count: number, facing: 1 | -1, width = 14) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, front = z + facing * 7;
      box(x, 5, z, width - 0.4, 10, 14, bands[i % bands.length], scene, true); solid(x, z, width, 14);
      box(x, 10.4, z, width, 0.8, 15, pale);
      for (const dx of [-3.2, 3.2]) { box(x + dx, 7.4, front + facing * 0.14, 2.4, 3.2, 0.24, glass); box(x + dx, 9.4, front + facing * 0.3, 2.8, 0.4, 0.4, timber); }
      box(x, 2.2, front + facing * 0.16, 3.6, 4.4, 0.22, wood);
      box(x, 4.6, front + facing * 2.2, width, 0.4, 4.6, pale, scene, true);
      for (const dx of [-width / 2 + 1.5, width / 2 - 1.5]) { cylinder(x + dx, 2.3, front + facing * 4, 0.3, 4.6, pale); solid(x + dx, front + facing * 4, 0.8, 0.8); }
      box(x, 0.26, front + facing * 2.3, width, 0.3, 4.8, paving);
    }
  }

  ridge(-175, -25, 70, 90);
  corridor(CORRIDOR_X);
  trussBridge(CORRIDOR_X, 40);
  marketHall(-55, -25);
  bungalow(-88, 85); bungalow(-52, 85); bungalow(-16, 85, -1);
  shopRow(146, -25, 5, 1);
  shopRow(-88, 150, 5, 1); shopRow(24, 150, 2, 1); shopRow(146, 150, 4, 1);

  // Reserve floor west of the ridge, and the corridor's flanking scrub.
  for (let x = -222; x <= -152; x += 10) for (let z = -158; z <= -104; z += 10) {
    if ((Math.round(x) + Math.round(z)) % 3 === 0) continue;
    cylinder(x, 6, z, 0.45, 12, wood); solid(x, z, 0.9, 0.9);
    for (let layer = 0; layer < 2; layer++) blob(x + (layer ? 1.5 : -1.5), 11 + layer * 1.8, z, 4.4, 2, 4.4, layer ? fern : deep);
  }
  sign('NATURE RESERVE', -187, 7.4, -96, 26, 2.3, '#2f5140');

  // East field carries the range; planting stays on its margins.
  box(175, 0.18, 85, 64, 0.35, 56, lawn);
  for (const z of [62, 106]) { tree(148, z, 9, wood, leaf); tree(202, z - 4, 8, wood, fern); }
  for (const z of [68, 100]) { box(204, 0.85, z, 3.4, 0.22, 1.2, wood); solid(204, z, 3.6, 1.2); }
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -150; z <= 150; z += 26) tree(x, z, 8, wood, fern);
  for (let x = -200; x <= 200; x += 30) { if (Math.abs(x - CORRIDOR_X) < 18) continue; tree(x, -EDGE_Z - 16, 8, wood, leaf); tree(x, EDGE_Z + 16, 8, wood, leaf); }

  const pedestrians = ['#e9e7d8', '#6d92a0', '#8f4a32', '#548245'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(CORRIDOR_X, -40 + index * 20, shirt, skin, dark), walker(-90 + index * 20, 14, shirt, skin, dark)]);
  const car = kit.car(mat('#7e9488'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(BUKIT_TIMAH_STAMPS, orange);
  scene.userData.districtFeatures = ['terraced-forest-ridge', 'trig-marker-summit', 'ballast-and-sleeper-corridor', 'warren-truss-web', 'timber-banded-render', 'bungalow-pier-undercroft', 'deep-verandah-posts', 'clerestory-market-roof', 'trapezoidal-storm-canal', 'canal-street-bridges'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.3 + index) * 1.2; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -110 + ((time * 1.2 + index * 19) % 120); person.rotation.y = -Math.PI / 2; }
        else { person.position.z = -60 + ((time * 1.1 + index * 23) % 150); person.rotation.y = Math.PI; }
      });
    },
  });
}
