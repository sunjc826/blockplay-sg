import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { initialFpsHud } from '../game/fps-engine';
import { FPS_WEAPONS } from '../game/fps-rules';
import FpsWeaponHud from './FpsWeaponHud';

const weapon = FPS_WEAPONS.find(weapon => weapon.id === 'ff-intervention')!;
const render = (value: number | null, extra = {}, touch = false) => renderToStaticMarkup(<FpsWeaponHud hud={{ ...initialFpsHud, phase: 'playing', scopeZoom: value === null ? null : { value, min: 3, max: 12 }, ...extra }} weapon={weapon} canFight onScopeZoom={() => {}} touch={touch} />);
const button = (html: string, name: string) => html.match(new RegExp(`<button[^>]*aria-label="${name} scope magnification"[^>]*>`))?.[0] ?? '';
it('shows selected magnification and hides variable controls on fixed scopes', () => {
  expect(render(9)).toContain('data-scope-zoom="9"');
  expect(render(9)).toContain('9×');
  expect(render(null)).not.toContain('aria-label="Scope magnification"');
  // A thumb zooms from the rocker on its pad instead.
  expect(render(6, {}, true)).not.toContain('aria-label="Scope magnification"');
});
it('disables only the unavailable direction at each end and both while reloading', () => {
  expect(button(render(3), 'Decrease')).toContain('disabled');
  expect(button(render(3), 'Increase')).not.toContain('disabled');
  expect(button(render(12), 'Increase')).toContain('disabled');
  expect(button(render(12), 'Decrease')).not.toContain('disabled');
  for (const name of ['Increase', 'Decrease']) expect(button(render(6, { reloading: .5 }), name)).toContain('disabled');
});
