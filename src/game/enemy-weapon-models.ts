import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ENEMY_WEAPON_LAYOUT, isEnemyWeaponId, type EnemyWeaponId } from './enemy-weapon-layout';

/**
 * Enemy-issue platforms: authored low-poly silhouettes, not dimensional
 * replicas. Local -Z is forward and the bore runs along `axisY`.
 *
 * One model per platform carries every configuration's parts. A part shared by
 * all of them is plain; a part only some use sits in a group tagged with
 * `userData.configs`, and `applyEnemyWeaponConfig` shows the selected set.
 * Reload nodes keep the names the viewmodel animates: `__magazine`,
 * `__charging-handle`, and on the belt-fed gun `__feed-cover` and `__feed-belt`.
 */
export function buildEnemyWeapon(id: string): THREE.Group | undefined {
  if (!isEnemyWeaponId(id)) return undefined;
  const root = new THREE.Group(); root.name = id;
  const kit = createKit(root, id);
  if (id === 'xm8-inspired') buildXm8(kit);
  else if (id === 'g36-inspired') buildG36(kit);
  else buildMg4(kit);
  applyEnemyWeaponConfig(root, id, ENEMY_WEAPON_LAYOUT[id].defaultConfig);
  return root;
}

/** Shows one configuration's parts and moves the muzzle to its flash hider. Reversible. */
export function applyEnemyWeaponConfig(root: THREE.Object3D, id: string, config: string | undefined) {
  if (!isEnemyWeaponId(id)) return () => {};
  const layout = ENEMY_WEAPON_LAYOUT[id];
  const configs = layout.configs as Readonly<Record<string, { muzzle: number }>>;
  const selected = config && configs[config] ? config : layout.defaultConfig;
  const tagged: [THREE.Object3D, boolean][] = [];
  root.traverse(node => { if (Array.isArray(node.userData.configs)) tagged.push([node, node.visible]); });
  tagged.forEach(([node]) => node.visible = (node.userData.configs as string[]).includes(selected));
  const muzzle = root.getObjectByName(`${id}__socket_muzzle`), home = muzzle?.position.z ?? 0;
  if (muzzle) muzzle.position.z = configs[selected].muzzle;
  // weapon-optics reads this to fit the glass and reticle of the sight shown.
  const previous = root.userData.enemyConfig; root.userData.enemyConfig = selected;
  return () => { tagged.forEach(([node, visible]) => node.visible = visible); if (muzzle) muzzle.position.z = home; root.userData.enemyConfig = previous; };
}

