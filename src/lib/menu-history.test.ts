import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Item = { state: { blockplayNavigation?: { index: number; menuPage?: 'title' | 'main' } }; path: string };
let stack: Item[], position: number;
const location = { pathname: '/', search: '' };

beforeEach(() => {
  vi.resetModules();
  stack = [{ state: { blockplayNavigation: { index: 0 } }, path: '/' }];
  position = 0;
  location.pathname = '/';
  vi.stubGlobal('window', {
    location,
    history: {
      get state() { return stack[position].state; },
      pushState(state: Item['state'], _title: string, path: string) {
        stack.splice(position + 1); stack.push({ state, path }); position++;
        location.pathname = path;
      },
      replaceState(state: Item['state'], _title: string, path: string) {
        stack[position] = { state, path }; location.pathname = path;
      },
      back: vi.fn(() => { if (position > 0) location.pathname = stack[--position].path; }),
    },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('main-menu history', () => {
  it('makes the title the first step, and Back after starting shows it again', async () => {
    const { initializeMenuHistory, enterMainMenu, returnToTitleScreen, getMenuPage } = await import('./routes');
    initializeMenuHistory(true);
    expect(stack).toHaveLength(1);
    enterMainMenu();
    expect(getMenuPage()).toBe('main');
    returnToTitleScreen();
    expect(location.pathname).toBe('/');
    expect(getMenuPage()).toBe('title');
  });

  it('seeds the title when a gesture lets the initial visit skip it', async () => {
    const { initializeMenuHistory, returnToTitleScreen, getMenuPage } = await import('./routes');
    initializeMenuHistory(false);
    expect(getMenuPage()).toBe('main');
    returnToTitleScreen();
    expect(getMenuPage()).toBe('title');
  });

  it.each(['/play/single-player', '/store', '/settings'])('returns from %s with the title behind Main menu', async path => {
    const { navigate, getMenuPage, returnToTitleScreen } = await import('./routes');
    location.pathname = stack[0].path = path;
    navigate('menu', true);
    expect(getMenuPage()).toBe('main');
    expect(stack.map(item => item.state.blockplayNavigation?.index)).toEqual([0, 1, 2]);
    returnToTitleScreen();
    expect(location.pathname).toBe('/');
    expect(getMenuPage()).toBe('title');
  });

  it('does not add duplicate entries on remount, reload, or repeated start', async () => {
    const { initializeMenuHistory, enterMainMenu, getMenuPage } = await import('./routes');
    initializeMenuHistory(false);
    initializeMenuHistory(false);
    enterMainMenu();
    expect(stack).toHaveLength(2);
    window.history.back();
    initializeMenuHistory(false);
    expect(getMenuPage()).toBe('title');
    expect(stack).toHaveLength(2);
    enterMainMenu();
    expect(getMenuPage()).toBe('main');
    expect(stack).toHaveLength(2);
  });
});
