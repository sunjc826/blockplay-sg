import * as THREE from 'three';
import { WOODLANDS_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';
import { withVerticalRoutes } from './vertical-routes';

// On the causeway approach, facing the checkpoint and the far shore.
export const WOODLANDS_SPAWN = { x: 0, z: -110, yaw: 0 };
export const WOODLANDS_BOUNDS = { minX: -260, maxX: 260, minZ: -225, maxZ: 170 };
export { WOODLANDS_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-60, 40], NS_ROADS = [-130, 40];
const EDGE_X = 235, EDGE_Z = 130;
/**
 * The strait runs the width of the district and is crossed in exactly two
 * places: the causeway, which is a road, and the jetty, which is not. Both are
 * gaps in the water rather than decks laid over it.
 */
const STRAIT = { nearZ: -200, farZ: -145 };
const STRAIT_SPANS: readonly (readonly [number, number])[] = [[-215, -20], [20, 106], [134, 215]];
const CAUSEWAY = { x: 0, fromZ: -130, toZ: -200 }, JETTY_X = 120;
export const WOODLANDS_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: CAUSEWAY.x, z: CAUSEWAY.fromZ }, { x: CAUSEWAY.x, z: CAUSEWAY.toZ }] },
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of Woodlands: the causeway and its
 * checkpoint running north across the strait, a waterfront park and jetty, a
 * mall and civic square, and the precincts and linkways behind them. Invented
 * for play; researched changes are logged in docs/NORTH-EAST-REVIEW.md.
 */
