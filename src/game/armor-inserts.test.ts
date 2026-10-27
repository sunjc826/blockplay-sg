import { describe, expect, it } from 'vitest';
import { insertTraits, MAX_DEFLECT, PLAIN_INSERT, ratedAbsorption, sightRangeAgainst, smokeHides, threatOf } from './armor-inserts';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { applyArmorDamage, createProfile, resolveLoadout } from './armory-state';
import { plateOpponent, shotsToKillOpponent } from './armory-balance';
import { getArenaRole } from './arena-roles';
import { createArena, type ArenaActor, type ArenaSimulation } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';
import { shootAndLand } from './arena-test-shots';

const wearing = (plate: string) => {
  const base = createProfile();
  return resolveLoadout({ ...base, owned: [...base.owned, plate], plate });
};

describe('what a round is and what an insert stops', () => {
  it('classes rounds by calibre, and leaves anything that is not a round unclassed', () => {
    expect([5.56, 7.62, 9, 12.7].map(threatOf)).toEqual(['rifle', 'gpmg', 'pistol', 'heavy']);
    expect(threatOf(undefined)).toBeUndefined(); expect(threatOf(NaN)).toBeUndefined(); expect(threatOf(0)).toBeUndefined();
  });
  it('keeps the full share up to the rating and half as much for each class past it', () => {
    expect(ratedAbsorption(.65, 'rifle', 9)).toBe(.65);
    expect(ratedAbsorption(.65, 'rifle', 5.56)).toBe(.65);
    expect(ratedAbsorption(.65, 'rifle', 7.62)).toBeCloseTo(.325);
    expect(ratedAbsorption(.65, 'rifle', 12.7)).toBeCloseTo(.1625);
    expect(ratedAbsorption(.8, 'heavy', 12.7)).toBe(.8);
    // A blast or the gun's own recoil is not a round.
    expect(ratedAbsorption(.65, 'pistol')).toBe(.65);
  });
  it('treats every insert from before ratings, and none, as rifle-rated', () => {
    for (const id of ['plate-none', 'plate-soft', 'plate-ceramic', 'plate-elite']) expect(wearing(id).insert, id).toEqual(PLAIN_INSERT);
    expect(insertTraits(undefined)).toEqual(PLAIN_INSERT);
  });
  it('clamps what an insert may claim', () => {
    expect(insertTraits({ stops: 'tank', scent: 'yes', deflect: 5 })).toEqual({ stops: 'rifle', scent: false, deflect: MAX_DEFLECT });
    expect(insertTraits({ deflect: NaN }).deflect).toBe(0);
  });
});

describe('a hit on rated inserts', () => {
  it('lets a .50 through rifle plates that a rifle round would not get through', () => {
    // Ceramic: 75 points, 65%. A rifle round meets the full share, a .50 a quarter of it.
    expect(applyArmorDamage(100, 75, 36, .65, { insert: PLAIN_INSERT, caliberMm: 5.56 }).blocked).toBeCloseTo(23.4);
    expect(applyArmorDamage(100, 75, 160, .65, { insert: PLAIN_INSERT, caliberMm: 12.7 }).blocked).toBeCloseTo(26);
    // Without a calibre the hit meets the plain share, as before ratings.
    expect(applyArmorDamage(100, 75, 20, .65)).toEqual({ health: 93, armor: 62, blocked: 13, deflected: false });
  });
  it('turns a round when the roll falls under the luck, and never a blast', () => {
    const lucky = insertTraits({ deflect: .2 });
    expect(applyArmorDamage(100, 40, 36, .35, { insert: lucky, caliberMm: 5.56, roll: .1 })).toEqual({ health: 100, armor: 40, blocked: 0, deflected: true });
    expect(applyArmorDamage(100, 40, 36, .35, { insert: lucky, caliberMm: 5.56, roll: .5 }).deflected).toBe(false);
    expect(applyArmorDamage(100, 40, 36, .35, { insert: lucky, roll: .1 }).deflected).toBe(false);
  });
});

