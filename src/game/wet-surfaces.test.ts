import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWetSurfaces } from './wet-surfaces';

it('soaks tagged bodies without metallizing cloth, skips glass and scenery, and restores originals', () => {
  const scene = new THREE.Scene(), body = new THREE.Group(); body.userData.wetSurface = true; scene.add(body);
  const fabric = new THREE.MeshStandardMaterial({ color: '#697557', roughness: .95 });
  const glass = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: .3, roughness: .08 });
  const wall = new THREE.MeshStandardMaterial({ roughness: .9 });
  const color = fabric.color.clone(), hook = fabric.onBeforeCompile;
  body.add(new THREE.Mesh(new THREE.BoxGeometry(), fabric), new THREE.Mesh(new THREE.BoxGeometry(), glass));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), wall));
  const wet = createWetSurfaces(scene);
  for (let i = 0; i < 100; i++) wet.update(.1, 1);
  expect(fabric.roughness).toBeCloseTo(.46); expect(fabric.envMapIntensity).toBeGreaterThan(1.6);
  expect(fabric.metalness).toBe(0); expect(fabric.onBeforeCompile).toBe(hook);
  expect(fabric.color.r).toBeLessThan(color.r); expect(glass.roughness).toBe(.08); expect(wall.roughness).toBe(.9);
  wet.update(.1, 0); expect(wet.wetness).toBeGreaterThan(.98);
  wet.dispose(); expect(fabric.roughness).toBe(.95); expect(fabric.color).toEqual(color); expect(fabric.envMapIntensity).toBe(1);
});

describe('dynamic viewmodels', () => {
  it('discovers swapped equipment, brightens metal highlights, and releases disposed materials', () => {
    const scene = new THREE.Scene(), wet = createWetSurfaces(scene, true);
    wet.update(.1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .65 });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    for (let i = 0; i < 10; i++) wet.update(.1, 1);
    expect(material.roughness).toBeLessThan(.3);
    material.dispose(); material.roughness = .9;
    wet.update(.1, 1); expect(material.roughness).toBe(.9);
    wet.dispose();
  });
});
