import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { supplyMotion, type Pose, type SupplyStyle } from './fps-healing';
import { FOOD_MODEL_IDS, buildFoodModel } from './food-models';

/**
 * The hands and the supply they hold, drawn in the viewmodel scene beside the
 * weapon while a supply is in use. Rigid, procedural meshes posed straight from
 * `supplyMotion`, like the reload hands in `fps-viewmodel`: no clips, no
 * skinning, nothing loaded.
 */
export function createSupplyViewmodel(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'fps-supply'; root.visible = false; parent.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string, roughness = .8, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.push(m); return m; };
  const glove = material('#474b39'), pad = material('#202722'), sleeve = material('#626a50');
  const mesh = (into: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); into.add(object); return object;
  };
  const box = (into: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(into, new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * .2), m, x, y, z);
  // A gloved hand closed round something held in front of it, with its sleeve.
  const hand = (left: boolean) => {
    const group = new THREE.Group(); root.add(group);
    box(group, .07, .08, .05, glove);
    for (let i = 0; i < 4; i++) box(group, .014, .042, .02, glove, -.024 + i * .016, .03, -.03);
    box(group, .05, .03, .01, pad, 0, .01, .028);
    const thumb = box(group, .02, .045, .026, glove, left ? .036 : -.036, .004, -.02); thumb.rotation.z = left ? -.6 : .6;
    mesh(group, new THREE.CylinderGeometry(.036, .048, .2, 8), sleeve, 0, -.15, .04).rotation.x = -.3;
    return group;
  };
  const right = hand(false), left = hand(true);

  // Items, one group per style; only the one in use is shown.
  const items: Record<SupplyStyle, THREE.Group> = { eat: new THREE.Group(), bandage: new THREE.Group(), medkit: new THREE.Group(), plates: new THREE.Group(), ammo: new THREE.Group() };
  Object.values(items).forEach(group => { group.visible = false; root.add(group); });
  // Food: the item itself (food-models), shrinking with every bite; a plain packed meal for anything else.
  const food = new THREE.Group(); items.eat.add(food);
  const models = FOOD_MODEL_IDS.map(foodId => buildFoodModel(foodId, 'held')!);
  const foods = new Map<string, THREE.Object3D>(models.map((model, i) => [FOOD_MODEL_IDS[i], model.root]));
  const packet = new THREE.Group(); box(packet, .11, .05, .09, material('#b48a5a', .95)); box(packet, .112, .006, .03, material('#e9e2cf', .9), 0, .026, 0);
  foods.set('', packet); foods.forEach(g => food.add(g));
  // Dressing: a roll in the hand and the wrap growing round the left forearm.
  const gauze = material('#ebe7dc', .95);
  const roll = mesh(items.bandage, new THREE.CylinderGeometry(.03, .03, .065, 14), gauze); roll.rotation.z = Math.PI / 2;
  const wrap = mesh(root, new THREE.CylinderGeometry(.05, .052, .14, 14, 1, true), gauze); wrap.visible = false;
  // Medic pack: pouch with a hinged lid and a white cross, and an injector.
  const pouch = new THREE.Group(); items.medkit.add(pouch);
  box(pouch, .15, .06, .1, material('#6b2a26', .85));
  const lid = new THREE.Group(); lid.position.set(0, .03, .05); pouch.add(lid);
  box(lid, .152, .012, .1, material('#7b322c', .85), 0, 0, -.05);
  box(lid, .05, .002, .014, material('#f2efe6'), 0, .007, -.05); box(lid, .014, .002, .05, material('#f2efe6'), 0, .007, -.05);
  const injector = new THREE.Group(); root.add(injector);
  mesh(injector, new THREE.CylinderGeometry(.011, .011, .11, 10), material('#d8dcd8', .4, .2)).rotation.x = Math.PI / 2;
  mesh(injector, new THREE.CylinderGeometry(.013, .013, .02, 10), material('#c9542e', .6), 0, 0, .05).rotation.x = Math.PI / 2;
  // Plates: a ceramic insert.
  box(items.plates, .25, .3, .022, material('#3c403c', .7, .1));
  box(items.plates, .2, .24, .002, material('#55594f', .8), 0, 0, .012);
  // Ammunition: an open pouch and a magazine in the right hand.
  box(items.ammo, .12, .09, .07, material('#565c44', .9));
  const magazine = new THREE.Group(); root.add(magazine);
  box(magazine, .03, .11, .07, material('#2a2d2b', .55, .3)).rotation.x = .2;

  const place = (object: THREE.Object3D, p: Pose) => { object.position.set(p.x, p.y, p.z); object.rotation.set(p.rx, p.ry, p.rz); };
  let style: SupplyStyle | null = null;
  return {
    root,
    /** Shows `style` at `progress` (0..1) for the item `id`, or hides everything with null. */
    update(next: SupplyStyle | null, progress: number, id = '') {
      root.visible = next !== null;
      if (style !== next) { Object.entries(items).forEach(([key, group]) => group.visible = key === next); style = next; }
      if (!next) return 0;
      const motion = supplyMotion(next, progress);
      place(right, motion.right); place(left, motion.left); place(items[next], motion.item);
      wrap.visible = next === 'bandage' && motion.action > .02;
      injector.visible = next === 'medkit'; magazine.visible = next === 'ammo';
      if (next === 'eat') {
        const kind = foods.has(id) ? id : '';
        foods.forEach((g, key) => g.visible = key === kind);
        food.scale.set(motion.remaining, 1, .4 + motion.remaining * .6);
      }
      if (next === 'bandage') {
        roll.scale.set(1, .5 + motion.remaining * .5, .5 + motion.remaining * .5);
        place(wrap, { ...motion.left, z: motion.left.z + .1, y: motion.left.y - .05 });
        wrap.rotation.set(motion.left.rx + Math.PI / 2, 0, 0); wrap.scale.set(1, Math.max(.05, motion.action), 1);
      }
      if (next === 'medkit') { lid.rotation.x = -motion.action * 1.9; place(injector, { ...motion.right, z: motion.right.z - .06 }); }
      if (next === 'ammo') place(magazine, { ...motion.right, y: motion.right.y + .05 });
      return motion.weaponDown;
    },
    dispose() { models.forEach(model => model.dispose()); root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
