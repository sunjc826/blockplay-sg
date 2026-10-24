import { expect, it } from 'vitest';
import * as THREE from 'three';
import { craterHeight, createBulletHoleMaterial, createBulletHoleTextures, createDecalAtlas, decalTile } from './fps-impact-material';
import { DECAL_KINDS } from './fps-surfaces';

it('builds a recessed cavity with a raised rim and transparent exterior', () => {
  expect(craterHeight(0, 0)).toBeLessThan(0);
  expect(craterHeight(.675, 0)).toBeGreaterThan(0);
  const { map, normalMap } = createBulletHoleTextures();
  expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(normalMap.colorSpace).toBe(THREE.NoColorSpace);
  const size = 128, center = (64 * size + 64) * 4;
  expect(map.image.data[3]).toBe(0);
  expect(map.image.data[center + 3]).toBe(255);
  expect(normalMap.image.data[center + 3]).toBeGreaterThan(240);
  // On the cavity's right slope the normal must face left: a dent, not a bump.
  const right = (64 * size + 88) * 4;
  expect(normalMap.image.data[right]).toBeLessThan(128);
  expect(normalMap.image.data[right + 2]).toBeGreaterThan(128);
  map.dispose(); normalMap.dispose();
});
it('binds a lit normal map and keeps per-instance fade and depth in the shader', () => {
  const textures = createBulletHoleTextures(), material = createBulletHoleMaterial(textures);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  expect(material.normalMap).toBe(textures.normalMap);
  expect(material.depthWrite).toBe(false);
  expect(shader.fragmentShader).toContain('normalScale * vImpactDepth');
  expect(shader.fragmentShader).toContain('diffuseColor.a *= vEffectOpacity');
  expect(shader.vertexShader).toContain('vImpactDepth = impactDepth');
  material.dispose(); textures.map.dispose(); textures.normalMap.dispose();
});
it('paints one tile per material mark, each opaque inside and clear at its border', () => {
  const tile = 64, atlas = createDecalAtlas(tile), size = tile * atlas.columns, colour = atlas.map.image.data as Uint8Array;
  expect(atlas.columns * atlas.columns).toBeGreaterThanOrEqual(DECAL_KINDS.length);
  DECAL_KINDS.forEach(kind => {
    const index = decalTile(kind), x0 = (index % atlas.columns) * tile, y0 = Math.floor(index / atlas.columns) * tile;
    const alpha = (x: number, y: number) => colour[((y0 + y) * size + x0 + x) * 4 + 3];
    let border = 0, inside = 0;
    for (let i = 0; i < tile; i++) border = Math.max(border, alpha(i, 0), alpha(i, tile - 1), alpha(0, i), alpha(tile - 1, i));
    for (let y = tile / 4; y < tile * 3 / 4; y++) for (let x = tile / 4; x < tile * 3 / 4; x++) inside = Math.max(inside, alpha(x, y));
    expect(border, kind).toBe(0);
    expect(inside, kind).toBeGreaterThan(200);
  });
  // Blood reads red; a wood tear and a metal dent are not the same grey crater.
  const centre = (kind: (typeof DECAL_KINDS)[number], dx = 0) => {
    const index = decalTile(kind), i = ((Math.floor(index / atlas.columns) * tile + tile / 2) * size + (index % atlas.columns) * tile + tile / 2 + Math.round(dx)) * 4;
    return [colour[i], colour[i + 1], colour[i + 2]];
  };
  const [r, g] = centre('blood'); expect(r).toBeGreaterThan(g * 4);
  expect(centre('splinter', tile / 5)).not.toEqual(centre('crater', tile / 5));
  atlas.map.dispose(); atlas.normalMap.dispose();
});
it('selects each instance\'s atlas tile in the vertex shader', () => {
  const atlas = createDecalAtlas(16), material = createBulletHoleMaterial(atlas, atlas.columns);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  expect(shader.vertexShader).toContain('attribute float decalTile');
  expect(shader.vertexShader).toContain('vNormalMapUv = (vNormalMapUv + decalCell)');
  material.dispose(); atlas.map.dispose(); atlas.normalMap.dispose();
});
