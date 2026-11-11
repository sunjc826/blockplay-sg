import type { ComponentProps, KeyboardEvent, ReactNode } from 'react';
import { Check, Layers2 } from 'lucide-react';
import type { ShopItem } from '../game/armory-catalog';
import { isSupplyCarried, variantSpec, type ArmoryProfile } from '../game/armory-state';
import { canRentEquipment, hasItemAccess, rentalTimeLeft, weaponTermPrice } from '../game/weapon-rentals';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import { visionSpec } from '../game/vision-devices';
import { progression } from '../game/progression';
import type { MotorVehicleKind } from '../game/vehicle-rules';
import { tabNavigation } from '../lib/tab-navigation';
import { MenuItemCard, MenuTabs } from './MenuControls';
import { StoreMoney, TierLabel } from './StoreLabels';
import './equipment-card.css';

/**
 * One card, one status vocabulary, one price format and one picker for every
 * equipment list: the slot browser, the catalog grid and the Inventory locker.
 */
export type ItemStatusTone = 'equipped' | 'rented' | 'owned' | 'locked' | 'available';
export type ItemStatus = { tone: ItemStatusTone; label: string };

/** Usable now: supplies in stock, or gear that is owned or rented. */
export const isInLocker = (profile: ArmoryProfile, item: ShopItem) =>
  item.category === 'consumable' ? (profile.consumables[item.id] ?? 0) > 0 : hasItemAccess(profile, item.id);

export function itemStatus(profile: ArmoryProfile, item: ShopItem, equipped: boolean): ItemStatus {
  const locked = progression(profile.xp).level < (item.requiredLevel ?? 1);
  const required: ItemStatus = { tone: 'locked', label: `Level ${item.requiredLevel} required` };
  if (item.category === 'consumable') {
    const held = profile.consumables[item.id] ?? 0, packed = isSupplyCarried(profile, item.id);
    if (held) return { tone: packed ? 'equipped' : 'owned', label: `${held} in stock · ${packed ? 'Packed' : 'In locker'}` };
    return locked ? required : { tone: 'available', label: 'None in stock' };
  }
  const rental = profile.owned.includes(item.id) ? 0 : profile.rentals[item.id] ?? 0;
  const time = rental > 0 ? rentalTimeLeft(rental) : '';
  if (equipped) return { tone: 'equipped', label: time ? `Equipped · ${time}` : 'Equipped' };
  if (time) return { tone: 'rented', label: `Rented · ${time}` };
  if (hasItemAccess(profile, item.id)) return { tone: 'owned', label: 'Owned' };
  return locked ? required : { tone: 'available', label: canRentEquipment(item) ? 'For rent' : 'Available' };
}

/** Prices read the same everywhere: per unit for supplies, per hour of play for rentals. */
export function ItemPrice({ item }: { item: ShopItem }) {
  if (item.category === 'consumable') return <><StoreMoney amount={item.price} currency={item.currency} /> each</>;
  if (canRentEquipment(item)) return <>From <StoreMoney amount={weaponTermPrice(item, '1h')} currency={item.currency} /> / play hour</>;
  return <>Free</>;
}

/** The grid card's one-line summary of a device. */
export function visionTag(id: string) {
  const spec = visionSpec(id);
  return !spec ? 'Naked eye' : spec.kind === 'iff' ? `IFF · ${spec.iff?.range ?? 0} m` : spec.kind === 'nvg' ? `Gen ${spec.generation} · ${spec.gain.toFixed(1)}× gain${spec.iff ? ' · IFF' : ''}` : `Thermal · ${spec.rows} lines`;
}

const supplyKinds = { food: 'Food', medical: 'Recovery', 'field-utility': 'Field utility', grenade: 'Grenade' } as const;
function itemSummary(item: ShopItem) {
  switch (item.category) {
    case 'weapon': return `${variantSpec(item)?.damage ?? 0} damage`;
    case 'plate': return `${item.protection ?? 0} AP`;
    case 'rig': return `${6 + Math.ceil((item.carry ?? 0) / 30)} magazine pouches`;
    case 'vision': return visionTag(item.id);
    case 'consumable': return supplyKinds[item.supplyType ?? 'medical'];
    case 'loadout': return 'Carry slot';
    default: return 'Cosmetic';
  }
}

type CardProps = Omit<ComponentProps<'button'>, 'children'> & {
  item: ShopItem; status: ItemStatus; family?: number; vehicle?: MotorVehicleKind; selected?: boolean;
  /** Replaces the price line, e.g. where an owned item is equipped. */
  note?: ReactNode;
};
export function EquipmentCard({ item, status, family = 0, vehicle = 'car', selected = false, note, className = '', ...props }: CardProps) {
  return <MenuItemCard {...props} className={`equipment-card${selected ? ' selected' : ''} ${className}`.trim()} data-tier={item.tier.toLowerCase()}>
    {item.category === 'loadout'
      ? <span className="equipment-card-art" aria-hidden="true"><Layers2 size={40} /></span>
      : <img className="equipment-card-art" src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(item, family, vehicle)}`} alt="" width={480} height={240} loading="lazy" decoding="async" />}
    <span className="equipment-card-body">
      <small className="equipment-card-kind"><TierLabel tier={item.tier} /> · {itemSummary(item)}</small>
      <strong className="equipment-card-name">{item.name}</strong>
      <span className={`equipment-status is-${status.tone}`}>{status.tone === 'equipped' && <Check size={13} aria-hidden="true" />}{status.label}</span>
      <small className="equipment-card-price">{note ?? <ItemPrice item={item} />}</small>
    </span>
  </MenuItemCard>;
}

/** The narrowing toggle shared by the slot browser and the catalog. */
export function OwnedFilter({ pressed, onChange }: { pressed: boolean; onChange: (pressed: boolean) => void }) {
  return <button type="button" className="ui-button ui-button-secondary equipment-owned-filter" data-owned-filter aria-pressed={pressed} onClick={() => onChange(!pressed)}>
    <span className="equipment-owned-box" aria-hidden="true">{pressed && <Check size={13} />}</span>Owned only
  </button>;
}

export type PickerOption<T extends string | number> = { id: T; name: string; note?: string };
/** Weapon platforms and vehicles: a roving-focus tablist that labels the panel it filters. */
export function PlatformTabs<T extends string | number>({ label, options, value, onChange, idPrefix, controls, describedBy }: {
  label: string; options: readonly PickerOption<T>[]; value: T; onChange: (value: T) => void; idPrefix: string; controls: string; describedBy?: (option: PickerOption<T>) => string | undefined;
}) {
  const keys = (event: KeyboardEvent<HTMLElement>) => tabNavigation(event, index => onChange(options[index].id));
  return <MenuTabs className="equipment-picker" aria-label={label} onKeyDown={keys}>{options.map(option =>
    <button type="button" role="tab" key={option.id} id={`${idPrefix}-${option.id}`} data-platform={option.id} aria-controls={controls} aria-selected={value === option.id}
      aria-describedby={value === option.id ? describedBy?.(option) : undefined} tabIndex={value === option.id ? 0 : -1} onClick={() => onChange(option.id)}>
      <span>{option.name}</span>{option.note && <small className="equipment-picker-note">{option.note}</small>}
    </button>)}
  </MenuTabs>;
}
