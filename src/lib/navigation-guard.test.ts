import { afterEach, expect, it, vi } from 'vitest';
import { confirmAction, hasNavigationGuard, registerNavigationGuard, requestLeave, resolveConfirmation } from './navigation-guard';
let cleanup = () => {};
afterEach(() => { resolveConfirmation(false); cleanup(); });
it('leaves unused sessions immediately without a confirmation', () => {
  const leave = vi.fn(); expect(requestLeave(leave)).toBe(true); expect(leave).toHaveBeenCalledOnce();
});
it('pauses an active session but does not leave when confirmation is cancelled', () => {
  const pause = vi.fn(), leave = vi.fn();
  cleanup = registerNavigationGuard({ title: 'End exercise?', detail: 'Progress resets.', onRequest: pause });
  expect(requestLeave(leave)).toBe(false); expect(pause).toHaveBeenCalledOnce(); expect(leave).not.toHaveBeenCalled();
  resolveConfirmation(false); expect(leave).not.toHaveBeenCalled(); expect(hasNavigationGuard()).toBe(true);
  requestLeave(leave); resolveConfirmation(true); resolveConfirmation(true); expect(leave).toHaveBeenCalledOnce();
});
it('keeps the first requested destination while a confirmation is open', () => {
  const first = vi.fn(), second = vi.fn();
  cleanup = registerNavigationGuard({ title: 'Leave match?', detail: 'Disconnects everyone.' });
  requestLeave(first); requestLeave(second); resolveConfirmation(true);
  expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled();
});
it('an old component cleanup cannot remove the new session guard', () => {
  const previous = registerNavigationGuard({ title: 'Room', detail: 'Leave room' });
  cleanup = registerNavigationGuard({ title: 'Match', detail: 'Leave match' });
  previous(); expect(hasNavigationGuard()).toBe(true); cleanup(); expect(hasNavigationGuard()).toBe(false);
});
it('restart confirmations also execute exactly once and block competing navigation', () => {
  const restart = vi.fn(), leave = vi.fn();
  confirmAction({ title: 'Restart?', detail: 'Reset scores', action: restart });
  expect(requestLeave(leave)).toBe(false); resolveConfirmation(true); resolveConfirmation(true);
  expect(restart).toHaveBeenCalledOnce(); expect(leave).not.toHaveBeenCalled();
});
