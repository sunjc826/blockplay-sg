import * as THREE from 'three';
import { RELOAD_POINTS, reloadLength } from './fps-rules';
import { smoothStep } from './fps-weapon-motion';

export interface PouchReloadSource {
  model: THREE.Object3D;
  /** Converts the body's world into the foreground camera's projection. */
  worldToView: THREE.Matrix4;
  shoulder: THREE.Vector3;
}
export type PouchReloadPhase = 'reach' | 'grip' | 'extract' | 'carry' | 'insert' | 'return';
const Y = new THREE.Vector3(0, 1, 0);
const ease = (time: number, start: number, end: number) => smoothStep((time - start) / (end - start));
function localBounds(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const result = new THREE.Box3(), inverse = object.matrixWorld.clone().invert();
  object.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.computeBoundingBox();
    if (node.geometry.boundingBox) result.union(node.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld)));
  });
  return result;
}
const pose = new THREE.Quaternion().setFromEuler(new THREE.Euler(.12, -.18, -.22));

/** Park the gun to the right while the support hand works on the carrier. */
export function pouchWeaponOffset(progress: number | null, empty: boolean) {
  const time = (progress ?? 0) * reloadLength(empty);
  const weight = ease(time, .30, .40) * (1 - ease(time, .74, .90));
  return { x: .105 * weight, y: .025 * weight, z: .025 * weight, yaw: -.12 * weight, roll: .12 * weight };
}

/** A separate, body-sourced magazine follows the palm, rather than sliding the
 * gun's seated mesh toward an approximate pouch position. Geometry is borrowed
 * from the body; this object owns only its two arm meshes. */
