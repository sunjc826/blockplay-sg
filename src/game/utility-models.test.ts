import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG } from './armory-catalog';
import { UTILITY_MODEL_IDS, buildUtilityModel } from './utility-models';

describe('utility models', () => {
  it('covers every medical supply and field utility the store sells', () => {
    const kits = ARMORY_CATALOG.filter(item => item.category === 'consumable' && (item.supplyType === 'medical' || item.supplyType === 'field-utility') && item.id.startsWith('kit-')).map(item => item.id);
    expect([...UTILITY_MODEL_IDS].sort()).toEqual([...kits].sort());
    expect(buildUtilityModel('food-curry-puff')).toBeNull();
  });

  it.each(UTILITY_MODEL_IDS)('%s rests on the ground at a plausible size', id => {
    const model = buildUtilityModel(id)!;
    model.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.root), centre = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(Math.hypot(centre.x, centre.z)).toBeLessThan(1e-6);
    // A pouch is a few centimetres; a pair of inserts is the largest, under half a metre.
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(.08);
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(.5);
    let meshes = 0; model.root.traverse(node => { if (node instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBeGreaterThan(4);
    model.dispose();
    expect(model.root.parent).toBeNull();
  });
});
