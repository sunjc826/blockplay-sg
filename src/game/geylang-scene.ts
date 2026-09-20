import * as THREE from 'three';
import { GEYLANG_STAMPS } from '../data/region-stamps.ts';
import { createSceneKit } from './scene-kit';

// On the main road at a lorong mouth, looking down the terraces.
export const GEYLANG_SPAWN = { x: -14, z: -10, yaw: Math.PI / 2 };
export const GEYLANG_BOUNDS = { minX: -255, maxX: 255, minZ: -210, maxZ: 210 };
export { GEYLANG_STAMPS } from '../data/region-stamps.ts';

/** The lorongs are the district: six numbered lanes off the main road. */
const EW_ROADS = [-90, 0, 120], LORONGS = [-140, -84, -28, 28, 84, 140];
const EDGE_X = 230, EDGE_Z = 180;
/**
 * The canal is bridged at every lorong, in the Kampong Glam manner: one span
 * per gap between lanes, so no lane is closed by the water it crosses.
 */
const CANAL = { nearZ: -148, farZ: -124 };
const CANAL_SPANS: readonly (readonly [number, number])[] = [
  [-215, -152], [-128, -96], [-72, -40], [-16, 16], [40, 72], [96, 128], [152, 215],
];
export const GEYLANG_MAP_ROADS = [
  ...EW_ROADS.map(z => ({ points: [{ x: -EDGE_X, z }, { x: EDGE_X, z }] })),
  ...LORONGS.map(x => ({ points: [{ x, z: -EDGE_Z }, { x, z: EDGE_Z }] })),
  { points: [{ x: -EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: -EDGE_Z }, { x: EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: EDGE_Z }, { x: -EDGE_X, z: -EDGE_Z }] },
];
/** Block centres between the lanes; every terrace and hall is set on one. */
const BLOCKS = [-185, -112, -56, 0, 56, 112, 185];

/**
 * An authored, compressed interpretation of the Geylang lorongs: ornate
 * shophouse terraces down close-set numbered lanes, a market hall under a
 * steep gabled roof, a mosque and a temple on the main road, coffee shops
 * spilling onto the five-foot way, and a bridged canal along the back.
 * Invented for play, without reference capture.
 */
