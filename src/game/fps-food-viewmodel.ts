import * as THREE from 'three';
import { FOOD_MODEL_IDS, buildFoodModel, isFoodModelId } from './food-models';
import { createModelKit } from './supply-model-kit';
import { foodMotion } from './fps-food-motion';
import type { Pose } from './fps-healing';

const place = (object: THREE.Object3D, p: Pose) => { object.position.set(p.x, p.y, p.z); object.rotation.set(p.rx, p.ry, p.rz); };

/** Food, working cutlery and drinks have separate rigid anchors; the hands follow those anchors. */
export function createFoodViewmodel(parent: THREE.Object3D) {
  const kit = createModelKit('fps-food-tools');
  const { root, body, material, box, ball, cylinder } = kit; parent.add(root);
  const models = FOOD_MODEL_IDS.map(id => buildFoodModel(id, 'held')!);
  const drinks = models.map(model => {
    const holder = new THREE.Group(); holder.name = 'food-drink'; root.add(holder);
    if (model.drink) {
      holder.add(model.drink); model.drink.position.set(0, -.045, 0);
      // Removing the side drink leaves the meal centred over its support hand.
      const content = model.root.children[0]; content.position.set(0, 0, 0);
      model.root.updateMatrixWorld(true);
      content.position.copy(new THREE.Box3().setFromObject(content).getCenter(new THREE.Vector3()).negate());
    }
    return holder;
  });
  models.forEach(model => root.add(model.root));
  const spoon = new THREE.Group(); spoon.name = 'food-spoon'; body.add(spoon);
  const steel = material('#c7d0cc', .3, .5);
  // Grip at the hand, bowl at the far end, level while the food is carried.
  box(spoon, .009, .004, .095, steel, 0, .04, -.02);
  ball(spoon, .017, steel, 0, .04, -.077, .8, .2, 1.3);
  const spoonful = ball(spoon, .012, material('#dfc18b'), 0, .044, -.077, .8, .45, 1.1);
  const sticks = new THREE.Group(); sticks.name = 'food-chopsticks'; body.add(sticks);
  const tips = [-1, 1].map(side => {
    const pivot = new THREE.Group(); sticks.add(pivot); pivot.position.set(side * .008, .04, 0);
    const stick = cylinder(pivot, .0015, .003, .17, material('#c8a16b'), 0, 0, -.045, 8); stick.rotation.x = Math.PI / 2;
    return pivot;
  });
  const morsel = box(sticks, .017, .012, .016, material('#dba666'), 0, .04, -.115);
  const assets = kit.finish(false); body.position.set(0, 0, 0);
  return {
    root,
    update(id: string, progress: number) {
      root.visible = true;
      // Future uncatalogued food falls back to an opening rice packet.
      const resolved = FOOD_MODEL_IDS.indexOf(isFoodModelId(id) ? id : 'food-chicken-rice');
      const motion = foodMotion(FOOD_MODEL_IDS[resolved], progress);
      models.forEach((model, i) => {
        model.root.visible = i === resolved;
        drinks[i].visible = i === resolved && !!model.drink;
      });
      const model = models[resolved]; model.animate(motion); place(model.root, motion.item);
      place(drinks[resolved], motion.drink);
      spoon.visible = motion.tool === 'spoon' && motion.open > .95 && (FOOD_MODEL_IDS[resolved] !== 'food-field-ration' || progress < .59);
      sticks.visible = motion.tool === 'chopsticks';
      place(spoon, motion.utensil); place(sticks, motion.utensil);
      spoon.rotation.y += Math.PI / 2; sticks.rotation.y += Math.PI / 2;
      // Food leaves the spoon/tips at the same contact that removes a portion from the meal.
      const loaded = motion.loaded;
      spoonful.visible = loaded; morsel.visible = loaded;
      tips.forEach((tip, i) => { tip.rotation.y = (i ? -1 : 1) * (.06 + (1 - motion.lift) * .13); });
      return motion;
    },
    dispose() { models.forEach(model => model.dispose()); assets.dispose(); },
  };
}
