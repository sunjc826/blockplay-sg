import * as THREE from 'three';
import { buildHelicopterDashboard } from './helicopter-dashboard';

/** A hollow airframe: the same floor, bulkhead and glazing are visible inside and out. */
export function buildHelicopterCabin(paint: THREE.MeshStandardMaterial) {
  const root = new THREE.Group(); root.name = 'helicopter-cabin';
  const trim = new THREE.MeshStandardMaterial({ color: '#242d30', roughness: .83 });
  const cushion = new THREE.MeshStandardMaterial({ color: '#394138', roughness: .95 });
  const frame = new THREE.MeshStandardMaterial({ color: '#515b58', metalness: .55, roughness: .48 });
  const glass = new THREE.MeshStandardMaterial({ color: '#a9d6dc', transparent: true, opacity: .09, roughness: .15, depthWrite: false, side: THREE.DoubleSide });
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = trim) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const rod = (a: number[], b: number[], radius = .035) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), frame);
    mesh.position.copy(start.add(end).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); root.add(mesh);
  };
  const pane = (points: number[][]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, glass); mesh.name = 'cockpit-glazing'; root.add(mesh);
    points.forEach((p, i) => rod(p, points[(i + 1) % points.length]));
  };
  box('cabin-belly', 2.22, .38, 3.65, 0, .78, -.25, paint);
  box('cabin-floor', 2.16, .08, 3.4, 0, 1.01, -.2);
  box('cabin-roof', 2.24, .13, 3.22, 0, 2.62, -.05, paint);
  box('rear-bulkhead', 2.16, 1.58, .18, 0, 1.78, 1.42, paint);
  box('rear-bulkhead-lining', 2.1, 1.42, .05, 0, 1.79, 1.3);
  box('nose-fairing', 1.98, .42, .66, 0, 1.18, -1.98, paint);
  for (const side of [-1, 1]) {
    const x = side * 1.08;
    box('cockpit-sill', .12, .44, 1.42, x, 1.3, -1.05, paint);
    pane([[x, 1.52, -1.72], [x, 2.55, -1.35], [x, 2.55, -.32], [x, 1.52, -.32]]);
    pane([[0, 1.51, -2.3], [0, 2.53, -1.6], [x, 2.55, -1.35], [x, 1.52, -1.72]]);
    // The cabin doors stay open, with solid jambs, a step and outward-facing benches.
    for (const z of [-.25, 1.26]) box('door-jamb', .1, 1.55, .1, x, 1.81, z, paint);
    box('door-step', .45, .08, 1.48, x, .91, .5, frame);
    rod([x, 2.22, -.15], [x, 2.22, 1.14]);
    box('side-seat-cushion', .64, .15, .8, side * .78, 1.28, .55, cushion);
    box('side-seat-back', .12, .64, .8, side * .42, 1.63, .55, cushion);
    box('pilot-seat-cushion', .68, .16, .66, side * .49, 1.28, -.91, cushion);
    box('pilot-seat-back', .68, .73, .14, side * .49, 1.65, -.57, cushion);
    box('pilot-headrest', .35, .24, .16, side * .49, 2.1, -.56, cushion);
    rod([side * .49, 1.09, -1.12], [side * .49, 1.53, -1.19], .025);
    box('cyclic-grip', .045, .14, .08, side * .49, 1.57, -1.2);
    for (const foot of [-.14, .14]) box('rudder-pedal', .17, .04, .22, side * .49 + foot, 1.11, -1.57, frame);
  }
  // Keep the instrument stack below the forward sightline for gameplay visibility.
  const panel = box('instrument-panel', 1.9, .42, .22, 0, 1.37, -1.73);
  panel.rotation.x = -.18;
  box('dashboard-coaming', 1.98, .08, .3, 0, 1.6, -1.76);
  box('center-console', .24, .3, 1.0, 0, 1.23, -1.12);
  box('overhead-console', .46, .1, .88, 0, 2.49, -.92);
  root.add(buildHelicopterDashboard());
  for (const x of [-.91, .91]) for (let i = 0; i < 4; i++) box('panel-switch', .025, .018, .035, x, 1.24 + i * .07, -1.59, frame);
  return root;
}
