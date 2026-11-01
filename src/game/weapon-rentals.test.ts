import { afterEach, expect, it, vi } from 'vitest';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { discardRental, createProfile, equip, expireLoadoutRentals, expireRentals, purchase, resolveLoadout, restoreFieldProfile, restoreProfile, spendRentalTime } from './armory-state';
import { canRentWeapon, hasItemAccess, RENTAL_HOUR_MS, rentalTimeLeft, WEAPON_TERMS, weaponTermPrice, weaponTermSavings, type WeaponTerm } from './weapon-rentals';
const buyer = () => ({ ...createProfile(), xp: 100000, credits: 100000, tokens: 10000 });
const id = 'sar-vanguard';
afterEach(() => vi.restoreAllMocks());

it('only offers bounded rental terms for paid weapons', () => {
  expect(WEAPON_TERMS.map(term => term.id)).toEqual(['1h', '2h', '4h']);
  for (const item of ARMORY_CATALOG.filter(canRentWeapon)) {
    expect(weaponTermPrice(item, '1h')).toBeLessThan(weaponTermPrice(item, '2h'));
    expect(weaponTermPrice(item, '2h')).toBeLessThan(weaponTermPrice(item, '4h'));
    expect(weaponTermPrice(item, '4h')).toBeLessThan(item.price);
  }
  const base = buyer();
  expect(purchase(base, id, 'permanent' as WeaponTerm).profile).toBe(base);
  expect(purchase(base, 'kit-ammo', '1h').profile).toBe(base);
});
it('defaults to one hour of play and charges once without granting permanent ownership', () => {
  const base = buyer(), next = purchase(base, id).profile;
  expect(next.tokens).toBe(base.tokens - 24); expect(next.rentals[id]).toBe(RENTAL_HOUR_MS);
  expect(next.owned).not.toContain(id); expect(base.rentals).toEqual({});
  expect(restoreProfile(JSON.stringify(equip(next, id, 0)))).toEqual(equip(next, id, 0));
});
it('adds purchased play time to the balance, including after partial use', () => {
  const rented = purchase(buyer(), id, '2h').profile;
  const played = spendRentalTime(rented, 12345), extended = purchase(played, id, '1h').profile;
  expect(extended.rentals[id]).toBe(3 * RENTAL_HOUR_MS - 12345);
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
  const last = spendRentalTime(rented, RENTAL_HOUR_MS - 1);
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
  expect(equipment.weapons[0].rentalRemainingMs).toBe(RENTAL_HOUR_MS);
  equipment.weapons[0].rentalRemainingMs = 0;
  const expired = expireLoadoutRentals(equipment);
  expect(expired.weapons[0].equipment.variant).toBe('sar-issued'); expect(expired.weapons[2]).toBe(equipment.weapons[2]);
  expect(rentalTimeLeft(1000)).toBe('1s left'); expect(rentalTimeLeft(RENTAL_HOUR_MS)).toBe('1h 0m left'); expect(rentalTimeLeft(0)).toBe('Expired');
});

it('prices bulk hours below repeated single-hour purchases and reports the exact savings', () => {
  for (const item of ARMORY_CATALOG.filter(canRentWeapon)) {
    const single = weaponTermPrice(item, '1h'), two = weaponTermPrice(item, '2h'), four = weaponTermPrice(item, '4h');
    expect(two).toBeLessThan(2 * single); expect(four).toBeLessThan(4 * single);
    expect(four / 4).toBeLessThan(two / 2);
    expect(weaponTermSavings(item, '2h')).toBe(2 * single - two);
    expect(weaponTermSavings(item, '4h')).toBe(4 * single - four);
  }
  expect(WEAPON_TERMS.map(term => weaponTermPrice(itemById('sar-ranger')!, term.id))).toEqual([90, 162, 288]);
  expect(WEAPON_TERMS.map(term => weaponTermPrice(itemById(id)!, term.id))).toEqual([24, 44, 77]);
  const base = buyer(); expect(purchase(base, id, '1d' as WeaponTerm).profile).toBe(base);
});
it('preserves longer existing balances and permits extensions beyond four hours', () => {
  const long = { ...buyer(), rentals: { [id]: 72 * RENTAL_HOUR_MS } };
  expect(restoreProfile(JSON.stringify(long)).rentals[id]).toBe(long.rentals[id]);
  const extended = purchase(purchase(buyer(), id, '4h').profile, id, '2h').profile;
  expect(extended.rentals[id]).toBe(6 * RENTAL_HOUR_MS);
  expect(restoreProfile(JSON.stringify(extended)).rentals[id]).toBe(6 * RENTAL_HOUR_MS);
});
it('discards an equipped rental without refunding or changing other inventory and carry slots', () => {
  let p = purchase(purchase(buyer(), 'skin-gold').profile, 'slot-extra').profile;
  p = equip(purchase(p, id).profile, id, 0); p = equip(p, 'skin-gold', 0);
  p = purchase(p, 'sar-ranger', '2h').profile;
  const next = discardRental(p, id);
  expect(next.rentals[id]).toBeUndefined(); expect(next.rentals['sar-ranger']).toBe(p.rentals['sar-ranger']);
  expect(next.guns[0]).toMatchObject({ variant: 'sar-issued', skin: 'skin-gold' });
  expect(next).toMatchObject({ tokens: p.tokens, credits: p.credits, xp: p.xp, carry: p.carry, consumables: p.consumables, owned: p.owned });
  expect(p.guns[0].variant).toBe(id); expect(p.rentals[id]).toBe(RENTAL_HOUR_MS);
  expect(restoreProfile(JSON.stringify(next))).toEqual(next);
  expect(discardRental(next, id)).toBe(next);
});
it('cannot discard issued weapons, ordinary owned equipment or missing rentals', () => {
  const p = buyer();
  for (const target of ['sar-issued', 'skin-gold', 'kit-ammo', 'missing', id]) expect(discardRental(p, target)).toBe(p);
});
