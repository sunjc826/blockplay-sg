import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { type ReloadStyle, weaponReloadStyle } from './fps-reload-styles';
import { reloadMotion } from './fps-weapon-motion';
import { getWeaponSight } from './weapon-optics';

/** Lightweight rigid hand poses; no extra render target or skinning. */
export function createWeaponHandling(model: THREE.Group, index: number) {
  const additions = new THREE.Group(); additions.name = 'fps-handling'; model.add(additions);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string, roughness = .8, metalness = .05) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.push(m); return m;
  };
  const glove = material('#474b39'), pad = material('#202722'), sleeve = material('#626a50'), steel = material('#202627', .38, .65);
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); parent.add(object); return object;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m = glove) =>
    mesh(parent, new RoundedBoxGeometry(w, h, d, 1, .004), m, x, y, z);
  const hand = (left: boolean) => {
    const group = new THREE.Group(); additions.add(group);
    box(group, .062, .077, .044, 0, 0, 0);
    box(group, .052, .035, .009, 0, .016, .025, pad);
    for (let i = 0; i < 4; i++) {
      box(group, .013, .045 - Math.abs(i - 1) * .003, .017, -.023 + i * .015, .044, -.008);
      box(group, .012, .016, .01, -.023 + i * .015, .029, .022, pad);
    }
    const thumb = box(group, .019, .045, .025, left ? .035 : -.035, -.002, -.014); thumb.rotation.z = left ? -.55 : .55;
    mesh(group, new THREE.CylinderGeometry(.034, .046, .16, 8), sleeve, 0, -.13, .028).rotation.x = -.28;
    box(group, .073, .025, .060, 0, -.065, .005, pad);
    return group;
  };
  const right = hand(false), left = hand(true);
  right.position.set(.028, index ? -.015 : -.029, index ? .17 : .01); right.rotation.set(-.20, .12, -.12);
  const support = new THREE.Vector3(-.033, index ? .072 : .085, index ? -.205 : -.16);
  const magazineGrip = new THREE.Vector3(-.033, index ? -.014 : -.050, index ? .008 : .245);
  const magazine = model.getObjectByName(`${index ? 'ultimax' : 'sar21'}-inspired__magazine`);
  const magazineHome = magazine?.position.clone() ?? new THREE.Vector3();
  const magazineRotation = magazine?.rotation.clone() ?? new THREE.Euler();
  // Reuse the rifle magazine geometry/materials; only tape owns new resources.
  const pair = new THREE.Group(); pair.name = 'fps-taped-magazines'; pair.visible = false;
  magazine?.parent?.add(pair);
  const spare = index === 0 && magazine ? magazine.clone(true) : null;
  if (spare) { spare.name = 'fps-spare-magazine'; pair.add(spare); }
  const tape = material('#363c32');
  const bands = [-.025, .025].map(y => box(pair, .12, .018, .08, 0, y, 0, tape));
  let pairSide = 1, wasSwapped = false;
  const actionGrip = new THREE.Vector3(-.045, index ? .22 : .26, 0);

  // Animated control is decorative; gameplay ammunition remains owned by weapon rules.
  const control = box(additions, .023, .014, .025, .049, index ? .211 : .257, index ? .05 : .10, steel);
  const controlZ = control.position.z;
  return {
    get aimHeight() { return getWeaponSight(model)?.aimHeight ?? .328; },
    get aimDepth() { return getWeaponSight(model)?.aimDepth ?? -.36; },
    update(progress: number | null, empty: boolean, selectedStyle: ReloadStyle = 'standard') {
      const style = weaponReloadStyle(selectedStyle, index);
      const motion = reloadMotion(progress ?? 0, style);
      if (progress === null && wasSwapped) { pairSide *= -1; wasSwapped = false; }
      const paired = style === 'dual-mag' && !!spare;
      const swapped = paired && progress !== null && motion.pairSwap >= .5;
      if (progress !== null) wasSwapped = swapped;
      // Exchange the two identical magazine roles halfway through the lateral
      // swap. Their world positions stay continuous and the seated one stays named.
      const pairOffset = paired ? pairSide * .075 * ((swapped ? 1 : 0) - motion.pairSwap) : 0;
      const spareSide = pairSide * (swapped ? -1 : 1);
      pair.visible = paired;
      if (magazine) {
        magazine.position.copy(magazineHome); magazine.position.y -= motion.magazineDrop;
        magazine.position.x += motion.magazineSide + pairOffset;
        magazine.rotation.copy(magazineRotation); magazine.rotation.z += paired ? 0 : motion.magazineDrop * -.35 + motion.magazineTwist;
        magazine.visible = motion.magazineVisible;
        if (spare) {
          spare.position.copy(magazine.position); spare.position.x += spareSide * .075;
          spare.rotation.copy(magazine.rotation); spare.visible = true;
          bands.forEach((band, i) => {
            band.position.copy(magazine.position); band.position.x += spareSide * .0375;
            band.position.y += -.025 + (i ? .025 : -.025);
            band.position.z += .245;
            band.rotation.copy(magazineRotation);
          });
        }
      }
      left.position.copy(support).lerp(magazineGrip, motion.handToMagazine);
      left.position.y -= motion.magazineDrop * motion.handToMagazine;
      left.position.x += (motion.magazineSide - (paired ? pairSide * .075 * motion.pairSwap : 0)) * motion.handToMagazine;
      left.rotation.set(-.15 + motion.handToMagazine * .3, -.2, .32 - motion.handToMagazine * .35);
      if (empty && progress !== null) {
        actionGrip.z = controlZ + .045; left.position.lerp(actionGrip, motion.action);
      }
      control.position.z = controlZ + (empty ? motion.action * .045 : 0);
    },
    dispose() { pair.removeFromParent(); additions.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}

