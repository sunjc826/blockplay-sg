import { describe, expect, it } from 'vitest';
import { aimSpeedScale, applyArmorDamage, claimElimination, claimReward, collectTraits, consumeItem, isEquipped, jumpScale, slotIsFitted, createProfile, equip, previewLoadout, purchase, purchaseFromVendor, purchaseLevel, resolveLoadout, restoreProfile, type ArmoryProfile, type ExerciseReward } from './armory-state';
import { ARMORY_CATALOG, CONSUMABLE_LIMIT, itemById } from './armory-catalog';
import { levelSkip, MAX_LEVEL, MIN_SKIP_PRICE, progression, registerElimination, skipCostFrom, skipCostToLevel, xpForLevel } from './progression';
import { advanceWeapon, beginReload, createLoadout, findTrait, DEFAULT_VARIANTS, FPS_WEAPONS, hitDamage, type WeaponTrait } from './fps-rules';
import { HITSCAN } from './fps-ballistics';
const veteran = () => ({ ...createProfile(), xp: 5000, credits: 10000, tokens: 1000 });
const unlock = (id: string) => purchase(veteran(), id).profile;
const result: ExerciseReward = { id: 'round-1', hits: 8, shots: 30, landed: 28, elapsed: 20, combat: false };
describe('persistent armory economy', () => {
  it('charges the correct wallet once and keeps the input immutable', () => {
    const base = veteran(), first = purchase(base, 'sar-vanguard').profile, twice = purchase(first, 'sar-vanguard').profile;
    expect(first.tokens).toBe(760); expect(first.credits).toBe(base.credits); expect(base.owned).not.toContain('sar-vanguard'); expect(twice).toBe(first);
  });
  it('enforces level locks even when the wallet has enough tokens', () => {
    const base = createProfile(); expect(purchase(base, 'sar-vanguard').profile).toBe(base);
    expect(purchase({ ...base, xp: xpForLevel(3) }, 'sar-vanguard').profile.tokens).toBe(60);
  });
  it('rejects insufficient funds, unknown IDs, unowned equipment and wrong weapon families', () => {
    const poor = { ...veteran(), credits: 0 }; expect(purchase(poor, 'sar-ranger').profile).toBe(poor); expect(purchase(poor, 'missing').profile).toBe(poor);
    expect(equip(poor, 'sar-ranger', 0)).toBe(poor); const owner = unlock('sar-vanguard'); expect(equip(owner, 'sar-vanguard', 1)).toBe(owner);
  });
  it('recovers old, malformed or tampered save fields without equipping unowned items', () => {
    expect(restoreProfile('{')).toEqual(createProfile());
    const restored = restoreProfile(JSON.stringify({ version: 1, credits: -9, tokens: 'Infinity', owned: ['missing', 'sar-vanguard', 'sar-vanguard'], guns: [{ variant: 'ult-issued', skin: 'skin-gold', attachments: { optic: 'mag-quick' } }], plate: 'plate-elite', xp: 'oops' }));
    expect(restored.credits).toBe(0); expect(restored.tokens).toBe(300); expect(restored.xp).toBe(0); expect(restored.guns[0].variant).toBe('sar-issued'); expect(restored.guns[0].skin).toBe('skin-issued'); expect(restored.guns[0].attachments).toEqual({}); expect(restored.plate).toBe('plate-none'); expect(restored.owned.filter(id => id === 'sar-vanguard')).toHaveLength(1);
  });
  it('persists a complete equipped loadout', () => { const profile = equip(unlock('sar-vanguard'), 'sar-vanguard', 0); expect(restoreProfile(JSON.stringify(profile))).toEqual(profile); });
  it('awards kills and completion only once and rejects incomplete or malformed rewards', () => {
    const base = createProfile(), killed = claimElimination(base, 'round-1:kill:1'); expect(killed.xp).toBe(25); expect(claimElimination(killed, 'round-1:kill:1')).toBe(killed);
    const rewarded = claimReward(killed, result); expect(rewarded.credits).toBeGreaterThan(base.credits); expect(rewarded.xp).toBeGreaterThan(300); expect(claimReward(rewarded, result)).toBe(rewarded);
    expect(claimReward(base, { ...result, hits: 7 })).toBe(base); expect(claimReward(base, { ...result, shots: Infinity })).toBe(base); expect(claimReward(base, { ...result, landed: 31 })).toBe(base);
  });
});
describe('tokens buy levels', () => {
  it('charges the gap and lands exactly on the threshold', () => {
    const base = createProfile(), { profile } = purchaseLevel(base);
    expect(levelSkip(base.xp).price).toBe(12);
    expect(profile.tokens).toBe(base.tokens - 12); expect(profile.xp).toBe(xpForLevel(2)); expect(progression(profile.xp).level).toBe(2);
    // A bought level opens at zero progress, and the input is untouched.
    expect(progression(profile.xp).progress).toBe(0); expect(base.xp).toBe(0);
  });
  it('prices the XP that is left, so earning discounts the skip', () => {
    expect(levelSkip(0).price).toBe(12); expect(levelSkip(150).price).toBe(6);
    // The floor stops the last few XP of a level rounding down to free.
    expect(levelSkip(xpForLevel(2) - 1).price).toBe(MIN_SKIP_PRICE);
    expect(purchaseLevel({ ...createProfile(), xp: 150 }).profile.xp).toBe(xpForLevel(2));
  });
  it('costs more the higher the level, because the gaps themselves grow', () => {
    expect([1, 2, 3, 4, 5].map(level => levelSkip(xpForLevel(level)).price)).toEqual([12, 20, 28, 36, 44]);
    expect(skipCostToLevel(1)).toBe(0); expect(skipCostToLevel(3)).toBe(32); expect(skipCostToLevel(8)).toBe(252);
    // The climb in front of a player is discounted by the XP already banked.
    expect(skipCostFrom(0, 3)).toBe(32); expect(skipCostFrom(150, 3)).toBe(26); expect(skipCostFrom(xpForLevel(3), 3)).toBe(0);
  });
  it('refuses a short wallet and the level ceiling without touching the profile', () => {
    const poor = { ...createProfile(), tokens: 11 }; expect(purchaseLevel(poor).profile).toBe(poor);
    const capped = { ...createProfile(), xp: xpForLevel(MAX_LEVEL) };
    expect(levelSkip(capped.xp).atMax).toBe(true); expect(purchaseLevel(capped).profile).toBe(capped);
  });
  it('opens a gate the same wallet could not reach before, without discounting the item', () => {
    const base = { ...createProfile(), tokens: 400 };
    expect(purchase(base, 'sar-vanguard').profile).toBe(base);
    const climbed = purchaseLevel(purchaseLevel(base).profile).profile;
    expect(progression(climbed.xp).level).toBe(3); expect(climbed.tokens).toBe(368);
    const bought = purchase(climbed, 'sar-vanguard').profile;
    expect(bought.owned).toContain('sar-vanguard'); expect(bought.tokens).toBe(128);
  });
  it('persists a bought level through a save and reload', () => {
    const climbed = purchaseLevel(createProfile()).profile;
    expect(restoreProfile(JSON.stringify(climbed))).toEqual(climbed);
  });
});
describe('equipment reaches gameplay', () => {
  it('premium damage crosses a target-health breakpoint', () => {
    const base = resolveLoadout(createProfile()).weapons[0], elite = resolveLoadout(equip(unlock('sar-vanguard'), 'sar-vanguard', 0)).weapons[0];
    expect(Math.ceil(115 / base.damage)).toBe(4); expect(Math.ceil(115 / elite.damage)).toBe(3); expect(elite.capacity).toBe(36); expect(elite.interval).toBeLessThan(base.interval);
  });
  it('uses the purchased variant magazine and reload timing in gameplay', () => {
    const profile = equip(unlock('sar-vanguard'), 'sar-vanguard', 0);
    const specs = resolveLoadout(profile).weapons, state = createLoadout(specs)[0];
    expect(specs[0].capacity).toBe(36); expect(specs[0].reload).toBe(1.53);
    state.magazine = 10; expect(beginReload(state, 0, specs)).toBe(true);
    advanceWeapon(state, 0, 1.31, specs); expect(state.magazine).toBe(10);
    advanceWeapon(state, 0, .23, specs); expect(state.magazine).toBe(36);
  });
  it('skin previews do not spend currency, equip the real profile or alter stats', () => {
    const profile = createProfile(), before = resolveLoadout(profile), after = previewLoadout(profile, itemById('skin-gold')!, 0);
    expect(profile.guns[0].skin).toBe('skin-issued'); expect(profile.tokens).toBe(300); expect(after.weapons[0].equipment.skin).toBe('skin-gold'); expect(after.weapons[0].damage).toBe(before.weapons[0].damage); expect(after.weapons[0].reload).toBe(before.weapons[0].reload);
  });
  it('separates rig carrying capacity from armor protection', () => {
    const rig = resolveLoadout(equip(unlock('rig-lbs'), 'rig-lbs', 0)); expect(rig.armor).toBe(0); expect(rig.weapons[0].reserve).toBe(180);
    const plated = resolveLoadout(equip(unlock('plate-ceramic'), 'plate-ceramic', 0)); expect(plated.armor).toBe(75); expect(plated.mobility).toBe(.94);
  });
  it('absorbs only the configured share, then spills exhausted armor damage into health', () => {
    expect(applyArmorDamage(100, 75, 20, .65)).toEqual({ health: 93, armor: 62, blocked: 13 });
    expect(applyArmorDamage(100, 5, 20, .65)).toEqual({ health: 85, armor: 0, blocked: 5 });
    expect(applyArmorDamage(10, 0, 20, .65).health).toBe(0); expect(applyArmorDamage(100, 0, 20, 0).health).toBe(80);
  });
});
describe('levels and arcade announcements', () => {
  it('handles exact thresholds, level jumps, invalid XP and the level cap', () => {
    expect(progression(299).level).toBe(1); expect(progression(300).level).toBe(2); expect(progression(800).level).toBe(3); expect(progression(5000).level).toBe(7); expect(progression(NaN).level).toBe(1); expect(progression(1e9)).toMatchObject({ level: 50, progress: 1, remaining: 0 });
  });
  it('announces only eliminations inside a three-second chain and resets on a gap', () => {
    let chain = registerElimination({ count: 0, lastAt: -Infinity }, 10); expect(chain.label).toBe('');
    chain = registerElimination(chain, 13); expect(chain.label).toBe('DOUBLE KILL'); chain = registerElimination(chain, 15); expect(chain.label).toBe('TRIPLE KILL');
    chain = registerElimination(chain, 18.01); expect(chain.count).toBe(1); expect(chain.label).toBe('');
  });
  it('escalates through rampage and caps the callout text for longer chains', () => {
    let chain = registerElimination({ count: 0, lastAt: -Infinity }, 0); for (let i = 1; i < 10; i++) chain = registerElimination(chain, i);
    expect(chain.count).toBe(10); expect(chain.label).toBe('RAMPAGE');
  });
});