export function buildWoodlandsScene() {
  const kit = createSceneKit({
    background: '#cbdae1', fogNear: 300, fogFar: 940,
    sun: { x: 140, y: 210, z: 120 }, shadow: { extent: 270, far: 700 },
    hemisphere: { sky: '#f3f9fb', ground: '#767a66', intensity: 1.84 },
  });
  const { scene, box, cylinder, blob, solid, sign, tree, walker, stampRings, mat } = kit;

  const asphalt = mat('#575d60'), white = mat('#eae8da'), paving = mat('#bcb7aa'), kerb = mat('#cfc9bb');
  const water = mat('#46849c', 0.42), shallow = mat('#5c9fb2', 0.38), lawn = mat('#8aa66c'), grass = mat('#7c9560');
  // Shots into these splash rather than spark; see water.ts.
  markWater(water, shallow);
  const concrete = mat('#adaca2'), pale = mat('#e5dfd1'), stone = mat('#b5b4ab'), dark = mat('#36434a');
  const glass = mat('#6f95a6', 0.22, 0.32), steel = mat('#b0b8bb', 0.28, 0.55), wood = mat('#7b6148');
  const leaf = mat('#44703d'), fern = mat('#5b8a4c'), orange = mat('#f0a044'), skin = mat('#b18c71');
  const teal = mat('#2f6b78'), rust = mat('#a8563a'), navy = mat('#2b4a6b'), safety = mat('#d8a02a');
  const ballast = mat('#8d8a80');
  const panels = ['#dcc98f', '#8fb6ae', '#c9a2a8', '#9db2c6', '#cfd3b6'].map(color => mat(color));

  box(0, -0.6, -20, 620, 1, 460, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });
  // The causeway spur is laid by hand: the grid runs every road edge to edge,
  // and this one has to start at the perimeter and stop at the far shore.
  {
    const mid = (CAUSEWAY.fromZ + CAUSEWAY.toZ) / 2, run = Math.abs(CAUSEWAY.toZ - CAUSEWAY.fromZ);
    box(CAUSEWAY.x, 0, mid, 34, 0.14, run, asphalt);
    for (let z = CAUSEWAY.fromZ; z > CAUSEWAY.toZ; z -= 12) for (const dx of [-8, 8]) box(CAUSEWAY.x + dx, 0.1, z, 0.18, 0.03, 5, white);
    for (const side of [-1, 1]) {
      box(CAUSEWAY.x + side * 16, 0.7, mid, 1.6, 1.6, run, stone); solid(CAUSEWAY.x + side * 16, mid, 1.6, run);
      for (let z = CAUSEWAY.fromZ; z >= CAUSEWAY.toZ; z -= 10) cylinder(CAUSEWAY.x + side * 16, 1.4, z, 0.2, 1.6, stone);
    }
    // Rail alongside the road, on the embankment's western shoulder.
    box(CAUSEWAY.x - 24, 0.4, mid, 11, 0.5, run, ballast);
    for (let z = CAUSEWAY.fromZ; z >= CAUSEWAY.toZ; z -= 4) box(CAUSEWAY.x - 24, 0.75, z, 9, 0.24, 1.4, wood);
    for (const dx of [-27, -21]) box(CAUSEWAY.x + dx, 0.95, mid, 0.5, 0.3, run, steel);
    for (let z = CAUSEWAY.fromZ - 14; z >= CAUSEWAY.toZ; z -= 26) { cylinder(CAUSEWAY.x + 18, 5, z, 0.18, 10, dark); box(CAUSEWAY.x + 15.4, 9.6, z, 5.4, 0.3, 0.8, pale); solid(CAUSEWAY.x + 18, z, 0.5, 0.5); }
  }

  // Strait: one pool per span, with a rip of shallows along the near shore.
  const ripples: THREE.Mesh[] = [];
  const midZ = (STRAIT.nearZ + STRAIT.farZ) / 2, depthZ = STRAIT.farZ - STRAIT.nearZ;
  for (const [fromX, toX] of STRAIT_SPANS) {
    const width = toX - fromX, cx = (fromX + toX) / 2;
    box(cx, -0.06, midZ, width, 0.4, depthZ, water);
    solid(cx, midZ, width, depthZ);
    box(cx, 0.5, STRAIT.farZ + 2.6, width, 1.2, 5, stone);
    for (let i = 0; i * 23 < width; i++) {
      const ripple = box(fromX + 8 + i * 23, 0.16, midZ + ((i * 9) % 40) - 20, 9 + i % 4, 0.02, 0.22, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
  }
  // The far shore, past the water: read across, never reached.
  for (let x = -210; x <= 210; x += 26) {
    const h = 14 + (Math.abs(Math.round(x)) % 5) * 6;
    box(x, h / 2, -214, 18, h, 20, panels[Math.abs(Math.round(x / 26)) % panels.length], scene, true);
    for (let y = 5; y < h; y += 4) box(x, y, -203.6, 15, 2.4, 0.5, glass);
  }
  for (let x = -200; x <= 200; x += 40) { cylinder(x, 16, -224, 1, 32, steel); box(x, 33, -224, 7, 1.4, 1.4, steel); }

  /** Checkpoint: booth rows either side of the open lanes, under a long canopy. */
  function checkpointComplex(z: number) {
    box(0, 0.2, z, 60, 0.4, 56, paving);
    for (const dx of [-7, 7]) for (const dz of [-14, 0, 14]) {
      box(dx, 1.8, z + dz, 4, 3.6, 8, pale, scene, true); solid(dx, z + dz, 4, 8);
      box(dx + (dx > 0 ? 2.1 : -2.1), 2.2, z + dz, 0.4, 1.6, 3.4, glass);
      box(dx, 3.9, z + dz, 4.6, 0.5, 8.6, teal);
    }
    for (const dx of [-24, 24]) { box(dx, 4, z, 7, 8, 52, pale, scene, true); solid(dx, z, 7, 52); }
    box(0, 9.4, z, 62, 0.8, 58, steel, scene, true);
    for (const dx of [-21, 21]) for (const dz of [-22, 0, 22]) { cylinder(dx, 4.7, z + dz, 0.6, 9.4, steel); solid(dx, z + dz, 1.3, 1.3); }
    for (const dz of [-26, 26]) { box(0, 11.4, z + dz, 60, 2.4, 1, navy); for (let dx = -20; dx <= 20; dx += 10) box(dx, 11.4, z + dz - 0.7, 6, 1.4, 0.4, white); }
    for (const dx of [-14, 0, 14]) box(dx, 6.4, z - 28, 7, 2.6, 0.5, safety);
    sign('WOODLANDS CHECKPOINT', 0, 13.4, z - 30, 40, 2.6, '#1f3f5e');
  }
  // The checkpoint belongs on the Singapore shore, not on the water span.
  checkpointComplex(-90);

  /** Waterfront jetty on piles, out through the gap left for it. */
  function jetty(x: number) {
    box(x, -0.15, -168, 16, 0.3, 58, concrete);
    for (let z = -140; z >= -196; z -= 4) {
      box(x, 0.02, z, 15.6, 0.06, 1.8, paving);
      for (const dx of [-7, 7]) { cylinder(x + dx, 0.15, z, 0.3, 1.1, wood); if (z % 16 > -4 && z % 16 <= 0) { cylinder(x + dx, 1.6, z, 0.18, 2.8, wood); solid(x + dx, z, 0.6, 0.6); } }
    }
    for (const dx of [-6.6, 6.6]) box(x + dx, 1.7, -168, 0.14, 0.9, 58, steel);
    for (const z of [-150, -186]) for (const dx of [-4, 4]) { cylinder(x + dx, 3.4, z, 0.16, 6.8, dark); box(x + dx, 6.6, z, 0.9, 0.35, 0.9, pale); solid(x + dx, z, 0.5, 0.5); }
    box(x, -0.15, -194, 20, 0.3, 8, concrete);
    sign('WOODLANDS WATERFRONT', x, 4.4, -138, 26, 2.2, '#2f6b78');
  }
  jetty(JETTY_X);

  /** Precinct: point blocks on void decks, an MSCP and the linkways between. */
  function precinct(x: number, z: number) {
    for (const [dx, dz, h] of [[-34, -16, 40], [22, -20, 46], [-10, 22, 36], [38, 18, 42]] as const) {
      for (const cx of [-9, 0, 9]) for (const cz of [-7, 7]) { box(x + dx + cx, 3, z + dz + cz, 2.2, 6, 2.2, concrete); solid(x + dx + cx, z + dz + cz, 2.6, 2.6); }
      box(x + dx, 6.4, z + dz, 26, 0.8, 20, concrete);
      box(x + dx, h / 2 + 7, z + dz, 22, h, 16, pale, scene, true); solid(x + dx, z + dz, 22, 16);
      for (let y = 9; y < h + 6; y += 3.2) {
        const band = panels[(Math.round(y / 3.2) + Math.abs(dx)) % panels.length];
        for (const side of [-1, 1]) {
          box(x + dx, y, z + dz + side * 8.3, 20, 2.2, 0.5, band);
          for (let ddx = -8; ddx < 10; ddx += 5) box(x + dx + ddx, y, z + dz + side * 8.6, 3, 1.5, 0.4, glass);
        }
      }
      box(x + dx, h + 8, z + dz, 25, 1.4, 19, stone);
      box(x + dx, h + 10, z + dz, 6, 2.6, 6, steel);
    }
  }
  /**
   * Multi-storey car park, placed on its own rather than hung off the precinct:
   * the blocks sit where the towers fit, and this needs its own clear ground.
   */
  function carPark(x: number, z: number) {
    box(x, 9, z, 46, 18, 26, concrete, scene, true); solid(x, z, 46, 26);
    for (let level = 0; level < 4; level++) for (let dx = -20; dx < 22; dx += 6) box(x + dx, 3 + level * 4.4, z + 12.6, 4.4, 0.7, 0.6, stone);
    for (let ring = 0; ring < 6; ring++) { const ramp = box(x + 26, 3 + ring * 2.6, z + (ring % 2 ? 8 : -8), 12, 0.5, 14, concrete); ramp.rotation.x = (ring % 2 ? 1 : -1) * 0.2; }
    box(x, 18.6, z, 48, 1.2, 28, stone);
  }
  /** Covered linkway: the roofed path that ties the blocks together. */
  function linkway(fromX: number, toX: number, z: number) {
    box((fromX + toX) / 2, 3.2, z, toX - fromX, 0.3, 5, pale, scene, true);
    for (let x = fromX + 3; x < toX; x += 8) for (const dz of [-2, 2]) { cylinder(x, 1.6, z + dz, 0.2, 3.2, pale); solid(x, z + dz, 0.55, 0.55); }
    for (let x = fromX + 4; x < toX; x += 16) box(x, 3.5, z, 3.4, 0.2, 5.4, teal);
  }

  /** Mall over the interchange, with a civic block and square beside it. */
  function mallCivic(x: number, z: number) {
    box(x, 15, z, 96, 30, 72, concrete, scene, true); solid(x, z, 96, 72);
    for (let y = 5; y < 30; y += 5.4) {
      for (let dx = -44; dx < 46; dx += 7) for (const side of [-1, 1]) box(x + dx, y, z + side * 36.4, 5.6, 3.4, 0.6, glass);
      for (let dz = -30; dz < 32; dz += 7) for (const side of [-1, 1]) box(x + side * 48.4, y, z + dz, 0.6, 3.4, 5.6, glass);
    }
    // Seven retail levels and a broad aluminium-clad crown, not an office slab.
    for (let y = 4; y <= 30; y += 4.3) {
      for (const side of [-1, 1]) {
        box(x, y, z + side * 36.8, 97, 0.9, 1.1, pale);
        box(x + side * 48.7, y, z, 1.1, 0.9, 72, pale);
      }
    }
    for (const side of [-1, 1]) {
      box(x + side * 36, 23, z + 36.9, 20, 13, 0.7, mat('#b7aa9a'));
      for (let dx = -8; dx <= 8; dx += 2) box(x + side * 36 + dx, 23, z + 37.4, 0.45, 13, 0.3, steel);
    }
    box(x, 31.6, z, 100, 2.2, 76, steel);
    for (let dx = -36; dx < 38; dx += 12) box(x + dx, 34, z, 5.4, 3.4, 60, concrete);
    box(x, 8.4, z + 40, 44, 0.8, 14, steel, scene, true);
    for (const dx of [-18, 18]) { cylinder(x + dx, 4.2, z + 46, 0.6, 8.4, steel); solid(x + dx, z + 46, 1.3, 1.3); }
    // February 2022 arcade crop: silver panel joints above a stone-tiled
    // raised edge and stainless handrail. Kept at the existing solid frontage.
    box(x, 4.8, z + 36.8, 88, 8.4, 0.5, mat('#c0c4c4'));
    for (const y of [1, 3.8, 7, 9]) box(x, y, z + 37.1, 88, 0.12, 0.15, dark);
    for (let dx = -40; dx <= 40; dx += 10) {
      box(x + dx, 3.4, z + 37.2, 1.3, 6.8, 0.8, pale);
      if (Math.abs(dx) >= 20) box(x + dx + 4, 3.1, z + 37.1, 6.6, 4.6, 0.3, glass);
    }
    box(x, 0.4, z + 36.8, 88, 0.8, 0.7, stone);
    for (const dx of [-32, 32]) {
      box(x + dx, 1.6, z + 37.4, 19, 0.13, 0.13, steel);
      box(x + dx, 0.9, z + 37.4, 19, 0.1, 0.13, steel);
      for (const offset of [-9, 0, 9]) cylinder(x + dx + offset, 1, z + 37.4, 0.09, 1.8, steel);
    }
    sign('CAUSEWAY POINT', x, 11.6, z + 40.4, 32, 2.4, '#2f4a56');
    // Civic block sits in the band north of the mall rather than beside it:
    // alongside, it straddled the cross street.
    box(x, 7, z + 95, 40, 14, 44, pale, scene, true); solid(x, z + 95, 40, 44);
    for (let dz = -18; dz < 20; dz += 6) box(x - 19.6, 7, z + 95 + dz, 0.5, 9, 4.4, glass);
    for (const side of [-1, 1]) { const roof = box(x, 15, z + 95 + side * 11, 44, 0.6, 24, steel, scene, true); roof.rotation.x = side * 0.14; }
    box(x, 0.2, z + 67, 48, 0.4, 20, paving);
    for (const dx of [-16, -8, 0, 8, 16]) { cylinder(x + dx, 6, z + 67, 0.18, 12, steel); box(x + dx + 1.4, 10.4, z + 67, 2.6, 1.8, 0.14, rust); solid(x + dx, z + 67, 0.5, 0.5); }
    sign('CIVIC SQUARE', x, 10.4, z + 72.6, 24, 2.2, '#3a4a55');
  }

  /** Elevated line on piers, with a station box over the eastern approach. */
  function railStation(x: number, z: number) {
    for (let dz = -90; dz <= 90; dz += 30) { cylinder(x, 6, z + dz, 1.7, 12, concrete); solid(x, z + dz, 3.6, 3.6); }
    box(x, 12.8, z, 9, 1.6, 200, concrete);
    for (const side of [-1, 1]) box(x + side * 4.2, 14.3, z, 0.8, 1.6, 200, pale);
    box(x, 19, z, 28, 11, 54, pale, scene, true);
    for (let dz = -22; dz < 24; dz += 6) for (const side of [-1, 1]) box(x + side * 14.4, 19, z + dz, 0.5, 7, 4.4, glass);
    for (const side of [-1, 1]) { const roof = box(x, 25.4, z + side * 13, 32, 0.6, 28, steel, scene, true); roof.rotation.x = side * 0.15; }
    box(x - 12, 8, z - 32, 8, 16, 7, concrete); solid(x - 12, z - 32, 8, 7);
    sign('NS9  WOODLANDS', x, 15.4, z - 28, 22, 2.1, '#b8342c');
  }

  mallCivic(-45, -10);
  precinct(137, -10);
  precinct(-182, 85);
  carPark(81, -10);
  carPark(-182, -10);
  railStation(200, -10);
  linkway(-118, -98, 26);
  linkway(60, 140, 26);
  linkway(-200, -140, 28);

  // Waterfront park along the near shore, and the woods to the west.
  box(-45, 0.18, -112, 200, 0.35, 38, lawn);
  for (let x = -130; x <= 40; x += 24) {
    tree(x, -100, 9, wood, leaf);
    if (Math.round((x + 130) / 24) % 3 === 1) { box(x, 0.85, -124, 3.4, 0.22, 1.2, wood); solid(x, -124, 3.6, 1.2); }
  }
  for (let x = -214; x <= -150; x += 11) for (let z = -120; z <= -10; z += 11) {
    if ((Math.round(x) + Math.round(z)) % 3 === 0 || Math.abs(z + 60) < 18) continue;
    cylinder(x, 5, z, 0.42, 10, wood); solid(x, z, 0.9, 0.9);
    for (let layer = 0; layer < 2; layer++) blob(x + (layer ? 1.4 : -1.4), 9.4 + layer * 1.8, z, 4, 1.8, 4, layer ? fern : leaf);
  }
  sign('ADMIRALTY PARK', -182, 6.4, 28, 28, 2.3, '#2f5140');

  // East park carries the range; a school field closes the south-east block.
  box(137, 0.18, 88, 130, 0.35, 70, lawn);
  for (const z of [62, 112]) { tree(80, z, 9, wood, leaf); tree(194, z - 6, 8, wood, fern); }
  for (const z of [70, 106]) { box(190, 0.85, z, 3.4, 0.22, 1.2, wood); solid(190, z, 3.6, 1.2); }
  for (let x = -214; x <= 214; x += 32) tree(x, EDGE_Z + 18, 8, wood, leaf);
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -100; z <= 110; z += 28) tree(x, z, 8, wood, fern);

  const pedestrians = ['#eae8da', '#6f95a6', '#a8563a', '#8fb6ae'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-60 + index * 22, -112, shirt, skin, dark), walker(JETTY_X, -150 - index * 9, shirt, skin, dark)]);
  const car = kit.car(mat('#7f9aa8'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(WOODLANDS_STAMPS, orange);
  scene.userData.districtFeatures = ['causeway-embankment', 'rail-alongside-road', 'checkpoint-booth-rows', 'overhead-lane-gantries', 'concrete-waterfront-jetty', 'seven-level-retail-bands', 'far-shore-read', 'point-block-void-decks', 'multi-storey-car-park-ramp', 'covered-linkways', 'civic-flag-row'];
  scene.userData.referenceFeatures = ['causeway-point-outdoor02-0:silver-clad-arcade-stone-edge-and-rail-only'];

  return withVerticalRoutes(kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.33 + index) * 1.9; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.z = -190 + ((time * 1.1 + index * 13) % 46); person.rotation.y = Math.PI; }
        else { person.position.x = -120 + ((time * 1.3 + index * 27) % 160); person.rotation.y = -Math.PI / 2; }
      });
    },
  }), [
    { id: 'waterfront-viewing-deck', name: 'Waterfront viewing deck', width: 7, color: '#b5b4ab', railColor: '#b0b8bb',
      points: [{ x: -110, z: -115, y: 0 }, { x: -96, z: -115, y: 2.8 }, { x: -52, z: -115, y: 2.8 }, { x: -38, z: -115, y: 0 }],
      note: 'A low two-ended viewing deck within the authored waterfront lawn; leaves shore, rail and checkpoint lanes separate.' },
    { id: 'jetty-raised-walk', name: 'Jetty raised walk', width: 5, color: '#bcb7aa', railColor: '#b0b8bb',
      points: [{ x: 120, z: -140, y: 0 }, { x: 120, z: -154, y: 2.8 }, { x: 120, z: -180, y: 2.8 }, { x: 120, z: -194, y: 0 }],
      note: 'A raised central route on the existing concrete jetty, with the broad lower deck retained alongside; game adaptation, not a real jetty survey.' },
  ]);
}
