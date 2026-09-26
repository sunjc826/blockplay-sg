import * as THREE from 'three';
import { BISHAN_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';
import { markWater } from './water';

// Face east along the park path, not north into the lamp at (-60, -78).
// The position stays on the northern lawn; the town centre is south of the river.
export const BISHAN_SPAWN = { x: -60, z: -74, yaw: -Math.PI / 2 };
export const BISHAN_BOUNDS = { minX: -255, maxX: 255, minZ: -210, maxZ: 210 };
export { BISHAN_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-100, 30], NS_ROADS = [-120, 10, 140];
const EDGE_X = 230, EDGE_Z = 180;
/**
 * The river is the one piece of water here that is not a rectangle: a canal
 * was opened out into a meander, so it is cast as a chain of short boxes
 * following a sine curve. Neighbours overlap, so the chain collides as one
 * continuous bank, and it breaks at each street exactly as the segmented
 * channels elsewhere do.
 */
const RIVER = { z: -35, amplitude: 22, halfWidth: 9, wavelength: 55, step: 6 };
const riverZ = (x: number) => RIVER.z + RIVER.amplitude * Math.sin(x / RIVER.wavelength);
const riverGap = (x: number) => NS_ROADS.some(road => Math.abs(x - road) < 13);
export const BISHAN_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of Bishan and Ang Mo Kio: a river
 * park where a straightened channel has been opened into a meander with
 * grassy banks, the town centre and interchange south of it, and the slab
 * precincts around. Compressed for play; source notes in docs/NORTH-CENTRAL-REVIEW.md.
 */
export function buildBishanScene() {
  const kit = createSceneKit({
    background: '#cddbd8', fogNear: 290, fogFar: 900,
    sun: { x: 130, y: 205, z: 120 }, shadow: { extent: 265, far: 680 },
    hemisphere: { sky: '#f4faf8', ground: '#75795f', intensity: 1.82 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat } = kit;

  const asphalt = mat('#565c5c'), white = mat('#e9e7d8'), kerb = mat('#cec8b9');
  const water = mat('#4b8b92', 0.42), shallow = mat('#62a5ab', 0.38), lawn = mat('#8aa96a'), grass = mat('#7b9a5e');
  // Shots into these splash rather than spark; see water.ts.
  markWater(water, shallow);
  const concrete = mat('#a9a89e'), pale = mat('#e6e1d3'), stone = mat('#b4b3a9'), dark = mat('#36434a');
  const glass = mat('#6f95a6', 0.22, 0.32), steel = mat('#b0b8bb', 0.28, 0.55), wood = mat('#7b6148');
  const silt = mat('#a8926a'), cobble = mat('#9a978c'), reed = mat('#93a857'), sedge = mat('#7f9a48');
  const leaf = mat('#44703d'), fern = mat('#5b8a4c');
  const orange = mat('#f0a044'), skin = mat('#b18c71');
  const panels = ['#dcc98f', '#8fb6ae', '#c9a2a8', '#9db2c6', '#cfd3b6'].map(color => mat(color));

  const ripples: THREE.Mesh[] = [];
  box(0, -0.6, 0, 610, 1, 510, grass);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  // Park floor, then the meander itself: one short box per step, each one
  // overlapping its neighbours so the chain reads and collides as one river.
  box(0, -0.22, -35, 470, 0.2, 92, lawn);
  for (let x = -215; x <= 215; x += RIVER.step) {
    if (riverGap(x)) continue;
    const cz = riverZ(x);
    box(x, -0.06, cz, RIVER.step + 2, 0.4, RIVER.halfWidth * 2, water);
    solid(x, cz, RIVER.step + 2, RIVER.halfWidth * 2 - 2);
    // Naturalised floodplain: broad low grassy shelves, not continuous stone walls.
    for (const side of [-1, 1]) {
      box(x, 0.1, cz + side * (RIVER.halfWidth + 1.6), RIVER.step + 2, 0.5, 4.4, silt);
      box(x, 0.18, cz + side * (RIVER.halfWidth + 4.4), RIVER.step + 2, 0.32, 5, grass);
      box(x, 0.27, cz + side * (RIVER.halfWidth + 8), RIVER.step + 2, 0.24, 4.4, lawn);
      if (Math.round(x) % 18 === 0) for (let r = 0; r < 3; r++) blob(x + r * 0.8, 1.9, cz + side * (RIVER.halfWidth + 2.6), 0.6, 1.9, 0.5, r % 2 ? reed : sedge);
    }
    if (Math.round(x) % 24 === 0) {
      const ripple = box(x, 0.16, cz, 5, 0.02, 0.2, shallow);
      ripple.userData.baseX = x; ripples.push(ripple);
    }
    // Boulders left in the channel, the way a restored bed is roughened.
    if (Math.round(x) % 30 === 0) blob(x, 0.5, cz + (Math.round(x) % 60 ? 3 : -3), 1.8, 1.1, 1.6, cobble);
  }
  // Stepping stones across the gap at the middle street, and the park path.
  for (let n = 0; n < 5; n++) { const sx = 2 + n * 4; box(sx, 0.5, riverZ(sx) + (n % 2 ? 1.4 : -1.4), 3, 1, 3, cobble); }
  for (let x = -210; x <= 210; x += 6) box(x, 0.3, -74, 5.4, 0.3, 5, silt);
  for (let x = -204; x <= 204; x += 36) { cylinder(x, 3.2, -78, 0.16, 6.4, dark); box(x, 6.2, -78, 0.8, 0.3, 0.8, pale); solid(x, -78, 0.5, 0.5); }
  for (const x of [-150, -30, 90, 180]) { box(x, 0.85, -70, 3.4, 0.22, 1.2, wood); solid(x, -70, 3.6, 1.2); }

  /** Footbridge on a shallow arch, landing on both banks of a meander loop. */
  function footbridge(x: number) {
    const cz = riverZ(x);
    for (let n = 0; n <= 18; n++) {
      const t = n / 18, z = cz - 16 + t * 32, rise = Math.sin(Math.PI * t) * 3.4;
      box(x, 0.7 + rise, z, 6, 0.35, 32 / 18 + 0.3, wood);
      for (const side of [-1, 1]) {
        box(x + side * 2.9, 1.5 + rise, z, 0.25, 1.3, 32 / 18 + 0.3, steel);
        if (n % 3 === 0) cylinder(x + side * 2.9, 1.3 + rise, z, 0.1, 1.2, steel);
      }
    }
    for (const side of [-1, 1]) { box(x, 0.6, cz + side * 17, 8, 1.2, 4, concrete); solid(x, cz + side * 17, 8, 4); }
  }
  footbridge(-70); footbridge(75);

  /** Slab precinct: long blocks with recessed loggias and a corner core. */
  function precinct(x: number, z: number, count = 2) {
    for (let i = 0; i < count; i++) {
      const cz = z + (i - (count - 1) / 2) * 26, len = 84 - i * 10, h = 34 + i * 6;
      for (const dx of [-len / 2 + 6, 0, len / 2 - 6]) for (const dz of [-6, 6]) { box(x + dx, 3, cz + dz, 2.2, 6, 2.2, concrete); solid(x + dx, cz + dz, 2.6, 2.6); }
      box(x, 6.4, cz, len, 0.8, 18, concrete);
      box(x, h / 2 + 7, cz, len - 4, h, 15, pale, scene, true); solid(x, cz, len, 16);
      for (let y = 9; y < h + 6; y += 3.2) {
        const band = panels[(Math.round(y / 3.2) + i) % panels.length];
        for (const side of [-1, 1]) {
          box(x, y, cz + side * 7.8, len - 6, 2.2, 0.5, band);
          for (let dx = -len / 2 + 6; dx < len / 2 - 4; dx += 6) box(x + dx, y, cz + side * 8.1, 3.4, 1.5, 0.4, glass);
          if (Math.round(y) % 6 === 0) box(x - len / 4, y, cz + side * 8.4, 8, 2.4, 0.4, dark);
        }
      }
      box(x, h + 8, cz, len - 2, 1.4, 17, stone);
      box(x + len / 2 - 6, h / 2 + 8, cz, 8, h + 2, 19, concrete, scene, true);
    }
  }

  /** Town mall on its podium, with the interchange along the far flank. */
  function townCentre(x: number, z: number) {
    box(x, 14, z, 90, 28, 70, concrete, scene, true); solid(x, z, 90, 70);
    for (let y = 5; y < 28; y += 5.4) {
      for (let dx = -41; dx < 43; dx += 7) for (const side of [-1, 1]) box(x + dx, y, z + side * 35.4, 5.6, 3.4, 0.6, glass);
      for (let dz = -30; dz < 32; dz += 7) for (const side of [-1, 1]) box(x + side * 45.4, y, z + dz, 0.6, 3.4, 5.6, glass);
    }
    box(x, 29.6, z, 94, 2.2, 74, steel);
    for (let dx = -32; dx < 34; dx += 11) box(x + dx, 32, z, 5, 3.4, 58, concrete);
    box(x, 8.4, z - 42, 44, 0.8, 14, steel, scene, true);
    for (const dx of [-18, 18]) { cylinder(x + dx, 4.2, z - 48, 0.6, 8.4, steel); solid(x + dx, z - 48, 1.3, 1.3); }
    box(x, 0.18, z + 46, 124, 0.35, 24, asphalt);
    for (let dx = -48; dx <= 48; dx += 19) { box(x + dx, 1.6, z + 51, 9, 3.2, 3.4, panels[Math.abs(Math.round(dx / 19)) % panels.length]); solid(x + dx, z + 51, 9, 3.4); }
    box(x, 4.4, z + 42, 118, 0.4, 10, steel, scene, true);
    for (let dx = -52; dx <= 52; dx += 17) { cylinder(x + dx, 2.2, z + 39, 0.24, 4.4, steel); solid(x + dx, z + 39, 0.65, 0.65); }
    sign('JUNCTION 8', x, 11.6, z - 42.4, 30, 2.4, '#2f4a56');
  }

  /** Bishan's NS platforms are at ground level; the Circle Line is underground.
   * Keep the compressed station beside the town mall, without the fictional
   * elevated viaduct that previously dominated this district's skyline.
   */
  function railStation(x: number, z: number) {
    box(x, 0.2, z, 22, 0.4, 52, concrete);
    for (const side of [-1, 1]) {
      box(x + side * 8.4, 2.8, z, 0.5, 5.6, 50, glass);
      box(x + side * 8.6, 4.8, z, 0.8, 0.6, 52, pale);
      for (let dz = -22; dz <= 22; dz += 11) {
        cylinder(x + side * 9, 3.2, z + dz, 0.32, 6.4, steel);
        solid(x + side * 9, z + dz, 0.8, 0.8);
      }
      const roof = box(x + side * 5, 6.7, z, 12, 0.5, 56, pale, scene, true);
      roof.rotation.z = side * 0.12;
    }
    box(x, 7.5, z, 2, 0.5, 56, glass);
    sign('NS17 / CC15  BISHAN', x, 5, z - 27, 22, 1.6, '#b8342c');
  }

  /** Sheltered court: a shade structure over seats and a play surface. */
  function court(x: number, z: number) {
    box(x, 0.22, z, 40, 0.4, 30, mat('#7d8f63'));
    for (const dx of [-16, 16]) for (const dz of [-11, 11]) { cylinder(x + dx, 3.2, z + dz, 0.26, 6.4, steel); solid(x + dx, z + dz, 0.7, 0.7); }
    for (const side of [-1, 1]) { const sail = box(x, 6.8, z + side * 7, 36, 0.2, 18, panels[1], scene, true); sail.rotation.x = side * 0.16; }
    for (const dz of [-8, 8]) for (let dx = -12; dx <= 12; dx += 12) { box(x + dx, 0.85, z + dz, 3.4, 0.22, 1.2, wood); solid(x + dx, z + dz, 3.6, 1.2); }
    for (const dx of [-18, 18]) beam(new THREE.Vector3(x + dx, 9, z), new THREE.Vector3(x + dx * 0.6, 6.8, z), 0.14, steel);
  }

  precinct(-175, -140); precinct(75, -140); precinct(-175, 105); precinct(-60, 105);
  townCentre(75, 105);
  railStation(200, 60);
  court(-60, -140);

  // April 2014 park preview: an oval grey shade roof, cylindrical piers and
  // horizontal louvres above an open paved apron. No river geometry inferred.
  box(-60, 0.18, -84, 42, 0.2, 15, concrete);
  const parkCanopy = cylinder(-60, 6.5, -84, 1, 0.45, steel);
  parkCanopy.scale.set(20, 1, 7);
  for (const dx of [-15, 15]) for (const dz of [-4, 4]) {
    cylinder(-60 + dx, 3.1, -84 + dz, 0.32, 6.2, pale);
    solid(-60 + dx, -84 + dz, 0.75, 0.75);
  }
  for (const y of [4.2, 4.8, 5.4]) box(-60, y, -88, 32, 0.18, 0.15, steel);

  // Southern field carries the range; planting keeps to its margins.
  box(185, 0.18, 105, 50, 0.35, 110, lawn);
  for (const z of [58, 152]) { tree(164, z, 9, wood, leaf); tree(206, z - 6, 8, wood, fern); }
  for (const z of [66, 146]) { box(206, 0.85, z, 3.4, 0.22, 1.2, wood); solid(206, z, 3.6, 1.2); }

  // Park planting, kept off the banks so the water reads clean from the path.
  for (const x of [-190, -110, 40, 140, 200]) for (const z of [-84, 4]) tree(x, z, 9, wood, leaf);
  for (let x = -200; x <= 200; x += 30) { tree(x, -EDGE_Z - 16, 8, wood, leaf); tree(x, EDGE_Z + 16, 8, wood, leaf); }
  for (const x of [-EDGE_X - 16, EDGE_X + 16]) for (let z = -150; z <= 150; z += 26) tree(x, z, 8, wood, fern);
  sign('BISHAN–ANG MO KIO PARK', -60, 6.4, -88, 28, 2.3, '#2f6b6b');

  const pedestrians = ['#e9e7d8', '#6f95a6', '#a8563a', '#8fb6ae'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-80 + index * 20, -74, shirt, skin, dark), walker(75, 60 + index * 12, shirt, skin, dark)]);
  const car = kit.car(mat('#86a094'), glass, mat('#dad5c5'), dark);
  const stamps = stampRings(BISHAN_STAMPS, orange);
  scene.userData.districtFeatures = ['meandering-river-chain', 'shelving-silt-edge', 'grassy-floodplain-shelves', 'channel-boulders', 'stepping-stones', 'arched-footbridge', 'recessed-loggia-slabs', 'corner-core-towers', 'shade-sail-court', 'ground-level-station'];
  scene.userData.referenceFeatures = ['bishan-park-road-0:oval-shade-pavilion', 'bishan-park-road-0:open-park-lawn'];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.4 + index) * 1.6; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.z = 50 + ((time * 1.1 + index * 15) % 90); person.rotation.y = Math.PI; }
        else { person.position.x = -120 + ((time * 1.3 + index * 23) % 200); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
