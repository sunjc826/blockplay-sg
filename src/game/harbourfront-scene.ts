import * as THREE from 'three';
import { HARBOURFRONT_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// On the quay between the mall and the water, looking along the berth.
export const HARBOURFRONT_SPAWN = { x: 20, z: 134, yaw: Math.PI / 2 };
export const HARBOURFRONT_BOUNDS = { minX: -255, maxX: 255, minZ: -215, maxZ: 215 };
export { HARBOURFRONT_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-150, -20, 120], NS_ROADS = [-140, 130];
/** The middle street stops at the quay; the basin lies beyond it. */
const QUAY_STREET = { x: -10, fromZ: -190, toZ: 120 };
const EDGE_X = 230, EDGE_Z = 190;
/**
 * The basin stops short of the eastern cross street, which leaves an
 * eighteen-metre corridor down to the south perimeter: the boardwalk. Water
 * that ran the full width would have made the south road unreachable.
 */
const BASIN = { minX: -128, maxX: 100, minZ: 140, maxZ: 180 };
const BOARDWALK_X = 109;
/** Cable line: four masts on one clear north-south corridor past the malls. */
const CABLE = [-70, 20, 104, 170], CABLE_X = 5;
export const HARBOURFRONT_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: QUAY_STREET.x, z: QUAY_STREET.fromZ }, { x: QUAY_STREET.x, z: QUAY_STREET.toZ }] },
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the HarbourFront edge: a stepped
 * waterfront mall with a rooftop deck, a cruise hall with a liner alongside,
 * container gantries down the wharf, a cable line crossing overhead and the
 * ridge park behind it all. Invented for play, without reference capture.
 */
