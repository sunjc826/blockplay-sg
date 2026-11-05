import { existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { initialFpsHud } from '../game/fps-engine';
import { FPS_WEAPONS } from '../game/fps-rules';
import { isLauncherMode } from '../game/weapon-modes';
import FpsWeaponSlider from './FpsWeaponSlider';

const names = ['SAR 21', 'Ultimax', 'P30'];
const slider = () => renderToStaticMarkup(<FpsWeaponSlider hud={{ ...initialFpsHud, weapon: 0, carriedWeapons: [0, 1, 2] }} names={names} canSwitch onSwitch={() => {}} />);

it('names where each arrow goes, and wraps round the carried weapons', () => {
  const html = slider();
  expect(html).toContain('aria-label="Next weapon: Ultimax"');
  expect(html).toContain('aria-label="Previous weapon: P30"');
});

it('shows the outline of the gun in hand, and a launcher mode shows its rifle', () => {
  expect(slider()).toContain('images/weapon-outlines/sar21-inspired.webp');
  const launcher = renderToStaticMarkup(<FpsWeaponSlider hud={{ ...initialFpsHud, weapon: 17, carriedWeapons: [16, 2] }} names={FPS_WEAPONS.map(w => w.name)} canSwitch onSwitch={() => {}} />);
  expect(launcher).toContain('images/weapon-outlines/cc-qts11.webp');
});

it('has an outline for every gun a player can hold', () => {
  for (const [family, weapon] of FPS_WEAPONS.entries()) if (!isLauncherMode(family)) expect(existsSync(`public/images/weapon-outlines/${weapon.id}.webp`), weapon.id).toBe(true);
});

it('is absent with nothing to switch to', () => {
  expect(renderToStaticMarkup(<FpsWeaponSlider hud={{ ...initialFpsHud, weapon: 0, carriedWeapons: [0] }} names={names} canSwitch onSwitch={() => {}} />)).toBe('');
});
