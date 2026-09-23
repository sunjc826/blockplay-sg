import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FalloffCurve from './FalloffCurve';
import { createProfile, equip, previewLoadout, resolveLoadout } from '../game/armory-state';
import { itemById } from '../game/armory-catalog';

const ladder = () => {
  const base = { ...createProfile(), xp: 20000, tokens: 9999, credits: 9999 };
  const owner = { ...base, owned: [...base.owned, 'sar-marksman'] };
  return { preview: previewLoadout(owner, itemById('sar-marksman')!, 0).weapons[0], current: resolveLoadout(owner).weapons[0] };
};

it('draws both curves with a legend, band labels and an accessible table', () => {
  const { preview, current } = ladder();
  const html = renderToStaticMarkup(<FalloffCurve weapon={preview} equipped={current} />);
  expect(html).toContain('SAR 21 · Own Time, Own Target'); expect(html).toContain('SAR 21 · BMT');
  // Two paths, one per series, plus the hits-to-kill bands they are read against.
  expect(html.match(/stroke-width="2"/g)?.length).toBe(2);
  expect(html).toContain('2 hits'); expect(html).toContain('hits</text>');
  expect(html).toContain('<table'); expect(html).toContain('role="img"');
  expect(html).toContain('stock 100 hp target');
});
it('drops to a single series when the previewed item is already equipped', () => {
  const owned = equip({ ...createProfile(), xp: 20000, owned: [...createProfile().owned, 'sar-marksman'] }, 'sar-marksman', 0);
  const weapon = resolveLoadout(owned).weapons[0];
  const html = renderToStaticMarkup(<FalloffCurve weapon={weapon} equipped={weapon} />);
  expect(html.match(/stroke-width="2"/g)?.length).toBe(1);
});
