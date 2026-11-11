import ProfileBanner from './ProfileBanner';
import MenuHeader from './MenuHeader';
import { MenuButton, MenuSelect, MenuItemCard, MenuTabs } from './MenuControls';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Backpack, Check, ChevronRight, CircleHelp, Crosshair, Eye, Layers2, Package, Palette, Shield, ShoppingBag } from 'lucide-react';
import { ARMORY_CATALOG, byUnlock, consumableLimit, isShopFamily, itemById, type ShopItem } from '../game/armory-catalog';
import { fittedVariantSpec, isSupplyCarried, previewLoadout, resolveLoadout, type EquippedWeapon } from '../game/armory-state';
import { EXTRA_SLOT_ID, SIDEARM_FAMILY, isMainWeapon, restoreCarrySlots } from '../game/armory-slots';
import { deploymentRentals, itemFitsSlot, loadoutEquipError, packedSupplyCount, slotItem, slotLabel, weaponSlot, type LoadoutSlot, type LoadoutTarget } from '../game/loadout-store';
import { canRentEquipment, hasItemAccess, rentalTimeLeft, WEAPON_TERMS, weaponTermPrice, weaponTermSavings, type WeaponTerm } from '../game/weapon-rentals';
import { FPS_WEAPONS } from '../game/fps-rules';
import { equipmentMovement } from '../game/fps-encumbrance';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import { bipodDescription } from '../game/weapon-support';
import { FixedBuildDetails, SupplyDetails, VehicleFinishDetails, VisionDeviceDetails } from './EquipmentDossier';
import { progression, skipCostFrom, xpForLevel } from '../game/progression';
import { StoreMessage, StoreMoney, TierLabel } from './StoreLabels';
import { MATCH_MODES } from '../game/match-menu';
import type { ArmoryStore } from '../game/use-armory';
import type { MotorVehicleKind } from '../game/vehicle-rules';
import type { Route } from '../lib/routes';
import { switchEquipmentView, type EquipmentMode, type EquipmentSelection as Selection, type EquipmentSnapshot, type EquipmentView as View } from '../lib/equipment-navigation';
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

type Tour = { onComplete: () => void; onExit: () => void };
const icons = { main: Crosshair, extra: Layers2, sidearm: Crosshair, rig: Backpack, plate: Shield, vision: Eye, supplies: Package, skin: Palette, vehicleSkin: Palette };
const slotGroups: { label: string; slots: readonly LoadoutSlot[] }[] = [
  { label: 'Weapons', slots: ['main', 'extra', 'sidearm', 'skin'] },
  { label: 'Protection & equipment', slots: ['rig', 'plate', 'vision', 'vehicleSkin'] },
  { label: 'Supplies', slots: ['supplies'] },
];
const supplyTypes = [['all', 'All supplies'], ['medical', 'Recovery'], ['field-utility', 'Field utilities'], ['grenade', 'Grenades'], ['food', 'Food']] as const;
const initialSelection = (family: number): Selection => ({ view: 'home', slot: 'main', family, vehicle: 'car', item: '', supplyType: 'all' });
const priceLabel = (item: ShopItem, amount: number) => <StoreMoney amount={amount} currency={item.currency} />;

