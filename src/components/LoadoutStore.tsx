import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Backpack, Check, ChevronRight, Coins, Crosshair, Eye, Gem, Layers2, Package, Palette, Shield, ShoppingBag } from 'lucide-react';
import { ARMORY_CATALOG, byUnlock, consumableLimit, isShopFamily, itemById, type ShopItem, type SupplyType } from '../game/armory-catalog';
import { fittedVariantSpec, isSupplyCarried, previewLoadout, resolveLoadout, type EquippedWeapon } from '../game/armory-state';
import { EXTRA_SLOT_ID, SIDEARM_FAMILY, isMainWeapon, restoreCarrySlots } from '../game/armory-slots';
import { deploymentRentals, itemFitsSlot, LOADOUT_SLOTS, loadoutEquipError, packedSupplyCount, slotItem, slotLabel, weaponSlot, type LoadoutSlot, type LoadoutTarget } from '../game/loadout-store';
import { canRentEquipment, hasItemAccess, rentalTimeLeft, WEAPON_TERMS, weaponTermPrice, weaponTermSavings, type WeaponTerm } from '../game/weapon-rentals';
import { FPS_WEAPONS } from '../game/fps-rules';
import { equipmentMovement } from '../game/fps-encumbrance';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import { bipodDescription } from '../game/weapon-support';
import { FixedBuildDetails, SupplyDetails, VehicleFinishDetails, VisionDeviceDetails } from './EquipmentDossier';
import { levelSkip, progression, skipCostFrom, xpForLevel } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import RankBadge from './RankBadge';
import { MATCH_MODES } from '../game/match-menu';
import type { ArmoryStore } from '../game/use-armory';
import type { MotorVehicleKind } from '../game/vehicle-rules';
import type { Route } from '../lib/routes';
import { tabNavigation } from '../lib/tab-navigation';
import LoadoutComparison from './LoadoutComparison';
import { useScreenState } from '../lib/screen-state';
import { prepareStoreAudio, stopStoreAudio, stopStoreHover, storeSoundEvents, storeWithAudio } from '../lib/store-audio';
import ArmoryShop from './ArmoryShop';
import ArmoryPreview from './ArmoryPreview';
import DiscardRental from './DiscardRental';
import FalloffCurve from './FalloffCurve';
import SprayPattern from './SprayPattern';
import './loadout-store.css';

type View = 'home' | 'catalog' | 'browse' | 'detail' | 'rental' | 'extra' | 'review' | 'match';
type Selection = LoadoutTarget & { fromCatalog?: boolean; view: View; item: string; supplyType: SupplyType | 'all' };
type Tour = { onComplete: () => void; onExit: () => void };
const icons = { main: Crosshair, extra: Layers2, sidearm: Crosshair, rig: Backpack, plate: Shield, vision: Eye, supplies: Package, skin: Palette, vehicleSkin: Palette };
const supplyTypes = [['all', 'All supplies'], ['medical', 'Recovery'], ['field-utility', 'Field utilities'], ['grenade', 'Grenades'], ['food', 'Food']] as const;
const initialSelection = (family: number): Selection => ({ view: 'home', slot: 'main', family, vehicle: 'car', item: '', supplyType: 'all' });
const currencyName = (item: ShopItem) => item.currency === 'tokens' ? 'tokens' : 'credits';
const priceLabel = (item: ShopItem, amount: number) => `${amount.toLocaleString()} ${currencyName(item)}`;