type Kit = ReturnType<typeof createKit>;
type Pt = readonly [number, number];
function createKit(root: THREE.Group, id: EnemyWeaponId) {
  const material = (name: string, color: string, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }); m.name = name; return m;
  };
  // Material names matter: armory-visuals paints skins onto "Polymer" and the
  // variant accent onto "Machined edges".
  const polymer = material('Polymer', id === 'xm8-inspired' ? '#7b7967' : id === 'g36-inspired' ? '#24282a' : '#2b2f2c', .82, .04);
  const steel = material('Metal anodised', '#363e42', .46, .6);
  const dark = material('Dark metal', '#14191b', .72, .2);
  const edge = material('Machined edges', '#5f6a6e', .4, .68);
  const rubber = material('Rubber', '#16191a', .95, 0);
  const smoke = material('Magazine smoke', '#5d4f36', .32, .05, { transparent: true, opacity: .8 });
  const brass = material('Brass', '#aa8746', .45, .65);
  const copper = material('Copper', '#80583b', .5, .6);
  const interior = material('Sight interior', '#101618', .78, .15, { side: THREE.DoubleSide });
  // Lens faces you look at but never through: a scope's objective, a laser window.
  const lens = material('Lens', '#18262e', .08, .4, { envMapIntensity: 1.4 });
  // The unaimed reflex on a G36's handle: tinted, coated, and seen through.
  const tint = new THREE.MeshPhysicalMaterial({ color: '#c99a5a', roughness: .1, metalness: 0, clearcoat: 1, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide });
  tint.name = 'Reflex glass';

  const mesh = (name: string, geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const part = new THREE.Mesh(geometry, m); part.name = `${id}__${name}`; part.position.set(x, y, z); parent.add(part); return part;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = steel, parent: THREE.Object3D = root) =>
    mesh(name, new RoundedBoxGeometry(w, h, d, 1, Math.min(.003, w / 5, h / 5, d / 5)), m, x, y, z, parent);
  /** A cylinder lying along Z, centred at z. */
  const cylinder = (name: string, radius: number, length: number, x: number, y: number, z: number, m: THREE.Material = steel, parent: THREE.Object3D = root, segments = 18) => {
    const part = mesh(name, new THREE.CylinderGeometry(radius, radius, length, segments), m, x, y, z, parent); part.rotation.x = Math.PI / 2; return part;
  };
  /** A cylinder lying along X, as a drum or a hinge pin. */
  const crosswise = (name: string, radius: number, length: number, x: number, y: number, z: number, m: THREE.Material = steel, parent: THREE.Object3D = root) => {
    const part = mesh(name, new THREE.CylinderGeometry(radius, radius, length, 22), m, x, y, z, parent); part.rotation.z = Math.PI / 2; return part;
  };
  const rod = (name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, m: THREE.Material = steel, parent: THREE.Object3D = root) => {
    const part = mesh(name, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), m, 0, 0, 0, parent);
    part.position.copy(a).add(b).multiplyScalar(.5); part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return part;
  };
  /**
   * A side profile, given as [z, y] points, extruded across the gun. Holes are
   * real openings: the stock and carry handle are read by what is missing.
   */
  const side = (name: string, points: readonly Pt[], width: number, m: THREE.Material = polymer, parent: THREE.Object3D = root, holes: readonly (readonly Pt[])[] = [], x = 0) => {
    const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y))); shape.closePath();
    for (const hole of holes) { const path = new THREE.Path(hole.map(([z, y]) => new THREE.Vector2(-z, y))); path.closePath(); shape.holes.push(path); }
    const bevel = Math.min(.004, width / 6);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel * .8, bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 6 });
    geometry.translate(0, 0, -(width - bevel * 2) / 2);
    const part = mesh(name, geometry, m, x, 0, 0, parent); part.rotation.y = Math.PI / 2; return part;
  };
  /** A hollow tube along Z: a sight housing you can look through, or a flash hider with a bore. */
  const tube = (name: string, outer: number, inner: number, length: number, y: number, z: number, m: THREE.Material = steel, parent: THREE.Object3D = root, segments = 28) => {
    const h = length / 2, lip = Math.min(.003, (outer - inner) / 2);
    const profile = [[inner, -h], [outer - lip, -h], [outer, -h + lip], [outer, h - lip], [outer - lip, h], [inner, h], [inner, -h]];
    const part = mesh(name, new THREE.LatheGeometry(profile.map(([r, v]) => new THREE.Vector2(r, v)), segments), m, 0, y, z, parent);
    part.rotation.x = Math.PI / 2; return part;
  };
  /** Parts belonging to only some configurations. */
  const variant = (name: string, configs: readonly string[], parent: THREE.Object3D = root) => {
    const group = new THREE.Group(); group.name = `${id}__config-${name}`; group.userData.configs = [...configs]; parent.add(group); return group;
  };
  const socket = (name: string, x: number, y: number, z: number) => {
    const node = new THREE.Object3D(); node.name = `${id}__socket_${name}`; node.position.set(x, y, z); root.add(node);
  };
  /** Slotted flash hider ending at `front`. */
  const flashHider = (name: string, radius: number, length: number, front: number, parent: THREE.Object3D, cage = false) => {
    const y = ENEMY_WEAPON_LAYOUT[id].axisY, centre = front + length / 2;
    tube(name, radius, radius * .45, length, y, centre, steel, parent, 20);
    const slots = cage ? 6 : 4;
    for (let i = 0; i < slots; i++) {
      const angle = i / slots * Math.PI * 2;
      const slot = box(`${name}-slot`, .0025, radius * .7, length * .62, Math.sin(angle) * (radius + .0004), y + Math.cos(angle) * (radius + .0004), centre - length * .08, dark, parent);
      slot.rotation.z = -angle;
    }
  };
  /** A curved box magazine hanging from (0,0,0) of its parent, curving forward as it descends. */
  const boxMagazine = (name: string, parent: THREE.Object3D, depth: number, m: THREE.Material) => {
    const curve = depth * .2;
    side(`${name}-body`, [[.028, 0], [.028, -.02], [.004 - curve * .2, -depth], [-.058 - curve * .25, -depth + .006], [-.034, -.02], [-.034, 0]], .026, m, parent);
    // The stack of rounds behind the smoked polymer; only a translucent body shows it.
    box(`${name}-rounds`, .011, depth * .82, .044, 0, -depth * .43, -.004 - curve * .1, brass, parent).rotation.x = .16;
    box(`${name}-floorplate`, .031, .011, .072, 0, -depth + .002, -.026 - curve * .22, dark, parent).rotation.x = -.04;
    box(`${name}-top-round`, .008, .006, .036, 0, .003, -.004, brass, parent);
  };
  /** Two drums side by side behind one feed tower: the hundred-round twin drum. */
  const twinDrum = (name: string, parent: THREE.Object3D) => {
    box(`${name}-tower`, .03, .07, .05, 0, -.03, -.005, dark, parent);
    for (const sideX of [-1, 1]) {
      crosswise(`${name}-drum`, .058, .048, sideX * .046, -.085, -.01, rubber, parent);
      crosswise(`${name}-cap`, .05, .052, sideX * .046, -.085, -.01, dark, parent);
      crosswise(`${name}-winder`, .012, .062, sideX * .046, -.085, -.01, edge, parent);
    }
    box(`${name}-bridge`, .05, .03, .045, 0, -.085, -.01, dark, parent);
  };
  /**
   * A face outline, given as [x, y] points, extruded along Z from `front` to
   * `rear`: a sight body with its window cut right through it.
   */
  const section = (name: string, outline: readonly Pt[], front: number, rear: number, m: THREE.Material = polymer, holes: readonly (readonly Pt[])[] = [], parent: THREE.Object3D = root) => {
    const bevel = .002, length = rear - front - bevel * 2;
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))); shape.closePath();
    for (const hole of holes) {
      // The bevel closes a (convex) window in by its size, so open it out by as much first.
      const centre = hole.reduce((sum, [x, y]) => sum.add(new THREE.Vector2(x, y)), new THREE.Vector2()).divideScalar(hole.length);
      const path = new THREE.Path(hole.map(([x, y]) => { const p = new THREE.Vector2(x, y), out = p.clone().sub(centre); return p.add(out.setLength(bevel * .8)); }));
      path.closePath(); shape.holes.push(path);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: true, bevelSize: bevel * .8, bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 8 });
    return mesh(name, geometry, m, 0, 0, front + bevel, parent);
  };
  /** A rounded rectangle centred on (x, y), as [x, y] points. */
  const rounded = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
    const points: Pt[] = [];
    for (const [cx, cy, start] of [[x + w / 2 - r, y + h / 2 - r, 0], [x - w / 2 + r, y + h / 2 - r, .5], [x - w / 2 + r, y - h / 2 + r, 1], [x + w / 2 - r, y - h / 2 + r, 1.5]] as const)
      for (let i = 0; i <= 4; i++) { const a = (start + i / 8) * Math.PI; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return points;
  };
  const circle = (x: number, y: number, r: number, n = 28): Pt[] => Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * Math.PI * 2) * r, y + Math.sin(i / n * Math.PI * 2) * r] as Pt);
  return { root, id, polymer, steel, dark, edge, rubber, smoke, brass, copper, lens, tint, interior, mesh, box, cylinder, crosswise, rod, side, tube, section, rounded, circle, variant, socket, flashHider, boxMagazine, twinDrum };
}