describe('behavioral trait resolution', () => {
  const falloff: WeaponTrait = { kind: 'falloff', near: 20, far: 80, minScale: .5 };
  const softer: WeaponTrait = { kind: 'falloff', near: 30, far: 120, minScale: .7 };
  const precision: WeaponTrait = { kind: 'precision', multiplier: 3 };
  it('flattens sources in precedence order and ignores empty ones', () => {
    expect(collectTraits([falloff], undefined, [precision], [])).toEqual([falloff, precision]);
    expect(collectTraits()).toEqual([]); expect(collectTraits(undefined, undefined)).toEqual([]);
  });
  it('lets a later source override an earlier trait of the same kind', () => {
    expect(findTrait(collectTraits([falloff], [softer]), 'falloff')).toBe(softer);
    expect(findTrait([falloff, precision], 'precision')).toBe(precision);
    expect(findTrait([falloff], 'on-kill')).toBeUndefined();
    expect(findTrait(undefined, 'falloff')).toBeUndefined();
  });
  it('resolves the base weapon traits and hitscan ballistics for a fresh profile', () => {
    const loadout = resolveLoadout(createProfile());
    loadout.weapons.forEach((weapon, i) => {
      expect(weapon.ballistics).toEqual(HITSCAN);
      expect(weapon.traits).toEqual(FPS_WEAPONS[i].traits);
      expect(findTrait(weapon.traits, 'falloff')).toBeDefined();
    });
  });
  it('lets a purchased variant override the base falloff and precision bands', () => {
    const [rifle] = resolveLoadout(equip(unlock('sar-marksman'), 'sar-marksman', 0)).weapons;
    expect(findTrait(rifle.traits, 'falloff')).toEqual({ kind: 'falloff', near: 45, far: 130, minScale: .75 });
    expect(findTrait(rifle.traits, 'precision')?.multiplier).toBe(2.2);
    // Strictly better than the issued rifle at every range and on precise hits.
    for (const range of [10, 45, 90, 130]) expect(hitDamage(rifle, range)).toBeGreaterThan(hitDamage(FPS_WEAPONS[0], range));
    expect(hitDamage(rifle, 20, 'head')).toBeGreaterThan(hitDamage(FPS_WEAPONS[0], 20, 'head'));
  });

});

