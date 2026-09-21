import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createProfile, equip, resolveLoadout, type EquippedWeapon } from './armory-state';
import { fitWeaponHardware } from './weapon-fittings';

/**
 * Only drawing the fittings needs a GPU. Which meshes land where, what the
 * magazine ends up scaled to and whether the teardown puts the model back are
 * all readable from the scene graph, so they are checked here rather than in a
 * screenshot of a 3 fps software renderer.
 */
const weaponFor = (variant: string): EquippedWeapon => {
  const base = createProfile(), family = variant.startsWith('ult') ? 1 : 0;
  return resolveLoadout(equip({ ...base, owned: [...base.owned, variant] }, variant, family)).weapons[family];
};
/** Stands in for the authored GLB: the magazine node is all the fittings look up. */
function model(id: string) {
  const root = new THREE.Group(); root.name = id;
  const magazine = new THREE.Object3D(); magazine.name = `${id}__magazine`; root.add(magazine);
  return { root, magazine };
}
const hardware = (root: THREE.Object3D) => root.getObjectByName('equipped-hardware');
const meshes = (root: THREE.Object3D) => {
  let count = 0; hardware(root)?.traverse(object => { if (object instanceof THREE.Mesh) count++; });
  return count;
};

it('fits nothing to an issued platform, which is built from nothing', () => {
  const { root } = model('sar21-inspired');
  const remove = fitWeaponHardware(root, weaponFor('sar-issued'));
  expect(hardware(root)).toBeUndefined();
  remove();
});
it('puts more hardware on the model the further up the ladder it is', () => {
  const counts = ['sar-ranger', 'sar-vanguard', 'sar-marksman'].map(variant => {
    const { root } = model('sar21-inspired');
    fitWeaponHardware(root, weaponFor(variant));
    return meshes(root);
  });
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts[1]).toBeGreaterThan(counts[0]);
  expect(counts[2]).toBeGreaterThan(counts[1]);
});
it('paints its added hardware in the variant accent, so it reads as one weapon', () => {
  const { root } = model('sar21-inspired');
  fitWeaponHardware(root, weaponFor('sar-vanguard'));
  const colours = new Set<string>();
  hardware(root)!.traverse(object => { if (object instanceof THREE.Mesh) colours.add('#' + (object.material as THREE.MeshStandardMaterial).color.getHexString()); });
  expect(colours).toContain('#d6ad52');
});
it('grows the drum for a deeper one and shrinks it for a lighter one', () => {
  const grown = model('ultimax-inspired'), lightened = model('ultimax-inspired'), issued = model('ultimax-inspired');
  fitWeaponHardware(grown.root, weaponFor('ult-bastion'));
  fitWeaponHardware(lightened.root, weaponFor('ult-patrol'));
  fitWeaponHardware(issued.root, weaponFor('ult-issued'));
  expect(grown.magazine.scale.x).toBeGreaterThan(1);
  expect(lightened.magazine.scale.x).toBeLessThan(1);
  expect(issued.magazine.scale.x).toBe(1);
});
it('extends the rifle magazine below its floor plate instead of scaling it', () => {
  const { root, magazine } = model('sar21-inspired');
  fitWeaponHardware(root, weaponFor('sar-vanguard'));
  expect(magazine.scale.y).toBe(1);
  // The extension rides the magazine, so a reload still drops the whole thing.
  expect(magazine.children.length).toBeGreaterThan(0);
  expect(Math.min(...magazine.children.map(child => child.position.y))).toBeLessThan(-.141);
});
it('clears a heavy barrel with the gas block that sits on it', () => {
  const light = model('sar21-inspired'), heavy = model('sar21-inspired');
  fitWeaponHardware(light.root, weaponFor('sar-ranger'));
  fitWeaponHardware(heavy.root, weaponFor('sar-marksman'));
  const block = (root: THREE.Object3D) => hardware(root)!.children.filter(child => child instanceof THREE.Mesh && child.geometry.type === 'RoundedBoxGeometry')[0];
  expect(block(heavy.root).position.y).toBeGreaterThan(block(light.root).position.y);
});
it('puts the model back exactly as it was found', () => {
  const { root, magazine } = model('ultimax-inspired');
  const children = root.children.length;
  const remove = fitWeaponHardware(root, weaponFor('ult-bastion'));
  const disposed: THREE.BufferGeometry[] = [];
  hardware(root)!.traverse(object => { if (object instanceof THREE.Mesh) { const geometry = object.geometry; geometry.addEventListener('dispose', () => disposed.push(geometry)); } });
  remove();
  expect(hardware(root)).toBeUndefined();
  expect(root.children.length).toBe(children);
  expect(magazine.scale.x).toBe(1);
  expect(magazine.children).toHaveLength(0);
  expect(disposed.length).toBeGreaterThan(0);
});
