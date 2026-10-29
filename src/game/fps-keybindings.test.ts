import { expect, it } from 'vitest';
import { createKeyboardCrouch, fpsControlKey, fpsInteractionTarget, fpsKeyAction } from './fps-keybindings';

const event = (code: string, key: string, extra = {}) => ({ code, key, metaKey: false, altKey: false, ...extra });

it('keeps physical number slots and movement working while sprinting and on alternate layouts', () => {
  expect(fpsControlKey(event('Digit1', '!'))).toBe('1');
  expect(fpsControlKey(event('Digit4', '$'))).toBe('4');
  expect(fpsControlKey(event('KeyW', 'z'))).toBe('w');
  expect(fpsControlKey(event('ControlLeft', 'Control'))).toBe('control');
  expect(fpsControlKey(event('ControlRight', 'Control'))).toBe('control');
  expect(fpsControlKey(event('', 'K'))).toBe('k');
  expect(fpsControlKey(event('F11', 'F11'))).toBeNull();
});

it('preserves OS shortcuts but can release a held control after a modifier changes', () => {
  expect(fpsControlKey(event('KeyW', 'w', { metaKey: true }))).toBeNull();
  expect(fpsControlKey(event('KeyW', 'w', { altKey: true }))).toBeNull();
  expect(fpsControlKey(event('ControlLeft', 'Control', { metaKey: true }), true)).toBe('control');
});

it('resolves the agreed keys without stealing F or assigning two actions to N/L/C', () => {
  expect(fpsKeyAction('n', false)).toBe('vision');
  expect(fpsKeyAction('l', true)).toBe('light');
  expect(fpsKeyAction('b', false)).toBe('laser');
  expect(fpsKeyAction('k', false)).toBe('inspect');
  expect(fpsKeyAction('z', false)).toBe('prone');
  expect(fpsKeyAction('control', true)).toBe('crouch-hold');
  expect(fpsKeyAction('c', false)).toBe('crouch-toggle');
  expect(fpsKeyAction('c', true)).toBe('vehicle-camera');
  expect(fpsKeyAction('f', false)).toBeUndefined();
  expect(fpsKeyAction('h', false)).toBeUndefined();
});

it('releases hold crouch without losing a toggle or the other Control key', () => {
  const crouch = createKeyboardCrouch();
  crouch.hold('ControlLeft', true); expect(crouch.active).toBe(true);
  crouch.hold('ControlRight', true); crouch.hold('ControlLeft', false);
  expect(crouch.active).toBe(true);
  crouch.hold('ControlRight', false); expect(crouch.active).toBe(false);
  crouch.toggle(); crouch.hold('ControlLeft', true); crouch.hold('ControlLeft', false);
  expect(crouch.active).toBe(true);
  crouch.toggle(); expect(crouch.active).toBe(false);
});

it('clears every keyboard stance latch for pause, death, vehicle entry and prone changes', () => {
  const crouch = createKeyboardCrouch();
  crouch.toggle(); crouch.hold('ControlLeft', true); crouch.clear();
  expect(crouch.active).toBe(false); expect(crouch.holding).toBe(false);
  crouch.hold('ControlLeft', false); expect(crouch.active).toBe(false);
});

it('gives contextual interaction one target and never purchases through a blocked loot pickup', () => {
  expect(fpsInteractionTarget(true, true, true)).toBe('vehicle');
  expect(fpsInteractionTarget(false, true, true)).toBe('loot');
  expect(fpsInteractionTarget(false, false, true)).toBe('npc');
  expect(fpsInteractionTarget(false, false, false)).toBe('vehicle');
});