/** Trigger, guard and pistol grip, with the grip's centre at about (z, .095). */
function lowerGroup(k: Kit, z: number, top: number) {
  k.side('pistol-grip', [[z - .035, top], [z - .016, .05], [z - .008, .038], [z + .027, .042], [z + .03, .056], [z + .012, top]], .034);
  for (let i = 0; i < 3; i++) k.box('grip-groove', .036, .004, .006, 0, .07 + i * .022, z - .024 + i * .004, k.dark);
  const g = z - .07;
  k.side('trigger-guard', [[g - .02, top], [g - .02, top - .026], [g, top - .05], [g + .04, top - .05], [g + .046, top]], .02, k.polymer, k.root,
    [[[g - .008, top - .007], [g - .008, top - .024], [g + .006, top - .038], [g + .034, top - .038], [g + .036, top - .007]]]);
  k.box('trigger', .006, .022, .008, 0, top - .02, g + .018, k.dark).rotation.x = -.3;
  k.crosswise('selector', .007, .006, -.033, top + .022, z - .03, k.edge);
}

/**
 * The XM8's integrated sighting module, sat on the front of the carry handle:
 * a squared body with a round window cut through it, a rubber eyepiece, a
 * shade over the front glass, a laser pod on the right with its two emitters,
 * and the battery cap on the left. weapon-optics fits the glass and the dot.
 */
