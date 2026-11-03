import { useState } from 'react';
import { hasItemAccess, rentalTimeLeft, weaponTermPrice, WEAPON_TERMS, type WeaponTerm } from '../game/weapon-rentals';
import { EXTRA_SLOT_ID, SIDEARM_FAMILY, restoreCarrySlots, isMainWeapon } from '../game/armory-slots';
import { itemById } from '../game/armory-catalog';
import { FPS_WEAPONS } from '../game/fps-rules';
import type { ArmoryStore } from '../game/use-armory';

export default function ArmoryCarrySlots({ store }: { store: ArmoryStore }) {
  const [term, setTerm] = useState<WeaponTerm>('1h');
  const { profile } = store, carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const unlocked = hasItemAccess(profile, EXTRA_SLOT_ID), unlock = itemById(EXTRA_SLOT_ID)!;
  const price = weaponTermPrice(unlock, term);
  const name = (family: number) => (itemById(profile.guns[family].variant)?.name ?? FPS_WEAPONS[family].name) + (profile.rentals?.[profile.guns[family].variant] ? ` · ${rentalTimeLeft(profile.rentals[profile.guns[family].variant])}` : '');
  // Available platforms only, which keeps enemy issue (never owned outside an expedition) off the list.
  const options = (slot: 'main' | 'extra') => FPS_WEAPONS.map((weapon, family) => isMainWeapon(family) && hasItemAccess(profile, profile.guns[family].variant) &&
    <option key={weapon.id} value={family} disabled={family === (slot === 'main' ? carry.extra : carry.main)}>{name(family)}</option>);
  return <section className="armory-carry" aria-label="Carried weapon slots">
    <div className="armory-carry-heading"><strong>DEPLOYMENT LOADOUT</strong><span>One main · Optional extra main · One sidearm</span></div>
    <div className="armory-carry-slots">
      <label><span>1 · MAIN WEAPON</span><select aria-label="Main weapon slot" value={carry.main} onChange={event => store.selectCarrySlot('main', Number(event.target.value))}>{options('main')}</select></label>
      <div><span>2 · EXTRA MAIN {unlocked ? '' : '· LOCKED'}</span>{unlocked
        ? <select aria-label="Extra main weapon slot" value={carry.extra ?? ''} onChange={event => store.selectCarrySlot('extra', event.target.value === '' ? null : Number(event.target.value))}><option value="">Empty — travel lighter</option>{options('extra')}</select>
        : null}
        <select aria-label="Extra main rental duration" value={term} onChange={event => setTerm(event.target.value as WeaponTerm)}>{WEAPON_TERMS.map(option => <option key={option.id} value={option.id}>{option.label} · {weaponTermPrice(unlock, option.id)} TK</option>)}</select>
        <button data-store-outcome disabled={profile.tokens < price} onClick={() => store.buy(EXTRA_SLOT_ID, term)}>{unlocked ? 'Extend' : 'Rent'} extra main · {price} TK</button>
        <small>{unlocked ? `${rentalTimeLeft(profile.rentals[EXTRA_SLOT_ID])} · Carry a different main weapon, or leave this slot empty.` : 'Active-play rental. Rent weapons separately.'}</small></div>
      <div><span>{carry.extra === null ? 2 : 3} · SIDEARM</span><strong>{name(SIDEARM_FAMILY)}</strong><small>Choose its fixed variant in the P30 platform tab.</small></div>
    </div>
    <p>Only slotted weapons and their ammunition add weight. Similar guns share compatible spare magazines. Both main weapons use the same rig space. Reloading discards unused rounds. Equipping a different main platform replaces the main slot.</p>
  </section>;
}
