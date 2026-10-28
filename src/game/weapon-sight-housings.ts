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
 * on the top cover at y .252 (teeth to .262). The machine guns take a rail
 * along the feed cover, as the real guns do: its shell tops out at y .307 on
 * the FN MAG and .337 on the CIS 50MG, between the hinge (z −.115) and the
 * latch (z .127).
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
  /**
   * A moving part of the model the sight is clamped to, by node name. The
   * machine guns' sights sit on the feed cover and swing up with it on a belt
   * change; the node's rest pose is unrotated, so the housing's own placements
   * stay in the model's space.
   */
  carrier?: string;
  /** Nodes of the model that fold away under the sight, such as a rear aperture in its line. */
  folds: string[];
  dispose(): void;
}

interface Mount {
  base: number; z: number; rail?: { y: number; length: number; z: number; teeth: number };
  /** See `SightHousing.carrier`, without the platform prefix. */
  carrier?: string;
  /** See `SightHousing.folds`, without the platform prefix. */
  folds?: string[];
}
/** The machine guns' rear sight stands in the line of a sight on the feed cover, so it folds. */
const REAR_SIGHT = ['rear-sight', 'rear-sight-pedestal', 'rear-index-mark'];
const MOUNTS: Record<string, Mount> = {
  'p30-inspired': { base: .2245, z: .025 },
  'sar21-inspired': { base: .283, z: .07, rail: { y: .273, length: .30, z: .015, teeth: 12 } },
  'ultimax-inspired': { base: .262, z: .108, rail: { y: .252, length: .126, z: .108, teeth: 6 } },
  'mag-inspired': { base: .326, z: .03, rail: { y: .316, length: .2, z: .01, teeth: 8 }, carrier: 'feed-cover', folds: REAR_SIGHT },
  'cis50-inspired': { base: .356, z: .03, rail: { y: .346, length: .2, z: .01, teeth: 8 }, carrier: 'feed-cover', folds: REAR_SIGHT },
};