function integratedSightingModule(k: Kit) {
  const { height: y, radius } = ENEMY_WEAPON_LAYOUT['xm8-inspired'].configs.carbine.optic;
  const front = -.095, rear = .005, window = radius + .0006;
  k.section('ism-body', k.rounded(0, y, .078, .078, .016), front, rear, k.polymer, [k.circle(0, y, window, 64)]);
  // Seen from inside, so an open double-sided wall rather than a tube's outward faces.
  k.mesh('ism-liner', new THREE.CylinderGeometry(window - .0002, window - .0002, rear - front - .004, 64, 1, true), k.interior, 0, y, (front + rear) / 2).rotation.x = Math.PI / 2;
  k.section('ism-shade', k.rounded(0, y + .002, .082, .084, .018), front - .016, front + .002, k.polymer, [k.circle(0, y, radius + .0045, 32)]);
  k.tube('ism-bezel', radius + .004, window, .004, y, front + .001, k.edge);
  k.tube('ism-eyepiece', radius + .0065, window, .011, y, rear + .004, k.rubber);
  for (const [z, x] of [[-.012, -.012], [-.034, .012]] as const) k.box('ism-button', .013, .005, .013, x, y + .041, z, k.rubber);
  k.box('ism-mode-switch', .008, .004, .02, 0, y + .041, -.065, k.edge);
  k.crosswise('ism-battery-cap', .012, .008, -.041, y - .004, -.045, k.edge);
  k.crosswise('ism-battery-grip', .0125, .003, -.045, y - .004, -.045, k.dark);
  k.box('ism-laser-pod', .018, .03, .072, .046, y - .012, -.052);
  for (const dy of [-.004, -.02]) k.cylinder('ism-laser-window', .0055, .004, .046, y + dy + .004, front - .002, k.lens);
  k.box('ism-seam', .08, .002, .1, 0, y - .028, -.045, k.dark);
}

/**
 * The G36's carry handle is its sight: a 3x scope runs through the top bar,
 * from the objective in the front leg to the rubber eyecup behind the rear
 * block, and a small 1x reflex rides on top for close work. Only the scope
 * is aimed through; weapon-optics fits its live picture to the eyecup.
 */
function dualOptic(k: Kit, parent: THREE.Object3D) {
  const { height: y, lens, radius } = ENEMY_WEAPON_LAYOUT['g36-inspired'].configs.rifle.optic;
  k.side('carry-handle', [[.11, .25], [.11, .343], [.098, .35], [-.17, .35], [-.198, .336], [-.205, .25]], .046, k.polymer, parent,
    [[[.04, .258], [.04, .294], [-.15, .294], [-.172, .258]]]);
  k.box('handle-seam', .048, .002, .27, 0, .3, -.045, k.dark, parent);
  for (const z of [.085, -.18]) k.crosswise('handle-bolt', .0055, .052, 0, .262, z, k.edge, parent);
  // Eyecup: soft rubber standing proud of the rear block, the lens recessed in it.
  k.tube('scope-eyecup', radius + .009, radius + .0005, .026, y, .123, k.rubber, parent);
  k.tube('scope-eyepiece-ring', radius + .0035, radius + .0005, .006, y, lens - .006, k.dark, parent);
  // Objective, seen only from the front: dark coated glass in a bezel.
  k.cylinder('scope-objective', .017, .004, 0, y, -.2035, k.lens, parent);
  k.tube('scope-objective-bezel', .021, .017, .006, y, -.2015, k.dark, parent);
  // The reflex: a hooded frame with a tinted, slightly raked glass at its front.
  const base = .35, rear = .095, front = .022;
  k.box('reflex-base', .036, .01, rear - front, 0, base + .005, (rear + front) / 2, k.polymer, parent);
  for (const sideX of [-1, 1]) k.box('reflex-wall', .005, .03, rear - front - .004, sideX * .0165, base + .025, (rear + front) / 2, k.polymer, parent);
  k.box('reflex-hood', .039, .006, rear - front + .01, 0, base + .042, (rear + front) / 2 - .005, k.polymer, parent);
  k.box('reflex-rear-frame', .036, .005, .006, 0, base + .012, rear - .003, k.dark, parent);
  const glass = k.mesh('reflex-glass', new THREE.PlaneGeometry(.028, .028), k.tint, 0, base + .025, front + .006, parent);
  glass.rotation.x = -.2;
  k.box('reflex-adjuster', .006, .008, .012, .021, base + .02, rear - .02, k.edge, parent);
}