export function buildGeylangScene() {
  const kit = createSceneKit({
    background: '#cfd9dc', fogNear: 280, fogFar: 840,
    sun: { x: 120, y: 200, z: 130 }, shadow: { extent: 255, far: 650 },
    hemisphere: { sky: '#f6f6ee', ground: '#78715f', intensity: 1.78 },
  });
  const { scene, box, cylinder, blob, solid, sign, tree, walker, stampRings, mat, geo } = kit;

  const asphalt = mat('#565c5f'), white = mat('#e9e7d8'), paving = mat('#b9b3a6'), kerb = mat('#cdc7b9');
  const water = mat('#4b7f86', 0.44), shallow = mat('#5f9aa2', 0.4), grass = mat('#849c66'), lawn = mat('#90a870');
  const plaster = mat('#e9e2d0'), stone = mat('#b6b4ab'), concrete = mat('#a9a89e'), dark = mat('#36434a');
  const wood = mat('#7b6148'), zinc = mat('#a0a7a5', 0.34, 0.5), steel = mat('#b0b8bb', 0.28, 0.55);
  const glass = mat('#6d90a0', 0.24, 0.3), terra = mat('#b0644a'), tileDark = mat('#8a4b38');
  const jade = mat('#2f6b52'), lacquer = mat('#8c2f26'), gold = mat('#c59a34', 0.42, 0.55), teal = mat('#2f7b84');
  const leaf = mat('#48733f'), fern = mat('#5b8a4c'), orange = mat('#f0a044'), skin = mat('#b18c71');
  const facade = ['#e3d6b4', '#a9c4b8', '#dcbfa6', '#9fb4c6', '#cfa79b', '#d6cf9c'].map(color => mat(color));
  const shutter = ['#2f6b52', '#8c2f26', '#2b4f6e', '#2f7b84'].map(color => mat(color));

  box(0, -0.6, 0, 620, 1, 540, paving);
  kit.streetGrid({ ew: EW_ROADS, ns: LORONGS, edgeX: EDGE_X, edgeZ: EDGE_Z, asphalt, line: white, kerb, width: 14 });

  // Canal: one pool per span, sloped walls, and a bridge at every lorong.
  const ripples: THREE.Mesh[] = [];
  const midZ = (CANAL.nearZ + CANAL.farZ) / 2, depthZ = CANAL.farZ - CANAL.nearZ;
  for (const [fromX, toX] of CANAL_SPANS) {
    const width = toX - fromX, cx = (fromX + toX) / 2;
    box(cx, -0.08, midZ, width, 0.4, depthZ, water);
    solid(cx, midZ, width, depthZ);
    for (const side of [-1, 1]) {
      const wall = box(cx, 1, midZ + side * (depthZ / 2 - 1.6), width, 3.4, 4.4, concrete);
      wall.rotation.x = side * 0.32;
      box(cx, 2.5, midZ + side * (depthZ / 2 + 1.4), width, 0.6, 1.2, stone);
      for (let x = fromX + 3; x < toX; x += 6) cylinder(x, 3.2, midZ + side * (depthZ / 2 + 1.4), 0.12, 1.4, steel);
    }
    for (let i = 0; i * 17 < width; i++) {
      const ripple = box(fromX + 5 + i * 17, 0.16, midZ + ((i * 5) % 14) - 7, 6 + i % 3, 0.02, 0.2, shallow);
      ripple.userData.baseX = ripple.position.x; ripples.push(ripple);
    }
  }
  for (const x of LORONGS) {
    box(x, 0.24, midZ, 24, 0.5, depthZ + 18, asphalt);
    for (const side of [-1, 1]) {
      box(x + side * 12.6, 1.4, midZ, 1.2, 2, depthZ + 18, stone);
      solid(x + side * 12.6, midZ, 1.2, depthZ + 18);
      for (let dz = -depthZ / 2; dz <= depthZ / 2; dz += 4) cylinder(x + side * 12.6, 2.9, midZ + dz, 0.1, 1.2, steel);
    }
  }

  /**
   * Geylang terrace: two storeys, a five-foot way behind columns, louvred
   * shutters with fanlights, pilasters and a vented parapet.
   */
  function shophouseRow(startX: number, z: number, count: number, facing: 1 | -1, width = 14) {
    for (let i = 0; i < count; i++) {
      const x = startX + i * width, body = facade[(i + (z > -45 ? 2 : 0)) % facade.length];
      box(x, 5.6, z, width - 0.4, 11.2, 16, body, scene, true); solid(x, z, width, 16);
      const front = z + facing * 8;
      for (const dx of [-width / 2 + 0.7, width / 2 - 0.7]) box(x + dx, 6, z, 1.2, 12, 16.4, plaster);
      // Vented parapet above the cornice, the terrace's read along the lane.
      box(x, 11.8, z, width, 1.1, 17, plaster);
      for (let dx = -width / 2 + 1.8; dx < width / 2 - 1; dx += 1.7) box(x + dx, 12.4, front + facing * 0.3, 0.9, 0.9, 0.3, dark);
      box(x, 13, z, width + 0.5, 0.5, 17.6, terra);
      // Upper floor: shuttered openings under segmental fanlights.
      for (const dx of [-3.4, 3.4]) {
        box(x + dx, 8.1, front + facing * 0.14, 2.6, 3.6, 0.26, shutter[(i + Math.abs(Math.round(dx))) % 4]);
        for (let y = 6.5; y < 9.7; y += 0.42) box(x + dx, y, front + facing * 0.3, 2.4, 0.13, 0.16, plaster);
        for (let n = 0; n <= 5; n++) {
          const angle = Math.PI * n / 5;
          box(x + dx + Math.cos(angle) * 1.5, 10.1 + Math.sin(angle) * 0.9, front + facing * 0.3, 0.6, 0.5, 0.26, plaster);
        }
      }
      // Five-foot way: paired columns, a shaded slab and the swing-door front.
      box(x, 5, front + facing * 2.4, width, 0.45, 5.2, plaster, scene, true);
      for (const dx of [-width / 2 + 1.5, width / 2 - 1.5]) {
        cylinder(x + dx, 2.4, front + facing * 4.4, 0.34, 4.8, plaster); solid(x + dx, front + facing * 4.4, 0.85, 0.85);
      }
      box(x, 0.26, front + facing * 2.5, width, 0.3, 5.4, paving);
      box(x, 2.3, front + facing * 0.16, 3.6, 4.6, 0.22, wood);
      for (const dx of [-1.3, 1.3]) box(x + dx, 2, front + facing * 0.34, 1.1, 2.6, 0.14, shutter[i % 4]);
      box(x + width / 2 - 1.9, 6.6, front + facing * 0.5, 0.9, 4.4, 0.3, i % 2 ? lacquer : jade);
      for (const dy of [-1.3, 0, 1.3]) box(x + width / 2 - 1.9, 6.6 + dy, front + facing * 0.66, 0.5, 0.5, 0.1, gold);
    }
  }

  /** Market hall: a steep gabled roof with upswept ends over open stall rows. */
  function marketHall(x: number, z: number) {
    box(x, 0.22, z, 44, 0.4, 76, paving);
    box(x, 4.6, z, 36, 9.2, 66, plaster, scene, true); solid(x, z, 36, 66);
    for (const side of [-1, 1]) {
      const pitch = box(x + side * 10, 14.4, z, 22, 0.7, 70, terra, scene, true);
      pitch.rotation.z = side * 0.62;
    }
    box(x, 19.4, z, 4.4, 1.2, 72, tileDark);
    // Upswept gable ends and the carved barge boards under them.
    for (const end of [-1, 1]) {
      for (let n = 0; n <= 5; n++) {
        const t = n / 5;
        box(x, 9.6 + t * 9.4, z + end * (35 + t * 2.4), 20 - t * 15, 1.1, 1.4, plaster);
      }
      for (const side of [-1, 1]) {
        const tip = box(x + side * 11, 15.6, z + end * 37.4, 5.4, 0.7, 2.4, gold, scene, true);
        tip.rotation.z = side * 0.7; tip.rotation.x = end * 0.3;
      }
      for (let dx = -8; dx <= 8; dx += 4) box(x + dx, 12.4 - Math.abs(dx) * 0.42, z + end * 34.6, 2.6, 2.4, 0.4, jade);
    }
    for (const side of [-1, 1]) for (let dz = -28; dz <= 28; dz += 7) {
      cylinder(x + side * 18.4, 4.4, z + dz, 0.4, 8.8, plaster); solid(x + side * 18.4, z + dz, 1, 1);
    }
    for (const dz of [-20, -6, 8, 22]) for (const dx of [-11, 11]) {
      box(x + dx, 1.4, z + dz, 8, 2.6, 4.4, facade[Math.abs(Math.round(dz / 14)) % facade.length]); solid(x + dx, z + dz, 8.2, 4.6);
      box(x + dx, 2.9, z + dz - 2.6, 8.4, 0.3, 1.2, [terra, teal, orange][Math.abs(Math.round(dz / 14)) % 3]);
    }
    sign('GEYLANG SERAI MARKET', x, 11.4, z - 39, 32, 2.4, '#7a4a20');
  }

  /** Mosque: a ribbed dome on a drum, an arcaded base and one minaret. */
  function mosque(x: number, z: number) {
    box(x, 0.2, z, 42, 0.4, 74, paving);
    box(x, 5.4, z, 34, 10.8, 56, plaster, scene, true); solid(x, z, 34, 56);
    for (const side of [-1, 1]) for (let dz = -22; dz <= 22; dz += 7.4) {
      cylinder(x + side * 17.4, 3.4, z + dz, 0.6, 6.8, plaster);
      for (let n = 0; n <= 6; n++) {
        const angle = Math.PI * n / 6;
        box(x + side * 17.4, 7 + Math.sin(angle) * 2.6, z + dz + Math.cos(angle) * 3.5, 1.1, 1, 1.4, plaster);
      }
    }
    box(x, 11.4, z, 38, 1.2, 60, stone);
    for (let dx = -16; dx <= 16; dx += 4) box(x + dx, 12.4, z, 1.6, 1.4, 60, plaster);
    cylinder(x, 13.6, z - 6, 15, 5.4, plaster); solid(x, z - 6, 26, 26);
    for (let ring = 0; ring < 7; ring++) {
      const t = ring / 7;
      cylinder(x, 17 + ring * 2.3, z - 6, 15 * Math.cos(t * Math.PI / 2.05), 2.4, ring % 2 ? gold : teal);
    }
    const crown = new THREE.Mesh(geo(new THREE.SphereGeometry(3.4, 12, 8)), gold);
    crown.position.set(x, 33.4, z - 6); scene.add(crown);
    const spike = new THREE.Mesh(geo(new THREE.ConeGeometry(1, 5, 8)), gold);
    spike.position.set(x, 38, z - 6); scene.add(spike);
    cylinder(x - 22, 17, z + 26, 2.6, 34, plaster); solid(x - 22, z + 26, 5.6, 5.6);
    for (let ring = 0; ring < 4; ring++) cylinder(x - 22, 10 + ring * 8, z + 26, 3.1, 0.8, teal);
    cylinder(x - 22, 35.4, z + 26, 3.4, 2.4, teal);
    for (let ring = 0; ring < 3; ring++) cylinder(x - 22, 37.4 + ring * 1.5, z + 26, 2.8 - ring * 0.8, 1.4, gold);
    sign('MASJID', x, 8.4, z - 29.4, 20, 2.2, '#1f6b62');
  }

  /** Temple: a curved ridge on brackets over a colonnaded hall. */
  function temple(x: number, z: number) {
    box(x, 0.2, z, 44, 0.4, 70, paving);
    box(x, 5, z, 34, 10, 48, lacquer, scene, true); solid(x, z, 34, 48);
    for (const dx of [-14, -4.6, 4.6, 14]) { cylinder(x + dx, 3.4, z - 25.6, 0.8, 6.8, lacquer); solid(x + dx, z - 25.6, 1.7, 1.7); }
    box(x, 8, z - 25.8, 34, 0.7, 4.4, gold);
    for (let tier = 0; tier < 2; tier++) {
      const span = 40 - tier * 9, y = 10.6 + tier * 4.4;
      for (const side of [-1, 1]) {
        const roof = box(x, y, z + side * (span / 4.4), span, 0.7, span / 2.1, tileDark, scene, true);
        roof.rotation.x = side * 0.32;
      }
      box(x, y + 1.7, z, span - 5, 0.5, span / 2.3, tileDark);
      // Swallowtail ridge: the ends lift away from the hall.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const tip = box(x + sx * span / 2, y + 1.2, z + sz * span / 3.9, 4, 0.5, 1.1, gold, scene, true);
        tip.rotation.z = sx * 0.55; tip.rotation.y = sz * 0.32;
      }
      for (let dx = -span / 2 + 3; dx < span / 2 - 1; dx += 5) blob(x + dx, y + 2.4, z, 1.1, 0.8, 1.1, jade);
    }
    for (const dx of [-12, 12]) { cylinder(x + dx, 1.4, z - 31, 1.9, 2.8, stone); solid(x + dx, z - 31, 4, 4); for (let s = 0; s < 3; s++) cylinder(x + dx, 3.4 + s * 0.5, z - 31, 0.08, 2.6, orange); }
    sign('TEMPLE', x, 7.4, z - 32.4, 18, 2.2, '#6d1f19');
  }

  /** Corner coffee shop: open sides, marble tables and a zinc awning. */
  function kopitiam(x: number, z: number) {
    box(x, 0.24, z, 40, 0.4, 40, paving);
    box(x, 4.4, z - 14, 38, 8.8, 12, plaster, scene, true); solid(x, z - 14, 38, 12);
    for (let dx = -15; dx < 17; dx += 7) { box(x + dx, 3, z - 8.2, 5.4, 4.8, 0.5, dark); box(x + dx, 6.2, z - 7.8, 6, 1.4, 0.9, [lacquer, teal, orange][Math.abs(Math.round(dx / 7)) % 3]); }
    for (const dx of [-17, 0, 17]) for (const dz of [-6, 12]) { box(x + dx, 3.4, z + dz, 1, 6.8, 1, plaster); solid(x + dx, z + dz, 1.3, 1.3); }
    for (const side of [-1, 1]) { const roof = box(x, 7.4, z + side * 5, 40, 0.4, 16, zinc, scene, true); roof.rotation.x = side * 0.12; }
    for (const dx of [-12, 0, 12]) for (const dz of [-2, 8]) {
      cylinder(x + dx, 0.75, z + dz, 1.4, 1.5, plaster); solid(x + dx, z + dz, 3, 3);
      for (let s = 0; s < 4; s++) { const angle = s * Math.PI / 2; cylinder(x + dx + Math.cos(angle) * 2.3, 0.5, z + dz + Math.sin(angle) * 2.3, 0.38, 1, terra); }
    }
    for (const dx of [-13, 13]) { cylinder(x + dx, 6.4, z + 3, 0.12, 0.7, steel); for (let b = 0; b < 3; b++) { const blade = box(x + dx, 6, z + 3, 4, 0.08, 0.6, steel); blade.rotation.y = b * 2.1; } }
    sign('KOPITIAM', x, 9.4, z - 20.4, 20, 2.2, '#8c2f26');
  }

  /** Point block: a square tower on a void deck, with corridor bands. */
  function hdbSlab(x: number, z: number, height: number) {
    for (const dx of [-12, 0, 12]) for (const dz of [-10, 10]) { box(x + dx, 3, z + dz, 2.4, 6, 2.4, concrete); solid(x + dx, z + dz, 2.8, 2.8); }
    box(x, 6.4, z, 34, 0.8, 28, concrete);
    box(x, height / 2 + 7, z, 30, height, 24, plaster, scene, true); solid(x, z, 30, 24);
    for (let y = 9; y < height + 6; y += 3.2) {
      for (const side of [-1, 1]) {
        box(x, y, z + side * 12.3, 28, 2.2, 0.5, facade[(Math.round(y / 3.2) + Math.round(x / 56)) % facade.length]);
        for (let dx = -12; dx < 14; dx += 5) box(x + dx, y, z + side * 12.6, 3, 1.5, 0.4, glass);
      }
      if (Math.round(y) % 4 === 0) for (const side of [-1, 1]) box(x + side * 15.4, y, z, 0.5, 2.2, 22, stone);
    }
    box(x, height + 8, z, 33, 1.4, 27, stone);
    for (const dx of [-8, 8]) box(x + dx, height + 10, z, 5, 2.6, 7, steel);
  }

  /** Quay stalls: trestles under canvas, facing the canal walk. */
  function quayStalls(z: number) {
    for (let x = -200; x <= 200; x += 22) {
      if (LORONGS.some(lane => Math.abs(x - lane) < 16)) continue;
      box(x, 1.3, z, 12, 2.6, 8, facade[Math.abs(Math.round(x / 22)) % facade.length]); solid(x, z, 12, 8);
      box(x, 2.8, z + 4.6, 12.4, 0.3, 1.6, wood);
      for (const side of [-1, 1]) { const cover = box(x, 4, z + side * 2.4, 13, 0.18, 6, [terra, teal, orange][Math.abs(Math.round(x / 22)) % 3], scene, true); cover.rotation.x = side * 0.34; }
      for (const dx of [-5.6, 5.6]) cylinder(x + dx, 2, z + 5.4, 0.1, 4, dark);
      for (const dx of [-3, 0, 3]) blob(x + dx, 3.1, z + 4.4, 1.1, 0.8, 0.8, Math.round(x) % 2 ? fern : orange);
    }
  }

  // Terraces down every lorong, two rows deep with a back lane between them.
  for (const centre of BLOCKS) {
    if (Math.abs(centre) === 185) continue;
    shophouseRow(centre - 7, -60, 2, -1);
    shophouseRow(centre - 7, -30, 2, 1);
  }
  // West block: a car-park deck where the terraces would otherwise run out.
  box(-185, 3, -45, 40, 6, 30, concrete, scene, true); solid(-185, -45, 40, 30);
  for (let level = 0; level < 2; level++) for (let dx = -16; dx < 18; dx += 7) box(-185 + dx, 1.6 + level * 3.2, -30.4, 5.4, 0.7, 0.6, stone);
  for (const side of [-1, 1]) box(-185, 6.5, -45 + side * 13, 42, 1.4, 4, stone);
  marketHall(-112, 60);
  mosque(-56, 60);
  kopitiam(0, 40);
  temple(56, 60);
  hdbSlab(112, 60, 42);
  hdbSlab(-185, 60, 36);
  quayStalls(-108);
  quayStalls(-166);

  // East park: open lawn carrying the range, with planting at its margins.
  box(185, 0.18, 20, 50, 0.35, 280, lawn);
  for (const z of [-96, -64, 96, 130]) { tree(166, z, 9, wood, leaf); tree(204, z + 14, 8, wood, fern); }
  for (const z of [-40, 100]) { box(204, 0.85, z, 3.4, 0.22, 1.2, wood); solid(204, z, 3.6, 1.2); }
  for (let step = 0; step < 3; step++) box(185, 0.4 + step * 0.4, 150, 24 - step * 6, 0.9 + step * 0.3, 16 - step * 4, step % 2 ? stone : concrete);
  solid(185, 150, 26, 18);

  // North band beyond the halls, and perimeter planting along the lanes.
  for (const centre of BLOCKS) if (Math.abs(centre) !== 185) {
    box(centre, 0.2, 150, 38, 0.4, 24, grass);
    for (const dx of [-13, 13]) tree(centre + dx, 150, 8, wood, leaf);
  }
  for (const x of [-EDGE_X - 14, EDGE_X + 14]) for (let z = -160; z <= 160; z += 26) if (Math.abs(z) > 20) tree(x, z, 8, wood, fern);
  for (let x = -200; x <= 200; x += 28) tree(x, -EDGE_Z - 14, 8, wood, leaf);

  const pedestrians = ['#e9e7d8', '#6d90a0', '#b0644a', '#5b8a4c'].map(color => mat(color))
    .flatMap((shirt, index) => [walker(-60 + index * 24, -10, shirt, skin, dark), walker(-56 + index * 28, -118, shirt, skin, dark)]);
  const car = kit.car(mat('#87a09a'), glass, mat('#d9d4c4'), dark);
  const stamps = stampRings(GEYLANG_STAMPS, orange);
  scene.userData.districtFeatures = ['close-set-lorong-grid', 'vented-parapets', 'segmental-fanlights', 'pilastered-terraces', 'five-foot-way-columns', 'upswept-gable-ends', 'ribbed-dome-drum', 'swallowtail-ridge', 'open-sided-kopitiam', 'bridged-canal'];
  scene.userData.referenceFeatures = [];

  return kit.finish({
    car, stamps,
    animate(time: number) {
      ripples.forEach((ripple, index) => { ripple.position.x = ripple.userData.baseX + Math.sin(time * 0.34 + index) * 1.4; });
      pedestrians.forEach((person, index) => {
        if (index % 2) { person.position.x = -80 + ((time * 1.2 + index * 23) % 170); person.rotation.y = -Math.PI / 2; }
        else { person.position.x = -70 + ((time * 1.4 + index * 31) % 150); person.rotation.y = -Math.PI / 2; }
      });
    },
  });
}
