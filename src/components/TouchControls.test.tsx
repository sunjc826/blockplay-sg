import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TouchControls from './TouchControls';
import WorldTouchControls from './WorldTouchControls';
import { initialFpsHud, type FpsHud } from '../game/fps-engine';

const playing = (overrides: Partial<FpsHud> = {}): FpsHud => ({ ...initialFpsHud, phase: 'playing', ...overrides });
const layer = (hud: FpsHud, mode: 'range' | 'arena' | 'expedition' = 'range') =>
  renderToStaticMarkup(<TouchControls hud={hud} engine={null} mode={mode} onMenu={() => {}} />);
/** One button's opening tag, so assertions do not depend on attribute order. */
const control = (html: string, action: string) => html.match(new RegExp(`<button[^>]*data-touch-action="${action}"[^>]*>`))?.[0] ?? '';

it('gives every mode two sticks, a trigger and a way back to the menu', () => {
  for (const mode of ['range', 'arena', 'expedition'] as const) {
    const html = layer(playing(), mode);
    expect(html).toContain('data-touch-stick="move"');
    expect(html).toContain('data-touch-stick="look"');
    expect(html).toContain('data-touch-action="fire"');
    expect(html).toContain('data-touch-action="menu"');
    // The scene has to stay reachable between the controls, or drag-look dies.
    expect(html).toContain('touch-layer');
  }
});

it('offers the expedition its supplies and checkpoints, and the range its vehicles', () => {
  const expedition = layer(playing({ quickItem: 'Field dressing', quickCount: 2 }), 'expedition');
  expect(expedition).toContain('data-touch-action="loot"');
  expect(expedition).toContain('data-touch-action="travel"');
  expect(expedition).toContain('data-touch-action="supply"');
  expect(expedition).not.toContain('data-touch-action="vehicle"');

  const range = layer(playing());
  expect(range).toContain('data-touch-action="vehicle"');
  expect(range).not.toContain('data-touch-action="travel"');

  // The arena is infantry only, so it must not offer a car it cannot sync.
  const arena = layer(playing({ arenaSelf: { id: 'self', name: 'You', role: 'player', bot: false, alive: true, kills: 0, deaths: 0, health: 100, armor: 0, respawnIn: 0, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, shots: 0 } }), 'arena');
  expect(arena).not.toContain('data-touch-action="vehicle"');
  expect(arena).not.toContain('data-touch-action="loot"');
});

it('greys out what the player cannot reach yet', () => {
  expect(control(layer(playing()), 'vehicle')).toContain('disabled');
  expect(control(layer(playing({ interact: 'E · Enter Utility 01' })), 'vehicle')).not.toContain('disabled');
  expect(control(layer(playing({ quickItem: 'Field dressing', quickCount: 0 }), 'expedition'), 'supply')).toContain('disabled');
});

it('swaps the infantry actions for driving ones once mounted, and locks the trigger', () => {
  const car = layer(playing({ vehicle: 'car', interact: 'E · Leave Utility 01' }));
  expect(car).toContain('data-touch-action="altitude"');
  expect(car).toContain('Brake');
  expect(car).not.toContain('data-touch-action="reload"');
  expect(control(car, 'fire')).toContain('disabled');
  expect(car).toContain('data-mounted="true"');

  const helicopter = layer(playing({ vehicle: 'helicopter' }));
  expect(helicopter).toContain('data-touch-action="descend"');
  expect(helicopter).toContain('Climb');
  expect(helicopter).toContain('Boost');
});

it('shows the aim as pressed so a latched button cannot lie', () => {
  expect(control(layer(playing({ aiming: true })), 'aim')).toContain('aria-pressed="true"');
  expect(control(layer(playing({ aiming: false })), 'aim')).toContain('aria-pressed="false"');
  // Crouch starts unlatched, and its label survives the icon-only layout.
  expect(control(layer(playing()), 'crouch')).toContain('aria-pressed="false"');
  expect(control(layer(playing()), 'crouch')).toContain('aria-label="Crouch"');
});

it('keeps the walk/drive districts to a stick each, with a brake only in the car', () => {
  const walking = renderToStaticMarkup(<WorldTouchControls travel="walk" onMove={() => {}} onLook={() => {}} onBrake={() => {}} />);
  expect(walking).toContain('data-touch-stick="move"');
  expect(walking).toContain('data-touch-stick="look"');
  expect(walking).not.toContain('data-touch-action="brake"');
  expect(walking).toContain('LOOK');

  const driving = renderToStaticMarkup(<WorldTouchControls travel="drive" onMove={() => {}} onLook={() => {}} onBrake={() => {}} />);
  expect(driving).toContain('data-touch-action="brake"');
  expect(driving).toContain('ORBIT');
});

it('hides the bare drag surfaces from assistive tech, but never the buttons', () => {
  const html = layer(playing());
  expect(html).toContain('aria-hidden="true"');
  // Every command still has a labelled button here and in the bar below the scene.
  expect(html).not.toMatch(/aria-hidden="true"[^>]*>\s*<div class="touch-actions"/);
  expect(html).toContain('<button type="button" class="touch-button"');
});
