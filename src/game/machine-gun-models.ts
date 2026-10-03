import * as THREE from 'three';
import { buildWeaponBipod } from './weapon-bipod';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MACHINE_GUN_LAYOUT, type MachineGunId } from './machine-gun-layout';

/** Stylized game meshes. Local -Z is forward; reload pivots own their detailing. */
export function buildMachineGun(id: MachineGunId) {
  const heavy = id === 'cis50-inspired', layout = MACHINE_GUN_LAYOUT[id];
  const { axisY: y, sightHeight: sightY, rearZ, frontZ } = layout;
  const root = new THREE.Group(); root.name = id;
  const steel = new THREE.MeshStandardMaterial({ color: '#394247', roughness: .48, metalness: .55 }); steel.name = 'Metal anodised';
  const edge = new THREE.MeshStandardMaterial({ color: '#647074', roughness: .42, metalness: .65 }); edge.name = 'Machined edges';
  const dark = new THREE.MeshStandardMaterial({ color: '#161d20', roughness: .74, metalness: .18 }); dark.name = 'Dark metal';
  const polymer = new THREE.MeshStandardMaterial({ color: '#404b35', roughness: .85 }); polymer.name = 'Polymer';
  const brass = new THREE.MeshStandardMaterial({ color: '#aa8746', roughness: .45, metalness: .65 });
  const copper = new THREE.MeshStandardMaterial({ color: '#80583b', roughness: .5, metalness: .6 });
  const mark = new THREE.MeshStandardMaterial({ color: '#b5b9aa', roughness: .8 });
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, yy: number, z: number, parent: THREE.Object3D = root) => {
    const part = new THREE.Mesh(geometry, material); part.name = `${id}__${name}`; part.position.set(x, yy, z); parent.add(part); return part;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, yy: number, z: number, material = steel, parent: THREE.Object3D = root) =>
    mesh(name, new RoundedBoxGeometry(w, h, d, 1, Math.min(.003, w / 5, h / 5, d / 5)), material, x, yy, z, parent);
  const cylinder = (name: string, radius: number, length: number, x: number, yy: number, z: number, material = steel, parent: THREE.Object3D = root) => {
    const part = mesh(name, new THREE.CylinderGeometry(radius, radius, length, 20), material, x, yy, z, parent); part.rotation.x = Math.PI / 2; return part;
  };
  const rod = (name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = steel, parent: THREE.Object3D = root) => {
    const part = mesh(name, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 12), material, 0, 0, 0, parent);
    part.position.copy(a).add(b).multiplyScalar(.5); part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return part;
  };
  const profile = (name: string, points: number[][], depth: number, x: number, yy: number, z: number, material = steel, parent: THREE.Object3D = root) => {
    const shape = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py))); shape.closePath();
    return mesh(name, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .001, bevelThickness: .001, bevelSegments: 1, steps: 1 }), material, x, yy, z, parent);
  };
  const socket = (name: string, x: number, yy: number, z: number) => {
    const node = new THREE.Object3D(); node.name = `${id}__socket_${name}`; node.position.set(x, yy, z); root.add(node);
  };
  const width = heavy ? .16 : .105, length = heavy ? .44 : .35, half = width / 2;
  const front = heavy ? -.92 : -.68;
  // Chamfered shoulders, narrower lower receiver and separate side plates catch
  // light in ADS instead of presenting one featureless cuboid to the camera.
  profile('receiver', [[-half + .012, -.06], [half - .012, -.06], [half, -.045], [half, .035], [half - .012, .055], [-half + .012, .055], [-half, .035], [-half, -.045]], length, 0, y, .02 - length / 2);
  box('lower-receiver', width * .72, .045, length * .85, 0, y - .063, .025, dark);
  for (const side of [-1, 1]) {
    box('receiver-panel', .004, .058, length * .66, side * (half + .001), y - .006, .028, steel);
    box('receiver-shoulder', .007, .012, length * .86, side * (half - .008), y + .048, .022, edge);
    for (const z of [-.075, .018, .10]) {
      const pin = cylinder('receiver-pin', .004, .006, side * (half + .004), y - .01, z, edge); pin.rotation.set(0, Math.PI / 2, 0);
    }
  }
  box('ejection-recess', .005, .024, .066, half + .004, y - .029, -.035, dark);
  box('charging-track', .006, .009, .14, half + .005, y + .014, .036, dark);
  box('charging-handle', .038, .013, .024, half + .021, y + .014, .085, edge);
  box('feed-tray', width + .018, .013, .245, 0, y + .057, .008, edge);

  // The hinge is at the forward end. The cover's ribs, latch and panels follow
  // its reload motion, and opening it reveals a shallow feed channel beneath.
  const cover = new THREE.Group(); cover.name = `${id}__feed-cover`; cover.position.set(0, y + .064, -.115); root.add(cover);
  profile('cover-shell', [[-half - .006, 0], [half + .006, 0], [half + .004, .010], [half - .016, .023], [-half + .016, .023], [-half - .004, .010]], .242, 0, 0, 0, steel, cover);
  box('cover-inset', width * .60, .003, .175, 0, .023, .122, dark, cover);
  for (const side of [-1, 1]) {
    box('cover-rib', .006, .004, .173, side * width * .28, .026, .123, edge, cover);
    const hinge = cylinder('cover-hinge', .008, .026, side * (half + .004), y + .066, -.108, edge); hinge.rotation.set(0, Math.PI / 2, 0);
  }
  box('cover-latch', .03, .013, .014, 0, .013, .245, dark, cover);
  box('feed-channel', width * .76, .004, .10, 0, y + .065, -.016, dark);
  for (const side of [-1, 1]) box('feed-guide', .009, .009, .11, side * width * .30, y + .067, -.016, steel);

  cylinder('barrel', heavy ? .026 : .016, heavy ? .70 : .50, 0, y, heavy ? -.57 : -.43);
  cylinder('barrel-socket', heavy ? .045 : .032, .055, 0, y, heavy ? -.219 : -.173, dark);
  cylinder('barrel-lock-ring', heavy ? .042 : .030, .016, 0, y, heavy ? -.248 : -.201, edge);
  for (let i = 0; i < (heavy ? 7 : 3); i++) cylinder('barrel-collar', heavy ? .030 : .021, .009, 0, y, (heavy ? -.28 : -.22) - i * .022, steel);
  // Annular muzzle with a recessed bore, rather than a closed cylinder end.
  const muzzleRadius = heavy ? .039 : .024, bore = heavy ? .014 : .009;
  const muzzle = mesh('flash-hider', new THREE.LatheGeometry([[bore, -.029], [muzzleRadius - .003, -.029], [muzzleRadius, -.024], [muzzleRadius, .024], [muzzleRadius - .003, .029], [bore, .029], [bore, -.029]].map(([r, z]) => new THREE.Vector2(r, z)), 24), steel, 0, y, front);
  muzzle.rotation.x = Math.PI / 2;
  cylinder('bore-shadow', bore, .001, 0, y, front + .022, dark);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
    box('muzzle-slot', .002, muzzleRadius * .62, .006, side * (muzzleRadius - .001), y, front - .016 + i * .015, dark);

  // Keep the box as one reload node; lid, stiffeners and catch travel with it.
  const magazine = new THREE.Group(); magazine.name = `${id}__magazine`; magazine.position.set(heavy ? -.18 : -.12, .13, .015); root.add(magazine);
  const boxWidth = heavy ? .18 : .13;
  box('ammo-box', boxWidth, .16, .18, 0, 0, 0, polymer, magazine);
  box('ammo-box-lid', boxWidth + .008, .013, .188, 0, .081, 0, steel, magazine);
  box('ammo-box-seam', boxWidth + .003, .008, .183, 0, -.062, 0, dark, magazine);
  for (const x of [-boxWidth * .3, boxWidth * .3]) box('ammo-box-rib', .008, .12, .004, x, -.002, .091, steel, magazine);
  box('ammo-box-catch', .023, .031, .009, 0, .052, .097, edge, magazine);
  const belt = new THREE.Group(); belt.name = `${id}__feed-belt`; root.add(belt);
  const start = heavy ? -.23 : -.165, end = -half + .005;
  for (let i = 0; i < 8; i++) {
    const t = i / 7, x = THREE.MathUtils.lerp(start, end, t), yy = THREE.MathUtils.lerp(.220, y + .027, t) - Math.sin(t * Math.PI) * .012;
    const radius = heavy ? .007 : .005;
    cylinder('belt-case', radius, heavy ? .069 : .046, x, yy, -.013, brass, belt);
    const tip = mesh('belt-projectile', new THREE.ConeGeometry(radius * .85, .020, 12), copper, x, yy, heavy ? -.057 : -.046, belt); tip.rotation.x = -Math.PI / 2;
    box('belt-link', radius * 2.7, .004, .017, x, yy + radius, -.010, dark, belt);
  }
  box('feed-mouth', .015, .03, .097, -half - .011, y + .025, -.026, dark);

  // Both sight planes share the exact point-of-aim height. Rear geometry leaves
  // an actual opening; the front blade terminates at the aiming line.
  const sights = new THREE.Group(); sights.name = `${id}__iron-sights`; root.add(sights);
  const rearBaseY = y + .064, apertureRadius = heavy ? .018 : .015;
  box('rear-sight-foot', heavy ? .075 : .065, .012, .041, 0, rearBaseY, rearZ, steel, sights);
  const supportTop = sightY - (heavy ? .015 : .019);
  box('rear-sight-pedestal', .034, supportTop - rearBaseY, .022, 0, (supportTop + rearBaseY) / 2, rearZ, dark, sights);
  if (heavy) {
    // A broad U-shaped battle notch distinguishes the .50 from the MAG aperture.
    profile('rear-sight', [[-.030, -.021], [.030, -.021], [.030, .014], [.024, .018], [.018, .012], [.018, -.011], [-.018, -.011], [-.018, .012], [-.024, .018], [-.030, .014]], .006, 0, sightY, rearZ - .003, dark, sights);
    for (const side of [-1, 1]) box('rear-index-mark', .004, .0015, .001, side * .024, sightY, rearZ + .005, mark, sights);
  } else {
    const shape = new THREE.Shape(); shape.absarc(0, 0, .021, 0, Math.PI * 2, false);
    const opening = new THREE.Path(); opening.absarc(0, 0, apertureRadius, 0, Math.PI * 2, true); shape.holes.push(opening);
    mesh('rear-sight', new THREE.ExtrudeGeometry(shape, { depth: .007, bevelEnabled: true, bevelSize: .0008, bevelThickness: .0008, bevelSegments: 1, steps: 1, curveSegments: 32 }), dark, 0, sightY, rearZ - .0035, sights);
  }
  for (const side of [-1, 1]) {
    const adjuster = cylinder('sight-adjuster', .008, .007, side * .036, rearBaseY + .008, rearZ, edge, sights); adjuster.rotation.set(0, Math.PI / 2, 0);
    // A folded range leaf sits below the aiming line and runs forward.
    box('range-leaf', .005, .007, .078, side * .017, rearBaseY + .008, rearZ - .05, steel, sights);
    for (let i = 0; i < 4; i++) box('range-index', .006, .001, .002, side * .019, rearBaseY + .012, rearZ - .022 - i * .018, mark, sights);
  }
  cylinder('front-sight-collar', heavy ? .033 : .024, .026, 0, y, frontZ, steel, sights);
  const baseTop = sightY - .029;
  profile('front-sight-base', [[-.016, 0], [.016, 0], [.010, baseTop - y], [-.010, baseTop - y]], .022, 0, y, frontZ - .011, steel, sights);
  profile('front-sight', [[-.0045, -.03], [.0045, -.03], [.0018, -.001], [-.0018, -.001]], .008, 0, sightY, frontZ - .004, dark, sights);
  for (const side of [-1, 1]) {
    profile('front-sight-guard', [[side * .010, -.029], [side * .018, -.029], [side * .027, .008], [side * .023, .013], [side * .019, .008]], .012, 0, sightY, frontZ - .006, steel, sights);
  }

  if (heavy) {
    box('backplate', .174, .108, .025, 0, y - .004, .247, dark);
    box('backplate-inset', .113, .054, .005, 0, y, .262, steel);
    for (const x of [-.063, .063]) cylinder('backplate-fastener', .006, .005, x, y + .026, .265, edge);
    box('spade-crossbar', .278, .025, .030, 0, .21, .265, steel);
    box('thumb-trigger', .029, .014, .025, 0, .234, .281, dark);
    for (const x of [-.125, .125]) {
      box('spade-grip', .035, .15, .045, x, .14, .27, polymer);
      for (let i = 0; i < 6; i++) box('grip-rib', .038, .006, .048, x, .087 + i * .019, .27, dark);
    }
    box('mount-lug', .09, .09, .12, 0, .14, -.11, dark);

  } else {
    // The butt narrows into the receiver; its dropped comb stays below the eye.
    profile('stock-neck', [[-.028, -.043], [.028, -.043], [.030, .027], [-.030, .027]], .23, 0, .205, .17, polymer);
    box('stock-comb', .062, .025, .17, 0, .230, .30, polymer);
    box('buttplate', .075, .13, .025, 0, .19, .418, dark);
    for (let i = 0; i < 5; i++) box('butt-rib', .068, .006, .004, 0, .149 + i * .02, .432, steel);
    box('grip', .05, .115, .065, 0, .094, .135, polymer).rotation.x = -.2;
    for (let i = 0; i < 4; i++) box('grip-rib', .052, .006, .010, 0, .059 + i * .022, .103, dark);
    box('trigger-guard-bottom', .028, .009, .073, 0, .105, .066, dark);
    box('trigger-guard-front', .028, .045, .009, 0, .124, .029, dark);
    box('trigger', .009, .027, .010, 0, .132, .073, steel).rotation.x = -.2;
    cylinder('gas-tube', .012, .31, 0, y - .047, -.32, dark);
    cylinder('gas-regulator', .019, .034, 0, y - .042, -.49, steel);
    box('handguard', .072, .055, .17, 0, .175, -.26, polymer);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) box('handguard-vent', .003, .015, .014, side * .037, .185, -.20 - i * .027, dark);
    // Side-folded carry handle: connected at the barrel socket, out of the sight window.
    rod('carry-handle-stem', new THREE.Vector3(.025, .23, -.18), new THREE.Vector3(.085, .285, -.18), .006, steel);
    cylinder('carry-handle', .012, .11, .085, .285, -.123, polymer);
  }
  root.add(buildWeaponBipod(id)!);
  socket('muzzle', 0, y, front - .03); socket('eject', heavy ? .095 : .063, y, -.05);
  return root;
}
