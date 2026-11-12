import { LITTLE_INDIA_STAMPS } from '../data/region-stamps';
import { createSceneKit } from './scene-kit';
import { heritageTerraces } from './heritage-terraces';
import { withVerticalPlaces } from './vertical-places';

export const LITTLE_INDIA_SPAWN = { x: 20, z: 70, yaw: 0 };
export const LITTLE_INDIA_BOUNDS = { minX: -245, maxX: 245, minZ: -205, maxZ: 205 };
const EW = [-90, 30, 155], NS = [-120, 20, 140], EX = 220, EZ = 180;
export const LITTLE_INDIA_MAP_ROADS = [
  ...EW.map(z => ({ points: [{ x: -EX, z }, { x: EX, z }] })),
  ...NS.map(x => ({ points: [{ x, z: -EZ }, { x, z: EZ }] })),
  { points: [{ x: -EX, z: -EZ }, { x: EX, z: -EZ }, { x: EX, z: EZ }, { x: -EX, z: EZ }, { x: -EX, z: -EZ }] },
];

/** Researched landmark selection, schematic geometry. No accepted photo claims. */
export function buildLittleIndiaScene() {
  const k = createSceneKit({ look: 'heritage', background: '#dae2dc', fogNear: 300, fogFar: 950, shadow: { extent: 260, far: 680 } });
  const { scene, box, cylinder, solid, mat, sign, blob, tree } = k;
  const paving = mat('#d8cbb3'), grass = mat('#91a477'), white = mat('#efe5cd'), dark = mat('#34434b');
  const saffron = mat('#d99c3c'), terra = mat('#ab6448'), teal = mat('#579897'), glass = mat('#729ba5', .25, .2);
  const wood = mat('#7c6048'), leaf = mat('#53794b');
  const colours = ['#d789a3', '#70b7b4', '#dcb85b', '#9e8bbd', '#d47c5c'];
  const painted = colours.map(c => mat(c));
  box(0, -.55, 0, 570, 1, 480, grass);
  k.streetGrid({ ew: EW, ns: NS, edgeX: EX, edgeZ: EZ, asphalt: mat('#5c6060'), line: white, kerb: paving });

  // Tekka-inspired market: an open aisle beneath a pitched market roof, with
  // a real public gallery on its south edge, served by two stairs.
  box(-170, .03, 96, 76, .12, 76, paving);
  for (const side of [-1, 1]) {
    const roof = box(-170 + side * 18, 12, 96, 39, .5, 78, saffron, scene, true); roof.rotation.z = -side * .16;
    for (const z of [62, 130]) { box(-170 + side * 34, 4.6, z, .7, 9.2, .7, white); solid(-170 + side * 34, z, .8, .8); }
    for (const z of [72, 88, 104, 120]) {
      box(-170 + side * 22, 1.1, z, 8, 2.2, 12, white); solid(-170 + side * 22, z, 8, 12);
      box(-170 + side * 21, 3.2, z, 11, .35, 13, painted[(z / 8) % painted.length | 0]);
      for (const dz of [-3, 0, 3]) blob(-170 + side * 22, 2.4, z + dz, 1.2, .35, 1, painted[(z / 4) % painted.length | 0]);
    }
  }
  sign('TEKKA MARKET', -170, 9, 136, 42, 2.3, '#bd862f');

  // Tan Teng Niah-inspired colourful villa. The covered front veranda and
  // its colonnade are outside the closed building footprint.
  box(-65, 5, 98, 36, 10, 24, painted[0], scene, true); solid(-65, 98, 36, 24);
  for (let i = 0; i < 6; i++) {
    const x = -80 + i * 6;
    box(x, 5, 110.3, 5.6, 10, .5, painted[i % painted.length]);
    box(x, 6.8, 110.7, 3, 3.4, .35, dark);
    box(x, 1.5, 110.7, 3, 3, .35, white);
  }
  for (const x of [-83, -65, -47]) { cylinder(x, 2, 116, .32, 4, teal); solid(x, 116, .7, .7); }
  box(-65, .04, 115, 42, .12, 12, paving);
  box(-65, 4.2, 114, 40, .45, 10, saffron);
  box(-65, 10.5, 98, 39, .8, 27, terra);
  box(-65, 11.8, 98, 18, 1.6, 20, teal);
  sign('KERBAU ROAD', -65, 3, 121, 28, 1.5, '#8f4b68');

  // Campbell Lane's pedestrian apron faces a faceted heritage-centre form.
  box(-65, 10, -35, 72, 20, 44, white, scene, true); solid(-65, -35, 72, 44);
  for (let i = 0; i < 8; i++) {
    const panel = box(-96 + i * 9, 11, -12.7, 9.2, 18, .45, i % 2 ? glass : teal);
    panel.rotation.y = i % 2 ? .16 : -.16;
  }
  for (const y of [4, 10, 16]) box(-65, y, -12.2, 72, .5, .5, white);
  box(-65, .03, 8, 94, .12, 24, paving);
  sign('INDIAN HERITAGE CENTRE', -65, 4, -11.7, 48, 2, '#3e7377');
  sign('CAMPBELL LANE', -65, 4.5, 22, 35, 1.7, '#9c7047');

  // A temple compound north of the lane. Tiered abstract painted ornament
  // establishes the gateway silhouette without inventing specific iconography.
  box(-70, .02, -138, 88, .1, 72, paving);
  box(-70, 4.5, -147, 68, 9, 32, white, scene, true); solid(-70, -147, 68, 32);
  for (const dx of [-10.5, 10.5]) { box(-70 + dx, 4.5, -110, 3.2, 9, 8, painted[1]); solid(-70 + dx, -110, 3.2, 8); }
  for (let tier = 0; tier < 7; tier++) {
    const width = 27 - tier * 3.1, y = 10 + tier * 2.4;
    box(-70, y, -110, width, 2.2, 9 - tier * .65, painted[tier % painted.length]);
    box(-70, y + 1.1, -110, width + 1, .35, 10 - tier * .65, white);
    for (let dx = -width / 2 + 2; dx < width / 2; dx += 4) blob(-70 + dx, y + .4, -104.7 + tier * .3, .65, .9, .55, painted[(tier + 2) % painted.length]);
  }
  for (const dx of [-4, 0, 4]) cylinder(-70 + dx, 27.1, -110, .45, 2, saffron);
  sign('TEMPLE FORECOURT', -70, 4, -100, 30, 1.5, '#83705a');

  // Dense retail terraces stay low, unlike the heartland slab maps.
  heritageTerraces(k, { x: -170, z: -140, count: 5, colors: colours, label: 'SERANGOON SHOPS' });
  heritageTerraces(k, { x: -170, z: -35, count: 5, colors: colours });
  heritageTerraces(k, { x: 78, z: -140, count: 7, colors: colours });
  heritageTerraces(k, { x: 78, z: -30, count: 7, colors: colours, label: 'TEXTILES & FLOWERS' });
  heritageTerraces(k, { x: 78, z: 100, count: 6, colors: colours, label: 'LITTLE INDIA ARCADE' });
  heritageTerraces(k, { x: 185, z: -140, count: 3, colors: colours });
  heritageTerraces(k, { x: 185, z: -30, count: 3, colors: colours });
  // Flower strings and textile stalls line the arcade without closing its path.
  for (const x of [50, 66, 82, 98]) {
    for (let y = 1.3; y < 3; y += .35) for (const dx of [-2, 2]) blob(x + dx, y, 115, .3, .3, .2, saffron);
  }
  for (const [x, z] of [[-102, 52], [-30, 52], [50, 52], [112, 52], [-208, -76], [-32, -76]]) tree(x, z, 8, wood, leaf);
  for (const x of [-195, -155, -85, -45, 65, 105, 170, 205]) for (const z of [-193, 193]) tree(x, z, 8, wood, leaf);
  const car = k.car(saffron, glass, white, dark), stamps = k.stampRings(LITTLE_INDIA_STAMPS, mat('#efa247'));
  scene.userData.referenceFeatures = [];
  scene.userData.districtFeatures = ['tekka-open-market', 'campbell-pedestrian-lane', 'faceted-heritage-centre', 'colourful-villa', 'tiered-temple-gateway', 'textile-and-flower-arcades', 'walkable-market-gallery'];
  return withVerticalPlaces(k.finish({ car, stamps, animate() {} }), [{
    id: 'tekka-public-gallery', name: 'Tekka-inspired market gallery', note: 'Authored market-edge gallery, not a surveyed market circulation plan.',
    floors: [{ id: 'gallery', x: -170, z: 138, y: 4.8, width: 82, depth: 8 }],
    connections: [-207, -133].map((x, i) => ({ id: `stairs-${i}`, from: { x, z: 108, y: 0 }, to: { x, z: 134, y: 4.8 }, width: 4, stairs: true })),
    fixtures: [{ x: -170, z: 139, y: 5.4, width: 6, height: 1.2, depth: 1.4, color: '#a9b882' }],
  }]);
}
