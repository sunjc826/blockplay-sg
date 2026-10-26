import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { EquippedWeapon } from './armory-state';
import { hasLaser, hasLight, type MuzzleDevice, type RailDevice } from './weapon-accessories';

/**
 * Muzzle devices, rail devices and the pistol brace, as geometry on the
 * platform's own model. Shared by the shop preview and the viewmodel through
 * `dressWeapon`, like the rest of a variant's hardware, and fully reversible.
 *
 * A muzzle device moves where the shot leaves the weapon, so it leaves a
 * `fps-muzzle-exit` node at the new end for the flash to hang off; a rail
 * device leaves `fps-laser-emitter` and `fps-light-emitter` nodes for the
 * engine to draw its beam and light from. Everything is placed in the model's
 * own space, measured off the GLBs and the P30's authored boxes.
 */
interface RailMount {
  /** Centre of the housing; it points down -Z like the weapon. */
  x: number; y: number; z: number;
  /** Under the frame (a pistol's dust cover) rather than on the side of a handguard. */
  under: boolean;
}
const RAIL: Record<string, RailMount> = {
  // The P30's dust cover ends at y .1545, ahead of the trigger guard at z -.023.
  'p30-inspired': { x: 0, y: .137, z: -.066, under: true },
  // Right side of each handguard, which the GLBs put at x ±.040 and ±.032.
  'sar21-inspired': { x: .052, y: .19, z: -.2, under: false },
  'ultimax-inspired': { x: .044, y: .18, z: -.29, under: false },
};
/** The muzzle device's bore radius and length, by platform. */
const MUZZLE: Record<string, { radius: number; suppressor: number; compensator: number }> = {
  'p30-inspired': { radius: .0165, suppressor: .15, compensator: .042 },
  'sar21-inspired': { radius: .021, suppressor: .17, compensator: .06 },
  'ultimax-inspired': { radius: .021, suppressor: .17, compensator: .06 },
};

export const MUZZLE_EXIT = 'fps-muzzle-exit';
export const LASER_EMITTER = 'fps-laser-emitter';
export const LIGHT_EMITTER = 'fps-light-emitter';
export const LIGHT_LENS = 'fps-light-lens';

/** Where a shot leaves this model: past a fitted muzzle device, or at the authored socket. */
export const muzzleSocket = (root: THREE.Object3D | undefined, id: string) =>
  root?.getObjectByName(MUZZLE_EXIT) ?? root?.getObjectByName(`${id}__socket_muzzle`);

