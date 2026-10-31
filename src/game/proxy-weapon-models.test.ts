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
    expect(PROXY_WEAPONS).toHaveLength(7);
    expect(new Set(PROXY_WEAPONS.map(study => study.id)).size).toBe(7);
    for (const study of PROXY_WEAPONS) {
      expect(itemById(study.id)).toBeUndefined(); expect(getArenaRole(study.id)).toBeUndefined(); expect(buildServiceWeapon(study.id)).toBeUndefined();
      expect(study.referenceUrl).toMatch(/^https:\/\//);
    }
    for (const faction of PROXY_FACTIONS) for (const operator of faction.operators) expect(['rifle', 'marksman']).toContain(proxyCharacterLook(faction.id, operator.id).weapon);
  });

  it('has seven different geometric silhouettes with bounded render cost and finite exterior surfaces', () => {
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
    expect(new Set(shapes).size).toBe(7);
  });

  it('replaces the MCX study with an OICW exterior carrying two separate muzzle and feed cues', () => {
    expect(PROXY_WEAPONS.some(study => study.reference.includes('MCX'))).toBe(false);
    expect(() => buildProxyWeapon('ff-strider' as Parameters<typeof buildProxyWeapon>[0])).toThrow(/Unknown/);
    const model = buildProxyWeapon('ff-oicw'), { muzzle, magazine, grip, launcherMuzzle, launcherMagazine } = model.sockets;
    expect(launcherMuzzle).toBeDefined(); expect(launcherMagazine).toBeDefined();
    expect(launcherMuzzle!.position.y).toBeGreaterThan(muzzle.position.y + .08);
    expect(muzzle.position.z).toBeLessThan(launcherMuzzle!.position.z);
    expect(magazine.position.z).toBeLessThan(grip.position.z);
    expect(launcherMagazine!.position.z).toBeGreaterThan(grip.position.z);
    // Front sightlines meet each barrel's actual exterior rim, not a painted mark.
    model.root.updateMatrixWorld(true);
    for (const socket of [muzzle, launcherMuzzle!]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(socket === muzzle ? .014 : .034, socket.position.y, -1), new THREE.Vector3(0, 0, 1), 0, 2);
      const hits = ray.intersectObject(model.root, true);
      expect(hits.length).toBeGreaterThan(0);
      expect(Math.abs(hits[0].point.z - socket.position.z)).toBeLessThan(.006);
    }
    model.dispose();
  });

  it('gives the QTS-11 its own launcher muzzle, open stock and asymmetric sensor silhouette', () => {
    const model = buildProxyWeapon('cc-qts11'), western = buildProxyWeapon('ff-oicw');
    const { muzzle, launcherMuzzle, launcherMagazine } = model.sockets;
    expect(launcherMuzzle).toBeDefined(); expect(launcherMagazine).toBeUndefined();
    expect(launcherMuzzle!.position.y).toBeGreaterThan(muzzle.position.y + .1);
    expect(muzzle.position.z).toBeLessThan(launcherMuzzle!.position.z);
    model.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(.027, launcherMuzzle!.position.y, -1), new THREE.Vector3(0, 0, 1), 0, 2);
    expect(Math.abs(ray.intersectObject(model.root, true)[0].point.z - launcherMuzzle!.position.z)).toBeLessThan(.006);
    // The offset pod extends farther on one side; the XM29 remains symmetric.
    const bounds = new THREE.Box3().setFromObject(model.root), other = new THREE.Box3().setFromObject(western.root);
    expect(Math.abs(bounds.min.x) - bounds.max.x).toBeGreaterThan(.02);
    expect(Math.abs(other.min.x + other.max.x)).toBeLessThan(.015);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeLessThan(other.getSize(new THREE.Vector3()).y);
    model.dispose(); western.dispose();
  });

  it('makes the SCAR-H physically wider and longer than the L, with a larger box-magazine profile', () => {
    const light = buildProxyWeapon('ff-scar-l'), heavy = buildProxyWeapon('ff-scar-h');
    const size = (model: ReturnType<typeof buildProxyWeapon>) => new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
    expect(size(heavy).z).toBeGreaterThan(size(light).z + .08);
    expect(size(heavy).x).toBeGreaterThan(size(light).x + .005);
    // The magazine can be observed separately from the receiver without relying on colors.
    const magBounds = (model: ReturnType<typeof buildProxyWeapon>) => {
      const bounds = new THREE.Box3();
      for (const mesh of meshes(model.root)) {
        const vertices = mesh.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(vertices, i);
          if (point.y < -.055 && point.z < -.06) bounds.expandByPoint(point);
        }
      }
      return bounds.getSize(new THREE.Vector3());
    };
    expect(magBounds(heavy).z).toBeGreaterThan(magBounds(light).z);
    expect(magBounds(heavy).x).toBeGreaterThan(magBounds(light).x);
    light.dispose(); heavy.dispose();
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

  it('authors real negative space through carbine/SCAR stocks and the bullpup carry bridge', () => {
    for (const [id, y, z] of [['cc-qts11', .073, .24], ['ff-scar-l', .06, .24], ['ff-scar-h', .06, .24], ['cc-gatekeeper', .197, .02]] as const) {
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
