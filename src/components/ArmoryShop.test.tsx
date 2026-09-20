import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ArmoryShop from './ArmoryShop';
import { createProfile, equip } from '../game/armory-state';
import { xpForLevel } from '../game/progression';
import type { ArmoryStore } from '../game/use-armory';

it('shows maximum-level copy instead of asking level 50 players to keep climbing', () => {
  const profile = createProfile(); profile.xp = xpForLevel(50);
  const store: ArmoryStore = { profile, buy: vi.fn(), equipItem: vi.fn(), remove: vi.fn(), award: vi.fn(), awardElimination: vi.fn(), consume: vi.fn(), demoTopUp: vi.fn(), message: '', saveError: false };
  const html = renderToStaticMarkup(<ArmoryShop store={store} onEnterRange={() => {}} />);
  expect(html).toContain('Maximum level reached');
  expect(html).not.toContain('Keep climbing to level 50');
});

const storeFor = (profile: ReturnType<typeof createProfile>): ArmoryStore =>
  ({ profile, buy: vi.fn(), equipItem: vi.fn(), remove: vi.fn(), award: vi.fn(), awardElimination: vi.fn(), consume: vi.fn(), demoTopUp: vi.fn(), message: '', saveError: false });

it('lists a premium weapon’s fitted hardware and marks those slots fixed', () => {
  const base = createProfile();
  const owner = equip({ ...base, xp: xpForLevel(8), owned: [...base.owned, 'sar-marksman'] }, 'sar-marksman', 0);
  const html = renderToStaticMarkup(<ArmoryShop store={storeFor(owner)} onEnterRange={() => {}} />);
  expect(html).toContain('FITTED AT THE ARMOURY');
  expect(html).toContain('Fitted 1.75x match scope');
  expect(html).toContain('Free-floated barrel and match trigger');
  // The loadout slots it fills are shown fixed, and carry no remove control.
  expect(html).toContain('armory-slot fitted');
  expect(html).not.toContain('Remove optic attachment');
  expect(html).not.toContain('Remove handling attachment');
});
it('leaves an unfitted platform fully customizable', () => {
  const html = renderToStaticMarkup(<ArmoryShop store={storeFor(createProfile())} onEnterRange={() => {}} />);
  expect(html).not.toContain('armory-slot fitted');
});
