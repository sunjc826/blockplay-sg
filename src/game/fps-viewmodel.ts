import { EMPTY_RELOAD, FPS_WEAPONS, reloadLength } from './fps-rules';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boltCycleMotion, cockingHandRelease, handleSide, reloadMotion, readyMotion, smoothStep } from './fps-weapon-motion';
import { createPouchReload, type PouchReloadSource } from './fps-pouch-reload';
import { getWeaponSight } from './weapon-optics';
import { createBipodMotion, type BipodMotionInput } from './weapon-bipod';
import { MACHINE_GUN_LAYOUT } from './machine-gun-layout';
import { ENEMY_WEAPON_LAYOUT, isEnemyWeaponId } from './enemy-weapon-layout';
import { updateMagazineAmmo } from './magazine-ammo';
import { beltPouchTime, createBeltReload } from './fps-belt-reload';

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
    const group = new THREE.Group(); group.name = left ? 'reload-hand-left' : 'reload-hand-right'; additions.add(group);
    box(group, .062, .077, .044, 0, 0, 0);
    box(group, .052, .035, .009, 0, .016, .025, pad);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Group(); finger.name = `grip-finger-${i}`; finger.position.set(-.023 + i * .015, .025, -.005); group.add(finger);
      box(finger, .013, .045 - Math.abs(i - 1) * .003, .017, 0, .019, -.003);
      box(finger, .012, .016, .01, 0, .004, .027, pad);
    }
    const thumb = box(group, .019, .045, .025, left ? .035 : -.035, -.002, -.014); thumb.rotation.z = left ? -.55 : .55; thumb.name = 'grip-thumb';
    const stub = mesh(group, new THREE.CylinderGeometry(.034, .046, .16, 8), sleeve, 0, -.13, .028); stub.rotation.x = -.28; stub.name = 'hand-forearm-stub';
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
  const proxy = model.userData.proxyHands;
  if (proxy) { right.position.fromArray(proxy.right); support.fromArray(proxy.support); magazineGrip.fromArray(proxy.magazine); }
  const pistol = id === 'p30-inspired';
  // Palm spans the slide: finger rows run along its length and curl down its
  // right side; the thumb closes on the left. Local -Z is the palm underside.
  const pistolGripRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
  const pistolThumbHome = left.getObjectByName('grip-thumb')!.position.clone();
  const pistolSlide = pistol ? model.children.filter(part => ['slide', 'slide-serration', 'front-sight', 'rear-sight'].some(name => part.name === `${id}__${name}`))
    .map(part => ({ part, z: part.position.z })) : [];
  const manualBolt = FPS_WEAPONS[index].action === 'bolt';
  const rightCharges = FPS_WEAPONS[index].feed === 'belt' || manualBolt;
  const releaseFlick = FPS_WEAPONS[index].feed !== 'belt' && FPS_WEAPONS[index].feed !== 'drum';
  const flickStart = new THREE.Vector3(), flickOut = new THREE.Vector3(), flickArc = new THREE.Vector3();
  const flickRotation = new THREE.Quaternion(), flickTurn = new THREE.Quaternion();
  const supportRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.15, -.2, .32));
  const rightHome = right.position.clone(), rightRotation = right.quaternion.clone();
  const chargeTarget = new THREE.Vector3(), chargeWaypoint = new THREE.Vector3();
  const chargeRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.15, -1.4, .02));
  const magazineScale = magazine?.scale.clone();
  const magazineHome = magazine?.position.clone() ?? new THREE.Vector3();
  const magazineRotation = magazine?.rotation.clone() ?? new THREE.Euler();
  // Animated control is decorative; gameplay ammunition remains owned by weapon rules.
  const authoredControl = index >= 3 ? model.getObjectByName(`${FPS_WEAPONS[index].id}__charging-handle`) : undefined;
  const control = authoredControl ?? box(additions, .023, .014, .025, .049, index ? .211 : .257, index ? .05 : .10, steel);
  if (!authoredControl) control.name = `${id}__charging-handle`;
  if (pistol) {
    // A hidden slide-top anchor replaces the decorative rifle-style side lever.
    control.position.set(0, .2245, .015); control.visible = false;
  }
  // The SAR 21 cocks like a FAMAS: a lever on the receiver top, under the optic
  // bridge between its legs, run back along a slot towards the rear leg.
  const side = handleSide(FPS_WEAPONS[index].id);
  if (side === 'top') {
    control.scale.set(.6, 1.55, .9); control.position.set(0, .277, -.085);
    box(additions, .007, .002, .105, 0, .2655, -.045, pad);
  }
  // Belt-fed guns use the right hand on their right-side handle. Other guns
  // retain their support-hand pose, including the SAR's top lever.
  const grip = pistol ? { x: .011, y: .022, turn: 0 } : side === 'top' ? { x: -.052, y: .004, turn: 1.77 } : { x: .035, y: .01, turn: -1.2 };
  if (index >= 3 && !authoredControl) control.position.set(index === 4 ? .095 : .063, FPS_WEAPONS[index].sightHeight - .07, .04);
  const cover = index >= 3 ? model.getObjectByName(`${FPS_WEAPONS[index].id}__feed-cover`) : undefined;
  const belt = index >= 3 ? model.getObjectByName(`${FPS_WEAPONS[index].id}__feed-belt`) : undefined;
  const controlZ = control.position.z, controlRoll = control.rotation.z;
  const bipod = createBipodMotion(model, FPS_WEAPONS[index].id);
  const pouchReload = createPouchReload(model, left, magazine, sleeve);
  const beltReload = magazine && belt && cover ? createBeltReload(model, magazine, belt, cover, left) : undefined;
  return {
    get boltCycle() { return manualBolt ? { travel: control.position.z - controlZ, lift: controlRoll - control.rotation.z } : null; },
    get reloadReach() { return pouchReload.debug; },
    get beltAmmo() { return beltReload?.ammo ?? null; },
    get beltReload() { return beltReload?.debug ?? null; },
    get bipodDeployment() { return bipod.progress; },
    resetBipod: bipod.reset,
    /** Takes the support hand off the weapon, while the left hand is busy with something else. */
    setSupportHand(on: boolean) { left.visible = on; },
    get aimHeight() { return getWeaponSight(model)?.aimHeight ?? FPS_WEAPONS[index].sightHeight; },
    get aimDepth() { return getWeaponSight(model)?.aimDepth ?? enemy?.aimDepth ?? (index === 2 ? -.52 : index === 3 ? MACHINE_GUN_LAYOUT['mag-inspired'].aimDepth : index === 4 ? MACHINE_GUN_LAYOUT['cis50-inspired'].aimDepth : -.36); },
    update(progress: number | null, empty: boolean, bipodInput?: BipodMotionInput, ready?: number, reload?: { source?: PouchReloadSource; magazineOut: boolean; pending: boolean; capacity: number; baseCapacity?: number; saved: number }, ammunition?: { rounds: number; capacity: number; cycle?: number }) {
      if (ammunition) updateMagazineAmmo(model, ammunition.rounds, ammunition.capacity);
      bipod.update(bipodInput);
      const motionProgress = progress ?? (reload?.magazineOut ? reload.saved : 0);
      const motion = ready === undefined ? reloadMotion(motionProgress, empty, side) : readyMotion(ready, side);
      if (magazine) {
        magazine.position.copy(magazineHome); magazine.position.y -= motion.magazineDrop;
        magazine.rotation.copy(magazineRotation); magazine.rotation.z += motion.magazineDrop * -.35;
        magazine.visible = reload?.magazineOut && !reload.pending ? false : motion.magazineVisible;
      }
      left.position.copy(support).lerp(magazineGrip, motion.handToMagazine);
      left.position.y -= motion.magazineDrop * motion.handToMagazine;
      const leftToHandle = rightCharges ? 0 : motion.handToHandle;
      left.rotation.set(-.15 + motion.handToMagazine * .3, -.2 + leftToHandle * grip.turn, .32 - motion.handToMagazine * .35 - leftToHandle * .3);
      const cycle = manualBolt && progress === null && ready === undefined && ammunition?.cycle !== undefined ? boltCycleMotion(ammunition.cycle) : undefined;
      const strokeLength = index === 2 ? .035 : .075;
      const stroke = (cycle?.travel ?? motion.action) * strokeLength;
      const cockTime = ready === undefined ? (empty && progress !== null ? motionProgress * reloadLength(empty) : 0)
        : .80 + (EMPTY_RELOAD.length - .80) * ready;
      const flick = cockingHandRelease(releaseFlick ? cockTime : 0);
      const releaseGrip = ready === undefined && empty && progress !== null ? smoothStep((motionProgress * reloadLength(empty) - 1.15) / .03) : 0;
      // Let the action fly forward independently of the hand that released it.
      const handStroke = releaseGrip > 0 && !cycle ? Math.max(stroke, strokeLength * releaseGrip) : stroke;
      if (progress !== null || ready !== undefined) {
        chargeTarget.set(control.position.x + grip.x, control.position.y + grip.y, controlZ + .01 + handStroke);
        if (pistol && leftToHandle > 0) {
          // Move clear of the frame first, rise outside the slide, then lower
          // a flat palm onto its top. A diagonal reach would cut through it.
          chargeWaypoint.set(-.105, chargeTarget.y + .065, chargeTarget.z);
          if (leftToHandle < .28) left.position.x = THREE.MathUtils.lerp(left.position.x, chargeWaypoint.x, smoothStep(leftToHandle / .28));
          else if (leftToHandle < .68) {
            left.position.x = chargeWaypoint.x;
            left.position.lerp(chargeWaypoint, smoothStep((leftToHandle - .28) / .40));
          } else left.position.copy(chargeWaypoint).lerp(chargeTarget, smoothStep((leftToHandle - .68) / .32));
          left.quaternion.slerp(pistolGripRotation, smoothStep((leftToHandle - .28) / .40));
        } else left.position.lerp(chargeTarget, leftToHandle);
      }
      right.position.copy(rightHome); right.quaternion.copy(rightRotation);
      const rightToHandle = cycle?.hand ?? (rightCharges && (progress !== null || ready !== undefined) ? motion.handToHandle : 0);
      if (rightToHandle > 0) {
        chargeTarget.set(control.position.x + grip.x, control.position.y + grip.y, controlZ + .01 + handStroke);
        // Clear the receiver sideways before raising the hand. Reverse the
        // same outside path on the way back to the firing grip.
        chargeWaypoint.set(chargeTarget.x + .06, rightHome.y, rightHome.z);
        if (rightToHandle < .4) right.position.lerp(chargeWaypoint, smoothStep(rightToHandle / .4));
        else right.position.copy(chargeWaypoint).lerp(chargeTarget, smoothStep((rightToHandle - .4) / .6));
        right.quaternion.slerp(chargeRotation, rightToHandle);
      }
      if (flick.active) {
        const hand = rightCharges ? right : left, home = rightCharges ? rightHome : support;
        const homeRotation = rightCharges ? rightRotation : supportRotation;
        const outward = pistol || side === 'top' ? -1 : 1;
        flickStart.set(control.position.x + grip.x, control.position.y + grip.y, controlZ + .01 + strokeLength);
        // Stay behind the rear stop as the fingers open; no forward escort of
        // the handle. The lateral/upward clearance makes the release readable.
        flickOut.copy(flickStart).add(new THREE.Vector3(outward * (pistol ? .15 : .105), .045, .045));
        if (flick.returnToGrip === 0) hand.position.copy(flickStart).lerp(flickOut, flick.clear);
        else {
          // Keep the wrist outside the receiver while moving toward its grip.
          flickArc.set(flickOut.x + outward * .035, home.y + .075, home.z);
          const t = flick.returnToGrip;
          hand.position.copy(flickOut).multiplyScalar((1 - t) ** 2)
            .addScaledVector(flickArc, 2 * (1 - t) * t).addScaledVector(home, t * t);
        }
        if (pistol) flickRotation.copy(pistolGripRotation);
        else if (rightCharges) flickRotation.copy(chargeRotation);
        else flickRotation.setFromEuler(new THREE.Euler(-.15, -.2 + grip.turn, .02));
        flickTurn.setFromEuler(new THREE.Euler(-.25, outward * .35, outward * .7));
        flickTurn.premultiply(flickRotation);
        hand.quaternion.copy(flickRotation).slerp(flickTurn, flick.clear).slerp(homeRotation, flick.returnToGrip);
      }
      for (let finger = 0; finger < 4; finger++) right.getObjectByName(`grip-finger-${finger}`)!.rotation.x = rightToHandle * (1 - Math.max(releaseGrip, rightCharges ? flick.open : 0)) * 1.07;
      right.getObjectByName('grip-thumb')!.rotation.z = .55 + rightToHandle * .35 - (rightCharges ? flick.open * .35 : 0);
      if (magazine) {
        magazine.userData.loadedCapacity = reload?.capacity ?? FPS_WEAPONS[index].capacity;
        if (reload && magazineScale) magazine.scale.y = magazineScale.y * Math.max(.75, Math.min(1.4, reload.capacity / (reload.baseCapacity ?? FPS_WEAPONS[index].capacity)));
      }
      const time = motionProgress * reloadLength(empty);
      const beltActive = ready === undefined && (progress !== null || reload?.magazineOut === true || (reload?.saved ?? 0) > 0);
      const beltTime = (progress ?? reload?.saved ?? 0) * reloadLength(empty);
      beltReload?.prepare(beltTime, beltActive, reload, ammunition, empty);
      const reaching = pouchReload.update(ready === undefined ? beltReload ? beltPouchTime(beltTime) : time : 0,
        reload?.pending === true, reload?.source, beltReload ? { mountMatrix: beltReload.mountMatrix, deferArm: true } : undefined);
      beltReload?.update(pouchReload);
      const connected = beltReload && beltActive ? pouchReload.updateArm(reload?.source, true) : reaching;
      const stub = left.getObjectByName('hand-forearm-stub'); if (stub) stub.visible = !connected;
      let closed = beltReload && beltActive ? beltReload.grip : reaching ? smoothStep((time - .425) / .045) * (1 - smoothStep((time - .76) / .08)) : .35;
      if (leftToHandle > 0 && !reaching) closed = THREE.MathUtils.lerp(closed, .95 * (1 - releaseGrip), leftToHandle);
      if (reaching && !beltReload && time >= .70) closed *= 1 - smoothStep((time - .70) / .02) * (1 - smoothStep((time - .78) / .06));
      if (!rightCharges) closed *= 1 - flick.open;
      for (let finger = 0; finger < 4; finger++) left.getObjectByName(`grip-finger-${finger}`)!.rotation.x = .12 + closed * .95;
      const thumb = left.getObjectByName('grip-thumb')!;
      thumb.rotation.z = -.55 - closed * .35;
      if (pistol) {
        const clasp = leftToHandle * (1 - flick.clear);
        for (let finger = 0; finger < 4; finger++) {
          const joint = left.getObjectByName(`grip-finger-${finger}`)!;
          joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x, -1.1, clasp);
        }
        thumb.position.copy(pistolThumbHome).lerp(new THREE.Vector3(.02, -.058, -.025), clasp);
        thumb.rotation.z *= 1 - clasp;
        pistolSlide.forEach(({ part, z }) => { part.position.z = z + stroke; });
      }
      control.position.z = controlZ + stroke;
      control.rotation.z = controlRoll - (cycle?.lift ?? (manualBolt ? motion.action : 0)) * .9;
    },
    dispose() {
      pistolSlide.forEach(({ part, z }) => { part.position.z = z; });
      pouchReload.dispose(); beltReload?.dispose(); bipod.reset(); control.position.z = controlZ; control.rotation.z = controlRoll;
      additions.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
