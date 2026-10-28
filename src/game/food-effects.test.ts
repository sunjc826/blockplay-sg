import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, itemById, tierRank, type ShopItem } from './armory-catalog';
import { advanceFoodEffects, applyFoodEffects, arenaFoodModifiers, cycleRate, damageDealtScale, damageTakenScale, foodEffectLines, foodEffectViews, footSpeedScale,
  loadRelief, reloadRate, survivesWithAhMa, type ActiveFoodEffects } from './food-effects';
import { advanceWeapon, beginReload, createLoadout, fireWeapon, FPS_WEAPONS } from './fps-rules';
import { supplyProfile } from './fps-healing';
import { foodOptions, pickUtility, utilityBelt } from './utility-belt';
import { equipmentMovement } from './fps-encumbrance';
import { resolveLoadout, createProfile } from './armory-state';

const foods = ARMORY_CATALOG.filter(item => item.category === 'consumable' && item.supplyType === 'food');
const meal = (id: string) => itemById(id)!;

describe('food catalogue', () => {
  it('gives every food at least one effect, more of them the bigger the meal', () => {
    for (const food of foods) expect(food.foodEffects?.length, food.id).toBeGreaterThan(0);
    const count = (tier: ShopItem['tier']) => foods.filter(food => food.tier === tier).map(food => food.foodEffects!.length);
    expect(count('Issued')).toEqual([1, 1]);
    expect(count('Field')).toEqual([2, 2]);
    expect(count('Elite')).toEqual([3]);
    expect(count('Ultra')).toEqual([3]);
    expect(count('Legendary')).toEqual([4]);
    expect(count('Mythic')).toEqual([4]);
  });
  it('never lets a higher tier carry a weaker or shorter version of an effect a lower tier has', () => {
    for (const high of foods) for (const low of foods) {
      if (tierRank(high.tier) <= tierRank(low.tier)) continue;
      for (const effect of high.foodEffects!) {
        const lower = low.foodEffects!.find(e => e.kind === effect.kind);
        if (!lower) continue;
        expect(effect.strength, `${high.id} vs ${low.id} ${effect.kind}`).toBeGreaterThanOrEqual(lower.strength);
        expect(effect.seconds, `${high.id} vs ${low.id} ${effect.kind}`).toBeGreaterThanOrEqual(lower.seconds);
      }
    }
  });
  it('ties effects to what is in the food', () => {
    const kinds = (id: string) => meal(id).foodEffects!.map(e => e.kind);
    expect(kinds('food-kaya-toast')).toEqual(['wired']);
    expect(kinds('food-bak-kut-teh')).toContain('load-bearer');
    expect(kinds('food-mala-da-la')).toEqual(expect.arrayContaining(['numb', 'fired-up']));
    expect(kinds('food-ah-ma-tingkat')).toContain('ah-ma');
    expect(kinds('food-smoking-corner')).toEqual(['well-fed', 'energised', 'steady', 'wired']);
  });
  it('makes the smoking corner the fastest, steadiest and quickest-handed thing on the menu', () => {
    const best = (kind: string) => Math.max(...foods.flatMap(food => food.foodEffects!.filter(e => e.kind === kind).map(e => e.strength)));
    for (const effect of meal('food-smoking-corner').foodEffects!) expect(effect.strength).toBe(best(effect.kind));
    expect(supplyProfile(meal('food-smoking-corner')).verb).toBe('TAKING FIVE');
  });
  it('takes Ah Ma\'s four tiers longer to eat than any other meal', () => {
    const tingkat = supplyProfile(meal('food-ah-ma-tingkat')).seconds;
    expect(tingkat).toBe(7);
    for (const food of foods) if (food.id !== 'food-ah-ma-tingkat') expect(supplyProfile(food).seconds).toBeLessThan(tingkat);
  });
});

