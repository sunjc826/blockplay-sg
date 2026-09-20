import * as THREE from 'three';
import { TAMPINES_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// On the town-centre verge, looking across at the round market.
export const TAMPINES_SPAWN = { x: -20, z: 8, yaw: Math.PI / 2 };
export const TAMPINES_BOUNDS = { minX: -260, maxX: 260, minZ: -215, maxZ: 215 };
export { TAMPINES_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-100, 20, 130], NS_ROADS = [-140, -20, 110];
const EDGE_X = 235, EDGE_Z = 185;
/** Worked-out sand quarry, filled: one block, so no street runs into it. */
const POND = { x: 172, z: 75, width: 70, depth: 55 };
export const TAMPINES_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of Tampines: a round market under a
 * radial roof, a stadium bowl beside the town centre, three malls over the
 * interchange, slab precincts on their hawker decks, and a filled quarry in
 * the eastern block. Invented for play, without reference capture.
 */
export function buildTampinesScene() {
  const kit = createSceneKit({
    background: '#cdd9dd', fogNear: 290, fogFar: 900,
    sun: { x: -130, y: 205, z: 130 }, shadow: { extent: 265, far: 680 },
    hemisphere: { sky: '#f4f8fa', ground: '#787563', intensity: 1.8 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#565c5f'), white = mat('#e9e7d8'), paving = mat('#bbb6a9'), kerb = mat('#cec8ba');
  const water = mat('#4a8a9c', 0.42), shallow = mat('#5fa2b2', 0.38), lawn = mat('#8ca86e'), grass = mat('#7e9762');
  const concrete = mat('#aaa99f'), pale = mat('#e6e0d2'), stone = mat('#b4b3aa'), dark = mat('#36434a');
  const glass = mat('#6f95a6', 0.22, 0.32), steel = mat('#b0b8bb', 0.28, 0.55), wood = mat('#7b6148');
  const terra = mat('#b0644a'), teal = mat('#2f7b84'), rust = mat('#a8563a'), safety = mat('#d8a02a');
  const leaf = mat('#45713e'), fern = mat('#5b8a4c'), reed = mat('#94a558'), orange = mat('#f0a044'), skin = mat('#b18c71');
  const turf = mat('#4f8a46'), clay = mat('#9c6a4a');
  const panels = ['#dcc98f', '#8fb6ae', '#c9a2a8', '#9db2c6', '#cfd3b6'].map(color => mat(color));

  const ripples: THREE.Mesh[] = [];
  box(0, -0.6, 0, 620, 1, 520, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  /** Round market: a drum of stalls under a radial roof and a vented cap. */
  function roundMarket(x: number, z: number) {
    const radius = 26;
    box(x, 0.2, z, radius * 2 + 16, 0.4, radius * 2 + 16, paving);
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI * 2 / 24;
      const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      cylinder(px, 3.4, pz, 0.45, 6.8, pale); solid(px, pz, 1.1, 1.1);
      // Stall bays face outward around the drum, with shutters between piers.
      const sx = x + Math.cos(angle + 0.13) * (radius - 3), sz = z + Math.sin(angle + 0.13) * (radius - 3);
      const stall = box(sx, 2, sz, 5.4, 4, 6, panels[i % panels.length]);
      stall.rotation.y = -angle; solid(sx, sz, 5.6, 5.6);
      const board = box(x + Math.cos(angle + 0.13) * (radius + 0.6), 5.4, z + Math.sin(angle + 0.13) * (radius + 0.6), 5.6, 1.3, 0.3, [teal, rust, safety][i % 3]);
      board.rotation.y = -angle;
    }
    // Radial roof: one rafter and one panel per bay, rising to a vented cap.
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI * 2 / 24;
      beam(new THREE.Vector3(x + Math.cos(angle) * (radius + 3), 6.6, z + Math.sin(angle) * (radius + 3)),
        new THREE.Vector3(x + Math.cos(angle) * 5, 14, z + Math.sin(angle) * 5), 0.24, steel);
      const mid = (radius + 3 + 5) / 2, panel = box(x + Math.cos(angle + 0.13) * mid, 10.4, z + Math.sin(angle + 0.13) * mid, radius, 0.35, mid * 0.55, terra);
      panel.rotation.y = -angle - 0.13; panel.rotation.z = 0.28;
    }
    for (let ring = 0; ring < 3; ring++) cylinder(x, 14.4 + ring * 1.6, z, 7 - ring * 1.8, 1.4, ring % 2 ? steel : terra);
    const cap = new THREE.Mesh(geo(new THREE.ConeGeometry(5.4, 5, 12)), terra);
    cap.position.set(x, 20.4, z); cap.castShadow = true; scene.add(cap);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; box(x + Math.cos(a) * 6.4, 15.6, z + Math.sin(a) * 6.4, 1.6, 1.1, 0.4, dark); }
    solid(x, z, 11, 11);
    sign('ROUND MARKET', x, 8.4, z - radius - 7, 26, 2.3, '#8a4a20');
  }

  /** Stadium: a banked bowl around a pitch, with a canopy over one stand. */
  function stadium(x: number, z: number) {
    box(x, 0.2, z, 96, 0.4, 88, paving);
    for (let tier = 0; tier < 5; tier++) {
      const w = 84 - tier * 6, d = 76 - tier * 6, y = 2 + tier * 2.4;
      for (const side of [-1, 1]) {
        box(x, y, z + side * (d / 2 - 1), w, 2.4, 7, tier % 2 ? concrete : stone);
        box(x + side * (w / 2 - 1), y, z, 7, 2.4, d, tier % 2 ? concrete : stone);
      }
    }
    solid(x, z, 88, 80);
    for (let tier = 0; tier < 4; tier++) for (const side of [-1, 1]) {
      for (let dx = -34; dx < 36; dx += 4.4) box(x + dx, 3.4 + tier * 2.4, z + side * (36 - tier * 3), 4, 0.9, 1.6, panels[(tier + Math.abs(Math.round(dx / 4.4))) % panels.length]);
    }
    box(x, 0.5, z, 60, 0.4, 44, turf);
    for (const dx of [-26, 26]) box(x + dx, 0.62, z, 0.5, 0.06, 26, white);
    box(x, 0.62, z, 0.5, 0.06, 44, white);
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; box(x + Math.cos(a) * 12, 0.62, z + Math.sin(a) * 8, 1.2, 0.06, 0.5, white); }
    // Cantilevered canopy over the west stand, on two masts.
    for (const dz of [-22, 22]) { cylinder(x - 50, 17, z + dz, 1.1, 34, steel); solid(x - 50, z + dz, 2.6, 2.6); }
    box(x - 34, 25.4, z, 34, 1, 76, steel, scene, true);
    for (const dz of [-30, -10, 10, 30]) beam(new THREE.Vector3(x - 50, 33, z + dz), new THREE.Vector3(x - 18, 25.4, z + dz), 0.22, steel);
    for (const [dx, dz] of [[44, -40], [44, 40], [-44, -40], [-44, 40]] as const) {
      cylinder(x + dx, 16, z + dz, 0.7, 32, steel); solid(x + dx, z + dz, 1.8, 1.8);
      for (let r = 0; r < 3; r++) box(x + dx, 31 + r * 1.4, z + dz, 6.4 - r, 1, 2.4, safety);
    }
    sign('TAMPINES HUB', x, 9.4, z - 48, 30, 2.4, '#2c4450');
  }

  /** Three malls over the interchange, tied by link bridges at first storey. */
  function mallCluster(x: number, z: number) {
    const spans: [number, number][] = [[-30, 34], [14, 30], [52, 26]];
    for (const [dx, w] of spans) {
      box(x + dx, 13, z, w, 26, 44, concrete, scene, true); solid(x + dx, z, w, 44);
      for (let y = 5; y < 26; y += 5) {
        for (let ddx = -w / 2 + 4; ddx < w / 2 - 2; ddx += 7) for (const side of [-1, 1]) box(x + dx + ddx, y, z + side * 22.4, 5.6, 3.4, 0.6, glass);
        for (let dz = -18; dz < 20; dz += 7) for (const side of [-1, 1]) box(x + dx + side * (w / 2 + 0.4), y, z + dz, 0.6, 3.4, 5.6, glass);
      }
      box(x + dx, 27.6, z, w + 4, 2, 48, steel);
    }
    for (const [a, b] of [[-30 + 17, 14 - 15], [14 + 15, 52 - 13]] as const) {
      box(x + (a + b) / 2, 9, z + 10, b - a, 4.4, 9, pale, scene, true);
      for (let dz = -3; dz <= 3; dz += 3) box(x + (a + b) / 2, 9, z + 10 + dz, b - a, 2.4, 0.4, glass);
    }
    // Interchange: sawtooth berths under a long roof on the town-centre side.
    box(x + 10, 0.18, z + 32, 130, 0.35, 26, asphalt);
    for (let dx = -50; dx <= 50; dx += 20) {
      box(x + 10 + dx, 1.6, z + 38, 9, 3.2, 3.4, panels[Math.abs(Math.round(dx / 20)) % panels.length]);
      solid(x + 10 + dx, z + 38, 9, 3.4);
    }
    box(x + 10, 4.4, z + 28, 124, 0.4, 11, steel, scene, true);
    for (let dx = -54; dx <= 54; dx += 18) { cylinder(x + 10 + dx, 2.2, z + 24, 0.24, 4.4, steel); solid(x + 10 + dx, z + 24, 0.65, 0.65); }
    sign('TAMPINES INTERCHANGE', x + 10, 6.6, z + 26, 34, 2.3, '#2f4a56');
  }

  /** Slab precinct: long blocks on a hawker deck, with corner stair towers. */
  function precinct(x: number, z: number) {
    for (const [dz, len, h] of [[-24, 86, 36], [24, 74, 42]] as const) {
      box(x, 4, z + dz, len, 8, 18, concrete); solid(x, z + dz, len, 18);
      for (let dx = -len / 2 + 6; dx < len / 2 - 4; dx += 9) box(x + dx, 4, z + dz - 9.4, 5, 5.4, 0.6, glass);
      box(x, h / 2 + 8.4, z + dz, len - 6, h, 15, pale, scene, true);
      for (let y = 11; y < h + 7; y += 3.2) {
        const band = panels[(Math.round(y / 3.2) + Math.abs(Math.round(dz))) % panels.length];
        for (const side of [-1, 1]) {
          box(x, y, z + dz + side * 7.8, len - 8, 2.2, 0.5, band);
          for (let dx = -len / 2 + 6; dx < len / 2 - 4; dx += 6) box(x + dx, y, z + dz + side * 8.1, 3.4, 1.5, 0.4, glass);
        }
      }
      box(x, h + 9.4, z + dz, len - 2, 1.4, 17, stone);
      for (const dx of [-len / 2 + 8, 0, len / 2 - 8]) box(x + dx, h / 2 + 9, z + dz + 9, 7, h, 5, concrete);
    }
    for (const dx of [-30, 30]) { box(x + dx, 2.6, z, 9, 0.35, 42, pale, scene, true); for (let dz = -18; dz <= 18; dz += 9) { cylinder(x + dx, 1.3, z + dz, 0.2, 2.6, pale); solid(x + dx, z + dz, 0.55, 0.55); } }
  }

  /** Filled quarry: steep worked faces on two sides, a shelving beach on one. */
  function quarry() {
    const { x, z, width, depth } = POND;
    box(x, 0.18, z, width + 24, 0.35, depth + 24, lawn);
    box(x, -0.06, z, width, 0.4, depth, water); solid(x, z, width, depth);
    for (let i = 0; i < 16; i++) {
      const ripple = box(x - width / 2 + 8 + (i * 19) % (width - 14), 0.16, z - depth / 2 + 6 + (i * 13) % (depth - 12), 7 + i % 3, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
    for (const side of [-1, 1]) for (let dz = -depth / 2; dz <= depth / 2; dz += 7) {
      for (let step = 0; step < 3; step++) {
        const face = box(x + side * (width / 2 + 2 + step * 2.4), 1.4 + step * 1.8, z + dz, 4.4, 3.6, 7, step % 2 ? clay : stone);
        face.rotation.z = side * 0.14;
      }
    }
    for (let dx = -width / 2; dx <= width / 2; dx += 6) for (let step = 0; step < 3; step++) box(x + dx, 0.6 + step * 0.5, z - depth / 2 - 2 - step * 2.6, 6, 1, 3, step % 2 ? mat('#cbbd97') : clay);
    for (let dx = -width / 2 + 6; dx < width / 2; dx += 9) for (let r = 0; r < 4; r++) blob(x + dx + r * 1.2, 1.4, z + depth / 2 + 3, 0.8, 2.2, 0.6, reed);
    sign('TAMPINES QUARRY', x, 5.4, z - depth / 2 - 14, 28, 2.3, '#2f6b78');
  }

  /** Cycle path: a coloured run with lane markings, weaving past the blocks. */
  function cyclePath(points: readonly (readonly [number, number])[]) {
    for (let i = 1; i < points.length; i++) {
      const [x0, z0] = points[i - 1], [x1, z1] = points[i];
      const length = Math.hypot(x1 - x0, z1 - z0);
      const run = box((x0 + x1) / 2, 0.22, (z0 + z1) / 2, 5, 0.3, length, clay);
      run.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      for (let n = 3; n < length; n += 7) {
        const t = n / length;
        box(x0 + (x1 - x0) * t, 0.4, z0 + (z1 - z0) * t, 0.3, 0.02, 2.4, white).rotation.y = run.rotation.y;
      }
    }
  }

  roundMarket(-80, -40);
  stadium(55, -40);
  mallCluster(40, 75);
  precinct(-188, -40); precinct(-188, 75); precinct(172, -40);
  quarry();
  cyclePath([[-20, -170], [-20, -60], [-52, 6], [-52, 96], [-20, 150]]);

  // Eco green: rough grassland with scattered scrub, and the range within it.
  box(-188, 0.18, 150, 80, 0.35, 56, lawn);
  for (let x = -228; x <= -212; x += 9) for (let z = 124; z <= 176; z += 9) {
    if ((Math.round(x) + Math.round(z)) % 4) continue;
    for (let r = 0; r < 3; r++) blob(x + r * 0.9, 0.9, z, 0.7, 1.8, 0.6, reed);
  }
  for (const z of [-160, -128]) { tree(-206, z, 9, wood, leaf); tree(-170, z + 14, 8, wood, fern); }
  for (const z of [130, 160]) { tree(-222, z, 9, wood, fern); tree(-154, z + 12, 8, wood, leaf); }

  // Town green at the north, and perimeter planting along the outer loop.
  box(-80, 0.18, 158, 110, 0.35, 40, lawn);
  for (const x of [-124, -36]) for (const z of [146, 172]) tree(x, z, 9, wood, leaf);
  for (const z of [150, 168]) { box(-80, 0.85, z, 3.4, 0.22, 1.2, wood); solid(-80, z, 3.6, 1.2); }
  for (let x = -210; x <= 210; x += 32) tree(x, -EDGE_Z - 16, 8, wood, leaf);
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -150; z <= 150; z += 28) tree(x, z, 8, wood, fern);

  const pedestrians = ['#e9e7d8', '#6f95a6', '#a8563a', '#8fb6ae'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-80 + index * 18, 10, shirt, skin, dark), walker(-20, -60 + index * 22, shirt, skin, dark)]);
  const car = kit.car(mat('#8aa0a6'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(TAMPINES_STAMPS, orange);
  scene.userData.districtFeatures = ['radial-market-roof', 'vented-drum-cap', 'outward-stall-bays', 'banked-stadium-tiers', 'cantilever-stand-canopy', 'mall-link-bridges', 'sawtooth-berths', 'hawker-deck-slabs', 'worked-quarry-faces', 'cycle-path-run'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.35 + index) * 1.4; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.z = -80 + ((time * 1.2 + index * 19) % 150); person.rotation.y = Math.PI; }
        else { person.position.x = -110 + ((time * 1.3 + index * 25) % 130); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