describe('supplies', () => {
  const stocked = () => ['kit-dressing', 'kit-dressing'].reduce((p, id) => purchase(p, id).profile, veteran());
  it('stacks on repeat purchase instead of refusing as already owned', () => {
    const once = purchase(veteran(), 'kit-dressing').profile, twice = purchase(once, 'kit-dressing').profile;
    expect(once.consumables['kit-dressing']).toBe(1); expect(twice.consumables['kit-dressing']).toBe(2);
    expect(once.owned).not.toContain('kit-dressing');
    expect(twice.credits).toBe(veteran().credits - 600);
  });
  it('selects the first supply bought and refuses to carry more than the limit', () => {
    expect(purchase(veteran(), 'kit-dressing').profile.quickItem).toBe('kit-dressing');
    const many = Array.from({ length: CONSUMABLE_LIMIT + 3 }).reduce<ArmoryProfile>(p => purchase(p, 'kit-ammo').profile, veteran());
    expect(many.consumables['kit-ammo']).toBe(CONSUMABLE_LIMIT);
    expect(purchase(many, 'kit-ammo').profile).toBe(many);
  });
  it('only puts a supply in the quick slot once one is held', () => {
    const empty = veteran();
    expect(equip(empty, 'kit-trauma', 0)).toBe(empty);
    const holder = purchase(empty, 'kit-trauma').profile;
    expect(equip(holder, 'kit-trauma', 0).quickItem).toBe('kit-trauma');
  });
  it('spends one at a time and drops the entry when the last is used', () => {
    const two = stocked();
    const one = consumeItem(two, 'kit-dressing');
    expect(one.consumables['kit-dressing']).toBe(1);
    const none = consumeItem(one, 'kit-dressing');
    expect(none.consumables['kit-dressing']).toBeUndefined();
    expect(consumeItem(none, 'kit-dressing')).toBe(none);
    expect(consumeItem(none, 'not-a-kit')).toBe(none);
  });
  it('resolves the selected supply and its count alongside the loadout', () => {
    const loadout = resolveLoadout(stocked());
    expect(loadout.quickItem?.id).toBe('kit-dressing'); expect(loadout.quickCount).toBe(2);
    expect(resolveLoadout(veteran()).quickCount).toBe(0);
  });
  it('restores held supplies and discards junk counts and unknown ids', () => {
    const saved = JSON.stringify({ ...stocked(), consumables: { 'kit-dressing': 2, 'kit-ammo': -4, 'kit-plates': 999, 'sar-issued': 3, bogus: 2 } });
    const back = restoreProfile(saved);
    expect(back.consumables).toEqual({ 'kit-dressing': 2, 'kit-plates': CONSUMABLE_LIMIT });
    expect(restoreProfile(JSON.stringify({ ...createProfile(), quickItem: 'sar-issued' })).quickItem).toBe('');
  });
  it('offers Singapore food separately from field utilities while sharing the quick slot', () => {
    const food = ARMORY_CATALOG.filter(item => item.category === 'consumable' && item.supplyType === 'food');
    const utilities = ARMORY_CATALOG.filter(item => item.category === 'consumable' && item.supplyType !== 'food');
    expect(food.map(item => item.id)).toEqual(['food-kaya-toast', 'food-curry-puff', 'food-chicken-rice', 'food-field-ration']);
    expect(utilities.map(item => item.id)).toEqual(['kit-ammo', 'kit-dressing', 'kit-plates', 'kit-trauma']);
    const packed = purchase(veteran(), 'food-chicken-rice').profile;
    expect(resolveLoadout(packed).quickItem?.name).toBe('Chicken rice packet');
    expect(resolveLoadout(packed).quickItem?.effect?.health).toBe(60);
  });
  it('charges a vendor-specific price and readies the bought item without mutating failures', () => {
    const base = veteran(), bought = purchaseFromVendor(base, 'food-kaya-toast', 140);
    expect(bought.purchased).toBe(true);
    expect(bought.profile.credits).toBe(base.credits - 140);
    expect(bought.profile.consumables['food-kaya-toast']).toBe(1);
    expect(bought.profile.quickItem).toBe('food-kaya-toast');
    const poor = { ...base, credits: 139 }, refused = purchaseFromVendor(poor, 'food-kaya-toast', 140);
    expect(refused.purchased).toBe(false); expect(refused.profile).toBe(poor);
    expect(purchaseFromVendor(base, 'sar-issued', 1).purchased).toBe(false);
  });
});

