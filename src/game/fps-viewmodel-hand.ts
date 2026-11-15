import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface ViewmodelHandKit {
  glove: THREE.Material; pad: THREE.Material; sleeve: THREE.Material;
  /** Registers the geometry for disposal and adds the mesh. */
  mesh: (into: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
}
type Mesher = ViewmodelHandKit['mesh'];
interface Placed { at?: [number, number, number]; scale?: [number, number, number]; turn?: [number, number, number] }
const placed = (geometry: THREE.BufferGeometry, { at = [0, 0, 0], scale = [1, 1, 1], turn = [0, 0, 0] }: Placed = {}) => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  return flat.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)), new THREE.Vector3(...scale)));
};
/** One geometry out of several shaped pieces, so a hand part is a single draw. */
const fuse = (...parts: THREE.BufferGeometry[]) => {
  const merged = mergeGeometries(parts.map(part => { part.deleteAttribute('uv'); return part; }));
  parts.forEach(part => part.dispose());
  return merged;
};

/**
 * The shapes both sets of first-person hands are built from. A hand's fingers
 * point along +y, its palm faces −z and its back +z; `thumb` is the side the
 * thumb is on (+1 or −1 along x).
 */
/** Palm with a row of knuckles and the two pads of the heel, inside the box `w × h × d`. */
export function palmGeometry(w: number, h: number, d: number, thumb: number) {
  const knuckle = Math.min(.0088, w * .14);
  // The slab is a little shallower than the box, so the heel's two pads are what reaches the palm face.
  const slab = d * .86, thenar = w * .26, heel = w * .22;
  return fuse(
    placed(new RoundedBoxGeometry(w, h, slab, 3, Math.min(w, h, slab) * .36), { at: [0, 0, (d - slab) / 2] }),
    ...[0, 1, 2, 3].map(i => placed(new THREE.SphereGeometry(knuckle, 10, 7), { at: [thumb * (w * .36 - i * w * .24), h / 2 - knuckle - .0005, d * .2], scale: [1, 1, .8] })),
    placed(new THREE.SphereGeometry(thenar, 12, 8), { at: [thumb * w * .24, -h * .15, -d / 2 + thenar * .62], scale: [1, 1.3, .62] }),
    placed(new THREE.SphereGeometry(heel, 12, 8), { at: [-thumb * w * .27, -h * .16, -d / 2 + heel * .6], scale: [1, 1.5, .6] }));
}
/** The glove's armour: a plate on the back of the hand and the band at the wrist. */
export function gloveArmourGeometry(w: number, h: number, d: number, cuffY: number, cuffZ: number, wrist = .028) {
  return fuse(
    placed(new RoundedBoxGeometry(w * .78, h * .4, .008, 3, .0038), { at: [0, h * .1, d / 2 + .001] }),
    placed(new THREE.CylinderGeometry(1, 1.04, .034, 20), { at: [0, cuffY - .004, cuffZ], scale: [Math.max(w * .47, wrist + .005), 1, (wrist + .005) * .84] }));
}
/**
 * A sleeved forearm hanging down −y from the origin. Wider across the hand (x) than through it, narrow at
 * the wrist and swelling into the muscle below it, with loose folds that wind round the sleeve.
 */
export function forearmGeometry(length: number, wrist = .028, elbow = .043) {
  const tube = new THREE.CylinderGeometry(1, 1, length, 20, 26), at = tube.getAttribute('position');
  const ease = (from: number, to: number, t: number) => { const k = Math.min(1, Math.max(0, (t - from) / (to - from))); return k * k * (3 - 2 * k); };
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i), z = at.getZ(i), t = .5 - at.getY(i) / length, around = Math.atan2(z, x), reach = t * length;
    // Out to the muscle's widest about 0.2 m down, then a little slimmer towards the elbow.
    const girth = wrist + (elbow - wrist) * (ease(.02, .2, reach) * 1.12 - ease(.24, .5, reach) * .12);
    const folds = ease(.015, .07, reach) * (.034 * Math.sin(reach * 58 + around) + .022 * Math.sin(reach * 37 - around * 2 + 1.3));
    const r = girth * (1 + folds);
    at.setXYZ(i, x * r, at.getY(i) - length / 2, z * r * .8);
  }
  tube.computeVertexNormals();
  return fuse(placed(tube));
}
/**
 * A finger of three round segments from its knuckle at `into`'s origin. The
 * first segment is `into`'s first child; `mid` and `tip` are the two joints
 * beyond the knuckle, which curl about x (negative closes towards the palm).
 */
