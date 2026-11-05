import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { initialFpsHud, type FpsHud } from '../game/fps-engine';
import FpsLootCard from './FpsLootCard';

const base = { id: 'g36k', name: 'G36K', tier: 'Elite', kind: 'weapon', type: 'Rifle', description: '', stats: [], action: 'Swap', detail: 'Puts down SAR 21' };
const card = (lootCard: object, touch: boolean, actions?: { take: () => void; swap?: () => void }) =>
  renderToStaticMarkup(<FpsLootCard hud={{ ...initialFpsHud, lootCard: lootCard as FpsHud['lootCard'] }} touch={touch} actions={actions} />);

it('makes the action line the button on touch', () => {
  const html = card(base, true, { take: vi.fn() });
  expect(html).toContain('data-touch-action="loot"');
  expect(html).toContain('aria-label="Swap G36K"');
  expect(html).not.toContain('<kbd>');
});

it('keeps the key hint and no button for a keyboard', () => {
  const html = card(base, false);
  expect(html).toContain('<kbd>E</kbd>');
  expect(html).not.toContain('<button');
});

it('names why an item cannot be taken instead of offering a button, and still offers its swap', () => {
  const html = card({ ...base, kind: 'armor', action: 'Collect', blocked: 'Armor full', swap: { stats: [], note: 'Soft inserts', detail: 'Keeps nothing' } }, true, { take: vi.fn(), swap: vi.fn() });
  expect(html).toContain('Armor full');
  expect(html).not.toContain('data-touch-action="loot"');
  expect(html).toContain('data-touch-action="armor-swap"');
});

it('offers no button where the player cannot act', () => {
  expect(card(base, true)).not.toContain('<button');
});
