import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { EquippedWeapon } from './armory-state';
import { weaponHardware, type WeaponHardware } from './weapon-hardware';

/**
 * The hardware a variant is built from, as geometry on the platform's own model.
 *
 * There is one GLB per family, so every tier used to reach the preview as the
 * same silhouette in a different accent. `weapon-hardware` says what a variant
 * wears; this bolts it on. The shop preview and the FPS viewmodel both get it,
 * because both dress their weapons through `dressWeapon`.
 *
 * Every fitting lands in a zone the authored mesh leaves empty — the bare barrel
 * ahead of the handguard, past the muzzle, under that barrel, on the magazine
 * node, or off the back of the butt — so nothing has to intersect geometry it
 * cannot see. The numbers are measured off the GLBs; `docs/ARMORY.md` says how.
 */
interface Anchors {
  /** Height of the barrel's axis, which the model points down -Z. */
  axisY: number;
  /** The run of bare barrel between handguard and muzzle, and its radius. */
  barrel: { from: number; to: number; radius: number };
  muzzle: number; gas: number;
  /** Just behind the butt, where a recoil pad would sit. */
  rear: { y: number; z: number; width: number; height: number };
  /** A box magazine grows down from `bottom`; a drum grows in place and wears a band on `face`. */
  magazine: { name: string; drum: boolean; bottom: number; width: number; depth: number; face: number; band: number };
}
const ANCHORS: Record<string, Anchors> = {
  'sar21-inspired': {
    axisY: .197, barrel: { from: -.292, to: -.405, radius: .018 }, muzzle: -.412, gas: -.342,
    rear: { y: .140, z: .456, width: .066, height: .152 },
    magazine: { name: 'sar21-inspired__magazine', drum: false, bottom: -.141, width: .043, depth: .074, face: .241, band: 0 },
  },
  'ultimax-inspired': {
    axisY: .198, barrel: { from: -.315, to: -.566, radius: .018 }, muzzle: -.574, gas: -.352,
    rear: { y: .118, z: .528, width: .062, height: .162 },
    magazine: { name: 'ultimax-inspired__magazine', drum: true, bottom: .013, width: .199, depth: .117, face: .069, band: .062 },
  },
  'p30-inspired': {
    axisY: .197, barrel: { from: -.101, to: -.12, radius: .012 }, muzzle: -.13, gas: -.04,
    rear: { y: .2, z: .095, width: .048, height: .04 },
    magazine: { name: 'p30-inspired__magazine', drum: false, bottom: -.006, width: .041, depth: .057, face: 0, band: 0 },
  },
  'mag-inspired': {
    axisY: .22, barrel: { from: -.35, to: -.65, radius: .016 }, muzzle: -.71, gas: -.36,
    rear: { y: .2, z: .434, width: .075, height: .13 },
    magazine: { name: 'mag-inspired__magazine', drum: false, bottom: -.08, width: .13, depth: .18, face: 0, band: 0 },
  },
  'cis50-inspired': {
    axisY: .25, barrel: { from: -.28, to: -.89, radius: .026 }, muzzle: -.95, gas: -.3,
    rear: { y: .25, z: .251, width: .16, height: .10 },
    magazine: { name: 'cis50-inspired__magazine', drum: false, bottom: -.08, width: .18, depth: .18, face: 0, band: 0 },
  },
};

