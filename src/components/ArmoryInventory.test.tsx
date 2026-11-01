import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ArmoryInventory from './ArmoryInventory';
import { createProfile, equip, purchase, spendRentalTime } from '../game/armory-state';
import type { ArmoryStore } from '../game/use-armory';
const store = (profile: ReturnType<typeof createProfile>) => ({ profile, equipItem: vi.fn(), selectCarrySlot: vi.fn(), buy: vi.fn(), saveError: false, message: '' }) as unknown as ArmoryStore;
it('lists issued and rented weapons with play time, without showing locked shop stock', () => {
  const profile = equip(purchase({ ...createProfile(), xp: 50000 }, 'sar-vanguard').profile, 'sar-vanguard', 0);
  const html = renderToStaticMarkup(<ArmoryInventory store={store(profile)} nav={<span>Inventory</span>} />);
  expect(html).toContain('data-inventory-item="sar-issued"'); expect(html).toContain('data-inventory-item="sar-vanguard"');
  expect(html).not.toContain('data-inventory-item="sar-marksman"'); expect(html).toContain('1h 0m left');
  expect(html).toContain('data-discard-rental'); expect(html).not.toContain('Discard rental SAR 21 · BMT');
  expect(html).toContain('Equipped'); expect(html).toContain('Rental clock paused'); expect(html).toContain('Supplies');
});
it('reflects played time and removes expired leases from inventory', () => {
  const profile = purchase({ ...createProfile(), xp: 50000 }, 'sar-vanguard').profile;
  const played = spendRentalTime(profile, 15 * 60000);
  expect(renderToStaticMarkup(<ArmoryInventory store={store(played)} nav={null} />)).toContain('45m left');
  const expired = spendRentalTime(played, 3600000);
  expect(renderToStaticMarkup(<ArmoryInventory store={store(expired)} nav={null} />)).not.toContain('data-inventory-item="sar-vanguard"');
});
