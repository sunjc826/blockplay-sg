import { expect, it, vi } from 'vitest';
import { createFpsKeyboardLock } from './fps-keyboard-lock';

it('captures Ctrl+W through KeyW without locking Escape or unrelated shortcuts', async () => {
  const keyboard = { lock: vi.fn().mockResolvedValue(undefined), unlock: vi.fn() };
  const lock = createFpsKeyboardLock(keyboard);
  expect(keyboard.lock).not.toHaveBeenCalled();
  expect(await lock.enter()).toBe(true);
  expect(keyboard.lock).toHaveBeenCalledExactlyOnceWith(['KeyW']);
  lock.exit(); lock.exit();
  expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  expect(await lock.enter()).toBe(true);
  expect(keyboard.lock).toHaveBeenCalledTimes(2);
});

it('keeps fullscreen usable when keyboard lock is unsupported or denied', async () => {
  expect(await createFpsKeyboardLock().enter()).toBe(false);
  const keyboard = { lock: vi.fn().mockRejectedValue(new Error('Permission denied')), unlock: vi.fn() };
  const lock = createFpsKeyboardLock(keyboard);
  expect(await lock.enter()).toBe(false);
  expect(keyboard.lock).toHaveBeenCalledTimes(1); // No automatic permission retry.
  lock.exit();
  keyboard.lock.mockImplementation(() => { throw new Error('Unsupported context'); });
  expect(await lock.enter()).toBe(false);
});

it('releases a permission request that finishes after exit or unmount', async () => {
  let grant!: () => void;
  const keyboard = { lock: vi.fn(() => new Promise<void>(resolve => { grant = resolve; })), unlock: vi.fn() };
  const lock = createFpsKeyboardLock(keyboard), pending = lock.enter();
  lock.exit(); grant();
  expect(await pending).toBeNull();
  expect(keyboard.unlock).toHaveBeenCalledTimes(2);
});

it('does not unlock a new fullscreen session when an old permission request finishes', async () => {
  let grant!: () => void;
  const keyboard = { lock: vi.fn(() => new Promise<void>(resolve => { grant = resolve; })), unlock: vi.fn() };
  const lock = createFpsKeyboardLock(keyboard), first = lock.enter(), grantFirst = grant;
  lock.exit();
  const second = lock.enter();
  grantFirst(); expect(await first).toBeNull();
  expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  grant(); expect(await second).toBe(true);
  lock.exit(); expect(keyboard.unlock).toHaveBeenCalledTimes(2);
});

it('ignores a stale denial after a new fullscreen session starts', async () => {
  let deny!: (reason: Error) => void;
  const keyboard = { lock: vi.fn(() => new Promise<void>((_, reject) => { deny = reject; })), unlock: vi.fn() };
  const lock = createFpsKeyboardLock(keyboard), first = lock.enter(), denyFirst = deny;
  lock.exit();
  keyboard.lock.mockResolvedValue(undefined);
  expect(await lock.enter()).toBe(true);
  denyFirst(new Error('Old request denied'));
  expect(await first).toBeNull();
});
