import { afterEach, expect, it, vi } from 'vitest';
import { ARMORY_CATALOG } from './armory-catalog';
import { createProfile, equip, expireLoadoutRentals, expireRentals, purchase, resolveLoadout, restoreFieldProfile, restoreProfile, spendRentalTime } from './armory-state';
import { canRentWeapon, hasItemAccess, RENTAL_DAY_MS, rentalTimeLeft, WEAPON_TERMS, weaponTermPrice, type WeaponTerm } from './weapon-rentals';
const buyer = () => ({ ...createProfile(), xp: 100000, credits: 100000, tokens: 10000 });
const id = 'sar-vanguard';
afterEach(() => vi.restoreAllMocks());

it('only offers bounded rental terms for paid weapons', () => {
  expect(WEAPON_TERMS.map(term => term.id)).toEqual(['1d', '7d', '30d']);
  for (const item of ARMORY_CATALOG.filter(canRentWeapon)) {
    expect(weaponTermPrice(item, '1d')).toBeLessThan(weaponTermPrice(item, '7d'));
    expect(weaponTermPrice(item, '7d')).toBeLessThan(weaponTermPrice(item, '30d'));
    expect(weaponTermPrice(item, '30d')).toBeLessThan(item.price);
  }
  const base = buyer();
  expect(purchase(base, id, 'permanent' as WeaponTerm).profile).toBe(base);
  expect(purchase(base, 'kit-ammo', '1d').profile).toBe(base);
});
it('defaults to one day of play and charges once without granting permanent ownership', () => {
  const base = buyer(), next = purchase(base, id).profile;
  expect(next.tokens).toBe(base.tokens - 24); expect(next.rentals[id]).toBe(RENTAL_DAY_MS);
  expect(next.owned).not.toContain(id); expect(base.rentals).toEqual({});
  expect(restoreProfile(JSON.stringify(equip(next, id, 0)))).toEqual(equip(next, id, 0));
});
it('adds purchased play time to the balance, including after partial use', () => {
  const rented = purchase(buyer(), id, '7d').profile;
  const played = spendRentalTime(rented, 12345), extended = purchase(played, id, '1d').profile;
  expect(extended.rentals[id]).toBe(8 * RENTAL_DAY_MS - 12345);
  expect(extended.tokens).toBe(rented.tokens - 24);
});
it('wall time, pause, offline reloads and zero or invalid deltas never spend a lease', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100000), rented = purchase(buyer(), id).profile;
  clock.mockReturnValue(9999999999999);
  expect(restoreProfile(JSON.stringify(rented)).rentals).toEqual(rented.rentals);
  for (const delta of [0, -1, NaN, Infinity]) expect(spendRentalTime(rented, delta)).toBe(rented);
  expect(expireRentals(rented)).toBe(rented);
});
it('expires exactly on exhausting play time and resets an equipped rental without charging', () => {
  const rented = equip(purchase(buyer(), id).profile, id, 0);
  const last = spendRentalTime(rented, RENTAL_DAY_MS - 1);
  expect(hasItemAccess(last, id)).toBe(true);
  const expired = spendRentalTime(last, 1);
  expect(hasItemAccess(expired, id)).toBe(false); expect(expired.guns[0].variant).toBe('sar-issued');
  expect(expired.rentals[id]).toBeUndefined(); expect(expired.tokens).toBe(rented.tokens);
});
it('clears old permanent weapon IDs and their equipped selection while preserving other purchases', () => {
  const base = buyer(), saved = { ...base, owned: [...base.owned, id, 'skin-gold', 'plate-ceramic', 'slot-extra'], guns: base.guns.map((gun, family) => family === 0 ? { ...gun, variant: id, skin: 'skin-gold' } : gun), plate: 'plate-ceramic', carry: { main: 0, extra: 1 } };
  const restored = restoreProfile(JSON.stringify(saved));
  expect(restored.owned).not.toContain(id); expect(restored.guns[0]).toMatchObject({ variant: 'sar-issued', skin: 'skin-gold' });
  expect(restored).toMatchObject({ credits: saved.credits, tokens: saved.tokens, xp: saved.xp, plate: saved.plate, carry: saved.carry });
  for (const nonWeapon of ['skin-gold', 'plate-ceramic', 'slot-extra']) expect(restored.owned).toContain(nonWeapon);
});
it('migrates existing absolute expiry dates once and preserves any valid active lease', () => {
  const now = 1000000, { rentalClock: _clock, ...legacy } = buyer();
  const old = { ...legacy, owned: [...legacy.owned, id], rentals: { [id]: now + 5000, 'sar-ranger': now - 1 } };
  const migrated = restoreProfile(JSON.stringify(old), now);
  expect(migrated.rentalClock).toBe('playtime'); expect(migrated.rentals).toEqual({ [id]: 5000 });
  expect(migrated.owned).not.toContain(id);
  expect(restoreProfile(JSON.stringify(migrated), now + 999999999).rentals[id]).toBe(5000);
});
it('trusted field pickups stay usable but cannot create permanent saved weapons', () => {
  const field = buyer(); field.owned.push(id); field.guns[0].variant = id;
  expect(restoreFieldProfile(field).guns[0].variant).toBe(id);
  expect(restoreProfile(JSON.stringify(field)).guns[0].variant).toBe('sar-issued');
});
it('rejects malformed balances and non-weapon rentals', () => {
  const restored = restoreProfile(JSON.stringify({ ...buyer(), rentals: { [id]: 5000, 'kit-ammo': 2000, 'sar-ranger': -5, 'sar-marksman': 'tomorrow', unknown: 1000 } }));
  expect(restored.rentals).toEqual({ [id]: 5000 });
});
it('resolves remaining play time and replaces exhausted engine weapons', () => {
  const profile = equip(purchase(buyer(), id).profile, id, 0), equipment = resolveLoadout(profile);
  expect(equipment.weapons[0].rentalRemainingMs).toBe(RENTAL_DAY_MS);
  equipment.weapons[0].rentalRemainingMs = 0;
  const expired = expireLoadoutRentals(equipment);
  expect(expired.weapons[0].equipment.variant).toBe('sar-issued'); expect(expired.weapons[2]).toBe(equipment.weapons[2]);
  expect(rentalTimeLeft(1000)).toBe('1s left'); expect(rentalTimeLeft(RENTAL_DAY_MS)).toBe('1d 0h left'); expect(rentalTimeLeft(0)).toBe('Expired');
});
