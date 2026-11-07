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

it('does not write already-correct dry values, including on discovery scans', () => {
  const scene = new THREE.Scene(), wet = createWetSurfaces(scene, true);
  const materials = [0, .65].map(metalness => new THREE.MeshStandardMaterial({ color: '#697557', roughness: .8, metalness }));
  for (const material of materials) scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  wet.update(.1, 0);
  let writes = 0;
  // Count actual property writes, not just calls to a particular colour helper.
  for (const material of materials) for (const [object, keys] of [[material, ['roughness', 'envMapIntensity']], [material.color, ['r', 'g', 'b']]] as const) {
    for (const key of keys) {
      const target = object as unknown as Record<string, number>; let value = target[key];
      Object.defineProperty(target, key, { configurable: true, get: () => value, set: n => { value = n; writes++; } });
    }
  }
  for (let i = 0; i < 120; i++) wet.update(1 / 60, 0);
  expect(writes).toBe(0); expect(wet.wetness).toBe(0);
  wet.dispose();
});

it('initializes newly discovered shared metal while dry and restores it on disposal', () => {
  const scene = new THREE.Scene(), wet = createWetSurfaces(scene, true);
  wet.update(.1, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#a36f24', roughness: .6, envMapIntensity: 2, metalness: .65 });
  const color = material.color.clone();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  for (let i = 0; i < 6; i++) wet.update(.1, 0);
  expect(material.roughness).toBe(.6 * .86); expect(material.envMapIntensity).toBe(2 * 1.3); expect(material.color).toEqual(color);
  wet.dispose();
  expect(material.roughness).toBe(.6); expect(material.envMapIntensity).toBe(2); expect(material.color).toEqual(color);
});

it('retains dry output after external edits and changes to metalness', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial({ color: '#445566', roughness: .9, envMapIntensity: 2 });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const color = material.color.clone(), wet = createWetSurfaces(scene, true);
  wet.update(.1, 0);
  for (const metalness of [.8, .1, .65]) {
    material.color.set('#cc2211'); material.roughness = .2; material.envMapIntensity = .3; material.metalness = metalness;
    wet.update(.1, 0);
    expect(material.color).toEqual(color);
    expect(material.roughness).toBe(.9 * (metalness > .3 ? .86 : 1));
    expect(material.envMapIntensity).toBe(2 * (metalness > .3 ? 1.3 : 1));
  }
  wet.dispose();
});

it('keeps the exact soaking and gradual drying curve through shelter and changing metalness', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial({ color: '#62714c', roughness: .9, envMapIntensity: 1.4 });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const color = material.color.clone(), wet = createWetSurfaces(scene, true); let expected = 0;
  for (let i = 0; i < 1200; i++) {
    const dt = [0, .016, .05, .1, .2][i % 5], rain = i < 20 ? 0 : i < 150 ? 1 : i < 240 ? 0 : i < 350 ? .4 : 0;
    material.metalness = i % 77 < 38 ? .7 : .1;
    const metal = material.metalness > .3, dry = .9 * (metal ? .86 : 1);
    expected += (rain - expected) * (1 - Math.exp(-Math.min(.1, dt) * (rain > expected ? 1.8 : .09)));
    wet.update(dt, rain);
    expect(wet.wetness).toBe(expected);
    expect(material.roughness).toBe(THREE.MathUtils.lerp(dry, Math.min(dry, metal ? .2 : .46), expected));
    expect(material.envMapIntensity).toBe(1.4 * (metal ? 1.3 : 1) * (1 + expected * .65));
    expect(material.color).toEqual(color.clone().multiplyScalar(1 - expected * (metal ? .035 : .12)));
  }
  expect(wet.wetness).toBeGreaterThan(0); // No early snap to dry after rain.
  wet.dispose();
});
