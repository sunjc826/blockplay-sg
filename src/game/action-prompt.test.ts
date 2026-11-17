import { expect, it } from 'vitest';
import { actionPrompt, type ActionPromptState } from './action-prompt';

const fit: ActionPromptState = { health: 100, maxHealth: 100, magazine: 30, reserve: 90, capacity: 30, roundReady: true, busy: false, unavailable: false, aiming: false, heal: { name: 'Field dressing' } };
const at = (patch: Partial<ActionPromptState>) => actionPrompt({ ...fit, ...patch });

it('says nothing to a fit soldier with a full gun', () => { expect(at({})).toBeNull(); });
it('puts an empty or unchambered gun first, even when badly hurt', () => {
  expect(at({ magazine: 0, health: 10 })).toMatchObject({ kind: 'reload', key: 'R', urgent: true });
  expect(at({ roundReady: false })).toMatchObject({ kind: 'reload', urgent: true });
});
it('offers the carried healing item by name once health is low, urgently when critical', () => {
  expect(at({ health: 50 })).toMatchObject({ kind: 'heal', key: 'F', text: 'FIELD DRESSING', urgent: false });
  expect(at({ health: 20 })).toMatchObject({ kind: 'heal', urgent: true });
  expect(at({ health: 51 })).toBeNull();
});
it('follows the maximum the debug multiplier sets', () => { expect(at({ health: 300, maxHealth: 500 })).toBeNull(); expect(at({ health: 100, maxHealth: 500 })?.kind).toBe('heal'); });
it('never suggests what cannot be done', () => {
  expect(at({ magazine: 0, reserve: 0 })).toBeNull();
  expect(at({ health: 20, heal: null })).toBeNull();
  expect(at({ magazine: 0, busy: true })).toBeNull();
  expect(at({ health: 20, unavailable: true })).toBeNull();
  expect(at({ health: 0, magazine: 0 })).toBeNull();
});
it('mentions a low magazine only off the sights and after a wound', () => {
  expect(at({ magazine: 7 })).toMatchObject({ kind: 'reload', urgent: false });
  expect(at({ magazine: 8 })).toBeNull();
  expect(at({ magazine: 7, aiming: true })).toBeNull();
  expect(at({ magazine: 7, health: 40 })?.kind).toBe('heal');
});