/**
 * The G36C trades the optic handle for a short one with a rail, and here a
 * tube red dot clamped to it: rubber ring at the back, turrets on top and
 * right, battery on the left, the dot fitted by weapon-optics at its front.
 */
function railHandle(k: Kit, parent: THREE.Object3D) {
  const { height: y, lens, radius } = ENEMY_WEAPON_LAYOUT['g36-inspired'].configs.c.optic;
  k.side('carry-handle', [[.10, .25], [.10, .284], [-.10, .284], [-.10, .25]], .036, k.polymer, parent,
    [[[.062, .256], [.062, .276], [-.062, .276], [-.062, .256]]]);
  k.box('rail', .022, .006, .2, 0, .287, 0, k.dark, parent);
  for (let i = 0; i < 12; i++) k.box('rail-tooth', .026, .004, .006, 0, .292, -.088 + i * .016, k.dark, parent);
  k.box('rear-sight-folded', .02, .006, .016, 0, .296, .086, k.dark, parent);
  const outer = radius + .004, front = lens - .003, rear = .02, centre = (front + rear) / 2;
  k.box('dot-mount', .03, y - outer - .293 + .004, .034, 0, (y - outer + .293) / 2, centre, k.steel, parent);
  k.crosswise('dot-mount-knob', .006, .008, .02, .3, centre, k.edge, parent);
  k.tube('dot-tube', outer, radius + .0005, rear - front, y, centre, k.steel, parent, 32);
  k.tube('dot-front-ring', outer + .0012, radius + .0005, .005, y, front + .002, k.edge, parent, 32);
  k.tube('dot-rear-ring', outer + .001, radius + .0005, .007, y, rear - .003, k.rubber, parent, 32);
  k.mesh('dot-elevation', new THREE.CylinderGeometry(.009, .009, .012, 18), k.steel, 0, y + outer + .005, centre, parent);
  k.mesh('dot-elevation-cap', new THREE.CylinderGeometry(.0075, .0075, .003, 18), k.edge, 0, y + outer + .012, centre, parent);
  k.crosswise('dot-windage', .009, .012, outer + .005, y, centre, k.steel, parent);
  k.crosswise('dot-battery', .008, .012, -outer - .005, y, centre, k.steel, parent);
}

function buildXm8(k: Kit) {
  const { axisY: y } = ENEMY_WEAPON_LAYOUT['xm8-inspired'];
  // One smooth shell from the stock joint to the handguard joint, with the
  // carry handle rising out of it. The sight sits on top of the handle.
  k.side('receiver', [[.10, .148], [.10, .232], [.08, .246], [-.20, .246], [-.20, .155], [-.09, .150], [-.085, .136], [-.025, .136], [-.02, .146]], .062);
  k.side('carry-handle', [[.075, .246], [.05, .276], [-.16, .276], [-.20, .246]], .036, k.polymer, k.root,
    [[[.034, .252], [.024, .268], [-.125, .268], [-.155, .252]]]);
  integratedSightingModule(k);
  k.box('charging-handle', .018, .01, .03, 0, .255, -.03, k.edge);
  k.box('ejection-port', .004, .02, .05, .032, .215, -.035, k.dark);
  k.box('shell-seam', .064, .003, .26, 0, .19, -.05, k.dark);
  k.box('magazine-release', .01, .012, .012, .033, .155, -.02, k.dark);
  lowerGroup(k, .07, .146);

  const fullStock = k.variant('stock-full', ['carbine', 'sharpshooter', 'automatic']);
  k.side('stock', [[.10, .236], [.31, .222], [.335, .218], [.335, .085], [.30, .085], [.20, .14], [.10, .15]], .044, k.polymer, fullStock,
    [[[.16, .205], [.27, .2], [.27, .15], [.21, .17]]]);
  k.box('butt-pad', .046, .135, .012, 0, .152, .34, k.rubber, fullStock);
  const riser = k.variant('cheek-riser', ['sharpshooter']);
  k.box('cheek-riser', .036, .018, .11, 0, .238, .24, k.polymer, riser);
  const shortStock = k.variant('stock-short', ['compact']);
  k.side('stock', [[.10, .236], [.25, .226], [.27, .222], [.27, .095], [.24, .095], [.17, .14], [.10, .15]], .044, k.polymer, shortStock);
  k.box('butt-pad', .046, .125, .012, 0, .158, .275, k.rubber, shortStock);

  // Handguards in three lengths, each with its barrel and muzzle device.
  const handguard = (name: string, configs: string[], end: number) => {
    const group = k.variant(name, configs);
    k.side('handguard', [[-.20, .240], [end + .017, .236], [end, .222], [end, .17], [end + .012, .155], [-.20, .152]], .058, k.polymer, group);
    const vents = Math.max(2, Math.round((-.2 - end) / .035));
    for (let i = 0; i < vents; i++) for (const sideX of [-1, 1])
      k.box('handguard-vent', .003, .024, .016, sideX * .03, .2, -.22 + (end + .04 + .22) * i / Math.max(1, vents - 1), k.dark, group);
    return group;
  };
  const carbine = handguard('handguard-carbine', ['carbine'], -.342);
  k.cylinder('barrel', .0105, .14, 0, y, -.405, k.steel, carbine);
  k.flashHider('flash-hider', .0135, .05, -.525, carbine);
  const compact = handguard('handguard-compact', ['compact'], -.257);
  k.cylinder('barrel', .0105, .08, 0, y, -.29, k.steel, compact);
  k.flashHider('flash-hider', .0135, .045, -.375, compact);
  const marksman = handguard('handguard-long', ['sharpshooter'], -.432);
  k.cylinder('barrel', .012, .185, 0, y, -.5175, k.steel, marksman);
  k.flashHider('muzzle-brake', .016, .045, -.655, marksman);
  const automatic = handguard('handguard-long', ['automatic'], -.432);
  k.cylinder('heavy-barrel', .015, .175, 0, y, -.5125, k.steel, automatic);
  for (let i = 0; i < 4; i++) k.cylinder('barrel-flute', .0158, .004, 0, y, -.46 - i * .03, k.dark, automatic);
  k.flashHider('flash-hider', .016, .045, -.645, automatic);

  const magazine = new THREE.Group(); magazine.name = 'xm8-inspired__magazine'; magazine.position.set(0, .143, -.055); k.root.add(magazine);
  k.boxMagazine('magazine', k.variant('magazine-30', ['carbine', 'compact'], magazine), .17, k.smoke);
  k.boxMagazine('magazine', k.variant('magazine-20', ['sharpshooter'], magazine), .12, k.smoke);
  k.twinDrum('drum', k.variant('twin-drum', ['automatic'], magazine));
  k.socket('muzzle', 0, y, -.525); k.socket('eject', .04, .215, -.035);
}

