import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG } from './armory-catalog';
import { FOOD_MODEL_IDS, buildFoodModel } from './food-models';

const bounds = (object: THREE.Object3D) => { object.updateMatrixWorld(true); return new THREE.Box3().setFromObject(object); };

describe('food models', () => {
  it('covers every food in the catalogue and nothing else', () => {
    const foods = ARMORY_CATALOG.filter(item => item.category === 'consumable' && item.supplyType === 'food').map(item => item.id);
    expect([...FOOD_MODEL_IDS].sort()).toEqual([...foods].sort());
    expect(buildFoodModel('kit-trauma')).toBeNull();
  });

  it.each(FOOD_MODEL_IDS)('%s is hand-sized when held and rests on the ground as a set', id => {
    const held = buildFoodModel(id, 'held')!, set = buildFoodModel(id, 'set')!;
    const hand = bounds(held.root), order = bounds(set.root);
    // Held: centred on the grip, small enough to sit between two hands.
    expect(hand.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
    expect(Math.max(...hand.getSize(new THREE.Vector3()).toArray())).toBeLessThan(.25);
    // Set: base on y = 0, centred over the origin, fits on a 36 × 27 cm hawker tray.
    expect(order.min.y).toBeCloseTo(0, 6);
    const centre = order.getCenter(new THREE.Vector3()), size = order.getSize(new THREE.Vector3());
    expect(Math.hypot(centre.x, centre.z)).toBeLessThan(1e-6);
    expect(Math.max(size.x, size.z)).toBeLessThan(.36);
    expect(size.y).toBeGreaterThan(.01);
    let meshes = 0; set.root.traverse(node => { if (node instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBeGreaterThan(3);
    held.dispose(); set.dispose();
    expect(set.root.parent).toBeNull();
  });
});
