import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CANT_ROLL, type SightModel } from './weapon-accessories';

/**
 * Housings for the sights a variant is fitted with (`WeaponAccessories.sight`),
 * in the model's own space. `weapon-optics` puts the lens, the glass and the
 * reticle in them; this builds the metal and says where the lens goes.
 *
 * Mount points: the P30's slide top is y .2245 between the front sight
 * (z −.095) and the rear sight (z .07); the SAR 21's flat-top rail stands where
 * the reflex housing puts it (y .273, its teeth to .283); the Ultimax's sits
 * on the top cover at y .252 (teeth to .262).
 */
export interface SightPlacement {
  /** Lens centre: height, and how far off the bore line sideways (only an offset dot has one). */
  x: number; y: number;
  /** Where the lens and its glass sit along the weapon. */
  lensZ: number; glassZ: number;
  radius: number;
  /** How far ahead of the eye the viewmodel sits when this is the sight in use. */
  aimDepth: number;
  /** The roll that brings this sight upright; an offset dot is mounted at 45°. */
  roll: number;
}
export interface SightHousing {
  main: SightPlacement;
  /** A 1x dot at 45° beside a magnified main sight. */
  offset?: SightPlacement;
  /** The SAR's carry-handle optic comes off for any of these. */
  hidesIntegrated: boolean;
  dispose(): void;
}

interface Mount { base: number; z: number; rail?: { y: number; length: number; z: number; teeth: number } }
const MOUNTS: Record<string, Mount> = {
  'p30-inspired': { base: .2245, z: .025 },
  'sar21-inspired': { base: .283, z: .07, rail: { y: .273, length: .30, z: .015, teeth: 12 } },
  'ultimax-inspired': { base: .262, z: .108, rail: { y: .252, length: .126, z: .108, teeth: 6 } },
};

