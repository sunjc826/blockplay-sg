import * as THREE from 'three';
import { createModelKit } from './supply-model-kit';

/**
 * The field utilities and medical supplies in the catalogue as themselves, at
 * real size in metres, resting on y = 0 and centred over the origin: what the
 * store shows. Built from the same kit as `food-models`.
 */
export const UTILITY_MODEL_IDS = ['kit-ammo', 'kit-bandage', 'kit-dressing', 'kit-plates', 'kit-first-aid', 'kit-trauma'] as const;
export type UtilityModelId = typeof UTILITY_MODEL_IDS[number];

export const isUtilityModelId = (id: string): id is UtilityModelId => (UTILITY_MODEL_IDS as readonly string[]).includes(id);

export function buildUtilityModel(id: string) {
  if (!isUtilityModelId(id)) return null;
  const { body, material, mesh, box, cylinder, random, finish } = createModelKit(`utility-${id}`, id);
  const olive = material('#4f5639', .9), webbing = material('#4a5038', .95), black = material('#1f2220', .7), steel = material('#a7adab', .35, .7);
  // A loose 5.56 round: brass case, copper-jacketed point.
  const round = (x: number, z: number, yaw: number) => {
    const g = new THREE.Group(); g.position.set(x, .0045, z); g.rotation.set(0, yaw, Math.PI / 2); body.add(g);
    cylinder(g, .0045, .0048, .045, material('#c9a24a', .3, .75), 0, 0, 0, 12);
    cylinder(g, .0045, .0045, .002, material('#9c7a30', .4, .7), 0, -.023, 0, 12);
    mesh(g, new THREE.ConeGeometry(.0042, .018, 12), material('#b06a3a', .35, .6), 0, .031, 0);
  };
  // Stencilled lines on a printed label.
  const lines = (into: THREE.Object3D, x: number, y: number, z: number, width: number, count: number) => {
    for (let i = 0; i < count; i++) box(into, width * (i ? .55 + random() * .4 : 1), .0012, .003, material('#2c3024', .9), x, y, z - .012 + i * .007, .1);
  };
  // A cross on a square patch, lying flat at its position; turn the group to put it on a face.
  const cross = (into: THREE.Object3D, size: number, x: number, y: number, z: number, field: THREE.Material, mark: THREE.Material) => {
    const g = new THREE.Group(); g.position.set(x, y, z); into.add(g);
    box(g, size, .002, size, field, 0, 0, 0, .1);
    box(g, size * .7, .0025, size * .22, mark, 0, .0005, 0, .1); box(g, size * .22, .0025, size * .7, mark, 0, .0005, 0, .1);
    return g;
  };

  switch (id) {
    case 'kit-ammo': {
      // An olive magazine pouch with its flap and buckle, webbing loops on the back.
      const pouch = new THREE.Group(); pouch.rotation.y = -.35; body.add(pouch);
      box(pouch, .085, .13, .055, olive, 0, .065, 0, .15);
      const flap = box(pouch, .09, .045, .062, olive, 0, .125, .002, .2); flap.rotation.x = -.08;
      box(pouch, .03, .02, .01, black, 0, .1, .033, .2);
      box(pouch, .022, .03, .004, webbing, 0, .118, .031, .2);
      for (let i = 0; i < 3; i++) box(pouch, .089, .012, .006, webbing, 0, .03 + i * .032, -.029, .2);
      box(pouch, .087, .004, .057, material('#4d5339', .95), 0, .004, 0, .2);
      // A magazine out of it on its side, and loose rounds.
      const magazine = new THREE.Group(); magazine.position.set(.1, .0125, .03); magazine.rotation.y = .4; body.add(magazine);
      box(magazine, .09, .025, .062, material('#2a2d2b', .55, .3), 0, 0, 0, .15);
      for (let i = 0; i < 5; i++) box(magazine, .004, .026, .05, material('#353937', .5, .3), -.032 + i * .016, 0, 0, .2);
      box(magazine, .012, .026, .066, material('#1d1f1e', .6, .2), -.05, 0, 0, .2);
      round(.05, .1, .3); round(.075, .11, .9); round(.03, .125, -.4);
      break;
    }
    case 'kit-bandage': {
      // A crepe roll on its side, the wound layers on its end faces, the tail run out with its clips.
      const crepe = material('#e3cfae', .95), layer = material('#c9b28c', .95);
      const roll = new THREE.Group(); roll.position.set(0, .03, -.03); body.add(roll);
      cylinder(roll, .03, .03, .075, crepe, 0, 0, 0, 28).rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) for (const r of [.008, .014, .02, .026]) { const ring = mesh(roll, new THREE.TorusGeometry(r, .0007, 4, 28), layer, side * .0376, 0, 0); ring.rotation.y = Math.PI / 2; }
      cylinder(roll, .004, .004, .0754, layer, 0, 0, 0, 10).rotation.z = Math.PI / 2;
      box(body, .075, .002, .1, crepe, 0, .001, .06, .3);
      for (let i = 0; i < 6; i++) box(body, .074, .0022, .002, layer, 0, .0012, .02 + i * .016, .1);
      for (const x of [-.018, .018]) { box(body, .014, .003, .02, steel, x, .003, .1, .2); for (let t = 0; t < 3; t++) box(body, .003, .004, .006, steel, x - .004 + t * .004, .004, .113, .2); }
      break;
    }
    case 'kit-dressing': {
      // One sealed in its olive vacuum pack, and one opened: the white pad with its elastic tails.
      const pack = new THREE.Group(); pack.position.set(-.06, 0, -.02); pack.rotation.y = .25; body.add(pack);
      box(pack, .13, .022, .095, material('#5f6747', .35), 0, .011, 0, .3);
      box(pack, .085, .0012, .055, material('#d8d4bf', .9), 0, .0226, 0, .1);
      lines(pack, 0, .0236, 0, .065, 4);
      for (const x of [-.066, .066]) box(pack, .006, .016, .09, material('#525a3d', .4), x, .011, 0, .2);
      const pad = new THREE.Group(); pad.position.set(.07, 0, .04); pad.rotation.y = -.5; body.add(pad);
      box(pad, .085, .012, .065, material('#f2f0e8', .95), 0, .006, 0, .3);
      const tail = material('#56603f', .9);
      for (const side of [-1, 1]) { const strap = box(pad, .11, .002, .022, tail, side * .095, .002, side * .008, .2); strap.rotation.y = side * .12; }
      break;
    }
    case 'kit-plates': {
      // Two shooter's-cut inserts in their covers, stood up and fanned, the front one leaning back on the other.
      const w = .25, h = .32, cut = .055, shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h - cut); shape.lineTo(w / 2 - cut, h); shape.lineTo(-w / 2 + cut, h); shape.lineTo(-w / 2, h - cut); shape.lineTo(-w / 2, 0);
      const cover = material('#3a4030', .9), label = material('#e6e2d2', .85), velcro = material('#2c3125', .98);
      const plate = (into: THREE.Object3D) => {
        mesh(into, new THREE.ExtrudeGeometry(shape, { depth: .016, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2 }), cover);
        box(into, .07, .035, .002, label, -.05, .23, .0195, .1);
        for (let i = 0; i < 3; i++) box(into, .05 * (i ? .7 : 1), .003, .0012, material('#33382a', .9), -.05, .24 - i * .008, .0207, .1);
        box(into, .14, .04, .002, velcro, .02, .12, .0195, .1);
      };
      const back = new THREE.Group(); back.rotation.set(-.1, -.18, 0); back.position.set(.05, 0, -.05); body.add(back); plate(back);
      const front = new THREE.Group(); front.rotation.set(-.24, .08, 0); front.position.set(-.03, 0, .04); body.add(front); plate(front);
      break;
    }
    case 'kit-first-aid': {
      // A zipped red pouch with its cross, an antiseptic spray and a gauze packet beside it.
      const pouch = new THREE.Group(); pouch.position.set(-.04, 0, 0); pouch.rotation.y = .2; body.add(pouch);
      box(pouch, .17, .065, .12, material('#b0322a', .85), 0, .0325, 0, .35);
      box(pouch, .172, .006, .122, material('#2a2725', .6), 0, .034, 0, .3);
      for (const x of [-.03, .045]) { box(pouch, .012, .004, .006, steel, x, .034, .063, .2); box(pouch, .006, .016, .003, black, x, .026, .066, .2); }
      cross(pouch, .05, 0, .066, 0, material('#f1efe8', .8), material('#b0322a', .85));
      const spray = new THREE.Group(); spray.position.set(.1, 0, -.03); body.add(spray);
      cylinder(spray, .018, .018, .1, material('#eef0f0', .3, .2), 0, .05, 0, 20);
      cylinder(spray, .0182, .0182, .03, material('#2f62b0', .5), 0, .055, 0, 20);
      cylinder(spray, .015, .017, .02, material('#d9dde0', .4, .3), 0, .11, 0, 16);
      box(spray, .008, .008, .012, material('#2f62b0', .5), 0, .123, .006, .2);
      const gauze = new THREE.Group(); gauze.position.set(.07, 0, .085); gauze.rotation.y = -.35; body.add(gauze);
      box(gauze, .075, .006, .075, material('#f6f6f2', .7), 0, .003, 0, .2);
      box(gauze, .075, .0065, .012, material('#3a74c4', .6), 0, .003, -.02, .1);
      break;
    }
    case 'kit-trauma': {
      // The medic's pack standing up, cross on its front pocket, with an autoinjector and a tourniquet in front.
      const pack = new THREE.Group(); pack.position.set(-.02, 0, -.04); body.add(pack);
      const cordura = material('#4e553b', .9);
      box(pack, .26, .17, .1, cordura, 0, .085, 0, .2);
      box(pack, .2, .1, .03, cordura, 0, .065, .062, .25);
      box(pack, .202, .005, .032, black, 0, .113, .062, .2);
      cross(pack, .055, 0, .075, .078, material('#f1efe8', .8), material('#c32f27', .6)).rotation.x = Math.PI / 2;
      for (const x of [-.14, .14]) box(pack, .025, .11, .07, cordura, x, .06, 0, .3);
      box(pack, .262, .006, .102, black, 0, .17, 0, .2);
      const handle = mesh(pack, new THREE.TorusGeometry(.035, .006, 6, 16, Math.PI), webbing, 0, .172, 0); handle.scale.y = .6;
      for (const x of [-.07, .07]) box(pack, .04, .16, .006, webbing, x, .085, -.053, .2);
      const injector = new THREE.Group(); injector.position.set(-.04, .011, .1); injector.rotation.y = .3; body.add(injector);
      cylinder(injector, .011, .011, .12, material('#d8dcd8', .4, .2), 0, 0, 0, 14).rotation.z = Math.PI / 2;
      cylinder(injector, .0115, .0115, .025, material('#d9662e', .55), .06, 0, 0, 14).rotation.z = Math.PI / 2;
      box(injector, .05, .0012, .016, material('#f0c94a', .7), -.02, .011, 0, .1);
      const tourniquet = new THREE.Group(); tourniquet.position.set(.09, .004, .1); body.add(tourniquet);
      const loop = mesh(tourniquet, new THREE.TorusGeometry(.04, .006, 4, 28), material('#1e1e1e', .85)); loop.rotation.x = Math.PI / 2; loop.scale.set(1, 1, .5);
      box(tourniquet, .045, .008, .01, material('#c33a2a', .6), 0, .006, 0, .3);
      break;
    }
  }
  return finish(true);
}
