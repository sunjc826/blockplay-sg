import { describe, expect, it } from 'vitest';
import { ARMORY_CATALOG, consumableLimit, itemById } from './armory-catalog';
import { createProfile, isSupplyCarried, purchase, spendRentalTime, expireRentals } from './armory-state';
import { EXTRA_SLOT_ID } from './armory-slots';
import { xpForLevel } from './progression';
import { weaponTermPrice } from './weapon-rentals';
import { deploymentRentals, equipLoadoutItem, packedSupplyCount, purchaseLoadoutItem, slotItem, type LoadoutTarget } from './loadout-store';

const target = (slot: LoadoutTarget['slot'], family = 0): LoadoutTarget => ({ slot, family, vehicle: 'car' });
const funded = () => ({ ...createProfile(), xp: xpForLevel(50), credits: 10_000, tokens: 10_000 });

describe('loadout-first transactions', () => {
  it('rents and equips once for the real catalog price', () => {
    const before = funded(), item = itemById('sar-ranger')!;
    const result = purchaseLoadoutItem(before, item.id, '2h', target('main'));
    expect(result.profile.credits).toBe(before.credits - weaponTermPrice(item, '2h'));
    expect(result.profile.rentals[item.id]).toBe(2 * 3_600_000);
    expect(result.profile.guns[0].variant).toBe(item.id);
    expect(result.message).toContain('rented and equipped');
    expect(before.guns[0].variant).toBe('sar-issued');
  });
  it('can rent to the locker or extend without changing the equipped loadout', () => {
    const before = funded(), rented = purchaseLoadoutItem(before, 'sar-ranger', '1h');
    expect(rented.profile.guns).toBe(before.guns);
    expect(rented.message).toContain('locker');
    const extended = purchaseLoadoutItem(rented.profile, 'sar-ranger', '4h');
    expect(extended.profile.guns).toBe(before.guns);
    expect(extended.profile.rentals['sar-ranger']).toBe(5 * 3_600_000);
  });
  it('equips an available rental with no additional payment', () => {
    const profile = purchase(funded(), 'sar-ranger', '1h').profile;
    const equipped = equipLoadoutItem(profile, 'sar-ranger', target('main')).profile;
    expect(equipped.credits).toBe(profile.credits);
    expect(equipped.rentals).toBe(profile.rentals);
    expect(slotItem(equipped, target('main'))?.id).toBe('sar-ranger');
  });
  it('assigns a newly rented platform to extra without replacing the main weapon', () => {
    const before = purchase(funded(), EXTRA_SLOT_ID, '1h').profile;
    const item = ARMORY_CATALOG.find(i => i.category === 'weapon' && i.family === 1 && i.price > 0)!;
    const result = purchaseLoadoutItem(before, item.id, '1h', target('extra', 1));
    expect(result.profile.carry).toEqual({ main: 0, extra: 1 });
    expect(result.profile.guns[0]).toBe(before.guns[0]);
    expect(result.profile.guns[1].variant).toBe(item.id);
  });
  it('rejects the same platform in both mains without charging or changing variants', () => {
    const before = purchase(funded(), EXTRA_SLOT_ID, '1h').profile;
    const result = purchaseLoadoutItem(before, 'sar-ranger', '1h', target('extra'));
    expect(result.profile).toBe(before);
    expect(result.message).toContain('other main slot');
  });
  it('rejects an expired or unavailable extra slot before spending on the weapon', () => {
    const before = funded(), item = ARMORY_CATALOG.find(i => i.category === 'weapon' && i.family === 1 && i.price > 0)!;
    expect(purchaseLoadoutItem(before, item.id, '1h', target('extra', 1)).profile).toBe(before);
    const expired = { ...before, rentals: { [EXTRA_SLOT_ID]: 0 } };
    expect(purchaseLoadoutItem(expired, item.id, '1h', target('extra', 1)).profile).toBe(expired);
  });
  it('renting the extra slot does not rent or automatically slot another weapon', () => {
    const before = funded(), result = purchaseLoadoutItem(before, EXTRA_SLOT_ID, '1h');
    expect(result.profile.carry).toEqual(before.carry);
    expect(result.profile.guns).toBe(before.guns);
    expect(result.profile.tokens).toBe(before.tokens - weaponTermPrice(itemById(EXTRA_SLOT_ID)!, '1h'));
  });
  it('does not spend on locked, unaffordable or wrongly targeted gear', () => {
    const recruit = createProfile();
    expect(purchaseLoadoutItem(recruit, 'sar-ranger', '1h', target('main')).profile).toBe(recruit);
    const poor = { ...funded(), credits: 0 };
    expect(purchaseLoadoutItem(poor, 'sar-ranger', '1h', target('main')).profile).toBe(poor);
    const rich = funded();
    expect(purchaseLoadoutItem(rich, 'sar-ranger', '1h', target('sidearm', 2)).profile).toBe(rich);
  });
  it('buys a bounded quantity atomically and packs previously stowed stock', () => {
    const before = { ...funded(), consumables: { 'kit-bandage': 1 }, stowedSupplies: ['kit-bandage'] };
    const result = purchaseLoadoutItem(before, 'kit-bandage', undefined, target('supplies'), 2);
    expect(result.profile.consumables['kit-bandage']).toBe(3);
    expect(result.profile.credits).toBe(before.credits - itemById('kit-bandage')!.price * 2);
    expect(isSupplyCarried(result.profile, 'kit-bandage')).toBe(true);
    expect(packedSupplyCount(result.profile)).toBe(3);
    expect(before.stowedSupplies).toEqual(['kit-bandage']);
  });
  it('rolls back a multi-supply purchase if the wallet cannot cover the whole quantity', () => {
    const before = { ...funded(), credits: itemById('kit-bandage')!.price };
    expect(purchaseLoadoutItem(before, 'kit-bandage', undefined, target('supplies'), 2).profile).toBe(before);
  });
  it('rejects stock overflow and invalid quantities without spending', () => {
    const before = funded(), limit = consumableLimit(itemById('kit-bandage'));
    for (const quantity of [0, -1, 1.5, Infinity, limit + 1]) expect(purchaseLoadoutItem(before, 'kit-bandage', undefined, target('supplies'), quantity).profile).toBe(before);
    expect(purchaseLoadoutItem(before, 'sar-ranger', '1h', target('main'), 2).profile).toBe(before);
  });
  it('only flags rentals that are actually deploying, including used extra slots and skins', () => {
    let profile = purchase(funded(), 'sar-ranger', '1h').profile;
    profile = purchase(profile, EXTRA_SLOT_ID, '1h').profile;
    expect(deploymentRentals(profile)).toEqual([]);
    profile = equipLoadoutItem(profile, 'sar-ranger', target('main')).profile;
    expect(deploymentRentals(profile).map(i => i.id)).toEqual(['sar-ranger']);
    profile = equipLoadoutItem(profile, profile.guns[1].variant, target('extra', 1)).profile;
    expect(deploymentRentals(profile).map(i => i.id)).toContain(EXTRA_SLOT_ID);
  });
  it('keeps issued replacements ready after the existing expiry rules run', () => {
    const rented = purchaseLoadoutItem(funded(), 'sar-ranger', '1h', target('main')).profile;
    const expired = expireRentals(spendRentalTime(rented, 3_600_000));
    expect(slotItem(expired, target('main'))?.id).toBe('sar-issued');
    expect(deploymentRentals(expired)).toEqual([]);
  });
});