export function buildSightHousing(group: THREE.Group, platform: string, sight: SightModel, offsetDot: boolean): SightHousing | undefined {
  const mount = MOUNTS[platform];
  if (!mount) return undefined;
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string, roughness: number, metalness: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.push(m); return m;
  };
  const body = material('#23292b', .4, .68), dark = material('#0d1113', .7, .2), edge = material('#5d686c', .3, .8);
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); parent.add(object); return object;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m = body) =>
    mesh(parent, new RoundedBoxGeometry(w, h, d, 2, Math.min(.003, w / 3, h / 3, d / 3)), m, x, y, z);
  const tube = (parent: THREE.Object3D, radius: number, length: number, x: number, y: number, z: number, m = body, open = false) => {
    const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, 32, 1, open), m, x, y, z); object.rotation.x = Math.PI / 2; return object;
  };
  const bezel = (parent: THREE.Object3D, radius: number, x: number, y: number, z: number) =>
    mesh(parent, new THREE.TorusGeometry(radius, .0018, 6, 32), edge, x, y, z);

  if (mount.rail) {
    const { y, length, z, teeth } = mount.rail;
    box(group, .046, .018, length, 0, y, z);
    for (let i = 0; i < teeth; i++) box(group, .051, .006, .007, 0, y + .01, z - length / 2 + .01 + i * (length - .02) / (teeth - 1));
  }

  /**
   * An open-frame dot on its own plate, built around its window centre so it
   * can be stood on a slide or bolted at 45° beside a scope. Returns the lens
   * plane's offset from that centre along the weapon.
   */
  function miniDot(parent: THREE.Object3D, scale: number) {
    const s = scale, w = .028 * s, d = .034 * s, wall = .004 * s, window = .022 * s;
    // Plate under the window, battery tray at the back, then the open hood.
    box(parent, w, .006 * s, d, 0, -window / 2 - .003 * s, 0);
    box(parent, w * .7, .007 * s, .01 * s, 0, -window / 2 + .002 * s, d / 2 - .006 * s, dark);
    for (const side of [-1, 1]) box(parent, wall, window, d * .55, side * (w / 2 - wall / 2), 0, -d * .2);
    box(parent, w, wall, d * .55, 0, window / 2 + wall / 2, -d * .2);
    mesh(parent, new THREE.BoxGeometry(.006 * s, .004 * s, .004 * s), dark, 0, -window / 2 + .001 * s, d * .12);
    return { radius: window / 2 - .0005, lensZ: -d * .45 };
  }

  let main: SightPlacement, offset: SightPlacement | undefined;
  if (sight === 'mini-reflex') {
    const unit = new THREE.Group(); unit.name = 'sight-mini-reflex'; group.add(unit);
    const centre = mount.base + .0055 + .011;
    unit.position.set(0, centre, mount.z);
    const dot = miniDot(unit, 1);
    main = { x: 0, y: centre, lensZ: mount.z + dot.lensZ, glassZ: mount.z + dot.lensZ - .001, radius: dot.radius, aimDepth: -.52, roll: 0 };
  } else if (sight === 'holo') {
    const unit = new THREE.Group(); unit.name = 'sight-holo'; group.add(unit);
    const base = mount.base, centre = base + .051, rear = mount.z + .03, front = mount.z - .03;
    // Electronics and battery in the base, the window in a hood over it.
    box(unit, .05, .02, .09, 0, base + .01, mount.z);
    box(unit, .018, .014, .024, .034, base + .012, mount.z + .02, dark);
    for (let i = 0; i < 2; i++) box(unit, .004, .006, .008, .0435, base + .012, mount.z + .012 + i * .016, edge);
    for (const side of [-1, 1]) box(unit, .006, .062, .066, side * .026, base + .051, mount.z);
    box(unit, .058, .007, .066, 0, base + .0835, mount.z);
    for (const z of [rear, front]) box(unit, .046, .004, .004, 0, base + .022, z, dark);
    main = { x: 0, y: centre, lensZ: front + .002, glassZ: front - .001, radius: .021, aimDepth: platform === 'ultimax-inspired' ? -.47 : -.46, roll: 0 };
  } else if (sight === 'prism') {
    const unit = new THREE.Group(); unit.name = 'sight-prism'; group.add(unit);
    const axis = mount.base + .042, length = .13, z = mount.z - .035;
    box(unit, .05, .05, length, 0, axis - .007, z);
    box(unit, .03, .012, .07, 0, mount.base + .006, z, dark);
    tube(unit, .022, .03, 0, axis, z - length / 2 - .012);
    bezel(unit, .022, 0, axis, z - length / 2 - .027);
    tube(unit, .021, .026, 0, axis, z + length / 2 + .01);
    bezel(unit, .021, 0, axis, z + length / 2 + .023);
    // The illumination dial on the left, as the eye sees it on the way down.
    tube(unit, .012, .012, -.031, axis - .004, z + .02).rotation.set(0, 0, Math.PI / 2);
    // Just behind the eyepiece's end cap, or the cap would cover the picture.
    const lens = z + length / 2 + .0235;
    main = { x: 0, y: axis, lensZ: lens, glassZ: lens + .0005, radius: .0185, aimDepth: -(lens + .165), roll: 0 };
    if (offsetDot) {
      // A short arm off the right shoulder of the prism, the dot bolted to it at 45°.
      const reach = .052, at = new THREE.Vector2(Math.sin(CANT_ROLL), Math.cos(CANT_ROLL)).multiplyScalar(reach);
      const arm = box(unit, .016, .03, .034, at.x * .55, axis + at.y * .55 - .004, z + .02);
      arm.rotation.z = -CANT_ROLL;
      const holder = new THREE.Group(); holder.name = 'sight-offset-dot';
      holder.position.set(at.x, axis + at.y, z + .02); holder.rotation.z = -CANT_ROLL; unit.add(holder);
      const dot = miniDot(holder, 1.1);
      offset = { x: at.x, y: axis + at.y, lensZ: z + .02 + dot.lensZ, glassZ: z + .02 + dot.lensZ - .001, radius: dot.radius, aimDepth: -.45, roll: CANT_ROLL };
    }
  } else {
    // A long eye-relief scope in two rings on a slide-ride mount.
    const unit = new THREE.Group(); unit.name = 'sight-pistol-scope'; group.add(unit);
    const axis = mount.base + .036, z = mount.z - .035;
    box(unit, .03, .006, .1, 0, mount.base + .003, z);
    for (const ringZ of [z - .035, z + .035]) {
      box(unit, .016, .02, .012, 0, mount.base + .014, ringZ);
      mesh(unit, new THREE.TorusGeometry(.0175, .0035, 8, 24), body, 0, axis, ringZ);
    }
    tube(unit, .0155, .15, 0, axis, z);
    tube(unit, .019, .032, 0, axis, z - .09);
    bezel(unit, .019, 0, axis, z - .106);
    tube(unit, .0185, .03, 0, axis, z + .088);
    bezel(unit, .0185, 0, axis, z + .103);
    tube(unit, .009, .014, 0, axis + .022, z, dark);
    const lens = z + .1035;
    main = { x: 0, y: axis, lensZ: lens, glassZ: lens + .0005, radius: .0165, aimDepth: -(lens + .2), roll: 0 };
  }
  return {
    main, offset, hidesIntegrated: true,
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
