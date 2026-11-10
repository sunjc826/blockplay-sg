import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface ViewmodelHandKit {
  glove: THREE.Material; pad: THREE.Material; sleeve: THREE.Material;
  /** Registers the geometry for disposal and adds the mesh. */
  mesh: (into: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
}

/**
 * A gloved hand and forearm for a viewmodel that has to open and close: fingers
 * point along +y, the palm faces −z and the arm trails away down −y. Rigid
 * parts on two-joint fingers, posed by `setGrip`, in the same materials as the
 * reload hands in `fps-viewmodel`.
 */
export function createViewmodelHand(left: boolean, { glove, pad, sleeve, mesh }: ViewmodelHandKit) {
  const group = new THREE.Group(); group.name = left ? 'viewmodel-hand-left' : 'viewmodel-hand-right';
  const box = (into: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) =>
    mesh(into, new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * .22), material, x, y, z);
  box(group, .066, .078, .042, glove);
  box(group, .054, .034, .009, pad, 0, .012, .024);
  // First finger on the thumb side, so a pinch is that finger and the thumb.
  const side = left ? 1 : -1;
  const fingers = [0, 1, 2, 3].map(i => {
    const base = new THREE.Group(); base.position.set(side * (.0235 - i * .0157), .037, -.004); group.add(base);
    const length = [.025, .028, .026, .021][i], tip = new THREE.Group(); tip.position.y = length; base.add(tip);
    box(base, .0138, length + .004, .016, glove, 0, length / 2, 0);
    box(base, .0118, .012, .004, pad, 0, length * .55, .0085);
    box(tip, .0128, length * .85, .0145, glove, 0, length * .4, 0);
    return { base, tip };
  });
  const thumb = new THREE.Group(); thumb.position.set(side * .032, -.012, -.012); group.add(thumb);
  const thumbTip = new THREE.Group(); thumbTip.position.y = .03; thumb.add(thumbTip);
  box(thumb, .02, .034, .023, glove, 0, .015, 0); box(thumbTip, .017, .03, .019, glove, 0, .013, 0);
  // Cuff, then a sleeve long enough to leave the frame whatever the pose.
  box(group, .07, .024, .056, pad, 0, -.05, .004);
  const arm = new THREE.Group(); arm.position.set(0, -.058, .008); arm.rotation.x = -.22; group.add(arm);
  mesh(arm, new THREE.CylinderGeometry(.034, .047, .62, 10), sleeve, 0, -.31, 0);
  for (const y of [-.05, -.12]) { const fold = mesh(arm, new THREE.TorusGeometry(.037 + -y * .02, .004, 5, 14), sleeve, 0, y, 0); fold.rotation.x = Math.PI / 2; }
  /** 0 open and flat, 1 a closed fist; `pinch` brings the first finger and thumb together on top of that. */
  const setGrip = (closed: number, pinch = 0) => {
    fingers.forEach(({ base, tip }, i) => {
      const curl = i === 0 ? closed + (.62 - closed) * pinch : closed;
      base.rotation.x = -.06 - curl * 1.3; tip.rotation.x = -curl * 1.42;
    });
    thumb.rotation.set(-.28 - closed * .55 - pinch * .3, 0, -side * (.62 - closed * .36 - pinch * .3));
    thumbTip.rotation.x = -closed * .55 - pinch * .25;
  };
  setGrip(.8);
  return { group, arm, setGrip };
}
