import { describe, expect, it } from 'vitest';
import { knownEquipmentView, switchEquipmentView, type EquipmentSelection } from './equipment-navigation';
const selection: EquipmentSelection = { view: 'browse', slot: 'main', family: 1, vehicle: 'car', item: '', supplyType: 'all' };
describe('shared equipment navigation', () => {
  it('preserves the selected slot, platform and item, including an unowned item', () => {
    const detail = { ...selection, view: 'detail' as const, item: 'sar-vanguard' };
    expect(switchEquipmentView(detail, 'inventory').selection).toEqual({ ...detail, fromCatalog: false });
  });
  it('restores the previous Store position for the same context', () => {
    expect(switchEquipmentView(selection, 'store', { selection, scroll: 420 }).scroll).toBe(420);
  });
  it('carries a newly chosen category or platform across instead of restoring stale Store state', () => {
    const changed = { ...selection, slot: 'supplies' as const, supplyType: 'food' as const };
    const result = switchEquipmentView(changed, 'store', { selection, scroll: 420 });
    expect(result.selection.slot).toBe('supplies'); expect(result.selection.supplyType).toBe('food'); expect(result.scroll).toBeUndefined();
    expect(switchEquipmentView({ ...selection, family: 2 }, 'store', { selection, scroll: 420 }).selection.family).toBe(2);
  });
  it('maps the traditional catalog to Inventory browsing and returns to the saved catalog', () => {
    const catalog = { ...selection, view: 'catalog' as const };
    const inventory = switchEquipmentView(catalog, 'inventory').selection;
    expect(inventory.view).toBe('browse');
    expect(switchEquipmentView(inventory, 'store', { selection: catalog, scroll: 700 })).toEqual({ selection: catalog, scroll: 700 });
  });
  it('keeps a category opened from the shared home open in Store', () => {
    expect(switchEquipmentView(selection, 'store', { selection: { ...selection, view: 'home' }, scroll: 0 }).selection.view).toBe('browse');
  });
  it('leaves a pending rental at item details without confirming it', () => {
    expect(switchEquipmentView({ ...selection, view: 'rental', item: 'sar-ranger' }, 'inventory').selection.view).toBe('detail');
  });
  it('keeps the shared home in place; it is the locker in Inventory and the slots in Store', () => {
    expect(switchEquipmentView({ ...selection, view: 'home' }, 'inventory').selection.view).toBe('home');
    expect(switchEquipmentView({ ...selection, view: 'home' }, 'store').selection.view).toBe('home');
  });
  it('returns an item opened from the locker to the slot list in Store', () => {
    const fromLocker = { ...selection, view: 'detail' as const, item: 'sar-issued', fromLocker: true };
    expect(switchEquipmentView(fromLocker, 'store').selection.fromLocker).toBeUndefined();
    expect(switchEquipmentView(fromLocker, 'inventory').selection.fromLocker).toBe(true);
  });
  it('sends retired review and match steps home', () => {
    for (const view of ['review', 'match']) expect(knownEquipmentView({ ...selection, view } as unknown as EquipmentSelection).view).toBe('home');
    expect(knownEquipmentView(selection)).toBe(selection);
  });
});