describe('the inserts on the shelf', () => {
  const plates = ARMORY_CATALOG.filter(item => item.category === 'plate');
  it('has something past the Aegis for each heavier round, and pays for it', () => {
    const aegis = itemById('plate-elite')!;
    for (const id of ['plate-steel', 'plate-composite', 'plate-durian', 'plate-pillbox']) {
      const plate = itemById(id)!;
      expect(plate.stops, id).not.toBe('rifle');
      // Every rated insert costs more movement than the Aegis, or something else.
      expect((plate.mobility ?? 1) < (aegis.mobility ?? 1) || plate.scent, id).toBeTruthy();
    }
    expect(plates.filter(plate => plate.stops === 'heavy').map(plate => plate.id)).toEqual(['plate-pillbox']);
  });
  it('holds a .50 only in the Pillbox, and lets a .50 kill through the Aegis in one hit', () => {
    const cis = FPS_WEAPONS[4];
    expect(shotsToKillOpponent(plateOpponent('plate-elite')!, cis.damage, cis.caliberMm)).toBe(1);
    expect(shotsToKillOpponent(plateOpponent('plate-pillbox')!, cis.damage, cis.caliberMm)).toBe(2);
  });
  it('makes GPMG-rated plates worth their weight against a GPMG', () => {
    const mag = FPS_WEAPONS[3];
    const ceramic = shotsToKillOpponent(plateOpponent('plate-ceramic')!, mag.damage, mag.caliberMm);
    expect(shotsToKillOpponent(plateOpponent('plate-steel')!, mag.damage, mag.caliberMm)).toBeGreaterThan(ceramic);
    expect(shotsToKillOpponent(plateOpponent('plate-composite')!, mag.damage, mag.caliberMm)).toBeGreaterThan(ceramic);
  });
  it('gives the durian the thickest husk and the pineapple the only luck', () => {
    const durian = itemById('plate-durian')!;
    for (const plate of plates) {
      expect(durian.protection!).toBeGreaterThanOrEqual(plate.protection ?? 0);
      expect(durian.absorption!).toBeGreaterThanOrEqual(plate.absorption ?? 0);
    }
    expect(wearing('plate-durian').insert.scent).toBe(true);
    expect(plates.filter(plate => plate.deflect).map(plate => plate.id)).toEqual(['plate-pineapple']);
    expect(wearing('plate-pineapple').insert.deflect).toBe(.2);
  });
  it('keeps heavy infantry on GPMG-rated plates, so a GPMG meets them as before', () => {
    expect(getArenaRole('tank')!.stops).toBe('gpmg');
    expect(getArenaRole('assault')!.stops).toBeUndefined();
  });
});

describe('a durian gives you away', () => {
  it('is seen from half again as far, and through smoke', () => {
    const durian = wearing('plate-durian').insert;
    expect(sightRangeAgainst(65, durian)).toBe(97.5); expect(sightRangeAgainst(65, PLAIN_INSERT)).toBe(65);
    expect(smokeHides(durian)).toBe(false); expect(smokeHides(PLAIN_INSERT)).toBe(true);
  });
});

describe('inserts in the arena', () => {
  const actor = (arena: ArenaSimulation, id: string) => arena.snapshot().actors.find(a => a.id === id)!;
  const aim = (from: ArenaActor, to: ArenaActor) => {
    const x = to.x - from.x, y = to.y - .6 - from.y, z = to.z - from.z, length = Math.hypot(x, y, z);
    return { x: x / length, y: y / length, z: z / length };
  };
  const duel = (plate: string) => {
    const arena = createArena([], 0), loadout = wearing(plate);
    arena.addPlayer('one', 'Alpha', 0, 0, FPS_WEAPONS);
    arena.addPlayer('two', 'Bravo', loadout.armor, loadout.absorption, FPS_WEAPONS, undefined, false, undefined, loadout.insert);
    return arena;
  };
  const fire = (arena: ArenaSimulation, weapon: number) => {
    if (actor(arena, 'one').weapon !== weapon) { arena.setInput('one', { ...actor(arena, 'one'), weapon, playing: true }); for (let t = 0; t < 10; t++) arena.step(.1); }
    const shooter = actor(arena, 'one');
    return shootAndLand(arena, 'one', shooter, aim(shooter, actor(arena, 'two')), weapon);
  };
  it('holds a GPMG round to the plate rating', () => {
    // FN MAG, 60 damage: ceramic is rifle-rated and keeps half its share, steel takes it in full.
    expect(fire(duel('plate-ceramic'), 3).damage).toBeCloseTo(60 - 60 * .325);
    expect(fire(duel('plate-steel'), 3).damage).toBeCloseTo(60 - 60 * .55);
    expect(fire(duel('plate-ceramic'), 0).damage).toBeCloseTo(36 - 36 * .65);
  });
  it('marks a durian wearer in the snapshot, and nobody else', () => {
    expect(actor(duel('plate-durian'), 'two').scent).toBe(true);
    expect(actor(duel('plate-durian'), 'one').scent).toBeUndefined();
    expect(actor(duel('plate-elite'), 'two').scent).toBeUndefined();
  });
  it('glances some rounds off a pineapple and lets the rest through', () => {
    const arena = duel('plate-pineapple');
    arena.setPlayerHealthMultiplier('two', 10);
    const hits: number[] = [];
    for (let i = 0; i < 60; i++) {
      hits.push(fire(arena, 0).damage);
      for (let t = 0; t < 4; t++) arena.step(.1);
    }
    const glanced = hits.filter(damage => damage === 0).length;
    expect(glanced).toBeGreaterThan(3); expect(glanced).toBeLessThan(25);
  });
  it('lets a player change inserts mid-match, and the scent with them', () => {
    const arena = duel('plate-elite'), durian = wearing('plate-durian');
    arena.setPlayerLoadout('two', durian.armor, durian.absorption, FPS_WEAPONS, undefined, durian.insert);
    expect(actor(arena, 'two').scent).toBe(true);
    arena.setPlayerLoadout('two', 100, .72, FPS_WEAPONS, undefined, PLAIN_INSERT);
    expect(actor(arena, 'two').scent).toBeUndefined();
  });
});
