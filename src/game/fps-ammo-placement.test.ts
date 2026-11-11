import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createAmmoPlacementViewmodel } from './fps-ammo-placement';
import { createFpsBody } from './fps-body';
import { createProfile, resolveLoadout } from './armory-state';
import { createPooledLoadout } from './ammo-pools';
import { magazineOf, rearMagazineSlot } from './magazine-inventory';
import { localBounds } from './fps-pouch-reload';

it.each([0, 1, 2, 4, 12])('carries the actual family %s container to its exact pouch in standing, crouching and prone poses', family => {
  const kit = resolveLoadout({ ...createProfile(), rig: 'rig-atlas' }); kit.carriedFamilies = [family];
  const states = createPooledLoadout(kit.weapons, kit.carriedFamilies), body = createFpsBody(new THREE.Scene());
  const view = createAmmoPlacementViewmodel(new THREE.Scene()), magazine = magazineOf(kit.weapons[family], family);
  for (const [crouch, prone, eye] of [[0, false, 1.75], [1, false, 1.15], [0, true, .45]] as const) {
    for (const slot of [0, 7, 20, ...(family === 12 ? [rearMagazineSlot(10)] : [])]) {
      body.update(0, kit, states, { x: 3, y: 0, z: 4, yaw: .7, visible: true, crouch, prone, hiddenMagazineSlots: [slot] });
      const camera = new THREE.PerspectiveCamera(70, 1.5, .01, 100); camera.position.set(3, eye, 4); camera.rotation.set(-.8, .7, 0, 'YXZ'); camera.updateMatrixWorld(true);
      const target = body.magazineSource(slot, magazine)!;
      expect(target.model.visible).toBe(false);
      const input = { ...target, reachScale: .45, worldToView: new THREE.Matrix4().makeScale(.85, .85, 1).multiply(camera.matrixWorldInverse) };
      for (const progress of [.1, .2, .45, .65, .8, .93, .99]) {
        view.update({ slot, magazine, source: 'pickup', progress }, input);
        expect(view.debug!.hand.every(Number.isFinite)).toBe(true);
        expect(view.debug!.destination.every(Number.isFinite)).toBe(true);
        const carried = view.root.getObjectByName('pickup-carried-container')!;
        expect(carried.visible).toBe(progress >= .18);
        if (progress >= .93) {
          carried.updateWorldMatrix(true, true);
          const actual = localBounds(carried).getCenter(new THREE.Vector3()).applyMatrix4(carried.matrixWorld);
          expect(actual.distanceTo(new THREE.Vector3(...view.debug!.destination))).toBeLessThan(1e-7);
        }
      }
    }
  }
  view.update(); expect(view.root.visible).toBe(false); expect(view.debug).toBeNull();
  const target = body.magazineSource(0, magazine)!.model;
  const mesh = target.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh;
  const dispose = vi.spyOn(mesh.geometry, 'dispose'); view.dispose(); expect(dispose).not.toHaveBeenCalled(); body.dispose();
});
it('reveals a stowed magazine and expands its real pouch without moving neighboring stock', () => {
  const kit = resolveLoadout(createProfile()), states = createPooledLoadout(kit.weapons, kit.carriedFamilies), body = createFpsBody(new THREE.Scene());
  const pose = { x: 0, y: 0, z: 0, yaw: 0, visible: true };
  body.update(0, kit, states, { ...pose, hiddenMagazineSlots: [0] });
  expect(body.magazineSource(0, states[0].magazineInventory!.slots[0]!)!.model.visible).toBe(false);
  const neighbor = body.root.getObjectByName('magazine-slot-1')!.position.clone();
  body.update(.1, kit, states, pose);
  expect(body.magazineSource(0, states[0].magazineInventory!.slots[0]!)!.model.visible).toBe(true);
  expect(body.root.getObjectByName('magazine-slot-1')!.position.equals(neighbor)).toBe(true); body.dispose();
});
