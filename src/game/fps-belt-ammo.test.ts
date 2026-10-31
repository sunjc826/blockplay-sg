import * as THREE from 'three';
import { expect, it } from 'vitest';
import { buildServiceWeapon } from './service-weapon-models';
import { createWeaponHandling } from './fps-viewmodel';
import { advanceWeapon, beginReload, fireWeapon, FPS_WEAPONS, interruptReload, magazineRounds, type WeaponState } from './fps-rules';
import { disposeModel } from './armory-visuals';

for (const family of [3, 4, 7]) {
  const spec = FPS_WEAPONS[family];
  function fixture() {
    const model = buildServiceWeapon(spec.id)!, handling = createWeaponHandling(model, family);
    const rounds = model.getObjectsByProperty('name', `${spec.id}__belt-round`);
    return { model, handling, rounds, done: () => { handling.dispose(); disposeModel(model); } };
  }
  it(`${spec.name}: drains every tail cartridge and its links, leaving the last round at the feed tray`, () => {
    const f = fixture(), homes = f.rounds.map(round => round.position.clone()), n = f.rounds.length;
    expect(n).toBe(family === 7 ? 6 : 8);
    const port = f.model.getObjectByName(`${spec.id}__feed-mouth`) ?? f.model.getObjectByName(`${spec.id}__feed-port`)!;
    const lastCase = f.rounds[n - 1].getObjectByName(`${spec.id}__belt-case`)!;
    f.model.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(lastCase).max.x).toBeLessThan(new THREE.Box3().setFromObject(port).min.x + .001);
    const render = (remaining: number) => f.handling.update(null, false, undefined, undefined, undefined, { rounds: remaining, capacity: spec.capacity });
    render(spec.capacity); expect(f.handling.beltAmmo).toEqual({ total: n, remaining: n, visible: n });
    render(n); expect(f.rounds.every(round => round.visible)).toBe(true);
    for (let remaining = n - 1; remaining >= 0; remaining--) {
      render(remaining);
      expect(f.handling.beltAmmo?.visible).toBe(remaining);
      f.rounds.forEach((round, i) => {
        expect(round.visible).toBe(i >= n - remaining);
        expect(round.position.distanceTo(homes[i])).toBeLessThan(1e-9);
        // Cartridge case, projectile and link inherit the same visibility.
        let drawn = 0; round.traverseVisible(node => { if (node instanceof THREE.Mesh) drawn++; });
        expect(drawn).toBe(round.visible ? 3 : 0);
      });
    }
    render(spec.capacity); expect(f.rounds.every(round => round.visible)).toBe(true);
    render(0); f.handling.dispose(); expect(f.rounds.every(round => round.visible)).toBe(true);
    disposeModel(f.model);
  });

  it(`${spec.name}: hides an extracted belt, threads fresh rounds before seating, and resumes interrupted reloads`, () => {
    const f = fixture(), state: WeaponState = { magazine: 3, reserve: spec.capacity * 2, chambered: true, cooldown: 0, reloadRemaining: 0 };
    const render = (progress: number | null, pending = false) => f.handling.update(progress, false, undefined, undefined,
      { magazineOut: state.magazineOut === true, pending, capacity: spec.capacity, saved: state.reloadSaved ?? 0 },
      { rounds: magazineRounds(state, spec), capacity: spec.capacity });
    expect(fireWeapon(state, family)).toBe(true); render(null);
    expect(f.handling.beltAmmo?.visible).toBe(2); // Open bolt: every remaining round is in the belt.
    beginReload(state, family); advanceWeapon(state, family, spec.reload * .4); render(.4);
    expect(state.magazineOut).toBe(true); expect(f.handling.beltAmmo?.visible).toBe(0);
    interruptReload(state, family); render(null); expect(f.handling.beltAmmo?.visible).toBe(0);
    // A fresh box can be held/threaded even though its ammo is not yet seated.
    render(.6, true); expect(state.magazine).toBe(0);
    expect(f.handling.beltAmmo?.visible).toBe(f.rounds.length);
    expect(f.rounds[0].position.distanceTo(f.rounds[f.rounds.length - 1].position)).toBeGreaterThan(.01);
    beginReload(state, family); advanceWeapon(state, family, spec.reload); render(null);
    expect(state.magazine).toBe(spec.capacity); expect(f.handling.beltAmmo?.visible).toBe(f.rounds.length);
    // Ready/charging animation and a switch away/back retain the actual tail.
    state.magazine = 1; render(null); f.model.visible = false;
    f.handling.update(null, false, undefined, .5, undefined, { rounds: 1, capacity: spec.capacity });
    f.model.visible = true; expect(f.handling.beltAmmo?.visible).toBe(1);
    expect(f.rounds[f.rounds.length - 1].visible).toBe(true);
    f.done();
  });
}