export function buildFinger(into: THREE.Object3D, mesh: Mesher, glove: THREE.Material, length: number, radius: number) {
  const first = length * .45, second = length * .31, third = length * .24;
  const segment = (parent: THREE.Object3D, span: number, r: number) => mesh(parent, new THREE.CapsuleGeometry(r, span, 4, 10), glove, 0, span / 2, 0);
  segment(into, first, radius);
  const mid = new THREE.Group(); mid.position.y = first; into.add(mid); segment(mid, second, radius * .94);
  const tip = new THREE.Group(); tip.position.y = second; mid.add(tip); segment(tip, Math.max(.001, third - radius * .8), radius * .87);
  return { mid, tip };
}
/** A thumb of two segments about `into`'s origin, `reach` long, its end turned in towards the palm. */
export function buildThumb(into: THREE.Object3D, mesh: Mesher, glove: THREE.Material, reach: number, radius: number) {
  const first = reach * .52, base = -reach * .38;
  mesh(into, new THREE.CapsuleGeometry(radius, first, 4, 10), glove, 0, base + first / 2, 0);
  const tip = new THREE.Group(); tip.position.y = base + first; tip.rotation.x = -.42; into.add(tip);
  const span = Math.max(.001, reach * .48 - radius * 1.7);
  mesh(tip, new THREE.CapsuleGeometry(radius * .9, span, 4, 10), glove, 0, span / 2, 0);
  return tip;
}

/**
 * A gloved hand and forearm for a viewmodel that has to open and close: fingers
 * point along +y, the palm faces −z and the arm trails away down −y. Rigid
 * parts on three-joint fingers, posed by `setGrip`, in the same materials as the
 * reload hands in `fps-viewmodel`.
 */
/** The free hands' scale: a glove about 78 mm across the palm, the same as the gun hands. */
const HAND_SCALE = 1.18;
export function createViewmodelHand(left: boolean, { glove, pad, sleeve, mesh }: ViewmodelHandKit) {
  const group = new THREE.Group(); group.name = left ? 'viewmodel-hand-left' : 'viewmodel-hand-right';
  // Built small and scaled to life size about the palm's face, so whatever a caller puts in the hand still lies on it.
  const shape = new THREE.Group(); shape.scale.setScalar(HAND_SCALE); shape.position.z = -.02 * (1 - HAND_SCALE); group.add(shape);
  // First finger on the thumb side, so a pinch is that finger and the thumb.
  const side = left ? 1 : -1, w = .066, h = .078, d = .04;
  mesh(shape, palmGeometry(w, h, d, side), glove);
  mesh(shape, gloveArmourGeometry(w, h, d, -.05, .004), pad);
  const fingers = [0, 1, 2, 3].map(i => {
    const base = new THREE.Group(); base.position.set(side * (.0235 - i * .0157), .034, -.003); shape.add(base);
    return { base, ...buildFinger(base, mesh, glove, [.058, .064, .06, .048][i], [.0074, .0076, .0072, .0066][i]) };
  });
  const thumb = new THREE.Group(); thumb.position.set(side * .032, -.004, -.012); shape.add(thumb);
  const thumbTip = buildThumb(thumb, mesh, glove, .062, .0098);
  // A sleeve long enough to leave the frame whatever the pose.
  const arm = new THREE.Group(); arm.position.set(0, -.058, .008); arm.rotation.x = -.22; shape.add(arm);
  mesh(arm, forearmGeometry(.62), sleeve);
  /** 0 open and flat, 1 a closed fist; `pinch` brings the first finger and thumb together on top of that. */
  const setGrip = (closed: number, pinch = 0) => {
    fingers.forEach(({ base, mid, tip }, i) => {
      const curl = i === 0 ? closed + (.62 - closed) * pinch : closed;
      base.rotation.x = -.06 - curl * 1.2; mid.rotation.x = -.08 - curl * 1.3; tip.rotation.x = -.05 - curl * .75;
    });
    thumb.rotation.set(-.28 - closed * .55 - pinch * .3, 0, -side * (.62 - closed * .36 - pinch * .3));
    thumbTip.rotation.x = -.2 - closed * .5 - pinch * .25;
  };
  setGrip(.8);
  return { group, arm, setGrip };
}
