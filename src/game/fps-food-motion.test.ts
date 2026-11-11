import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FOOD_MODEL_IDS } from './food-models';
import { foodMotion } from './fps-food-motion';
import { createSupplyViewmodel } from './fps-supply-viewmodel';

const snapshot = (root: THREE.Object3D) => {
  const result: unknown[] = [];
  root.traverse(n => result.push([n.name, n.visible, n.position.toArray(), n.rotation.toArray(), n.scale.toArray()]));
  return result;
};
describe('food consumption choreography', () => {
  it.each(FOOD_MODEL_IDS)('%s has finite, continuous motion and keeps its physical size', id => {
    let previous = foodMotion(id, 0), bites = 0;
    for (let i = 0; i <= 1000; i++) {
      const motion = foodMotion(id, i / 1000);
      expect(motion.remaining).toBe(1);
      expect(motion.bites).toBeGreaterThanOrEqual(bites); bites = motion.bites;
      for (const key of ['right', 'left', 'item', 'utensil', 'drink'] as const) {
        expect(Object.values(motion[key]).every(Number.isFinite)).toBe(true);
        for (const axis of ['x', 'y', 'z'] as const) expect(Math.abs(motion[key][axis] - previous[key][axis])).toBeLessThan(.025);
      }
      previous = motion;
    }
    expect(bites).toBeGreaterThanOrEqual(2);
    for (const p of [0, 1]) { const m = foodMotion(id, p); expect(m.right.y).toBeLessThan(-.5); expect(m.left.y).toBeLessThan(-.5); }
  });
  it('uses cutlery for meals and independent drinks for the two drink sets', () => {
    expect(foodMotion('food-mala-da-la', .4).tool).toBe('chopsticks');
    expect(foodMotion('food-chicken-rice', .4).tool).toBe('spoon');
    expect(foodMotion('food-curry-puff', .4).tool).toBe('none');
    for (const id of ['food-field-ration', 'food-smoking-corner']) expect(foodMotion(id, .71).sip).toBe(1);
    expect(foodMotion('food-ah-ma-tingkat', .8).bites).toBe(4);
  });
  it('resets every food after cancellation, switching supplies and replay without scaling containers', () => {
    const scene = new THREE.Scene(), view = createSupplyViewmodel(scene);
    for (const id of FOOD_MODEL_IDS) {
      view.update('eat', .12, id); const before = snapshot(view.root.getObjectByName('fps-food-tools')!);
      for (const p of [.4, .7, 1]) view.update('eat', p, id);
      view.update(null, 0); expect(view.root.visible).toBe(false);
      view.update('bandage', .5); expect(view.root.getObjectByName('fps-food-tools')!.visible).toBe(false);
      view.update('eat', .12, id); expect(snapshot(view.root.getObjectByName('fps-food-tools')!)).toEqual(before);
      expect(view.root.getObjectByName(`food-held-${id}`)!.scale.toArray()).toEqual([1, 1, 1]);
    }
    view.dispose(); expect(scene.children).toHaveLength(0);
  });
});
