import ProfileBanner from './ProfileBanner';
import MenuHeader from './MenuHeader';
import { MenuButton, MenuSelect, MenuTabs } from './MenuControls';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Backpack, Check, ChevronRight, CircleHelp, Crosshair, Eye, Layers2, Package, Palette, Play, Shield, ShoppingBag } from 'lucide-react';
import { ARMORY_CATALOG, byUnlock, consumableLimit, isEnemyIssue, isShopFamily, itemById, type ShopItem } from '../game/armory-catalog';
import { fittedVariantSpec, isSupplyCarried, previewLoadout, resolveLoadout, type ArmoryProfile, type EquippedWeapon } from '../game/armory-state';
import { EXTRA_SLOT_ID, SIDEARM_FAMILY, isMainWeapon, restoreCarrySlots } from '../game/armory-slots';
import { deploymentRentals, itemFitsSlot, loadoutEquipError, packedSupplyCount, slotItem, slotLabel, weaponSlot, type LoadoutSlot, type LoadoutTarget } from '../game/loadout-store';
import { hasItemAccess, rentalTimeLeft, WEAPON_TERMS, weaponTermPrice, weaponTermSavings, type WeaponTerm } from '../game/weapon-rentals';
import { FPS_WEAPONS } from '../game/fps-rules';
import { equipmentMovement } from '../game/fps-encumbrance';
import { bipodDescription } from '../game/weapon-support';
import { FixedBuildDetails, SupplyDetails, VehicleFinishDetails, VisionDeviceDetails } from './EquipmentDossier';
import { progression, skipCostFrom, xpForLevel } from '../game/progression';
import { StoreMessage, StoreMoney, TierLabel } from './StoreLabels';
import { EquipmentCard, isInLocker, ItemPrice, itemStatus, OwnedFilter, PlatformTabs } from './EquipmentCard';
import type { ArmoryStore } from '../game/use-armory';
import type { MotorVehicleKind } from '../game/vehicle-rules';
import type { Route } from '../lib/routes';
import { knownEquipmentView, switchEquipmentView, type EquipmentMode, type EquipmentSelection as Selection, type EquipmentSnapshot, type EquipmentView as View } from '../lib/equipment-navigation';
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
/** One action, rendered in the page and again in the sticky footer. */
type ItemAction = { label: ReactNode; run: () => void; disabled?: boolean; pressed?: boolean; attrs: Record<string, true> };
const icons = { main: Crosshair, extra: Layers2, sidearm: Crosshair, rig: Backpack, plate: Shield, vision: Eye, supplies: Package, skin: Palette, vehicleSkin: Palette };
// Slots and the locker share one grouping so a player sees the same four shelves everywhere.
const slotGroups: { label: string; slots: readonly LoadoutSlot[] }[] = [
  { label: 'Weapons', slots: ['main', 'extra', 'sidearm'] },
  { label: 'Protection & equipment', slots: ['rig', 'plate', 'vision'] },
  { label: 'Supplies', slots: ['supplies'] },
  { label: 'Cosmetics', slots: ['skin', 'vehicleSkin'] },
];
const lockerGroups: { label: string; fits: (item: ShopItem) => boolean }[] = [
  { label: 'Weapons', fits: i => i.category === 'weapon' || i.category === 'loadout' },
  { label: 'Protection & equipment', fits: i => i.category === 'rig' || i.category === 'plate' || i.category === 'vision' },
  { label: 'Supplies', fits: i => i.category === 'consumable' },
  { label: 'Cosmetics', fits: i => i.category === 'skin' || i.category === 'vehicleSkin' },
];
const supplyTypes = [['all', 'All supplies'], ['medical', 'Recovery'], ['field-utility', 'Field utilities'], ['grenade', 'Grenades'], ['food', 'Food']] as const;
const vehicles = [{ id: 'car', name: 'Utility 01 · 4×4' }, { id: 'helicopter', name: 'Falcon 01 · Helicopter' }] as const;
const vehicleNames: Record<MotorVehicleKind, string> = { car: 'Utility 01', helicopter: 'Falcon 01' };
const initialSelection = (family: number): Selection => ({ view: 'home', slot: 'main', family, vehicle: 'car', item: '', supplyType: 'all' });
const priceLabel = (item: ShopItem, amount: number) => <StoreMoney amount={amount} currency={item.currency} />;

