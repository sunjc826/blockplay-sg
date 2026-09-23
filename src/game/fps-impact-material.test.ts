import { expect, it } from 'vitest';
import * as THREE from 'three';
import { craterHeight, createBulletHoleMaterial, createBulletHoleTextures } from './fps-impact-material';

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
