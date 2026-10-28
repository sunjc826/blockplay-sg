import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, ITEM_TIERS, itemById, tierRank } from './armory-catalog';
import { createProfile, equip, resolveLoadout } from './armory-state';
import { resolveEffectStyle } from './fps-effect-styles';
import { gunfireReports } from './gunfire-reports';
import { gunshotTone } from './gunshot-audio';
import { accessorySpreadScale, hasLaser, hasLight, hipSpreadScale, muzzleSignature } from './weapon-accessories';
import { fitWeaponAccessories, LASER_EMITTER, LIGHT_EMITTER, muzzleSocket, MUZZLE_EXIT } from './weapon-accessory-models';
import { buildSightHousing } from './weapon-sight-housings';
import { fitWeaponOptic, getWeaponSight } from './weapon-optics';
import { buildServiceWeapon } from './service-weapon-models';
import { hardwareByPart } from './weapon-hardware';

const resolved = (id: string) => {
  const item = itemById(id)!, base = createProfile();
  return resolveLoadout(equip({ ...base, owned: [...base.owned, id] }, id, item.family!)).weapons[item.family!];
};

describe('what an accessory does', () => {
  it('halves the hip cone with a laser and leaves aimed fire alone', () => {
    expect(hipSpreadScale({ rail: 'laser' })).toBe(.5);
    expect(hipSpreadScale({ rail: 'laser-light' })).toBe(.5);
    expect(hipSpreadScale({ rail: 'light' })).toBe(1);
    expect(hipSpreadScale({ brace: true })).toBe(.75);
    expect(hipSpreadScale({ rail: 'laser', brace: true })).toBeCloseTo(.375);
    expect(accessorySpreadScale({ rail: 'laser' }, 0)).toBe(.5);
    expect(accessorySpreadScale({ rail: 'laser' }, 1)).toBe(1);
    expect(accessorySpreadScale(undefined, 0)).toBe(1);
  });
  it('tells a laser from a light', () => {
    expect([hasLaser({ rail: 'laser' }), hasLight({ rail: 'laser' })]).toEqual([true, false]);
    expect([hasLaser({ rail: 'light' }), hasLight({ rail: 'light' })]).toEqual([false, true]);
    expect([hasLaser({ rail: 'laser-light' }), hasLight({ rail: 'laser-light' })]).toEqual([true, true]);
  });
  it('quietens and hides a suppressed shot, and makes a compensated one louder and brighter', () => {
    const bare = muzzleSignature(), can = muzzleSignature('suppressor'), comp = muzzleSignature('compensator');
    expect(can.flare).toBeLessThan(bare.flare * .2); expect(can.report).toBeLessThan(bare.report); expect(can.heat).toBeLessThan(bare.heat);
    expect(comp.flare).toBeGreaterThan(bare.flare); expect(comp.report).toBeGreaterThan(bare.report);
  });
});

describe('how a suppressed shot sounds', () => {
  it('is quieter at the ear and loses most of its crack and echo', () => {
    const bare = gunshotTone(9, 32, 0, true), can = gunshotTone(9, 32, 0, true, 'suppressor');
    expect(can.level).toBeLessThan(bare.level);
    expect(can.crack).toBeLessThan(bare.crack * .5);
    expect(can.tail).toBeLessThan(bare.tail * .5);
  });
  it('falls out of earshot far sooner than a bare muzzle', () => {
    expect(gunshotTone(5.56, 39, 250).level).toBeGreaterThan(0);
    expect(gunshotTone(5.56, 39, 250, false, 'suppressor').level).toBeLessThan(gunshotTone(5.56, 39, 250).level * .5);
  });
  it('is heard by other players as suppressed when the host says so', () => {
    const last = new Map<string, number>(), listener = { x: 0, y: 0, z: 0 };
    const shooter = { id: 'p2', x: 20, y: 0, z: 0, shots: 0, weapon: 0, muzzle: 'suppressor' as const };
    gunfireReports([shooter], last, 'p1', listener);
    const [report] = gunfireReports([{ ...shooter, shots: 1 }], last, 'p1', listener);
    expect(report.muzzle).toBe('suppressor');
  });
  it('draws a smaller flash from the effect style', () => {
    expect(resolveEffectStyle({ variant: 'p30-silent' }).flare.size).toBeLessThan(resolveEffectStyle({ variant: 'p30-issued' }).flare.size * .2);
    expect(resolveEffectStyle({ variant: 'p30-chiong' }).flare.size).toBeGreaterThan(resolveEffectStyle({ variant: 'p30-issued' }).flare.size);
  });
});

