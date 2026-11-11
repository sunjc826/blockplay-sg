import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mix, pointIn, type Pose, type SupplyStyle } from './fps-healing';
import { utilityMotion } from './fps-utility-motion';
import { smoothStep } from './fps-weapon-motion';
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
  Object.entries(items).forEach(([style, group]) => { group.name = `supply-${style}`; group.visible = false; root.add(group); });
  const food = createFoodViewmodel(root);
  // A fixed-width roll feeds a ribbon winding around the actual forearm.
  const gauze = material('#e3cfae', .95);
  const roll = mesh(items.bandage, new THREE.CylinderGeometry(.025, .025, .055, 18), gauze); roll.rotation.z = Math.PI / 2; roll.name = 'bandage-roll';
  const vertices: number[] = [], indices: number[] = [], segments = 144;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, angle = t * Math.PI * 6, radius = .047 + t * .002;
    for (const edge of [-1, 1]) vertices.push(Math.cos(angle) * radius, -.035 - t * .065 + edge * .014, Math.sin(angle) * radius);
    if (i < segments) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const ribbon = new THREE.BufferGeometry(); ribbon.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); ribbon.setIndex(indices); ribbon.computeVertexNormals();
  gauze.side = THREE.DoubleSide;
  const wrap = mesh(left.arm, ribbon, gauze); wrap.name = 'bandage-wrap'; wrap.visible = false;
  const dressing = box(left.arm, .055, .06, .009, material('#f1eee5'), 0, -.065, .039); dressing.name = 'dressing-pad'; dressing.visible = false;
  const wrapper = new THREE.Group(); wrapper.name = 'dressing-wrapper'; items.bandage.add(wrapper);
  const wrapperHalves = [-1, 1].map(side => box(wrapper, .04, .065, .006, material('#66704b'), side * .02, 0, 0));
  // Open pouches have walls and an interior, rather than a solid top beneath a lid.
  const pouchBody = (into: THREE.Object3D, w: number, h: number, d: number, cloth: THREE.Material) => {
    box(into, w, .008, d, cloth, 0, -h / 2, 0);
    for (const side of [-1, 1]) { box(into, .008, h, d, cloth, side * w / 2, 0, 0); box(into, w, h, .008, cloth, 0, 0, side * d / 2); }
    box(into, w - .01, .004, d - .01, material('#252920'), 0, -h / 2 + .006, 0);
  };
  const pouch = new THREE.Group(); items.medkit.add(pouch);
  const medicCloth = material('#9e3029', .85); pouchBody(pouch, .15, .06, .1, medicCloth);
  const lid = new THREE.Group(); lid.name = 'medical-lid'; lid.position.set(0, .03, -.05); pouch.add(lid);
  box(lid, .152, .012, .1, medicCloth, 0, 0, .05);
  box(lid, .05, .002, .014, material('#f2efe6'), 0, .007, .05); box(lid, .014, .002, .05, material('#f2efe6'), 0, .007, .05);
  const injector = new THREE.Group(); injector.name = 'medical-injector'; root.add(injector);
  mesh(injector, new THREE.CylinderGeometry(.011, .011, .09, 12), material('#d8dcd8', .4, .2), 0, .045, -.055).rotation.x = Math.PI / 2;
  const plunger = mesh(injector, new THREE.CylinderGeometry(.013, .013, .014, 10), material('#c9542e', .6), 0, .045, .003); plunger.rotation.x = Math.PI / 2; plunger.name = 'injector-plunger';
  mesh(injector, new THREE.CylinderGeometry(.004, .004, .014, 8), material('#7e8888', .4, .5), 0, .045, -.104).rotation.x = Math.PI / 2;
  const spray = new THREE.Group(); spray.name = 'antiseptic-spray'; root.add(spray);
  mesh(spray, new THREE.CylinderGeometry(.017, .017, .075, 14), material('#e1e8e8', .65), 0, .045, -.05).rotation.x = Math.PI / 2;
  mesh(spray, new THREE.CylinderGeometry(.0174, .0174, .024, 14), material('#326faa'), 0, .045, -.05).rotation.x = Math.PI / 2;
  const nozzle = box(spray, .014, .012, .025, material('#326faa'), 0, .045, -.101); nozzle.name = 'spray-nozzle';
  const mist = new THREE.Group(); mist.name = 'antiseptic-mist'; spray.add(mist);
  const mistMaterial = material('#e0edf0'); mistMaterial.transparent = true; mistMaterial.opacity = .35; mistMaterial.depthWrite = false;
  for (let i = 0; i < 9; i++) { const dot = mesh(mist, new THREE.SphereGeometry(.002, 6, 4), mistMaterial, Math.sin(i * 2.4) * .008, .045 + Math.cos(i * 2.4) * .008, -.12 - i * .004); dot.name = `mist-${i}`; }
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
  // Open the reserve pouch, lift a magazine, then seat it below the frame.
  const ammoCloth = material('#565c44', .9); pouchBody(items.ammo, .12, .09, .07, ammoCloth);
  const ammoLid = new THREE.Group(); ammoLid.name = 'ammo-pouch-flap'; ammoLid.position.set(0, .045, -.035); items.ammo.add(ammoLid);
  box(ammoLid, .13, .008, .08, ammoCloth, 0, 0, .04);
  const magazine = new THREE.Group(); magazine.name = 'supply-magazine'; root.add(magazine);
  box(magazine, .03, .11, .065, material('#2a2d2b', .55, .3), 0, .025, -.025);
  for (let i = 0; i < 3; i++) box(magazine, .031, .004, .056, material('#434942', .6), 0, i * .025, -.025);
  const place = (object: THREE.Object3D, p: Pose) => { object.position.set(p.x, p.y, p.z); object.rotation.set(p.rx, p.ry, p.rz); };
  let style: SupplyStyle | null = null;
  return {
    root,
    /** Shows `style` at `progress` (0..1) for the item `id`, or hides everything with null; the motion tells the engine where the weapon and view should be. */
    update(next: SupplyStyle | null, progress: number, id = '', aspect = 1) {
      root.visible = next !== null;
      // Move the whole supply rig back on narrow screens; preserve grips and proportions.
      root.position.z = next ? -.35 * (1 - Math.min(1, Math.max(.3, aspect) / .8)) : 0;
      if (style !== next) { Object.entries(items).forEach(([key, group]) => group.visible = key === next); style = next; }
      food.root.visible = next === 'eat';
      if (!next) return null;
      const utility = utilityMotion(next, progress, id);
      const motion = next === 'eat' ? food.update(id, progress) : utility;
      place(right.group, motion.right); place(left.group, motion.left); place(items[next], motion.item);
      right.setGrip(motion.rightGrip); left.setGrip(motion.leftGrip);
      right.group.visible = next !== 'plates';
      carrier.visible = !!motion.carrier; if (motion.carrier) place(carrier, motion.carrier);
      // Once seated it's behind the panel for good, so it goes away with the carrier rather than through it.
      if (next === 'plates') items.plates.visible = progress < .8;
      const p = Math.max(0, Math.min(1, progress));
      wrap.visible = next === 'bandage' && utility.treatment > 0;
      dressing.visible = next === 'bandage' && id === 'kit-dressing' && utility.unwrap >= 1;
      injector.visible = next === 'medkit' && id !== 'kit-first-aid' && p >= .27;
      spray.visible = next === 'medkit' && id === 'kit-first-aid' && p >= .27;
      magazine.visible = next === 'ammo' && p < .72;
      if (next === 'bandage') {
        gauze.color.set(id === 'kit-dressing' ? '#ebe7dc' : '#e3cfae');
        roll.visible = (id !== 'kit-dressing' || utility.unwrap >= 1) && p < .81;
        wrapper.visible = id === 'kit-dressing' && utility.unwrap < 1;
        wrapperHalves.forEach((half, i) => { half.position.x = (i ? 1 : -1) * (.02 + utility.unwrap * .05); half.rotation.y = (i ? 1 : -1) * utility.unwrap; });
        ribbon.setDrawRange(0, Math.floor(utility.treatment * segments) * 6);
      }
      if (next === 'medkit') {
        medicCloth.color.set(id === 'kit-first-aid' ? '#9e3029' : '#52603c');
        lid.rotation.x = -utility.open * 1.9;
        const inPouch = { ...motion.item, ...pointIn(motion.item, { x: .025, y: -.025, z: .055 }) };
        const tool = mix(inPouch, motion.right, smoothStep((p - .3) / .1));
        place(injector, tool); place(spray, tool);
        plunger.position.z = .003 - utility.treatment * .014;
        nozzle.position.y = .045 - utility.treatment * .004;
        mist.visible = utility.treatment > .2 && p < .8;
        mist.children.forEach((dot, i) => { dot.position.z = -.115 - ((p * 12 + i / 9) % 1) * .045; });
      }
      if (next === 'ammo') {
        ammoCloth.color.set(id === 'kit-ammo-refill' ? '#a18447' : '#565c44');
        ammoLid.rotation.x = -utility.open * 2;
        const inPouch = { ...motion.item, ...pointIn(motion.item, { x: .02, y: .025, z: .025 }) };
        place(magazine, mix(inPouch, motion.right, smoothStep((p - .3) / .07)));
        right.setGrip(p >= .72 ? .15 : .7);
      }
      return motion;
    },
    dispose() { food.dispose(); root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
