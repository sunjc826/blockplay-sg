import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchRigidMeshes } from './rigid-batches';

export const RANGE_DUMMY_BASE_DEPTH = .58;

/** A reusable, unarmed range mannequin, with its feet on the floor and its face along +Z. */
export function createRangeDummyModel() {
  const root = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: '#d7a557', roughness: .78 });
  const joints = new THREE.MeshStandardMaterial({ color: '#80623e', roughness: .88 });
  const base = new THREE.MeshStandardMaterial({ color: '#454847', roughness: .87 });
  const paint = new THREE.MeshBasicMaterial({ color: '#473823' });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== paint;
    root.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, radius: number) => new RoundedBoxGeometry(w, h, d, 1, radius);
  const stand = add(box(.57, .065, RANGE_DUMMY_BASE_DEPTH, .016), base, 0, .033);
  stand.name = 'dummy-base';
  const chest = add(box(.45, .39, .22, .048), shell, 0, 1.30);
  chest.name = 'dummy-chest';
  add(box(.29, .20, .17, .042), joints, 0, 1.05);
  add(box(.30, .16, .20, .035), shell, 0, .91);
  add(new THREE.CylinderGeometry(.058, .068, .12, 8), joints, 0, 1.53);
  const head = add(new THREE.SphereGeometry(1, 10, 6).scale(.108, .139, .113), shell, 0, 1.69);
  head.name = 'dummy-head';
  const mark = add(new THREE.RingGeometry(.047, .063, 24), paint, 0, 1.30, .112);
  mark.name = 'dummy-mark';

  for (const side of [-1, 1]) {
    add(box(.12, .23, .14, .036), shell, side * .255, 1.33).rotation.z = side * .19;
    add(box(.10, .24, .12, .032), joints, side * .298, 1.12).rotation.z = side * .14;
    add(box(.093, .12, .11, .029), shell, side * .32, .94);
    add(box(.142, .39, .17, .04), shell, side * .10, .69).rotation.z = side * .07;
    add(box(.113, .33, .14, .032), joints, side * .124, .334);
    add(box(.125, .15, .14, .031), shell, side * .124, .49);
    add(box(.135, .11, .24, .025), joints, side * .124, .123, .039);
  }
  // Keep named aim points and batch the rest of the body by material.
  batchRigidMeshes(root, { candidates: root.children.filter(node => !node.name) });
  return root;
}

export function cloneRangeDummy(template: THREE.Object3D, target: number) {
  const model = template.clone(true);
  const chest = model.getObjectByName('dummy-chest') as THREE.Mesh;
  const head = model.getObjectByName('dummy-head') as THREE.Mesh;
  head.userData.fpsZone = 'head';
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh) || node.name === 'dummy-base') return;
    if (node.name === 'dummy-mark') node.raycast = () => {};
    else node.userData.fpsTarget = target;
  });
  return { model, chest, head };
}
