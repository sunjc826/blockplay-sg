import type { SupplyType } from '../game/armory-catalog';
import type { LoadoutTarget } from '../game/loadout-store';

export type EquipmentMode = 'store' | 'inventory';
export const EQUIPMENT_VIEWS = ['home', 'catalog', 'browse', 'detail', 'rental', 'extra'] as const;
export type EquipmentView = typeof EQUIPMENT_VIEWS[number];
/** `fromCatalog` / `fromLocker` record where an open item came from, so Back returns there. */
export type EquipmentSelection = LoadoutTarget & { fromCatalog?: boolean; fromLocker?: boolean; view: EquipmentView; item: string; supplyType: SupplyType | 'all' };
export type EquipmentSnapshot = { selection: EquipmentSelection; scroll: number };
export const isEquipmentRoute = (route: string): route is EquipmentMode => route === 'store' || route === 'inventory';
/** Session memory can hold views that no longer exist (the retired review and match steps). */
export const knownEquipmentView = (selection: EquipmentSelection): EquipmentSelection =>
  (EQUIPMENT_VIEWS as readonly string[]).includes(selection.view) ? selection : { ...selection, view: 'home' };
export function switchEquipmentView(current: EquipmentSelection, mode: EquipmentMode, saved?: EquipmentSnapshot) {
  const previous = saved?.selection;
  const sameContext = previous && current.slot === previous.slot && current.family === previous.family
    && current.vehicle === previous.vehicle && current.supplyType === previous.supplyType && current.item === previous.item;
  const restore = sameContext && (current.view === previous.view || current.view === 'browse' && previous.view === 'catalog');
  const selection = restore ? previous : { ...current, fromCatalog: false };
  const view = mode === 'inventory' && ['catalog', 'extra'].includes(selection.view) ? 'browse'
    : mode === 'inventory' && selection.view === 'rental' ? 'detail' : selection.view;
  // The locker exists only in Inventory; the catalog only in Store.
  return { selection: { ...selection, view, ...(mode === 'inventory' ? { fromCatalog: false } : { fromLocker: undefined }) }, scroll: restore ? saved?.scroll : undefined };
}