describe('carried weight', () => {
  it('costs nothing when the loadout is unencumbered', () => {
    const light = resolveLoadout(createProfile());
    expect(light.mobility).toBe(1);
    expect(jumpScale(light.mobility)).toBe(1); expect(aimSpeedScale(light.mobility)).toBe(1);
  });
  it('takes more from vertical reach and aim-in as protection goes up', () => {
    const heavy = ['rig-lbs', 'plate-ceramic'].reduce((p, id) => equip(purchase(p, id).profile, id, 0), veteran());
    const loadout = resolveLoadout(heavy);
    expect(loadout.armor).toBe(75);
    expect(loadout.mobility).toBeLessThan(1);
    expect(jumpScale(loadout.mobility)).toBeLessThan(1);
    expect(aimSpeedScale(loadout.mobility)).toBeLessThan(1);
    // The premium inserts are lighter, so they cost less of both.
    const elite = ['rig-sentinel', 'plate-elite'].reduce((p, id) => equip(purchase(p, id).profile, id, 0), veteran());
    const premium = resolveLoadout(elite);
    expect(premium.armor).toBeGreaterThan(loadout.armor);
    expect(jumpScale(premium.mobility)).toBeGreaterThan(jumpScale(loadout.mobility));
  });
  it('never inverts a jump or an aim, whatever a malformed mobility says', () => {
    for (const mobility of [0, -3, 5, Number.NaN]) {
      expect(jumpScale(mobility)).toBeLessThanOrEqual(1);
      expect(Number.isFinite(jumpScale(mobility))).toBe(true);
      expect(Number.isFinite(aimSpeedScale(mobility))).toBe(true);
    }
  });
});