function buildG36(k: Kit) {
  const { axisY: y } = ENEMY_WEAPON_LAYOUT['g36-inspired'];
  k.side('receiver', [[.12, .15], [.12, .236], [.10, .25], [-.18, .25], [-.18, .155], [-.105, .152], [-.10, .138], [-.035, .138], [-.03, .15]], .06);
  k.box('receiver-rib', .062, .006, .28, 0, .2, -.03, k.dark);
  k.box('brass-deflector', .01, .022, .022, .034, .238, .025, k.polymer);
  k.box('ejection-port', .004, .02, .05, .031, .215, -.02, k.dark);
  dualOptic(k, k.variant('dual-optic', ['rifle', 'k', 'mg']));
  railHandle(k, k.variant('rail-handle', ['c']));
  k.box('charging-handle', .016, .012, .03, 0, .259, -.065, k.edge);
  lowerGroup(k, .075, .15);

  // Skeleton folding stock and its hinge.
  k.side('stock', [[.12, .24], [.40, .232], [.425, .226], [.425, .08], [.39, .078], [.20, .15], [.12, .155]], .042, k.polymer, k.root,
    [[[.17, .22], [.37, .214], [.39, .205], [.39, .1], [.37, .098], [.22, .16], [.17, .165]]]);
  k.box('butt-pad', .044, .15, .01, 0, .153, .428, k.rubber);
  k.mesh('stock-hinge', new THREE.CylinderGeometry(.009, .009, .05, 14), k.edge, 0, .2, .125);

  const handguard = (name: string, configs: string[], end: number) => {
    const group = k.variant(name, configs);
    k.side('handguard', [[-.18, .244], [end + .015, .24], [end, .226], [end, .165], [end + .02, .148], [-.18, .148]], .064, k.polymer, group);
    const vents = Math.max(2, Math.round((-.18 - end) / .04));
    for (let i = 0; i < vents; i++) for (const sideX of [-1, 1]) for (const row of [.178, .212])
      k.box('handguard-vent', .003, .014, .022, sideX * .0335, row, -.205 + (end + .045 + .205) * i / Math.max(1, vents - 1), k.dark, group);
    return group;
  };
  const rifle = handguard('handguard-rifle', ['rifle'], -.43);
  k.cylinder('barrel', .0105, .15, 0, y, -.5, k.steel, rifle);
  k.flashHider('flash-hider', .014, .04, -.615, rifle);
  const short = handguard('handguard-k', ['k'], -.36);
  k.cylinder('barrel', .0105, .115, 0, y, -.4125, k.steel, short);
  k.flashHider('birdcage', .016, .045, -.515, short, true);
  const compact = handguard('handguard-c', ['c'], -.29);
  k.cylinder('barrel', .0105, .085, 0, y, -.3275, k.steel, compact);
  k.flashHider('flash-hider', .014, .035, -.405, compact);
  const support = handguard('handguard-mg', ['mg'], -.43);
  k.cylinder('heavy-barrel', .015, .15, 0, y, -.5, k.steel, support);
  for (let i = 0; i < 3; i++) k.cylinder('barrel-flute', .0158, .004, 0, y, -.455 - i * .035, k.dark, support);
  k.flashHider('flash-hider', .016, .04, -.615, support);

  const magazine = new THREE.Group(); magazine.name = 'g36-inspired__magazine'; magazine.position.set(0, .148, -.07); k.root.add(magazine);
  const box = k.variant('magazine-30', ['rifle', 'k', 'c'], magazine);
  k.boxMagazine('magazine', box, .18, k.smoke);
  // The coupling lugs that let two magazines clip together side by side.
  for (const sideX of [-1, 1]) k.box('magazine-lug', .006, .016, .014, sideX * .016, -.03, -.012, k.smoke, box);
  k.twinDrum('drum', k.variant('twin-drum', ['mg'], magazine));
  k.socket('muzzle', 0, y, -.615); k.socket('eject', .04, .215, -.02);
}

