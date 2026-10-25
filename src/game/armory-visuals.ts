import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { itemById, type ShopItem } from './armory-catalog';
import type { EquippedWeapon } from './armory-state';
import { fitWeaponOptic } from './weapon-optics';
import { fitWeaponHardware } from './weapon-fittings';
import { buildWeaponBipod } from './weapon-bipod';
import { applyEnemyWeaponConfig } from './enemy-weapon-models';

/** Each preview owns its materials. Restore originals before disposing the source GLB. */
export function dressWeapon(root: THREE.Object3D, weapon: EquippedWeapon) {
  const skin = itemById(weapon.equipment.skin), originals: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  const materials: THREE.Material[] = [];
  let texture: THREE.CanvasTexture | undefined;
  if (skin?.palette) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = skin.palette[0]; ctx.fillRect(0, 0, 256, 256);
    let seed = 9021;
    for (let i = 0; i < 220; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      ctx.fillStyle = skin.palette[(seed >>> 16) % skin.palette.length];
      ctx.fillRect((seed % 32) * 8, ((seed >>> 8) % 32) * 8, (1 + (seed >>> 20) % 4) * 8, (1 + (seed >>> 24) % 3) * 8);
    }
    texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.NearestFilter;
  }
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    originals.push([object, object.material]);
    const dressed = (Array.isArray(object.material) ? object.material : [object.material]).map(source => {
      const m = source.clone() as THREE.MeshStandardMaterial; materials.push(m);
      if (/olive|polymer/i.test(source.name) && texture) { m.map = texture; m.color.set('#ffffff'); m.roughness = skin?.id === 'skin-gold' ? .32 : .72; m.metalness = skin?.id === 'skin-gold' ? .65 : .08; }
      if (/machined|raised/i.test(source.name) && weapon.accent) { m.color.set(weapon.accent); m.metalness = .55; }
      return m;
    });
    object.material = Array.isArray(object.material) ? dressed : dressed[0];
  });
  const accessories = new THREE.Group(); root.add(accessories);
  const addBand = (x: number, y: number, z: number, color: string) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(.038, .012, .05), new THREE.MeshStandardMaterial({ color, metalness: .55, roughness: .45 }));
    part.position.set(x, y, z); accessories.add(part);
  };
  // Replace the platform default with this variant's fixed support package.
  const originalBipod = root.getObjectByName(`${weapon.id}__bipod`);
  const bipodParent = originalBipod?.parent;
  originalBipod?.removeFromParent();
  const bipod = buildWeaponBipod(weapon.id, weapon.bipod ?? 'none');
  if (bipod) root.add(bipod);
  // Platforms authored with several configurations show the one this variant is.
  const removeConfig = applyEnemyWeaponConfig(root, weapon.id, itemById(weapon.equipment.variant)?.config);
  const removeOptic = fitWeaponOptic(root, weapon);
  // The variant's own hardware, which is what separates one tier from the next.
  const removeHardware = fitWeaponHardware(root, weapon);
  if (weapon.equipment.attachments.magazine) addBand(.036, .07, .13, '#b8a17a');
  if (weapon.equipment.attachments.handling) addBand(0, .07, -.20, '#555b5e');
  return () => {
    removeOptic(); removeHardware(); removeConfig();
    if (bipod) { bipod.removeFromParent(); disposeModel(bipod); }
    if (originalBipod && bipodParent) bipodParent.add(originalBipod);
    originals.forEach(([object, material]) => object.material = material);
    materials.forEach(m => m.dispose()); texture?.dispose(); accessories.removeFromParent(); disposeModel(accessories);
  };
}
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { materials.add(m); Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); }); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => { t.dispose(); if (typeof ImageBitmap !== 'undefined' && t.source.data instanceof ImageBitmap) t.source.data.close(); });
}
/** Visual game interpretation of a carrying rig and removable insert, not a protection specification. */
export function armorModel(item: ShopItem) {
  const group = new THREE.Group(), elite = item.tier === 'Elite';
  const cloth = document.createElement('canvas'); cloth.width = cloth.height = 64;
  const ctx = cloth.getContext('2d')!; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) { ctx.fillStyle = '#9a9a9a'; ctx.fillRect(i, 0, 1, 64); ctx.fillStyle = '#666666'; ctx.fillRect(0, i, 64, 1); }
  const weave = new THREE.CanvasTexture(cloth); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(8, 8);
  const fabric = new THREE.MeshStandardMaterial({ color: elite ? '#383d35' : '#626b47', roughness: .95, bumpMap: weave, bumpScale: .002 });
  const trim = new THREE.MeshStandardMaterial({ color: elite ? '#b59856' : '#303b2c', roughness: .7 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = fabric) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(.012, w / 5, h / 5, d / 5)), material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  box(.46, .52, .09, 0, 0, 0); box(.44, .5, .06, 0, .01, -.19);
  for (const x of [-.15, .15]) { box(.085, .19, .065, x, .33, -.045); box(.09, .045, .085, x, .30, .002, trim); }
  for (const x of [-.265, .265]) box(.09, .2, .23, x, -.06, -.09);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) box(.055, .014, .016, -.175 + col * .07, .18 - row * .065, .053, trim);
  if (item.category === 'rig') {
    for (const x of [-.15, 0, .15]) { box(.12, .18, .08, x, -.16, .095); box(.126, .04, .085, x, -.08, .10, trim); }
    if (item.id !== 'rig-ilbv') for (const x of [-.30, .30]) box(.10, .19, .10, x, -.17, .05);
  } else if (item.id !== 'plate-none') {
    const shape = new THREE.Shape(); shape.moveTo(-.13, -.20); shape.lineTo(.13, -.20); shape.lineTo(.14, .12); shape.lineTo(.075, .20); shape.lineTo(-.075, .20); shape.lineTo(-.14, .12); shape.closePath();
    const material = new THREE.MeshStandardMaterial({ color: elite ? '#363c44' : item.id === 'plate-soft' ? '#788268' : '#393c3b', roughness: .78, metalness: .08 });
    const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .026, bevelEnabled: true, bevelSize: .012, bevelThickness: .008, bevelSegments: 2, steps: 1 }), material);
    plate.position.set(.36, .015, .30); plate.rotation.y = -.20; group.add(plate);
    box(.15, .06, .004, .36, .07, .341, trim);
  }
  return group;
}

