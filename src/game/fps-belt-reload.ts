import * as THREE from 'three';
import { smoothStep } from './fps-weapon-motion';
import type { createPouchReload, PouchReloadSource } from './fps-pouch-reload';

const ease = (t: number, a: number, b: number) => smoothStep((t - a) / (b - a));
/** Seat the physical box before placing the belt and closing the cover. The
 * ammunition still commits at the existing .74 gameplay event. */
export function beltPouchTime(time: number) {
  const keys = [[0, 0], [.38, .38], [.47, .47], [.54, .56], [.60, .67], [.64, .74], [.70, .84]];
  for (let i = 1; i < keys.length; i++) if (time <= keys[i][0]) {
    const [a, x] = keys[i - 1], [b, y] = keys[i];
    return THREE.MathUtils.lerp(x, y, (time - a) / (b - a));
  }
  return .84 + time - .70;
}

interface Reload { magazineOut: boolean; pending: boolean; capacity: number; source?: PouchReloadSource }
type Pouch = ReturnType<typeof createPouchReload>;

/** A deterministic articulated belt: one anchor while hanging, two while
 * held/laid into the tray. Every segment retains its authored length. */
export function createBeltReload(model: THREE.Group, magazine: THREE.Object3D, belt: THREE.Object3D, cover: THREE.Object3D, hand: THREE.Object3D) {
  const rounds = belt.children.filter(round => round.name.endsWith('__belt-round'));
  const homes = rounds.map(round => round.position.clone()), rotations = rounds.map(round => round.quaternion.clone());
  const visibility = rounds.map(round => round.visible), beltVisible = belt.visible;
  const lengths = homes.slice(1).map((point, i) => point.distanceTo(homes[i]));
  const points = homes.map(point => point.clone()), free = homes.map(point => point.clone());
  const homePosition = magazine.position.clone(), homeRotation = magazine.quaternion.clone(), coverRotation = cover.quaternion.clone();
  magazine.updateMatrix();
  const mouth = homes[0].clone().applyMatrix4(magazine.matrix.clone().invert()), seatedMouth = homes[0].clone();
  const mountMatrix = new THREE.Matrix4(), boxMatrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const modelToBelt = new THREE.Matrix4(), modelToHand = new THREE.Matrix4();
  const base = new THREE.Vector3(), down = new THREE.Vector3(), outward = new THREE.Vector3(), heading = new THREE.Vector3();
  const desired = new THREE.Vector3(), contact = new THREE.Vector3(), tip = new THREE.Vector3(), anchor = new THREE.Vector3();
  const delta = new THREE.Vector3(), local = new THREE.Vector3(), coverPoint = new THREE.Vector3(), lastCoverPoint = new THREE.Vector3();
  const finger = new THREE.Vector3(0, .045, .018), link = new THREE.Vector3(0, .004, -.01);
  const beltPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(.35, .1, -.7));
  const coverPose = new THREE.Quaternion(), gripPose = new THREE.Quaternion();
  const coverHand = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.7, 0, -.25));
  const swing = new THREE.Quaternion(), axis = new THREE.Vector3();
  const latch = cover.getObjectByName(`${model.name}__cover-latch`) ?? cover.children.find(node => node.name.endsWith('__cover-latch'));
  const contactMarker = new THREE.Object3D(); contactMarker.name = 'belt-hand-contact'; contactMarker.position.copy(finger); hand.add(contactMarker);
  let time = 0, active = false, fromEmpty = false, count = rounds.length, first = 0, carried = false;
  let out = false, pending = false, phase = 'idle', attachment = 'tray', source: PouchReloadSource | undefined;
  let handTarget: THREE.Vector3 | null = null, handWeight = 0, spacingError = 0;

  function handAt(point: THREE.Vector3, weight: number, rotation = beltPose) {
    modelToHand.copy(hand.parent!.matrixWorld).invert().multiply(model.matrixWorld);
    desired.copy(point).applyMatrix4(modelToHand);
    hand.quaternion.slerp(rotation, weight);
    local.copy(finger).applyQuaternion(hand.quaternion);
    desired.sub(local); hand.position.lerp(desired, weight);
    handTarget = point; handWeight = weight;
  }
  function hanging(start: number) {
    free[start].copy(base);
    for (let i = start + 1; i < rounds.length; i++) {
      const along = (i - start) / Math.max(1, rounds.length - start - 1);
      heading.copy(outward).lerp(down, ease(along, .15, .85));
      if (heading.lengthSq() < 1e-12) heading.copy(outward);
      heading.normalize();
      free[i].copy(free[i - 1]).addScaledVector(heading, lengths[i - 1]);
    }
  }
  function solve(start: number, end: THREE.Vector3) {
    anchor.copy(points[start]);
    for (let iteration = 0; iteration < 96; iteration++) {
      points[points.length - 1].copy(end);
      for (let i = points.length - 2; i >= start; i--) {
        delta.subVectors(points[i], points[i + 1]).normalize(); points[i].copy(points[i + 1]).addScaledVector(delta, lengths[i]);
      }
      points[start].copy(anchor);
      for (let i = start + 1; i < points.length; i++) {
        delta.subVectors(points[i], points[i - 1]).normalize(); points[i].copy(points[i - 1]).addScaledVector(delta, lengths[i - 1]);
      }
      if (points[points.length - 1].distanceToSquared(end) < 1e-12) break;
    }
  }

  return {
    mountMatrix,
    get ammo() { return { total: rounds.length, remaining: count, visible: belt.visible ? count : 0 }; },
    get grip() { return phase === 'grasp-belt' || phase === 'lay-belt' ? .9 : .6; },
    get debug() {
      contact.copy(finger).applyMatrix4(hand.matrixWorld).applyMatrix4(inverse);
      return { time, phase, attachment, carried, count, boxAnchor: base.toArray(), firstRound: count ? points[first].toArray() : null,
        tip: count ? points[points.length - 1].toArray() : null, handContact: contact.toArray(),
        handError: handTarget && handWeight >= 1 - 1e-12 ? contact.distanceTo(handTarget) : null, spacingError };
    },
    prepare(t: number, moving: boolean, reload?: Reload, ammunition?: { rounds: number; capacity: number }, empty = false) {
      time = t; active = moving; fromEmpty = empty; source = reload?.source;
      out = reload?.magazineOut ?? (active && time >= .38 && time < .74);
      pending = reload?.pending ?? (active && time >= .47 && time < .74);
      count = Math.max(0, Math.min(rounds.length, Math.floor(pending && time >= .47 ? reload?.capacity ?? rounds.length : ammunition?.rounds ?? rounds.length)));
      first = rounds.length - count; handTarget = null; handWeight = 0; spacingError = 0;
      // Capacity changes grow down from the mount, keeping the feed exit fixed.
      mountMatrix.compose(homePosition, homeRotation, magazine.scale);
      base.copy(mouth).applyMatrix4(mountMatrix);
      magazine.position.copy(homePosition).add(seatedMouth).sub(base); magazine.quaternion.copy(homeRotation);
      mountMatrix.compose(magazine.position, homeRotation, magazine.scale);
      const drop = active ? .26 * ease(time, .30, .38) : 0;
      if (active && time < .38) { magazine.position.y -= drop; magazine.rotateZ(-drop * .35); }
      if (active && pending && time < .64) {
        // Fallback for previews without a body pouch. The real carry pose below
        // comes from the actual hand-carried box through magazineMatrix().
        const amount = 1 - ease(time, .54, .64);
        magazine.position.add(new THREE.Vector3(-.08, -.16, .04).multiplyScalar(amount));
      }
      magazine.visible = !out || pending && time >= .47;
      cover.quaternion.copy(coverRotation);
      if (active) cover.rotateX(-1.25 * ease(time, .06, .18) * (1 - ease(time, .72, .74)));
    },
    update(pouch: Pouch) {
      model.updateWorldMatrix(true, true); inverse.copy(model.matrixWorld).invert();
      magazine.updateMatrix(); boxMatrix.copy(magazine.matrix);
      carried = active && pending && time < .64 && pouch.magazineMatrix(boxMatrix);
      if (carried) magazine.visible = false;
      else if (active && pending && time >= .64) magazine.visible = true;
      base.copy(mouth).applyMatrix4(boxMatrix);
      down.set(0, -1, 0); if (source) down.transformDirection(source.worldToView); down.transformDirection(inverse);
      outward.set(-1, .08, 0).transformDirection(boxMatrix);
      if (active && time >= .47 && time < .64)
        outward.applyAxisAngle(down, .045 * Math.sin((time - .47) * 35) * Math.sin(Math.PI * (time - .47) / .17));
      if (latch) coverPoint.set(0, .007, 0).applyMatrix4(latch.matrixWorld).applyMatrix4(inverse);
      else coverPoint.set(0, .02, .22).applyMatrix4(cover.matrixWorld).applyMatrix4(inverse);
      coverPose.copy(cover.quaternion).multiply(coverHand);
      const fresh = active && time >= .47 && (pending || !out);
      phase = !active ? 'idle' : time < .18 ? 'open-cover' : time < .38 ? 'remove-box' : time < .47 ? 'reach-box'
        : time < .60 ? 'carry-box' : time < .64 ? 'seat-box' : time < .66 ? 'grasp-belt' : time < .69 ? 'lay-belt'
        : time < .74 ? 'close-cover' : time < .84 || !fromEmpty ? 'return' : 'charge';
      belt.visible = count > 0 && (!out || fresh);
      homes.forEach((point, i) => points[i].copy(point));
      attachment = 'tray';
      if (active && count && (fresh || time > .22 && time < .38)) {
        hanging(first);
        if (fresh) {
          attachment = time < .66 ? 'box' : time < .69 ? 'box-and-hand' : 'box-and-tray';
          const lay = ease(time, .66, .69);
          for (let i = first; i < points.length; i++) points[i].lerpVectors(free[i], homes[i], lay);
          points[first].copy(base);
          tip.copy(free[points.length - 1]).lerp(homes[points.length - 1], lay);
          solve(first, tip);
        } else {
          attachment = time < .28 ? 'hand' : 'box';
          const peel = ease(time, .22, .28);
          points[first].lerpVectors(homes[first], base, peel);
          for (let i = first + 1; i < points.length; i++) {
            heading.subVectors(homes[i], homes[i - 1]).normalize();
            delta.subVectors(free[i], free[i - 1]).normalize(); heading.lerp(delta, peel).normalize();
            points[i].copy(points[i - 1]).addScaledVector(heading, lengths[i - 1]);
          }
        }
      }
      // Positions and orientations are expressed in gun space; ancestor pose,
      // body projection and pouch scale cannot detach the belt from its anchor.
      modelToBelt.copy(belt.matrixWorld).invert().multiply(model.matrixWorld);
      rounds.forEach((round, i) => {
        round.visible = i >= first;
        round.position.copy(points[i]).applyMatrix4(modelToBelt);
        round.quaternion.copy(rotations[i]);
        if (active && count && i >= first) {
          const a = i === points.length - 1 ? Math.max(first, i - 1) : i, b = Math.min(points.length - 1, a + 1);
          if (a !== b) {
            axis.subVectors(homes[b], homes[a]).normalize(); heading.subVectors(points[b], points[a]).normalize();
            swing.setFromUnitVectors(axis, heading); round.quaternion.premultiply(swing);
          }
          if (i > first) spacingError = Math.max(spacingError, Math.abs(points[i].distanceTo(points[i - 1]) - lengths[i - 1]));
        }
      });
      if (!active) return;
      if (time <= .18) handAt(coverPoint, ease(time, 0, .06), coverPose);
      else if (time < .38) {
        desired.copy(count ? points[first] : base).add(link);
        lastCoverPoint.copy(coverPoint).lerp(desired, ease(time, .18, .22));
        handAt(lastCoverPoint, 1);
      } else if (fresh && time < .64 && !carried) handAt(base, 1);
      else if (time >= .64 && time < .69 && count) {
        tip.copy(points[points.length - 1]).add(link); handAt(tip, ease(time, .64, .66));
      } else if (time >= .69 && time < .74) {
        tip.copy(points[points.length - 1]).add(link).lerp(coverPoint, ease(time, .69, .72));
        gripPose.copy(beltPose).slerp(coverPose, ease(time, .69, .72)); handAt(tip, 1, gripPose);
      } else if (time >= .74 && time < .84) handAt(coverPoint, 1 - ease(time, .74, .84), coverPose);
      hand.updateWorldMatrix(true, true);
    },
    dispose() {
      belt.visible = beltVisible; cover.quaternion.copy(coverRotation);
      magazine.position.copy(homePosition); magazine.quaternion.copy(homeRotation);
      rounds.forEach((round, i) => { round.position.copy(homes[i]); round.quaternion.copy(rotations[i]); round.visible = visibility[i]; });
      contactMarker.removeFromParent();
    },
  };
}