function buildMg4(k: Kit) {
  const { axisY: y, sightHeight: sightY } = ENEMY_WEAPON_LAYOUT['mg4-inspired'];
  k.side('receiver', [[.10, .165], [.10, .258], [-.20, .258], [-.20, .17], [-.02, .165]], .08, k.steel);
  for (const sideX of [-1, 1]) {
    k.box('receiver-panel', .004, .05, .22, sideX * .041, .215, -.05, k.dark);
    for (const z of [-.13, -.02, .06]) k.crosswise('receiver-pin', .004, .088, 0, .2, z, k.edge);
  }
  k.side('trigger-housing', [[.11, .166], [.11, .14], [-.04, .14], [-.06, .166]], .06);
  lowerGroup(k, .08, .14);
  k.box('charging-handle', .03, .012, .02, .052, .225, -.10, k.edge);
  k.box('charging-track', .004, .008, .12, .041, .225, -.07, k.dark);
  k.box('ejection-port', .05, .004, .06, 0, .163, -.04, k.dark);

  // Feed cover, hinged at its front edge so its rear lifts on a belt change.
  const cover = new THREE.Group(); cover.name = 'mg4-inspired__feed-cover'; cover.position.set(0, .258, -.19); k.root.add(cover);
  k.box('cover-shell', .086, .022, .25, 0, .011, .125, k.steel, cover);
  for (const sideX of [-1, 1]) k.box('cover-rib', .006, .005, .2, sideX * .022, .024, .12, k.edge, cover);
  k.box('cover-latch', .03, .012, .014, 0, .01, .245, k.dark, cover);
  k.crosswise('cover-hinge', .007, .094, 0, .262, -.19, k.edge);
  k.box('feed-port', .012, .03, .07, -.045, .232, -.05, k.dark);

  // Rear aperture behind the cover; the front post rides on whichever barrel is fitted.
  const rearZ = .078;
  k.box('rear-sight-foot', .05, .012, .03, 0, .264, rearZ, k.steel);
  k.box('rear-sight-pedestal', .03, sightY - .019 - .27, .018, 0, (sightY - .019 + .27) / 2, rearZ, k.dark);
  const ring = new THREE.Shape(); ring.absarc(0, 0, .02, 0, Math.PI * 2, false);
  const opening = new THREE.Path(); opening.absarc(0, 0, .013, 0, Math.PI * 2, true); ring.holes.push(opening);
  k.mesh('rear-sight', new THREE.ExtrudeGeometry(ring, { depth: .006, bevelEnabled: true, bevelSize: .0008, bevelThickness: .0008, bevelSegments: 1, curveSegments: 28 }), k.dark, 0, sightY, rearZ - .003);
  const frontSight = (parent: THREE.Object3D, z: number) => {
    k.cylinder('front-sight-base', .017, .022, 0, y, z, k.steel, parent);
    k.box('front-sight-post', .012, sightY - y - .012, .012, 0, (sightY + y) / 2 - .008, z, k.dark, parent);
    k.box('front-sight-blade', .0035, .014, .004, 0, sightY - .007, z, k.dark, parent);
    for (const sideX of [-1, 1]) k.box('front-sight-ear', .004, .03, .012, sideX * .013, sightY - .01, z, k.steel, parent);
  };

  k.side('stock', [[.10, .25], [.40, .235], [.43, .228], [.43, .10], [.40, .098], [.24, .16], [.10, .17]], .04, k.polymer, k.root,
    [[[.15, .232], [.39, .222], [.40, .215], [.40, .12], [.38, .118], [.25, .172], [.15, .18]]]);
  k.box('butt-pad', .042, .135, .012, 0, .164, .435, k.rubber);
  k.side('handguard', [[-.20, .21], [-.33, .205], [-.335, .165], [-.20, .16]], .07);

  const barrel = (name: string, configs: string[], end: number, radius: number, sightZ: number) => {
    const group = k.variant(name, configs), length = -.20 - end;
    k.cylinder('barrel', radius, length, 0, y, -.20 - length / 2, k.steel, group);
    const gas = Math.min(.24, length - .09);
    k.cylinder('gas-tube', .009, gas, 0, .183, -.20 - gas / 2, k.steel, group);
    k.box('gas-block', .03, .05, .03, 0, .195, -.20 - gas, k.dark, group);
    // The barrel's carry handle folds flat, below the sight line.
    for (const z of [-.29, -.33]) k.rod('barrel-handle-post', new THREE.Vector3(0, y + radius, z), new THREE.Vector3(.04, .268, z), .005, k.steel, group);
    k.rod('barrel-handle-grip', new THREE.Vector3(.04, .268, -.285), new THREE.Vector3(.04, .268, -.335), .009, k.polymer, group);
    frontSight(group, sightZ);
    return group;
  };
  k.flashHider('flash-hider', .016, .045, -.665, barrel('barrel-standard', ['standard'], -.62, .0115, -.56));
  k.flashHider('flash-hider', .016, .045, -.535, barrel('barrel-short', ['short'], -.49, .0115, -.445));
  const heavy = barrel('barrel-heavy', ['heavy'], -.63, .0145, -.57);
  for (let i = 0; i < 5; i++) k.cylinder('barrel-flute', .0152, .005, 0, y, -.37 - i * .035, k.dark, heavy);
  k.flashHider('flash-hider', .017, .045, -.675, heavy);

  // Belt box hung under the left of the receiver; the heavier variant carries the bigger one.
  const magazine = new THREE.Group(); magazine.name = 'mg4-inspired__magazine'; magazine.position.set(-.055, .085, -.04); k.root.add(magazine);
  const ammoBox = (name: string, configs: string[], w: number, h: number, d: number) => {
    const group = k.variant(name, configs, magazine);
    k.box('ammo-box', w, h, d, 0, -h / 2 + .06, 0, k.polymer, group);
    k.box('ammo-box-lid', w + .006, .01, d + .006, 0, .062, 0, k.steel, group);
    for (const z of [-d * .3, d * .3]) k.box('ammo-box-rib', w + .004, h * .7, .006, 0, -h / 2 + .06, z, k.dark, group);
    k.box('ammo-box-catch', .02, .024, .008, 0, .04, d / 2 + .004, k.edge, group);
  };
  ammoBox('box-100', ['standard', 'short'], .09, .13, .16);
  ammoBox('box-200', ['heavy'], .1, .17, .2);
  const belt = new THREE.Group(); belt.name = 'mg4-inspired__feed-belt'; k.root.add(belt);
  for (let i = 0; i < 6; i++) {
    const t = i / 5, x = THREE.MathUtils.lerp(-.07, -.047, t), yy = THREE.MathUtils.lerp(.152, .232, t) + Math.sin(t * Math.PI) * .01;
    k.cylinder('belt-case', .0045, .042, x, yy, -.05, k.brass, belt);
    const tip = k.mesh('belt-projectile', new THREE.ConeGeometry(.0038, .016, 10), k.copper, x, yy, -.079, belt); tip.rotation.x = -Math.PI / 2;
    k.box('belt-link', .012, .004, .016, x, yy + .0045, -.046, k.dark, belt);
  }
  k.socket('muzzle', 0, y, -.665); k.socket('eject', .045, .2, -.04);
}
