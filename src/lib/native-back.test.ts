import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Entry = { index: number; menuPage?: 'title' | 'main'; hierarchy?: true };
type Item = { state: { blockplayNavigation?: Entry }; path: string };
let stack: Item[], position: number, pop: () => void;
const location = { pathname: '/', search: '', hash: '' };
function move(delta: number) {
  const next = position + delta;
  if (next < 0 || next >= stack.length) return;
  position = next;
  const url = new URL(stack[position].path, 'https://example.com');
  Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
  pop();
}

beforeEach(() => {
  vi.resetModules();
  position = 0;
  stack = [{ state: {}, path: '/' }];
  Object.assign(location, { pathname: '/', search: '', hash: '' });
  vi.stubGlobal('window', {
    location, dispatchEvent: vi.fn(),
    history: {
      get state() { return stack[position].state; },
      pushState(state: Item['state'], _title: string, path: string) {
        stack.splice(position + 1); stack.push({ state, path }); position++;
        const url = new URL(path, 'https://example.com');
        Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
      },
      replaceState(state: Item['state'], _title: string, path = stack[position].path) {
        stack[position] = { state, path };
        const url = new URL(path, 'https://example.com');
        Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
      },
      go: vi.fn(move), back: () => move(-1), forward: () => move(1),
    },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

async function boot(path = '/') {
  stack[0].path = path;
  const url = new URL(path, 'https://example.com');
  Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
  const routes = await import('./routes');
  pop = () => routes.handleRouteHistory({} as PopStateEvent);
  routes.initializeRouteHistory();
  if (path === '/') routes.initializeMenuHistory(false);
  return routes;
}

it('native Back from Settings goes up after Store and Inventory detours', async () => {
  const { navigate, getMenuPage } = await boot();
  navigate('store'); navigate('inventory'); navigate('settings');
  window.history.back();
  expect(location.pathname).toBe('/');
  expect(getMenuPage()).toBe('main');
  window.history.back();
  expect(getMenuPage()).toBe('title');
  expect(position).toBe(0); // No old Store/Inventory visits between title and exit.
  window.history.forward();
  expect(getMenuPage()).toBe('main');
});

it.each(['classic', 'next-gen'] as const)('deep-link Back follows the %s hierarchy even after reload', async design => {
  const { getMenuPage, initializeRouteHistory } = await boot('/training');
  const { setMenuDesign } = await import('./menu-design');
  setMenuDesign(design);
  initializeRouteHistory();
  window.history.back(); expect(location.pathname).toBe('/play/training');
  window.history.back(); expect(location.pathname).toBe('/play/single-player');
  window.history.back();
  if (design === 'classic') {
    expect(location.pathname).toBe('/play');
    window.history.back();
  }
  expect(location.pathname).toBe('/'); expect(getMenuPage()).toBe('main');
  window.history.back(); expect(getMenuPage()).toBe('title'); expect(position).toBe(0);
});

it('preserves invite parameters when seeding a deep link', async () => {
  await boot('/multiplayer?room=ABC123');
  expect(location.search).toBe('?room=ABC123');
  window.history.back();
  expect(location.pathname).toBe('/play/multiplayer');
  expect(location.search).toBe('');
});

it('cancel and repeated native Back keep the run and URL; confirm goes upwards', async () => {
  const { navigate } = await boot();
  navigate('store'); navigate('training');
  const { registerNavigationGuard, resolveConfirmation } = await import('./navigation-guard');
  const pause = vi.fn();
  const unregister = registerNavigationGuard({ title: 'End exercise?', detail: 'Progress resets.', onRequest: pause });
  try {
    window.history.back();
    expect(location.pathname).toBe('/training');
    expect(pause).toHaveBeenCalledOnce();
    window.history.back();
    expect(location.pathname).toBe('/training');
    expect(pause).toHaveBeenCalledOnce();
    resolveConfirmation(false);
    expect(location.pathname).toBe('/training');
    window.history.back(); resolveConfirmation(true);
    expect(location.pathname).toBe('/play/training');
  } finally { unregister(); resolveConfirmation(false); }
});

it('a native Back that skips several history entries still goes up exactly one level', async () => {
  const { navigate } = await boot();
  navigate('store'); navigate('inventory'); navigate('training');
  window.history.go(-3);
  expect(location.pathname).toBe('/play/training');
});

it('migrates old history metadata on a deep-link reload', async () => {
  stack[0].state = { blockplayNavigation: { index: 12 } };
  const { getMenuPage } = await boot('/play/multiplayer/team-deathmatch/smith-street');
  window.history.back(); expect(location.pathname).toBe('/play/multiplayer/team-deathmatch');
  window.history.back(); expect(location.pathname).toBe('/play/multiplayer');
  window.history.back(); expect(location.pathname).toBe('/');
  window.history.back(); expect(getMenuPage()).toBe('title'); expect(position).toBe(0);
});
