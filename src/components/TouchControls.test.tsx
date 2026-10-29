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

it('gives every mode one stick, a trigger and a way back to the menu', () => {
  for (const mode of ['range', 'arena', 'expedition'] as const) {
    const html = layer(playing(), mode);
    expect(html).toContain('data-touch-stick="move"');
    expect(html).toContain('data-touch-action="fire"');
    expect(html).toContain('data-touch-action="menu"');
    // The scene is the look surface: a second stick would only take a corner
    // of it back, and dragging anywhere the controls are not already turns.
    expect(html).not.toContain('data-touch-stick="look"');
    expect(html).toContain('touch-layer');
  }
});

it('lays the right thumb\'s actions out as a shooter\'s pad, each in a fixed place', () => {
  const html = layer(playing());
  const pad = [...html.matchAll(/data-touch-action="(\w+)" data-pad-slot="([\w-]+)"/g)].map(match => [match[1], match[2]]);
  // Weapons are on the top-right slider and supplies on the belt, so the pad is
  // what a fight needs: aim, reload, jump and the stance.
  expect(Object.fromEntries(pad)).toEqual({ crouch: 'corner-left', prone: 'corner', aim: 'edge-high', reload: 'beside', jump: 'edge-low' });
  // The stance has moved to the right thumb, so the left keeps the stick alone.
  const left = html.match(/<div class="touch-move">[\s\S]*?<div class="touch-combat">/)?.[0] ?? '';
  expect(left).not.toMatch(/data-touch-action="(crouch|prone|menu)"/);
});

it('offers the expedition its checkpoints, and the range its vehicles', () => {
  const expedition = layer(playing({ quickItem: 'Field dressing', quickCount: 2, lootPrompt: 'E · rare Combat stim', npcPrompt: 'E · Buy Kaya toast · 140 CR', travelPrompt: 'T · Travel to Raffles Place' }), 'expedition');
  expect(expedition).toContain('data-touch-action="loot"');
  expect(expedition).toContain('data-touch-action="travel"');
  // Supplies are tapped on the utility belt, not the pad.
  expect(expedition).not.toContain('data-touch-action="supply"');
  expect(expedition).toContain('data-touch-action="npc"');
  expect(expedition).not.toContain('data-touch-action="vehicle"');
  // The prompt says what it does; the keyboard hint is no use to a thumb.
  expect(expedition).toContain('>rare Combat stim<');
  expect(expedition).not.toContain('E · rare Combat stim');
  expect(expedition).toContain('>Buy Kaya toast · 140 CR<');
  expect(layer(playing({ npcPrompt: 'E · Talk to Community volunteer' }), 'expedition')).toContain('>Talk to Community volunteer<');

  const range = layer(playing({ interact: 'E · Drive Utility 01' }));
  expect(range).toContain('data-touch-action="vehicle"');
  expect(range).toContain('>Drive Utility 01<');
  expect(range).not.toContain('data-touch-action="travel"');

  // No nearby vehicle means no entry prompt even in a shared arena.
  const arena = layer(playing({ arenaSelf: { id: 'self', name: 'You', role: 'player', faction: 'armed-forces', bot: false, alive: true, kills: 0, deaths: 0, health: 100, armor: 0, respawnIn: 0, x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, shots: 0 } }), 'arena');
  expect(arena).not.toContain('data-touch-action="vehicle"');
  expect(arena).not.toContain('data-touch-action="loot"');
});

it('shows a contextual action only while it can be pressed', () => {
  // A button that appeared and shifted its neighbours as you walked past a
  // crate would be worse than none, so these are prompts rather than pad
  // slots, and the pad keeps the same buttons whatever you are standing next to.
  expect(layer(playing())).not.toContain('data-touch-action="vehicle"');
  expect(layer(playing({ interact: 'E · Enter Utility 01' }))).toContain('data-touch-action="vehicle"');
  expect(layer(playing({ lootPrompt: '' }), 'expedition')).not.toContain('data-touch-action="loot"');
});

it('offers driver controls, seat switching and mounted fire only to authorized seats', () => {
  const car = layer(playing({ vehicle: 'car', vehicleSeat: 0, vehicleCanFire: true, vehicleAmmo: 240, interact: 'E · Leave Utility 01' }));
  expect(car).toContain('data-touch-action="altitude"');
  expect(car).toContain('Brake');
  expect(car).not.toContain('data-touch-action="reload"');
  expect(control(car, 'fire')).not.toContain('disabled');
  expect(car).toContain('data-touch-action="seat"');
  const passenger = layer(playing({ vehicle: 'car', vehicleSeat: 2, vehicleCanFire: false, vehiclePersonalWeapon: true, vehicleAmmo: 240 }), 'arena');
  expect(control(passenger, 'fire')).not.toContain('disabled');
  expect(control(passenger, 'reload')).not.toBe('');
  expect(control(passenger, 'view')).not.toBe('');
  expect(passenger).not.toContain('data-touch-action="altitude"');
  expect(car).toContain('data-mounted="true"');
  // Getting out is contextual too, and says which vehicle it is leaving.
  expect(car).toContain('>Leave Utility 01<');

  const helicopter = layer(playing({ vehicle: 'helicopter', vehicleSeat: 0 }));
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

it('hides the bare drag surface from assistive tech, but never the buttons', () => {
  const html = layer(playing());
  expect(html).toContain('aria-hidden="true"');
  // The pad is icon-only, so the name has to live on the element itself.
  for (const [action, label] of [['aim', 'Aim'], ['reload', 'Reload'], ['jump', 'Jump'], ['fire', 'Fire'], ['menu', 'Pause']] as const) {
    expect(control(html, action)).toContain(`aria-label="${label}"`);
  }
  expect(html).toContain('class="touch-button"');
});

it('gives a vehicle the same places, and no stance', () => {
  const helicopter = layer(playing({ vehicle: 'helicopter', vehicleSeat: 0 }));
  expect(control(helicopter, 'altitude')).toContain('data-pad-slot="edge-low"');
  expect(control(helicopter, 'boost')).toContain('data-pad-slot="edge-high"');
  expect(control(helicopter, 'descend')).toContain('data-pad-slot="corner"');
  expect(control(helicopter, 'seat')).toContain('data-pad-slot="corner-left"');
  expect(control(helicopter, 'view')).toContain('data-pad-slot="edge-top"');
  // A vehicle's left thumb is steering, and 'c' is the helicopter's descent.
  expect(helicopter).not.toContain('data-touch-action="crouch"');
});

it('offers prone deployment and a way to stand again in every combat mode', () => {
  for (const mode of ['range', 'arena', 'expedition'] as const) {
    expect(control(layer(playing(), mode), 'prone')).toContain('aria-label="Prone"');
    expect(control(layer(playing({ prone: true }), mode), 'prone')).toContain('aria-label="Stand"');
  }
});
