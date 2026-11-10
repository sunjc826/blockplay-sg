import type { SupplyType } from '../game/armory-catalog';
import type { LoadoutTarget } from '../game/loadout-store';

export type EquipmentMode = 'store' | 'inventory';
export type EquipmentView = 'home' | 'catalog' | 'browse' | 'detail' | 'rental' | 'extra' | 'review' | 'match';
export type EquipmentSelection = LoadoutTarget & { fromCatalog?: boolean; view: EquipmentView; item: string; supplyType: SupplyType | 'all' };
export type EquipmentSnapshot = { selection: EquipmentSelection; scroll: number };
export const isEquipmentRoute = (route: string): route is EquipmentMode => route === 'store' || route === 'inventory';
export function switchEquipmentView(current: EquipmentSelection, mode: EquipmentMode, saved?: EquipmentSnapshot) {
  const previous = saved?.selection;
  const sameContext = previous && current.slot === previous.slot && current.family === previous.family
    && current.vehicle === previous.vehicle && current.supplyType === previous.supplyType && current.item === previous.item;
  const restore = sameContext && (current.view === previous.view || current.view === 'browse' && previous.view === 'catalog');
  const selection = restore ? previous : { ...current, fromCatalog: false };
  const view = mode === 'inventory' && ['catalog', 'extra'].includes(selection.view) ? 'browse'
    : mode === 'inventory' && selection.view === 'rental' ? 'detail' : selection.view;
  return { selection: { ...selection, view, ...(mode === 'inventory' ? { fromCatalog: false } : {}) }, scroll: restore ? saved?.scroll : undefined };
}
