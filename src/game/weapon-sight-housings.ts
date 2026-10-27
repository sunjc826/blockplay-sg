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
  /** A rectangular window, for sights whose glass is not round. */
  window?: SightWindow;
}
export interface SightWindow { width: number; height: number; corner: number }
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

/** A holographic sight's window: about 30 by 23 mm, scaled up a little for the viewmodel. */
export const HOLO_WINDOW: SightWindow = { width: .04, height: .031, corner: .004 };
/**
 * How high a holographic sight is raised off a platform's rail. The Ultimax's
 * carry handle (axis y .309, radius .015, back end z .02) would otherwise fill
 * the middle of the window; on this riser at most a sliver of its top shows
 * along the bottom edge.
 */
const HOLO_RISER: Record<string, number> = { 'ultimax-inspired': .046 };

/** A rounded rectangle centred on the origin, for windows and their glass. */
export function roundedRect(width: number, height: number, corner: number) {
  const shape = new THREE.Shape(), x = width / 2, y = height / 2, r = Math.min(corner, x, y);
  shape.moveTo(-x + r, -y); shape.lineTo(x - r, -y); shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r); shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y); shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r); shape.quadraticCurveTo(-x, -y, -x + r, -y);
  return shape;
}

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
    // The Ultimax's carry handle runs at y .294–.324 to z .02, square in the
    // line of sight from its top cover: stand the sight on a riser so the
    // bottom of the window looks over it (see HOLO_RISER).
    const riser = HOLO_RISER[platform] ?? 0, base = mount.base + riser, z = mount.z;
    const { width, height, corner } = HOLO_WINDOW, centre = base + .0225 + height / 2;
    if (riser) {
      // A skeletonised riser block, cut through either side to save weight.
      box(unit, .042, riser, .074, 0, mount.base + riser / 2, z);
      for (const side of [-1, 1]) box(unit, .002, riser * .5, .044, side * .0205, mount.base + riser * .52, z, dark);
    }
    // The base carries the laser diode, the electronics and a transverse
    // battery; it runs past the hood at the back, where the buttons are.
    box(unit, .046, .021, .096, 0, base + .0105, z + .004);
    box(unit, .05, .006, .07, 0, base + .003, z + .004);
    // Battery cap on the right at the front, knurled, and the QD throw lever on the left.
    tube(unit, .0095, .006, .026, base + .0115, z - .03, edge).rotation.set(0, 0, Math.PI / 2);
    tube(unit, .0075, .003, .0305, base + .0115, z - .03, dark).rotation.set(0, 0, Math.PI / 2);
    box(unit, .004, .008, .034, -.0265, base + .004, z + .006, dark).rotation.y = -.06;
    box(unit, .006, .011, .008, -.0275, base + .006, z + .024, edge);
    // Brightness up and down, and the night-vision button, on the left at the back.
    for (const buttonZ of [.026, .038]) box(unit, .004, .009, .009, -.0235, base + .012, z + buttonZ, edge);
    box(unit, .003, .006, .005, -.0235, base + .012, z + .048, dark);
    // The hood: one piece, broader at the shoulders than over the top, the
    // window a rounded landscape rectangle through it.
    const hoodLength = .062, hoodZ = z - .006, lip = .0016;
    const outer = new THREE.Shape(), halfBottom = .0275, halfTop = .0235, top = height / 2 + .0068, bottom = -height / 2 - .0035, round = .0065;
    outer.moveTo(-halfBottom, bottom); outer.lineTo(halfBottom, bottom);
    outer.lineTo(halfTop + .0012, top - round); outer.quadraticCurveTo(halfTop, top, halfTop - round, top);
    outer.lineTo(-halfTop + round, top); outer.quadraticCurveTo(-halfTop, top, -halfTop - .0012, top - round);
    outer.closePath();
    outer.holes.push(roundedRect(width, height, corner));
    const hood = mesh(unit, new THREE.ExtrudeGeometry(outer, { depth: hoodLength - lip * 2, bevelEnabled: true, bevelThickness: lip, bevelSize: .0009, bevelSegments: 2, curveSegments: 6 }),
      body, 0, centre, hoodZ - hoodLength / 2 + lip);
    hood.name = 'sight-holo-hood';
    // A darker frame inside the window, so the opening reads as a recess rather than a hole.
    for (const end of [-1, 1]) {
      const frame = roundedRect(width + .0016, height + .0016, corner + .0008);
      frame.holes.push(roundedRect(width - .0014, height - .0014, corner - .0007));
      mesh(unit, new THREE.ShapeGeometry(frame, 6), dark, 0, centre, hoodZ + end * (hoodLength / 2 - .0055)).rotation.y = end > 0 ? 0 : Math.PI;
    }
    // The front window: plain protective glass, the holographic window behind it carries the reticle.
    const pane = new THREE.MeshPhysicalMaterial({ color: '#a9c6cc', roughness: .06, metalness: 0, clearcoat: 1, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide });
    materials.push(pane);
    const front = mesh(unit, new THREE.ShapeGeometry(roundedRect(width - .0012, height - .0012, corner - .0006), 6), pane, 0, centre, hoodZ - hoodLength / 2 + .006);
    front.renderOrder = 0;
    const rear = hoodZ + hoodLength / 2 - .007;
    // The lens circle reaches the window's corners; the hood hides the rest of it.
    main = { x: 0, y: centre, lensZ: rear, glassZ: rear - .001, radius: Math.hypot(width / 2, height / 2) + .001, aimDepth: platform === 'ultimax-inspired' ? -.47 : -.46, roll: 0,
      window: HOLO_WINDOW };
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
