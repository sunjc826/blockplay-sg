import { EXTRA_SLOT_ID, SIDEARM_FAMILY, restoreCarrySlots, isMainWeapon } from '../game/armory-slots';
import { itemById } from '../game/armory-catalog';
import { FPS_WEAPONS } from '../game/fps-rules';
import type { ArmoryStore } from '../game/use-armory';

export default function ArmoryCarrySlots({ store }: { store: ArmoryStore }) {
  const { profile } = store, carry = restoreCarrySlots(profile.carry, profile.owned);
  const unlocked = profile.owned.includes(EXTRA_SLOT_ID), unlock = itemById(EXTRA_SLOT_ID)!;
  const name = (family: number) => itemById(profile.guns[family].variant)?.name ?? FPS_WEAPONS[family].name;
  const options = (slot: 'main' | 'extra') => FPS_WEAPONS.map((weapon, family) => isMainWeapon(family) &&
    <option key={weapon.id} value={family} disabled={family === (slot === 'main' ? carry.extra : carry.main)}>{name(family)}</option>);
  return <section className="armory-carry" aria-label="Carried weapon slots">
    <div className="armory-carry-heading"><strong>DEPLOYMENT LOADOUT</strong><span>One main · One sidearm · Optional extra main</span></div>
    <div className="armory-carry-slots">
      <label><span>1 · MAIN WEAPON</span><select aria-label="Main weapon slot" value={carry.main} onChange={event => store.selectCarrySlot('main', Number(event.target.value))}>{options('main')}</select></label>
      <div><span>2 · SIDEARM</span><strong>{name(SIDEARM_FAMILY)}</strong><small>Choose its fixed variant in the P30 platform tab.</small></div>
      <div><span>3 · EXTRA MAIN {unlocked ? '' : '· LOCKED'}</span>{unlocked
        ? <select aria-label="Extra main weapon slot" value={carry.extra ?? ''} onChange={event => store.selectCarrySlot('extra', event.target.value === '' ? null : Number(event.target.value))}><option value="">Empty — travel lighter</option>{options('extra')}</select>
        : <button disabled={profile.tokens < unlock.price} onClick={() => store.buy(EXTRA_SLOT_ID)}>Unlock permanently · {unlock.price} TK</button>}
        <small>{unlocked ? 'Carry a different main weapon, or leave this slot empty.' : 'One-time token purchase. Weapons are purchased separately.'}</small></div>
    </div>
    <p>Only slotted weapons and their ammunition add weight. Equipping a different main platform replaces the main slot; owning weapons does not mean carrying them.</p>
  </section>;
}
