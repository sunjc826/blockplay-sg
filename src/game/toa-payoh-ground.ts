import * as THREE from 'three';
import type { SceneKit } from './scene-kit';
import type { VerticalPlace } from './vertical-places';

const floor = (id: string, x: number, z: number, y: number, width: number, depth: number, color = '#bdbbb1') =>
  ({ id, x, z, y, width, depth, color, rails: false, supports: false, foundation: 'solid' as const });
export const TOA_PAYOH_GROUND_PLACES: VerticalPlace[] = [{
  id: 'toa-payoh-social-ground', name: 'Level estate decks and connected park paths',
  note: 'Authored local thresholds and older communal pockets; broad town ground remains flat. Not surveyed addresses or levels.',
  floors: [
    floor('north-void-deck', 50, -86, 0, 92, 13), floor('south-void-deck', 50, -18, 0, 80, 13),
    floor('north-forecourt', 50, -77.25, 0, 84, 4.5),
    floor('dragon-sand', 50, -50, .33, 56, 40, '#ddcda4'),
    floor('shaded-park-path', -218, -45, .22, 5, 86),
    floor('pond-north-walk', -180, -88, .22, 58, 3), floor('pond-south-walk', -180, -44, .22, 58, 3),
    floor('north-path-link', -212.25, -88, .22, 6.5, 3), floor('south-path-link', -212.25, -44, .22, 6.5, 3),
  ],
  connections: [
    { id: 'north-court-approach', from: { x: 32, z: -75, y: 0 }, to: { x: 32, z: -70, y: .33 }, width: 8, foundation: 'solid', rails: false, color: '#bdbbb1' },
    { id: 'south-court-approach', from: { x: 68, z: -30, y: .33 }, to: { x: 68, z: -24.5, y: 0 }, width: 8, foundation: 'solid', rails: false, color: '#bdbbb1' },
  ],
}];

export function toaPayohGroundHeight(x: number, z: number) {
  for (const p of TOA_PAYOH_GROUND_PLACES) {
    for (const f of p.floors) if (Math.abs(x - f.x) <= f.width / 2 && Math.abs(z - f.z) <= f.depth / 2) return f.y;
    for (const c of p.connections) if (Math.abs(x - c.from.x) <= c.width / 2 && z >= Math.min(c.from.z, c.to.z) && z <= Math.max(c.from.z, c.to.z))
      return c.from.y + (c.to.y - c.from.y) * (z - c.from.z) / (c.to.z - c.from.z);
  }
  return 0;
}

export const TOA_PAYOH_SOCIAL_TABLES = [{ x: 22, z: -88.5, board: true, seats: 6 }, { x: 70, z: -88.5, board: false, seats: 4 }, { x: 30, z: -20.7, board: false, seats: 4 }];
export function addToaPayohSocialDetails(kit: SceneKit) {
  const stone = kit.mat('#aaaead', .8), blue = kit.mat('#527b90', .63), trim = kit.mat('#deddd1');
  const traversal = kit.scene.userData.traversalObstacles ??= [];
  const solid = (x: number, y: number, z: number, width: number, height: number, depth: number) => {
    const bounds = { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, minY: y - height / 2, maxY: y + height / 2 };
    kit.obstacles.push(bounds); traversal.push(bounds);
  };
  // One occasional checkerboard is part of the cylinder's top cap material.
  // Other table tops remain plain; no detached or coplanar board plane.
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const inside = x >= 28 && x < 100 && y >= 28 && y < 100;
    const checker = (Math.floor((x - 28) / 9) + Math.floor((y - 28) / 9)) % 2;
    const grout = x % 12 === 0 || y % 12 === 0;
    const color = inside ? checker ? [70, 83, 87] : [219, 221, 208] : grout ? [205, 208, 197] : [73, 111, 137];
    pixels.set([...color, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  const top = new THREE.MeshStandardMaterial({ map: texture, roughness: .65 });
  for (const t of TOA_PAYOH_SOCIAL_TABLES) {
    const finish = t.board ? blue : stone;
    kit.cylinder(t.x, .345, t.z, .24, .69, finish);
    const g = kit.geo(new THREE.CylinderGeometry(.84, .84, .14, 24));
    const cap = new THREE.Mesh(g, t.board ? [finish, top, finish] : finish); cap.position.set(t.x, .76, t.z); cap.castShadow = cap.receiveShadow = true; kit.scene.add(cap);
    solid(t.x, .415, t.z, 1.68, .83, 1.68);
    for (let i = 0; i < t.seats; i++) {
      const a = i * Math.PI * 2 / t.seats + Math.PI / 4, x = t.x + Math.cos(a) * 1.4, z = t.z + Math.sin(a) * 1.4;
      kit.cylinder(x, .23, z, .28, .46, finish); kit.cylinder(x, .48, z, .30, .04, trim);
      solid(x, .25, z, .6, .5, .6);
    }
  }
  const bench = (x: number, z: number, yaw = 0, back = true) => {
    const y = toaPayohGroundHeight(x, z), w = yaw ? .68 : 3.4, d = yaw ? 3.4 : .68;
    kit.box(x, y + .48, z, w, .15, d, stone);
    if (back) kit.box(x + (yaw ? -.28 : 0), y + .84, z + (yaw ? 0 : .28), yaw ? .13 : 3.4, .57, yaw ? 3.4 : .13, stone);
    for (const side of [-1, 1]) kit.box(x + (yaw ? 0 : side * 1.15), y + .2025, z + (yaw ? side * 1.15 : 0), yaw ? .55 : .22, .405, yaw ? .22 : .55, stone);
    solid(x, y + .5, z, w, 1, d);
  };
  bench(73, -15.2); bench(22, -15.2, 0, false);
  bench(-212, -72, Math.PI / 2); bench(-212, -31, Math.PI / 2, false);
  kit.scene.userData.socialGroundDesign = { type: 'older-estate-pockets-and-low-park-paths', tables: 3, gameBoards: 1,
    sources: ['docs/TOA-PAYOH-TAMPINES-GROUND-DESIGN.md'], surveyed: false };
  return () => { top.dispose(); texture.dispose(); };
}