/** Shared by the shop preview and the viewmodel: one group per weapon, fully reversible. */
export function fitWeaponHardware(root: THREE.Object3D, weapon: EquippedWeapon) {
  const anchors = ANCHORS[weapon.id], hardware = weaponHardware(weapon.equipment.variant);
  if (!anchors || !hardware.length) return () => {};
  const group = new THREE.Group(); group.name = 'equipped-hardware'; root.add(group);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string, roughness: number, metalness: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.push(m); return m;
  };
  const steel = material('#1e2427', .34, .72), cut = material('#0a0d0f', .62, .35);
  // The same accent the armoury paints the receiver in, so added hardware reads
  // as part of the weapon rather than a bolt-on from somebody else's kit.
  const accent = material(weapon.accent ?? '#8e979c', .30, .82);
  const use = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.push(geometry); return geometry; };
  const restore: (() => void)[] = [];
  const mesh = (geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); parent.add(object);
    // Anything hung off the model's own nodes rather than off the group has to
    // be taken back off by hand, or it would survive the next dressing.
    if (parent !== group && !group.getObjectById(parent.id)) restore.push(() => object.removeFromParent());
    return object;
  };
  /** A cylinder on the barrel's axis. */
  const sleeve = (radius: number, length: number, z: number, m: THREE.Material, segments = 24) => {
    const object = mesh(use(new THREE.CylinderGeometry(radius, radius, length, segments)), m, 0, anchors.axisY, z);
    object.rotation.x = Math.PI / 2; return object;
  };
  const ring = (radius: number, thickness: number, z: number, m: THREE.Material) =>
    mesh(use(new THREE.TorusGeometry(radius, thickness, 8, 24)), m, 0, anchors.axisY, z);
  /** One geometry, `count` copies spaced around the barrel, each rolled outwards. */
  const around = (count: number, radius: number, z: number, geometry: THREE.BufferGeometry, m: THREE.Material) => {
    use(geometry);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      mesh(geometry, m, Math.sin(angle) * radius, anchors.axisY + Math.cos(angle) * radius, z).rotation.z = -angle;
    }
  };
  // What the barrel ends up measuring, so a gas block clears the sleeve in front
  // of it instead of disappearing inside a heavy profile.
  let outer = anchors.barrel.radius;

  function barrel({ weight, extended, lightened }: WeaponHardware) {
    const zone = anchors.barrel, length = Math.abs(zone.to - zone.from), mid = (zone.from + zone.to) / 2;
    outer = zone.radius + .004 + weight * (lightened ? .004 : .012);
    sleeve(outer, length, mid, steel);
    if (lightened) {
      // Weight taken out has to show as material missing, not added: cooling ports.
      const port = new THREE.BoxGeometry(.009, .006, .022);
      for (let i = 0; i < 3; i++) around(4, outer - .001, mid + (i - 1) * length / 4, port, cut);
      ring(outer + .002, .004, zone.to + .012, accent);
    } else {
      // A heavier profile is thickest at the chamber, and flutes are how a match
      // barrel keeps that weight from costing it stiffness.
      sleeve(outer + .005, .036, zone.from - .014, steel);
      if (weight > .45) around(6, outer, mid, new THREE.BoxGeometry(.007, .005, length - .03), cut);
    }
    if (extended) {
      const brake = anchors.muzzle - .030;
      sleeve(outer + .007, .058, brake, steel);
      const port = new THREE.BoxGeometry(.007, .014, .010);
      for (let i = 0; i < 3; i++) around(2, outer + .007, brake - .017 + i * .017, port, cut);
      ring(outer + .006, .005, brake - .032, accent);
    } else if (weight > .1) {
      sleeve(outer + .004, .024, anchors.muzzle - .008, steel);
      ring(outer + .004, .004, anchors.muzzle - .021, accent);
    }
  }
  function gas({ weight }: WeaponHardware) {
    const block = mesh(use(new RoundedBoxGeometry(.030, .026, .052, 2, .004)), steel, 0, anchors.axisY + outer + .010, anchors.gas);
    // The regulator faces forward, where a rifleman would reach for it.
    mesh(use(new THREE.CylinderGeometry(.006, .006, .014, 12)), accent, 0, 0, -.030, block).rotation.x = Math.PI / 2;
    const vent = use(new THREE.BoxGeometry(.020, .004, .006));
    for (let i = 0; i <= Math.round(weight * 2); i++) mesh(vent, cut, 0, .013, -.015 + i * .013, block);
    // The tube runs back along the top of the barrel towards the receiver.
    mesh(use(new THREE.CylinderGeometry(.004, .004, .09, 10)), steel, 0, anchors.axisY + outer + .026, anchors.gas + .048).rotation.x = Math.PI / 2;
  }
  function magazine({ weight }: WeaponHardware) {
    const node = root.getObjectByName(anchors.magazine.name), spec = anchors.magazine;
    if (!node) return;
    const scale = node.scale.clone();
    restore.push(() => node.scale.copy(scale));
    // A drum has nowhere to grow but its own diameter, and a box magazine grows
    // down. Either way the reload animation only reads position and rotation, so
    // the magazine swap still plays over the change.
    if (spec.drum || weight < 0) {
      const factor = Math.max(.86, Math.min(1.28, 1 + weight * (spec.drum ? .8 : .5)));
      if (spec.drum) node.scale.multiplyScalar(factor); else node.scale.setY(factor);
    }
    if (weight <= 0) return;
    if (spec.drum) mesh(use(new THREE.TorusGeometry(spec.band, .006, 8, 28)), accent, 0, spec.bottom, spec.face, node);
    else {
      const height = weight * .09 + .012;
      mesh(use(new RoundedBoxGeometry(spec.width, height, spec.depth, 2, .004)), steel, 0, spec.bottom - height / 2, spec.face, node);
      mesh(use(new THREE.BoxGeometry(spec.width + .003, .006, spec.depth + .003)), accent, 0, spec.bottom - height, spec.face, node);
    }
  }
  function freefloat() {
    // The nut, and daylight behind it: the handguard carries no load on the barrel.
    ring(outer + .011, .008, anchors.barrel.from - .006, steel);
    ring(outer + .009, .004, anchors.barrel.from - .020, accent);
  }
  function bipod() {
    mesh(use(new RoundedBoxGeometry(.028, .024, .046, 2, .004)), steel, 0, anchors.axisY - outer - .014, anchors.barrel.from - .026);
    const leg = use(new THREE.CylinderGeometry(.005, .004, .115, 10)), foot = use(new THREE.CylinderGeometry(.009, .009, .006, 12));
    for (const side of [-1, 1]) {
      // Stowed forward along the barrel: the only run of clear air the authored
      // mesh leaves under the weapon.
      const stowed = new THREE.Group();
      stowed.position.set(side * .013, anchors.axisY - outer - .028, anchors.barrel.from - .086);
      stowed.rotation.set(Math.PI / 2 - .12, 0, side * .10); group.add(stowed);
      mesh(leg, steel, 0, 0, 0, stowed);
      mesh(foot, cut, 0, -.058, 0, stowed);
    }
  }
  function buffer({ weight }: WeaponHardware) {
    const { y, z, width, height } = anchors.rear;
    mesh(use(new RoundedBoxGeometry(width, height, .024 + weight * .010, 2, .006)), cut, 0, y, z);
    mesh(use(new THREE.BoxGeometry(width + .002, .008, .007)), accent, 0, y + height / 2 - .014, z);
  }

  const build: Record<WeaponHardware['kind'], (entry: WeaponHardware) => void> = {
    barrel, gas, magazine, freefloat, bipod, buffer,
  };
  // Barrel first, so the fittings that sit on it know how thick it ended up.
  for (const entry of [...hardware].sort((a, b) => (a.kind === 'barrel' ? -1 : 0) - (b.kind === 'barrel' ? -1 : 0))) build[entry.kind](entry);
  return () => {
    restore.forEach(undo => undo());
    group.removeFromParent();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(m => m.dispose());
  };
}
