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

it('starts improved, and retains a choice after reloading the setting', async () => {
  const settings = await import('./reload-style-setting');
  expect(settings.getReloadStyle()).toBe('improved');
  settings.setReloadStyle('original');
  vi.resetModules();
  const reloaded = await import('./reload-style-setting');
  expect(reloaded.getReloadStyle()).toBe('original');
});

it('treats an unknown stored value as the default', async () => {
  saved.set('blockplay-sg-reload-style-v1', 'experimental');
  expect((await import('./reload-style-setting')).getReloadStyle()).toBe('improved');
});

it('tells subscribers, and stops once they leave', async () => {
  const settings = await import('./reload-style-setting');
  const listener = vi.fn(() => settings.getReloadStyle());
  const unsubscribe = settings.subscribeReloadStyle(listener);
  settings.setReloadStyle('original');
  expect(listener).toHaveReturnedWith('original');
  unsubscribe();
  settings.setReloadStyle('improved');
  expect(listener).toHaveBeenCalledTimes(1);
});

it('still allows a session choice when browser storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage blocked'); },
    setItem: () => { throw new Error('Storage blocked'); },
  });
  const settings = await import('./reload-style-setting');
  expect(settings.getReloadStyle()).toBe('improved');
  settings.setReloadStyle('original');
  expect(settings.getReloadStyle()).toBe('original');
});