describe('fixed weapon configurations', () => {
  const retired = ['optic-reflex', 'optic-precision', 'mag-quick', 'mag-extended', 'mag-penetrator', 'mag-fragmenting', 'handling-stable', 'handling-angled', 'handling-match'];
  it('does not sell or equip any retired modular part, even if owned in memory', () => {
    const profile = { ...veteran(), owned: [...veteran().owned, ...retired] };
    for (const id of retired) {
      expect(itemById(id)).toBeUndefined();
      expect(purchase(profile, id).profile).toBe(profile);
      for (const family of [0, 1]) expect(equip(profile, id, family)).toBe(profile);
    }
  });
  it('discards old attachments without refunding or losing other progress', () => {
    const profile = equip(unlock('sar-marksman'), 'sar-marksman', 0);
    profile.owned.push(...retired, 'mag-extended');
    profile.guns[0].attachments = { optic: 'optic-reflex', magazine: 'mag-fragmenting', handling: 'handling-stable' };
    profile.guns[1].attachments = { optic: 'optic-precision', magazine: 'mag-extended' };
    const restored = restoreProfile(JSON.stringify(profile));
    expect(restored.credits).toBe(profile.credits); expect(restored.tokens).toBe(profile.tokens);
    expect(restored.xp).toBe(profile.xp); expect(restored.guns[0].variant).toBe('sar-marksman');
    expect(restored.owned).toEqual(profile.owned.filter(id => !retired.includes(id)));
    expect(restored.guns.map(gun => gun.attachments)).toEqual(FPS_WEAPONS.map(() => ({})));
    expect(restoreProfile(JSON.stringify(restored))).toEqual(restored);
  });
  it('ignores injected attachments in gameplay and previews for every variant', () => {
    for (const item of ARMORY_CATALOG.filter(item => item.category === 'weapon')) {
      const family = item.family!;
      const base = veteran();
      const clean = equip({ ...base, owned: [...base.owned, item.id] }, item.id, family);
      const expected = resolveLoadout(clean);
      const dirty = structuredClone(clean);
      dirty.owned.push(...retired);
      dirty.guns[family].attachments = { optic: 'optic-reflex', magazine: 'mag-fragmenting', handling: 'handling-match' };
      expect(resolveLoadout(dirty)).toEqual(expected);
      expect(previewLoadout(dirty, item, family)).toEqual(expected);
      expect(dirty.guns[family].attachments.magazine).toBe('mag-fragmenting');
      const issued = equip(dirty, DEFAULT_VARIANTS[family], family);
      expect(resolveLoadout(issued).weapons[family].traits).toEqual(FPS_WEAPONS[family].traits);
    }
  });
  it('keeps variant-exclusive optics and handling installed', () => {
    const owner = equip(unlock('sar-marksman'), 'sar-marksman', 0);
    expect(slotIsFitted('sar-marksman', 'optic')).toBe(true);
    const rifle = resolveLoadout(owner).weapons[0];
    expect(rifle.optic).toBe('precision'); expect(rifle.aimFov).toBe(40);
    expect(rifle.recoil).toBeCloseTo(.00816);
    expect(isEquipped(owner, itemById('sar-marksman')!, 0)).toBe(true);
  });
});
