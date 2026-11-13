import * as THREE from 'three';
import type { SceneKit } from './scene-kit';
import { accelerateTerrainRaycast } from './terrain-raycast';
import { createWaterMaterial } from './water';

/** Authored beach in gameplay metres, not surveyed Sentosa bathymetry.
 * Preserve the two existing landing lanes as deeper channels. */
export const SENTOSA_BEACH = { minX: -215, maxX: 215, minZ: 190, maxZ: 350, surface: .14, wadeEnd: 209 };
const xs = [...new Set([...Array.from({ length: 151 }, (_, i) => -300 + i * 4), -220, -215, -175, -165, -155, -145, -135, 135, 145, 155, 165, 175, 215, 220])].sort((a, b) => a - b);
const profile = [[185, .33], [192, .33], [195, .33], [196, .23], [198, -.06], [200, -.14], [204, -.32], [208, -.48], [210, -.54], [214, -.85], [220, -1.6], [230, -3.2], [260, -4], [350, -4]] as const;
const zs = profile.map(p => p[0]);
const heights = profile.map(([z, y]) => xs.map(x => {
  const channel = 1 - THREE.MathUtils.smoothstep(Math.abs(Math.abs(x) - 155), 10, 20);
  const depth = THREE.MathUtils.smoothstep(z, 195, 202);
  const beach = THREE.MathUtils.lerp(y, Math.min(y, -2.6), channel * depth);
  return beach * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 215, 240));
}));

/** Same diagonal and samples as the rendered sand, including the channels. */
export function sentosaBeachHeight(x: number, z: number): number | undefined {
  if (x < xs[0] || x > xs.at(-1)! || z < zs[0] || z > zs.at(-1)!) return undefined;
  const i = x === xs.at(-1) ? xs.length - 2 : Math.max(0, xs.findIndex(n => n > x) - 1);
  const j = z === zs.at(-1) ? zs.length - 2 : Math.max(0, zs.findIndex(n => n > z) - 1);
  const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
  const a = heights[j][i], b = heights[j][i + 1], c = heights[j + 1][i], d = heights[j + 1][i + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function buildSentosaBeach(kit: SceneKit) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const dry = new THREE.Color('#e6d2a4'), wet = new THREE.Color('#b9aa83'), submerged = new THREE.Color('#ded1ab'), grass = new THREE.Color('#89a76a');
  zs.forEach((z, j) => xs.forEach((x, i) => {
    const y = heights[j][i], color = y >= .25 ? dry.clone() : wet.clone().lerp(submerged, THREE.MathUtils.smoothstep(.14 - y, 0, .55));
    color.lerp(grass, THREE.MathUtils.smoothstep(Math.abs(x), 218, 240));
    color.multiplyScalar(.96 + .04 * Math.sin(x * .37 + z * .6) * Math.sin(z * 1.2));
    positions.push(x, y, z); colors.push(color.r, color.g, color.b);
    if (i < xs.length - 1 && j < zs.length - 1) {
      const n = j * xs.length + i; indices.push(n, n + xs.length, n + 1, n + xs.length + 1, n + 1, n + xs.length);
    }
  }));
  const geometry = kit.geo(new THREE.BufferGeometry()); geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const sand = kit.mat('#ffffff', .96); sand.vertexColors = true;
  const shelf = new THREE.Mesh(geometry, sand); shelf.name = 'sentosa-sandy-shelf'; shelf.receiveShadow = true;
  shelf.userData.groundSurface = shelf.userData.terrain = true; kit.scene.add(shelf);
  shelf.userData.terrainCover = 'sand';
  const disposeRaycast = accelerateTerrainRaycast(shelf, xs.length, zs.length);
  const water = createWaterMaterial({ deep: '#1c6677', shallow: '#68bdb6', sky: '#cfe1e7', horizon: '#8db6c1', sun: new THREE.Vector3(110, 215, 150), clarity: .28, choppiness: .38 });
  const sea = new THREE.Mesh(kit.geo(new THREE.PlaneGeometry(430, 160, 86, 40)), water);
  sea.name = 'sentosa-beach-water'; sea.rotation.x = -Math.PI / 2; sea.position.set(0, SENTOSA_BEACH.surface, 270); sea.renderOrder = 1;
  sea.userData.fpsWater = true; sea.userData.rainContact = 'water'; kit.scene.add(sea);
  sea.userData.waterFloor = sentosaBeachHeight;
  // Continue past the authored landing approaches into the fog, so looking
  // along the beach never exposes the rectangular edge of the old sea strip.
  const horizonGeometry = kit.geo(new THREE.BufferGeometry());
  horizonGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -215, .14, 350, 215, .14, 350,
    -1500, .14, 650, 1500, .14, 650,
    -1500, .14, 1600, 1500, .14, 1600,
  ], 3));
  horizonGeometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  const horizon = new THREE.Mesh(horizonGeometry, water); horizon.name = 'sentosa-offshore-water';
  horizon.renderOrder = 1; horizon.userData.fpsWater = true; kit.scene.add(horizon);
  kit.scene.userData.primaryWater = sea.name;
  // Walk onto the shelf. Deep water and boat lanes remain collision barriers;
  // no swimming or new naval routes are inferred from the rendered surface.
  kit.obstacles.push({ minX: -215, maxX: 215, minZ: SENTOSA_BEACH.wadeEnd, maxZ: 350 });
  for (const x of [-155, 155]) kit.obstacles.push({ minX: x - 21, maxX: x + 21, minZ: 196, maxZ: SENTOSA_BEACH.wadeEnd });
  return { water, shelf, sea, dispose() { disposeRaycast(); water.dispose(); } };
}
