import * as THREE from 'three';
import { TOA_PAYOH_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// In the precinct courtyard, looking across the sand pit at the dragon.
export const TOA_PAYOH_SPAWN = { x: 50, z: -2, yaw: Math.PI / 2 };
export const TOA_PAYOH_BOUNDS = { minX: -255, maxX: 255, minZ: -210, maxZ: 210 };
export { TOA_PAYOH_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-110, 10, 120], NS_ROADS = [-130, -10, 110];
const EDGE_X = 230, EDGE_Z = 180;
/** Town-park pond: one block, so no street runs into it. */
const POND = { x: -180, z: -66, width: 52, depth: 40 };
export const TOA_PAYOH_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of Toa Payoh: a first-generation new
 * town of long balcony-access slabs and a Y-shaped point block, a mosaic
 * dragon over its sand pit, a town park with a spiral lookout, and the hub and
 * interchange at the centre. Invented for play, without reference capture.
 */
export function buildToaPayohScene() {
  const kit = createSceneKit({
    background: '#ccd8dc', fogNear: 290, fogFar: 880,
    sun: { x: 120, y: 205, z: -130 }, shadow: { extent: 260, far: 670 },
    hemisphere: { sky: '#f4f7f9', ground: '#787564', intensity: 1.8 },
  });
  const { scene, box, cylinder, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#565c5f'), white = mat('#e9e7d8'), paving = mat('#bbb6a9'), kerb = mat('#cec8ba');
  const water = mat('#4a879c', 0.42), shallow = mat('#5f9eb0', 0.38), lawn = mat('#8ba76d'), grass = mat('#7d9661');
  const concrete = mat('#aaa99f'), pale = mat('#e7e1d3'), stone = mat('#b4b3aa'), dark = mat('#36434a');
  const glass = mat('#6f95a6', 0.22, 0.32), steel = mat('#b0b8bb', 0.28, 0.55), wood = mat('#7b6148');
  const sand = mat('#ddcda4'), scale1 = mat('#b8453a'), scale2 = mat('#d8a02a'), scale3 = mat('#e6e0d2');
  const teal = mat('#2f7b84'), rust = mat('#a8563a'), leaf = mat('#45713e'), fern = mat('#5b8a4c');
  const orange = mat('#f0a044'), skin = mat('#b18c71'), terra = mat('#b0644a');
  const bands = ['#e3d9c0', '#b7c6bc', '#d9c3a6', '#a9bccb', '#cfc3a4'].map(color => mat(color));

  const ripples: THREE.Mesh[] = [];
  box(0, -0.6, 0, 610, 1, 510, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  /**
   * First-generation slab: a long block whose access decks run the full
   * length as projecting bands, with a service stair at each end.
   */
  function earlySlab(x: number, z: number, length: number, height: number, facing: 1 | -1 = 1) {
    box(x, height / 2 + 3.4, z, length, height, 13, pale, scene, true); solid(x, z, length, 13);
    for (const dx of [-length / 2 + 4, 0, length / 2 - 4]) for (const dz of [-5, 5]) { box(x + dx, 1.7, z + dz, 2.2, 3.4, 2.2, concrete); solid(x + dx, z + dz, 2.6, 2.6); }
    box(x, 3.6, z, length, 0.6, 15, concrete);
    for (let level = 0; level < Math.floor(height / 3.1); level++) {
      const y = 5.4 + level * 3.1, band = bands[(level + Math.abs(Math.round(x / 40))) % bands.length];
      // Access deck: slab, balustrade and the bay divisions behind it.
      box(x, y - 1.2, z + facing * 7.4, length, 0.4, 2.4, concrete);
      box(x, y - 0.2, z + facing * 8.4, length, 1.1, 0.3, band);
      for (let dx = -length / 2 + 3; dx < length / 2 - 1; dx += 4.2) {
        box(x + dx, y, z + facing * 6.6, 3.2, 2.4, 0.4, glass);
        box(x + dx + 2.1, y, z + facing * 6.7, 0.5, 2.6, 0.5, pale);
      }
      for (let dx = -length / 2 + 6; dx < length / 2 - 2; dx += 8.4) box(x + dx, y, z - facing * 6.7, 2.6, 1.8, 0.4, glass);
    }
    for (const dx of [-length / 2 + 2, length / 2 - 2]) {
      box(x + dx, height / 2 + 4, z + facing * 9, 6, height + 1, 6, concrete, scene, true); solid(x + dx, z + facing * 9, 6, 6);
      for (let y = 6; y < height + 3; y += 3.1) box(x + dx, y, z + facing * 12.1, 4.4, 1.6, 0.4, dark);
    }
    box(x, height + 4, z, length + 2, 1.2, 15, stone);
  }

  /** Point block on a Y plan: three wings off a central core. */
  function yBlock(x: number, z: number, height: number) {
    box(x, height / 2 + 3, z, 13, height, 13, concrete, scene, true); solid(x, z, 13, 13);
    for (let wing = 0; wing < 3; wing++) {
      const angle = wing * Math.PI * 2 / 3 + Math.PI / 6;
      const wx = x + Math.cos(angle) * 15, wz = z + Math.sin(angle) * 15;
      const arm = box(wx, height / 2 + 3, wz, 20, height, 12, pale, scene, true);
      arm.rotation.y = -angle; solid(wx, wz, 16, 16);
      for (let y = 6; y < height + 2; y += 3.2) {
        const band = bands[(Math.round(y / 3.2) + wing) % bands.length];
        const face = box(wx + Math.cos(angle) * 6.2, y, wz + Math.sin(angle) * 6.2, 18, 2.2, 0.5, band);
        face.rotation.y = -angle;
        for (const s of [-1, 1]) {
          const side = box(wx + Math.cos(angle + s * Math.PI / 2) * 6.2, y, wz + Math.sin(angle + s * Math.PI / 2) * 6.2, 18, 2.2, 0.5, glass);
          side.rotation.y = -angle + Math.PI / 2;
        }
      }
      box(wx, height + 4, wz, 22, 1.2, 14, stone).rotation.y = -angle;
    }
    cylinder(x, height + 7, z, 2.4, 6, concrete);
    for (const dx of [-4, 4]) box(x + dx, height + 5.4, z, 2.4, 2.6, 6, steel);
  }

  /** Dragon over its sand pit: a mosaic head, arched spine and a tail. */
  function dragonPlayground(x: number, z: number) {
    box(x, 0.16, z, 56, 0.34, 40, sand);
    for (let i = 0; i < 40; i++) {
      const a = i * 0.9, r = 20 + (i % 3) * 3;
      box(x + Math.cos(a) * r, 0.34, z + Math.sin(a) * r * 0.7, 2.4, 0.04, 2.4, i % 2 ? paving : stone);
    }
    // Head: a blunt mass with mosaic bands, brows and a grinning mouth.
    box(x - 20, 2.6, z, 7, 5.2, 6.4, scale1, scene, true); solid(x - 20, z, 7.2, 6.6);
    for (let band = 0; band < 4; band++) box(x - 20, 1.4 + band * 1.3, z, 7.2, 0.5, 6.6, band % 2 ? scale2 : scale3);
    for (const dz of [-2, 2]) { box(x - 23.4, 4.2, z + dz, 1.6, 1.2, 1.6, scale3); box(x - 23.8, 4.2, z + dz, 0.8, 0.7, 0.8, dark); }
    box(x - 23.6, 1.6, z, 1.6, 1.4, 5.4, scale3);
    for (const dz of [-2.4, 0, 2.4]) box(x - 24.2, 2.2, z + dz, 0.9, 0.5, 0.9, white);
    // Spine: segments arching up and down, with rungs you climb between.
    for (let n = 0; n < 11; n++) {
      const sx = x - 14 + n * 3.4, rise = Math.sin(n / 10 * Math.PI * 2) * 1.9;
      const hoop = new THREE.Mesh(geo(new THREE.TorusGeometry(2.4, 0.42, 5, 12, Math.PI)), n % 2 ? scale1 : scale2);
      hoop.position.set(sx, 1.6 + rise, z); hoop.rotation.y = Math.PI / 2; scene.add(hoop);
      solid(sx, z, 1.4, 5.2);
      if (n < 10) for (const dz of [-2.2, 2.2]) cylinder(sx + 1.7, 1.5 + rise, z + dz, 0.12, 3.2, dark).rotation.z = Math.PI / 2;
      box(sx, 3.6 + rise, z, 1.1, 1, 1.1, scale3);
    }
    // Tail: three tapering blocks, and the slide that runs off the last one.
    for (let n = 0; n < 3; n++) box(x + 24 + n * 3, 1.4 - n * 0.3, z, 3, 2.2 - n * 0.5, 4 - n, n % 2 ? scale2 : scale1);
    const slide = box(x + 33, 1.2, z, 8, 0.3, 2.6, scale3, scene, true); slide.rotation.z = -0.24;
    for (const dz of [-1.5, 1.5]) box(x + 33, 1.8, z + dz, 8, 0.9, 0.3, scale3);
    for (const [dx, dz] of [[-6, -14], [10, -14], [-6, 14], [10, 14]] as const) {
      cylinder(x + dx, 1.6, z + dz, 0.16, 3.2, dark); solid(x + dx, z + dz, 0.5, 0.5);
      if (dz < 0) box(x + dx + 8, 3.1, z + dz, 16, 0.18, 0.18, dark);
    }
    sign('DRAGON PLAYGROUND', x, 5.6, z - 22, 26, 2.2, '#8a3a2a');
  }

  /** Town-park lookout: a drum with an external spiral ramp to a viewing deck. */
  function lookoutTower(x: number, z: number) {
    cylinder(x, 11, z, 4.4, 22, pale); solid(x, z, 9, 9);
    for (let n = 0; n < 34; n++) {
      const angle = n * 0.42, y = n * 0.62;
      const tread = box(x + Math.cos(angle) * 6.6, y, z + Math.sin(angle) * 6.6, 4.4, 0.3, 2.2, concrete);
      tread.rotation.y = -angle;
      cylinder(x + Math.cos(angle) * 8.4, y + 0.9, z + Math.sin(angle) * 8.4, 0.1, 1.8, steel);
      if (n % 4 === 0) cylinder(x + Math.cos(angle) * 8.4, y / 2, z + Math.sin(angle) * 8.4, 0.16, y, concrete);
    }
    for (let ring = 0; ring < 2; ring++) cylinder(x, 22.4 + ring * 1.1, z, 8 - ring * 1.6, 1, ring % 2 ? stone : pale);
    for (let n = 0; n < 16; n++) { const a = n * Math.PI / 8; cylinder(x + Math.cos(a) * 7.2, 24.4, z + Math.sin(a) * 7.2, 0.14, 2.4, steel); }
    const cap = new THREE.Mesh(geo(new THREE.ConeGeometry(8.4, 4, 14)), terra);
    cap.position.set(x, 27.6, z); cap.castShadow = true; scene.add(cap);
    cylinder(x, 30.4, z, 0.3, 3, steel);
    sign('TOWN PARK LOOKOUT', x, 6.4, z - 12, 24, 2.1, '#2f5140');
  }

  /** Park pond with a zigzag bridge along one bank. */
  function pond() {
    const { x, z, width, depth } = POND;
    box(x, 0.18, z, width + 28, 0.35, depth + 28, lawn);
    box(x, -0.06, z, width, 0.4, depth, water); solid(x, z, width, depth);
    for (let i = 0; i < 14; i++) {
      const ripple = box(x - width / 2 + 6 + (i * 17) % (width - 12), 0.16, z - depth / 2 + 5 + (i * 11) % (depth - 10), 6 + i % 3, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
    for (const side of [-1, 1]) box(x, 0.6, z + side * (depth / 2 + 1.4), width + 6, 1.1, 3, stone);
    for (let n = 0; n < 5; n++) {
      const bx = x - 18 + n * 9, bz = z + depth / 2 + 6 + (n % 2 ? 4 : 0);
      box(bx, 0.9, bz, 9, 0.3, 3.4, wood); solid(bx, bz, 9, 3.4);
      for (const dz of [-1.6, 1.6]) box(bx, 1.5, bz + dz, 9, 0.9, 0.2, wood);
    }
    for (const dx of [-32, 32]) for (const dz of [-24, 24]) tree(x + dx, z + dz, 9, wood, fern);
  }

  /** Town hub: a banded podium under twin towers, with berths alongside. */
  function townHub(x: number, z: number) {
    box(x, 11, z, 88, 22, 56, concrete, scene, true); solid(x, z, 88, 56);
    for (let y = 4; y < 22; y += 5) {
      for (let dx = -40; dx < 42; dx += 7) for (const side of [-1, 1]) box(x + dx, y, z + side * 28.4, 5.6, 3.4, 0.6, glass);
      for (let dz = -22; dz < 24; dz += 7) for (const side of [-1, 1]) box(x + side * 44.4, y, z + dz, 0.6, 3.4, 5.6, glass);
    }
    box(x, 23.4, z, 92, 2, 60, stone);
    for (const [dx, h, tint] of [[-22, 44, scale1], [22, 38, teal]] as const) {
      box(x + dx, h / 2 + 24, z - 4, 28, h, 24, pale, scene, true);
      for (let y = 28; y < h + 22; y += 3.4) {
        box(x + dx, y, z - 16.3, 24, 2.4, 0.5, tint);
        for (let ddx = -10; ddx < 12; ddx += 5) box(x + dx + ddx, y, z - 16.6, 3.4, 1.6, 0.4, glass);
      }
      box(x + dx, h + 25, z - 4, 30, 1.4, 26, stone);
    }
    box(x, 0.18, z + 40, 130, 0.35, 24, asphalt);
    for (let dx = -50; dx <= 50; dx += 20) { box(x + dx, 1.6, z + 45, 9, 3.2, 3.4, bands[Math.abs(Math.round(dx / 20)) % bands.length]); solid(x + dx, z + 45, 9, 3.4); }
    box(x, 4.4, z + 36, 124, 0.4, 10, steel, scene, true);
    for (let dx = -54; dx <= 54; dx += 18) { cylinder(x + dx, 2.2, z + 33, 0.24, 4.4, steel); solid(x + dx, z + 33, 0.65, 0.65); }
    sign('TOWN HUB', x, 12.4, z - 29, 28, 2.4, '#b8453a');
  }

  /** Hawker centre: a vented roof over open tables, in the old town manner. */
  function hawkerCentre(x: number, z: number) {
    box(x, 0.2, z, 70, 0.4, 50, paving);
    box(x, 4.4, z, 58, 8.8, 40, pale, scene, true); solid(x, z, 58, 40);
    for (const side of [-1, 1]) { const roof = box(x, 10.4, z + side * 10, 62, 0.5, 24, terra, scene, true); roof.rotation.x = side * 0.17; }
    box(x, 12.4, z, 62, 0.9, 8, terra);
    for (let dx = -24; dx < 26; dx += 6) { box(x + dx, 13.2, z, 3.4, 1.2, 6, stone); box(x + dx, 14, z, 4, 0.3, 7, dark); }
    for (const side of [-1, 1]) for (let dx = -26; dx < 28; dx += 7.5) {
      box(x + dx, 3, z + side * 20.2, 5.4, 5.4, 0.5, dark);
      box(x + dx, 6.4, z + side * 20.6, 6, 1.2, 0.9, [teal, rust, orange][Math.abs(Math.round(dx / 7.5)) % 3]);
    }
    for (const dz of [-10, 4]) for (let dx = -18; dx < 20; dx += 12) { box(x + dx, 0.8, z + dz, 4.4, 0.16, 4.4, stone); cylinder(x + dx, 0.42, z + dz, 0.34, 0.85, dark); solid(x + dx, z + dz, 4.6, 4.6); }
    sign('LORONG HAWKER CENTRE', x, 8.4, z - 22.4, 30, 2.2, '#a8563a');
  }

  dragonPlayground(50, -50);
  earlySlab(50, -86, 92, 30); earlySlab(50, -18, 80, 27, -1);
  lookoutTower(-180, -20); pond();
  yBlock(-70, 62, 40);
  earlySlab(-180, 62, 76, 33); earlySlab(-180, 96, 68, 24, -1);
  townHub(50, 62);
  hawkerCentre(170, -50);
  earlySlab(170, -86, 70, 27);
  earlySlab(50, 150, 96, 21); earlySlab(-70, 150, 74, 24);

  // School field carries the range; planting stays at its margins.
  box(170, 0.18, 65, 80, 0.35, 70, lawn);
  for (let dx = -32; dx <= 32; dx += 16) box(170 + dx, 0.36, 65, 0.4, 0.02, 60, white);
  for (const z of [40, 92]) { tree(136, z, 9, wood, leaf); tree(204, z + 4, 8, wood, fern); }
  for (const z of [46, 84]) { box(206, 0.85, z, 3.4, 0.22, 1.2, wood); solid(206, z, 3.6, 1.2); }

  // Courtyard planting, void-deck seating and the perimeter trees.
  for (const [cx, cz] of [[50, -50], [-70, 62], [170, -50]] as const) {
    for (const dx of [-38, 38]) for (const dz of [-16, 16]) tree(cx + dx, cz + dz, 8, wood, leaf);
  }
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -150; z <= 150; z += 28) tree(x, z, 8, wood, fern);
  for (let x = -200; x <= 200; x += 30) { tree(x, -EDGE_Z - 16, 8, wood, leaf); tree(x, EDGE_Z + 16, 8, wood, leaf); }

  const pedestrians = ['#e9e7d8', '#6f95a6', '#a8563a', '#8fb6ae'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(20 + index * 16, -2, shirt, skin, dark), walker(-180 + index * 14, 24, shirt, skin, dark)]);
  const car = kit.car(mat('#8a9ea4'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(TOA_PAYOH_STAMPS, orange);
  scene.userData.districtFeatures = ['balcony-access-decks', 'end-service-stairs', 'y-plan-point-block', 'mosaic-dragon-head', 'arched-spine-segments', 'sand-pit-apron', 'spiral-ramp-lookout', 'zigzag-pond-bridge', 'banded-hub-towers', 'vented-hawker-roof'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.34 + index) * 1.3; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -200 + ((time * 1.2 + index * 21) % 90); person.rotation.y = -Math.PI / 2; }
        else { person.position.x = -10 + ((time * 1.3 + index * 17) % 120); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
