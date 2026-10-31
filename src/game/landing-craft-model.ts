import * as THREE from 'three';

/** Original shallow-draft utility craft, forward -Z; its stern helm stays exposed. */
export function buildLandingCraft() {
  const root = new THREE.Group(); root.name = 'Landing craft';
  const steel = new THREE.MeshStandardMaterial({ color: '#566458', roughness: .72, metalness: .35 });
  const deck = new THREE.MeshStandardMaterial({ color: '#333e39', roughness: .9 });
  const trim = new THREE.MeshStandardMaterial({ color: '#c6b989', roughness: .7 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = steel, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  box(3.3, .8, 8, 0, .05, 0); box(2.6, .12, 6.4, 0, .54, -.7, deck);
  for (const x of [-1.48, 1.48]) { box(.34, .8, 8, x, .9, 0); box(.18, .12, 8.1, x, 1.33, 0, trim); }
  box(2.6, 1, 2, 0, 1.1, 2.6); box(3.3, .9, .25, 0, .9, 3.9);
  box(.65, .18, .7, .65, 1.45, 2.3, deck); box(.65, .5, .1, .65, 1.7, 2.65, deck);
  box(.08, .55, .08, .65, 1.8, 1.95, trim); box(.1, 2.2, .1, -1, 2.05, 3.1);
  for (const x of [-.8, .8]) box(.6, .18, 3.5, x, .9, -.4, deck);
  const ramp = new THREE.Group(); ramp.name = 'bow-ramp'; ramp.position.set(0, .6, -4); root.add(ramp);
  const length = Math.hypot(5, .41);
  box(2.4, .12, length, 0, -.06, -length / 2, steel, ramp);
  for (let z = -.3; z > -length; z -= .4) box(2.4, .025, .055, 0, .015, z, trim, ramp);
  ramp.rotation.x = Math.PI / 2; ramp.scale.z = .28;
  const wake = new THREE.Group(); wake.name = 'craft-wake'; root.add(wake);
  const foam = new THREE.MeshBasicMaterial({ color: '#c8e2df', transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(.5, 9), foam); strip.rotation.x = -Math.PI / 2; strip.rotation.z = side * .15; strip.position.set(side * 2, .03, 4); wake.add(strip);
  }
  return root;
}