/**
 * Helmet-mounted vision devices for the shop preview: one tube, then a
 * binocular, then a four-tube panoramic; a thermal monocular with its dark
 * germanium window, and a fused thermal-and-tube housing. Built facing +Z.
 */
export function visionModel(item: ShopItem) {
  const group = new THREE.Group(), elite = item.tier === 'Elite';
  const polymer = new THREE.MeshStandardMaterial({ color: '#2a2f2c', roughness: .72, metalness: .08 });
  const anodised = new THREE.MeshStandardMaterial({ color: elite ? '#6f6650' : '#3b4033', roughness: .45, metalness: .55 });
  const tubeGlass = new THREE.MeshPhysicalMaterial({ color: item.id === 'nvg-gen3' ? '#38404f' : '#1d4a3b', roughness: .08, metalness: .2, clearcoat: 1 });
  const germanium = new THREE.MeshPhysicalMaterial({ color: '#2c2735', roughness: .15, metalness: .85, clearcoat: .6, iridescence: .6 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) => {
    // Yaw after pitch, so a tube laid along +Z can then fan out sideways.
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, 0, 'YXZ'); group.add(mesh); return mesh;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material = polymer) =>
    add(new RoundedBoxGeometry(w, h, d, 2, Math.min(.006, w / 5, h / 5, d / 5)), material, x, y, z);
  const tube = (x: number, y: number, yaw = 0, radius = .021, length = .11) => {
    const forward = Math.cos(yaw), side = Math.sin(yaw);
    add(new THREE.CylinderGeometry(radius, radius * 1.06, length, 24), anodised, x + side * length / 2, y, length / 2 * forward, Math.PI / 2, yaw);
    add(new THREE.CylinderGeometry(radius * .82, radius * .82, .006, 24), tubeGlass, x + side * (length + .002), y, (length + .002) * forward, Math.PI / 2, yaw);
    add(new THREE.TorusGeometry(radius * .92, .003, 6, 24), polymer, x + side * length, y, length * forward, 0, yaw);
  };
  // The helmet shroud and arm every device hangs from; with no device, it is all there is.
  box(.07, .045, .016, 0, .07, -.03); box(.03, .055, .02, 0, .035, -.02, anodised);
  if (item.id === 'vision-none') return group;
  if (item.id === 'nvg-gen1') { box(.05, .04, .05, 0, 0, .0); tube(0, 0, 0, .026, .12); box(.03, .028, .06, .045, .005, .01); }
  else if (item.id === 'nvg-gen2') { box(.1, .03, .04, 0, .005, 0); tube(-.033, 0); tube(.033, 0); }
  else if (item.id === 'nvg-gen3') { box(.13, .032, .045, 0, .005, 0); tube(-.022, 0, 0, .017, .1); tube(.022, 0, 0, .017, .1); tube(-.058, -.002, -.32, .016, .09); tube(.058, -.002, .32, .016, .09); box(.035, .03, .05, 0, .01, -.05, anodised); }
  else if (item.id === 'thermal-t1') { box(.06, .055, .1, 0, -.005, .04); add(new THREE.CylinderGeometry(.024, .024, .008, 24), germanium, 0, -.005, .094, Math.PI / 2); box(.022, .012, .03, .025, .028, .02, anodised); }
  else { box(.11, .06, .095, 0, -.005, .04); add(new THREE.CylinderGeometry(.026, .026, .008, 24), germanium, -.025, -.005, .09, Math.PI / 2); tube(.03, -.005, 0, .016, .1); box(.05, .014, .03, 0, .03, .0, anodised); }
  return group;
}
