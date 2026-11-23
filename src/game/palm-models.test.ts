import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPalm, createPalmKit, PALM_VARIANTS } from './palm-models';
import { PALM_SPECIES, PALM_SPECS } from './palm-species';
import { createSceneKit } from './scene-kit';
import { leafShade } from './leaf-shading';
import { materialSurface } from './fps-surfaces';

const numbers = (g: THREE.BufferGeometry, name: string) => Array.from(g.getAttribute(name).array as Float32Array);

describe.each(PALM_SPECIES)('%s', species => {
  const spec = PALM_SPECS[species];
  it('builds finite, lit-side-out geometry within its triangle budget, the same every time', () => {
    for (let variant = 0; variant < PALM_VARIANTS; variant++) {
      const palm = buildPalm(species, variant), again = buildPalm(species, variant);
      expect(numbers(again.crown, 'position')).toEqual(numbers(palm.crown, 'position'));
      for (const geometry of [palm.trunk, palm.crown]) {
        const p = numbers(geometry, 'position'), n = numbers(geometry, 'normal'), c = numbers(geometry, 'color');
        expect(p.every(Number.isFinite) && n.every(Number.isFinite) && c.every(v => v >= 0 && v <= 1)).toBe(true);
        expect(p.length).toBe(n.length); expect(p.length).toBe(c.length); expect(p.length % 9).toBe(0);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), normal = new THREE.Vector3();
        for (let i = 0; i < p.length; i += 9) {
          a.fromArray(p, i); b.fromArray(p, i + 3).sub(a); d.fromArray(p, i + 6).sub(a); normal.fromArray(n, i);
          expect(normal.length()).toBeCloseTo(1, 3);
          // The winding agrees with the stored normal, so a double-sided material lights the right face.
          expect(b.cross(d).dot(normal)).toBeGreaterThanOrEqual(-1e-7);
        }
      }
      const budget = spec.clump ? 3600 : 1900;
      expect(palm.triangles.trunk + palm.triangles.crown).toBeLessThan(budget);
      expect(palm.triangles.crown).toBeGreaterThan(600);
      expect(palm.height).toBeCloseTo(spec.height + (spec.crownshaft?.length ?? 0), 1);
      // The crown sits on top of the trunk, and the trunk stands on the ground.
      // A leaning foot is sunk a little, never floating.
      expect(palm.trunk.boundingBox!.min.y).toBeLessThanOrEqual(0); expect(palm.trunk.boundingBox!.min.y).toBeGreaterThan(-.15);
      expect(palm.crown.boundingBox!.max.y).toBeGreaterThan(palm.height);
      expect(palm.crown.boundingBox!.min.y).toBeGreaterThan(spec.clump ? 0 : palm.height * .45);
    }
  });
  it('varies between its shapes', () => {
    expect(numbers(buildPalm(species, 0).crown, 'position')).not.toEqual(numbers(buildPalm(species, 1).crown, 'position'));
  });
});

it('keeps the features that tell the species apart', () => {
  const reddest = (g: THREE.BufferGeometry) => { const c = numbers(g, 'color'); let best = 0; for (let i = 0; i < c.length; i += 3) best = Math.max(best, c[i] - Math.max(c[i + 1], c[i + 2])); return best; };
  const width = (g: THREE.BufferGeometry, from: number, to: number) => { const p = numbers(g, 'position'); let w = 0; for (let i = 0; i < p.length; i += 3) if (p[i + 1] >= from && p[i + 1] <= to) w = Math.max(w, Math.hypot(p[i], p[i + 2])); return w; };
  // Sealing wax: a red crownshaft and red leaf stalks on several stems.
  const wax = buildPalm('sealing-wax');
  expect(reddest(wax.trunk)).toBeGreaterThan(.3); expect(reddest(wax.crown)).toBeGreaterThan(.3);
  // Royal: no lean to speak of, a green crownshaft, and a trunk wider at mid height than under the crown.
  const royal = buildPalm('royal');
  expect(Math.hypot(royal.crownOffset.x, royal.crownOffset.z)).toBeLessThan(.2);
  expect(reddest(royal.trunk)).toBeLessThan(.05);
  expect(width(royal.trunk, 4.8, 5.6)).toBeGreaterThan(width(royal.trunk, 9, 10) + .03);
  // Coconut: leans, and has no crownshaft.
  expect(Math.max(...[0, 1, 2].map(v => { const c = buildPalm('coconut', v).crownOffset; return Math.hypot(c.x, c.z); }))).toBeGreaterThan(.8);
  expect(PALM_SPECS.coconut.crownshaft).toBeUndefined();
  // Footstool: fan blades, no leaflets.
  expect(PALM_SPECS.footstool.frond.fan).toBeDefined();
});

it('places palms as two wind-tagged parts that batch per shape, and says what a round strikes', () => {
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const kit = createPalmKit({ geometry: g => geometries.push(g), material: m => materials.push(m) }), parent = new THREE.Group();
  const a = kit.place('royal', parent, 10, .5, -4, 9), b = kit.place('royal', parent, 10, .5, -4, 9);
  expect(a.trunk.geometry).toBe(b.trunk.geometry); expect(a.yaw).toBe(b.yaw);
  expect(a.trunk.userData.treePart).toMatchObject({ height: 9, flutter: 0 });
  expect(a.crown.userData.treePart).toMatchObject({ height: 9, flutter: 1.8 });
  expect(a.crown.userData.treePart.root.toArray()).toEqual([10, .5, -4]);
  expect(new THREE.Box3().setFromObject(a.trunk).max.y).toBeCloseTo(9.5, 1);
  expect(materials).toEqual([kit.wood, kit.leaf]); expect(geometries).toHaveLength(2);
  expect(materialSurface(kit.wood)).toBe('wood'); expect(materialSurface(kit.leaf)).toBe('foliage');
  expect(leafShade(kit.leaf)?.thin).toBe(true); expect(leafShade(kit.wood)).toBeUndefined();
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
});

it('joins the scene kit: palms become wind-animated instances and the kit disposes them', () => {
  const kit = createSceneKit({ background: '#aaccee', fogNear: 100, fogFar: 500 });
  for (let i = 0; i < 9; i++) kit.palm('coconut', i * 12, 0, 10 + i % 3);
  const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
  try {
    const batches = world.scene.children.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.geometry.hasAttribute('treeRootHeight'));
    expect(batches.reduce((sum, m) => sum + m.count, 0)).toBe(18);
    expect(batches.length).toBeLessThanOrEqual(PALM_VARIANTS * 2);
    for (const batch of batches) expect(batch.geometry.hasAttribute('color')).toBe(true);
    expect(world.scene.userData.foliageDrift.leafSources.length).toBeGreaterThan(0);
  } finally { world.dispose(); }
});