/** The slot is the destination. Browsing and previews never change the saved loadout. */
export default function LoadoutStore({ store: sourceStore, nav, headerAction, onHelp, onPlay, tutorial, mode = 'store', onModeChange }: { mode?: EquipmentMode; onModeChange?: (mode: EquipmentMode) => void; store: ArmoryStore; nav: ReactNode; headerAction?: ReactNode; onHelp?: () => void; onPlay: (route: Route) => void; tutorial?: Tour }) {
  const store = storeWithAudio(sourceStore), { profile } = store;
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const [ui, setUi] = useScreenState<Selection>('loadout-store.selection', { ...initialSelection(carry.main), view: mode === 'inventory' ? 'browse' : 'home' });
  const [term, setTerm] = useState<WeaponTerm>('1h'), [equipAfter, setEquipAfter] = useState(true), [renew, setRenew] = useState(false);
  const [quantity, setQuantity] = useState(1), [tourStep, setTourStep] = useState(0);
  const modeMemory = useRef<Partial<Record<EquipmentMode, EquipmentSnapshot>>>({}), previousMode = useRef(mode), switchingMode = useRef(false);
  const inventory = mode === 'inventory';
  const [destination, setDestination] = useState<Route>('team-deathmatch');
  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), initialFocus = useRef(true), pending = useRef(false);
  const level = progression(profile.xp), loadout = resolveLoadout(profile);
  const item = itemById(ui.item), current = slotItem(profile, ui), packed = packedSupplyCount(profile);
  const available = item && (item.category === 'consumable' ? (profile.consumables[item.id] ?? 0) > 0 : hasItemAccess(profile, item.id));
  const equipped = item && (item.category === 'consumable' ? isSupplyCarried(profile, item.id) : current?.id === item.id && available);
  const equipError = item ? loadoutEquipError(profile, item, ui) : null;
  const expiredExtra = ui.slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID);
  const rentals = deploymentRentals(profile), shortRentals = rentals.filter(i => profile.rentals[i.id] < 15 * 60_000);
  const allItems = ARMORY_CATALOG.filter(i => itemFitsSlot(i, ui) && (!weaponSlot(ui.slot) || i.family === ui.family) && (ui.slot !== 'supplies' || ui.supplyType === 'all' || i.supplyType === ui.supplyType)).sort(byUnlock);
  const items = inventory ? allItems.filter(i => i.category === 'consumable' ? (profile.consumables[i.id] ?? 0) > 0 : hasItemAccess(profile, i.id)) : allItems;
  const saveModePosition = () => { modeMemory.current[mode] = { selection: ui, scroll: window.scrollY }; };
  const changeMode = (next: EquipmentMode) => { saveModePosition(); onModeChange?.(next); };
  useEffect(() => {
    // Capture before React swaps a tall detail page for a short Inventory empty state.
    window.addEventListener('popstate', saveModePosition);
    return () => window.removeEventListener('popstate', saveModePosition);
  }, [mode, ui]);
  useLayoutEffect(() => {
    const from = previousMode.current;
    if (from === mode) {
      if (inventory && ['catalog', 'extra', 'rental'].includes(ui.view)) setUi(switchEquipmentView(ui, mode).selection);
      return;
    }
    if (modeMemory.current[from]?.selection !== ui) modeMemory.current[from] = { selection: ui, scroll: window.scrollY };
    const next = switchEquipmentView(ui, mode, modeMemory.current[mode]);
    previousMode.current = mode; switchingMode.current = true; setUi(next.selection);
    const scroll = next.scroll ?? window.scrollY;
    requestAnimationFrame(() => { window.scrollTo(0, scroll); document.getElementById(`equipment-tab-${mode}`)?.focus({ preventScroll: true }); switchingMode.current = false; });
  }, [mode]);
  const otherMainFamily = ui.slot === 'extra' ? carry.main : ui.slot === 'main' ? carry.extra : null;
  const hasPlatformTabs = weaponSlot(ui.slot) && ui.slot !== 'sidearm' || ui.slot === 'skin';
  const platforms = FPS_WEAPONS.flatMap((weapon, family) => isShopFamily(family) && (ui.slot === 'skin' || isMainWeapon(family)) ? [{ weapon, family }] : []);
  const go = (view: View) => { setUi(u => ({ ...u, view: view === 'browse' && u.fromCatalog && !inventory ? 'catalog' : view })); };
  const openSlot = (slot: LoadoutSlot) => {
    const family = slot === 'main' ? carry.main : slot === 'extra' ? carry.extra ?? FPS_WEAPONS.findIndex((_, i) => isShopFamily(i) && isMainWeapon(i) && i !== carry.main) : slot === 'sidearm' ? SIDEARM_FAMILY : ui.family;
    setUi(u => ({ ...u, slot, family, fromCatalog: false, item: '', view: !inventory && slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID) ? 'extra' : 'browse' }));
  };
  const inspect = (i: ShopItem) => { setUi(u => ({ ...u, item: i.id, view: 'detail' })); setQuantity(1); };
  const catalogContext = (i: ShopItem, family: number, vehicle: MotorVehicleKind, inspecting = false) => {
    const slot: LoadoutSlot = i.category === 'weapon' ? i.family === SIDEARM_FAMILY ? 'sidearm' : i.family === carry.extra ? 'extra' : 'main' : i.category === 'consumable' ? 'supplies' : i.category as LoadoutSlot;
    setUi(u => ({ ...u, fromCatalog: inspecting, view: inspecting ? 'detail' : 'catalog', item: inspecting ? i.id : '', slot, family: i.family ?? family, vehicle, supplyType: i.supplyType === 'food' ? 'food' : 'all' })); if (inspecting) setQuantity(1);
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
  // Keep native focus/scrollIntoView clear of both sticky bars after resizing or changing views.
  useLayoutEffect(() => {
    const header = root.current?.querySelector<HTMLElement>('.equipment-shell-nav');
    const footer = root.current?.querySelector<HTMLElement>('.loadout-footer');
    if (!header || !footer) return;
    const style = document.documentElement.style;
    const names = ['--equipment-header-height', '--equipment-footer-height'];
    const previous = names.map(name => style.getPropertyValue(name));
    const measure = () => {
      style.setProperty(names[0], `${header.getBoundingClientRect().height}px`);
      style.setProperty(names[1], `${footer.getBoundingClientRect().height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header); observer.observe(footer);
    return () => {
      observer.disconnect();
      names.forEach((name, index) => previous[index] ? style.setProperty(name, previous[index]) : style.removeProperty(name));
    };
  }, []);
  useLayoutEffect(() => {
    if (switchingMode.current) return;
    if (initialFocus.current) { initialFocus.current = false; return; }
    // Catalog filters update the shared selection; keep focus on their tab/control.
    if (ui.view === 'catalog' && root.current?.querySelector('.loadout-embedded-catalog')?.contains(document.activeElement)) return;
    heading.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 760px)').matches) (root.current?.querySelector('.loadout-feedback:not(.is-empty)') ?? heading.current)?.scrollIntoView({ block: 'start' });
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

  const title = (text: ReactNode, back: View = 'home') => <div className="loadout-section-heading"><MenuButton data-loadout-back type="button" onClick={() => go(back)}><ArrowLeft size={16} /> {back === 'home' ? 'Your loadout' : back === 'browse' ? ui.fromCatalog ? 'Browse store' : 'Choose gear' : back === 'review' ? 'Review loadout' : 'Item details'}</MenuButton><h2 ref={heading} tabIndex={-1}>{text}</h2></div>;
  const slotButton = (id: LoadoutSlot, review = false) => {
    const target = { ...ui, slot: id }, worn = slotItem(profile, target), Icon = icons[id];
    const slotLocked = id === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID);
    const selected = ui.slot === id && ui.view !== 'home' && ui.view !== 'review';
    const rental = worn && profile.rentals[worn.id];
    return <MenuButton type="button" key={id} data-loadout-slot={id} aria-current={selected ? 'true' : undefined} className={selected ? 'selected' : ''} onClick={() => openSlot(id)}><Icon size={19} aria-hidden="true" /><span><small>{slotLabel(id)}</small><strong>{id === 'supplies' ? `${packed} packed` : slotLocked ? 'Optional · Rent slot' : worn ? <TierLabel tier={worn.tier}>{worn.name}</TierLabel> : 'Empty · Travel lighter'}</strong>{(review || slotLocked || !!rental) && <small>{id === 'supplies' ? 'Buy or pack supplies' : slotLocked ? 'Weapon rental is separate' : rental ? `${rentalTimeLeft(rental)} · play time` : worn ? <><TierLabel tier={worn.tier} /> · Always available</> : 'No extra carried weight'}</small>}</span><ChevronRight size={15} aria-hidden="true" /></MenuButton>;
  };
  const slotButtons = (review = false) => <div className={`loadout-slots${review ? ' loadout-review-list' : ''}`}>
    {!review && <h2 id="deployment-loadout-heading">Your deployment loadout</h2>}
    {slotGroups.map(group => <section key={group.label} aria-label={group.label} className="loadout-slot-group"><h3>{group.label}</h3>{group.slots.map(id => slotButton(id, review))}</section>)}
  </div>;
  const confirmEquip = () => { if (item) transact(() => store.equipLoadout(item.id, ui), 'home'); };
  const confirmRental = () => {
    if (!item) return;
    transact(() => store.buyLoadout(item.id, term, !renew && equipAfter && item.id !== EXTRA_SLOT_ID ? ui : undefined), item.id === EXTRA_SLOT_ID ? 'browse' : equipAfter && !renew ? 'home' : 'detail');
  };
  const confirmSupply = () => { if (item) transact(() => { const changed = store.buyLoadout(item.id, undefined, ui, quantity); if (changed) setQuantity(1); return changed; }); };


  let content: ReactNode;
  if (ui.view === 'catalog' && !tutorial && !inventory) content = <section className="loadout-stack">{title('Browse store')}<div className="loadout-embedded-catalog"><ArmoryShop store={sourceStore} nav={<></>} onInspectItem={(i, family, vehicle) => catalogContext(i, family, vehicle, true)} onBrowseContext={catalogContext} /></div></section>;
  else if (ui.view === 'home' || !item && (ui.view === 'detail' || ui.view === 'rental')) content = <section className="loadout-stack">
    <div><span className="loadout-eyebrow">{inventory ? 'Your available equipment' : 'Prepare for your next match'}</span><h2 ref={heading} tabIndex={-1}>{inventory ? 'Your locker and loadout' : 'Start with what you’ll carry'}</h2><p>Choose a slot to compare gear. Browsing leaves your current loadout equipped.</p></div>
    <div className="loadout-panel loadout-stack"><h3>Your loadout is ready to play</h3><p><TierLabel tier="Issued" /> equipment is always available. You can play without renting anything.</p><div className="loadout-line"><span>Main weapon</span><strong><TierLabel tier={itemById(profile.guns[carry.main].variant)!.tier}>{loadout.weapons[carry.main].name}</TierLabel></strong></div><div className="loadout-line"><span>Sidearm</span><strong><TierLabel tier={itemById(profile.guns[SIDEARM_FAMILY].variant)!.tier}>{loadout.weapons[SIDEARM_FAMILY].name}</TierLabel></strong></div><div className="loadout-line"><span>Supplies packed</span><strong>{packed}</strong></div><MenuButton type="button" className="loadout-choose-main" onClick={() => openSlot('main')}>Choose main weapon <ArrowRight size={17} /></MenuButton></div>
    {!inventory && <MenuButton type="button" data-browse-store className="loadout-catalog-link" onClick={() => go('catalog')}><ShoppingBag size={20} /><span><strong>Browse store</strong><small>Traditional weapon listings, armor, supplies and cosmetics</small></span><ChevronRight size={17} /></MenuButton>}
    <MenuButton type="button" variant="primary" className="loadout-primary" data-loadout-review onClick={() => go('review')}>Review loadout & continue <ArrowRight size={17} /></MenuButton>
  </section>;
  else if (ui.view === 'extra') content = <section className="loadout-stack">{title('Carry a second main weapon')}<div className="loadout-panel loadout-stack"><Layers2 size={32} /><h3>Extra main weapon slot</h3><p>Rent the slot, then choose a different weapon platform. Both weapons and their ammunition add carried weight.</p><div className="loadout-notice">Weapons are rented separately. Your main weapon and sidearm are already available without this slot.</div><strong>From {priceLabel(itemById(EXTRA_SLOT_ID)!, weaponTermPrice(itemById(EXTRA_SLOT_ID)!, '1h'))} / gameplay hour</strong><MenuButton type="button" variant="primary" className="loadout-primary" onClick={() => rental(false, true)}>Choose slot rental <ArrowRight size={16} /></MenuButton></div></section>;
  else if (ui.view === 'browse') content = <section className="loadout-stack">{title(`${inventory ? 'Your' : 'Choose'} ${slotLabel(ui.slot).toLowerCase()}`)}
    {expiredExtra && !inventory ? <div className="loadout-notice"><p>Your extra slot rental has expired. Your main weapon remains equipped.</p><MenuButton onClick={() => go('extra')}>Rent extra slot</MenuButton></div> : <>
      <p>{ui.slot === 'supplies' ? 'Pack owned stock or buy more. Only packed supplies enter the field; they are spent when used.' : `Currently equipped: ${current?.name ?? 'Empty'}. Select an item to compare.`}</p>
      {ui.slot === 'vehicleSkin' && <label className="loadout-field">Vehicle<MenuSelect value={ui.vehicle} onChange={e => setUi(u => ({ ...u, vehicle: e.target.value as MotorVehicleKind }))}><option value="car">Utility 01 · 4×4</option><option value="helicopter">Falcon 01 · Helicopter</option></MenuSelect></label>}
      {ui.slot === 'supplies' && <label className="loadout-field">Supply type<MenuSelect value={ui.supplyType} onChange={e => setUi(u => ({ ...u, supplyType: e.target.value as Selection['supplyType'] }))}>{supplyTypes.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</MenuSelect></label>}
      {ui.slot === 'extra' && !expiredExtra && <div className="loadout-actions"><MenuButton data-store-outcome onClick={() => transact(() => store.selectCarrySlot('extra', null), 'home')}>Leave extra slot empty</MenuButton><MenuButton onClick={() => rental(true, true)}>Extend extra slot · {rentalTimeLeft(profile.rentals[EXTRA_SLOT_ID])}</MenuButton></div>}
      {ui.slot === 'extra' && !expiredExtra && <details><summary>Manage slot rental</summary><DiscardRental name="Extra main weapon slot" remainingMs={profile.rentals[EXTRA_SLOT_ID]} onDiscard={() => store.discardWeaponRental(EXTRA_SLOT_ID)} /></details>}
      {inventory && <p className="loadout-inventory-note">Owned gear and active rentals · Rental clocks are paused here.</p>}
      {inventory && expiredExtra && <div className="loadout-notice">Your extra main slot is not rented. You can browse your weapons here.<MenuButton onClick={() => changeMode('store')}>View slot rental in Store</MenuButton></div>}
      {hasPlatformTabs && <span className="loadout-eyebrow">Weapon platform</span>}
      <div className={hasPlatformTabs ? 'loadout-platform-browser' : undefined}>
      {hasPlatformTabs && <div className="loadout-platforms"><MenuTabs aria-label="Weapon platform" onKeyDown={event => tabNavigation(event, index => setUi(u => ({ ...u, family: platforms[index].family })))}>{platforms.map(({ weapon, family }) => <button type="button" role="tab" id={`loadout-platform-${family}`} aria-controls="loadout-platform-items" data-platform={family} aria-selected={ui.family === family} aria-describedby={family === otherMainFamily && ui.family === family ? 'loadout-platform-in-use' : undefined} tabIndex={ui.family === family ? 0 : -1} key={weapon.id} onClick={() => setUi(u => ({ ...u, family }))}><span className="loadout-platform-name">{weapon.name}</span>{otherMainFamily === family && <small className="loadout-in-use">In use</small>}</button>)}</MenuTabs></div>}
      <div className="loadout-items" id="loadout-platform-items" role={hasPlatformTabs ? 'tabpanel' : undefined} aria-labelledby={hasPlatformTabs ? `loadout-platform-${ui.family}` : undefined}>{hasPlatformTabs && ui.family === otherMainFamily && <p id="loadout-platform-in-use" className="loadout-platform-notice">Equipped in your other main slot. Choose a different platform for this slot.</p>}{inventory && !items.length && <div className="loadout-empty"><Package size={28} /><h3>No {ui.slot === 'supplies' ? 'supplies in stock' : 'available gear in this section'}</h3><p>Visit Store to see options for this same slot and platform.</p><MenuButton onClick={() => changeMode('store')}>Browse in Store</MenuButton></div>}{items.map(i => <MenuItemCard type="button" data-inventory-item={inventory ? i.id : undefined} data-item={i.id} key={i.id} onClick={() => inspect(i)}><img src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(i, i.family ?? ui.family, ui.vehicle)}`} alt="" width={480} height={240} loading="lazy" /><span><small><TierLabel tier={i.tier} /> · {i.category === 'consumable' ? `${profile.consumables[i.id] ?? 0} in stock${isSupplyCarried(profile, i.id) ? ' · Packed' : ''}` : current?.id === i.id ? 'Equipped' : hasItemAccess(profile, i.id) ? profile.rentals[i.id] ? `Rented · ${rentalTimeLeft(profile.rentals[i.id])}` : 'Always available' : (i.requiredLevel ?? 1) > level.level ? `Level ${i.requiredLevel} required` : 'Available to rent'}</small><strong><TierLabel tier={i.tier}>{i.name}</TierLabel></strong><small>{i.category === 'consumable' ? <>{priceLabel(i, i.price)} each</> : canRentEquipment(i) ? <>From {priceLabel(i, weaponTermPrice(i, '1h'))} / gameplay hour</> : 'Free · Always available'}</small></span><ChevronRight size={17} /></MenuItemCard>)}</div>
      </div>
    </>}
  </section>;
  else if (ui.view === 'detail' && item && inventory && !available) content = <section className="loadout-stack">{title(<TierLabel tier={item.tier}>{item.name}</TierLabel>, 'browse')}<div className="loadout-panel loadout-stack"><Package size={28} /><h3>You don’t have this item</h3><p>{item.name} is not available in your locker. Your equipped gear is unchanged.</p><MenuButton data-view-in-store variant="primary" className="loadout-primary" onClick={() => changeMode('store')}>View in Store</MenuButton><MenuButton onClick={() => go('browse')}>Show my available alternatives</MenuButton></div></section>;
  else if (ui.view === 'detail' && item) {
    const supply = item.category === 'consumable', held = profile.consumables[item.id] ?? 0, full = held >= consumableLimit(item), locked = !available && level.level < (item.requiredLevel ?? 1);
    content = <section className="loadout-stack">{title(<TierLabel tier={item.tier}>{item.name}</TierLabel>, 'browse')}
      <div className="loadout-item-hero"><ArmoryPreview item={item} weapon={dossierWeapon(item, profile, ui.family)} vehicle={ui.vehicle} /><div><span className="loadout-eyebrow"><TierLabel tier={item.tier} /> · {supply ? `${held} in stock · ${isSupplyCarried(profile, item.id) ? 'Packed' : 'In locker'}` : equipped ? 'Equipped' : available ? profile.rentals[item.id] ? `Rented · ${rentalTimeLeft(profile.rentals[item.id])}` : 'Always available' : locked ? `Level ${item.requiredLevel} required` : 'Available to rent'}</span><p>{item.description}</p></div></div>
      {!supply && <div className="loadout-notice"><strong>{equipped ? 'Already in your loadout' : `Equip in ${slotLabel(ui.slot).toLowerCase()}`}</strong><p>{equipped ? `${current?.name} is ready for your next deployment.` : `Replaces ${current?.name ?? 'the empty slot'}. Previously rented gear stays in your locker.`}</p>{item.category === 'weapon' && item.family !== SIDEARM_FAMILY && hasItemAccess(profile, EXTRA_SLOT_ID) && <label className="loadout-field">Destination<MenuSelect aria-label="Equip destination" value={ui.slot} onChange={e => setUi(u => ({ ...u, slot: e.target.value as 'main' | 'extra' }))}><option value="main">Main weapon</option><option value="extra">Extra main</option></MenuSelect></label>}</div>}
      {supply ? <div className="loadout-panel loadout-stack"><h3>Supply belt</h3><p>{held} in stock · Maximum {consumableLimit(item)} · {priceLabel(item, item.price)} each</p><MenuButton type="button" data-store-outcome data-pack-supply disabled={!held} aria-pressed={isSupplyCarried(profile, item.id)} onClick={() => transact(() => store.bringSupply(item.id, !isSupplyCarried(profile, item.id)))}>{isSupplyCarried(profile, item.id) ? 'Packed · Leave in locker' : 'Pack owned stock'}</MenuButton>{inventory ? <MenuButton data-view-in-store onClick={() => changeMode('store')}>Buy more in Store</MenuButton> : <div className="loadout-actions"><label className="loadout-field">Quantity to buy<MenuSelect aria-label="Supply quantity" value={Math.min(quantity, Math.max(1, consumableLimit(item) - held))} disabled={full} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: Math.max(1, consumableLimit(item) - held) }, (_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}</MenuSelect></label><MenuButton type="button" data-store-outcome data-buy-supply variant="primary" className="loadout-primary" disabled={locked || full || held + quantity > consumableLimit(item) || item.price * quantity > profile[item.currency]} onClick={confirmSupply}>{full ? 'Stock full' : locked ? `Unlocks at level ${item.requiredLevel}` : <>Buy & pack {quantity} · {priceLabel(item, item.price * quantity)}</>}</MenuButton></div>}{!inventory && item.price * quantity > profile[item.currency] && <p className="loadout-warning">Need {priceLabel(item, item.price * quantity - profile[item.currency])} more.</p>}<small>Buying packs all stock of this supply type. Leaving it in your locker keeps your stock and removes its field weight.</small></div>
      : locked ? <div className="loadout-notice"><p>Reach level {item.requiredLevel} to rent this item. You are level {level.level}. {Math.max(0, xpForLevel(item.requiredLevel ?? 1) - profile.xp).toLocaleString()} XP to unlock, or <StoreMoney amount={skipCostFrom(profile.xp, item.requiredLevel ?? 1)} currency="tokens" /> of levels. The rental price is separate.</p><MenuButton onClick={() => go('browse')}>Choose available gear</MenuButton></div>
      : <div className="loadout-stack">{equipError && <div className="loadout-notice loadout-warning">{equipError}{expiredExtra && <MenuButton onClick={() => go('extra')}>Rent extra slot</MenuButton>}</div>}<div className="loadout-actions">{available ? <MenuButton data-store-outcome data-equip-item variant="primary" className="loadout-primary" disabled={!!equipped || !!equipError} onClick={confirmEquip}>{equipped ? <><Check size={17} /> Equipped</> : 'Equip now'}</MenuButton> : <MenuButton variant="primary" className="loadout-primary" data-choose-rental onClick={() => rental()}>Choose rental duration <ArrowRight size={17} /></MenuButton>}{profile.rentals[item.id] > 0 && <MenuButton data-extend-rental onClick={() => rental(true)}>Extend rental</MenuButton>}</div>{profile.rentals[item.id] > 0 && <details><summary>Manage rental</summary><DiscardRental key={item.id} name={item.name} remainingMs={profile.rentals[item.id]} onDiscard={() => store.discardWeaponRental(item.id)} /></details>}</div>}
      <LoadoutComparison item={item} profile={profile} target={ui} />
      <LoadoutSpecifications item={item} profile={profile} target={ui} />
    </section>;
  } else if (ui.view === 'rental' && item) {
    const extra = item.id === EXTRA_SLOT_ID, cost = weaponTermPrice(item, term), short = Math.max(0, cost - profile[item.currency]);
    const blocked = !renew && equipAfter && !extra ? equipError : null;
    content = <section className="loadout-stack">{title(<>{renew ? 'Extend' : 'Rent'} <TierLabel tier={item.tier}>{item.name}</TierLabel></>, extra ? 'extra' : 'detail')}<div className="loadout-panel loadout-stack"><h3>Choose active play time</h3><div className="loadout-terms">{WEAPON_TERMS.map(option => <MenuButton type="button" key={option.id} data-rental-term={option.id} aria-pressed={term === option.id} onClick={() => setTerm(option.id)}><strong>{option.label}</strong><span>{priceLabel(item, weaponTermPrice(item, option.id))}</span>{weaponTermSavings(item, option.id) > 0 && <small>Save {priceLabel(item, weaponTermSavings(item, option.id))}</small>}</MenuButton>)}</div><p>Timer pauses in menus, while paused and offline. No automatic charges.</p><div><div className="loadout-line"><span>Cost today</span><strong>{priceLabel(item, cost)}</strong></div><div className="loadout-line"><span>Your balance</span><span>{priceLabel(item, profile[item.currency])}</span></div><div className="loadout-line"><span>Balance after rental</span><strong>{short ? 'Not enough funds' : priceLabel(item, profile[item.currency] - cost)}</strong></div></div>
      {renew ? <p>Adds {WEAPON_TERMS.find(t => t.id === term)!.label} to {rentalTimeLeft(profile.rentals[item.id] ?? 0)}. Equipped gear stays unchanged.</p> : extra ? <div className="loadout-notice">Renting this slot does not rent a weapon. Choose a different main weapon next.</div> : <label className="loadout-checkbox"><input type="checkbox" checked={equipAfter} onChange={e => setEquipAfter(e.target.checked)} />Equip in {slotLabel(ui.slot).toLowerCase()} after renting</label>}
      {!extra && !renew && <p>{equipAfter ? `Replaces ${current?.name ?? 'the empty slot'}.` : 'Keep in locker. Your current equipment stays unchanged.'}</p>}
      {(short > 0 || blocked) && <p role="alert" className="loadout-warning">{blocked || <>You need {priceLabel(item, short)} more. Choose a shorter rental or use <TierLabel tier="Issued">issued</TierLabel> equipment.</>}</p>}
      <div className="loadout-actions"><MenuButton onClick={() => go(extra ? 'extra' : 'detail')}>Cancel</MenuButton><MenuButton variant="primary" className="loadout-primary" data-store-outcome data-confirm-rental disabled={short > 0 || !!blocked || level.level < (item.requiredLevel ?? 1)} onClick={confirmRental}>{renew ? 'Extend' : extra ? 'Rent slot' : equipAfter ? 'Rent & equip' : 'Rent to locker'} · {priceLabel(item, cost)}</MenuButton></div>
    </div></section>;
  } else if (ui.view === 'review') content = <section className="loadout-stack">{title('Review your deployment loadout')}<p>Only slotted gear and packed supplies come with you. This step spends no currency.</p><div className="loadout-review-columns">{slotButtons(true)}<div className="loadout-review-summary loadout-stack"><div className="loadout-stack"><h3>Readiness</h3><p><Check size={16} /> Main weapon and sidearm equipped</p><p>{packed ? `${packed} supplies packed.` : 'No supplies packed. You can still play.'}</p>{shortRentals.map(i => <div className="loadout-notice loadout-warning" key={i.id}><strong><TierLabel tier={i.tier}>{i.name}</TierLabel> · {rentalTimeLeft(profile.rentals[i.id])}</strong><p>May expire during your match. Extending is optional.</p><MenuButton onClick={() => {
          const slot: LoadoutSlot = i.id === EXTRA_SLOT_ID ? 'extra' : i.category === 'weapon' ? i.family === SIDEARM_FAMILY ? 'sidearm' : i.family === carry.extra ? 'extra' : 'main' : i.category as LoadoutSlot;
          setUi(u => ({ ...u, fromCatalog: false, item: i.id, slot, family: i.family ?? u.family, view: 'rental' })); setRenew(true); setTerm('1h'); setEquipAfter(false);
        }}>Extend rental</MenuButton></div>)}<p>Expired rentals return to issued equipment after death or game end. Rental time counts down only during active play.</p><strong>{equipmentMovement(loadout, carry.main).totalKg.toFixed(1)} kg carried</strong></div><MenuButton variant="primary" className="loadout-primary" data-choose-match onClick={() => go('match')}>Choose where to play <ArrowRight size={16} /></MenuButton></div></div></section>;
  else content = <section className="loadout-stack">{title('Where are you taking this loadout?', 'review')}<div className="loadout-destinations">{MATCH_MODES.map(mode => <MenuButton key={mode.mode} data-match-mode={mode.mode} aria-pressed={destination === mode.mode} onClick={() => setDestination(mode.mode)}><Crosshair size={22} /><strong>{mode.name}</strong><small>{mode.description}</small><small>Single player · {mode.format}</small></MenuButton>)}</div><div className="loadout-actions">{([['multiplayer-menu', 'Multiplayer'], ['training', 'Live-fire range'], ['world', 'Open World']] as const).map(([route, label]) => <MenuButton key={route} aria-pressed={destination === route} onClick={() => setDestination(route)}>{label}</MenuButton>)}</div><div className="loadout-panel loadout-stack"><h3>Loadout saved</h3><p>{loadout.weapons[carry.main].name} · {packed} supplies packed</p><p>Additional cost: <StoreMoney amount={0} currency="credits" /> · <StoreMoney amount={0} currency="tokens" /></p>{shortRentals.length > 0 && <small className="loadout-warning">Some rentals have less than 15 minutes of play time remaining. You can continue or go back to extend them.</small>}<MenuButton variant="primary" className="loadout-primary" data-loadout-play onClick={() => { go('home'); onPlay(destination); }}>Continue to {MATCH_MODES.find(m => m.mode === destination)?.name ?? (destination === 'multiplayer-menu' ? 'Multiplayer' : destination === 'training' ? 'the range' : 'Open World')} <ArrowRight size={17} /></MenuButton><small>Continue to the existing mode setup. No further purchase is needed.</small></div></section>;

  const tourStops = [
    ['Choose a slot', 'Start with the slot you want to improve. Browse store keeps the traditional catalog available.'],
    ['Compare before spending', 'Choose a platform, then inspect a variant. Its figures compare with the gear currently in the selected slot.'],
    ['Rent one item at a time', 'Select 1, 2 or 4 gameplay hours. The priced button completes the rental; Equip after renting is optional.'],
    ['Pack, review and play', 'Pack owned supplies or buy more. Review your carried gear, then continue to your match setup.'],
  ];
  return <section ref={root} className="armory loadout-store" data-equipment-mode={mode} data-loadout-view={ui.view} aria-label="Loadout equipment" {...storeSoundEvents}>
    <div className="equipment-shell-nav"><MenuHeader className="loadout-header" action={headerAction} profile={<ProfileBanner store={sourceStore} />}>{nav}</MenuHeader>
    {onModeChange && <div className="equipment-view-bar"><MenuTabs aria-label="Equipment views" onKeyDown={event => tabNavigation(event, index => changeMode(index === 0 ? 'store' : 'inventory'))}>{(['store', 'inventory'] as const).map(view => <a key={view} id={`equipment-tab-${view}`} role="tab" aria-selected={mode === view} aria-controls="equipment-view-content" tabIndex={mode === view ? 0 : -1} href={`/${view}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); if (view !== mode) changeMode(view); }}>{view === 'store' ? <ShoppingBag size={17} /> : <Backpack size={17} />}{view === 'store' ? 'Store' : 'Inventory'}</a>)}</MenuTabs>{onHelp && <MenuButton className="store-tour-trigger" aria-label="Help: tour the store" title="Help: tour the store" aria-expanded={!!tutorial} aria-controls="equipment-help" onClick={onHelp}><CircleHelp size={20} aria-hidden="true" /><span className="equipment-help-label">Help</span></MenuButton>}</div>}</div>
    <nav className="loadout-steps" aria-label="Preparation progress"><span aria-current={!['review', 'match'].includes(ui.view) ? 'step' : undefined}>1 · Choose & equip</span><ChevronRight size={14} /><span aria-current={ui.view === 'review' ? 'step' : undefined}>2 · Review loadout</span><ChevronRight size={14} /><span aria-current={ui.view === 'match' ? 'step' : undefined}>3 · Choose match</span></nav>
    {tutorial && <section id="equipment-help" className="loadout-guide loadout-panel" aria-label="Store tour"><div><span className="loadout-eyebrow">Store tour · {tourStep + 1} / {tourStops.length}</span><h2>{tourStops[tourStep][0]}</h2><p>{tourStops[tourStep][1]}</p></div><div className="loadout-actions"><MenuButton onClick={tutorial.onExit}>Close tour</MenuButton><MenuButton disabled={tourStep === 0} onClick={() => setTourStep(n => n - 1)}>Back</MenuButton><MenuButton variant="primary" className="loadout-primary" onClick={() => tourStep === tourStops.length - 1 ? tutorial.onComplete() : setTourStep(n => n + 1)}>{tourStep === tourStops.length - 1 ? 'Finish tour' : 'Next'}</MenuButton></div></section>}
    {store.saveError && <div className="loadout-feedback loadout-warning" role="alert">Browser storage is unavailable. Purchases and equipment changes last for this session only.</div>}
    <div className={`loadout-feedback${store.message ? '' : ' is-empty'}`} role="status" aria-live="polite"><StoreMessage text={store.message} /></div>
    <div className={`loadout-workspace${['review', 'match'].includes(ui.view) ? ' is-wide' : ''}${ui.view !== 'home' ? ' is-editing' : ''}`}><div className="loadout-content" id="equipment-view-content" role={onModeChange ? 'tabpanel' : undefined} aria-labelledby={onModeChange ? `equipment-tab-${mode}` : undefined}>{content}</div>{!['review', 'match'].includes(ui.view) && <aside aria-labelledby="deployment-loadout-heading">{slotButtons()}</aside>}</div>
    {ui.view !== 'home' && <small className="loadout-save-note">Rental timers paused · Purchases save immediately.</small>}
    <footer className="loadout-footer"><small>Rental timers paused · Purchases save immediately.</small>{ui.view !== 'home' && <MenuButton data-loadout-home onClick={() => go('home')}>Your loadout</MenuButton>}{!['review', 'match', 'home'].includes(ui.view) && <MenuButton data-loadout-review onClick={() => go('review')}>Review loadout <ArrowRight size={16} /></MenuButton>}</footer>
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