describe('the models', () => {
  it('moves the muzzle exit to the end of a can, past the authored socket', () => {
    const model = buildServiceWeapon('p30-inspired')!;
    const remove = fitWeaponAccessories(model, resolved('p30-silent'));
    const exit = model.getObjectByName(MUZZLE_EXIT)!, socket = model.getObjectByName('p30-inspired__socket_muzzle')!;
    expect(muzzleSocket(model, 'p30-inspired')).toBe(exit);
    expect(exit.position.z).toBeLessThan(socket.position.z - .12);
    remove();
    expect(model.getObjectByName(MUZZLE_EXIT)).toBeUndefined();
    expect(muzzleSocket(model, 'p30-inspired')).toBe(socket);
  });
  it('gives a laser-light both emitters, forward of the housing', () => {
    const model = buildServiceWeapon('p30-inspired')!;
    fitWeaponAccessories(model, resolved('p30-sotong'));
    model.updateMatrixWorld(true);
    for (const name of [LASER_EMITTER, LIGHT_EMITTER]) {
      const at = model.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
      // Under the dust cover and ahead of the trigger guard.
      expect(at.y).toBeLessThan(.155); expect(at.z).toBeLessThan(-.09);
    }
  });
  it('stands the offset dot at 45 degrees, so canting by that much brings it to the top', () => {
    const housing = buildSightHousing(new THREE.Group(), 'sar21-inspired', 'prism', true)!;
    const { main, offset } = housing;
    expect(offset).toBeDefined();
    expect(offset!.roll).toBeCloseTo(Math.PI / 4);
    // Up and to the right of the prism's axis, on its 45° line.
    expect(offset!.x).toBeGreaterThan(0);
    expect(offset!.y - main.y).toBeCloseTo(offset!.x, 5);
    // Rolled over, the dot sits straight above the bore line.
    const rolled = new THREE.Vector2(offset!.x, offset!.y).rotateAround(new THREE.Vector2(0, main.y), offset!.roll);
    expect(rolled.x).toBeCloseTo(0, 5);
    housing.dispose();
  });
  it('raises the Ultimax holographic sight so its window looks over the carry handle', () => {
    const housing = buildSightHousing(new THREE.Group(), 'ultimax-inspired', 'holo', false)!;
    const { main } = housing;
    // The handle's back end (z .02) tops out at y .324; the window's lower edge
    // is at its front, and the eye sits aimDepth behind the model's origin.
    const eye = -main.aimDepth, windowFront = main.lensZ - .055, handleEnd = .02;
    const lowest = main.y - main.window!.height / 2 * (eye - handleEnd) / (eye - windowFront);
    expect(lowest).toBeGreaterThan(.324);
    expect(main.window!.width).toBeGreaterThan(main.window!.height);
    housing.dispose();
  });
  it('clips the hologram and its bloom to the window while leaving its corners usable', () => {
    for (const variant of ['sar-nightowl', 'ult-lights']) {
      const model = new THREE.Group(), remove = fitWeaponOptic(model, resolved(variant));
      const sight = getWeaponSight(model)!;
      model.updateMatrixWorld(true);
      const through = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, sight.aimHeight + y, .5), new THREE.Vector3(0, 0, -1))
        .intersectObject(sight.lens, true);
      // The old circular reticle plane leaked beyond the rectangular aperture.
      // Both reticle layers should cover an inside corner, but never its outside.
      expect(through(.018, .012), variant).toHaveLength(2);
      expect(through(.023, 0), variant).toHaveLength(0);
      expect(through(0, .018), variant).toHaveLength(0);
      // The centre remains clear through the complete metal housing from the eye.
      const ray = new THREE.Raycaster(new THREE.Vector3(0, sight.aimHeight, -sight.aimDepth), new THREE.Vector3(0, 0, -1));
      const opaque = ray.intersectObject(model.getObjectByName('sight-holo')!, true)
        .filter(hit => !((hit.object as THREE.Mesh).material as THREE.Material).transparent);
      expect(opaque, variant).toHaveLength(0);
      remove();
    }
  });
  it('clamps a machine gun\u2019s sight to its feed cover, which it rides on a belt change, and folds the rear sight', () => {
    for (const id of ['mag-lepak', 'cis50-summit']) {
      const weapon = resolved(id), model = buildServiceWeapon(weapon.id)!;
      const rear = model.getObjectByName(`${weapon.id}__rear-sight`)!, cover = model.getObjectByName(`${weapon.id}__feed-cover`)!;
      const remove = fitWeaponOptic(model, weapon), sight = getWeaponSight(model)!;
      expect(sight.lens.parent?.parent, id).toBe(cover);
      expect(rear.visible, id).toBe(false);
      // Shut, the lens is where the housing put it, over the iron sight line.
      model.updateMatrixWorld(true);
      const shut = model.worldToLocal(sight.lens.getWorldPosition(new THREE.Vector3()));
      expect(shut.y, id).toBeCloseTo(sight.aimHeight, 6);
      expect(sight.aimHeight, id).toBeGreaterThan(weapon.sightHeight);
      // Opened as the reload opens it, the sight swings up with the cover.
      cover.rotation.x = -.6; model.updateMatrixWorld(true);
      expect(model.worldToLocal(sight.lens.getWorldPosition(new THREE.Vector3())).y, id).toBeGreaterThan(shut.y + .03);
      cover.rotation.x = 0;
      remove();
      expect(rear.visible, id).toBe(true);
      expect(cover.children.some(child => child.name.endsWith('-optic')), id).toBe(false);
    }
  });
  it('fits every sight to every platform a variant puts it on', () => {
    for (const item of ARMORY_CATALOG) for (const part of item.fitted ?? []) {
      const sight = part.accessories?.sight;
      if (!sight) continue;
      const housing = buildSightHousing(new THREE.Group(), resolved(item.id).id, sight, !!part.accessories?.offsetDot);
      expect(housing, `${item.id} ${sight}`).toBeDefined();
      housing!.dispose();
    }
  });
});

