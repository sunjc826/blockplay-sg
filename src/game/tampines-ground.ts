import * as THREE from 'three';
import { accelerateMeshRaycast } from './mesh-raycast';
import type { SceneKit } from './scene-kit';

interface GroundPatch {
  id: string; xs: number[]; zs: number[]; heights: number[];
  finish(x: number, z: number): 'paving' | 'turf' | 'bank' | 'trail';
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function patch(id: string, xs: number[], zs: number[], height: (x: number, z: number) => number, finish: GroundPatch['finish']): GroundPatch {
  return { id, xs, zs, heights: zs.flatMap(z => xs.map(x => height(x, z))), finish };
}
// A shallow civic threshold, not a hill beneath the town centre. The sports
// surface stays level; a paved collar connects it to the lower arrival floor.
const hubHeight = (x: number, z: number) => {
  const pad = .18 * clamp(Math.min((x - 4) / 3, (102 - x) / 3, (z + 87) / 3, (10 - z) / 6));
  const outsideCourt = Math.max(26 - x, x - 84, -61.5 - z, z + 18.5, 0);
  return pad + .52 * clamp(1 - outsideCourt / 3);
};
const bankProfile = (x: number) => {
  const points = [[122, 0], [126, .8], [132, .8], [137, .12], [207, .12], [213, 1.6], [219, 1.6], [226, 0]];
  for (let i = 1; i < points.length; i++) if (x <= points[i][0]) {
    const [a, h] = points[i - 1], [b, k] = points[i]; return h + (k - h) * (x - a) / (b - a);
  }
  return 0;
};
const shorelineZ = [47.5, 55, 94, 102.5, 108, 116];
export const TAMPINES_GROUND_PATCHES: GroundPatch[] = [
  patch('hub-connected-arrival', [4, 7, 23, 26, 29, 81, 84, 87, 99, 102], [-87, -84, -64.5, -61.5, -18.5, -15.5, 4, 10], hubHeight,
    (x, z) => x >= 26 && x <= 84 && z >= -61.5 && z <= -18.5 ? 'turf' : 'paving'),
  patch('quarry-north-approach', [122, 126, 132, 137, 150, 194, 207, 213, 219, 226], [37, 40, 44, 47.5],
    (x, z) => bankProfile(x) * (z - 37) / 10.5,
    (_x, z) => z >= 40 && z <= 44 ? 'trail' : 'bank'),
  ...([[122, 126, 132, 137], [207, 213, 219, 226]]).map((xs, i) => patch(`quarry-${i ? 'east' : 'west'}-bank`, xs, shorelineZ,
    (x, z) => bankProfile(x) * clamp((116 - z) / 13.5),
    (x, z) => z <= 108 && (i ? x >= 213 && x <= 219 : x >= 126 && x <= 132) ? 'trail' : 'bank')),
];

/** Interpolate the same diagonal split used by the rendered mesh. */
export function tampinesGroundHeight(x: number, z: number) {
  const p = TAMPINES_GROUND_PATCHES.find(p => x >= p.xs[0] && x <= p.xs.at(-1)! && z >= p.zs[0] && z <= p.zs.at(-1)!);
  if (!p) return 0;
  const i = Math.min(p.xs.length - 2, p.xs.findIndex((n, i) => i > 0 && n >= x) - 1);
  const j = Math.min(p.zs.length - 2, p.zs.findIndex((n, i) => i > 0 && n >= z) - 1);
  const u = (x - p.xs[i]) / (p.xs[i + 1] - p.xs[i]), v = (z - p.zs[j]) / (p.zs[j + 1] - p.zs[j]);
  const a = p.heights[j * p.xs.length + i], b = p.heights[j * p.xs.length + i + 1];
  const c = p.heights[(j + 1) * p.xs.length + i], d = p.heights[(j + 1) * p.xs.length + i + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function addTampinesGround(kit: SceneKit) {
  const materials = { paving: kit.mat('#bbb6a9'), turf: kit.mat('#4f8a46'), bank: kit.mat('#789063'), trail: kit.mat('#ad9778') };
  const disposers: (() => void)[] = [];
  for (const p of TAMPINES_GROUND_PATCHES) {
    const vertices = new Map<string, number[]>();
    for (let j = 0; j < p.zs.length - 1; j++) for (let i = 0; i < p.xs.length - 1; i++) {
      const finish = p.finish((p.xs[i] + p.xs[i + 1]) / 2, (p.zs[j] + p.zs[j + 1]) / 2);
      const list = vertices.get(finish) ?? [];
      const n = j * p.xs.length + i;
      for (const index of [n, n + p.xs.length, n + 1, n + p.xs.length + 1, n + 1, n + p.xs.length])
        list.push(p.xs[index % p.xs.length], p.heights[index], p.zs[Math.floor(index / p.xs.length)]);
      vertices.set(finish, list);
    }
    for (const [finish, positions] of vertices) {
      const g = kit.geo(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, materials[finish as keyof typeof materials]);
      mesh.name = `Tampines ground: ${p.id}/${finish}`; mesh.receiveShadow = true;
      mesh.userData.groundSurface = mesh.userData.terrain = true; kit.scene.add(mesh);
      disposers.push(accelerateMeshRaycast(mesh));
    }
  }
  kit.scene.userData.groundDesign = { type: 'flat-town-with-local-transitions', quarry: 'connected-vegetated-banks', surveyed: false,
    sources: ['docs/TOA-PAYOH-TAMPINES-GROUND-DESIGN.md'] };
  return () => disposers.forEach(dispose => dispose());
}
