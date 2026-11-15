import * as THREE from 'three';
import type { MantleState } from './fps-mantle';
import { createViewmodelHand } from './fps-viewmodel-hand';
import { smoothStep } from './fps-weapon-motion';

/** A ledge this far above the feet takes both hands, and the gun goes out of the way; lower ones are one hand and a step. */
export const MANTLE_TWO_HAND_LIFT = 1.1;

export interface MantleMotion {
  /** Both hands on the ledge, rather than the left alone with the gun kept in the right. */
  twoHanded: boolean;
  /** 0 as a hand leaves the body, 1 once it is on the ledge. */
  plant: number;
  /** 0 holding on, 1 let go and gone. */
  release: number;
  /** Added to the view: a look down at the ledge while pulling, and a lean onto the arm taking the weight. */
  pitch: number; roll: number;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** What the hands and the head do at this point of a climb. Nothing here moves the body: `advanceMantle` does. */
export function mantleMotion(state: MantleState): MantleMotion {
  const { elapsed: time, duration, rise } = state, lift = state.toY - state.fromY;
  const twoHanded = !state.vault && lift >= MANTLE_TWO_HAND_LIFT;
  if (!state.active || duration <= 0) return { twoHanded, plant: 0, release: 1, pitch: 0, roll: 0 };
  const whole = clamp01(time / duration), up = rise > 1e-6 ? clamp01(time / rise) : 1;
  // The hands are down before the body has risen far, and stay until it is over the lip.
  const plant = smoothStep(time / Math.max(.04, Math.min(.13, rise * .35, duration * .3)));
  const letGo = state.vault ? duration * .55 : rise + (duration - rise) * .2;
  const release = smoothStep((time - letGo) / Math.max(.05, Math.min(.16, duration - letGo)));
  const effort = Math.min(1, lift / 1.4);
  const pitch = -(twoHanded ? .1 : .06) * effort * Math.sin(Math.PI * up ** .8) * (1 - release * .5);
  const roll = state.vault ? .085 * Math.sin(Math.PI * whole) : twoHanded ? .022 * Math.sin(Math.PI * 2 * up) * (1 - release) : .05 * effort * Math.sin(Math.PI * whole);
  return { twoHanded, plant, release, pitch, roll };
}

/** Tangent of how far below the eye line a planted hand may sit: inside the hip view's lower edge. */
const FRAME_FLOOR = .38;
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

/**
 * The hands that climb: free hands in the viewmodel scene, held on the ledge in
 * world space while the eye rises past them, so they stay put on the concrete
 * rather than riding the screen. Rigid and procedural like the other hands.
 */
export function createMantleHands(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'fps-mantle'; root.visible = false; parent.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .8 }); materials.push(m); return m; };
  const kit = { glove: material('#474b39'), pad: material('#202722'), sleeve: material('#626a50'),
    mesh(into: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
      geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); into.add(object); return object;
    } };
  const hands = [-1, 1].map(side => ({ side, ...createViewmodelHand(side < 0, kit) }));
  hands.forEach(hand => root.add(hand.group));
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), fingers = new THREE.Vector3(), across = new THREE.Vector3();
  const anchor = new THREE.Vector3(), from = new THREE.Vector3(), away = new THREE.Vector3(), shoulder = new THREE.Vector3(), toShoulder = new THREE.Vector3();
  const basis = new THREE.Matrix4(), held = new THREE.Quaternion(), view = new THREE.Quaternion(), lifted = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  const raise = new THREE.Vector3(1, 0, 0);
  return {
    root,
    /**
     * Poses the hands for this frame of the climb, or puts them away for `null`.
     * `camera` is the world camera after this frame's view is set; `projectionScale`
     * is the foreground camera's tangent over the world camera's, so the hands
     * land on the ledge as drawn (see the reload reach in `fps-engine`).
     */
    update(state: MantleState | null, camera?: THREE.Camera, projectionScale = 1): MantleMotion | null {
      if (!state?.active || !camera) { root.visible = false; return null; }
      const motion = mantleMotion(state);
      root.visible = motion.release < 1;
      forward.set(state.dirX, 0, state.dirZ);
      if (forward.lengthSq() < 1e-6) camera.getWorldDirection(forward).setY(0);
      forward.normalize(); right.crossVectors(forward, UP);
      view.copy(camera.quaternion).invert();
      for (const hand of hands) {
        const { side, group, arm, setGrip } = hand;
        group.visible = motion.twoHanded || side < 0;
        if (!group.visible) continue;
        // Palm flat on the top, a shoulder's width apart, fingers turned in a little.
        const spread = motion.twoHanded ? .19 : .15;
        anchor.set(state.lipX, state.lipY + .024, state.lipZ).addScaledVector(right, side * spread);
        anchor.applyMatrix4(camera.matrixWorldInverse); anchor.x *= projectionScale; anchor.y *= projectionScale;
        // Past the bottom of the frame the palm stops there and presses down, as the body goes up
        // over it: the eye starts above any ledge it can reach, so a hand left on the world is never seen.
        const depth = Math.max(.3, -anchor.z); anchor.z = -depth;
        anchor.y = Math.max(anchor.y, -depth * FRAME_FLOOR); anchor.x = THREE.MathUtils.clamp(anchor.x, -depth * .8, depth * .8);
        fingers.copy(forward).addScaledVector(right, -side * .3).normalize(); across.crossVectors(fingers, UP);
        held.setFromRotationMatrix(basis.makeBasis(across, fingers, UP)).premultiply(view);
        // It comes up from beside the hip with the fingers raised, and drops away the same side when it lets go.
        from.set(side * .25, -.44, -.3); away.set(side * .3, -.52, -.2);
        group.position.copy(from).lerp(anchor, motion.plant).lerp(away, motion.release);
        const open = (1 - motion.plant) * .8 + motion.release * .5;
        group.quaternion.copy(held).multiply(lifted.setFromAxisAngle(raise, open));
        setGrip(.1 + motion.plant * .22 + motion.release * .3);
        // The sleeve runs back to the shoulder, so the wrist bends as the body comes up over the hand.
        shoulder.set(side * .2, -.27, .08);
        toShoulder.copy(shoulder).sub(group.position).applyQuaternion(inverse.copy(group.quaternion).invert());
        toShoulder.y = Math.min(toShoulder.y, -.04); toShoulder.z = Math.max(toShoulder.z, -.06);
        arm.quaternion.setFromUnitVectors(DOWN, toShoulder.normalize());
      }
      return motion;
    },
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
