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

it('starts classic, and retains a choice after reloading the setting', async () => {
  const settings = await import('./menu-design');
  expect(settings.getMenuDesign()).toBe('classic');
  settings.setMenuDesign('next-gen');
  vi.resetModules();
  const reloaded = await import('./menu-design');
  expect(reloaded.getMenuDesign()).toBe('next-gen');
});

it('treats an unknown stored value as the default', async () => {
  saved.set('blockplay-sg-menu-design-v1', 'experimental');
  expect((await import('./menu-design')).getMenuDesign()).toBe('classic');
});

it('tells subscribers, and stops once they leave', async () => {
  const settings = await import('./menu-design');
  const listener = vi.fn(() => settings.getMenuDesign());
  const unsubscribe = settings.subscribeMenuDesign(listener);
  settings.setMenuDesign('next-gen');
  expect(listener).toHaveReturnedWith('next-gen');
  unsubscribe();
  settings.setMenuDesign('classic');
  expect(listener).toHaveBeenCalledTimes(1);
});

it('still allows a session choice when browser storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage blocked'); },
    setItem: () => { throw new Error('Storage blocked'); },
  });
  const settings = await import('./menu-design');
  expect(settings.getMenuDesign()).toBe('classic');
  settings.setMenuDesign('next-gen');
  expect(settings.getMenuDesign()).toBe('next-gen');
});
