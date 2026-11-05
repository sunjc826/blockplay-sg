import { existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { initialFpsHud } from '../game/fps-engine';
import { FPS_WEAPONS } from '../game/fps-rules';
import { isLauncherMode } from '../game/weapon-modes';
import FpsWeaponSlider, { weaponTravel } from './FpsWeaponSlider';

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

it('slides the guns the way the thumb went, even wrapping round the ends', () => {
  expect(weaponTravel([0, 1, 2], 2, 0, { family: 0, travel: -1 })).toBe(-1);
  expect(weaponTravel([0, 1, 2], 0, 2, { family: 2, travel: 1 })).toBe(1);
});

it('tells next from previous with two guns, where both are the same gun', () => {
  expect(weaponTravel([0, 2], 0, 2, { family: 2, travel: -1 })).toBe(-1);
  expect(weaponTravel([0, 2], 0, 2, { family: 2, travel: 1 })).toBe(1);
});

it('follows slot order for a change nobody swiped, and ignores a stale request', () => {
  expect(weaponTravel([0, 1, 2], 0, 1, null)).toBe(-1);
  expect(weaponTravel([0, 1, 2], 2, 1, null)).toBe(1);
  expect(weaponTravel([0, 1, 2], 2, 1, { family: 0, travel: -1 })).toBe(1);
});

it('does not animate the gun already in hand when the switcher first appears', () => {
  expect(slider()).not.toContain('data-slide');
});