/** The slot is the destination. Browsing and previews never change the saved loadout. */
export default function LoadoutStore({ store: sourceStore, nav, headerAction, onHelp, onPlay, tutorial, mode = 'store', onModeChange }: { mode?: EquipmentMode; onModeChange?: (mode: EquipmentMode) => void; store: ArmoryStore; nav: ReactNode; headerAction?: ReactNode; onHelp?: () => void; onPlay: (route: Route) => void; tutorial?: Tour }) {
  const store = storeWithAudio(sourceStore), { profile } = store;
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const [savedUi, setUi] = useScreenState<Selection>('loadout-store.selection', initialSelection(carry.main));
  const ui = knownEquipmentView(savedUi);
  const [ownedOnly, setOwnedOnly] = useScreenState('loadout-store.owned', false);
  const [term, setTerm] = useState<WeaponTerm>('1h'), [equipAfter, setEquipAfter] = useState(true), [renew, setRenew] = useState(false);
  const [quantity, setQuantity] = useState(1), [tourStep, setTourStep] = useState(0);
  const modeMemory = useRef<Partial<Record<EquipmentMode, EquipmentSnapshot>>>({}), previousMode = useRef(mode), switchingMode = useRef(false);
  const inventory = mode === 'inventory', listOwned = inventory || ownedOnly;
  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), initialFocus = useRef(true), pending = useRef(false);
  const level = progression(profile.xp), loadout = resolveLoadout(profile);
  const item = itemById(ui.item), current = slotItem(profile, ui), packed = packedSupplyCount(profile);
  const available = item && isInLocker(profile, item);
  const equipped = item && (item.category === 'consumable' ? isSupplyCarried(profile, item.id) : current?.id === item.id && available);
  const equipError = item ? loadoutEquipError(profile, item, ui) : null;
  const expiredExtra = ui.slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID);
  const rentals = deploymentRentals(profile), shortRentals = rentals.filter(i => profile.rentals[i.id] < 15 * 60_000);
  const allItems = ARMORY_CATALOG.filter(i => itemFitsSlot(i, ui) && (!weaponSlot(ui.slot) || i.family === ui.family) && (ui.slot !== 'supplies' || ui.supplyType === 'all' || i.supplyType === ui.supplyType)).sort(byUnlock);
  const items = listOwned ? allItems.filter(i => isInLocker(profile, i)) : allItems;
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
  const platforms = FPS_WEAPONS.flatMap((weapon, family) => isShopFamily(family) && (ui.slot === 'skin' || isMainWeapon(family)) ? [{ id: family, name: weapon.name, note: otherMainFamily === family ? 'In use' : undefined }] : []);
  const go = (view: View) => { setUi(u => ({ ...u, view: view === 'browse' && u.fromCatalog && !inventory ? 'catalog' : view === 'browse' && u.fromLocker && inventory ? 'home' : view })); };
  const slotFor = (i: ShopItem): LoadoutSlot => i.id === EXTRA_SLOT_ID ? 'extra' : i.category === 'weapon' ? i.family === SIDEARM_FAMILY ? 'sidearm' : i.family === carry.extra ? 'extra' : 'main' : i.category === 'consumable' ? 'supplies' : i.category as LoadoutSlot;
  const openSlot = (slot: LoadoutSlot) => {
    const family = slot === 'main' ? carry.main : slot === 'extra' ? carry.extra ?? FPS_WEAPONS.findIndex((_, i) => isShopFamily(i) && isMainWeapon(i) && i !== carry.main) : slot === 'sidearm' ? SIDEARM_FAMILY : ui.family;
    setUi(u => ({ ...u, slot, family, fromCatalog: false, fromLocker: false, item: '', view: !inventory && slot === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID) ? 'extra' : 'browse' }));
  };
  const inspect = (i: ShopItem) => { setUi(u => ({ ...u, item: i.id, view: 'detail' })); setQuantity(1); };
  /** Locker items open with the destination they are worn in, so Equip targets the right slot. */
  const openLockerItem = (i: ShopItem) => {
    if (i.id === EXTRA_SLOT_ID) { openSlot('extra'); return; }
    const wornOn = i.category === 'skin' ? loadout.carriedFamilies.find(f => profile.guns[f].skin === i.id) : undefined;
    const vehicle: MotorVehicleKind = i.category === 'vehicleSkin' && profile.vehicleSkins.car !== i.id && profile.vehicleSkins.helicopter === i.id ? 'helicopter' : ui.vehicle;
    setUi(u => ({ ...u, slot: slotFor(i), family: i.family ?? wornOn ?? (i.category === 'skin' ? carry.main : u.family), vehicle, item: i.id, view: 'detail', fromLocker: true, fromCatalog: false, supplyType: 'all' }));
    setQuantity(1);
  };
  const catalogContext = (i: ShopItem, family: number, vehicle: MotorVehicleKind, inspecting = false) => {
    const slot: LoadoutSlot = i.category === 'weapon' ? i.family === SIDEARM_FAMILY ? 'sidearm' : i.family === carry.extra ? 'extra' : 'main' : i.category === 'consumable' ? 'supplies' : i.category as LoadoutSlot;
    setUi(u => ({ ...u, fromCatalog: inspecting, fromLocker: false, view: inspecting ? 'detail' : 'catalog', item: inspecting ? i.id : '', slot, family: i.family ?? family, vehicle, supplyType: i.supplyType === 'food' ? 'food' : 'all' })); if (inspecting) setQuantity(1);
  };
  const rental = (extend = false, extra = false) => { setTerm('1h'); setRenew(extend); setEquipAfter(!extend); setUi(u => ({ ...u, view: 'rental', ...(extra ? { item: EXTRA_SLOT_ID, slot: 'extra', fromCatalog: false } : {}) })); };
  /** The readiness warning opens the extension step for the rental that is running out. */
  const extendRental = (i: ShopItem) => {
    setUi(u => ({ ...u, fromCatalog: false, fromLocker: false, item: i.id, slot: slotFor(i), family: i.family ?? u.family, view: 'rental' })); setRenew(true); setTerm('1h'); setEquipAfter(false);
  };
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
  // Keep native focus/scrollIntoView, and the sticky sidebar, clear of both sticky bars.
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
  const rentalBack: View = ui.item === EXTRA_SLOT_ID ? renew || inventory ? 'browse' : 'extra' : 'detail';
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || (event.target instanceof Element && event.target.matches('input, select, textarea'))) return;
      if (tutorial) { event.preventDefault(); event.stopImmediatePropagation(); tutorial.onExit(); return; }
      if (root.current?.querySelector('details[open]')) return;
      if (ui.view === 'home') return;
      if (ui.view === 'catalog' && document.querySelector('.shop.is-inspecting')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      go(ui.view === 'rental' ? rentalBack : ui.view === 'detail' ? 'browse' : 'home');
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [ui.view, ui.item, tutorial, rentalBack]);

  const backLabel = (back: View) => back === 'home' ? inventory ? 'Locker' : 'Store' : back === 'browse' ? ui.fromCatalog && !inventory ? 'Browse store' : ui.fromLocker && inventory ? 'Locker' : slotLabel(ui.slot) : back === 'extra' ? 'Extra slot' : 'Item details';
  const backButton = (back: View) => <MenuButton data-loadout-back type="button" onClick={() => go(back)}><ArrowLeft size={16} /> {backLabel(back)}</MenuButton>;
  const title = (text: ReactNode, back: View = 'home') => <div className="loadout-section-heading">{backButton(back)}<h2 ref={heading} tabIndex={-1}>{text}</h2></div>;
  const slotButton = (id: LoadoutSlot) => {
    const target = { ...ui, slot: id }, worn = slotItem(profile, target), Icon = icons[id];
    const slotLocked = id === 'extra' && !hasItemAccess(profile, EXTRA_SLOT_ID);
    const selected = ui.slot === id && ui.view !== 'home';
    const timer = worn && !slotLocked ? profile.rentals[worn.id] ?? 0 : 0;
    return <MenuButton type="button" key={id} data-loadout-slot={id} aria-current={selected ? 'true' : undefined} className={selected ? 'selected' : ''} onClick={() => openSlot(id)}><Icon size={19} aria-hidden="true" /><span><small>{slotLabel(id)}</small><strong>{id === 'supplies' ? `${packed} packed` : slotLocked ? 'Not rented' : worn ? <TierLabel tier={worn.tier}>{worn.name}</TierLabel> : 'Empty'}</strong>{timer > 0 && <small>{rentalTimeLeft(timer)}</small>}</span><ChevronRight size={15} aria-hidden="true" /></MenuButton>;
  };
  const confirmEquip = () => { if (item) transact(() => store.equipLoadout(item.id, ui), 'home'); };
  const confirmRental = () => {
    if (!item) return;
    transact(() => store.buyLoadout(item.id, term, !renew && equipAfter && item.id !== EXTRA_SLOT_ID ? ui : undefined), item.id === EXTRA_SLOT_ID ? 'browse' : equipAfter && !renew ? 'home' : 'detail');
  };
  const confirmSupply = () => { if (item) transact(() => { const changed = store.buyLoadout(item.id, undefined, ui, quantity); if (changed) setQuantity(1); return changed; }); };
  const actionButton = (action: ItemAction, footer = false) => <MenuButton type="button" variant="primary" className="loadout-primary" data-store-outcome {...(footer ? { 'data-footer-action': true } : action.attrs)} aria-pressed={action.pressed} disabled={action.disabled} onClick={action.run}>{action.label}</MenuButton>;

  let content: ReactNode, action: ItemAction | null = null;
  if (ui.view === 'catalog' && !tutorial && !inventory) content = <section className="loadout-stack">{title('Browse store')}<div className="loadout-embedded-catalog"><ArmoryShop store={sourceStore} nav={<></>} ownedOnly={ownedOnly} onOwnedOnlyChange={setOwnedOnly} onInspectItem={(i, family, vehicle) => catalogContext(i, family, vehicle, true)} onBrowseContext={catalogContext} /></div></section>;
  else if (ui.view === 'home' || !item && (ui.view === 'detail' || ui.view === 'rental')) content = inventory ? <Locker profile={profile} heading={heading} onOpen={openLockerItem} />
    : <section className="loadout-stack">
      <h2 ref={heading} tabIndex={-1}>Choose a slot to change</h2>
      <MenuButton type="button" data-browse-store className="loadout-catalog-link" onClick={() => go('catalog')}><ShoppingBag size={20} /><span><strong>Browse store</strong><small>Every weapon, armor, supply and cosmetic</small></span><ChevronRight size={17} /></MenuButton>
    </section>;
  else if (ui.view === 'extra') {
    action = { label: <>Choose slot rental <ArrowRight size={16} /></>, run: () => rental(false, true), attrs: { 'data-choose-slot-rental': true } };
    content = <section className="loadout-stack">{title('Extra main weapon slot')}<div className="loadout-panel loadout-stack"><Layers2 size={32} aria-hidden="true" /><p>Carry a second main weapon from a different platform. Both weapons and their ammunition add weight.</p><strong><ItemPrice item={itemById(EXTRA_SLOT_ID)!} /></strong>{actionButton(action)}</div></section>;
  } else if (ui.view === 'browse') {
    const vehicleTabs = ui.slot === 'vehicleSkin', tabbed = hasPlatformTabs || vehicleTabs;
    content = <section className="loadout-stack">{title(`${inventory ? 'Your' : 'Choose'} ${slotLabel(ui.slot).toLowerCase()}`)}
      {expiredExtra && !inventory ? <div className="loadout-notice"><p>Your extra slot rental has expired. Your main weapon remains equipped.</p><MenuButton onClick={() => go('extra')}>Rent extra slot</MenuButton></div> : <>
        {ui.slot === 'supplies' && <p>Only packed supplies come with you, and each use is spent.</p>}
        {ui.slot === 'extra' && !expiredExtra && <div className="loadout-actions"><MenuButton data-store-outcome onClick={() => transact(() => store.selectCarrySlot('extra', null), 'home')}>Leave extra slot empty</MenuButton><MenuButton onClick={() => rental(true, true)}>Extend slot · {rentalTimeLeft(profile.rentals[EXTRA_SLOT_ID])}</MenuButton></div>}
        {ui.slot === 'extra' && !expiredExtra && <details><summary>Manage slot rental</summary><DiscardRental name="Extra main weapon slot" remainingMs={profile.rentals[EXTRA_SLOT_ID]} onDiscard={() => store.discardWeaponRental(EXTRA_SLOT_ID)} /></details>}
        {inventory && expiredExtra && <div className="loadout-notice">Your extra main slot is not rented.<MenuButton onClick={() => changeMode('store')}>Rent it in Store</MenuButton></div>}
        {hasPlatformTabs && <PlatformTabs label="Weapon platform" idPrefix="loadout-platform" controls="loadout-platform-items" value={ui.family} onChange={family => setUi(u => ({ ...u, family }))} options={platforms} describedBy={option => option.note ? 'loadout-platform-in-use' : undefined} />}
        {vehicleTabs && <PlatformTabs label="Vehicle" idPrefix="loadout-vehicle" controls="loadout-platform-items" value={ui.vehicle} onChange={vehicle => setUi(u => ({ ...u, vehicle }))} options={vehicles} />}
        {(ui.slot === 'supplies' || !inventory) && <div className="equipment-toolbar">
          {ui.slot === 'supplies' && <label className="loadout-field">Supply type<MenuSelect value={ui.supplyType} onChange={e => setUi(u => ({ ...u, supplyType: e.target.value as Selection['supplyType'] }))}>{supplyTypes.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</MenuSelect></label>}
          {!inventory && <OwnedFilter pressed={ownedOnly} onChange={setOwnedOnly} />}
        </div>}
        <div className="loadout-items" id="loadout-platform-items" role={tabbed ? 'tabpanel' : undefined} aria-labelledby={tabbed ? hasPlatformTabs ? `loadout-platform-${ui.family}` : `loadout-vehicle-${ui.vehicle}` : undefined}>
          {hasPlatformTabs && ui.family === otherMainFamily && <p id="loadout-platform-in-use" className="loadout-platform-notice">Equipped in your other main slot. Choose a different platform here.</p>}
          {!items.length && (inventory ? <div className="loadout-empty"><Package size={28} aria-hidden="true" /><h3>No {ui.slot === 'supplies' ? 'supplies in stock' : 'gear here yet'}</h3><MenuButton onClick={() => changeMode('store')}>Browse in Store</MenuButton></div>
            : <div className="loadout-empty"><h3>You don’t own anything here yet</h3><MenuButton onClick={() => setOwnedOnly(false)}>Show all</MenuButton></div>)}
          {!!items.length && <div className="equipment-grid">{items.map(i => <EquipmentCard key={i.id} item={i} family={i.family ?? ui.family} vehicle={ui.vehicle} data-inventory-item={inventory ? i.id : undefined} data-item={i.id}
            status={itemStatus(profile, i, i.category !== 'consumable' && current?.id === i.id && isInLocker(profile, i))} onClick={() => inspect(i)} />)}</div>}
        </div>
      </>}
    </section>;
  } else if (ui.view === 'detail' && item) {
    const supply = item.category === 'consumable', held = profile.consumables[item.id] ?? 0, full = held >= consumableLimit(item), locked = !available && level.level < (item.requiredLevel ?? 1);
    const status = itemStatus(profile, item, !!equipped && !supply), carried = isSupplyCarried(profile, item.id);
    const short = !inventory && supply && item.price * quantity > profile[item.currency];
    const pack: ItemAction = { label: carried ? 'Packed · Leave in locker' : 'Pack owned stock', run: () => transact(() => store.bringSupply(item.id, !carried)), disabled: !held, pressed: carried, attrs: { 'data-pack-supply': true } };
    action = inventory && !available ? { label: 'View in Store', run: () => changeMode('store'), attrs: { 'data-view-in-store': true } }
      : supply ? inventory ? pack : { label: full ? 'Stock full' : locked ? `Unlocks at level ${item.requiredLevel}` : <>Buy & pack {quantity} · {priceLabel(item, item.price * quantity)}</>, run: confirmSupply, disabled: locked || full || held + quantity > consumableLimit(item) || short, attrs: { 'data-buy-supply': true } }
      : locked ? { label: `Unlocks at level ${item.requiredLevel}`, run: () => {}, disabled: true, attrs: {} }
      : available ? { label: equipped ? <><Check size={17} /> Equipped</> : 'Equip now', run: confirmEquip, disabled: !!equipped || !!equipError, attrs: { 'data-equip-item': true } }
      : { label: <>Choose rental duration <ArrowRight size={17} /></>, run: () => rental(), attrs: { 'data-choose-rental': true } };
    const buy = inventory && !available ? <div className="loadout-stack"><p>You don’t have this item. Your equipped gear is unchanged.</p>{actionButton(action)}<MenuButton onClick={() => go('browse')}>Show what I have instead</MenuButton></div>
      : supply ? <div className="loadout-stack">
        {inventory ? <div className="loadout-actions">{actionButton(action)}<MenuButton data-view-in-store onClick={() => changeMode('store')}>Buy more in Store</MenuButton></div>
          : <><div className="loadout-actions loadout-buy-row"><label className="loadout-field">Quantity · {held} of {consumableLimit(item)} held<MenuSelect aria-label="Supply quantity" value={Math.min(quantity, Math.max(1, consumableLimit(item) - held))} disabled={full} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: Math.max(1, consumableLimit(item) - held) }, (_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}</MenuSelect></label>{actionButton(action)}</div>
            {short && <p className="loadout-warning">Need {priceLabel(item, item.price * quantity - profile[item.currency])} more.</p>}
            <MenuButton type="button" data-store-outcome data-pack-supply disabled={pack.disabled} aria-pressed={pack.pressed} onClick={pack.run}>{pack.label}</MenuButton>
            <small>Buying packs all your stock of this item.</small></>}
      </div>
      : <div className="loadout-stack">
        {locked && <div className="loadout-notice"><p>Reach level {item.requiredLevel} to rent this. You are level {level.level}: {Math.max(0, xpForLevel(item.requiredLevel ?? 1) - profile.xp).toLocaleString()} XP to go, or <StoreMoney amount={skipCostFrom(profile.xp, item.requiredLevel ?? 1)} currency="tokens" /> of levels. The rental is priced separately.</p></div>}
        {equipError && !locked && <div className="loadout-notice loadout-warning">{equipError}{expiredExtra && <MenuButton onClick={() => go('extra')}>Rent extra slot</MenuButton>}</div>}
        {!locked && item.category === 'weapon' && item.family !== SIDEARM_FAMILY && hasItemAccess(profile, EXTRA_SLOT_ID) && <label className="loadout-field">Equip in<MenuSelect aria-label="Equip destination" value={ui.slot} onChange={e => setUi(u => ({ ...u, slot: e.target.value as 'main' | 'extra' }))}><option value="main">Main weapon</option><option value="extra">Extra main</option></MenuSelect></label>}
        <div className="loadout-actions">{actionButton(action)}{profile.rentals[item.id] > 0 && <MenuButton data-extend-rental onClick={() => rental(true)}>Extend rental</MenuButton>}</div>
        {!equipped && !locked && <small>Replaces {current?.name ?? 'the empty slot'} in your {slotLabel(ui.slot).toLowerCase()}.</small>}
        {profile.rentals[item.id] > 0 && <details><summary>Manage rental</summary><DiscardRental key={item.id} name={item.name} remainingMs={profile.rentals[item.id]} onDiscard={() => store.discardWeaponRental(item.id)} /></details>}
      </div>;
    content = <section className="loadout-stack">
      <div className="loadout-section-heading">{backButton('browse')}</div>
      <div className="loadout-item-hero">
        <div className="loadout-item-head"><h2 ref={heading} tabIndex={-1}><TierLabel tier={item.tier}>{item.name}</TierLabel></h2><div className="loadout-item-meta"><span className={`equipment-status is-${status.tone}`}>{status.tone === 'equipped' && <Check size={13} aria-hidden="true" />}{status.label}</span><span className="loadout-item-price"><TierLabel tier={item.tier} /> · <ItemPrice item={item} /></span></div></div>
        <div className="loadout-item-preview"><ArmoryPreview item={item} weapon={dossierWeapon(item, profile, ui.family)} vehicle={ui.vehicle} /></div>
        <div className="loadout-item-buy loadout-stack">{buy}<p>{item.description}</p></div>
      </div>
      <LoadoutComparison item={item} profile={profile} target={ui} />
      <LoadoutSpecifications item={item} profile={profile} target={ui} />
    </section>;
  } else if (ui.view === 'rental' && item) {
    const extra = item.id === EXTRA_SLOT_ID, cost = weaponTermPrice(item, term), short = Math.max(0, cost - profile[item.currency]);
    const blocked = !renew && equipAfter && !extra ? equipError : null;
    action = { label: <>{renew ? 'Extend' : extra ? 'Rent slot' : equipAfter ? 'Rent & equip' : 'Rent to locker'} · {priceLabel(item, cost)}</>, run: confirmRental, disabled: short > 0 || !!blocked || level.level < (item.requiredLevel ?? 1), attrs: { 'data-confirm-rental': true } };
    content = <section className="loadout-stack">{title(<>{renew ? 'Extend' : 'Rent'} <TierLabel tier={item.tier}>{item.name}</TierLabel></>, rentalBack)}<div className="loadout-panel loadout-stack"><h3>Play time</h3><div className="loadout-terms">{WEAPON_TERMS.map(option => <MenuButton type="button" key={option.id} data-rental-term={option.id} aria-pressed={term === option.id} onClick={() => setTerm(option.id)}><strong>{option.label}</strong><span>{priceLabel(item, weaponTermPrice(item, option.id))}</span>{weaponTermSavings(item, option.id) > 0 && <small>Save {priceLabel(item, weaponTermSavings(item, option.id))}</small>}</MenuButton>)}</div><p>The timer runs only during active play, never in menus, while paused or offline. No automatic charges.</p><div><div className="loadout-line"><span>Cost</span><strong>{priceLabel(item, cost)}</strong></div><div className="loadout-line"><span>Balance after</span><strong>{short ? 'Not enough funds' : priceLabel(item, profile[item.currency] - cost)}</strong></div></div>
      {renew ? <p>Adds {WEAPON_TERMS.find(t => t.id === term)!.label} to {rentalTimeLeft(profile.rentals[item.id] ?? 0)}. Equipped gear stays unchanged.</p> : extra ? <div className="loadout-notice">The slot does not include a weapon. Choose a different main weapon next.</div> : <label className="loadout-checkbox"><input type="checkbox" checked={equipAfter} onChange={e => setEquipAfter(e.target.checked)} />Equip in {slotLabel(ui.slot).toLowerCase()} after renting{equipAfter ? ` (replaces ${current?.name ?? 'the empty slot'})` : ''}</label>}
      {(short > 0 || blocked) && <p role="alert" className="loadout-warning">{blocked || <>You need {priceLabel(item, short)} more. Choose a shorter rental or use <TierLabel tier="Issued">issued</TierLabel> equipment.</>}</p>}
      <div className="loadout-actions"><MenuButton onClick={() => go(rentalBack)}>Cancel</MenuButton>{actionButton(action)}</div>
    </div></section>;
  }

  const tourStops = [
    ['Choose a slot', 'Pick the slot you want to change, or browse the whole store.'],
    ['Compare before spending', 'Pick a platform, then an item. Its figures compare with what the slot holds now.'],
    ['Rent by play time', 'Choose 1, 2 or 4 hours. The priced button completes the rental, and stays in the footer while you scroll.'],
    ['Pack and play', 'Pack supplies, check your carried weight in the footer, then press Play.'],
  ];
  const carriedKg = equipmentMovement(loadout, carry.main).totalKg;
  return <section ref={root} className="armory loadout-store" data-equipment-mode={mode} data-loadout-view={ui.view} aria-label="Loadout equipment" {...storeSoundEvents}>
    <div className="equipment-shell-nav"><MenuHeader className="loadout-header" action={headerAction} profile={<ProfileBanner store={sourceStore} />}>{nav}</MenuHeader>
    {onModeChange && <div className="equipment-view-bar"><MenuTabs aria-label="Equipment views" onKeyDown={event => tabNavigation(event, index => changeMode(index === 0 ? 'store' : 'inventory'))}>{(['store', 'inventory'] as const).map(view => <a key={view} id={`equipment-tab-${view}`} role="tab" aria-selected={mode === view} aria-controls="equipment-view-content" tabIndex={mode === view ? 0 : -1} href={`/${view}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); if (view !== mode) changeMode(view); else if (ui.view !== 'home') go('home'); }}>{view === 'store' ? <ShoppingBag size={17} /> : <Backpack size={17} />}{view === 'store' ? 'Store' : 'Inventory'}</a>)}</MenuTabs>{onHelp && <MenuButton className="store-tour-trigger" aria-label="Help: tour the store" title="Help: tour the store" aria-expanded={!!tutorial} aria-controls="equipment-help" onClick={onHelp}><CircleHelp size={20} aria-hidden="true" /><span className="equipment-help-label">Help</span></MenuButton>}</div>}</div>
    {tutorial && <section id="equipment-help" className="loadout-guide loadout-panel" aria-label="Store tour"><div><span className="loadout-eyebrow">Store tour · {tourStep + 1} / {tourStops.length}</span><h2>{tourStops[tourStep][0]}</h2><p>{tourStops[tourStep][1]}</p></div><div className="loadout-actions"><MenuButton onClick={tutorial.onExit}>Close tour</MenuButton><MenuButton disabled={tourStep === 0} onClick={() => setTourStep(n => n - 1)}>Back</MenuButton><MenuButton variant="primary" className="loadout-primary" onClick={() => tourStep === tourStops.length - 1 ? tutorial.onComplete() : setTourStep(n => n + 1)}>{tourStep === tourStops.length - 1 ? 'Finish tour' : 'Next'}</MenuButton></div></section>}
    {store.saveError && <div className="loadout-feedback loadout-warning" role="alert">Browser storage is unavailable. Purchases and equipment changes last for this session only.</div>}
    <div className={`loadout-feedback${store.message ? '' : ' is-empty'}`} role="status" aria-live="polite"><StoreMessage text={store.message} /></div>
    <div className={`loadout-workspace${ui.view === 'home' && !inventory ? ' is-home' : ''}${ui.view !== 'home' ? ' is-editing' : ''}`}><div className="loadout-content" id="equipment-view-content" role={onModeChange ? 'tabpanel' : undefined} aria-labelledby={onModeChange ? `equipment-tab-${mode}` : undefined}>{content}</div>
      <aside aria-labelledby="deployment-loadout-heading"><div className="loadout-slots"><h2 id="deployment-loadout-heading">Your loadout</h2>{slotGroups.map(group => <section key={group.label} aria-label={group.label} className="loadout-slot-group"><h3>{group.label}</h3>{group.slots.map(slotButton)}</section>)}</div></aside></div>
    <footer className="loadout-footer">
      <div className="loadout-readiness" role="group" aria-label="Readiness"><span className="loadout-weight"><Backpack size={16} aria-hidden="true" />{carriedKg.toFixed(1)} kg carried</span>
        {shortRentals.map(i => <MenuButton key={i.id} className="loadout-expiry" data-extend-short={i.id} aria-label={`${i.name} has ${rentalTimeLeft(profile.rentals[i.id])} of play time. Extend rental`} onClick={() => extendRental(i)}><AlertTriangle size={15} aria-hidden="true" /><span>{i.name}</span><strong>{rentalTimeLeft(profile.rentals[i.id])}</strong></MenuButton>)}</div>
      {action && actionButton(action, true)}
      <MenuButton variant={action ? 'secondary' : 'primary'} className={`loadout-play${action ? '' : ' loadout-primary'}`} data-loadout-play onClick={() => { go('home'); onPlay('play'); }}><Play size={16} aria-hidden="true" /> Play</MenuButton>
    </footer>
  </section>;
}

/** Inventory's single page: everything owned or rented, on the same four shelves as the slots. */
function Locker({ profile, heading, onOpen }: { profile: ArmoryProfile; heading: RefObject<HTMLHeadingElement | null>; onOpen: (item: ShopItem) => void }) {
  const loadout = resolveLoadout(profile), carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const owned = ARMORY_CATALOG.filter(i => !isEnemyIssue(i) && isInLocker(profile, i)).sort(byUnlock);
  const carriedSkin = (id: string) => loadout.carriedFamilies.filter(f => profile.guns[f].skin === id && isShopFamily(f));
  const vehiclesWearing = (id: string) => (Object.keys(vehicleNames) as MotorVehicleKind[]).filter(v => profile.vehicleSkins[v] === id);
  const wornSlot = (i: ShopItem): string | null => {
    if (i.category === 'weapon') return loadout.carriedFamilies.includes(i.family!) && profile.guns[i.family!].variant === i.id ? i.family === carry.main ? 'Main weapon' : i.family === carry.extra ? 'Extra main' : i.family === SIDEARM_FAMILY ? 'Sidearm' : null : null;
    if (i.category === 'skin') { const on = carriedSkin(i.id); return on.length ? `On ${on.map(f => FPS_WEAPONS[f].name).join(', ')}` : null; }
    if (i.category === 'vehicleSkin') { const on = vehiclesWearing(i.id); return on.length ? `On ${on.map(v => vehicleNames[v]).join(', ')}` : null; }
    if (i.category === 'rig' || i.category === 'plate' || i.category === 'vision') return profile[i.category] === i.id ? slotLabel(i.category) : null;
    return null;
  };
  const note = (i: ShopItem, worn: string | null) => worn ?? (i.category === 'weapon' ? FPS_WEAPONS[i.family!].name : i.category === 'consumable' ? `Up to ${consumableLimit(i)}` : i.category === 'loadout' ? 'Second main weapon' : i.category === 'skin' ? 'Weapon skin' : i.category === 'vehicleSkin' ? 'Vehicle skin' : slotLabel(i.category as LoadoutSlot));
  const rentalCount = owned.filter(i => !profile.owned.includes(i.id) && profile.rentals[i.id] > 0).length;
  return <section className="loadout-stack loadout-locker">
    <div><h2 ref={heading} tabIndex={-1}>Your locker</h2><p>{owned.length} items · {rentalCount} {rentalCount === 1 ? 'rental' : 'rentals'}</p></div>
    {lockerGroups.map(group => {
      const shelf = owned.filter(group.fits), id = `locker-${group.label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
      return shelf.length > 0 && <section key={group.label} className="loadout-stack loadout-locker-group" aria-labelledby={id}><h3 id={id}>{group.label}</h3>
        <div className="equipment-grid">{shelf.map(i => {
          const worn = wornSlot(i);
          return <EquipmentCard key={i.id} item={i} family={i.family ?? carriedSkin(i.id)[0] ?? carry.main} vehicle={vehiclesWearing(i.id)[0] ?? 'car'} data-item={i.id} data-inventory-item={i.id}
            status={itemStatus(profile, i, !!worn || i.id === EXTRA_SLOT_ID && carry.extra !== null)} note={note(i, worn)} onClick={() => onOpen(i)} />;
        })}</div>
      </section>;
    })}
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
