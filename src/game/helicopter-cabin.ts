import * as THREE from 'three';
import { airframeLoft, helicopterNose } from './helicopter-airframe';
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
  const pane = (points: number[][], edged = true) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, glass); mesh.name = 'cockpit-glazing'; root.add(mesh);
    if (edged) points.forEach((p, i) => rod(p, points[(i + 1) % points.length]));
  };
  root.add(airframeLoft('cabin-belly', [
    { z: -1.65, width: .94, bottom: .65, top: 1.05 },
    { z: -1.1, width: 1.1, bottom: .58, top: 1.1 },
    { z: .85, width: 1.1, bottom: .59, top: 1.1 },
    { z: 1.5, width: .98, bottom: .76, top: 1.12 },
  ], paint));
  box('cabin-floor', 2.16, .08, 3.1, 0, 1.01, -.05);
  root.add(airframeLoft('cabin-roof', [
    { z: -1.71, width: .1, bottom: 2.53, top: 2.59 },
    { z: -1.6, width: .62, bottom: 2.53, top: 2.67 },
    { z: -1.25, width: .96, bottom: 2.49, top: 2.79 },
    { z: -.3, width: 1.12, bottom: 2.5, top: 2.88 },
    { z: .9, width: 1.12, bottom: 2.5, top: 2.86 },
    { z: 1.55, width: .91, bottom: 2.45, top: 2.68 },
  ], paint));
  root.add(airframeLoft('rear-bulkhead', [
    { z: 1.34, width: 1.09, bottom: .76, top: 2.74 },
    { z: 1.65, width: .94, bottom: .85, top: 2.65 },
    { z: 2.05, width: .67, bottom: 1.12, top: 2.42 },
    { z: 2.45, width: .37, bottom: 1.35, top: 2.08 },
  ], paint, .6));
  box('rear-bulkhead-lining', 1.97, 1.38, .05, 0, 1.79, 1.3);
  root.add(helicopterNose(paint));
  // Twelve curved glazing sections share a continuous rim, with only one center post.
  const lower: number[][] = [], upper: number[][] = [];
  for (let i = 0; i <= 12; i++) {
    const arc = -Math.PI / 2 + i / 12 * Math.PI;
    lower.push([1.08 * Math.sin(arc), 1.51, -1.55 - .9 * Math.cos(arc)]);
    upper.push([.94 * Math.sin(arc), 2.53 + .05 * Math.cos(arc), -1.25 - .45 * Math.cos(arc)]);
    if (i > 0) {
      pane([lower[i - 1], lower[i], upper[i], upper[i - 1]], false);
      rod(lower[i - 1], lower[i], .025); rod(upper[i - 1], upper[i], .025);
    }
    if (i === 0 || i === 6 || i === 12) rod(lower[i], upper[i], .03);
  }
  for (const side of [-1, 1]) {
    const x = side * 1.08;
    root.add(airframeLoft('cockpit-sill', [
      { z: -1.55, width: .065, bottom: 1.03, top: 1.51 },
      { z: -.32, width: .065, bottom: 1.03, top: 1.51 },
    ], paint).translateX(x));
    pane([[x, 1.51, -1.55], [side * .94, 2.53, -1.25], [x, 2.55, -.32], [x, 1.51, -.32]]);
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
