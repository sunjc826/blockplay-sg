import DiscardRental from './DiscardRental';
import { useState, type ReactNode } from 'react';
import { Backpack, Check, Clock3, Package } from 'lucide-react';
import { ARMORY_CATALOG, isShopFamily } from '../game/armory-catalog';
import { isEquipped, isSupplyCarried } from '../game/armory-state';
import { hasItemAccess, rentalTimeLeft } from '../game/weapon-rentals';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import { FPS_WEAPONS } from '../game/fps-rules';
import type { ArmoryStore } from '../game/use-armory';
import type { MotorVehicleKind } from '../game/vehicle-rules';
import ArmoryCarrySlots from './ArmoryCarrySlots';
import './armory-inventory.css';

export default function ArmoryInventory({ store, nav }: { store: ArmoryStore; nav: ReactNode }) {
  const [tab, setTab] = useState<'weapon' | 'gear' | 'supply'>('weapon'), [family, setFamily] = useState(0), [vehicle, setVehicle] = useState<MotorVehicleKind>('car');
  const { profile } = store;
  const available = ARMORY_CATALOG.filter(item => item.category === 'consumable' ? (profile.consumables[item.id] ?? 0) > 0 : hasItemAccess(profile, item.id));
  const items = available.filter(item => tab === 'weapon' ? item.category === 'weapon' : tab === 'supply' ? item.category === 'consumable' : item.category !== 'weapon' && item.category !== 'consumable');
  const rented = Object.keys(profile.rentals).length;
  return <section className="armory inventory" aria-label="Inventory">
    <header className="inventory-header">{nav}<div><Backpack size={18} /><span><b>{available.length} items in your locker</b><small>{rented} active {rented === 1 ? 'rental' : 'rentals'} · {profile.credits.toLocaleString()} CR · {profile.tokens.toLocaleString()} TK</small></span></div></header>
    <div className="inventory-clock"><Clock3 size={17} /><div><strong>Rental clock paused</strong><span>Only active gameplay spends rental time. Menus, pause and offline time are free. Rent for 1, 2 or 4 hours of active play.</span></div></div>
    <ArmoryCarrySlots store={store} />
    <div className="inventory-navigation" role="tablist" aria-label="Inventory categories">{([['weapon', 'Weapons'], ['gear', 'Gear'], ['supply', 'Supplies']] as const).map(([id, title]) => <button type="button" key={id} role="tab" aria-selected={tab === id} id={`inventory-tab-${id}`} aria-controls="inventory-items" onClick={() => setTab(id)}>{title}<small>{available.filter(item => id === 'weapon' ? item.category === 'weapon' : id === 'supply' ? item.category === 'consumable' : item.category !== 'weapon' && item.category !== 'consumable').length}</small></button>)}</div>
    {tab === 'gear' && <div className="inventory-destinations"><label>Equip weapon finishes on<select value={family} onChange={event => setFamily(Number(event.target.value))}>{FPS_WEAPONS.map((weapon, index) => isShopFamily(index) && <option key={weapon.id} value={index}>{weapon.name}</option>)}</select></label><label>Equip vehicle finishes on<select value={vehicle} onChange={event => setVehicle(event.target.value as MotorVehicleKind)}><option value="car">Utility 01</option><option value="helicopter">Falcon 01</option></select></label></div>}
    {tab === 'supply' && <p className="inventory-supply-hint">Bring only what you need. Supplies left in your locker stay owned and take no field weight or wheel space.</p>}
    <div className="inventory-grid" id="inventory-items" role="tabpanel" aria-labelledby={`inventory-tab-${tab}`}>
      {items.map(item => {
        const slot = item.category === 'weapon' ? item.family! : family, equipped = isEquipped(profile, item, slot, vehicle), remaining = profile.rentals[item.id];
        const supply = item.category === 'consumable', slotUnlock = item.category === 'loadout';
        return <article className={`inventory-item tier-${item.tier.toLowerCase()}`} key={item.id} data-inventory-item={item.id}>
          <div className="inventory-item-status"><span>{item.category === 'weapon' ? FPS_WEAPONS[slot].name : item.category === 'consumable' ? 'SUPPLY' : 'EQUIPMENT'}</span><small>{supply ? `×${profile.consumables[item.id]} held` : remaining ? 'RENTED' : item.category === 'weapon' ? 'ISSUED' : 'OWNED'}</small></div>
          {slotUnlock ? <div className="inventory-slot-icon"><Backpack size={55} /></div> : <img src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(item, slot, vehicle)}`} alt="" width={480} height={240} loading="lazy" />}
          <h2>{item.name}</h2><p>{item.flavorText || item.description}</p>
          <div className={`inventory-time ${remaining ? 'rented' : ''}`}><Clock3 size={15} /><strong>{remaining ? rentalTimeLeft(remaining) : supply ? 'Spent when used' : item.category === 'weapon' ? 'Always available' : 'Permanent equipment'}</strong>{remaining && <small>play time remaining</small>}</div>
          {supply ? <button type="button" aria-pressed={isSupplyCarried(profile, item.id)} onClick={() => store.bringSupply(item.id, !isSupplyCarried(profile, item.id))}>{isSupplyCarried(profile, item.id) ? <><Check size={15} /> Bringing along · Unequip</> : 'In locker · Bring along'}</button> : <button type="button" disabled={equipped || slotUnlock} onClick={() => store.equipItem(item.id, slot, vehicle)}>{equipped ? <><Check size={15} /> Equipped</> : slotUnlock ? 'Extra main slot unlocked' : 'Equip'}</button>}
          {remaining > 0 && <DiscardRental name={item.name} remainingMs={remaining} onDiscard={() => store.discardWeaponRental(item.id)} />}
        </article>;
      })}
      {!items.length && <div className="inventory-empty"><Package size={36} /><h2>{tab === 'supply' ? 'No supplies held' : 'Nothing in this section yet'}</h2><p>Find supplies in the field or visit the Store to stock your locker.</p></div>}
    </div>
    <footer className="inventory-footer" role="status">{store.saveError ? 'Browser storage is unavailable. Inventory lasts for this session only.' : store.message || 'Choose equipment here. Rent weapons and buy supplies in the Store.'}</footer>
  </section>;
}