export function fitWeaponAccessories(root: THREE.Object3D, weapon: EquippedWeapon) {
  const accessories = weapon.accessories;
  if (!accessories?.muzzle && !accessories?.rail && !accessories?.brace) return () => {};
  const group = new THREE.Group(); group.name = 'equipped-accessories'; root.add(group);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string, roughness: number, metalness: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.push(m); return m;
  };
  // Cerakote-flat rather than the receiver's anodised steel, so a can reads as added kit.
  const coat = material('#2a2f2c', .62, .35), steel = material('#1c2124', .34, .72), cut = material('#08090a', .7, .2);
  const accent = material(weapon.accent ?? '#8e979c', .3, .82);
  const mesh = (geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); parent.add(object); return object;
  };
  const tube = (radius: number, length: number, x: number, y: number, z: number, m: THREE.Material, segments = 20, parent: THREE.Object3D = group) => {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), m, x, y, z, parent); object.rotation.x = Math.PI / 2; return object;
  };

  if (accessories.muzzle) muzzleDevice(accessories.muzzle);
  if (accessories.rail) railDevice(accessories.rail);
  if (accessories.brace) brace();

  function muzzleDevice(device: MuzzleDevice) {
    const sizes = MUZZLE[weapon.id], socket = root.getObjectByName(`${weapon.id}__socket_muzzle`);
    if (!sizes || !socket) return;
    root.updateMatrixWorld(true);
    const at = root.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
    const length = sizes[device], end = at.z - length, mid = at.z - length / 2, r = sizes.radius;
    if (device === 'suppressor') {
      // A threaded collar, a long can, and a front cap with the bore showing.
      tube(r * .78, .014, at.x, at.y, at.z - .004, steel);
      tube(r, length - .02, at.x, at.y, mid - .004, coat, 24);
      tube(r * 1.04, .012, at.x, at.y, at.z - .016, accent, 24);
      tube(r * .96, .012, at.x, at.y, end + .006, steel, 24);
      tube(r * .3, .013, at.x, at.y, end + .005, cut, 12);
      // Wrench flats near the rear, so it reads as a can rather than a pipe.
      for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(.002, r * 1.1, .018), cut, at.x + side * r * .98, at.y, at.z - .032);
    } else {
      // A ported block: the gas leaves upward and sideways through cut slots.
      mesh(new RoundedBoxGeometry(r * 2.1, r * 2.2, length, 2, .003), steel, at.x, at.y + r * .12, mid);
      const port = new THREE.BoxGeometry(r * 2.15, r * .55, .007); geometries.push(port);
      for (let i = 0; i < 3; i++) {
        const z = at.z - .012 - i * (length - .02) / 2.2;
        const slot = new THREE.Mesh(port, cut); slot.position.set(at.x, at.y + r * .95, z); group.add(slot);
        const side = new THREE.Mesh(port, cut); side.position.set(at.x, at.y + r * .3, z); side.scale.set(1.01, .6, 1); group.add(side);
      }
      tube(r * .34, .004, at.x, at.y, end - .001, cut, 12);
      mesh(new THREE.BoxGeometry(r * 2.15, .004, .006), accent, at.x, at.y - r * .7, at.z - .006);
    }
    const exit = new THREE.Object3D(); exit.name = MUZZLE_EXIT; exit.position.set(at.x, at.y, end - .004); group.add(exit);
  }

  function railDevice(device: RailDevice) {
    const mount = RAIL[weapon.id];
    if (!mount) return;
    const unit = new THREE.Group(); unit.name = `rail-${device}`; unit.position.set(mount.x, mount.y, mount.z); group.add(unit);
    const both = device === 'laser-light', width = mount.under ? .032 : .024, height = mount.under ? .026 : .032, depth = both ? .074 : .062;
    // Clamp to the rail, then the housing, then its face.
    mesh(new THREE.BoxGeometry(mount.under ? .03 : .006, mount.under ? .006 : .024, depth * .6), steel, mount.under ? 0 : -width / 2 - .002, mount.under ? height / 2 + .002 : 0, .006, unit);
    mesh(new RoundedBoxGeometry(width, height, depth, 2, .005), coat, 0, 0, 0, unit);
    mesh(new THREE.BoxGeometry(.008, .004, .012), accent, mount.under ? width / 2 : 0, mount.under ? 0 : height / 2 + .001, depth / 2 - .012, unit);
    const face = -depth / 2 - .002;
    if (hasLight({ rail: device })) {
      const lensRadius = Math.min(width, height) * (both ? .34 : .42);
      const lensY = both ? (mount.under ? 0 : -height * .18) : 0, lensX = both && mount.under ? -width * .18 : 0;
      tube(lensRadius + .0025, .008, lensX, lensY, face + .002, steel, 20, unit);
      // Emissive, so the engine can light the lens without a new program.
      const glass = new THREE.MeshStandardMaterial({ color: '#d8dccf', roughness: .15, metalness: .1, emissive: '#fff6dd', emissiveIntensity: 0 }); materials.push(glass);
      const lens = mesh(new THREE.CircleGeometry(lensRadius, 20), glass, lensX, lensY, face - .0025, unit); lens.rotation.y = Math.PI; lens.name = LIGHT_LENS;
      const emitter = new THREE.Object3D(); emitter.name = LIGHT_EMITTER; emitter.position.set(lensX, lensY, face - .004); unit.add(emitter);
    }
    if (hasLaser({ rail: device })) {
      const laserY = both ? (mount.under ? 0 : height * .3) : 0, laserX = both && mount.under ? width * .28 : 0;
      tube(.0045, .01, laserX, laserY, face + .001, steel, 10, unit);
      const aperture = new THREE.MeshBasicMaterial({ color: '#ff2a1a' }); materials.push(aperture);
      const dot = mesh(new THREE.CircleGeometry(.0022, 10), aperture, laserX, laserY, face - .0045, unit); dot.rotation.y = Math.PI;
      const emitter = new THREE.Object3D(); emitter.name = LASER_EMITTER; emitter.position.set(laserX, laserY, face - .005); unit.add(emitter);
      // The activation switch the trigger finger or thumb reaches.
      mesh(new THREE.BoxGeometry(.006, .01, .014), cut, mount.under ? 0 : -width / 2 - .001, mount.under ? -height / 2 - .002 : -height * .3, depth / 2 - .01, unit);
    }
  }

  function brace() {
    if (weapon.id !== 'p30-inspired') return;
    // A folded-out arm from the backstrap to a shoulder pad, angled down past the wrist.
    const hinge = new THREE.Group(); hinge.name = 'pistol-brace'; hinge.position.set(0, .13, .104); group.add(hinge);
    mesh(new RoundedBoxGeometry(.03, .04, .022, 2, .004), steel, 0, 0, 0, hinge);
    const arm = new THREE.Group(); arm.rotation.x = .2; hinge.add(arm);
    for (const side of [-1, 1]) tube(.0045, .2, side * .012, -.004, .11, coat, 10, arm);
    mesh(new THREE.BoxGeometry(.03, .008, .03), steel, 0, -.004, .03, arm);
    mesh(new RoundedBoxGeometry(.038, .075, .022, 2, .008), coat, 0, -.018, .215, arm);
    mesh(new THREE.BoxGeometry(.04, .008, .024), accent, 0, .02, .215, arm);
    mesh(new RoundedBoxGeometry(.034, .07, .008, 2, .003), cut, 0, -.018, .229, arm);
  }

  return () => {
    group.removeFromParent();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(m => m.dispose());
  };
}

/** Whether this model carries a laser or a torch to drive. */
export const railEmitters = (root: THREE.Object3D | undefined, weapon: Pick<EquippedWeapon, 'accessories'>) => ({
  laser: hasLaser(weapon.accessories) ? root?.getObjectByName(LASER_EMITTER) : undefined,
  light: hasLight(weapon.accessories) ? root?.getObjectByName(LIGHT_EMITTER) : undefined,
  lens: root?.getObjectByName(LIGHT_LENS) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined,
});
