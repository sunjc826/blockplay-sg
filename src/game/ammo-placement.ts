import type { MagazineInventory, RigMagazine } from './magazine-inventory';
export type AmmoPlacementSource = 'pickup' | 'supply' | 'pack' | 'maid';
export interface AmmoPlacement { slot: number; magazine: RigMagazine; source: AmmoPlacementSource; progress: number }
export const AMMO_PLACEMENT_SECONDS = .85;
/** Presentation only. Inventory remains authoritative, including on cancellation.
 * A new inventory is a spawn/travel baseline, never a pickup of every pouch. */
export function createAmmoPlacementQueue() {
  let inventory: MagazineInventory | undefined, previous: (RigMagazine | null)[] = [], queue: AmmoPlacement[] = [];
  return {
    observe(next: MagazineInventory | undefined, source: AmmoPlacementSource = 'pickup', skipSlot = -1) {
      if (next !== inventory) { inventory = next; previous = next?.slots.slice() ?? []; queue = []; return; }
      if (!next) return;
      next.slots.forEach((mag, slot) => {
        if (mag && !previous[slot] && slot !== skipSlot) queue.push({ slot, magazine: mag, source, progress: 0 });
      });
      previous = next.slots.slice();
      queue = queue.filter(p => next.slots[p.slot] === p.magazine);
    },
    step(dt: number, allowed: boolean) {
      if (!allowed) { queue = []; return; }
      const current = queue[0]; if (!current) return;
      current.progress = Math.min(1, current.progress + Math.max(0, Math.min(.1, dt)) / AMMO_PLACEMENT_SECONDS);
      if (current.progress >= 1) queue.shift();
    },
    clear() { queue = []; },
    get current() { return queue[0]; },
    get hiddenSlots() { return queue.map(p => p.slot); },
    get count() { return queue.length; },
  };
}
