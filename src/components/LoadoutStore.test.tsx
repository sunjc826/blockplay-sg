import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LoadoutStore from './LoadoutStore';
import { createProfile } from '../game/armory-state';
import type { ArmoryStore } from '../game/use-armory';
const screen = vi.hoisted(() => ({ view: 'detail', slot: 'main', family: 0, vehicle: 'car', item: 'sar-vanguard', supplyType: 'all' }));
vi.mock('../lib/screen-state', () => ({ useScreenState: () => [screen, vi.fn()] }));
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
  expect(html).toContain('role="tablist" aria-label="Weapon platform"');
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
