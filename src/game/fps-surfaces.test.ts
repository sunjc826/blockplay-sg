import { expect, it } from 'vitest';
import * as THREE from 'three';
import { hitSurface, materialSurface, SURFACE_KINDS, SURFACE_LOOKS } from './fps-surfaces';

const standard = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, ...extra });

it('reads the districts\' plain materials as the surfaces they are painted to be', () => {
  // Timber, terracotta, leaf green, asphalt, plaster and a steel rail.
  expect(materialSurface(standard('#7b6148'))).toBe('wood');
  expect(materialSurface(standard('#a8563a'))).toBe('concrete');
  expect(materialSurface(standard('#5b8a4c'))).toBe('foliage');
  expect(materialSurface(standard('#36434a'))).toBe('concrete');
  expect(materialSurface(standard('#e9e7d8'))).toBe('concrete');
  expect(materialSurface(standard('#b0b8bb', { metalness: .8 }))).toBe('metal');
  expect(materialSurface(standard('#9fd2e0', { transparent: true, opacity: .4 }))).toBe('glass');
  // A saturated orange awning is paint, not timber.
  expect(materialSurface(standard('#f0a044'))).toBe('concrete');
});

it('treats a lawn underfoot as earth and lets names and tags override colour', () => {
  expect(materialSurface(standard('#5b8a4c'), 1)).toBe('dirt');
  const named = standard('#e9e7d8'); named.name = 'Timber deck';
  expect(materialSurface(named)).toBe('wood');
  const tagged = standard('#7b6148'); tagged.userData.impactSurface = 'metal';
  expect(materialSurface(tagged)).toBe('metal');
  expect(materialSurface(undefined)).toBe('concrete');
});

it('lets a tag anywhere up the parent chain declare a whole figure', () => {
  const figure = new THREE.Group(); figure.userData.impactSurface = 'flesh';
  const limb = new THREE.Mesh(new THREE.BoxGeometry(), standard('#b0b8bb', { metalness: .9 })); figure.add(limb);
  expect(hitSurface({ object: limb, face: null })).toBe('flesh');
  const multi = new THREE.Mesh(new THREE.BoxGeometry(), [standard('#e9e7d8'), standard('#7b6148')]);
  expect(hitSurface({ object: multi, face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(), materialIndex: 1 } })).toBe('wood');
});

it('gives every surface a look the pools can draw', () => {
  for (const kind of SURFACE_KINDS) {
    const look = SURFACE_LOOKS[kind];
    expect(look.debris.colours.length).toBeGreaterThan(0);
    expect(look.debris.shape.every(axis => axis > 0)).toBe(true);
    expect(look.decal === null || look.decalScale > 0).toBe(true);
  }
  // A body never takes a mark, and wood and glass never spark.
  expect(SURFACE_LOOKS.flesh.decal).toBeNull();
  expect(SURFACE_LOOKS.wood.sparks).toBe(0); expect(SURFACE_LOOKS.glass.sparks).toBe(0);
  expect(SURFACE_LOOKS.metal.sparks).toBeGreaterThan(SURFACE_LOOKS.concrete.sparks);
});