export function createPouchReload(model: THREE.Object3D, hand: THREE.Object3D, magazine: THREE.Object3D | undefined, sleeve: THREE.Material) {
  const root = new THREE.Group(); root.name = 'pouch-reload'; model.add(root);
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const upper = new THREE.Mesh(geometry, sleeve), forearm = new THREE.Mesh(geometry, sleeve);
  upper.name = 'reload-upper-arm'; forearm.name = 'reload-forearm'; root.add(upper, forearm);
  let source: THREE.Object3D | undefined, carried: THREE.Object3D | undefined;
  const sourceCentre = new THREE.Vector3(), sourceSize = new THREE.Vector3();
  const sourceMatrix = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const sourcePosition = new THREE.Vector3(), sourceRotation = new THREE.Quaternion(), sourceScale = new THREE.Vector3();
  const from = new THREE.Vector3(), lift = new THREE.Vector3(), to = new THREE.Vector3(), lead = new THREE.Vector3(), control = new THREE.Vector3();
  const centre = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), targetRotation = new THREE.Quaternion();
  const grip = new THREE.Vector3(), shoulder = new THREE.Vector3(), wrist = new THREE.Vector3(), elbow = new THREE.Vector3(), direction = new THREE.Vector3(), pole = new THREE.Vector3();
  const magazineBounds = magazine ? localBounds(magazine) : new THREE.Box3();
  const wellCentre = magazineBounds.getCenter(new THREE.Vector3()), wellSize = magazineBounds.getSize(new THREE.Vector3());
  const wellPosition = magazine?.position.clone() ?? new THREE.Vector3(), wellRotation = magazine?.quaternion.clone() ?? new THREE.Quaternion();
  const wellMatrix = new THREE.Matrix4(), targetSize = new THREE.Vector3(), targetScale = new THREE.Vector3();
  let debug: { phase: PouchReloadPhase; hand: number[]; magazine: number[] | null; source: number[]; sourceVisible: boolean } | null = null;
  function segment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const delta = b.clone().sub(a);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.scale.set(radius, delta.length(), radius);
    mesh.quaternion.setFromUnitVectors(Y, delta.normalize());
  }
  function hide() { root.visible = false; debug = null; }
  hide();
  return {
    get debug() { return debug; },
    update(time: number, pending: boolean, input?: PouchReloadSource) {
      hide();
      if (!input || !magazine || time < RELOAD_POINTS.out || time >= .84) return false;
      const originalHand = hand.position.clone(), originalRotation = hand.quaternion.clone();
      model.updateWorldMatrix(true, false); inverse.copy(model.matrixWorld).invert();
      input.model.updateWorldMatrix(true, false);
      sourceMatrix.multiplyMatrices(input.worldToView, input.model.matrixWorld);
      sourceMatrix.decompose(sourcePosition, sourceRotation, sourceScale);
      if (source !== input.model) {
        carried?.removeFromParent(); source = input.model;
        carried = source.clone(true); carried.name = 'reload-carried-magazine'; root.add(carried);
        // Authored gun meshes often have identity transforms and offset vertices.
        // Align physical bounds, never assume that a mesh's origin is its grip.
        const bounds = localBounds(source); bounds.getCenter(sourceCentre); bounds.getSize(sourceSize);
      }
      from.copy(sourceCentre).applyMatrix4(sourceMatrix);
      wellMatrix.compose(wellPosition, wellRotation, magazine.scale).premultiply(model.matrixWorld);
      to.copy(wellCentre).applyMatrix4(wellMatrix);
      wellMatrix.decompose(sourcePosition, targetRotation, targetScale); targetSize.copy(wellSize).multiply(targetScale);
      const up = Y.clone().transformDirection(sourceMatrix);
      lift.copy(from).addScaledVector(up, .15).add(new THREE.Vector3(0, 0, -.035));
      const gunUp = Y.clone().transformDirection(model.matrixWorld);
      lead.copy(to).addScaledVector(gunUp, -.09);
      control.copy(lift).lerp(lead, .5); control.x -= .09; control.z -= .10;
      const extract = ease(time, RELOAD_POINTS.take, .56), travel = ease(time, .56, .67), insert = ease(time, .67, RELOAD_POINTS.seat);
      if (time < .56) centre.copy(from).lerp(lift, extract);
      else if (time < .67) centre.copy(lift).multiplyScalar((1 - travel) ** 2).addScaledVector(control, 2 * (1 - travel) * travel).addScaledVector(lead, travel ** 2);
      else centre.copy(lead).lerp(to, insert);
      // Looking down puts the chest very close to the eye. Carry the extracted
      // magazine clear of the near plane, without moving its initial pickup pose.
      if (centre.z > -.30) centre.z = THREE.MathUtils.lerp(centre.z, -.30, extract * (1 - insert));
      rotation.copy(sourceRotation).slerp(targetRotation, travel);
      const fitScale = targetSize.clone().divide(sourceSize).clampScalar(.15, 3);
      scale.copy(sourceScale).lerp(fitScale, insert);
      const grasp = new THREE.Vector3(-sourceSize.x * .5, sourceSize.y * .12, sourceSize.z * .15).multiply(scale).applyQuaternion(rotation);
      grip.copy(centre).add(grasp);
      // Reach and close around the source before its inventory transfer occurs.
      const reach = ease(time, RELOAD_POINTS.out, .445), returning = ease(time, RELOAD_POINTS.seat, .84);
      hand.position.copy(grip).applyMatrix4(inverse);
      hand.position.lerp(originalHand, time >= RELOAD_POINTS.seat ? returning : 1 - reach);
      hand.quaternion.copy(model.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(rotation).multiply(pose);
      hand.quaternion.slerp(originalRotation, time >= RELOAD_POINTS.seat ? returning : 1 - reach);
      root.visible = true; carried!.visible = pending && time >= RELOAD_POINTS.take && time < RELOAD_POINTS.seat;
      if (carried!.visible) {
        // Put the exact pouch visual in the same projected pose at pickup, then
        // extract it vertically, swing clear of the carrier and align the feed.
        const matrix = new THREE.Matrix4().compose(centre.clone().sub(sourceCentre.clone().multiply(scale).applyQuaternion(rotation)), rotation, scale);
        matrix.premultiply(inverse); matrix.decompose(carried!.position, carried!.quaternion, carried!.scale);
        magazine.visible = false;
      }
      // A connected two-segment sleeve follows the wrist all the way down to
      // the selected upper, lower or side pouch, including crouch and prone.
      shoulder.copy(input.shoulder).applyMatrix4(input.worldToView);
      hand.updateWorldMatrix(true, false); wrist.set(0, -.05, .01).applyMatrix4(hand.matrixWorld);
      direction.copy(wrist).sub(shoulder); const distance = Math.max(.001, direction.length()); direction.divideScalar(distance);
      const upperLength = Math.max(.31, distance * .54), lowerLength = Math.max(.28, distance * .50);
      const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
      const bend = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
      pole.set(-1, -.3, .4).addScaledVector(direction, -new THREE.Vector3(-1, -.3, .4).dot(direction)).normalize();
      elbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(pole, bend);
      shoulder.applyMatrix4(inverse); elbow.applyMatrix4(inverse); wrist.applyMatrix4(inverse);
      const parentScale = model.getWorldScale(new THREE.Vector3()).x;
      segment(upper, shoulder, elbow, .043 / parentScale); segment(forearm, elbow, wrist, .034 / parentScale);
      const phase: PouchReloadPhase = time < .445 ? 'reach' : time < RELOAD_POINTS.take ? 'grip' : time < .56 ? 'extract' : time < .67 ? 'carry' : time < RELOAD_POINTS.seat ? 'insert' : 'return';
      debug = { phase, hand: hand.getWorldPosition(new THREE.Vector3()).toArray(), magazine: carried!.visible ? centre.toArray() : null, source: from.toArray(), sourceVisible: input.model.visible };
      return true;
    },
    dispose() { carried?.removeFromParent(); root.removeFromParent(); geometry.dispose(); },
  };
}
