import * as THREE from 'three';
import { createCharacterRig } from './character-rig';

/** One pack shared by the worn body, store preview and companion. */
export function createTenPack() {
  const root = new THREE.Group(); root.name = 'encik-ten-pack';
  const olive = new THREE.MeshStandardMaterial({ color: '#4d5840', roughness: .95 });
  const webbing = new THREE.MeshStandardMaterial({ color: '#292e25', roughness: .9 });
  const label = new THREE.MeshStandardMaterial({ color: '#b2ac81', roughness: .9 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = olive) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  box(.43, .55, .24, 0, 0, 0); box(.46, .12, .27, 0, .27, .01);
  for (const side of [-1, 1]) {
    box(.1, .32, .18, side * .255, -.05, .02);
    box(.035, .55, .025, side * .14, 0, .14, webbing);
    box(.055, .08, .035, side * .14, -.1, .155, label);
    box(.045, .48, .035, side * .14, .02, -.15, webbing);
  }
  box(.28, .17, .08, 0, -.17, .15); box(.16, .06, .012, 0, .13, .126, label);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .5, 12), webbing);
  roll.rotation.z = Math.PI / 2; roll.position.y = -.36; root.add(roll);
  return root;
}
export function createMaidModel() {
  const rig = createCharacterRig({ skin: '#c89472', hair: '#261e24', hairStyle: 'long', headwear: 'none',
    top: '#23212d', bottom: '#23212d', shoes: '#191820', sleeves: 'short', gloves: '#f4f0e7',
    apron: '#f4f0e7', build: .95, weapon: null }, 'maid-companion');
  const white = new THREE.MeshStandardMaterial({ color: '#f4f0e7', roughness: .9 });
  const black = new THREE.MeshStandardMaterial({ color: '#23212d', roughness: .9 });
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(.19, .32, .42, 12), black);
  skirt.position.y = -.18; rig.joints.hips.add(skirt);
  // A full white apron over the skirt, plus a scalloped headband.
  const apron = new THREE.Mesh(new THREE.BoxGeometry(.35, .39, .018), white);
  apron.position.set(0, -.15, -.26); apron.rotation.x = .17; rig.joints.hips.add(apron);
  for (let i = -2; i <= 2; i++) {
    const frill = new THREE.Mesh(new THREE.SphereGeometry(.044, 6, 4), white);
    frill.scale.set(1, 1, .4); frill.position.set(i * .048, .235 - Math.abs(i) * .012, -.025); rig.joints.head.add(frill);
  }
  const pack = createTenPack(); pack.scale.setScalar(.9); pack.position.set(0, .06, .29); rig.joints.chest.add(pack);
  // Register additions with the character's lifecycle; all geometries/materials
  // are disposed once, including preview-only figures.
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const object of [skirt, apron, ...rig.joints.head.children.filter(o => o instanceof THREE.Mesh), pack]) object.traverse(o => {
    if (o instanceof THREE.Mesh) { resources.add(o.geometry); for (const mat of Array.isArray(o.material) ? o.material : [o.material]) resources.add(mat); }
  });
  resources.forEach(resource => { if (!rig.resources.includes(resource)) rig.resources.push(resource); });
  rig.update(0, { gesture: 'clasp' });
  return rig;
}
