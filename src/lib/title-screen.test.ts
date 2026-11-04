import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stubActivation = (hasBeenActive: boolean | undefined) =>
  vi.stubGlobal('navigator', hasBeenActive === undefined ? {} : { userActivation: { hasBeenActive } });
const key = (key: string, extra = {}) => ({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...extra });

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('title screen', () => {
  it('opens only while the page has had no gesture', async () => {
    const { needsTitleScreen } = await import('./title-screen');
    stubActivation(false);
    expect(needsTitleScreen()).toBe(true);
    stubActivation(true);
    expect(needsTitleScreen()).toBe(false);
  });

  it('still opens in a browser that cannot report gestures', async () => {
    const { needsTitleScreen } = await import('./title-screen');
    stubActivation(undefined);
    expect(needsTitleScreen()).toBe(true);
  });

  it('does not come back during the same page load', async () => {
    const { needsTitleScreen, markTitleScreenSeen } = await import('./title-screen');
    stubActivation(false);
    markTitleScreenSeen();
    expect(needsTitleScreen()).toBe(false);
  });

  it('starts on ordinary keys, including the ones the menu uses', async () => {
    const { startsFromTitleScreen } = await import('./title-screen');
    for (const name of ['a', ' ', 'Enter', 'ArrowDown', '1']) expect(startsFromTitleScreen(key(name))).toBe(true);
  });

  it('leaves shortcuts, modifiers and held keys to the browser', async () => {
    const { startsFromTitleScreen } = await import('./title-screen');
    for (const name of ['Escape', 'Tab', 'Shift', 'Meta', 'F5', 'F12']) expect(startsFromTitleScreen(key(name))).toBe(false);
    expect(startsFromTitleScreen(key('r', { metaKey: true }))).toBe(false);
    expect(startsFromTitleScreen(key('r', { ctrlKey: true }))).toBe(false);
    expect(startsFromTitleScreen(key('a', { repeat: true }))).toBe(false);
  });

  it('centres the logo from wherever the header puts it, and keeps it on a phone', async () => {
    const { titleLogoPlacement } = await import('./title-screen');
    const box = { left: 40, top: 24, width: 160, height: 30 };
    const desktop = titleLogoPlacement(box, { width: 1280, height: 800 });
    expect(desktop.scale).toBe(3.2);
    expect(box.left + desktop.x + box.width * desktop.scale / 2).toBeCloseTo(640);
    expect(box.top + desktop.y + box.height * desktop.scale / 2).toBeCloseTo(352);
    const phone = titleLogoPlacement({ left: 16, top: 12, width: 130, height: 24 }, { width: 360, height: 780 });
    expect(130 * phone.scale).toBeLessThanOrEqual(360 * .72 + 1e-9);
    const wide = titleLogoPlacement({ left: 16, top: 12, width: 130, height: 24 }, { width: 800, height: 320 });
    expect(24 * wide.scale).toBeLessThanOrEqual(320 * .3 + 1e-9);
  });
});
