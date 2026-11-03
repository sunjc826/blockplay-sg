import { expect, it } from 'vitest';
import { ARMORY_CATALOG, isEnemyIssue, itemById } from './armory-catalog';
import { createProfile, discardRental, equip, expireLoadoutRentals, purchase, resolveLoadout, restoreFieldProfile, restoreProfile, selectCarryWeapon, spendRentalTime, tickLoadoutRentals } from './armory-state';
import { canRentEquipment, hasItemAccess, RENTAL_HOUR_MS, WEAPON_TERMS, weaponTermPrice } from './weapon-rentals';
import { respawnEquipment } from './respawn-equipment';
import { createArena } from './arena-rules';
import { applyRespawnLoadout, selectedRespawnLoadout } from './respawn-loadout';
const buyer = () => ({ ...createProfile(), xp: 1000000, credits: 100000, tokens: 10000 });
const gearIds = ['skin-gold', 'rig-lbs', 'plate-ceramic', 'nvg-gen1', 'paint-jungle', 'slot-extra'];

it('rents every paid non-consumable category with bounded terms, while supplies and issue retain their rules', () => {
  for (const item of ARMORY_CATALOG) {
    const rentable = item.price > 0 && item.category !== 'consumable' && !isEnemyIssue(item);
    expect(canRentEquipment(item), item.id).toBe(rentable);
    if (!rentable) continue;
    for (const term of WEAPON_TERMS) {
      const p = buyer(), next = purchase(p, item.id, term.id).profile;
      expect(next.rentals[item.id], item.id).toBe(term.hours * RENTAL_HOUR_MS);
      expect(next[item.currency]).toBe(p[item.currency] - weaponTermPrice(item, term.id));
      expect(next.owned).not.toContain(item.id);
      expect(restoreProfile(JSON.stringify(next))).toEqual(next);
    }
  }
  const p = buyer(), supply = purchase(p, 'kit-bandage').profile;
  expect(supply.consumables['kit-bandage']).toBe(1); expect(supply.credits).toBe(p.credits - 150);
  expect(supply.rentals).toEqual({}); expect(purchase(p, 'kit-bandage', '2h').profile).toBe(p);
  expect(hasItemAccess(p, 'rig-ilbv')).toBe(true);
});

it('migrates former permanent gear once, preserves longer leases, and keeps its selections and wallet', () => {
  const p = buyer();
  p.owned.push(...gearIds); p.rig = 'rig-lbs'; p.plate = 'plate-ceramic'; p.vision = 'nvg-gen1';
  p.guns[0].skin = 'skin-gold'; p.vehicleSkins.car = 'paint-jungle'; p.carry.extra = 1;
  p.rentals['skin-gold'] = 3 * RENTAL_HOUR_MS;
  const next = restoreProfile(JSON.stringify(p));
  for (const id of gearIds) { expect(next.owned).not.toContain(id); expect(next.rentals[id]).toBe(id === 'skin-gold' ? 3 * RENTAL_HOUR_MS : RENTAL_HOUR_MS); }
  expect(next).toMatchObject({ credits: p.credits, tokens: p.tokens, xp: p.xp, rig: p.rig, plate: p.plate, vision: p.vision, carry: p.carry, vehicleSkins: p.vehicleSkins });
  const played = spendRentalTime(next, 1000);
  expect(restoreProfile(JSON.stringify(played))).toEqual(played);
});

it('discards or expires worn gear, cosmetics and extra slots with no refund or collateral changes', () => {
  let p = buyer();
  for (const id of gearIds) { expect(itemById(id), id).toBeDefined(); p = equip(purchase(p, id).profile, id, 0); }
  p = equip(p, 'paint-jungle', 0, 'helicopter'); p = selectCarryWeapon(p, 'extra', 1);
  p = purchase(p, 'sar-ranger', '4h').profile;
  for (const id of gearIds) {
    const discarded = discardRental(p, id);
    expect(discarded.rentals[id]).toBeUndefined(); expect(discarded.tokens).toBe(p.tokens); expect(discarded.credits).toBe(p.credits);
    expect(discarded.rentals['sar-ranger']).toBe(p.rentals['sar-ranger']);
  }
  const next = spendRentalTime(p, RENTAL_HOUR_MS);
  expect(next).toMatchObject({ rig: 'rig-ilbv', plate: 'plate-none', vision: 'vision-none', carry: { main: 0, extra: null }, vehicleSkins: { car: 'paint-issued', helicopter: 'paint-issued' } });
  expect(next.guns[0].skin).toBe('skin-issued'); expect(next.rentals['sar-ranger']).toBe(3 * RENTAL_HOUR_MS);
});

