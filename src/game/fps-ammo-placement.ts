import * as THREE from 'three';
import { createViewmodelHand } from './fps-viewmodel-hand';
import { localBounds, type PouchReloadSource } from './fps-pouch-reload';
import type { AmmoPlacement } from './ammo-placement';
const ease = (v: number, from: number, to: number) => { const t = Math.max(0, Math.min(1, (v - from) / (to - from))); return t * t * (3 - 2 * t); };
export const ammoPlacementPhase = (progress: number) => progress < .18 ? 'reach' : progress < .3 ? 'grip' : progress < .66 ? 'carry' : progress < .93 ? 'insert' : 'release';
/** Borrow the exact container geometry from its destination pouch. Only the
 * hand/arm resources belong to this viewmodel; borrowed meshes are never disposed. */
export function createAmmoPlacementViewmodel(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'fps-ammo-placement'; root.visible = false; parent.add(root);
  const geometry: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .85 }); materials.push(m); return m; };
  const glove = material('#474b39'), pad = material('#202722'), sleeve = material('#626a50');
  const hand = createViewmodelHand(true, { glove, pad, sleeve, mesh(into, g, m, x = 0, y = 0, z = 0) {
    geometry.push(g); const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); into.add(mesh); return mesh;
  } });
  hand.arm.visible = false; root.add(hand.group);
  const armGeometry = new THREE.CylinderGeometry(1, 1, 1, 8); geometry.push(armGeometry);
  const upper = new THREE.Mesh(armGeometry, sleeve), forearm = new THREE.Mesh(armGeometry, sleeve); root.add(upper, forearm);
  let original: THREE.Object3D | undefined, carried: THREE.Object3D | undefined;
  let debug: { phase: string; slot: number; source: string; container: string; hand: number[]; magazine: number[] | null; destination: number[] } | null = null;
  const centre = new THREE.Vector3(), size = new THREE.Vector3(), target = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0), matrix = new THREE.Matrix4();
  function segment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const direction = b.clone().sub(a); mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.scale.set(radius, direction.length(), radius); mesh.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  return {
    root, get debug() { return debug; },
    update(placement?: AmmoPlacement, input?: PouchReloadSource & { reachScale?: number }) {
      root.visible = false; debug = null;
      if (!placement || !input) return null;
      root.visible = true;
      if (original !== input.model) {
        carried?.removeFromParent(); original = input.model; carried = original.clone(true); carried.name = 'pickup-carried-container'; root.add(carried);
        const bounds = localBounds(original); bounds.getCenter(centre); bounds.getSize(size);
      }
      input.model.updateWorldMatrix(true, false);
      matrix.multiplyMatrices(input.worldToView, input.model.matrixWorld); matrix.decompose(target, rotation, scale);
      const destination = centre.clone().applyMatrix4(matrix), p = placement.progress;
      const from = placement.source === 'pack' ? new THREE.Vector3(-.48, -.38, -.28)
        : placement.source === 'maid' ? new THREE.Vector3(-.17, -.17, -.67)
          : placement.source === 'supply' ? new THREE.Vector3(-.27, -.25, -.63) : new THREE.Vector3(-.25, -.53, -.64);
      const reachScale = Math.max(.3, Math.min(1, input.reachScale ?? 1));
      from.x *= reachScale * reachScale;
      const lift = new THREE.Vector3(-.20 * reachScale * reachScale, -.16, -.48);
      const approach = destination.clone().add(new THREE.Vector3(0, .15, -.05));
      const centreNow = p < .3 ? from : p < .52 ? from.clone().lerp(lift, ease(p, .3, .52))
        : p < .72 ? lift.clone().lerp(approach, ease(p, .52, .72)) : approach.lerp(destination, ease(p, .72, .93));
      const handRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.08, -.3, -.18)).slerp(rotation, ease(p, .52, .93));
      carried!.visible = p >= .18;
      carried!.quaternion.copy(handRotation); carried!.scale.copy(scale);
      carried!.position.copy(centreNow).sub(centre.clone().multiply(scale).applyQuaternion(handRotation));
      const grip = centreNow.clone().add(new THREE.Vector3(-size.x * .48, -.015, .02).multiply(scale).applyQuaternion(handRotation));
      const home = new THREE.Vector3(-.24, -.72, -.20);
      hand.group.position.copy(home).lerp(grip, ease(p, 0, .18));
      if (p >= .93) hand.group.position.lerp(home, ease(p, .93, 1));
      hand.group.quaternion.copy(handRotation).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.12, -.18, -.22)));
      hand.setGrip(ease(p, .10, .24) * (1 - ease(p, .93, 1)));
      const shoulder = input.shoulder.clone().applyMatrix4(input.worldToView), wrist = hand.group.position.clone().add(new THREE.Vector3(0, -.055, .01));
      const elbow = shoulder.clone().lerp(wrist, .5).add(new THREE.Vector3(-.10, -.10, .08));
      segment(upper, shoulder, elbow, .043); segment(forearm, elbow, wrist, .034);
      debug = { phase: ammoPlacementPhase(p), slot: placement.slot, source: placement.source, container: input.model.name,
        hand: hand.group.position.toArray(), magazine: carried!.visible ? centreNow.toArray() : null, destination: destination.toArray() };
      const weight = ease(p, 0, .12) * (1 - ease(p, .94, 1));
      return { weaponTuck: weight, weaponDown: 0, view: { pitch: -.28 * ease(p, .35, .7) * (1 - ease(p, .93, 1)), roll: 0 } };
    },
    dispose() { carried?.removeFromParent(); root.removeFromParent(); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
