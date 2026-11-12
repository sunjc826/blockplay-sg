import { batchRigidMeshes } from './rigid-batches';
import { RAIL_ROUTES, railState } from './rail-routes';
import { addRailTerminals } from './rail-stations';
import * as THREE from 'three';
import { YISHUN_STAMPS } from '../data/region-stamps';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';
import { withVerticalPlaces } from './vertical-places';

export const YISHUN_SPAWN = { x: 0, z: 70, yaw: 0 };
export const YISHUN_BOUNDS = { minX: -260, maxX: 260, minZ: -220, maxZ: 220 };
const EW = [-90, 35, 170], NS = [-140, 0, 140], EDGE_X = 240, EDGE_Z = 200;
export const YISHUN_MAP_ROADS = [
  ...EW.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/** An authored heartland with a fictional, deliberately over-the-top combat preset.
 * Landmark selection is researched; geometry is schematic, with no accepted
 * photograph claims or paid captures. See docs/YISHUN.md for sources and scope.
 */
export function buildYishunScene() {
  const kit = createSceneKit({ look: 'heartland', background: '#d7d9cb', fogNear: 320, fogFar: 1050,
    sun: { x: -130, y: 210, z: 100 }, shadow: { extent: 280, far: 750 } });
  const { scene, box, cylinder, solid, sign, tree, blob, mat } = kit;
  const grass = mat('#91a66e'), lawn = mat('#a2b57b'), asphalt = mat('#555b5b');
  const concrete = mat('#b9b9ad'), pale = mat('#e5dfcf'), white = mat('#f0ecdd');
  const dark = mat('#34454a'), glass = mat('#72949a', .24, .3), steel = mat('#a6b2b1', .4, .45);
  const red = mat('#b44a3d'), ochre = mat('#d1ad69'), wood = mat('#806444'), leaf = mat('#4e7747');
  const pond = mat('#4c8d89', .38), reed = mat('#8caa65'); markWater(pond);
  const panels = ['#d5b37d', '#afc8b4', '#d5a99a', '#acbdc9'].map(c => mat(c));
  // A single ground plane; roads and paths are thin overlays on it.
  box(0, -.55, 0, 620, 1, 540, grass);
  kit.streetGrid({ ew: EW, ns: NS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb: concrete });

  // Northpoint-inspired twin retail wings: stepped roofs, red fins, glazed
  // shopfronts and a public terrace, rather than a duplicate estate slab.
  for (const [x, width, height] of [[-95, 46, 23], [-44, 46, 29]]) {
    box(x, height / 2, -145, width, height, 64, pale, scene, true); solid(x, -145, width, 64);
    for (const y of [4, 9, 14, 19]) {
      box(x, y, -112.7, width - 3, 3.4, .4, glass);
      box(x, y, -177.3, width - 3, 3.4, .4, glass);
    }
    for (let dx = -width / 2 + 3; dx < width / 2; dx += 7) box(x + dx, 14, -112.2, 1.3, 28, 1, red);
    box(x, height + 1, -145, width + 3, 1.8, 67, steel);
    for (let dx = -16; dx <= 16; dx += 16) box(x + dx, height + 2.5, -145, 10, 1.2, 12, lawn);
  }
  sign('NORTHPOINT', -70, 12, -111.5, 37, 3.2, '#a33e34');
  // Low plaza seats with finite-height collision; the terrace above is added
  // by the shared walking-surface builder, with stairs at both ends.
  box(-70, .02, -64, 112, .08, 24, concrete);
  for (const x of [-96, -72, -48]) {
    box(x, .65, -57, 7, 1.3, 2.2, ochre);
    kit.obstacles.push({ minX: x - 3.5, maxX: x + 3.5, minZ: -58.1, maxZ: -55.9, minY: 0, maxY: 1.3 });
  }

  // NS13: north-south elevated railway with a barrel-like segmented canopy.
  // Piers are beside the road, leaving all lanes and the station forecourt clear.
  const railRoute = RAIL_ROUTES.yishun;
  scene.userData.railRoute = railRoute;
  box(railRoute.cross, 10, 0, 12, 1.4, railRoute.max - railRoute.min, concrete);
  for (const x of [20, 26]) box(x, 10.85, 0, .22, .18, railRoute.max - railRoute.min, steel);
  for (let z = -185; z <= 185; z += 50) {
    box(23, 4.6, z, 2.8, 9.2, 2.8, concrete); solid(23, z, 2.8, 2.8);
  }
  for (const x of [13, 33]) box(x, 11.2, -145, 10, 1.2, 72, pale);
  addRailTerminals({ box, sign }, railRoute, { platform: pale, roof: white, warning: ochre, dark }, [null, 'SOUTH TERMINAL']);
  for (const side of [-1, 1]) {
    const roof = box(23 + side * 7, 17.4, -145, 18, .6, 77, white, scene, true); roof.rotation.z = side * .18;
    box(23 + side * 14, 14, -145, .5, 4.8, 70, glass);
    for (const z of [-173, -145, -117]) box(23 + side * 13, 14, z, .5, 5.5, .5, steel);
  }
  sign('NS13  YISHUN', 23, 15, -106, 24, 2.5, '#ac3837');
  // Train remains a group so the scene kit can batch all static geometry.
  const train = new THREE.Group(); train.name = 'yishun-train'; scene.add(train);
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 15;
    box(23, 12.7, z, 5, 2.8, 14, white, train);
    for (const side of [-1, 1]) {
      box(23 + side * 2.52, 12.7, z, .08, .5, 13, red, train);
      for (let dz = -5; dz <= 5; dz += 3.3) box(23 + side * 2.57, 13.4, z + dz, .08, .65, 2.3, glass, train);
    }
  }

  batchRigidMeshes(train, { trackGeometry: kit.geo });
  train.position.z = railState(railRoute, 0).position;

  // Chong Pang-inspired market: two banks of stalls, a clear centre aisle and
  // a pitched roof held above head height. No invisible solid market box.
  box(-194, .04, -145, 66, .12, 60, concrete);
  for (const side of [-1, 1]) {
    const roof = box(-194, 8.5, -145 + side * 16, 70, .5, 34, red, scene, true); roof.rotation.x = side * -.18;
    for (const x of [-224, -194, -164]) {
      box(x, 3.8, -145 + side * 26, .7, 7.6, .7, pale); solid(x, -145 + side * 26, .8, .8);
    }
    for (let x = -216; x <= -168; x += 12) {
      box(x, 1.1, -145 + side * 19, 10, 2.2, 6, pale); solid(x, -145 + side * 19, 10, 6);
      box(x, 3.4, -145 + side * 17, 10, .3, 9, ochre);
      for (let dx = -3; dx <= 3; dx += 3) blob(x + dx, 2.5, -145 + side * 19, 1.1, .4, .8, panels[(Math.round(x / 12) + 20) % panels.length]);
    }
  }
  sign('CHONG PANG MARKET', -194, 6, -113, 42, 2.7, '#315d50');

  // Real Yishun's open void decks and coloured slab facades stay recognisable;
  // only the combat preset gets the joke. Upper volumes do not wall off ground.
  function housing(x: number, z: number, index: number) {
    const height = 37 + index % 3 * 7, panel = panels[index % panels.length];
    for (const dx of [-25, 0, 25]) for (const dz of [-8, 8]) {
      box(x + dx, 3.2, z + dz, 1.8, 6.4, 1.8, concrete); solid(x + dx, z + dz, 1.8, 1.8);
    }
    box(x, height / 2 + 6.4, z, 60, height, 24, pale, scene, true);
    (scene.userData.traversalObstacles ??= []).push({ minX: x - 30, maxX: x + 30, minZ: z - 12, maxZ: z + 12, minY: 6.4, maxY: height + 6.4 });
    for (let y = 9; y < height + 5; y += 3.2) for (const side of [-1, 1]) {
      box(x, y, z + side * 12.2, 58, 2.6, .3, panel);
      for (let dx = -24; dx <= 24; dx += 8) box(x + dx, y, z + side * 12.4, 3.6, 1.6, .3, glass);
    }
    box(x + 26, height / 2 + 7, z, 6, height + 1, 25, panel);
    sign(String(600 + index), x - 22, height + 3, z + 12.7, 5, 2.6, '#526457');
  }
  [[-194, -30], [-70, -25], [77, -145], [195, -145], [77, -25], [195, -25], [-194, 95], [-70, 95], [-70, 140]].forEach(([x, z], i) => housing(x, z, i));

  // Pond park: water is outside every road, with paths on all four banks.
  box(82, .01, 106, 102, .09, 116, lawn);
  box(82, .03, 109, 66, .2, 64, pond);
  kit.obstacles.push({ minX: 49, maxX: 115, minZ: 77, maxZ: 141, maxY: .2 });
  for (const z of [65, 151]) box(82, .1, z, 104, .14, 6, pale);
  for (const x of [38, 126]) box(x, .1, 108, 6, .14, 86, pale);
  for (const x of [54, 72, 90, 108]) for (const z of [80, 138]) blob(x, .6, z, 2.4, 1.2, 1.4, reed);
  for (const x of [45, 78, 112]) { tree(x, 158, 9, wood, leaf); tree(x, 55, 8, wood, leaf); }
  // An open pavilion and a separate east field keep the range clear.
  for (const x of [168, 214]) for (const z of [143, 157]) { cylinder(x, 3.2, z, .35, 6.4, steel); solid(x, z, .8, .8); }
  box(191, 6.6, 150, 52, .5, 20, ochre, scene, true);
  sign('YISHUN POND PARK', 82, 4.5, 154, 30, 2.2, '#315d50');
  sign('WELCOME TO YISHUN — GOOD LUCK', 0, 9, 20, 42, 3.3, '#a64234');
  for (const x of [-18, 18]) { box(x, 4.2, 20, .5, 8.4, .5, steel); solid(x, 20, .6, .6); }
  sign('GAME THREAT: HIGH / KOPI: STILL HOT', -194, 4, -109, 36, 1.8, '#6f4733');
  for (const x of [-215, -175, -110, -45, 65, 110, 175, 215]) for (const z of [-191, 189]) tree(x, z, 8, wood, leaf);
  // Sheltered neighbourhood linkways and seats provide readable human scale.
  for (const x of [-194, -70]) {
    box(x, 4, 62, 60, .3, 5, pale);
    for (const dx of [-28, 28]) { box(x + dx, 2, 62, .35, 4, .35, concrete); solid(x + dx, 62, .5, .5); }
  }
  const car = kit.car(ochre, glass, white, dark), stamps = kit.stampRings(YISHUN_STAMPS, mat('#f1a23b'));
  scene.userData.districtFeatures = ['northpoint-twin-retail-wings', 'walkable-retail-terrace', 'north-south-elevated-mrt', 'chong-pang-market-aisle', 'open-void-deck-housing', 'pond-park-loop', 'fictional-high-threat'];
  scene.userData.referenceFeatures = [];
  return withVerticalPlaces(kit.finish({ car, stamps, animate(time) {
    train.position.z = railState(railRoute, time).position;
    train.visible = true;
  } }), [{
    id: 'yishun-retail-terrace', name: 'Northpoint-inspired public terrace',
    note: 'Authored outdoor retail floor with two stair approaches; not a surveyed mall access plan.',
    floors: [{ id: 'terrace', x: -70, z: -103, y: 5.4, width: 100, depth: 14, color: '#c9c0ac' }],
    connections: [
      { id: 'west-stairs', from: { x: -114, z: -65, y: 0 }, to: { x: -114, z: -96, y: 5.4 }, width: 5, stairs: true },
      { id: 'east-stairs', from: { x: -26, z: -65, y: 0 }, to: { x: -26, z: -96, y: 5.4 }, width: 5, stairs: true },
    ],
    fixtures: [-90, -70, -50].map(x => ({ x, z: -107, y: 6, width: 5, height: 1.2, depth: 2, color: '#7c9567' })),
  }]);
}
