import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { getArenaRole } from './arena-roles';
import { buildServiceWeapon } from './service-weapon-models';
import { buildProxyWeapon, PROXY_WEAPONS } from './proxy-weapon-models';
import { PROXY_FACTIONS, proxyCharacterLook } from './proxy-factions';

function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) result.push(node); }); return result;
}

describe('proxy weapon exterior studies', () => {
  it('keeps candidates out of game weapon families, stores, roles and operator hand poses', () => {
    expect(PROXY_WEAPONS).toHaveLength(4);
    expect(new Set(PROXY_WEAPONS.map(study => study.id)).size).toBe(4);
    for (const study of PROXY_WEAPONS) {
      expect(itemById(study.id)).toBeUndefined(); expect(getArenaRole(study.id)).toBeUndefined(); expect(buildServiceWeapon(study.id)).toBeUndefined();
      expect(study.referenceUrl).toMatch(/^https:\/\//);
    }
    for (const faction of PROXY_FACTIONS) for (const operator of faction.operators) expect(['rifle', 'marksman']).toContain(proxyCharacterLook(faction.id, operator.id).weapon);
  });

  it('has four different geometric silhouettes with bounded render cost and finite exterior surfaces', () => {
    const shapes = PROXY_WEAPONS.map(study => {
      const model = buildProxyWeapon(study.id), parts = meshes(model.root), bounds = new THREE.Box3().setFromObject(model.root), size = bounds.getSize(new THREE.Vector3());
      expect(parts.length).toBeLessThanOrEqual(6);
      expect(parts.reduce((total, part) => total + part.geometry.getAttribute('position').count / 3, 0)).toBeLessThan(6500);
      expect(size.z).toBeGreaterThan(.65); expect(size.z).toBeLessThan(1.25); expect(size.x).toBeLessThan(.16);
      expect(size.y).toBeGreaterThan(.2); expect(size.y).toBeLessThan(.55);
      for (const part of parts) expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(model.sockets.muzzle.position.z).toBeLessThanOrEqual(bounds.min.z + .005);
      const shape = JSON.stringify(parts.map(part => Array.from(part.geometry.getAttribute('position').array)));
      model.dispose(); return shape;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('places the bullpup magazine behind the hand and conventional magazines in front', () => {
    for (const study of PROXY_WEAPONS) {
      const model = buildProxyWeapon(study.id), { magazine, grip, foregrip, muzzle } = model.sockets;
      if (study.id === 'cc-gatekeeper') expect(magazine.position.z).toBeGreaterThan(grip.position.z);
      else expect(magazine.position.z).toBeLessThan(grip.position.z);
      expect(foregrip.position.z).toBeLessThan(grip.position.z); expect(muzzle.position.z).toBeLessThan(foregrip.position.z);
      model.dispose();
    }
  });

  it('authors real negative space through the carbine stock and bullpup carry bridge', () => {
    for (const [id, y, z] of [['ff-strider', .063, .245], ['cc-gatekeeper', .197, .02]] as const) {
      const model = buildProxyWeapon(id); model.root.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(.5, y, z), new THREE.Vector3(-1, 0, 0), 0, 1);
      expect(ray.intersectObject(model.root, true)).toHaveLength(0);
      model.dispose();
    }
  });

  it('owns and releases every merged geometry and material exactly once', () => {
    for (const study of PROXY_WEAPONS) {
      const model = buildProxyWeapon(study.id), scene = new THREE.Scene(); scene.add(model.root);
      const parts = meshes(model.root), materials = new Set(parts.map(part => part.material as THREE.Material));
      let geometryDisposals = 0, materialDisposals = 0;
      for (const part of parts) part.geometry.addEventListener('dispose', () => geometryDisposals++);
      for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
      model.dispose(); model.dispose();
      expect(geometryDisposals).toBe(parts.length); expect(materialDisposals).toBe(materials.size); expect(scene.children).toHaveLength(0);
    }
  });
});
