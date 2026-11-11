import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { supplyMotion, type Pose, type SupplyStyle } from './fps-healing';
import { createFoodViewmodel } from './fps-food-viewmodel';
import { createViewmodelHand } from './fps-viewmodel-hand';

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
  const right = createViewmodelHand(false, { glove, pad, sleeve, mesh }), left = createViewmodelHand(true, { glove, pad, sleeve, mesh });
  root.add(right.group, left.group);

  // Items, one group per style; only the one in use is shown.
  const items: Record<SupplyStyle, THREE.Group> = { eat: new THREE.Group(), bandage: new THREE.Group(), medkit: new THREE.Group(), plates: new THREE.Group(), ammo: new THREE.Group() };
  Object.values(items).forEach(group => { group.visible = false; root.add(group); });
  const food = createFoodViewmodel(root);
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
  // Plates: a shooter's-cut insert in its cover, as the store shows it, centred on its middle.
  const plateW = .25, plateH = .32, cut = .055, plateShape = new THREE.Shape();
  plateShape.moveTo(-plateW / 2, -plateH / 2); plateShape.lineTo(plateW / 2, -plateH / 2); plateShape.lineTo(plateW / 2, plateH / 2 - cut); plateShape.lineTo(plateW / 2 - cut, plateH / 2); plateShape.lineTo(-plateW / 2 + cut, plateH / 2); plateShape.lineTo(-plateW / 2, plateH / 2 - cut); plateShape.closePath();
  mesh(items.plates, new THREE.ExtrudeGeometry(plateShape, { depth: .016, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2 }), material('#2e3229', .9), 0, 0, -.008);
  box(items.plates, .14, .04, .002, material('#1f221c', .98), .02, -.04, .0115);
  box(items.plates, .07, .035, .002, material('#e6e2d2', .85), -.05, .07, .0115);
  for (let i = 0; i < 3; i++) box(items.plates, .05 * (i ? .7 : 1), .003, .0012, material('#33382a', .9), -.05, .08 - i * .008, .0128);
  // The carrier on the chest: its front panel, with the plate pocket's bound lip at the group's origin.
  const carrier = new THREE.Group(); carrier.visible = false; root.add(carrier);
  const cordura = material('#666d4b', .92), webbing = material('#474d38', .95);
  box(carrier, .33, .4, .026, cordura, 0, -.2, 0);
  box(carrier, .335, .018, .034, webbing, 0, -.002, 0);
  box(carrier, .15, .05, .004, material('#2c3125', .98), 0, -.06, .014);
  for (let row = 0; row < 3; row++) box(carrier, .3, .018, .005, webbing, 0, -.12 - row * .04, .014);
  for (const x of [-.135, -.045, .045, .135]) box(carrier, .008, .13, .0065, webbing, x, -.16, .015);
  // Ammunition: an open pouch and a magazine in the right hand.
  box(items.ammo, .12, .09, .07, material('#565c44', .9));
  const magazine = new THREE.Group(); root.add(magazine);
  box(magazine, .03, .11, .07, material('#2a2d2b', .55, .3)).rotation.x = .2;

  const place = (object: THREE.Object3D, p: Pose) => { object.position.set(p.x, p.y, p.z); object.rotation.set(p.rx, p.ry, p.rz); };
  let style: SupplyStyle | null = null;
  return {
    root,
    /** Shows `style` at `progress` (0..1) for the item `id`, or hides everything with null; the motion tells the engine where the weapon and view should be. */
    update(next: SupplyStyle | null, progress: number, id = '', aspect = 1) {
      root.visible = next !== null;
      // Move the whole eating rig back on narrow screens; preserve grips and proportions.
      root.position.z = next === 'eat' ? -.35 * (1 - Math.min(1, Math.max(.3, aspect) / .8)) : 0;
      if (style !== next) { Object.entries(items).forEach(([key, group]) => group.visible = key === next); style = next; }
      food.root.visible = next === 'eat';
      if (!next) return null;
      const motion = next === 'eat' ? food.update(id, progress) : supplyMotion(next, progress);
      place(right.group, motion.right); place(left.group, motion.left); place(items[next], motion.item);
      right.setGrip(motion.rightGrip); left.setGrip(motion.leftGrip);
      right.group.visible = next !== 'plates';
      carrier.visible = !!motion.carrier; if (motion.carrier) place(carrier, motion.carrier);
      // Once seated it's behind the panel for good, so it goes away with the carrier rather than through it.
      if (next === 'plates') items.plates.visible = progress < .8;
      wrap.visible = next === 'bandage' && motion.action > .02;
      injector.visible = next === 'medkit'; magazine.visible = next === 'ammo';
      if (next === 'bandage') {
        roll.scale.set(1, .5 + motion.remaining * .5, .5 + motion.remaining * .5);
        place(wrap, { ...motion.left, z: motion.left.z + .1, y: motion.left.y - .05 });
        wrap.rotation.set(motion.left.rx + Math.PI / 2, 0, 0); wrap.scale.set(1, Math.max(.05, motion.action), 1);
      }
      if (next === 'medkit') { lid.rotation.x = -motion.action * 1.9; place(injector, { ...motion.right, z: motion.right.z - .06 }); }
      if (next === 'ammo') place(magazine, { ...motion.right, y: motion.right.y + .05 });
      return motion;
    },
    dispose() { food.dispose(); root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
