import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fitMagazineAmmo, magazineAmmoState, updateMagazineAmmo } from './magazine-ammo';
import { applyEnemyWeaponConfig, buildEnemyWeapon } from './enemy-weapon-models';
import { createWeaponHandling } from './fps-viewmodel';
import { advanceWeapon, beginReload, fireWeapon, FPS_WEAPONS, interruptReload, magazineRounds, type WeaponState } from './fps-rules';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { dressWeapon } from './armory-visuals';

async function sar() {
  const bytes = readFileSync('public/models/field-kit/sar21-inspired.glb');
  const loader = new GLTFLoader().register(parser => ({ name: 'no-textures', loadMaterial: async (index: number) => {
    const material = new THREE.MeshStandardMaterial(); material.name = parser.json.materials[index].name; return material;
  } }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

it('makes only the SAR shell translucent and restores the shipped multi-material mesh on removal', async () => {
  const root = await sar(), magazine = root.getObjectByName('sar21-inspired__magazine')!;
  const meshes: THREE.Mesh[] = []; magazine.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  const originals = meshes.map(mesh => mesh.material);
  const shell = meshes.find(mesh => /parkerized/i.test((mesh.material as THREE.Material).name))!;
  const dispose = vi.spyOn(shell.geometry, 'dispose');
  const remove = fitMagazineAmmo(root, 'sar21-inspired');
  const fitted = shell.material as THREE.Material;
  expect(fitted.transparent).toBe(true); expect(fitted.depthWrite).toBe(false);
  expect(fitted.opacity).toBeLessThan(.5);
  meshes.forEach((mesh, i) => { if (mesh !== shell) expect(mesh.material).toBe(originals[i]); });
  const follower = root.getObjectByName('magazine-follower')!;
  const fullY = follower.position.y;
  updateMagazineAmmo(root, 1, 30); expect(follower.position.y).toBeGreaterThan(fullY + .15);
  updateMagazineAmmo(root, 0, 30);
  expect((root.getObjectByName('magazine-cartridges') as THREE.InstancedMesh).count).toBe(0);
  expect(follower.visible).toBe(true);
  remove(); meshes.forEach((mesh, i) => expect(mesh.material).toBe(originals[i])); expect(dispose).not.toHaveBeenCalled();
  expect(root.getObjectByName('magazine-ammunition')).toBeUndefined();
  expect(magazineAmmoState(root)).toEqual([]);
});

for (const id of ['xm8-inspired', 'g36-inspired']) it(`keeps ${id} rounds at the feed lips, raises the follower, and leaves drums opaque`, () => {
  const root = buildEnemyWeapon(id)!, remove = fitMagazineAmmo(root, id);
  const group = root.getObjectByName('magazine-ammunition')!;
  const cases = group.getObjectByName('magazine-cartridges') as THREE.InstancedMesh;
  const follower = group.getObjectByName('magazine-follower')!;
  const first = new THREE.Matrix4(), last = new THREE.Matrix4();
  cases.getMatrixAt(0, first); cases.getMatrixAt(29, last);
  const fullY = follower.position.y;
  updateMagazineAmmo(root, 15, 30); cases.getMatrixAt(0, last);
  expect(last.elements).toEqual(first.elements);
  expect(cases.count).toBe(15); expect(follower.position.y).toBeGreaterThan(fullY);
  const version = cases.instanceMatrix.version;
  updateMagazineAmmo(root, 15, 30); expect(cases.instanceMatrix.version).toBe(version);
  updateMagazineAmmo(root, 0, 30); expect(cases.count).toBe(0);
  applyEnemyWeaponConfig(root, id, id === 'xm8-inspired' ? 'automatic' : 'mg');
  expect(magazineAmmoState(root)).toEqual([]);
  if (id === 'xm8-inspired') {
    applyEnemyWeaponConfig(root, id, 'sharpshooter'); updateMagazineAmmo(root, 20, 20);
    expect(magazineAmmoState(root)).toHaveLength(1); expect(magazineAmmoState(root)[0].capacity).toBe(20);
  }
  remove();
  expect(root.getObjectByName(`${id}__magazine-rounds`)!.visible).toBe(true);
});

it('uses real magazine rounds across firing, empty chamber, reload seating, interruption and switching', async () => {
  const root = await sar(), remove = fitMagazineAmmo(root, 'sar21-inspired'), handling = createWeaponHandling(root, 0);
  const weapon = { ...FPS_WEAPONS[0], capacity: 36 };
  const state: WeaponState = { magazine: 37, chambered: true, reserve: 108, cooldown: 0, reloadRemaining: 0 };
  const render = () => handling.update(null, false, undefined, undefined, undefined,
    { rounds: magazineRounds(state, weapon), capacity: weapon.capacity });
  render(); expect(magazineAmmoState(root)[0].rounds).toBe(36);
  expect(fireWeapon(state, 0, [weapon])).toBe(true); render(); expect(magazineAmmoState(root)[0].rounds).toBe(35);
  state.magazine = 1; render(); expect(magazineAmmoState(root)[0].rounds).toBe(0);
  fireWeapon({ ...state, cooldown: 0 }, 0, [weapon]);
  state.magazine = 0; state.chambered = false; state.cooldown = 0;
  beginReload(state, 0, [weapon]); advanceWeapon(state, 0, .6 * weapon.reload, [weapon]); render();
  expect(magazineAmmoState(root)[0].rounds).toBe(0);
  interruptReload(state, 0, [weapon]); render(); expect(magazineAmmoState(root)[0].rounds).toBe(0);
  beginReload(state, 0, [weapon]); advanceWeapon(state, 0, 2 * weapon.reload, [weapon]); render();
  expect(magazineAmmoState(root)[0].rounds).toBe(35); // One round went into the chamber.
  root.visible = false; state.magazine = 9; render(); root.visible = true;
  expect(magazineAmmoState(root)[0].rounds).toBe(8);
  handling.dispose(); remove();
});

it('rebinds the visual after a field variant change without retaining disposed instances', async () => {
  const root = await sar(), base = createProfile(), handling = createWeaponHandling(root, 0);
  let remove = dressWeapon(root, resolveLoadout(base).weapons[0]);
  handling.update(null, false, undefined, undefined, undefined, { rounds: 17, capacity: 30 });
  const previous = root.getObjectByName('magazine-cartridges') as THREE.InstancedMesh;
  const dispose = vi.spyOn(previous, 'dispose'); remove(); expect(dispose).toHaveBeenCalledOnce();
  const profile = equip({ ...base, owned: [...base.owned, 'sar-vanguard'] }, 'sar-vanguard', 0);
  remove = dressWeapon(root, resolveLoadout(profile).weapons[0]);
  handling.update(null, false, undefined, undefined, undefined, { rounds: 11, capacity: 36 });
  expect(root.getObjectByName('magazine-cartridges')).not.toBe(previous);
  expect(magazineAmmoState(root)[0]).toMatchObject({ rounds: 11, capacity: 36 });
  remove(); handling.dispose();
});