export function buildHarbourfrontScene() {
  const kit = createSceneKit({
    background: '#c4d8e3', fogNear: 300, fogFar: 900,
    sun: { x: 130, y: 210, z: 140 }, shadow: { extent: 265, far: 680 },
    hemisphere: { sky: '#f2f9fc', ground: '#74776a', intensity: 1.86 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat } = kit;

  const asphalt = mat('#565d61'), white = mat('#eae8da'), paving = mat('#bdb8ab'), kerb = mat('#cfc9bb');
  const water = mat('#3f7e95', 0.42), shallow = mat('#589cae', 0.38), lawn = mat('#8aa56c'), grass = mat('#7b9560');
  const concrete = mat('#adaca2'), pale = mat('#e5dfd1'), stone = mat('#b5b4ab'), dark = mat('#36434a');
  const glass = mat('#6f95a6', 0.22, 0.32), steel = mat('#b2babd', 0.28, 0.58), wood = mat('#7b6148'), plank = mat('#9c7c57');
  const leaf = mat('#44703d'), fern = mat('#5b8a4c'), orange = mat('#f0a044'), skin = mat('#b18c71');
  const hull = mat('#20404f'), deckWhite = mat('#f0ece0'), funnel = mat('#b8453a'), crane = mat('#c8843a');
  const container = ['#a8563a', '#2f6b78', '#4f7a45', '#9a9a8c', '#b08a3a'].map(color => mat(color));

  box(0, -0.6, 0, 620, 1, 540, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });
  // The quay street is laid by hand: the grid runs every road edge to edge,
  // and this one has to stop before the water rather than cross it.
  {
    const { x, fromZ, toZ } = QUAY_STREET, mid = (fromZ + toZ) / 2, run = toZ - fromZ;
    box(x, 0, mid, 16, 0.12, run, asphalt);
    for (let z = fromZ + 6; z < toZ; z += 12) box(x, 0.09, z, 0.16, 0.025, 5, white);
    for (const side of [-10.5, 10.5]) box(x + side, 0.12, mid, 3, 0.22, run, kerb);
  }

  // Basin, its quay wall and the swell moving across it.
  box((BASIN.minX + BASIN.maxX) / 2, -0.06, (BASIN.minZ + BASIN.maxZ) / 2, BASIN.maxX - BASIN.minX, 0.4, BASIN.maxZ - BASIN.minZ, water);
  solid((BASIN.minX + BASIN.maxX) / 2, (BASIN.minZ + BASIN.maxZ) / 2, BASIN.maxX - BASIN.minX, BASIN.maxZ - BASIN.minZ);
  box((BASIN.minX + BASIN.maxX) / 2, 0.6, BASIN.minZ - 2.4, BASIN.maxX - BASIN.minX + 8, 1.4, 4, stone);
  for (let x = BASIN.minX; x <= BASIN.maxX; x += 12) { cylinder(x, 1.2, BASIN.minZ - 4.6, 0.6, 1.6, dark); solid(x, BASIN.minZ - 4.6, 1.4, 1.4); }
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 30; i++) {
    const ripple = box(BASIN.minX + 10 + (i * 41) % 210, 0.16, BASIN.minZ + 6 + (i * 17) % 28, 9 + i % 5, 0.02, 0.22, shallow);
    ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
  }
  // Quay promenade between the road and the water, and the boardwalk south.
  box(0, 0.2, 132, 460, 0.4, 12, paving);
  for (let x = -210; x <= 90; x += 26) { cylinder(x, 3.6, 129, 0.16, 7.2, dark); box(x, 6.9, 129, 0.9, 0.35, 0.9, pale); solid(x, 129, 0.5, 0.5); }
  box(BOARDWALK_X, 0.42, 165, 14, 0.3, 56, plank);
  for (let z = 138; z <= 192; z += 4) {
    box(BOARDWALK_X, 0.6, z, 13.6, 0.06, 1.8, wood);
    for (const dx of [-6, 6]) { cylinder(BOARDWALK_X + dx, 0.2, z, 0.26, 1, wood); if (z % 12 < 4) { cylinder(BOARDWALK_X + dx, 1.5, z, 0.16, 2.6, wood); solid(BOARDWALK_X + dx, z, 0.5, 0.5); } }
  }
  for (const dx of [-5.8, 5.8]) box(BOARDWALK_X + dx, 1.6, 165, 0.14, 0.9, 56, wood);
  sign('SENTOSA BOARDWALK', BOARDWALK_X, 4.2, 137, 20, 2, '#2f6b78');

  /** Stepped waterfront mall: retail terraces, a rooftop deck and a bowl. */
  function steppedMall(x: number, z: number) {
    box(x, 0.2, z, 104, 0.4, 104, paving);
    for (let step = 0; step < 4; step++) {
      const w = 96 - step * 14, d = 96 - step * 12, y = 7 + step * 6.5, cz = z - step * 5;
      box(x, y / 2, cz, w, y, d, step % 2 ? pale : concrete, scene, true); solid(x, cz, w, d);
      box(x, y + 0.8, cz, w + 5, 1.4, d + 5, stone);
      for (let dx = -w / 2 + 5; dx < w / 2 - 3; dx += 8) {
        box(x + dx, y - 3.4, cz + d / 2 + 0.5, 6.4, 5.4, 0.6, glass);
        box(x + dx, y - 3.4, cz - d / 2 - 0.5, 6.4, 5.4, 0.6, glass);
      }
      for (let dz = -d / 2 + 6; dz < d / 2 - 3; dz += 9) for (const side of [-1, 1]) box(x + side * (w / 2 + 0.5), y - 3.4, cz + dz, 0.6, 5.4, 6.4, glass);
      for (let dx = -w / 2 + 4; dx < w / 2 - 2; dx += 11) blob(x + dx, y + 2.4, cz + d / 2 + 2.4, 2.6, 1.6, 2, step % 2 ? fern : leaf);
    }
    // Rooftop water deck with a shallow pool and a ring of loungers.
    for (let ring = 0; ring < 3; ring++) cylinder(x, 27.4 + ring * 0.3, z - 15, 15 - ring * 3.4, 0.7, ring % 2 ? stone : shallow);
    for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5; box(x + Math.cos(angle) * 19, 27.8, z - 15 + Math.sin(angle) * 19, 3.4, 0.4, 1.6, deckWhite); }
    // Amphitheatre steps facing the water, at the mall's quay corner.
    for (let step = 0; step < 6; step++) { box(x, 0.4 + step * 0.9, z + 52 - step * 3, 60 - step * 4, 0.9 + step * 0.8, 3, concrete); solid(x, z + 52 - step * 3, 60 - step * 4, 3); }
    box(x, 8.4, z - 56, 46, 0.8, 14, steel, scene, true);
    for (const dx of [-19, 19]) { cylinder(x + dx, 4.2, z - 61, 0.6, 8.4, steel); solid(x + dx, z - 61, 1.3, 1.3); }
    sign('VIVOCITY', x, 11.4, z - 56.4, 30, 2.4, '#2f4a56');
  }

  /** Cruise hall: a long shed under a run of shallow wave vaults. */
  function cruiseTerminal(x: number, z: number) {
    box(x, 11, z, 90, 22, 100, pale, scene, true); solid(x, z, 90, 100);
    for (let n = 0; n < 7; n++) {
      const cz = z - 44 + n * 14.6;
      for (let s = 0; s <= 9; s++) {
        const angle = Math.PI * s / 9;
        box(x + Math.cos(angle) * 46, 22.4 + Math.sin(angle) * 5.4, cz, 92 / 9, 0.6, 13, n % 2 ? steel : pale);
      }
    }
    for (let y = 5; y < 22; y += 5.2) for (let dz = -42; dz < 44; dz += 7) for (const side of [-1, 1]) box(x + side * 45.4, y, z + dz, 0.6, 3.4, 5.6, glass);
    for (let dx = -38; dx < 40; dx += 7) { box(x + dx, 9, z + 50.4, 5.6, 14, 0.6, glass); box(x + dx, 17, z + 50.8, 6.2, 1.2, 1, steel); }
    // Gangways reaching out over the quay toward the berth.
    for (const dx of [-24, 18]) {
      box(x + dx, 12, z + 52, 6, 3.4, 16, pale, scene, true); solid(x + dx, z + 52, 6, 16);
      for (const dz of [-5, 5]) cylinder(x + dx, 5.4, z + 52 + dz, 0.8, 10.8, steel);
    }
    sign('CRUISE CENTRE', x, 14.6, z - 50.6, 30, 2.4, '#2f4a56');
  }

  /** Liner alongside: raked hull, tiered superstructure and two funnels. */
  function liner(x: number, z: number) {
    box(x, 5, z, 150, 14, 26, hull, scene, true); solid(x, z, 150, 26);
    for (const side of [-1, 1]) { const bow = box(x + side * 78, 5.6, z, 14, 12.8, 18, hull, scene, true); bow.rotation.y = side * 0.24; }
    box(x, 12.6, z, 154, 1.4, 28, deckWhite);
    for (let deck = 0; deck < 5; deck++) {
      const w = 130 - deck * 14, y = 15 + deck * 5;
      box(x - deck * 2, y, z, w, 5, 22 - deck * 1.4, deckWhite, scene, true);
      for (let dx = -w / 2 + 4; dx < w / 2 - 2; dx += 6) for (const side of [-1, 1]) box(x - deck * 2 + dx, y, z + side * (11 - deck * 0.7), 4.4, 2.6, 0.5, glass);
    }
    for (const dx of [-14, 14]) { cylinder(x + dx, 44, z, 4.4, 14, funnel); cylinder(x + dx, 51.4, z, 4.6, 1.4, dark); }
    for (let dx = -70; dx < 74; dx += 8) box(x + dx, 13.8, z + 13.4, 0.2, 1.4, 0.2, steel);
    box(x - 60, 40, z, 1, 26, 1, deckWhite);
    for (let i = 0; i < 6; i++) box(x - 60 + 2.4, 32 + i * 2.2, z, 4.4, 0.3, 0.3, steel);
  }

  /** Container gantry: portal legs on rails, a boom and a stack beneath. */
  function gantryCrane(x: number, z: number) {
    for (const dx of [-13, 13]) for (const dz of [-11, 11]) { cylinder(x + dx, 17, z + dz, 1, 34, crane); solid(x + dx, z + dz, 2.4, 2.4); }
    for (const dx of [-13, 13]) { box(x + dx, 34.4, z, 3, 2.4, 25, crane); box(x + dx, 18, z, 1.4, 1.4, 23, crane); }
    box(x, 36.4, z, 30, 2.6, 6, crane);
    box(x + 26, 36.4, z, 26, 2, 5, crane);
    for (let n = 0; n < 8; n++) beam(new THREE.Vector3(x + 2, 44, z), new THREE.Vector3(x + 10 + n * 4, 37.6, z), 0.16, steel);
    cylinder(x, 45, z, 0.7, 15, crane);
    box(x + 14, 33.4, z, 5.4, 3.4, 5.4, dark);
    for (let dz = -1; dz <= 1; dz += 2) cylinder(x + 14, 28, z + dz * 1.6, 0.08, 8, steel);
  }

  /** Ridge park: stacked terraces up to a lookout deck and a cable station. */
  function ridgePark(x: number, z: number) {
    for (let step = 0; step < 5; step++) {
      const w = 50 - step * 8, d = 90 - step * 14, y = 5 + step * 5;
      box(x, y / 2, z, w, y, d, step % 2 ? lawn : grass, scene, true); solid(x, z, w, d);
      for (let dz = -d / 2 + 5; dz < d / 2 - 3; dz += 9) blob(x + (step % 2 ? 6 : -6), y + 2.6, z + dz, 4, 2.6, 4, [leaf, fern][step % 2]);
    }
    box(x, 27.4, z, 22, 1.2, 30, plank);
    for (const side of [-1, 1]) { box(x + side * 10.4, 28.6, z, 0.3, 1.4, 30, steel); for (let dz = -13; dz <= 13; dz += 3.5) cylinder(x + side * 10.4, 28.4, z + dz, 0.1, 1.6, steel); }
    for (let i = 0; i < 5; i++) { const angle = i * Math.PI / 4; cylinder(x + Math.cos(angle) * 7, 30.4, z - 10 + Math.sin(angle) * 7, 0.2, 5, steel); }
    box(x, 33.4, z - 10, 20, 0.5, 20, steel, scene, true);
    sign('MOUNT FABER', x, 30.4, z + 16, 20, 2.2, '#2f5140');
  }

  /**
   * Cable line: masts on a clear corridor, with the haul rope sagging between
   * them and cabins that run the whole polyline.
   */
  const cabins: THREE.Group[] = [];
  function cableRun() {
    for (const z of CABLE) {
      for (const dx of [-2.4, 2.4]) for (const dz of [-2.4, 2.4]) cylinder(CABLE_X + dx, 18, z + dz, 0.45, 36, steel);
      for (let y = 6; y < 36; y += 6) { box(CABLE_X, y, z, 5, 0.4, 0.4, steel); box(CABLE_X, y, z, 0.4, 0.4, 5, steel); }
      box(CABLE_X, 37, z, 9, 1.4, 7, steel); solid(CABLE_X, z, 6, 6);
      for (const dx of [-3.4, 3.4]) box(CABLE_X + dx, 38.4, z, 1.4, 1.2, 8, dark);
    }
    for (let i = 0; i < CABLE.length - 1; i++) {
      const from = CABLE[i], to = CABLE[i + 1];
      for (let n = 0; n < 10; n++) for (const dx of [-3.4, 3.4]) {
        const t0 = n / 10, t1 = (n + 1) / 10;
        beam(new THREE.Vector3(CABLE_X + dx, 37 - Math.sin(Math.PI * t0) * 5.4, from + (to - from) * t0),
          new THREE.Vector3(CABLE_X + dx, 37 - Math.sin(Math.PI * t1) * 5.4, from + (to - from) * t1), 0.1, steel);
      }
    }
    for (let i = 0; i < 5; i++) {
      const cabin = new THREE.Group();
      box(0, 0, 0, 5, 4.4, 5, i % 2 ? funnel : steel, cabin, true);
      box(0, 0.4, 0, 5.2, 2.4, 5.2, glass, cabin);
      box(0, 2.8, 0, 3.4, 0.6, 3.4, dark, cabin);
      cabin.position.set(CABLE_X + (i % 2 ? 3.4 : -3.4), 32, CABLE[0]);
      scene.add(cabin); cabins.push(cabin);
    }
  }

  /** Street-level station entrance under a glass shell. */
  function stationEntrance(x: number, z: number) {
    box(x, 1.6, z, 15, 3.2, 9, dark); solid(x, z, 15, 9);
    box(x, 3.8, z, 17, 0.4, 11, glass, scene, true);
    for (const dx of [-7, 7]) { cylinder(x + dx, 2, z - 4.8, 0.3, 4, steel); solid(x + dx, z - 4.8, 0.8, 0.8); }
    box(x, 1.8, z - 4.9, 14, 3.1, 0.14, glass);
    sign('NE1 / CC29  HARBOURFRONT', x, 5.2, z - 5.8, 15, 1.5, '#7b2b8f');
  }

  steppedMall(60, 50);
  cruiseTerminal(-75, 50);
  liner(-40, 158);
  ridgePark(-185, -85);
  cableRun();
  stationEntrance(85, 106);

  // Wharf: apron, rails, three gantries and a stack of boxes behind them.
  box(180, 0.2, 160, 60, 0.4, 44, concrete);
  for (const dz of [-11, 11]) box(180, 0.42, 160 + dz, 58, 0.06, 1, steel);
  for (const z of [146, 174]) gantryCrane(180, z);
  for (let dx = -20; dx <= 20; dx += 10) for (let dz = -6; dz <= 6; dz += 13) for (let level = 0; level < 2; level++) {
    box(206 + dx * 0.2, 1.4 + level * 2.7, 152 + dz, 9, 2.6, 2.6, container[(Math.abs(Math.round(dx / 10)) + level) % container.length]);
    if (!level) solid(206 + dx * 0.2, 152 + dz, 9.2, 2.8);
  }

  // South band: terminal annexe, a car-park deck and a harbour depot.
  box(-75, 7, -105, 90, 14, 40, concrete, scene, true); solid(-75, -105, 90, 40);
  for (let dx = -38; dx < 40; dx += 7) for (const side of [-1, 1]) box(-75 + dx, 8, -105 + side * 20.4, 5.6, 8, 0.6, glass);
  box(60, 9, -105, 100, 18, 40, concrete, scene, true); solid(60, -105, 100, 40);
  for (let level = 0; level < 4; level++) for (let dx = -44; dx < 46; dx += 8) box(60 + dx, 3 + level * 4.4, -85.4, 6, 0.7, 0.6, stone);
  for (const side of [-1, 1]) box(60, 18.6, -105 + side * 18, 102, 1.6, 5, stone);
  box(180, 6, -105, 60, 12, 40, pale, scene, true); solid(180, -105, 60, 40);
  for (let dx = -24; dx < 26; dx += 8) { box(180 + dx, 4.4, -84.6, 6, 8, 0.5, dark); box(180 + dx, 9.4, -84.2, 6.6, 1.2, 0.9, orange); }
  sign('HARBOUR DEPOT', 180, 11.4, -84.4, 26, 2.2, '#2f4a56');

  // Ridge lawn, the east park that carries the range, and perimeter planting.
  box(-185, 0.18, 50, 50, 0.35, 100, lawn);
  for (const z of [10, 90]) { tree(-203, z, 9, wood, leaf); tree(-167, z - 6, 8, wood, fern); }
  box(180, 0.18, 50, 60, 0.35, 100, lawn);
  for (const z of [8, 94]) { tree(156, z, 9, wood, leaf); tree(204, z - 4, 8, wood, fern); }
  for (const z of [20, 80]) { box(206, 0.85, z, 3.4, 0.22, 1.2, wood); solid(206, z, 3.6, 1.2); }
  for (let z = -170; z <= 170; z += 30) if (Math.abs(z - 160) > 30) { tree(-EDGE_X - 16, z, 8, wood, leaf); tree(EDGE_X + 16, z, 8, wood, fern); }
  for (let x = -200; x <= 200; x += 34) tree(x, -EDGE_Z - 16, 8, wood, leaf);

  const pedestrians = ['#eae8da', '#6f95a6', '#a8563a', '#5b8a4c'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-40 + index * 26, 133, shirt, skin, dark), walker(BOARDWALK_X, 144 + index * 11, shirt, skin, dark)]);
  const car = kit.car(mat('#7d97a4'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(HARBOURFRONT_STAMPS, orange);
  scene.userData.districtFeatures = ['stepped-retail-terraces', 'rooftop-water-deck', 'quay-amphitheatre', 'wave-vault-hall', 'boarding-gangways', 'raked-liner-hull', 'portal-gantry-boom', 'container-stack', 'ridge-terraces', 'cable-span-cabins'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.32 + index) * 1.8; });
      const total = CABLE[CABLE.length - 1] - CABLE[0];
      cabins.forEach((cabin, index) => {
        const travel = ((time * 7 + index * total / 5) % (total * 2));
        const along = travel < total ? travel : total * 2 - travel;
        cabin.position.z = CABLE[0] + along;
        const leg = Math.min(CABLE.length - 2, Math.max(0, CABLE.findIndex(z => z > cabin.position.z) - 1));
        const t = (cabin.position.z - CABLE[leg]) / (CABLE[leg + 1] - CABLE[leg]);
        cabin.position.y = 33 - Math.sin(Math.PI * t) * 5.4;
      });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.z = 144 + ((time * 0.9 + index * 9) % 44); person.rotation.y = Math.PI; }
        else { person.position.x = -60 + ((time * 1.3 + index * 27) % 160); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