describe('food effects', () => {
  it('refreshes an effect already running with the stronger and longer of the two, never stacking', () => {
    const active: ActiveFoodEffects = {};
    applyFoodEffects(active, [{ kind: 'energised', strength: .05, seconds: 90 }]);
    advanceFoodEffects(active, 60);
    applyFoodEffects(active, [{ kind: 'energised', strength: .08, seconds: 20 }]);
    expect(active.energised).toMatchObject({ strength: .08, remaining: 30 });
    expect(footSpeedScale(active)).toBeCloseTo(1.08);
  });
  it('heals only while well fed lasts, and drops effects that run out', () => {
    const active = applyFoodEffects({}, [{ kind: 'well-fed', strength: 2, seconds: 3 }, { kind: 'wired', strength: .1, seconds: 10 }]);
    const step = advanceFoodEffects(active, 5);
    expect(step.heal).toBeCloseTo(6);
    expect(step.expired).toEqual(['well-fed']);
    expect(Object.keys(active)).toEqual(['wired']);
    expect(foodEffectViews(active)).toEqual([expect.objectContaining({ kind: 'wired', remaining: 5, share: .5 })]);
  });
  it('turns effects into the figures the engine and simulation use', () => {
    const active = applyFoodEffects({}, meal('food-mala-da-la').foodEffects);
    expect(damageTakenScale(active)).toBeCloseTo(.8);
    expect(cycleRate(active)).toBeCloseTo(1.12);
    expect(damageDealtScale(active)).toBeCloseTo(1.12);
    expect(reloadRate(active)).toBe(1);
    expect(arenaFoodModifiers({})).toEqual({ reloadRate: 1, cycleRate: 1, damage: 1, damageTaken: 1, ahMa: 0 });
  });
  it('lets Ah Ma save one lethal hit per tingkat', () => {
    const active = applyFoodEffects({}, meal('food-ah-ma-tingkat').foodEffects);
    expect(survivesWithAhMa(active, 12)).toEqual({ health: 12, saved: false });
    expect(survivesWithAhMa(active, 0)).toEqual({ health: 35, saved: true });
    expect(survivesWithAhMa(active, 0)).toEqual({ health: 0, saved: false });
  });
  it('describes each effect with its figure and duration', () => {
    expect(foodEffectLines(meal('food-kaya-toast').foodEffects)).toEqual(['Wired · Reloads 12% faster · 60 s']);
  });
});

describe('effects on the gun and the load', () => {
  it('runs a reload and the cycle faster without touching the other', () => {
    const [plain, quick] = [createLoadout()[0], createLoadout()[0]];
    for (const state of [plain, quick]) { state.magazine = 1; beginReload(state, 0); }
    advanceWeapon(plain, 0, .5); advanceWeapon(quick, 0, .5, FPS_WEAPONS, { reload: 1.2 });
    expect(plain.reloadRemaining - quick.reloadRemaining).toBeCloseTo(.1);
    const [slow, fast] = [createLoadout()[0], createLoadout()[0]];
    fireWeapon(slow, 0); fireWeapon(fast, 0);
    advanceWeapon(slow, 0, FPS_WEAPONS[0].interval / 1.2); advanceWeapon(fast, 0, FPS_WEAPONS[0].interval / 1.2, FPS_WEAPONS, { cycle: 1.2 });
    expect(slow.cooldown).toBeGreaterThan(0); expect(fast.cooldown).toBeCloseTo(0);
  });
  it('lightens the felt load, not the weighed one', () => {
    const equipment = resolveLoadout({ ...createProfile(), plate: 'plate-ceramic', owned: [...createProfile().owned, 'plate-ceramic'] });
    const plain = equipmentMovement(equipment, equipment.carriedFamilies[0]);
    const relieved = equipmentMovement(equipment, equipment.carriedFamilies[0], undefined, undefined, loadRelief(applyFoodEffects({}, meal('food-bak-kut-teh').foodEffects)));
    expect(relieved.totalKg).toBe(plain.totalKg);
    expect(relieved.movement).toBeGreaterThan(plain.movement);
  });
});

describe('choosing food', () => {
  const held = { 'food-kaya-toast': 2, 'food-chicken-rice': 1, 'food-mala-da-la': 1 };
  it('hands out the chosen food while any is held, else heals to need', () => {
    const hurt = { health: 75, maxHealth: 100 };
    expect(pickUtility('food', held, hurt)?.id).toBe('food-chicken-rice');
    expect(pickUtility('food', held, hurt, 'food-mala-da-la')?.id).toBe('food-mala-da-la');
    expect(pickUtility('food', held, hurt, 'food-field-ration')?.id).toBe('food-chicken-rice');
    expect(pickUtility('food', held, hurt, 'kit-bandage')?.id).toBe('food-chicken-rice');
    expect(utilityBelt(held, hurt, 'food-kaya-toast').find(slot => slot.kind === 'food')).toMatchObject({ chosen: true, next: { id: 'food-kaya-toast', effect: '+20 HP · Wired' } });
  });
  it('offers Auto first, then every food carried, with its effects', () => {
    const options = foodOptions(held, { health: 100, maxHealth: 100 });
    expect(options.map(option => option.id)).toEqual([null, 'food-kaya-toast', 'food-chicken-rice', 'food-mala-da-la']);
    expect(options[0]).toMatchObject({ name: 'Auto', count: 4 });
    expect(options[3]).toMatchObject({ tier: 'Ultra', count: 1, health: 80 });
    expect(options[3].effects).toHaveLength(3);
  });
});
