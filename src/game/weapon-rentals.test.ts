import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, equip, expireLoadoutRentals, expireRentals, isEquipped, purchase, resolveLoadout, restoreProfile, selectCarryWeapon } from './armory-state';
import { DEFAULT_VARIANTS, FPS_WEAPONS } from './fps-rules';
import { canRentWeapon, hasItemAccess, RENTAL_DAY_MS, rentalTimeLeft, weaponTermPrice, type WeaponTerm } from './weapon-rentals';

const NOW = Date.UTC(2026, 10, 1);
const buyer = () => ({ ...createProfile(), xp: 100000, credits: 100000, tokens: 10000 });
const id = 'sar-vanguard';
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

describe('weapon rentals', () => {
  it('offers cheaper short terms for every sold weapon, with issued and enemy gear excluded', () => {
    for (const item of ARMORY_CATALOG.filter(canRentWeapon)) {
      expect(weaponTermPrice(item, '1d')).toBeLessThan(weaponTermPrice(item, '7d'));
      expect(weaponTermPrice(item, '7d')).toBeLessThan(weaponTermPrice(item, '30d'));
      expect(weaponTermPrice(item, '30d')).toBeLessThan(item.price);
      expect(weaponTermPrice(item, 'permanent')).toBe(item.price);
    }
    expect(canRentWeapon(itemById('sar-issued')!)).toBe(false);
    expect(canRentWeapon(itemById('kit-ammo')!)).toBe(false);
  });

  it('charges the chosen term once, grants access without ownership, and saves the equipped rental', () => {
    const base = buyer(), rented = purchase(base, id, '7d').profile;
    expect(rented.tokens).toBe(base.tokens - weaponTermPrice(itemById(id)!, '7d'));
    expect(rented.credits).toBe(base.credits);
    expect(rented.owned).not.toContain(id);
    expect(base.rentals).toEqual({});
    expect(rented.rentals[id]).toBe(NOW + 7 * RENTAL_DAY_MS);
    const worn = equip(rented, id, 0);
    expect(isEquipped(worn, itemById(id)!, 0)).toBe(true);
    expect(restoreProfile(JSON.stringify(worn))).toEqual(worn);
    expect(resolveLoadout(worn).weapons[0].rentalExpiresAt).toBe(rented.rentals[id]);
  });

  it('extends from the active expiry, starts expired rentals from now, and never auto-charges', () => {
    const rented = purchase(buyer(), id, '1d').profile;
    const renewed = purchase(rented, id, '7d', NOW + 1000).profile;
    expect(renewed.rentals[id]).toBe(NOW + 8 * RENTAL_DAY_MS);
    const later = NOW + 10 * RENTAL_DAY_MS;
    const expired = expireRentals(renewed, later);
    expect(expired.tokens).toBe(renewed.tokens);
    expect(purchase(expired, id, '1d', later).profile.rentals[id]).toBe(later + RENTAL_DAY_MS);
  });

  it('keeps permanent purchases and upgrades rentals at the full permanent price', () => {
    const rented = purchase(buyer(), id, '1d').profile;
    const permanent = purchase(rented, id).profile;
    expect(permanent.tokens).toBe(rented.tokens - itemById(id)!.price);
    expect(permanent.owned).toContain(id);
    expect(permanent.rentals[id]).toBeUndefined();
    expect(purchase(permanent, id, '1d').profile).toBe(permanent);
    const { rentals: _oldField, ...oldSave } = permanent;
    expect(restoreProfile(JSON.stringify(oldSave)).owned).toContain(id);
    expect(restoreProfile(JSON.stringify(oldSave)).rentals).toEqual({});
  });

  it('expires exactly at the deadline, resets equipped variants and retains skins, slots and wallet', () => {
    let worn = equip(purchase(buyer(), id, '1d').profile, id, 0);
    worn = equip(purchase(worn, 'skin-gold').profile, 'skin-gold', 0);
    const deadline = worn.rentals[id];
    expect(expireRentals(worn, deadline - 1)).toBe(worn);
    vi.mocked(Date.now).mockReturnValue(deadline);
    const expired = expireRentals(worn);
    expect(hasItemAccess(worn, id)).toBe(false);
    expect(isEquipped(worn, itemById(id)!, 0)).toBe(false);
    expect(equip(expired, id, 0)).toBe(expired);
    expect(expired.guns[0]).toMatchObject({ variant: DEFAULT_VARIANTS[0], skin: 'skin-gold' });
    expect(expired.carry).toEqual(worn.carry);
    expect(expired.tokens).toBe(worn.tokens);
    expect(expired.rentals).toEqual({});
    expect(resolveLoadout(worn).weapons[0].damage).toBe(FPS_WEAPONS[0].damage);
    expect(restoreProfile(JSON.stringify(worn)).guns[0].variant).toBe(DEFAULT_VARIANTS[0]);
  });

  it('supports rented main platforms in the carry selector and expires both extra and sidearm variants', () => {
    let p = purchase(buyer(), 'slot-extra').profile;
    for (const family of [1, 2]) {
      const item = ARMORY_CATALOG.find(i => i.family === family && canRentWeapon(i))!;
      p = equip(purchase(p, item.id, '1d').profile, item.id, family);
    }
    expect(selectCarryWeapon(p, 'extra', 0).carry.extra).toBe(0);
    const active = resolveLoadout(p), expired = expireLoadoutRentals(active, NOW + RENTAL_DAY_MS);
    expect(expired.weapons[1].equipment.variant).toBe(DEFAULT_VARIANTS[1]);
    expect(expired.weapons[2].equipment.variant).toBe(DEFAULT_VARIANTS[2]);
    expect(expired.carriedFamilies).toEqual(active.carriedFamilies);
    expect(expireLoadoutRentals(expired, NOW + 2 * RENTAL_DAY_MS)).toBe(expired);
  });

  it('preserves the rest of a running loadout and does not resurrect expired stats on reset', () => {
    const p = equip(purchase(buyer(), id, '1d').profile, id, 0);
    const active = resolveLoadout(p), expired = expireLoadoutRentals(active, NOW + RENTAL_DAY_MS);
    expect(expired).toMatchObject({ armor: active.armor, supplies: active.supplies, rigId: active.rigId, carriedFamilies: active.carriedFamilies });
    expect(expired.weapons[0].damage).toBe(FPS_WEAPONS[0].damage);
    expect(expired.weapons[0].rentalExpiresAt).toBeUndefined();
    expect(expired.weapons[2]).toBe(active.weapons[2]);
    expect(active.weapons[0].equipment.variant).toBe(id);
  });

  it('rejects locked, unaffordable, unsupported and invalid rental requests without a debit', () => {
    const recruit = createProfile(), poor = { ...buyer(), tokens: 0 };
    expect(purchase(recruit, id, '1d').profile).toBe(recruit);
    expect(purchase(poor, id, '1d').profile).toBe(poor);
    const base = buyer();
    for (const item of ARMORY_CATALOG.filter(item => !canRentWeapon(item))) expect(purchase(base, item.id, '1d').profile).toBe(base);
    expect(purchase(base, id, 'forever' as WeaponTerm).profile).toBe(base);
  });

  it('discards invalid save entries without converting rentals into ownership', () => {
    const base = buyer();
    const raw = { ...base, rentals: { [id]: NOW + RENTAL_DAY_MS, 'kit-ammo': NOW + RENTAL_DAY_MS, 'sar-issued': NOW + RENTAL_DAY_MS, bogus: NOW + RENTAL_DAY_MS, 'sar-marksman': NOW - 1, 'sar-patrol': 'tomorrow', 'ult-vanguard': null } };
    const restored = restoreProfile(JSON.stringify(raw));
    expect(restored.rentals).toEqual({ [id]: NOW + RENTAL_DAY_MS });
    expect(restored.owned).not.toContain(id);
    expect(restoreProfile(JSON.stringify({ ...base, rentals: { [id]: 1e20 } })).rentals).toEqual({});
  });

  it('shows remaining wall time with a clear expired boundary', () => {
    expect(rentalTimeLeft(NOW + RENTAL_DAY_MS)).toBe('1d 0h left');
    expect(rentalTimeLeft(NOW + 90 * 60 * 1000)).toBe('1h 30m left');
    expect(rentalTimeLeft(NOW + 1000)).toBe('1s left');
    expect(rentalTimeLeft(NOW)).toBe('Expired');
  });
});