/** The slot is the destination. Browsing and previews never change the saved loadout. */
export default function LoadoutStore({ store: sourceStore, nav, onPlay, tutorial }: { store: ArmoryStore; nav: ReactNode; onPlay: (route: Route) => void; tutorial?: Tour }) {
  const store = storeWithAudio(sourceStore), { profile } = store;
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const [ui, setUi] = useScreenState<Selection>('loadout-store.selection', initialSelection(carry.main));
  const [term, setTerm] = useState<WeaponTerm>('1h'), [equipAfter, setEquipAfter] = useState(true), [renew, setRenew] = useState(false);
  const [quantity, setQuantity] = useState(1), [tourStep, setTourStep] = useState(0);
  const [destination, setDestination] = useState<Route>('team-deathmatch');
  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), initialFocus = useRef(true), pending = useRef(false);
  const level = progression(profile.xp), skip = levelSkip(profile.xp), loadout = resolveLoadout(profile);
  const item = itemById(ui.item), current = slotItem(profile, ui), packed = packedSupplyCount(profile);
  const available = item && (item.category === 'consumable' ? (profile.consumables[item.id] ?? 0) > 0 : hasItemAccess(profile, item.id));
  const equipped = item && (item.category === 'consumable' ? isSupplyCarried(profile, item.id) : current?.id === item.id && available);
  const equipError = item ? loadoutEquipError(profile, item, ui) : null;
  const expiredExtra = ui.slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID);
  const rank = rankInsignia(level.level, profile.rankSet);
  const nextUnlocks = ARMORY_CATALOG.filter(i => (i.requiredLevel ?? 0) > level.level);
  const nextLevel = Math.min(...nextUnlocks.map(i => i.requiredLevel!));
  const unlockNote = level.level >= 50 ? 'Maximum level reached · all equipment level requirements met.' : nextUnlocks.length ? `Level ${nextLevel} unlocks: ${nextUnlocks.filter(i => i.requiredLevel === nextLevel).map(i => i.name).join(' · ')}` : 'All equipment level requirements met.';
  const rentals = deploymentRentals(profile), shortRentals = rentals.filter(i => profile.rentals[i.id] < 15 * 60_000);
  const items = ARMORY_CATALOG.filter(i => itemFitsSlot(i, ui) && (!weaponSlot(ui.slot) || i.family === ui.family) && (ui.slot !== 'supplies' || ui.supplyType === 'all' || i.supplyType === ui.supplyType)).sort(byUnlock);
  const platforms = FPS_WEAPONS.flatMap((weapon, family) => isShopFamily(family) && (ui.slot === 'skin' || isMainWeapon(family)) ? [{ weapon, family }] : []);
  const go = (view: View) => { setUi(u => ({ ...u, view: view === 'browse' && u.fromCatalog ? 'catalog' : view })); };
  const openSlot = (slot: LoadoutSlot) => {
    const family = slot === 'main' ? carry.main : slot === 'extra' ? carry.extra ?? FPS_WEAPONS.findIndex((_, i) => isShopFamily(i) && isMainWeapon(i) && i !== carry.main) : slot === 'sidearm' ? SIDEARM_FAMILY : ui.family;
    setUi(u => ({ ...u, slot, family, fromCatalog: false, item: '', view: slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID) ? 'extra' : 'browse' }));
  };
  const inspect = (i: ShopItem) => { setUi(u => ({ ...u, item: i.id, view: 'detail' })); setQuantity(1); };
  const inspectCatalog = (i: ShopItem, family: number, vehicle: MotorVehicleKind) => {
    const slot: LoadoutSlot = i.category === 'weapon' ? i.family === SIDEARM_FAMILY ? 'sidearm' : i.family === carry.extra ? 'extra' : 'main' : i.category === 'consumable' ? 'supplies' : i.category as LoadoutSlot;
    setUi({ ...ui, fromCatalog: true, view: 'detail', item: i.id, slot, family: i.family ?? family, vehicle }); setQuantity(1);
  };
  const rental = (extend = false, extra = false) => { setTerm('1h'); setRenew(extend); setEquipAfter(!extend); setUi(u => ({ ...u, view: 'rental', ...(extra ? { item: EXTRA_SLOT_ID, slot: 'extra', fromCatalog: false } : {}) })); };
  // Block repeated confirmation events until the updated wallet and destination render.
  useLayoutEffect(() => { pending.current = false; }, [profile]);
  const transact = (run: () => boolean, next?: View) => {
    if (pending.current) return;
    pending.current = true;
    const changed = run();
    if (!changed) pending.current = false;
    else if (next) go(next);
  };
  useEffect(() => {
    prepareStoreAudio();
    const visibility = () => { if (document.hidden) stopStoreAudio(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { stopStoreHover(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useLayoutEffect(() => {
    if (initialFocus.current) { initialFocus.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 760px)').matches) (root.current?.querySelector('.loadout-feedback') ?? heading.current)?.scrollIntoView({ block: 'start' });
  }, [ui.view, ui.slot, ui.item]);
  useEffect(() => {
    if (!tutorial) return;
    setTourStep(0); setUi(initialSelection(carry.main));
    return () => { requestAnimationFrame(() => document.querySelector<HTMLElement>('.store-tour-trigger')?.focus({ preventScroll: true })); };
    // A replay starts the guide at the loadout, without mutating saved equipment.
  }, [!!tutorial]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || (event.target instanceof Element && event.target.matches('input, select, textarea'))) return;
      if (tutorial) { event.preventDefault(); event.stopImmediatePropagation(); tutorial.onExit(); return; }
      if (root.current?.querySelector('details[open]')) return;
      if (ui.view === 'home') return;
      if (ui.view === 'catalog' && document.querySelector('.shop.is-inspecting')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      go(ui.view === 'rental' ? ui.item === EXTRA_SLOT_ID ? 'extra' : 'detail' : ui.view === 'detail' ? 'browse' : ui.view === 'match' ? 'review' : 'home');
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [ui.view, ui.item, tutorial]);

  const title = (text: string, back: View = 'home') => <div className="loadout-section-heading"><button data-loadout-back type="button" onClick={() => go(back)}><ArrowLeft size={16} /> {back === 'home' ? 'Your loadout' : back === 'browse' ? ui.fromCatalog ? 'Browse store' : 'Choose gear' : back === 'review' ? 'Review loadout' : 'Item details'}</button><h2 ref={heading} tabIndex={-1}>{text}</h2></div>;
  const slotButtons = (review = false) => <div className={review ? 'loadout-review-list' : 'loadout-slots'}>{LOADOUT_SLOTS.map(({ id, label }) => {
    const target = { ...ui, slot: id }, worn = slotItem(profile, target), Icon = icons[id];
    const slotLocked = id === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID);
    return <button type="button" key={id} data-loadout-slot={id} className={ui.slot === id && ui.view !== 'home' ? 'selected' : ''} onClick={() => openSlot(id)}><Icon size={19} /><span><small>{label}</small><strong>{id === 'supplies' ? `${packed} packed` : slotLocked ? 'Optional · Rent slot' : worn?.name ?? 'Empty · Travel lighter'}</strong><small>{id === 'supplies' ? 'Buy or pack supplies' : slotLocked ? 'Weapon rental is separate' : worn && profile.rentals[worn.id] ? `${rentalTimeLeft(profile.rentals[worn.id])} · play time` : worn ? 'Issued · Always available' : 'No extra carried weight'}</small></span><ChevronRight size={15} /></button>;
  })}</div>;
  const confirmEquip = () => { if (item) transact(() => store.equipLoadout(item.id, ui), 'home'); };
  const confirmRental = () => {
    if (!item) return;
    transact(() => store.buyLoadout(item.id, term, !renew && equipAfter && item.id !== EXTRA_SLOT_ID ? ui : undefined), item.id === EXTRA_SLOT_ID ? 'browse' : equipAfter && !renew ? 'home' : 'detail');
  };
  const confirmSupply = () => { if (item) transact(() => { const changed = store.buyLoadout(item.id, undefined, ui, quantity); if (changed) setQuantity(1); return changed; }); };

  if (ui.view === 'catalog' && !tutorial) return <ArmoryShop store={sourceStore} nav={<>{nav}<button type="button" className="game-back" onClick={() => go('home')}><Backpack size={16} /> Your loadout</button></>} onInspectItem={inspectCatalog} />;

  let content: ReactNode;
  if (ui.view === 'home' || !item && (ui.view === 'detail' || ui.view === 'rental')) content = <section className="loadout-stack">
    <div><span className="loadout-eyebrow">Prepare for your next match</span><h2 ref={heading} tabIndex={-1}>Start with what you’ll carry</h2><p>Choose a slot to compare gear. Browsing leaves your current loadout equipped.</p></div>
    <div className="loadout-panel loadout-stack"><h3>Your loadout is ready to play</h3><p>Issued equipment is always available. You can play without renting anything.</p><div className="loadout-line"><span>Main weapon</span><strong>{loadout.weapons[carry.main].name}</strong></div><div className="loadout-line"><span>Sidearm</span><strong>{loadout.weapons[SIDEARM_FAMILY].name}</strong></div><div className="loadout-line"><span>Supplies packed</span><strong>{packed}</strong></div><button type="button" className="loadout-primary" onClick={() => openSlot('main')}>Choose main weapon <ArrowRight size={17} /></button></div>
    <button type="button" data-browse-store className="loadout-catalog-link" onClick={() => go('catalog')}><ShoppingBag size={20} /><span><strong>Browse store</strong><small>Traditional weapon listings, armor, supplies and cosmetics</small></span><ChevronRight size={17} /></button>
    <button type="button" className="loadout-primary" data-loadout-review onClick={() => go('review')}>Review loadout & continue <ArrowRight size={17} /></button>
  </section>;
  else if (ui.view === 'extra') content = <section className="loadout-stack">{title('Carry a second main weapon')}<div className="loadout-panel loadout-stack"><Layers2 size={32} /><h3>Extra main weapon slot</h3><p>Rent the slot, then choose a different weapon platform. Both weapons and their ammunition add carried weight.</p><div className="loadout-notice">Weapons are rented separately. Your main weapon and sidearm are already available without this slot.</div><strong>From {priceLabel(itemById(EXTRA_SLOT_ID)!, weaponTermPrice(itemById(EXTRA_SLOT_ID)!, '1h'))} / gameplay hour</strong><button type="button" className="loadout-primary" onClick={() => rental(false, true)}>Choose slot rental <ArrowRight size={16} /></button></div></section>;
  else if (ui.view === 'browse') content = <section className="loadout-stack">{title(`Choose ${slotLabel(ui.slot).toLowerCase()}`)}
    {expiredExtra ? <div className="loadout-notice"><p>Your extra slot rental has expired. Your main weapon remains equipped.</p><button onClick={() => go('extra')}>Rent extra slot</button></div> : <>
      <p>{ui.slot === 'supplies' ? 'Pack owned stock or buy more. Only packed supplies enter the field; they are spent when used.' : `Currently equipped: ${current?.name ?? 'Empty'}. Select an item to compare.`}</p>
      {(weaponSlot(ui.slot) && ui.slot !== 'sidearm' || ui.slot === 'skin') && <div className="loadout-platforms"><span className="loadout-eyebrow">Weapon platform</span><div role="tablist" aria-label="Weapon platform" onKeyDown={event => tabNavigation(event, index => setUi(u => ({ ...u, family: platforms[index].family })))}>{platforms.map(({ weapon, family }) => <button type="button" role="tab" id={`loadout-platform-${family}`} aria-controls="loadout-platform-items" data-platform={family} aria-selected={ui.family === family} tabIndex={ui.family === family ? 0 : -1} key={weapon.id} onClick={() => setUi(u => ({ ...u, family }))}>{weapon.name}{(ui.slot === 'extra' ? carry.main : carry.extra) === family && <small>In other main slot</small>}</button>)}</div></div>}
      {ui.slot === 'vehicleSkin' && <label className="loadout-field">Vehicle<select value={ui.vehicle} onChange={e => setUi(u => ({ ...u, vehicle: e.target.value as MotorVehicleKind }))}><option value="car">Utility 01 · 4×4</option><option value="helicopter">Falcon 01 · Helicopter</option></select></label>}
      {ui.slot === 'supplies' && <label className="loadout-field">Supply type<select value={ui.supplyType} onChange={e => setUi(u => ({ ...u, supplyType: e.target.value as Selection['supplyType'] }))}>{supplyTypes.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>}
      {ui.slot === 'extra' && <div className="loadout-actions"><button data-store-outcome onClick={() => transact(() => store.selectCarrySlot('extra', null), 'home')}>Leave extra slot empty</button><button onClick={() => rental(true, true)}>Extend extra slot · {rentalTimeLeft(profile.rentals[EXTRA_SLOT_ID])}</button></div>}
      <div className="loadout-items" id="loadout-platform-items" role={weaponSlot(ui.slot) && ui.slot !== 'sidearm' || ui.slot === 'skin' ? 'tabpanel' : undefined} aria-labelledby={weaponSlot(ui.slot) && ui.slot !== 'sidearm' || ui.slot === 'skin' ? `loadout-platform-${ui.family}` : undefined}>{items.map(i => <button type="button" data-item={i.id} key={i.id} onClick={() => inspect(i)}><img src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(i, i.family ?? ui.family, ui.vehicle)}`} alt="" width={480} height={240} loading="lazy" /><span><small>{i.category === 'consumable' ? `${profile.consumables[i.id] ?? 0} in stock${isSupplyCarried(profile, i.id) ? ' · Packed' : ''}` : current?.id === i.id ? 'Equipped' : hasItemAccess(profile, i.id) ? profile.rentals[i.id] ? `Rented · ${rentalTimeLeft(profile.rentals[i.id])}` : 'Issued · Available' : (i.requiredLevel ?? 1) > level.level ? `Level ${i.requiredLevel} required` : `${i.tier} · Available to rent`}</small><strong>{i.name}</strong><small>{i.category === 'consumable' ? `${priceLabel(i, i.price)} each` : canRentEquipment(i) ? `From ${priceLabel(i, weaponTermPrice(i, '1h'))} / gameplay hour` : 'Free · Always available'}</small></span><ChevronRight size={17} /></button>)}</div>
    </>}
  </section>;
  else if (ui.view === 'detail' && item) {
    const supply = item.category === 'consumable', held = profile.consumables[item.id] ?? 0, full = held >= consumableLimit(item), locked = !available && level.level < (item.requiredLevel ?? 1);
    content = <section className="loadout-stack">{title(item.name, 'browse')}
      <div className="loadout-item-hero"><ArmoryPreview item={item} weapon={dossierWeapon(item, profile, ui.family)} vehicle={ui.vehicle} /><div><span className="loadout-eyebrow">{supply ? `${held} in stock · ${isSupplyCarried(profile, item.id) ? 'Packed' : 'In locker'}` : equipped ? 'Equipped' : available ? profile.rentals[item.id] ? `Rented · ${rentalTimeLeft(profile.rentals[item.id])}` : 'Issued · Always available' : locked ? `Level ${item.requiredLevel} required` : 'Available to rent'}</span><p>{item.description}</p></div></div>
      {!supply && <div className="loadout-notice"><strong>{equipped ? 'Already in your loadout' : `Equip in ${slotLabel(ui.slot).toLowerCase()}`}</strong><p>{equipped ? `${current?.name} is ready for your next deployment.` : `Replaces ${current?.name ?? 'the empty slot'}. Previously rented gear stays in your locker.`}</p>{item.category === 'weapon' && item.family !== SIDEARM_FAMILY && hasItemAccess(profile, EXTRA_SLOT_ID) && <label className="loadout-field">Destination<select aria-label="Equip destination" value={ui.slot} onChange={e => setUi(u => ({ ...u, slot: e.target.value as 'main' | 'extra' }))}><option value="main">Main weapon</option><option value="extra">Extra main</option></select></label>}</div>}
      {supply ? <div className="loadout-panel loadout-stack"><h3>Supply belt</h3><p>{held} in stock · Maximum {consumableLimit(item)} · {priceLabel(item, item.price)} each</p><button type="button" data-store-outcome data-pack-supply disabled={!held} aria-pressed={isSupplyCarried(profile, item.id)} onClick={() => transact(() => store.bringSupply(item.id, !isSupplyCarried(profile, item.id)))}>{isSupplyCarried(profile, item.id) ? 'Packed · Leave in locker' : 'Pack owned stock'}</button><div className="loadout-actions"><label className="loadout-field">Quantity to buy<select aria-label="Supply quantity" value={Math.min(quantity, Math.max(1, consumableLimit(item) - held))} disabled={full} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: Math.max(1, consumableLimit(item) - held) }, (_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}</select></label><button type="button" data-store-outcome data-buy-supply className="loadout-primary" disabled={locked || full || held + quantity > consumableLimit(item) || item.price * quantity > profile[item.currency]} onClick={confirmSupply}>{full ? 'Stock full' : locked ? `Unlocks at level ${item.requiredLevel}` : `Buy & pack ${quantity} · ${priceLabel(item, item.price * quantity)}`}</button></div>{item.price * quantity > profile[item.currency] && <p className="loadout-warning">Need {priceLabel(item, item.price * quantity - profile[item.currency])} more.</p>}<small>Buying packs all stock of this supply type. Leaving it in your locker keeps your stock and removes its field weight.</small></div>
      : locked ? <div className="loadout-notice"><p>Reach level {item.requiredLevel} to rent this item. You are level {level.level}. {Math.max(0, xpForLevel(item.requiredLevel ?? 1) - profile.xp).toLocaleString()} XP to unlock, or {skipCostFrom(profile.xp, item.requiredLevel ?? 1).toLocaleString()} tokens of levels. The rental price is separate.</p><button onClick={() => go('browse')}>Choose available gear</button></div>
      : <div className="loadout-stack">{equipError && <div className="loadout-notice loadout-warning">{equipError}{expiredExtra && <button onClick={() => go('extra')}>Rent extra slot</button>}</div>}<div className="loadout-actions">{available ? <button data-store-outcome data-equip-item className="loadout-primary" disabled={!!equipped || !!equipError} onClick={confirmEquip}>{equipped ? <><Check size={17} /> Equipped</> : 'Equip now'}</button> : <button className="loadout-primary" data-choose-rental onClick={() => rental()}>Choose rental duration <ArrowRight size={17} /></button>}{profile.rentals[item.id] > 0 && <button data-extend-rental onClick={() => rental(true)}>Extend rental</button>}</div>{profile.rentals[item.id] > 0 && <details><summary>Manage rental</summary><DiscardRental key={item.id} name={item.name} remainingMs={profile.rentals[item.id]} onDiscard={() => store.discardWeaponRental(item.id)} /></details>}</div>}
      <LoadoutComparison item={item} profile={profile} target={ui} />
      <LoadoutSpecifications item={item} profile={profile} target={ui} />
    </section>;
  } else if (ui.view === 'rental' && item) {
    const extra = item.id === EXTRA_SLOT_ID, cost = weaponTermPrice(item, term), short = Math.max(0, cost - profile[item.currency]);
    const blocked = !renew && equipAfter && !extra ? equipError : null;
    content = <section className="loadout-stack">{title(`${renew ? 'Extend' : 'Rent'} ${item.name}`, extra ? 'extra' : 'detail')}<div className="loadout-panel loadout-stack"><h3>Choose active play time</h3><div className="loadout-terms">{WEAPON_TERMS.map(option => <button type="button" key={option.id} data-rental-term={option.id} aria-pressed={term === option.id} onClick={() => setTerm(option.id)}><strong>{option.label}</strong><span>{priceLabel(item, weaponTermPrice(item, option.id))}</span>{weaponTermSavings(item, option.id) > 0 && <small>Save {priceLabel(item, weaponTermSavings(item, option.id))}</small>}</button>)}</div><p>Timer pauses in menus, while paused and offline. No automatic charges.</p><div><div className="loadout-line"><span>Cost today</span><strong>{priceLabel(item, cost)}</strong></div><div className="loadout-line"><span>Your balance</span><span>{priceLabel(item, profile[item.currency])}</span></div><div className="loadout-line"><span>Balance after rental</span><strong>{short ? 'Not enough funds' : priceLabel(item, profile[item.currency] - cost)}</strong></div></div>
      {renew ? <p>Adds {WEAPON_TERMS.find(t => t.id === term)!.label} to {rentalTimeLeft(profile.rentals[item.id] ?? 0)}. Equipped gear stays unchanged.</p> : extra ? <div className="loadout-notice">Renting this slot does not rent a weapon. Choose a different main weapon next.</div> : <label className="loadout-checkbox"><input type="checkbox" checked={equipAfter} onChange={e => setEquipAfter(e.target.checked)} />Equip in {slotLabel(ui.slot).toLowerCase()} after renting</label>}
      {!extra && !renew && <p>{equipAfter ? `Replaces ${current?.name ?? 'the empty slot'}.` : 'Keep in locker. Your current equipment stays unchanged.'}</p>}
      {(short > 0 || blocked) && <p role="alert" className="loadout-warning">{blocked || `You need ${priceLabel(item, short)} more. Choose a shorter rental or use issued equipment.`}</p>}
      <div className="loadout-actions"><button onClick={() => go(extra ? 'extra' : 'detail')}>Cancel</button><button className="loadout-primary" data-store-outcome data-confirm-rental disabled={short > 0 || !!blocked || level.level < (item.requiredLevel ?? 1)} onClick={confirmRental}>{renew ? 'Extend' : extra ? 'Rent slot' : equipAfter ? 'Rent & equip' : 'Rent to locker'} · {priceLabel(item, cost)}</button></div>
    </div></section>;
  } else if (ui.view === 'review') content = <section className="loadout-stack">{title('Review your deployment loadout')}<p>Only slotted gear and packed supplies come with you. This step spends no currency.</p><div className="loadout-review-columns">{slotButtons(true)}<div className="loadout-stack"><div className="loadout-panel loadout-stack"><h3>Readiness</h3><p><Check size={16} /> Main weapon and sidearm equipped</p><p>{packed ? `${packed} supplies packed.` : 'No supplies packed. You can still play.'}</p>{shortRentals.map(i => <div className="loadout-notice loadout-warning" key={i.id}><strong>{i.name} · {rentalTimeLeft(profile.rentals[i.id])}</strong><p>May expire during your match. Extending is optional.</p><button onClick={() => {
          const slot: LoadoutSlot = i.id === EXTRA_SLOT_ID ? 'extra' : i.category === 'weapon' ? i.family === SIDEARM_FAMILY ? 'sidearm' : i.family === carry.extra ? 'extra' : 'main' : i.category as LoadoutSlot;
          setUi(u => ({ ...u, fromCatalog: false, item: i.id, slot, family: i.family ?? u.family, view: 'rental' })); setRenew(true); setTerm('1h'); setEquipAfter(false);
        }}>Extend rental</button></div>)}<p>Expired rentals return to issued equipment after death or game end. Rental time counts down only during active play.</p><strong>{equipmentMovement(loadout, carry.main).totalKg.toFixed(1)} kg carried</strong></div><button className="loadout-primary" data-choose-match onClick={() => go('match')}>Choose where to play <ArrowRight size={16} /></button></div></div></section>;
  else content = <section className="loadout-stack">{title('Where are you taking this loadout?', 'review')}<div className="loadout-destinations">{MATCH_MODES.map(mode => <button key={mode.mode} data-match-mode={mode.mode} aria-pressed={destination === mode.mode} onClick={() => setDestination(mode.mode)}><Crosshair size={22} /><strong>{mode.name}</strong><small>{mode.description}</small><small>Single player · {mode.format}</small></button>)}</div><div className="loadout-actions">{([['multiplayer-menu', 'Multiplayer'], ['training', 'Live-fire range'], ['world', 'Open World']] as const).map(([route, label]) => <button key={route} aria-pressed={destination === route} onClick={() => setDestination(route)}>{label}</button>)}</div><div className="loadout-panel loadout-stack"><h3>Loadout saved</h3><p>{loadout.weapons[carry.main].name} · {packed} supplies packed</p><p>Additional cost: 0 credits · 0 tokens</p>{shortRentals.length > 0 && <small className="loadout-warning">Some rentals have less than 15 minutes of play time remaining. You can continue or go back to extend them.</small>}<button className="loadout-primary" data-loadout-play onClick={() => { go('home'); onPlay(destination); }}>Continue to {MATCH_MODES.find(m => m.mode === destination)?.name ?? (destination === 'multiplayer-menu' ? 'Multiplayer' : destination === 'training' ? 'the range' : 'Open World')} <ArrowRight size={17} /></button><small>Continue to the existing mode setup. No further purchase is needed.</small></div></section>;

  const tourStops = [
    ['Choose a slot', 'Start with the slot you want to improve. Browse store keeps the traditional catalog available.'],
    ['Compare before spending', 'Choose a platform, then inspect a variant. Its figures compare with the gear currently in the selected slot.'],
    ['Rent one item at a time', 'Select 1, 2 or 4 gameplay hours. The priced button completes the rental; Equip after renting is optional.'],
    ['Pack, review and play', 'Pack owned supplies or buy more. Review your carried gear, then continue to your match setup.'],
  ];
  return <section ref={root} className="armory loadout-store" data-loadout-view={ui.view} aria-label="Loadout and store" {...storeSoundEvents}>
    <header className="loadout-header">{nav}<div className="armory-wallet"><span><Coins size={16} /><b data-testid="credits">{profile.credits.toLocaleString()}</b><small>credits</small></span><span className="premium"><Gem size={16} /><b data-testid="tokens">{profile.tokens.toLocaleString()}</b><small>tokens</small></span></div><details className="loadout-account"><summary>Level {level.level} · Account</summary><div className="loadout-panel loadout-stack"><h3>Rank & demo wallet</h3><div className="loadout-rank"><RankBadge insignia={rank} size={36} /><strong>{rank.label}</strong></div><p>{level.xp.toLocaleString()} XP{level.level < 50 ? ` / ${level.next.toLocaleString()} XP` : ' · Maximum level reached'}</p><progress value={level.progress} max={1} aria-label={level.level >= 50 ? 'Maximum level reached' : 'Progress to next level'} /><p>{unlockNote}</p>{!skip.atMax && <button data-store-outcome disabled={profile.tokens < skip.price} onClick={store.buyLevel}>Skip to level {skip.next} · {skip.price} tokens</button>}<button data-store-outcome onClick={store.demoCreditTopUp}>+1,000 demo credits</button><button data-store-outcome onClick={store.demoTopUp}>+250 demo tokens</button><small>Demo wallet · No real payments</small></div></details></header>
    <nav className="loadout-steps" aria-label="Preparation progress"><span aria-current={!['review', 'match'].includes(ui.view) ? 'step' : undefined}>1 · Choose & equip</span><ChevronRight size={14} /><span aria-current={ui.view === 'review' ? 'step' : undefined}>2 · Review loadout</span><ChevronRight size={14} /><span aria-current={ui.view === 'match' ? 'step' : undefined}>3 · Choose match</span></nav>
    {tutorial && <section className="loadout-guide loadout-panel" aria-label="Store tour"><div><span className="loadout-eyebrow">Store tour · {tourStep + 1} / {tourStops.length}</span><h2>{tourStops[tourStep][0]}</h2><p>{tourStops[tourStep][1]}</p></div><div className="loadout-actions"><button onClick={tutorial.onExit}>Close tour</button><button disabled={tourStep === 0} onClick={() => setTourStep(n => n - 1)}>Back</button><button className="loadout-primary" onClick={() => tourStep === tourStops.length - 1 ? tutorial.onComplete() : setTourStep(n => n + 1)}>{tourStep === tourStops.length - 1 ? 'Finish tour' : 'Next'}</button></div></section>}
    {store.saveError && <div className="loadout-feedback loadout-warning" role="alert">Browser storage is unavailable. Purchases and equipment changes last for this session only.</div>}
    <div className={`loadout-feedback${store.message ? '' : ' is-empty'}`} role="status" aria-live="polite">{store.message}</div>
    <div className={`loadout-workspace${['review', 'match'].includes(ui.view) ? ' is-wide' : ''}${ui.view !== 'home' ? ' is-editing' : ''}`}>{!['review', 'match'].includes(ui.view) && <aside><span className="loadout-eyebrow">Your deployment loadout</span>{slotButtons()}</aside>}{content}</div>
    <footer className="loadout-footer"><small>Rental timers are paused here. Purchases save immediately.</small>{ui.view !== 'home' && <button data-loadout-home onClick={() => go('home')}>Your loadout</button>}{!['review', 'match', 'home'].includes(ui.view) && <button data-loadout-review onClick={() => go('review')}>Review loadout <ArrowRight size={16} /></button>}</footer>
  </section>;
}

function dossierWeapon(item: ShopItem, profile: ArmoryStore['profile'], family: number): EquippedWeapon {
  if (item.category === 'skin') return previewLoadout(profile, item, family).weapons[family];
  const spec = fittedVariantSpec(item);
  return spec ? { ...spec, traits: spec.traits ?? [], name: item.name, equipment: { ...profile.guns[item.family!], variant: item.id }, accent: item.accent } : resolveLoadout(profile).weapons[family];
}

function LoadoutSpecifications({ item, profile, target }: { item: ShopItem; profile: ArmoryStore['profile']; target: LoadoutTarget }) {
  const current = resolveLoadout(profile), worn = slotItem(profile, target);
  const weapon = item.category === 'weapon' ? dossierWeapon(item, profile, item.family!) : null;
  const equipped = worn?.category === 'weapon' ? current.weapons[worn.family!] : weapon;
  return <section className="loadout-specifications" aria-label="Specifications and equipment details"><h3>Specifications & equipment details</h3><div className="loadout-stack">
    {item.flavorText && <p>“{item.flavorText}”</p>}
    {weapon && <><div className="loadout-charts"><FalloffCurve weapon={weapon} equipped={equipped ?? weapon} /><SprayPattern compact weapon={weapon} equipped={equipped ?? weapon} /></div>{weapon.bipod && <p data-testid="bipod-policy">{bipodDescription(weapon.bipod)}</p>}</>}
    <FixedBuildDetails item={item} />
    {item.category === 'consumable' && <SupplyDetails item={item} />}
    {item.category === 'vision' && <VisionDeviceDetails item={item} />}
    {item.category === 'vehicleSkin' && <VehicleFinishDetails vehicle={target.vehicle} />}
    {item.category === 'skin' && <p>Cosmetic finish only. Performance stays unchanged.</p>}
  </div></section>;
}
