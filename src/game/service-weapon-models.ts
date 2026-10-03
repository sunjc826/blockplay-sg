import * as THREE from 'three';
import { buildMachineGun } from './machine-gun-models';

/** Authored low-poly silhouettes, not dimensional replicas. Local -Z is forward. */
export function buildServiceWeapon(id: string): THREE.Group | undefined {
  if (id === 'mag-inspired' || id === 'cis50-inspired') return buildMachineGun(id);
  if (id !== 'p30-inspired') return undefined;
  const root = new THREE.Group(); root.name = id;
  const steel = new THREE.MeshStandardMaterial({ color: '#343d41', roughness: .48, metalness: .65 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#394334', roughness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141a1c', roughness: .75 });
  steel.name = 'Metal anodised'; polymer.name = 'Polymer'; dark.name = 'Dark metal';
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = steel) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = `${id}__${name}`; mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const barrel = (name: string, radius: number, length: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), steel);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(0, y, z); mesh.name = `${id}__${name}`; root.add(mesh);
  };
  const socket = (name: string, x: number, y: number, z: number) => {
    const node = new THREE.Object3D(); node.name = `${id}__socket_${name}`; node.position.set(x, y, z); root.add(node);
  };
  if (id === 'p30-inspired') {
    box('slide', .047, .045, .205, 0, .202, -.015);
    box('frame', .045, .027, .17, 0, .168, -.006, polymer);
    box('grip', .044, .103, .056, 0, .108, .067, polymer).rotation.x = -.19;
    box('hammer', .021, .025, .024, 0, .205, .099, dark).rotation.x = -.3;
    box('backstrap', .047, .085, .018, 0, .105, .098, polymer).rotation.x = -.19;
    for (let i = 0; i < 3; i++) box('grip-groove', .046, .014, .013, 0, .08 + i * .025, .035, dark);
    box('magazine', .041, .012, .057, 0, .05, .077, dark);
    box('guard-bottom', .035, .01, .064, 0, .115, .01, polymer);
    box('guard-front', .035, .038, .01, 0, .137, -.023, polymer);
    box('trigger', .012, .026, .01, 0, .14, .017, dark).rotation.x = -.25;
    for (const x of [-.015, .015]) box('rear-sight', .008, .012, .016, x, .231, .07, dark);
    box('front-sight', .006, .012, .012, 0, .231, -.095, dark);
    for (let i = 0; i < 6; i++) box('slide-serration', .049, .024, .002, 0, .203, .042 + i * .006, dark);
    barrel('muzzle', .012, .012, .197, -.123);
    socket('muzzle', 0, .197, -.13); socket('eject', .03, .214, -.007);
  }
  return root;
}