describe('the dossier', () => {
  it('names each accessory and says what to look for', () => {
    const parts = hardwareByPart('sar-nightowl');
    expect(parts.get('fitted:muzzle')?.kind).toBe('suppressor');
    expect(parts.get('fitted:rail')?.kind).toBe('laser');
    expect(hardwareByPart('p30-chiong').get('fitted:handling')?.kind).toBe('brace');
    expect(hardwareByPart('ult-lights').get('fitted:rail')?.visual).toMatch(/torch/);
  });
});

describe('the kitted tiers', () => {
  const shop = ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.price > 0 && !item.source);
  const of = (tier: string) => shop.filter(item => item.tier === tier);
  it('ranks rarity Issued up to Mythic', () => {
    expect(ITEM_TIERS).toEqual(['Issued', 'Field', 'Elite', 'Ultra', 'Legendary', 'Mythic']);
    expect(tierRank('Mythic')).toBeGreaterThan(tierRank('Legendary'));
    expect(tierRank('Ultra')).toBeGreaterThan(tierRank('Elite'));
  });
  it('gives the top three to variants carrying accessories, sold for tokens', () => {
    for (const tier of ['Ultra', 'Legendary', 'Mythic'] as const) for (const item of of(tier)) {
      expect(item.fitted?.some(part => part.accessories), item.id).toBe(true);
      expect(item.currency, item.id).toBe('tokens');
    }
    expect(of('Mythic').map(item => item.id).sort()).toEqual(['p30-atas', 'sar-twoeyes']);
  });
  it('unlocks a higher tier later than the tier below it, on average', () => {
    const level = (tier: string) => of(tier).reduce((sum, item) => sum + (item.requiredLevel ?? 1), 0) / of(tier).length;
    expect(level('Mythic')).toBeGreaterThan(level('Legendary'));
    expect(level('Legendary')).toBeGreaterThan(level('Ultra'));
  });
  it('draws each tier in its own colours', () => {
    const ids = ITEM_TIERS.map(tier => resolveEffectStyle({ variant: ARMORY_CATALOG.find(item => item.category === 'weapon' && item.tier === tier)!.id }).id.split(':')[0]);
    expect(ids).toEqual(['issued', 'field', 'elite', 'ultra', 'legendary', 'mythic']);
    expect(resolveEffectStyle({ variant: 'sar-twoeyes' }).tracer.colour).not.toBe(resolveEffectStyle({ variant: 'sar-marksman' }).tracer.colour);
  });
});
