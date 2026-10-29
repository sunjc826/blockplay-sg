import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let saved: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  saved = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

it('starts with hints on, and retains a disabled preference after reloading the setting', async () => {
  const settings = await import('./hud-hints-setting');
  expect(settings.getHudHints()).toBe(true);
  settings.setHudHints(false);
  vi.resetModules();
  const reloaded = await import('./hud-hints-setting');
  expect(reloaded.getHudHints()).toBe(false);
  reloaded.setHudHints(true);
  vi.resetModules();
  expect((await import('./hud-hints-setting')).getHudHints()).toBe(true);
});

it('updates subscribed HUDs and stops notifying an unmounted subscriber', async () => {
  const settings = await import('./hud-hints-setting');
  const listener = vi.fn(() => settings.getHudHints());
  const unsubscribe = settings.subscribeHudHints(listener);
  settings.setHudHints(false);
  expect(listener).toHaveReturnedWith(false);
  unsubscribe();
  settings.setHudHints(true);
  expect(listener).toHaveBeenCalledTimes(1);
});

it('still allows a session preference when browser storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage blocked'); },
    setItem: () => { throw new Error('Storage blocked'); },
  });
  const settings = await import('./hud-hints-setting');
  expect(settings.getHudHints()).toBe(true);
  settings.setHudHints(false);
  expect(settings.getHudHints()).toBe(false);
});
