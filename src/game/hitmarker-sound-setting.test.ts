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

it('starts on, and keeps a disabled preference after reloading the setting', async () => {
  const settings = await import('./hitmarker-sound-setting');
  expect(settings.getHitmarkerSound()).toBe(true);
  settings.setHitmarkerSound(false);
  vi.resetModules();
  const reloaded = await import('./hitmarker-sound-setting');
  expect(reloaded.getHitmarkerSound()).toBe(false);
  reloaded.setHitmarkerSound(true);
  vi.resetModules();
  expect((await import('./hitmarker-sound-setting')).getHitmarkerSound()).toBe(true);
});

it('notifies subscribers until they unsubscribe', async () => {
  const settings = await import('./hitmarker-sound-setting');
  const listener = vi.fn(() => settings.getHitmarkerSound());
  const unsubscribe = settings.subscribeHitmarkerSound(listener);
  settings.setHitmarkerSound(false);
  expect(listener).toHaveReturnedWith(false);
  unsubscribe();
  settings.setHitmarkerSound(true);
  expect(listener).toHaveBeenCalledTimes(1);
});

it('still keeps a session preference when browser storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage blocked'); },
    setItem: () => { throw new Error('Storage blocked'); },
  });
  const settings = await import('./hitmarker-sound-setting');
  expect(settings.getHitmarkerSound()).toBe(true);
  settings.setHitmarkerSound(false);
  expect(settings.getHitmarkerSound()).toBe(false);
});