it('retains the current life after time runs out, then applies all fallbacks at its boundary', () => {
  let p = buyer();
  for (const id of [...gearIds, 'sar-ranger']) p = equip(purchase(p, id).profile, id, 0);
  p = selectCarryWeapon(p, 'extra', 1);
  const liveProfile = spendRentalTime(p, RENTAL_HOUR_MS, { deferRentalExpiry: true });
  const gear = tickLoadoutRentals(resolveLoadout(p), RENTAL_HOUR_MS);
  expect(gear.plateId).toBe('plate-ceramic'); expect(gear.armor).toBe(75); expect(gear.carriedFamilies).toEqual([0, 1, 2]);
  const restoredField = restoreFieldProfile(liveProfile, { deferRentalExpiry: true });
  const duringLife = resolveLoadout(restoredField, { deferRentalExpiry: true });
  expect(duringLife.plateId).toBe('plate-ceramic'); expect(duringLife.vision?.id).toBe('nvg-gen1');
  expect(duringLife.weapons[0].equipment).toMatchObject({ variant: 'sar-ranger', skin: 'skin-gold' });
  expect(duringLife.carriedFamilies).toEqual([0, 1, 2]);
  const expired = expireLoadoutRentals(gear), issued = resolveLoadout(createProfile());
  expect(expired).toMatchObject({ rigId: issued.rigId, plateId: issued.plateId, armor: 0, armorWeightKg: issued.armorWeightKg, mobility: issued.mobility, carriedFamilies: [0, 2], equipmentRentals: {} });
  expect(expired.vision).toBeUndefined(); expect(expired.vehicleSkins).toEqual(issued.vehicleSkins);
  expect(expired.weapons[0].equipment).toMatchObject({ variant: 'sar-issued', skin: 'skin-issued' });
  expect(expired.weapons[0].rigSlots).toBe(6); expect(expired.supplies).toEqual(gear.supplies);
  expect(expireLoadoutRentals(expired)).toBe(expired);
  expect(restoreProfile(JSON.stringify(liveProfile)).plate).toBe('plate-none');
  const respawn = respawnEquipment(liveProfile, spendRentalTime(p, RENTAL_HOUR_MS));
  expect(respawn.vehicleSkins).toEqual(issued.vehicleSkins);
  expect(respawn.guns[0].skin).toBe('skin-issued');
});

it('keeps trusted field armor during the life without making a permanent saved unlock', () => {
  const p = buyer(); p.owned.push('plate-ceramic'); p.plate = 'plate-ceramic';
  const field = restoreFieldProfile(p);
  expect(field.plate).toBe('plate-ceramic'); expect(field.rentals['plate-ceramic']).toBeUndefined();
  expect(restoreProfile(JSON.stringify(field)).owned).not.toContain('plate-ceramic');
});

it('rejects an exhausted extra slot for the next life and expires authoritative benefits on respawn', () => {
  let p = equip(purchase(buyer(), 'plate-ceramic').profile, 'plate-ceramic', 0);
  p = selectCarryWeapon(purchase(p, 'slot-extra').profile, 'extra', 1);
  const selection = selectedRespawnLoadout(p), kit = resolveLoadout(p), arena = createArena([], 0);
  arena.addPlayer('p', 'Player', kit.armor, kit.absorption, kit.weapons, undefined, false, kit.carriedFamilies, kit.insert);
  arena.setPlayerEquipmentRentals('p', { 'plate-ceramic': 100, 'slot-extra': 100 });
  const self = () => arena.snapshot().actors.find(a => a.id === 'p')!;
  arena.setInput('p', { ...self(), weapon: 1, playing: false }); arena.step(.2);
  expect(self().armor).toBe(75); expect(self().weapon).toBe(1);
  arena.setInput('p', { ...self(), playing: true }); arena.step(.2);
  expect(self().armor).toBe(75); expect(self().weapon).toBe(1);
  expect(applyRespawnLoadout(spendRentalTime(p, RENTAL_HOUR_MS), selection)).toBeNull();
  arena.setPlayerVitals('p', { health: 0 }); for (let i = 0; i < 40; i++) arena.step(.1);
  expect(self()).toMatchObject({ alive: true, armor: 0, weapon: 0 });
  arena.setInput('p', { ...self(), weapon: 1, playing: true }); expect(self().weapon).toBe(0);
});
