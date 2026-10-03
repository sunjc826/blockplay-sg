import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BIPOD_PROFILES, type BipodKind } from './weapon-support';
import { smoothStep } from './fps-weapon-motion';

/** Authored attachment points. -Z is muzzle-forward; folded legs lie aft. */
const BIPODS = {
  'ultimax-inspired': { y: .151, z: -.40, width: .10, length: .30, radius: .007, heavy: false },
  'mag-inspired': { y: .174, z: -.44, width: .12, length: .33, radius: .008, heavy: false },
  'cis50-inspired': { y: .194, z: -.50, width: .20, length: .43, radius: .014, heavy: true },
} as const;
export function buildWeaponBipod(id: string, kind: BipodKind = id === 'cis50-inspired' ? 'heavy' : 'standard'): THREE.Group | null {
  const layout = BIPODS[id as keyof typeof BIPODS]; if (!layout || kind === 'none') return null;
  const { y, z, width, length } = layout;
  const profile = BIPOD_PROFILES[kind], heavy = kind === 'heavy';
  const radius = layout.radius * profile.thickness / (layout.heavy ? 1.35 : 1);
  const root = new THREE.Group(); root.name = `${id}__bipod`; root.userData.bipodKind = kind;
  const metal = new THREE.MeshStandardMaterial({ color: '#444d51', roughness: .45, metalness: .65 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1c2427', roughness: .7, metalness: .25 });
  const edge = new THREE.MeshStandardMaterial({ color: '#788080', roughness: .38, metalness: .7 });
  const box = (parent: THREE.Object3D, name: string, w: number, h: number, d: number, x: number, yy: number, zz: number, material = metal) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, Math.min(.003, w / 4, h / 4, d / 4)), material);
    mesh.name = `${id}__${name}`; mesh.position.set(x, yy, zz); parent.add(mesh); return mesh;
  };
  const tube = (parent: THREE.Object3D, name: string, r: number, h: number, x: number, yy: number, zz: number, material = metal) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), material);
    mesh.name = `${id}__${name}`; mesh.position.set(x, yy, zz); parent.add(mesh); return mesh;
  };
  // Clamp, underside saddle and cross-pin form a continuous load path to the gun.
  const collar = tube(root, 'bipod-clamp', heavy ? .037 : .027, .032, 0, y + .045, z, dark); collar.rotation.x = Math.PI / 2;
  box(root, 'bipod-saddle', width + radius * 2, .032, .038, 0, y + .012, z);
  const crossPin = tube(root, 'bipod-cross-pin', radius * 1.5, width + radius * 4, 0, y, z, edge); crossPin.rotation.z = Math.PI / 2;
  for (const [name, side] of [['left', -1], ['right', 1]] as const) {
    const fold = new THREE.Group(); fold.name = `${id}__bipod-${name}-fold`; fold.position.set(side * width / 2, y, z); root.add(fold);
    const splay = new THREE.Group(); splay.name = `${id}__bipod-${name}-splay`; fold.add(splay);
    const hinge = tube(splay, 'bipod-hinge', radius * 2.1, radius * 2.8, 0, 0, 0, edge); hinge.rotation.z = Math.PI / 2;
    tube(splay, 'bipod-upper-leg', radius, length * .60, 0, -length * .30, 0);
    const slider = new THREE.Group(); slider.name = `${id}__bipod-${name}-slider`; slider.position.y = -length * .48; splay.add(slider);
    tube(slider, 'bipod-lower-leg', radius * .68, length * .42, 0, -length * .21, 0, edge);
    const lock = tube(splay, 'bipod-length-lock', radius * 1.35, .022, 0, -length * .57, 0, dark);
    box(lock, 'bipod-lock-tab', radius * 2, .009, .025, side * radius, 0, .008, edge);
    const foot = new THREE.Group(); foot.name = `${id}__bipod-${name}-foot`; foot.position.y = -length * .42; slider.add(foot);
    box(foot, 'bipod-foot-pad', heavy ? .09 : .06, .016, heavy ? .09 : .06, 0, 0, 0, dark);
    box(foot, 'bipod-foot-plate', heavy ? .075 : .05, .008, heavy ? .075 : .05, 0, .012, 0, metal);
  }
  poseWeaponBipod(root, id, 0);
  return root;
}

/** Rotate at the fixed upper hinge, then spread and extend. Feet counter-rotate
 * to stay level when deployed; no geometry scales or teleports between poses. */
export function poseWeaponBipod(root: THREE.Object3D, id: string, progress: number) {
  const layout = BIPODS[id as keyof typeof BIPODS]; if (!layout) return;
  const foldAngle = -Math.PI / 2 * (1 - smoothStep(progress / .85)) + .10 * smoothStep(progress);
  const kind = (root.getObjectByName(`${id}__bipod`)?.userData.bipodKind ?? 'standard') as BipodKind;
  const spread = smoothStep((progress - .18) / .82) * BIPOD_PROFILES[kind].spread;
  const extension = smoothStep((progress - .48) / .52) * layout.length * .10;
  for (const [name, side] of [['left', -1], ['right', 1]] as const) {
    const fold = root.getObjectByName(`${id}__bipod-${name}-fold`)!;
    const splay = root.getObjectByName(`${id}__bipod-${name}-splay`)!;
    const slider = root.getObjectByName(`${id}__bipod-${name}-slider`)!;
    const foot = root.getObjectByName(`${id}__bipod-${name}-foot`)!;
    fold.rotation.x = foldAngle; splay.rotation.z = side * spread;
    slider.position.y = -layout.length * .48 - extension;
    // Inverse of fold * splay keeps each articulated sole level.
    foot.quaternion.copy(splay.quaternion).invert().multiply(fold.quaternion.clone().invert());
  }
}

export interface BipodMotionInput { prone: boolean; grounded: boolean; speed: number; eyeHeight: number; dt: number }
export function createBipodMotion(model: THREE.Object3D, id: string) {
  const root = model.getObjectByName(`${id}__bipod`);
  const profile = BIPOD_PROFILES[(root?.userData.bipodKind ?? 'none') as BipodKind];
  let progress = 0;
  const reset = () => { if (progress === 0) return; progress = 0; if (root) poseWeaponBipod(root, id, 0); };
  return {
    get progress() { return progress; },
    update(input?: BipodMotionInput) {
      if (!root) return;
      if (!input) { reset(); return; }
      const ready = input.prone && input.grounded && input.speed < .15;
      const target = ready ? Math.max(0, Math.min(1, (1.15 - input.eyeHeight) / .60)) : 0;
      const duration = target > progress ? profile.deploy : profile.retract;
      const step = Math.max(0, input.dt) / duration;
      const previous = progress;
      progress += Math.max(-step, Math.min(step, target - progress));
      if (Math.abs(progress - target) < .002) progress = target;
      if (progress !== previous) poseWeaponBipod(root, id, progress);
    },
    reset,
  };
}
