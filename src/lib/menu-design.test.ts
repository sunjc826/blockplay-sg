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

it.each(['classic', 'next-gen'] as const)('starts next-gen, and retains a %s choice after reloading the setting', async design => {
  const settings = await import('./menu-design');
  expect(settings.getMenuDesign()).toBe('next-gen');
  settings.setMenuDesign(design);
  vi.resetModules();
  const reloaded = await import('./menu-design');
  expect(reloaded.getMenuDesign()).toBe(design);
});

it('treats an unknown stored value as the default', async () => {
  saved.set('blockplay-sg-menu-design-v1', 'experimental');
  expect((await import('./menu-design')).getMenuDesign()).toBe('next-gen');
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
  expect(settings.getMenuDesign()).toBe('next-gen');
  settings.setMenuDesign('classic');
  expect(settings.getMenuDesign()).toBe('classic');
});
