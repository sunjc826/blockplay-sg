import { expect, it } from 'vitest';
import * as THREE from 'three';
import { buildServiceWeapon } from './service-weapon-models';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { fitWeaponHardware } from './weapon-fittings';
import { createWeaponHandling } from './fps-viewmodel';
import { disposeModel } from './armory-visuals';
import { MACHINE_GUN_LAYOUT, type MachineGunId } from './machine-gun-layout';

for (const [family, variants] of [[3, ['mag-issued', 'mag-chope', 'mag-jaga']], [4, ['cis50-issued', 'cis50-tuas', 'cis50-merlion']]] as const) {
  for (const variant of variants) it(`${variant}: aligns the front blade and clears the target through the actual model`, () => {
    const base = createProfile(), profile = equip({ ...base, owned: [...base.owned, variant] }, variant, family);
    const weapon = resolveLoadout(profile).weapons[family], model = buildServiceWeapon(weapon.id)!;
    const remove = fitWeaponHardware(model, weapon), handling = createWeaponHandling(model, family);
    handling.update(null, false); model.updateMatrixWorld(true);
    const layout = MACHINE_GUN_LAYOUT[weapon.id as MachineGunId];
    expect(handling.aimHeight).toBe(weapon.sightHeight);
    expect(handling.aimDepth).toBe(layout.aimDepth);
    const front = model.getObjectByName(`${weapon.id}__front-sight`)!;
    expect(new THREE.Box3().setFromObject(front).max.y).toBeCloseTo(handling.aimHeight, 5);
    // With all hardware and hands fitted, the target above the front tip must
    // be visible through the rear opening, even on the enlarged-belt variants.
    const eye = new THREE.Vector3(0, handling.aimHeight, -handling.aimDepth);
    for (const offset of [-.004, 0, .004]) {
      const direction = new THREE.Vector3(offset, .003, -1).normalize();
      const ray = new THREE.Raycaster(eye, direction);
      expect(ray.intersectObject(model, true).filter(hit => hit.object.visible), 'unobstructed target window').toHaveLength(0);
    }
    // The first visible surface just below the aim point is the front blade,
    // not the receiver, stock, cover or the rear-sight pedestal.
    const tip = new THREE.Vector3(0, handling.aimHeight - .003, layout.frontZ);
    const hits = new THREE.Raycaster(eye, tip.sub(eye).normalize()).intersectObject(model, true);
    expect(hits[0]?.object.name).toBe(`${weapon.id}__front-sight`);
    handling.dispose(); remove(); disposeModel(model);
  });

  it(`${variants[0]}: keeps cover details hinged and the feed belt with the reload`, () => {
    const id = family === 3 ? 'mag-inspired' : 'cis50-inspired';
    const model = buildServiceWeapon(id)!, handling = createWeaponHandling(model, family);
    const cover = model.getObjectByName(`${id}__feed-cover`)!;
    const latch = model.getObjectByName(`${id}__cover-latch`)!;
    const belt = model.getObjectByName(`${id}__feed-belt`)!;
    const magazine = model.getObjectByName(`${id}__magazine`)!;
    const control = model.getObjectByName(`${id}__charging-handle`)!;
    const closed = latch.getWorldPosition(new THREE.Vector3()), pivot = cover.position.clone(), controlZ = control.position.z;
    handling.update(.42, false); model.updateMatrixWorld(true);
    expect(latch.parent).toBe(cover);
    expect(cover.position.equals(pivot)).toBe(true);
    expect(latch.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(closed.y + .1);
    expect(belt.visible).toBe(false); expect(magazine.visible).toBe(false);
    handling.update(.86, true); expect(control.position.z).toBeGreaterThan(controlZ);
    handling.update(null, false); model.updateMatrixWorld(true);
    expect(latch.getWorldPosition(new THREE.Vector3()).distanceTo(closed)).toBeLessThan(.00001);
    expect(belt.visible).toBe(true); expect(magazine.visible).toBe(true);
    expect(control.position.z).toBe(controlZ);
    handling.dispose(); disposeModel(model);
  });
}
