import * as THREE from 'three';
import type { WeaponSpec } from './fps-rules';
import { smoothStep } from './fps-weapon-motion';
import { primaryWeaponFamily } from './weapon-modes';

export type WeaponCarryClass = 'holster' | 'rifle-sling' | 'support-sling' | 'back-sling';
/** Carry follows the physical platform, including box-fed support variants. */
export function weaponCarryClass(spec: WeaponSpec): WeaponCarryClass {
  if (spec.id === 'p30-inspired') return 'holster';
  if (spec.action === 'bolt' || spec.id === 'ff-longwatch') return 'back-sling';
  if (spec.feed === 'belt' || spec.feed === 'drum' || spec.id === 'ultimax-inspired') return 'support-sling';
  return 'rifle-sling';
}
export function weaponCarryPose(spec: WeaponSpec, slot = 0) {
  const kind = weaponCarryClass(spec);
  // Local -Z is the muzzle. Pistols and side slings point down; precision
  // rifles ride muzzle-up diagonally across the back, clear of the hips.
  const position = kind === 'holster' ? [.255, -.13, .12] : kind === 'back-sling' ? [.02 + slot * .13, -.12, .25] : kind === 'support-sling' ? [-.36 - slot * .08, -.30, .10] : [-.26 - slot * .10, -.15, -.04];
  const rotation = kind === 'holster' ? [-Math.PI / 2, 0, 0] : kind === 'back-sling' ? [Math.PI / 2, -.45 - slot * .18, 0] : kind === 'support-sling' ? [-Math.PI / 2, -.20, -.12] : [-Math.PI / 2, -.35, -.18];
  return { kind, joint: kind === 'holster' ? 'hips' as const : 'chest' as const, position, rotation };
}
export interface WeaponSwitch { from: number; to: number; elapsed: number; stow: number; draw: number }
export function beginWeaponSwitch(from: number, to: number, specs: readonly WeaponSpec[]): WeaponSwitch | null {
  if (primaryWeaponFamily(from) === primaryWeaponFamily(to)) return null;
  const duration = (spec: WeaponSpec) => ({ holster: .31, 'rifle-sling': .43, 'support-sling': .58, 'back-sling': .55 })[weaponCarryClass(spec)];
  return { from, to, elapsed: 0, stow: duration(specs[from]), draw: duration(specs[to]) };
}
export function weaponSwitchFrame(state: WeaponSwitch) {
  const drawing = state.elapsed >= state.stow;
  const progress = Math.min(1, Math.max(0, drawing ? (state.elapsed - state.stow) / state.draw : state.elapsed / state.stow));
  return { family: drawing ? state.to : state.from, phase: drawing ? 'draw' : 'stow', progress,
    bodyWeight: drawing ? 1 - smoothStep(progress) : smoothStep(progress), done: state.elapsed >= state.stow + state.draw };
}
/** Projection matching gives the held model exactly the body's on-screen pose
 * at handover, even while looking down or leaving a magnified sight. */
export function carryViewPose(anchor: THREE.Object3D, camera: THREE.PerspectiveCamera, viewCamera: THREE.PerspectiveCamera) {
  anchor.updateWorldMatrix(true, false);
  const scale = Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const matrix = new THREE.Matrix4().makeScale(scale, scale, 1).multiply(camera.matrixWorldInverse).multiply(anchor.matrixWorld);
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), size = new THREE.Vector3();
  matrix.decompose(position, quaternion, size);
  return { position, quaternion, scale: size };
}
