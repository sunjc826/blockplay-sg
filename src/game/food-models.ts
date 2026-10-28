import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * The food in the catalogue as itself, built from primitives at real size in
 * metres, like the supply hands in `fps-supply-viewmodel`: nothing loaded.
 *
 * `held` is the one thing a hand closes round, centred on the origin for the
 * viewmodel. `set` is the whole order as the stall hands it over (the toast
 * with its kopi and eggs, the bowl with its youtiao), resting on y = 0 and
 * centred over the origin, for a tray or the ground.
 */
export type FoodServing = 'held' | 'set';

export const FOOD_MODEL_IDS = [
  'food-kaya-toast', 'food-curry-puff', 'food-chicken-rice', 'food-bak-kut-teh',
  'food-field-ration', 'food-mala-da-la', 'food-ah-ma-tingkat', 'food-smoking-corner',
] as const;
export type FoodModelId = typeof FOOD_MODEL_IDS[number];

export const isFoodModelId = (id: string): id is FoodModelId => (FOOD_MODEL_IDS as readonly string[]).includes(id);

export function buildFoodModel(id: string, serving: FoodServing = 'set') {
  if (!isFoodModelId(id)) return null;
  const root = new THREE.Group(), body = new THREE.Group(); root.name = `food-${serving}-${id}`; root.add(body);
  const geometries: THREE.BufferGeometry[] = [], materials = new Map<string, THREE.Material>();
  const material = (color: string, roughness = .8, metalness = 0, opacity = 1) => {
    const key = `${color}|${roughness}|${metalness}|${opacity}`; let m = materials.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); materials.set(key, m); }
    return m;
  };
  const glow = (color: string) => { const key = `glow|${color}`; let m = materials.get(key); if (!m) { m = new THREE.MeshBasicMaterial({ color }); materials.set(key, m); } return m; };
  const mesh = (into: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); into.add(object); return object;
  };
  const box = (into: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, round = .2) =>
    mesh(into, new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * round), m, x, y, z);
  const cylinder = (into: THREE.Object3D, top: number, bottom: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, segments = 18) =>
    mesh(into, new THREE.CylinderGeometry(top, bottom, h, segments), m, x, y, z);
  const ball = (into: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const object = mesh(into, new THREE.SphereGeometry(r, 10, 8), m, x, y, z); object.scale.set(sx, sy, sz); return object;
  };
  // A dome of something heaped, its base at y.
  const dome = (into: THREE.Object3D, r: number, height: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const object = mesh(into, new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z); object.scale.y = height / r; return object;
  };
  // Where a scattered piece sits: the same every time for the same item.
  let seed = 0; for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const set = serving === 'set';

  // Crockery and the things that come with an order.
  const china = material('#f1eee6', .35);
  const plate = (into: THREE.Object3D, r: number, x = 0, z = 0) => { cylinder(into, r, r * .78, .008, china, x, .004, z, 24); return .008; };
  // A rice bowl from the side: foot, flared wall, a blue band under the rim, and what is in it as a disc.
  const bowl = (into: THREE.Object3D, r: number, h: number, inside: THREE.Material, x = 0, z = 0, wall = china, band = material('#2f5e9e', .4)) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); into.add(g);
    cylinder(g, r * .5, r * .48, .008, wall, 0, .004, 0, 20);
    cylinder(g, r, r * .58, h, wall, 0, .006 + h / 2, 0, 24);
    cylinder(g, r * 1.004, r * .97, h * .1, band, 0, .006 + h * .88, 0, 24);
    cylinder(g, r * .94, r * .94, .003, inside, 0, .006 + h * .86, 0, 24);
    return { group: g, surface: .006 + h * .86 + .0015 };
  };
  const spoon = (into: THREE.Object3D, m: THREE.Material, x: number, z: number, yaw: number, y = .004) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; into.add(g);
    box(g, .07, .004, .011, m, .035, .006, 0); ball(g, .016, m, -.008, .006, 0, 1.2, .3, .8);
  };
  const chopsticks = (into: THREE.Object3D, x: number, z: number, yaw: number) => {
    const wood = material('#c9a46b', .7);
    for (const dz of [-.006, .006]) { const stick = cylinder(into, .0022, .0035, .22, wood, x, .004, z + dz, 6); stick.rotation.set(0, yaw, Math.PI / 2); }
  };

  switch (id) {
    case 'food-kaya-toast': {
      // Two slices with kaya and a cold slab of butter between them.
      const sandwich = (into: THREE.Object3D, x: number, y: number, z: number, yaw: number) => {
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; into.add(g);
        const crust = material('#9c5a28', .95), crumb = material('#d79b52', .9), char = material('#6b3a1c', .95);
        for (const sy of [.0065, .025]) {
          box(g, .095, .012, .085, crust, 0, sy, 0, .3);
          box(g, .087, .0128, .077, crumb, 0, sy, 0, .1);
          for (let i = 0; i < 3; i++) box(g, .08, .0131, .004, char, 0, sy, -.024 + i * .024, .1);
        }
        box(g, .09, .004, .08, material('#7c6a26', .45), 0, .0145, 0, .3);
        box(g, .052, .006, .034, material('#f2de92', .55), .018, .0165, .012, .2);
        return g;
      };
      if (!set) { sandwich(body, 0, 0, 0, 0); break; }
      plate(body, .1);
      sandwich(body, -.012, .008, .01, .2); sandwich(body, .02, .02, -.022, -.35);
      // Kopi in the green-banded kopitiam cup, on its saucer.
      const cup = new THREE.Group(); cup.position.set(.17, 0, -.02); body.add(cup);
      cylinder(cup, .062, .05, .007, china, 0, .0035, 0, 24);
      cylinder(cup, .037, .028, .058, china, 0, .036, 0, 20);
      cylinder(cup, .0373, .036, .007, material('#3f7a52', .45), 0, .056, 0, 20);
      cylinder(cup, .034, .034, .002, material('#5a3820', .25), 0, .059, 0, 20);
      const handle = mesh(cup, new THREE.TorusGeometry(.014, .0045, 6, 12, Math.PI * 1.2), china, .038, .038, 0); handle.rotation.z = -Math.PI * .6;
      // Two soft-boiled eggs, cracked into a saucer under dark soy and pepper.
      const eggs = new THREE.Group(); eggs.position.set(.12, 0, .1); body.add(eggs);
      cylinder(eggs, .05, .036, .016, china, 0, .008, 0, 20);
      cylinder(eggs, .044, .044, .002, material('#3a2214', .2), 0, .015, 0, 20);
      for (const [x, z] of [[-.014, .006], [.016, -.008]]) { ball(eggs, .02, material('#f1ebdc', .2, 0, .9), x, .016, z, 1, .3, 1); ball(eggs, .009, material('#f0a52c', .25), x, .019, z, 1, .7, 1); }
      for (let i = 0; i < 6; i++) ball(eggs, .0015, material('#2a2420', .9), (random() - .5) * .05, .0175, (random() - .5) * .05);
      break;
    }
    case 'food-curry-puff': {
      // A half-moon of pastry with the rope of the crimped edge round its curve.
      const puff = (into: THREE.Object3D, x: number, z: number, yaw: number) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; into.add(g);
        const lie = new THREE.Group(); lie.rotation.x = -Math.PI / 2; lie.position.y = .012; g.add(lie);
        const r = .05, shape = new THREE.Shape(); shape.moveTo(r, 0); shape.absarc(0, 0, r, 0, Math.PI, false); shape.lineTo(r, 0);
        const pastry = mesh(lie, new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: true, bevelThickness: .011, bevelSize: .01, bevelSegments: 4, curveSegments: 20 }), material('#d99a46', .7));
        pastry.position.y = .004;
        for (let i = 0; i <= 13; i++) {
          const a = i / 13 * Math.PI, rope = ball(lie, .008, material('#c47f35', .7), Math.cos(a) * (r + .012), .004 + Math.sin(a) * (r + .012), .006, .55, 1, .6);
          rope.rotation.z = a + .7;
        }
        // A few browned blisters on the top.
        for (let i = 0; i < 5; i++) ball(lie, .004, material('#b06a28', .75), (random() - .5) * .06, .012 + random() * .026, .024, 1, 1, .25);
        return g;
      };
      // In the hand it stands on its flat edge, crimp up, the way it is eaten.
      if (!set) { puff(body, 0, 0, 0).rotation.x = Math.PI / 2; break; }
      box(body, .17, .002, .16, material('#eee5cc', .9), 0, .001, 0, .3);
      puff(body, -.02, .07, .08); puff(body, .02, -.07, Math.PI + .08).position.y = .002;
      break;
    }
    case 'food-chicken-rice': {
      // The rice and chicken folded into waxed paper and kraft, held shut with a rubber band.
      const packet = new THREE.Group(); body.add(packet);
      const kraft = material('#b48a5a', .95);
      box(packet, .14, .046, .1, kraft, 0, .023, 0, .3);
      box(packet, .142, .006, .102, material('#ece6d6', .8), 0, .041, 0, .3);
      const roof = cylinder(packet, 0, .086, .026, material('#a87d4f', .95), 0, .057, 0, 4); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, .82);
      const band = mesh(packet, new THREE.TorusGeometry(.05, .0028, 6, 28), material('#d2475a', .5), .028, .036, 0); band.rotation.y = Math.PI / 2; band.scale.set(1.1, .78, 1);
      if (!set) break;
      // The chilli comes in a knotted bag on the side, with a plastic spoon.
      ball(body, .018, material('#d4401f', .25, 0, .92), .1, .013, .045, 1.1, .7, 1);
      ball(body, .006, material('#efe8da', .3, 0, .7), .1, .028, .045);
      spoon(body, material('#f4f2ec', .4), .02, .085, .3, .002);
      break;
    }
    case 'food-bak-kut-teh': {
      const broth = material('#6a4428', .2);
      const { group, surface } = bowl(body, .062, .05, broth);
      // Pork ribs breaking the surface, bone ends out, and whole garlic cloves.
      const meat = material('#7b4a2e', .55), bone = material('#e6dcc4', .5);
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Group(), a = i * 2.1 + .3; rib.position.set(Math.cos(a) * .022, surface + .004, Math.sin(a) * .022); rib.rotation.set(.15, -a + Math.PI / 2, .18); group.add(rib);
        const piece = cylinder(rib, .009, .01, .05, meat, 0, 0, 0, 10); piece.rotation.z = Math.PI / 2; piece.scale.z = .75;
        const end = cylinder(rib, .004, .004, .014, bone, .031, 0, 0, 8); end.rotation.z = Math.PI / 2;
      }
      for (let i = 0; i < 5; i++) { const a = random() * Math.PI * 2, d = .015 + random() * .03; ball(group, .007, material('#efe6cf', .45), Math.cos(a) * d, surface + .001, Math.sin(a) * d, .8, .55, 1.1); }
      for (let i = 0; i < 14; i++) { const a = random() * Math.PI * 2, d = random() * .055; ball(group, .0013, material('#1c1410', .9), Math.cos(a) * d, surface + .0005, Math.sin(a) * d); }
      if (!set) break;
      group.position.x = -.04;
      // Youtiao to dip, and dark soy with cut chilli.
      plate(body, .07, .08, .02);
      const dough = material('#d39a45', .65);
      for (const [x, z, yaw] of [[.075, .01, .5], [.088, .035, .45]] as const) {
        const stick = cylinder(body, .009, .009, .11, dough, x, .016, z, 10); stick.rotation.set(0, yaw, Math.PI / 2); stick.scale.z = .8;
        const twin = cylinder(body, .008, .008, .11, dough, x + .006, .016, z + .011, 10); twin.rotation.copy(stick.rotation); twin.scale.z = .8;
      }
      const dip = bowl(body, .025, .014, material('#2a160c', .15), .03, .085);
      for (let i = 0; i < 4; i++) cylinder(dip.group, .003, .003, .002, material('#d42d1c', .4), (random() - .5) * .025, dip.surface + .001, (random() - .5) * .025, 8);
      spoon(body, china, -.05, .085, -.4);
      break;
    }
    case 'food-field-ration': {
      // The meal bag, its label and the stencil over it.
      const bag = new THREE.Group(); body.add(bag);
      box(bag, .1, .055, .075, material('#5b6247', .9), 0, .0275, 0, .25);
      box(bag, .102, .014, .077, material('#454b36', .9), 0, .043, 0, .25);
      box(bag, .05, .002, .03, material('#d8d4c0', .9), -.012, .056, .008, .2);
      for (let i = 0; i < 3; i++) box(bag, .036, .0022, .003, material('#3a3e2c', .9), -.012, .057, -.002 + i * .007, .1);
      box(bag, .01, .002, .075, material('#cfc8a8', .85), .045, .056, 0, .2);
      // Malt drink in the canteen cup, froth round the edge.
      const cup = new THREE.Group(); cup.position.set(set ? .1 : .085, 0, set ? -.02 : 0); body.add(cup);
      const steel = material('#9aa09a', .35, .6);
      cylinder(cup, .034, .03, .062, steel, 0, .031, 0, 20);
      cylinder(cup, .0315, .0315, .002, material('#6e4a2c', .25), 0, .057, 0, 20);
      mesh(cup, new THREE.TorusGeometry(.029, .003, 6, 24), material('#b08a62', .5), 0, .058, 0).rotation.x = Math.PI / 2;
      box(cup, .05, .004, .014, steel, .055, .05, 0, .3);
      if (!set) break;
      // Crackers out of their packet, and the issue spoon.
      box(body, .07, .012, .05, material('#c2ad7d', .9), -.03, .006, .085, .3);
      for (let i = 0; i < 2; i++) box(body, .052, .006, .042, material('#e0c58a', .85), .04 + i * .012, .003 + i * .006, .08 - i * .01, .3).rotation.y = .3 * i;
      spoon(body, material('#3e4433', .6), -.08, -.06, 1.1);
      break;
    }
    case 'food-mala-da-la': {
      const oil = material('#9b2b14', .3);
      const { group, surface } = bowl(body, .075, .055, oil, 0, 0, material('#efe5d2', .6), material('#b8321c', .5));
      // Heaped well over the rim, glossy with chilli oil, then everything picked from the trays on top.
      const heap = .045, spread = .068;
      dome(group, spread, heap, oil, 0, surface, 0);
      const on = (d: number) => surface + heap * Math.sqrt(Math.max(0, 1 - (d / spread) ** 2));
      const scatter = (count: number, add: (x: number, y: number, z: number, turn: number) => void) => {
        for (let i = 0; i < count; i++) { const a = random() * Math.PI * 2, d = Math.sqrt(random()) * spread * .9; add(Math.cos(a) * d, on(d), Math.sin(a) * d, random() * Math.PI * 2); }
      };
      const lotus = material('#ecdcbc', .55), hole = material('#5a1d10', .5);
      scatter(5, (x, y, z, turn) => { const slice = new THREE.Group(); slice.position.set(x, y, z); slice.rotation.set(.4, turn, .3); group.add(slice); cylinder(slice, .014, .014, .004, lotus, 0, 0, 0, 16); for (let i = 0; i < 5; i++) cylinder(slice, .0025, .0025, .0045, hole, Math.cos(i * 1.26) * .007, 0, Math.sin(i * 1.26) * .007, 6); });
      scatter(6, (x, y, z, turn) => { const pod = cylinder(group, .0005, .0045, .024, material('#c0261a', .35), x, y + .003, z, 6); pod.rotation.set(Math.PI / 2, turn, .3); });
      scatter(4, (x, y, z) => { ball(group, .01, material('#3f7a32', .8), x, y + .004, z, 1, .8, 1); });
      scatter(4, (x, y, z, turn) => { box(group, .016, .012, .016, material('#e9d9a8', .7), x, y + .003, z, .2).rotation.y = turn; });
      scatter(5, (x, y, z, turn) => { const slice = cylinder(group, .009, .009, .004, material('#c4584a', .5), x, y + .002, z, 12); slice.rotation.set(.5, turn, 0); });
      scatter(30, (x, y, z) => { ball(group, .0022, material('#4a2418', .8), x, y + .002, z); });
      scatter(16, (x, y, z) => { ball(group, .0012, material('#efe3c2', .6), x, y + .002, z); });
      if (!set) break;
      group.position.x = -.03;
      // Plain rice on the side to put the fire out.
      const rice = material('#f6f3ea', .7), side = bowl(body, .042, .032, rice, .095, .055);
      dome(side.group, .038, .014, rice, 0, side.surface, 0);
      chopsticks(body, .08, -.055, .35);
      break;
    }
    case 'food-ah-ma-tingkat': {
      // Four enamel tiers with a red band and painted flowers, clipped into the carrier's rails under its grip.
      const enamel = material('#e3ece2', .35), band = material('#c2473a', .45), petal = material('#d9617a', .5), leaf = material('#4f8a4a', .55), rail = material('#9aa3a0', .3, .6);
      for (let i = 0; i < 4; i++) {
        const y = .016 + i * .032;
        cylinder(body, .05, .048, .03, enamel, 0, y, 0, 24);
        cylinder(body, .0505, .0505, .004, band, 0, y + .013, 0, 24);
        for (const a of [0, Math.PI]) for (const da of [-.35, 0, .35]) {
          const t = a + da + i * .2;
          ball(body, .005, petal, Math.sin(t) * .0495, y - .002, Math.cos(t) * .0495, 1, 1, .4).rotation.y = t;
          ball(body, .004, leaf, Math.sin(t + .12) * .049, y - .008, Math.cos(t + .12) * .049, 1, .5, .4).rotation.y = t;
        }
      }
      cylinder(body, .048, .05, .01, enamel, 0, .137, 0, 24);
      dome(body, .046, .012, enamel, 0, .142, 0);
      for (const x of [-.056, .056]) { box(body, .007, .17, .01, rail, x, .085, 0, .3); box(body, .014, .012, .014, rail, x * .93, .135, 0, .3); }
      box(body, .12, .007, .012, rail, 0, .172, 0, .3);
      const grip = cylinder(body, .008, .008, .06, material('#2a2522', .6), 0, .178, 0, 10); grip.rotation.z = Math.PI / 2;
      break;
    }
    case 'food-smoking-corner': {
      // The "cigar": five cigarettes bundled into one, lit, the bak kwa held over the smoke.
      const paper = material('#ece8df', .85), filter = material('#c98a43', .8), ember = glow('#ff6a2a');
      const cigar = new THREE.Group(); cigar.position.set(-.035, .011, 0); body.add(cigar);
      for (const [y, z] of [[0, 0], [.0085, .005], [.0085, -.005], [-.0085, .005], [-.0085, -.005]]) {
        cylinder(cigar, .004, .004, .07, paper, 0, y, z, 8).rotation.z = Math.PI / 2;
        cylinder(cigar, .0041, .0041, .022, filter, .044, y, z, 8).rotation.z = Math.PI / 2;
        cylinder(cigar, .0042, .0042, .004, ember, -.037, y, z, 8).rotation.z = Math.PI / 2;
        cylinder(cigar, .0042, .0042, .005, material('#8c8a86', .95), -.0325, y, z, 8).rotation.z = Math.PI / 2;
      }
      const tie = mesh(cigar, new THREE.TorusGeometry(.0125, .0012, 6, 16), material('#b8323a', .5), .012, 0, 0); tie.rotation.y = Math.PI / 2;
      const kwa = new THREE.Group(); kwa.position.set(-.035, .035, 0); kwa.rotation.z = .08; body.add(kwa);
      box(kwa, .075, .005, .06, material('#8a2d18', .4), 0, 0, 0, .3);
      for (let i = 0; i < 9; i++) ball(kwa, .004 + random() * .004, material('#6a2412', .5), (random() - .5) * .065, .0026, (random() - .5) * .05, 1.4, .12, 1);
      // Iced Milo in a canteen plastic cup, with the powder heaped on top and a straw.
      const milo = new THREE.Group(); milo.position.set(.05, 0, 0); body.add(milo);
      cylinder(milo, .034, .027, .092, material('#ffffff', .1, 0, .28), 0, .046, 0, 20);
      cylinder(milo, .032, .026, .074, material('#6b4426', .4), 0, .038, 0, 20);
      for (let i = 0; i < 4; i++) box(milo, .016, .016, .016, material('#dfeaf0', .1, 0, .55), (random() - .5) * .03, .066 + random() * .012, (random() - .5) * .03, .2).rotation.set(random(), random(), random());
      dome(milo, .028, .02, material('#7a5233', 1), 0, .075, 0);
      const straw = cylinder(milo, .003, .003, .14, material('#e2b33a', .4), .01, .1, -.004, 8); straw.rotation.z = -.22;
      break;
    }
  }

  // Held: centred on the hand's grip. Set: on the tray or the ground, centred over it.
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(body), centre = bounds.getCenter(new THREE.Vector3());
  body.position.set(-centre.x, set ? -bounds.min.y : -centre.y, -centre.z);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    root,
    /** Footprint and height of the whole model, metres. */
    size,
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
