import { expect, it } from 'vitest';
import { armReloadGate, reloadInterrupt } from './fps-reload';

it('lets a fresh trigger pull with rounds left stop a reload', () => {
  const gate = armReloadGate(false, false);
  expect(reloadInterrupt(gate, false, false, true)).toBeNull();
  expect(reloadInterrupt(gate, true, false, true)).toBe('fire');
  // From empty there is nothing to fire, so the reload carries on.
  expect(reloadInterrupt(armReloadGate(false, false), true, false, false)).toBeNull();
});
it('ignores a trigger or sprint already held when the reload began, until let go', () => {
  const gate = armReloadGate(true, true);
  expect(reloadInterrupt(gate, true, true, true)).toBeNull();
  expect(reloadInterrupt(gate, true, true, true)).toBeNull();
  expect(reloadInterrupt(gate, true, false, true)).toBeNull();
  expect(reloadInterrupt(gate, true, true, true)).toBe('sprint');
  const held = armReloadGate(true, false);
  expect(reloadInterrupt(held, false, false, true)).toBeNull();
  expect(reloadInterrupt(held, true, false, true)).toBe('fire');
});
