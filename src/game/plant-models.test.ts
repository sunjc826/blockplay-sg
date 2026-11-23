import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPlant, PLANT_VARIANTS } from './plant-models';
import { PLANT_SPECIES, PLANT_SPECS } from './plant-species';
import { createSceneKit } from './scene-kit';
import { leafShade } from './leaf-shading';

const numbers = (g: THREE.BufferGeometry, name: string) => Array.from(g.getAttribute(name).array as Float32Array);

describe.each(PLANT_SPECIES)('%s', species => {
  const spec = PLANT_SPECS[species];
  it('builds finite, lit-side-out geometry within its triangle budget, the same every time', () => {
    for (let variant = 0; variant < PLANT_VARIANTS; variant++) {
      const plant = buildPlant(species, variant), again = buildPlant(species, variant);
      expect(numbers(again.leaf, 'position')).toEqual(numbers(plant.leaf, 'position'));
      for (const geometry of [plant.wood, plant.leaf]) {
        const p = numbers(geometry, 'position'), n = numbers(geometry, 'normal'), c = numbers(geometry, 'color');
        expect(p.every(Number.isFinite) && n.every(Number.isFinite) && c.every(v => v >= 0 && v <= 1)).toBe(true);
        expect(p.length).toBe(n.length); expect(p.length).toBe(c.length); expect(p.length % 9).toBe(0);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), normal = new THREE.Vector3();
        for (let i = 0; i < p.length; i += 9) {
          a.fromArray(p, i); b.fromArray(p, i + 3).sub(a); d.fromArray(p, i + 6).sub(a); normal.fromArray(n, i);
          expect(normal.length()).toBeCloseTo(1, 3);
          expect(b.cross(d).dot(normal)).toBeGreaterThanOrEqual(-1e-7);
        }
      }
      expect(plant.triangles.wood + plant.triangles.leaf).toBeLessThan(spec.kind === 'tree' ? 2600 : 900);
      expect(plant.leaf.boundingBox!.max.y).toBeCloseTo(plant.height, 0);
      // Rooted: nothing floats, and nothing is buried deeper than a buttress toe.
      const foot = (spec.kind === 'tree' ? plant.wood : plant.leaf).boundingBox!.min.y;
      expect(foot).toBeLessThanOrEqual(0.01); expect(foot).toBeGreaterThan(-.2);
    }
  });
  it('varies between its shapes', () => {
    expect(numbers(buildPlant(species, 0).leaf, 'position')).not.toEqual(numbers(buildPlant(species, 1).leaf, 'position'));
  });
});

it('keeps the features that tell the species apart', () => {
  const reddest = (g: THREE.BufferGeometry) => { const c = numbers(g, 'color'); let best = 0; for (let i = 0; i < c.length; i += 3) best = Math.max(best, c[i] - Math.max(c[i + 1], c[i + 2])); return best; };
  const reach = (g: THREE.BufferGeometry, from: number, to: number) => { const p = numbers(g, 'position'); let w = 0; for (let i = 0; i < p.length; i += 3) if (p[i + 1] >= from && p[i + 1] <= to) w = Math.max(w, Math.hypot(p[i], p[i + 2])); return w; };
  // Jelawai Jaha: plank buttresses several times the bole's radius, 5 m up a clear trunk, under a crown that starts high.
  const giant = buildPlant('jelawai-jaha');
  expect(giant.footing).toBeGreaterThan(giant.radius * 2.5); expect(reach(giant.wood, -.1, .5)).toBeGreaterThan(3);
  expect(giant.leaf.boundingBox!.min.y).toBeGreaterThan(giant.height * .4);
  // The heritage Tembusu: a limb that runs out level, low enough to sit on, far past the plain tree's bole.
  const heritage = buildPlant('tembusu-heritage'), plain = buildPlant('tembusu');
  expect(heritage.lowLimb).toBeDefined(); expect(plain.lowLimb).toBeUndefined();
  expect(Math.hypot(heritage.lowLimb!.to[0] - heritage.lowLimb!.from[0], heritage.lowLimb!.to[2] - heritage.lowLimb!.from[2])).toBeGreaterThan(5);
  expect(heritage.lowLimb!.to[1]).toBeLessThan(3.2);
  expect(reach(heritage.wood, 1.5, 3)).toBeGreaterThan(reach(plain.wood, 1.5, 3) + 4);
  // Torch ginger and heliconia: red flower heads on a clump with no woody parts.
  for (const herb of ['torch-ginger', 'heliconia'] as const) { const clump = buildPlant(herb); expect(clump.triangles.wood).toBe(0); expect(reddest(clump.leaf)).toBeGreaterThan(.4); }
  // The ginger's heads stand on their own stalks well below its leaves; the heliconia's hang from its stems.
  expect(PLANT_SPECS['torch-ginger'].kind === 'herb' && PLANT_SPECS['torch-ginger'].bloom.kind).toBe('torch');
});

it('places a plant at the height asked for, on leaf-shaded foliage the wind batcher can instance', () => {
  const kit = createSceneKit({ background: '#cfe0d6', fogNear: 100, fogFar: 400 });
  const tree = kit.plant('tembusu', 10, 5, 14, 2), herb = kit.plant('torch-ginger', 0, 0, 3);
  expect(tree.wood!.position.toArray()).toEqual([10, 2, 5]); expect(tree.model.height * tree.scale).toBeCloseTo(14, 5);
  expect(herb.wood).toBeUndefined(); expect(leafShade(herb.leaf.material as THREE.Material)).toBeDefined();
  expect(tree.leaf.userData.treePart.flutter).toBeGreaterThan(0); expect(tree.wood!.userData.treePart.flutter).toBe(0);
  const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
  world.dispose();
});
