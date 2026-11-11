import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LoadoutStore from './LoadoutStore';
import { createProfile } from '../game/armory-state';
import type { ArmoryStore } from '../game/use-armory';
const screen = vi.hoisted(() => ({ view: 'detail', slot: 'main', family: 0, vehicle: 'car', item: 'sar-vanguard', supplyType: 'all' }));
vi.mock('../lib/screen-state', () => ({ useScreenState: (key: string, initial: unknown) => [key === 'loadout-store.selection' ? screen : initial, vi.fn()] }));
vi.mock('./ArmoryPreview', () => ({ default: ({ item }: { item: { id: string } }) => <div data-preview={item.id}>3D preview</div> }));
const store: ArmoryStore = { profile: createProfile(), equipLoadout: vi.fn(), buyLoadout: vi.fn(), bringSupply: vi.fn(), selectCarrySlot: vi.fn(), buy: vi.fn(), buyFromVendor: vi.fn(), buyLevel: vi.fn(), wearRankSet: vi.fn(), setEncikTone: vi.fn(), equipItem: vi.fn(), award: vi.fn(), awardElimination: vi.fn(), consume: vi.fn(), demoTopUp: vi.fn(), discardWeaponRental: vi.fn(), advanceRentalTime: vi.fn(), demoCreditTopUp: vi.fn(), message: '', saveError: false };
const render = () => renderToStaticMarkup(<LoadoutStore store={store} nav={<span>Store</span>} onPlay={vi.fn()} />);
beforeEach(() => Object.assign(screen, { view: 'detail', slot: 'main', family: 0, item: 'sar-vanguard' }));
it('exposes the model, full comparison, charts and build details without disclosures', () => {
  const html = render();
  expect(html).toContain('data-preview="sar-vanguard"');
  expect(html).toContain('Recoil recovery');
  expect(html).toContain('Damage against range');
  expect(html).toContain('Spray pattern');
  expect(html).toContain('+14 damage');
  expect(html).toContain('15ms quicker between shots');
  expect(html).toContain('On the model: a noticeably thicker barrel');
  expect(html).toContain('Specifications &amp; equipment details</h3>');
  expect(html).not.toContain('Inspect 3D model</summary>');
  expect(html).not.toContain('Full specifications');
  expect(html.indexOf('Reach level')).toBeLessThan(html.indexOf('class="loadout-comparison"'));
});
it('provides a platform tablist with one focusable active tab and its labeled panel', () => {
  screen.view = 'browse';
  const html = render();
  const platforms = html.match(/<div\b[^>]*aria-label="Weapon platform"[^>]*>/)?.[0];
  expect(platforms).toContain('role="tablist"');
  expect(html).toContain('id="loadout-platform-0"');
  expect(html).toContain('aria-selected="true" tabindex="0"');
  expect(html).toContain('role="tabpanel" aria-labelledby="loadout-platform-0"');
  expect(html).not.toContain('<select aria-label="Weapon platform"');
});
it('shows device controls and calibration alongside the vision comparison', () => {
  Object.assign(screen, { slot: 'vision', item: 'thermal-t1' });
  const html = render();
  expect(html).toContain('Sensor lines'); expect(html).toContain('Sharpness');
  expect(html).toContain('N switches it on'); expect(html).toContain('recalibrate');
  expect(html).toContain('through smoke but not glass');
});
it('shows supply effects and use instructions directly on the page', () => {
  Object.assign(screen, { slot: 'supplies', item: 'kit-bandage' });
  const html = render();
  expect(html).toContain('What one use restores');
  expect(html).toContain('Hold F to choose recovery items');
  expect(html).toContain('data-buy-supply');
});
it('keeps the unowned Store selection in Inventory with a contextual return action', () => {
  const html = renderToStaticMarkup(<LoadoutStore store={store} mode="inventory" onModeChange={vi.fn()} nav={<span>Loadout</span>} onPlay={vi.fn()} />);
  expect(html).toContain('You don’t have this item');
  expect(html).toContain('data-view-in-store'); expect(html).not.toContain('data-confirm-rental');
  expect(html).toContain('id="equipment-tab-inventory" role="tab" aria-selected="true"');
});
it('filters Inventory to accessible equipment while Store retains the full listing', () => {
  screen.view = 'browse';
  const html = renderToStaticMarkup(<LoadoutStore store={store} mode="inventory" nav={<span>Loadout</span>} onPlay={vi.fn()} />);
  expect(html).toContain('data-item="sar-issued"'); expect(html).not.toContain('data-item="sar-vanguard"');
  expect(render()).toContain('data-item="sar-vanguard"');
});
it('uses the full shared details and renewal controls for rented Inventory equipment', () => {
  const rented = { ...store, profile: { ...store.profile, rentals: { 'sar-vanguard': 3600000 } } };
  const html = renderToStaticMarkup(<LoadoutStore store={rented} mode="inventory" nav={<span>Loadout</span>} onPlay={vi.fn()} />);
  expect(html).toContain('data-extend-rental'); expect(html).toContain('Recoil recovery'); expect(html).toContain('data-discard-rental');
});
it('offers packing owned Inventory supplies and a contextual Store shortcut', () => {
  Object.assign(screen, { slot: 'supplies', item: 'kit-bandage' });
  const held = { ...store, profile: { ...store.profile, consumables: { 'kit-bandage': 2 } } };
  const html = renderToStaticMarkup(<LoadoutStore store={held} mode="inventory" nav={<span>Loadout</span>} onPlay={vi.fn()} />);
  expect(html).toContain('data-pack-supply'); expect(html).toContain('Buy more in Store'); expect(html).not.toContain('data-buy-supply');
});
it('repeats the open item’s primary action in the sticky footer beside Play, with no stepper', () => {
  const rentable = { ...store, profile: { ...store.profile, xp: 1_000_000 } };
  const html = renderToStaticMarkup(<LoadoutStore store={rentable} nav={<span>Store</span>} onPlay={vi.fn()} />);
  const footer = html.slice(html.indexOf('<footer'));
  expect(html).toContain('data-choose-rental');
  expect(footer).toContain('data-footer-action'); expect(footer).toContain('Choose rental duration');
  expect(footer).toContain('data-loadout-play'); expect(footer).toContain('kg carried');
  expect(html).not.toContain('Review loadout'); expect(html).not.toContain('Choose match'); expect(html).not.toContain('data-choose-match');
  // The action sits in the hero, before the comparison and specifications.
  expect(html.indexOf('data-choose-rental')).toBeLessThan(html.indexOf('class="loadout-comparison"'));
  expect(html.match(/Rental timers paused/g)).toBeNull();
});
it('warns in the footer when an equipped rental has under 15 minutes left', () => {
  Object.assign(screen, { view: 'home', item: '' });
  const profile = { ...store.profile, xp: 1_000_000, rentals: { 'sar-ranger': 10 * 60_000 }, guns: store.profile.guns.map((gun, i) => i === 0 ? { ...gun, variant: 'sar-ranger' } : gun) };
  const html = renderToStaticMarkup(<LoadoutStore store={{ ...store, profile }} nav={<span>Store</span>} onPlay={vi.fn()} />);
  const footer = html.slice(html.indexOf('<footer'));
  expect(footer).toContain('data-extend-short="sar-ranger"'); expect(footer).toContain('10m left');
  expect(footer).not.toContain('data-footer-action');
});
it('lists everything owned in Inventory on one grouped locker page', () => {
  Object.assign(screen, { view: 'home', item: '' });
  const profile = { ...store.profile, xp: 1_000_000, rentals: { 'sar-ranger': 3_600_000 }, consumables: { 'kit-bandage': 2 } };
  const html = renderToStaticMarkup(<LoadoutStore store={{ ...store, profile }} mode="inventory" nav={<span>Inventory</span>} onPlay={vi.fn()} />);
  for (const shelf of ['Weapons', 'Protection &amp; equipment', 'Supplies', 'Cosmetics']) expect(html).toContain(`>${shelf}</h3>`);
  expect(html).toContain('data-inventory-item="sar-issued"'); expect(html).toContain('data-inventory-item="sar-ranger"');
  expect(html).toContain('Rented · 1h 0m left'); expect(html).toContain('2 in stock · Packed');
  expect(html).toContain('Equipped'); expect(html).not.toContain('data-item="sar-vanguard"');
  expect(html).toContain('data-loadout-play'); expect(html).not.toContain('data-owned-filter');
});
it('narrows Store browsing to owned gear with the Owned filter, in the shared card vocabulary', () => {
  screen.view = 'browse';
  const all = render();
  expect(all).toContain('data-owned-filter'); expect(all).toContain('aria-pressed="false"');
  expect(all).toContain('class="ui-item-card equipment-card'); expect(all).toContain('Level 3 required');
  expect(all).toContain('/ play hour'); expect(all).not.toContain('gameplay hour');
});
