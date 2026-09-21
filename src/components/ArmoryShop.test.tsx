import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ArmoryShop from './ArmoryShop';
import { createProfile, equip } from '../game/armory-state';
import { levelSkip, xpForLevel } from '../game/progression';
import type { ArmoryStore } from '../game/use-armory';

it('shows maximum-level copy instead of asking level 50 players to keep climbing', () => {
  const profile = createProfile(); profile.xp = xpForLevel(50);
  const store: ArmoryStore = { profile, buy: vi.fn(), buyLevel: vi.fn(), equipItem: vi.fn(), remove: vi.fn(), award: vi.fn(), awardElimination: vi.fn(), consume: vi.fn(), demoTopUp: vi.fn(), message: '', saveError: false };
  const html = renderToStaticMarkup(<ArmoryShop store={store} onEnterRange={() => {}} />);
  expect(html).toContain('Maximum level reached');
  expect(html).not.toContain('Keep climbing to level 50');
});

const storeFor = (profile: ReturnType<typeof createProfile>): ArmoryStore =>
  ({ profile, buy: vi.fn(), buyLevel: vi.fn(), equipItem: vi.fn(), remove: vi.fn(), award: vi.fn(), awardElimination: vi.fn(), consume: vi.fn(), demoTopUp: vi.fn(), message: '', saveError: false });

it('lists a premium weapon’s fitted hardware and marks those slots fixed', () => {
  const base = createProfile();
  const owner = equip({ ...base, xp: xpForLevel(8), owned: [...base.owned, 'sar-marksman'] }, 'sar-marksman', 0);
  const html = renderToStaticMarkup(<ArmoryShop store={storeFor(owner)} onEnterRange={() => {}} />);
  expect(html).toContain('BUILT FROM');
  // The dossier describes the selected item, which defaults to the Vanguard,
  // and attributes its figures to the hardware responsible for them.
  expect(html).toContain('Match barrel and chamber');
  expect(html).toContain('+14 damage');
  expect(html).toContain('15ms quicker between shots');
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

it('offers the next level at the price of the XP still owed, and nothing at the ceiling', () => {
  const recruit = createProfile();
  const html = renderToStaticMarkup(<ArmoryShop store={storeFor(recruit)} onEnterRange={() => {}} />);
  expect(html).toContain('Skip to level 2');
  expect(html).toContain(`${levelSkip(recruit.xp).price} TK`);
  // A gated item says what the climb to it costs, now that levels are for sale.
  expect(html).toContain('32 TK of levels');
  // Halfway up the level, the same skip costs half as much.
  const halfway = renderToStaticMarkup(<ArmoryShop store={storeFor({ ...recruit, xp: 150 })} onEnterRange={() => {}} />);
  expect(halfway).toContain('6 TK');
  const capped = renderToStaticMarkup(<ArmoryShop store={storeFor({ ...recruit, xp: xpForLevel(50) })} onEnterRange={() => {}} />);
  expect(capped).not.toContain('Skip to level');
});
it('says how far a short wallet is from the next level rather than offering it', () => {
  const html = renderToStaticMarkup(<ArmoryShop store={storeFor({ ...createProfile(), tokens: 5 })} onEnterRange={() => {}} />);
  expect(html).toContain('7 TK short');
  expect(html).not.toContain('Skip to level 2');
});
