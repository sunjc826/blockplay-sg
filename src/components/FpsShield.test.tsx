import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FpsShield from './FpsShield';
import { initialFpsHud, type FpsHud } from '../game/fps-engine';
import type { ArenaActor } from '../game/arena-rules';

const self = (extra: Partial<ArenaActor>): ArenaActor => ({ id: 'you', name: 'You', bot: false, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'player', faction: 'armed-forces', ...extra });
const hud = (extra: Partial<ArenaActor> | null): FpsHud => ({ ...initialFpsHud, arenaSelf: extra ? self(extra) : null });

it('counts the spawn shield down under the crosshair, fading at the end, and shows nothing once it lapses', () => {
  const html = renderToStaticMarkup(<FpsShield hud={hud({ shield: 2.34 })} />);
  expect(html).toContain('SPAWN SHIELD'); expect(html).toContain('2.3s'); expect(html).toContain('opacity:1');
  expect(renderToStaticMarkup(<FpsShield hud={hud({ shield: .3 })} />)).toContain('opacity:0.5');
  expect(renderToStaticMarkup(<FpsShield hud={hud({})} />)).toBe('');
  expect(renderToStaticMarkup(<FpsShield hud={hud({ shield: 2, alive: false })} />)).toBe('');
  expect(renderToStaticMarkup(<FpsShield hud={hud(null)} />)).toBe('');
});
