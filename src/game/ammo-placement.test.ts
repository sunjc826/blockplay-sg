import { expect, it } from 'vitest';
import { createAmmoPlacementQueue } from './ammo-placement';
import { createProfile, resolveLoadout } from './armory-state';
import { createPooledLoadout } from './ammo-pools';
import { addReserveMagazines } from './magazine-inventory';
const fixture = () => { const kit = resolveLoadout(createProfile()), states = createPooledLoadout(kit.weapons, kit.carriedFamilies); return { states, inventory: states[0].magazineInventory! }; };
it('does not animate spawn/travel baselines and queues only newly filled pouches', () => {
  const { states, inventory } = fixture(), queue = createAmmoPlacementQueue(); queue.observe(inventory);
  expect(queue.count).toBe(0);
  inventory.slots[0] = inventory.slots[3] = null; queue.observe(inventory);
  addReserveMagazines(states[0], 2); queue.observe(inventory, 'supply');
  expect(queue.hiddenSlots).toEqual([0, 3]); expect(queue.current?.source).toBe('supply');
  queue.observe(inventory); expect(queue.count).toBe(2);
  for (let n = 0; n < 9; n++) queue.step(.1, true);
  expect(queue.hiddenSlots).toEqual([3]); expect(inventory.slots[0]).toBeTruthy();
  queue.observe(structuredClone(inventory)); expect(queue.count).toBe(0);
});
it('cancelling presentation never removes collected ammo, and a reload invalidates the queued pouch', () => {
  const { states, inventory } = fixture(), queue = createAmmoPlacementQueue(); inventory.slots[0] = null; queue.observe(inventory);
  addReserveMagazines(states[0], 1); queue.observe(inventory); queue.step(.1, true); queue.step(.1, false);
  expect(queue.count).toBe(0); expect(inventory.slots[0]).toBeTruthy();
  inventory.slots[0] = null; queue.observe(inventory); addReserveMagazines(states[0], 1); queue.observe(inventory);
  inventory.slots[0] = null; queue.observe(inventory); expect(queue.count).toBe(0);
});
it('does not repeat the already animated carrier transfer', () => {
  const { states, inventory } = fixture(), queue = createAmmoPlacementQueue(); inventory.slots[0] = null; queue.observe(inventory);
  addReserveMagazines(states[0], 1); queue.observe(inventory, 'maid', 0); expect(queue.count).toBe(0);
  queue.observe(inventory); expect(queue.count).toBe(0);
});
