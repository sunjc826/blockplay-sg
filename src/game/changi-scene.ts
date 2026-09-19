import * as THREE from 'three';
import { CHANGI_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// Between two planted terraces, looking down a clear radial at the falls.
export const CHANGI_SPAWN = { x: 16, z: -11, yaw: 1.31 };
export const CHANGI_BOUNDS = { minX: -280, maxX: 280, minZ: -240, maxZ: 240 };
export { CHANGI_STAMPS } from '../data/region-stamps.ts';

const EW_ROADS = [-150, 80, 130], NS_ROADS = [-190, 80];
const EDGE_X = 255, EDGE_Z = 210;
/** The glazed dome: centre, outer radius and the four entrance gaps. */
const DOME = { x: -55, z: -30, radius: 86 };
export const CHANGI_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...NS_ROADS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];

/**
 * An authored, compressed interpretation of the Changi airport landside: a
 * glazed toroidal dome with a falling-water oculus and terraced planting, a
 * terminal frontage under an elevated departure viaduct, a control tower and
 * an apron. Invented for play, without reference capture.
 */
export function buildChangiScene() {
  const kit = createSceneKit({
    background: '#cfe0e8', fogNear: 320, fogFar: 950,
    sun: { x: -140, y: 220, z: 150 }, shadow: { extent: 270, far: 700 },
    hemisphere: { sky: '#f6fbff', ground: '#77796d', intensity: 1.9 },
  });
  const { scene, box, cylinder, beam, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#5a6064'), white = mat('#eceadc'), paving = mat('#c2beb2'), kerb = mat('#d2ccbe');
  const concrete = mat('#b3b1a7'), pale = mat('#e3ded0'), dark = mat('#38444a'), steel = mat('#aeb6ba', 0.28, 0.55);
  const glass = mat('#7fa3b0', 0.2, 0.35), deepGlass = mat('#6b8f9e', 0.18, 0.4), water = mat('#86b6c6', 0.3);
  const leaf = mat('#41703f'), fern = mat('#5d8a4c'), moss = mat('#6f9457'), lawn = mat('#8ba36d');
  const wood = mat('#7b6148'), orange = mat('#f0a044'), skin = mat('#b18c71'), tarmac = mat('#6b6f70');
  const livery = mat('#d8d6cf'), accent = mat('#b7423c'), tail = mat('#2a5f7a');

  box(0, -0.5, 0, 640, 1, 560, lawn);
  kit.streetGrid({ ew: EW_ROADS, ns: NS_ROADS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb });

  /**
   * Glazed toroid. The profile rises from the perimeter to a ring peak and
   * dips to the oculus the water falls through. Mullions collide so the
   * dome reads as a building; four cardinal gaps are the entrances.
   */
  function jewelDome() {
    const profile: [number, number][] = [[86, 0], [78, 16], [68, 27], [56, 34], [44, 37], [32, 35], [22, 30], [16, 24]];
    const segments = 60, entrance = (angle: number) => [0, Math.PI / 2, Math.PI, Math.PI * 1.5].some(gap => {
      const delta = Math.abs(((angle - gap + Math.PI) % (Math.PI * 2)) - Math.PI);
      return delta < 0.16;
    });
    box(DOME.x, 0.16, DOME.z, 182, 0.32, 182, paving);
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments, cos = Math.cos(angle), sin = Math.sin(angle);
      if (!entrance(angle)) {
        const mx = DOME.x + cos * 86, mz = DOME.z + sin * 86;
        const mullion = box(mx, 8, mz, 1.3, 16, 2.6, steel, scene, true);
        mullion.rotation.y = -angle; solid(mx, mz, 2.8, 2.8);
        const pane = box(DOME.x + cos * 85.4, 8, DOME.z + sin * 85.4, 0.4, 15, 8.6, glass);
        pane.rotation.y = -angle;
      }
      // Radial ribs, one per segment, following the roof profile outward-in.
      for (let p = 1; p < profile.length; p++) {
        const [r0, y0] = profile[p - 1], [r1, y1] = profile[p];
        const a = new THREE.Vector3(DOME.x + cos * r0, y0, DOME.z + sin * r0);
        const b = new THREE.Vector3(DOME.x + cos * r1, y1, DOME.z + sin * r1);
        if (i % 2 === 0) beam(a, b, 0.42, steel);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const panel = box(mid.x, mid.y, mid.z, a.distanceTo(b), 0.3, (r0 + r1) * Math.PI / segments * 1.05, i % 4 === 3 ? deepGlass : glass);
        panel.rotation.y = -angle; panel.rotation.z = Math.atan2(y1 - y0, r0 - r1);
      }
    }
    for (const [r, y] of profile) for (let i = 0; i < segments; i += 2) {
      const angle = i * Math.PI * 2 / segments;
      beam(new THREE.Vector3(DOME.x + Math.cos(angle) * r, y, DOME.z + Math.sin(angle) * r),
        new THREE.Vector3(DOME.x + Math.cos(angle + Math.PI * 4 / segments) * r, y, DOME.z + Math.sin(angle + Math.PI * 4 / segments) * r), 0.3, steel);
    }
    // Oculus rim, the falling column of water and the basin it lands in.
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      cylinder(DOME.x + Math.cos(angle) * 16, 24.4, DOME.z + Math.sin(angle) * 16, 0.5, 1.6, steel);
    }
    const fall: THREE.Mesh[] = [];
    for (let ring = 0; ring < 5; ring++) {
      const drop = cylinder(DOME.x, 13 + ring * 0.2, DOME.z, 6.4 + ring * 0.9, 23 - ring * 1.4, water);
      drop.userData.phase = ring; fall.push(drop);
    }
    // Terraced basin: stepped stone rings under a low mist of planting.
    for (let step = 0; step < 4; step++) {
      cylinder(DOME.x, 0.4 + step * 0.5, DOME.z, 18 - step * 3, 1 + step * 0.4, step % 2 ? concrete : pale);
      cylinder(DOME.x, 1 + step * 0.5, DOME.z, 16.4 - step * 3, 0.5, water);
    }
    solid(DOME.x, DOME.z, 38, 38);
    for (let i = 0; i < 40; i++) {
      const angle = i * 0.61, r = 24 + (i % 5) * 9;
      blob(DOME.x + Math.cos(angle) * r, 1.6 + (i % 3) * 0.8, DOME.z + Math.sin(angle) * r, 4.2, 2.4, 4.2, [leaf, fern, moss][i % 3]);
    }
    // Ring walkways and the planted terraces that step down toward the basin.
    // Two elevated rings only: a third at the perimeter walled off the view of
    // the falls from the entrances. The outer ring is planting at ground level.
    for (let i = 0; i < segments; i += 5) {
      const angle = i * Math.PI * 2 / segments, px = DOME.x + Math.cos(angle) * 68, pz = DOME.z + Math.sin(angle) * 68;
      const planter = box(px, 0.7, pz, 6.4, 1.4, 6.4, pale); planter.rotation.y = -angle;
      blob(px, 2.4, pz, 3.4, 2, 3.4, [fern, moss][i % 2]); solid(px, pz, 6.8, 6.8);
    }
    for (const r of [30, 46]) for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      const height = r === 46 ? 8.4 : 4.2;
      const deck = box(DOME.x + Math.cos(angle) * r, height, DOME.z + Math.sin(angle) * r, 7, 0.4, r * Math.PI * 2 / segments * 1.1, r === 46 ? steel : pale);
      deck.rotation.y = -angle;
      if (i % 3 === 0) cylinder(DOME.x + Math.cos(angle) * r, height / 2, DOME.z + Math.sin(angle) * r, 0.24, height, steel);
      if (i % 5 === 0) {
        const px = DOME.x + Math.cos(angle) * (r + 5.5), pz = DOME.z + Math.sin(angle) * (r + 5.5);
        const planter = box(px, 0.75, pz, 4.4, 1.5, 4.4, pale);
        planter.rotation.y = -angle;
        blob(px, 2.3, pz, 2.6, 1.7, 2.6, [leaf, fern][i % 2]);
        solid(px, pz, 4.8, 4.8);
      }
    }
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      sign('JEWEL', DOME.x + Math.cos(angle) * 84, 18.4, DOME.z + Math.sin(angle) * 84, 20, 2.6, '#1f4f5e');
    }
    return fall;
  }
  const fall = jewelDome();

  // Terminal frontage: three halls with the cross streets running between them,
  // under a departure viaduct carried on piers down the access road's median.
  function terminal(x: number, width: number, label: string) {
    box(x, 9, -185, width, 18, 30, pale, scene, true); solid(x, -185, width, 30);
    for (let dx = -width / 2 + 7; dx < width / 2 - 5; dx += 14) { box(x + dx, 8, -170.4, 10, 12, 0.6, glass); box(x + dx, 15, -170.8, 11, 1.2, 1.6, steel); }
    for (const side of [-1, 1]) { const roof = box(x, 19.4, -185 + side * 8, width + 8, 0.8, 18, steel, scene, true); roof.rotation.x = side * 0.1; }
    box(x, 5.4, -176, width + 4, 0.5, 14, concrete, scene, true);
    sign(label, x, 13.4, -169.8, Math.min(42, width * 0.36), 2.8, '#1f4f5e');
  }
  terminal(-115, 110, 'TERMINAL 1');
  terminal(15, 100, 'TERMINAL 2');
  terminal(160, 130, 'TERMINAL 3');
  for (let x = -210; x <= 210; x += 30) { cylinder(x, 10.4, -166, 1.2, 20.8, steel); solid(x, -166, 2.6, 2.6); }
  for (let x = -230; x <= 230; x += 34) { cylinder(x, 5, -150, 1.2, 10, concrete); solid(x, -150, 2.4, 2.4); }
  box(0, 10.6, -150, 500, 1.4, 13, concrete, scene, true);
  for (const side of [-1, 1]) box(0, 11.9, -150 + side * 6, 500, 1.4, 1, pale);
  for (let x = -244; x < 246; x += 8) box(x, 11.4, -150, 4.6, 0.12, 11, asphalt);

  /** Tapered control tower under a flared, glazed cab. */
  function controlTower(x: number, z: number) {
    box(x, 0.2, z, 60, 0.4, 60, paving);
    for (let level = 0; level < 9; level++) cylinder(x, 4 + level * 8, z, 7.4 - level * 0.45, 8.4, level % 2 ? concrete : pale);
    solid(x, z, 16, 16);
    for (let level = 0; level < 9; level++) for (const side of [-1, 1]) box(x + side * (7.2 - level * 0.45), 4 + level * 8, z, 0.5, 7, 3.4, steel);
    cylinder(x, 78, z, 11, 3, steel);
    for (let ring = 0; ring < 4; ring++) cylinder(x, 80.4 + ring * 2.4, z, 12.4 - ring * 0.7, 2.6, ring === 1 ? deepGlass : glass);
    cylinder(x, 91.4, z, 13, 1.6, steel);
    cylinder(x, 94.4, z, 4.4, 4.6, pale);
    cylinder(x, 100, z, 0.4, 7, steel);
    for (const dy of [96, 99]) blob(x, dy, z, 0.9, 0.9, 0.9, accent);
    sign('CHANGI TOWER', x, 10.4, z + 9, 18, 2, '#1f4f5e');
  }
  controlTower(190, -60);

  /** Wide-body at a stand: fuselage, swept wings, engines and a tail fin. */
  function airliner(x: number, z: number, facing: 1 | -1) {
    const body = cylinder(x, 5.4, z, 3.6, 62, livery); body.rotation.z = Math.PI / 2;
    solid(x, z, 62, 8);
    const nose = new THREE.Mesh(geo(new THREE.ConeGeometry(3.5, 9, 10)), livery);
    nose.position.set(x + facing * 34, 5.4, z); nose.rotation.z = -facing * Math.PI / 2; scene.add(nose);
    for (let n = 0; n < 16; n++) box(x - 26 + n * 3.6, 6.6, z - 3.7, 1.4, 1, 0.3, glass);
    box(x, 6.4, z, 60, 0.5, 1.4, accent);
    for (const side of [-1, 1]) {
      const wing = box(x - facing * 4, 4.4, z + side * 20, 20, 0.9, 40, livery, scene, true);
      wing.rotation.y = -facing * side * 0.34; solid(x - facing * 4, z + side * 20, 24, 36);
      const engine = cylinder(x - facing * 2, 2.6, z + side * 17, 2.6, 9, steel);
      engine.rotation.z = Math.PI / 2; solid(x - facing * 2, z + side * 17, 9, 5.4);
      const strut = box(x - facing * 4, 3.6, z + side * 17, 1.2, 2.2, 5, livery); void strut;
    }
    const fin = box(x - facing * 26, 13, z, 14, 16, 1.4, tail, scene, true); fin.rotation.z = facing * 0.42;
    for (const side of [-1, 1]) { const plane = box(x - facing * 27, 6.6, z + side * 7, 11, 0.6, 14, livery); plane.rotation.y = -facing * side * 0.3; }
    for (const dx of [-facing * 22, facing * 26]) { cylinder(x + dx, 1.4, z, 0.5, 3, dark); box(x + dx, 0.5, z, 1.4, 1, 2.6, dark); }
  }

  // Apron: concrete slab, stand markings, two aircraft and ground equipment.
  box(0, 0.16, 175, 520, 0.32, 60, tarmac);
  for (let x = -240; x < 250; x += 10) box(x, 0.34, 145, 6, 0.02, 0.5, white);
  for (const stand of [-40, 120]) {
    for (let z = 150; z < 200; z += 6) box(stand, 0.34, z, 0.6, 0.02, 4, white);
    box(stand, 0.34, 150, 26, 0.02, 0.6, white);
  }
  airliner(-40, 168, 1);
  airliner(120, 172, -1);
  for (const [x, z] of [[-90, 150], [-80, 196], [70, 152], [168, 194]] as const) {
    box(x, 1.1, z, 5, 2.2, 2.6, mat('#d8b24a')); solid(x, z, 5.2, 2.8);
    box(x + 3.4, 0.9, z, 2.6, 1.8, 2.2, dark); solid(x + 3.4, z, 2.8, 2.4);
  }
  for (let x = -230; x < 240; x += 46) { cylinder(x, 6, 205, 0.4, 12, steel); for (const dx of [-1.6, 1.6]) box(x + dx, 12.4, 205, 1.4, 1, 1.4, white); solid(x, 205, 1, 1); }

  /** Elevated station box over the western access road. */
  function station(x: number, z: number) {
    box(x, 0.18, z, 70, 0.35, 90, paving);
    box(x, 7, z, 30, 14, 56, pale, scene, true); solid(x, z, 32, 58);
    for (let dz = -24; dz < 26; dz += 7) { box(x - 15.4, 7, z + dz, 0.5, 10, 5, glass); box(x + 15.4, 7, z + dz, 0.5, 10, 5, glass); }
    for (const side of [-1, 1]) { const roof = box(x, 15, z + side * 15, 34, 0.6, 32, steel, scene, true); roof.rotation.x = side * 0.14; }
    box(x, 3.4, z - 34, 16, 0.4, 14, steel, scene, true);
    for (const dx of [-6.4, 6.4]) { cylinder(x + dx, 1.7, z - 39, 0.4, 3.4, steel); solid(x + dx, z - 39, 0.9, 0.9); }
    sign('CG2  CHANGI AIRPORT', x, 4.4, z - 40.6, 16, 1.6, '#1f4f5e');
  }
  station(-215, -60);

  /** Slab hotel over a landscaped court. */
  function hotel(x: number, z: number) {
    box(x, 0.2, z, 96, 0.4, 96, paving);
    box(x, 22, z, 70, 44, 40, pale, scene, true); solid(x, z, 70, 40);
    for (let y = 5; y < 44; y += 4.2) for (let dx = -32; dx < 34; dx += 6) {
      box(x + dx, y, z - 20.4, 4.6, 2.6, 0.5, glass);
      box(x + dx, y, z + 20.4, 4.6, 2.6, 0.5, glass);
      if ((Math.round(dx / 6) + Math.round(y)) % 3 === 0) box(x + dx, y - 1.4, z - 21, 5, 0.4, 1.4, steel);
    }
    box(x, 45.4, z, 74, 2, 44, steel);
    box(x, 4.4, z - 24, 40, 0.5, 10, steel, scene, true);
    for (const dx of [-16, 16]) { cylinder(x + dx, 2.2, z - 28, 0.5, 4.4, steel); solid(x + dx, z - 28, 1.1, 1.1); }
    for (const dx of [-38, 38]) for (const dz of [-34, 34]) tree(x + dx, z + dz, 9, wood, leaf);
    sign('AIRPORT HOTEL', x, 6.2, z - 24.6, 26, 2.2, '#1f4f5e');
  }
  hotel(170, 30);

  // Coastal strip east, arrival garden west and perimeter planting.
  box(228, 0.18, 10, 52, 0.35, 260, mat('#d8cda6'));
  box(266, 0.1, 10, 28, 0.3, 260, water);
  for (let z = -110; z < 130; z += 22) {
    const px = 222 + (z % 44 ? 8 : -6);
    cylinder(px, 4.2, z, 0.42, 8.4, wood); solid(px, z, 0.9, 0.9);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const frond = blob(px + Math.cos(angle) * 2.4, 8.8 + (i % 3) * 0.5, z + Math.sin(angle) * 2.4, 3, 0.7, 1.4, fern);
      frond.rotation.y = angle;
    }
  }
  for (const z of [-60, 40]) { box(234, 0.85, z, 3.4, 0.22, 1.2, wood); solid(234, z, 3.6, 1.2); }
  box(-232, 0.18, 30, 60, 0.35, 240, lawn);
  for (let z = -80; z < 140; z += 26) tree(-238 + (z % 52 ? 12 : 0), z, 8, wood, leaf);
  for (const z of [-40, 60]) { box(-224, 0.85, z, 8, 0.22, 2.4, wood); solid(-224, z, 8, 2.4); }
  for (let x = -240; x < 250; x += 34) tree(x, -EDGE_Z - 18, 7, wood, leaf);

  const pedestrians = ['#eceadc', '#7fa3b0', '#d8b24a', '#5d8a4c'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(10 + index * 6, -30, shirt, skin, dark), walker(-120 + index * 22, -166, shirt, skin, dark)]);
  const car = kit.car(mat('#93a7ae'), glass, mat('#ddd8c8'), dark);
  const stamps = stampRings(CHANGI_STAMPS, orange);
  scene.userData.districtFeatures = ['toroidal-glazed-roof', 'radial-rib-mullions', 'oculus-waterfall', 'terraced-basin', 'ring-walkways', 'terminal-viaduct', 'flared-control-cab', 'stand-markings', 'wide-body-airliner', 'coastal-palms'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      fall.forEach(drop => {
        const phase = (time * 0.9 + drop.userData.phase * 0.2) % 1;
        drop.scale.x = drop.scale.z = (6.4 + drop.userData.phase * 0.9) * (0.94 + phase * 0.12);
      });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -130 + ((time * 1.5 + index * 29) % 240); person.rotation.y = -Math.PI / 2; }
        else { person.position.z = -60 + ((time * 1.1 + index * 13) % 56); person.rotation.y = Math.PI; }
      });
    },
  });
}
