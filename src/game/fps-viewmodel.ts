import { FPS_WEAPONS, reloadLength } from './fps-rules';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { handleSide, reloadMotion, readyMotion, smoothStep } from './fps-weapon-motion';
import { getWeaponSight } from './weapon-optics';
import { createBipodMotion, type BipodMotionInput } from './weapon-bipod';
import { MACHINE_GUN_LAYOUT } from './machine-gun-layout';
import { ENEMY_WEAPON_LAYOUT, isEnemyWeaponId } from './enemy-weapon-layout';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
/**
 * A belt hanging free from its box mouth: the same link spacing as when it is
 * seated, each link turned a little further down, so the loose end curls under.
 * `roll` is how far each round turns from its seated heading.
 */
function hangingBelt(homes: THREE.Vector3[]) {
  const heading = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(b.y - a.y, b.x - a.x);
  const out = homes.slice(0, 1).map(position => ({ position: position.clone(), roll: 0 }));
  for (let i = 1; i < homes.length; i++) {
    const seated = heading(homes[i - 1], homes[i]), angle = THREE.MathUtils.lerp(heading(homes[0], homes[1]), -1.35, i / (homes.length - 1));
    const step = Math.hypot(homes[i].x - homes[i - 1].x, homes[i].y - homes[i - 1].y), last = out[i - 1].position;
    out.push({ position: new THREE.Vector3(last.x + Math.cos(angle) * step, last.y + Math.sin(angle) * step, homes[i].z), roll: angle - seated });
  }
  return out;
}

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
  const magazine = model.getObjectByName(`${FPS_WEAPONS[index].id}__magazine`);
  if (index === 2) { right.position.set(.026, .11, .075); support.set(-.032, .1, .06); magazineGrip.set(-.025, .075, .09); }
  if (index === 3) { right.position.set(.03, .055, .15); support.set(-.04, .125, -.25); magazineGrip.set(-.12, .07, .015); }
  if (index === 4) { right.position.set(.115, .1, .23); support.set(-.115, .1, .23); magazineGrip.set(-.15, .12, -.03); }
  const id = FPS_WEAPONS[index].id, enemy = isEnemyWeaponId(id) ? ENEMY_WEAPON_LAYOUT[id] : undefined;
  if (enemy) { right.position.fromArray(enemy.hands.right); support.fromArray(enemy.hands.support); magazineGrip.fromArray(enemy.hands.magazine); }
  const magazineScale = magazine?.scale.clone();
  const magazineHome = magazine?.position.clone() ?? new THREE.Vector3();
  const magazineRotation = magazine?.rotation.clone() ?? new THREE.Euler();
  // Animated control is decorative; gameplay ammunition remains owned by weapon rules.
  const authoredControl = index >= 3 ? model.getObjectByName(`${FPS_WEAPONS[index].id}__charging-handle`) : undefined;
  const control = authoredControl ?? box(additions, .023, .014, .025, .049, index ? .211 : .257, index ? .05 : .10, steel);
  if (index === 2) { control.scale.setScalar(.4); control.position.set(.026, .171, .05); }
  // The SAR 21 cocks like a FAMAS: a lever on the receiver top, under the optic
  // bridge between its legs, run back along a slot towards the rear leg.
  const side = handleSide(FPS_WEAPONS[index].id);
  if (side === 'top') {
    control.scale.set(.6, 1.55, .9); control.position.set(0, .277, -.085);
    box(additions, .007, .002, .105, 0, .2655, -.045, pad);
  }
  // Where the support hand takes the handle: from the left under the optic for
  // a top lever, otherwise from outside the right side; palm to the receiver.
  const grip = side === 'top' ? { x: -.052, y: .004, turn: 1.77 } : { x: .035, y: .01, turn: -1.2 };
  if (index >= 3 && !authoredControl) control.position.set(index === 4 ? .095 : .063, FPS_WEAPONS[index].sightHeight - .07, .04);
  const cover = index >= 3 ? model.getObjectByName(`${FPS_WEAPONS[index].id}__feed-cover`) : undefined;
  const coverHome = cover?.rotation.clone();
  const belt = index >= 3 ? model.getObjectByName(`${FPS_WEAPONS[index].id}__feed-belt`) : undefined;
  const rounds = magazine ? belt?.children.filter(round => round.name.endsWith('__belt-round')) ?? [] : [];
  const roundHomes = rounds.map(round => round.position.clone()), hanging = hangingBelt(roundHomes);
  const carried = new THREE.Vector3(), taut = new THREE.Vector3();
  const controlZ = control.position.z;
  const bipod = createBipodMotion(model, FPS_WEAPONS[index].id);
  return {
    get bipodDeployment() { return bipod.progress; },
    resetBipod: bipod.reset,
    get aimHeight() { return getWeaponSight(model)?.aimHeight ?? FPS_WEAPONS[index].sightHeight; },
    get aimDepth() { return getWeaponSight(model)?.aimDepth ?? enemy?.aimDepth ?? (index === 2 ? -.52 : index === 3 ? MACHINE_GUN_LAYOUT['mag-inspired'].aimDepth : index === 4 ? MACHINE_GUN_LAYOUT['cis50-inspired'].aimDepth : -.36); },
    update(progress: number | null, empty: boolean, bipodInput?: BipodMotionInput, ready?: number, reload?: { pouch: THREE.Vector3 | null; magazineOut: boolean; pending: boolean; capacity: number; baseCapacity?: number; saved: number }) {
      bipod.update(bipodInput);
      const motionProgress = progress ?? (reload?.magazineOut ? reload.saved : 0);
      const motion = ready === undefined ? reloadMotion(motionProgress, empty, side) : readyMotion(ready, side);
      if (cover && coverHome) { cover.rotation.copy(coverHome); cover.rotation.x -= motion.handToMagazine * .9; }
      if (belt) belt.visible = motion.magazineVisible;
      if (magazine) {
        magazine.position.copy(magazineHome); magazine.position.y -= motion.magazineDrop;
        magazine.rotation.copy(magazineRotation); magazine.rotation.z += motion.magazineDrop * -.35;
        magazine.visible = reload?.magazineOut && !reload.pending ? false : motion.magazineVisible;
      }
      // The belt stays fed from the box mouth. Seated, it runs to the tray, drawn
      // taut while the box is away; peeled out, it hangs and curls from the box.
      const drop = motion.magazineDrop, turn = drop * -.35;
      const carry = (point: THREE.Vector3, out: THREE.Vector3) => {
        out.copy(point).sub(magazineHome).applyAxisAngle(Z_AXIS, turn).add(magazineHome); out.y -= drop; return out;
      };
      rounds.forEach((round, i) => {
        const along = i / Math.max(1, rounds.length - 1);
        taut.lerpVectors(carry(roundHomes[i], carried), roundHomes[i], along);
        carry(hanging[i].position, carried);
        round.position.lerpVectors(carried, taut, motion.beltSeated);
        round.rotation.z = THREE.MathUtils.lerp(hanging[i].roll + turn, turn * (1 - along), motion.beltSeated);
      });
      left.position.copy(support).lerp(magazineGrip, motion.handToMagazine);
      left.position.y -= motion.magazineDrop * motion.handToMagazine;
      left.rotation.set(-.15 + motion.handToMagazine * .3, -.2 + motion.handToHandle * grip.turn, .32 - motion.handToMagazine * .35 - motion.handToHandle * .3);
      // From empty the support hand takes the handle and draws it the full stroke.
      const stroke = motion.action * (index === 2 ? .035 : .075);
      if (progress !== null || ready !== undefined) left.position.lerp(new THREE.Vector3(control.position.x + grip.x, control.position.y + grip.y, controlZ + .01 + stroke), motion.handToHandle);
      // Reach the real pouch, then carry that magazine to the weapon. Pouch
      // coordinates are camera-space, converted through this weapon's pose.
      const time = motionProgress * reloadLength(empty);
      if (reload?.pouch && ready === undefined && time >= .34 && time < .74) {
        model.updateWorldMatrix(true, false);
        const pouch = model.worldToLocal(reload.pouch.clone());
        const reach = smoothStep((time - .34) / .13), seat = smoothStep((time - .47) / .27);
        const grasp = pouch.clone().add(magazineGrip.clone().sub(magazineHome));
        left.position.lerp(grasp, reach * (1 - seat));
        if (magazine && reload.pending) {
          magazine.position.lerpVectors(pouch, magazineHome, seat);
          magazine.rotation.copy(magazineRotation);
          magazine.rotation.z += (1 - seat) * -.4;
          magazine.visible = true;
          left.position.copy(magazine.position).add(magazineGrip.clone().sub(magazineHome));
        }
      }
      if (magazine) {
        magazine.userData.loadedCapacity = reload?.capacity ?? FPS_WEAPONS[index].capacity;
        if (reload && magazineScale) magazine.scale.y = magazineScale.y * Math.max(.75, Math.min(1.4, reload.capacity / (reload.baseCapacity ?? FPS_WEAPONS[index].capacity)));
      }
      control.position.z = controlZ + stroke;
    },
    dispose() {
      bipod.reset(); control.position.z = controlZ; rounds.forEach((round, i) => { round.position.copy(roundHomes[i]); round.rotation.z = 0; });
      additions.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
