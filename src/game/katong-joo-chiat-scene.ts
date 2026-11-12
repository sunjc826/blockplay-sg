import { KATONG_JOO_CHIAT_STAMPS } from '../data/region-stamps';
import { createSceneKit } from './scene-kit';
import { heritageTerraces } from './heritage-terraces';
import { withVerticalPlaces } from './vertical-places';

export const KATONG_JOO_CHIAT_SPAWN = { x: 30, z: 110, yaw: 0 };
export const KATONG_JOO_CHIAT_BOUNDS = { minX: -265, maxX: 265, minZ: -210, maxZ: 210 };
const EW = [-65, 70], NS = [-115, 30, 145], EX = 240, EZ = 185;
export const KATONG_JOO_CHIAT_MAP_ROADS = [
  ...EW.map(z => ({ points: [{ x: -EX, z }, { x: EX, z }] })),
  ...NS.map(x => ({ points: [{ x, z: -EZ }, { x, z: EZ }] })),
  { points: [{ x: -EX, z: -EZ }, { x: EX, z: -EZ }, { x: EX, z: EZ }, { x: -EX, z: EZ }, { x: -EX, z: -EZ }] },
];

/** Pastel streets and raised porches: an authored conservation neighbourhood,
 * with researched landmark selection and explicitly schematic geometry. */
export function buildKatongJooChiatScene() {
  const k = createSceneKit({ look: 'heritage', background: '#e2e5d9', fogNear: 330, fogFar: 1000, shadow: { extent: 280, far: 700 } });
  const { scene, box, solid, mat, sign, tree } = k;
  const grass = mat('#9cab7b'), paving = mat('#dbd0b9'), cream = mat('#f0e6d0'), wood = mat('#866148'), leaf = mat('#557f50');
  const red = mat('#b55e50'), roof = mat('#a9654d'), glass = mat('#709d9e', .3, .2), dark = mat('#3c4a48');
  const pastel = ['#d6a3b0', '#9bc6bf', '#aabada', '#e0ca8e', '#c2acd3', '#bdd0a3'];
  box(0, -.55, 0, 610, 1, 490, grass);
  k.streetGrid({ ew: EW, ns: NS, edgeX: EX, edgeZ: EZ, asphalt: mat('#606564'), line: cream, kerb: paving, width: 14 });
  // Two facing Koon Seng-inspired terraces. Behind each lies a real back lane;
  // the ornament is an interpretation, rather than copied house-by-house.
  for (const x of [-190, -45, 85]) {
    heritageTerraces(k, { x, z: -108, count: 6, colors: pastel, ornate: true });
    heritageTerraces(k, { x, z: -22, count: 6, colors: pastel, ornate: true, facing: -1 });
    for (const z of [-144, 13]) box(x, .03, z, 84, .12, 8, paving);
  }
  sign('KOON SENG ROAD', -45, 4, -79, 37, 1.8, '#69867c');
  // East Coast Road's red corner and small food shops give another frontage
  // scale; none of the named streets claim an exact local alignment.
  box(-190, 4.7, 26, 46, 9.4, 26, red, scene, true); solid(-190, 26, 46, 26);
  for (const x of [-205, -190, -175]) {
    box(x, 6.3, 39.3, 6, 3.2, .4, cream); box(x, 6.3, 39.6, 4.4, 2.7, .4, glass);
  }
  box(-190, 9.8, 26, 50, .8, 29, roof);
  box(-190, 3.4, 43, 52, .4, 8, cream);
  sign('RED HOUSE CORNER', -190, 3, 47.3, 38, 1.7, '#984c42');
  heritageTerraces(k, { x: 85, z: 119, count: 5, colors: pastel, ornate: true, label: 'EAST COAST EATS' });

  // Raised residential porches are distinct from the street-level arcades.
  heritageTerraces(k, { x: -190, z: 119, count: 6, colors: pastel, ornate: true, raised: .9 });
  sign('JOO CHIAT PLACE', -190, 4.2, 150, 37, 1.7, '#69867c');
  // A generic neighbourhood pavilion and upper veranda supply a usable floor
  // without inventing public access into the real conserved private houses.
  box(-45, .03, 111, 88, .12, 68, paving);
  box(-45, 4, 152, 82, 8, 20, cream, scene, true); solid(-45, 152, 82, 20);
  box(-45, 8.5, 152, 86, .9, 24, roof, scene, true);
  for (const x of [-70, -45, -20]) box(x, 5, 141.7, 13, 4, .35, glass);
  sign('NEIGHBOURHOOD PAVILION', -45, 6, 141.3, 51, 1.7, '#69867c');
  for (const x of [-72, -18]) {
    tree(x, 92, 7, wood, leaf);
    box(x, .65, 109, 7, 1.3, 2, wood);
    k.obstacles.push({ minX: x - 3.5, maxX: x + 3.5, minZ: 108, maxZ: 110, minY: 0, maxY: 1.3 });
  }
  for (const x of [177, 220]) for (const z of [-142, -20]) tree(x, z, 8, wood, leaf);
  for (const x of [-216, -170, -78, -20, 68, 110, 180, 225]) for (const z of [-198, 198]) tree(x, z, 8, wood, leaf);
  // The eastern green is independent of the terraces: clear range sightlines,
  // vehicle departure space and a second route around the residential lanes.
  box(198, .01, 113, 78, .08, 112, grass);
  sign('KATONG / JOO CHIAT', 30, 5, 91, 41, 2.2, '#69867c');
  for (const x of [10, 50]) { box(x, 2.4, 91, .4, 4.8, .4, cream); solid(x, 91, .5, .5); }
  const car = k.car(mat('#9ab8bd'), glass, cream, dark), stamps = k.stampRings(KATONG_JOO_CHIAT_STAMPS, mat('#eda047'));
  scene.userData.referenceFeatures = [];
  scene.userData.districtFeatures = ['pastel-ornate-terraces', 'continuous-five-foot-ways', 'rear-service-lanes', 'raised-residential-porches', 'red-house-corner', 'neighbourhood-veranda', 'east-coast-food-row'];
  return withVerticalPlaces(k.finish({ car, stamps, animate() {} }), [{
    id: 'katong-neighbourhood-veranda', name: 'Neighbourhood pavilion veranda', note: 'Authored public pavilion with two stairs, separate from private conserved homes.',
    floors: [{ id: 'veranda', x: -45, z: 135, y: 3.6, width: 82, depth: 10 }],
    connections: [-80, -10].map((x, i) => ({ id: `stairs-${i}`, from: { x, z: 102, y: 0 }, to: { x, z: 130, y: 3.6 }, width: 4, stairs: true })),
  }, {
    id: 'joo-chiat-raised-porch', name: 'Raised terrace porch', note: 'Stylised raised threshold outside closed residential rooms.',
    floors: [{ id: 'porch', x: -190, z: 136.5, y: .9, width: 78, depth: 11, rails: false }],
    connections: [-223, -157].map((x, i) => ({ id: `porch-steps-${i}`, from: { x, z: 162, y: 0 }, to: { x, z: 142, y: .9 }, width: 4, stairs: true })),
  }]);
}