/** A holographic sight's window: about 30 by 23 mm, scaled up a little for the viewmodel. */
export const HOLO_WINDOW: SightWindow = { width: .042, height: .032, corner: .0045 };
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
    // EXPS-style proportions: a low electronics chassis, transverse battery
    // ahead of the window, and a separate folded protective hood. Reference:
    // https://www.eotechinc.com/products/eotech-hws-exps3
    const chassis = box(unit, .048, .022, .094, 0, base + .011, z + .001);
    chassis.name = 'sight-holo-electronics';
    box(unit, .054, .006, .074, 0, base + .003, z + .004, dark);
    // Transverse CR123 compartment with a knurled cap on the right.
    const battery = tube(unit, .012, .051, 0, base + .013, z - .036);
    battery.rotation.set(0, 0, Math.PI / 2); battery.name = 'sight-holo-battery';
    tube(unit, .0125, .005, .028, base + .013, z - .036, dark).rotation.set(0, 0, Math.PI / 2);
    tube(unit, .0105, .0015, .031, base + .013, z - .036, body).rotation.set(0, 0, Math.PI / 2);
    for (let i = 0; i < 20; i++) {
      const angle = i * Math.PI / 10;
      const ridge = box(unit, .004, .001, .0018, .028, base + .013 + Math.cos(angle) * .0125, z - .036 + Math.sin(angle) * .0125, edge);
      ridge.rotation.x = -angle;
    }
    // QD lever and its lock sit below the side controls.
    box(unit, .004, .007, .041, -.029, base + .005, z + .005, dark).rotation.y = -.08;
    box(unit, .006, .009, .009, -.030, base + .006, z + .025, body);
    const rubber = material('#15191a', .94, .02), hoodMetal = material('#3b4143', .65, .52);
    const screw = (x: number, y: number, atZ: number, side = false) => {
      const head = tube(unit, .0024, .0012, x, y, atZ, dark);
      const slot = box(unit, .0024, .0005, .0004, x, y, atZ + .0007, edge);
      if (side) {
        head.rotation.set(0, 0, Math.PI / 2);
        slot.position.x = x + Math.sign(x) * .0007; slot.position.z = atZ;
        slot.rotation.y = Math.PI / 2;
      }
    };
    // The rear electronics cover is visible below the window when aiming.
    box(unit, .043, .018, .003, 0, base + .012, z + .049, rubber).name = 'sight-holo-rear-cover';
    for (const side of [-1, 1]) {
      screw(side * .018, base + .017, z + .051);
      screw(side * .018, base + .005, z + .051);
      screw(side * .032, base + .026, z + .018, true);
    }
    // Left-side rubber brightness keys, with raised +/- symbols and an NV key.
    for (const [i, buttonZ] of [.022, .037].entries()) {
      box(unit, .004, .009, .011, -.032, base + .013, z + buttonZ, rubber);
      box(unit, .0005, .001, .004, -.0342, base + .013, z + buttonZ, edge);
      if (i === 0) box(unit, .0005, .004, .001, -.0342, base + .013, z + buttonZ, edge);
    }
    tube(unit, .0038, .002, -.032, base + .028, z + .027, rubber).rotation.set(0, 0, Math.PI / 2);
    // Recessed slotted windage/elevation adjusters on the opposite side.
    for (const [height, depth] of [[.012, -.006], [.028, .012]]) {
      tube(unit, .006, .002, .0305, base + height, z + depth, rubber).rotation.set(0, 0, Math.PI / 2);
      tube(unit, .0045, .001, .0317, base + height, z + depth, body).rotation.set(0, 0, Math.PI / 2);
      box(unit, .0005, .0007, .006, .0323, base + height, z + depth, dark);
    }
    // A small laser warning plate on the left shoulder, as on the reference.
    box(unit, .0008, .008, .020, -.0302, base + .029, z + .002, material('#b6a24b', .8, .1));
    for (let i = 0; i < 3; i++) box(unit, .0003, .0005, .011, -.0307, base + .027 + i * .0015, z + .004, dark);

    // The optical core and its rubber gasket sit inside an independent hood.
    // A short hood and the air gap at its shoulders avoid a red-dot tube silhouette.
    const hoodLength = .046, hoodZ = z + .010, lip = .0007;
    const outer = new THREE.Shape(), halfBottom = .0305, halfTop = .0265;
    const top = height / 2 + .006, bottom = -height / 2 - .021, round = .007;
    outer.moveTo(-halfBottom, bottom); outer.lineTo(halfBottom, bottom);
    outer.lineTo(halfBottom, -height / 2 - .002);
    outer.lineTo(halfTop, top - round);
    outer.quadraticCurveTo(halfTop, top, halfTop - round, top);
    outer.lineTo(-halfTop + round, top);
    outer.quadraticCurveTo(-halfTop, top, -halfTop, top - round);
    outer.lineTo(-halfBottom, -height / 2 - .002); outer.closePath();
    outer.holes.push(roundedRect(width + .0048, height + .0048, corner + .0018));
    const hoodGeometry = new THREE.ExtrudeGeometry(outer, { depth: hoodLength - lip * 2, bevelEnabled: true, bevelThickness: lip, bevelSize: .0005, bevelSegments: 2, curveSegments: 8 });
    // The front of the hood sweeps down towards the battery. Its top is short;
    // its lower cheeks extend over the chassis, matching the reference profile.
    const hoodVertices = hoodGeometry.attributes.position;
    for (let i = 0; i < hoodVertices.count; i++) {
      const reach = 1 - THREE.MathUtils.smoothstep(hoodVertices.getY(i), -height / 2, height / 2);
      if (hoodVertices.getZ(i) < hoodLength / 2) hoodVertices.setZ(i, hoodVertices.getZ(i) - reach * .018);
    }
    hoodGeometry.computeVertexNormals();
    const hood = mesh(unit, hoodGeometry, hoodMetal, 0, centre, hoodZ - hoodLength / 2 + lip);
    hood.name = 'sight-holo-hood';
    const core = roundedRect(width + .0026, height + .0026, corner + .0013);
    core.holes.push(roundedRect(width, height, corner));
    const coreZ = hoodZ - hoodLength / 2 + .004;
    mesh(unit, new THREE.ExtrudeGeometry(core, { depth: hoodLength - .009, bevelEnabled: false, curveSegments: 8 }),
      rubber, 0, centre, coreZ).name = 'sight-holo-window-gasket';
    for (const end of [-1, 1]) {
      const frame = roundedRect(width + .001, height + .001, corner + .0005);
      frame.holes.push(roundedRect(width - .001, height - .001, corner - .0005));
      mesh(unit, new THREE.ShapeGeometry(frame, 8), body, 0, centre, hoodZ + end * (hoodLength / 2 - .004)).rotation.y = end > 0 ? 0 : Math.PI;
    }
    // Plain protective front pane. Holographic glass is almost flat and clear,
    // unlike the conspicuously curved, reflective combiner in a reflex sight.
    const pane = new THREE.MeshPhysicalMaterial({ color: '#d3dfe2', roughness: .05, metalness: 0, clearcoat: 1, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    materials.push(pane);
    const front = mesh(unit, new THREE.ShapeGeometry(roundedRect(width - .0012, height - .0012, corner - .0006), 8), pane, 0, centre, coreZ + .001);
    front.name = 'sight-holo-front-pane'; front.renderOrder = 0;
    const rear = hoodZ + hoodLength / 2 - .006;
    main = { x: 0, y: centre, lensZ: rear, glassZ: rear - .001, radius: Math.hypot(width / 2, height / 2) + .001,
      aimDepth: platform === 'ultimax-inspired' ? -.36 : -.35, roll: 0, window: HOLO_WINDOW };
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
    carrier: mount.carrier && `${platform}__${mount.carrier}`, folds: (mount.folds ?? []).map(name => `${platform}__${name}`),
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
