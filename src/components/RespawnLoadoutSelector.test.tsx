import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RespawnLoadoutSelector from './RespawnLoadoutSelector';
import { createProfile, purchase } from '../game/armory-state';

it('offers the locker on a dedicated screen and distinguishes next life from current gear', () => {
  const p = createProfile();
  const html = renderToStaticMarkup(<RespawnLoadoutSelector inventory={p} selected={p} onSave={async () => true} onClose={() => {}} />);
  expect(html).toContain('Choose your next loadout'); expect(html).toContain('Your current life keeps its gear');
  expect(html).toContain('Main weapon platform'); expect(html).toContain('Sidearm variant');
  expect(html).toContain('Unlock the extra main slot'); expect(html).not.toContain('data-loadout-variant="sar-vanguard"');
  expect(html).toContain('Use on next respawn'); expect(html).toContain('aria-modal="true"');
});

it('shows active rentals and a purchased extra slot while keeping unavailable weapons out', () => {
  let p = { ...createProfile(), xp: 100000, tokens: 10000 };
  p = purchase(p, 'slot-extra').profile; p = purchase(p, 'sar-vanguard', '1h').profile;
  const html = renderToStaticMarkup(<RespawnLoadoutSelector inventory={p} selected={p} onSave={async () => true} onClose={() => {}} />);
  expect(html).toContain('Extra main platform'); expect(html).toContain('data-loadout-variant="sar-vanguard"');
  expect(html).toContain('left'); expect(html).not.toContain('data-loadout-variant="sar-marksman"');
});
