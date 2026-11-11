import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTER_MS, LEAVE_MS, directionBetween, returnToParent, shiftAfterHistory, transitionTo } from './route-transition';
import { ROUTE_PATHS, type Route } from './routes';
import { registerNavigationGuard, resolveConfirmation } from './navigation-guard';

const ROUTES = Object.keys(ROUTE_PATHS) as Route[];
const dataset: Record<string, string> = {};
const location = { pathname: '/', search: '' };
const state = () => dataset.routeShift;

describe('directionBetween', () => {
  it('leaves the menu forward and returns to it back', () => {
    for (const route of ROUTES.filter(route => route !== 'menu')) {
      expect(directionBetween('menu', route)).toBe('forward');
      expect(directionBetween(route, 'menu')).toBe('back');
    }
  });

  it('gives every pair of screens opposite directions', () => {
    for (const from of ROUTES) for (const to of ROUTES) {
      if (from !== to) expect(directionBetween(from, to)).not.toBe(directionBetween(to, from));
    }
  });
});

describe('transitionTo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    location.pathname = '/';
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('window', {
      location,
      history: { pushState: (_state: unknown, _title: string, path: string) => { location.pathname = path; } },
      matchMedia: () => ({ matches: false }),
      scrollTo: () => {},
      setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    });
  });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('leaves, changes the route, enters, then clears', () => {
    expect(transitionTo('store')).toBe(true);
    expect(state()).toBe('leaving-forward');
    expect(location.pathname).toBe('/');
    vi.advanceTimersByTime(LEAVE_MS);
    expect(state()).toBe('entering-forward');
    expect(location.pathname).toBe('/store');
    vi.advanceTimersByTime(ENTER_MS);
    expect(state()).toBeUndefined();
  });

  it('reverses on the way back', () => {
    location.pathname = '/inventory';
    transitionTo('store');
    expect(state()).toBe('leaving-back');
  });

  it('ignores a second change while the screen is leaving, but not while the next is entering', () => {
    transitionTo('store');
    expect(transitionTo('settings')).toBe(false);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(transitionTo('inventory')).toBe(true);
    vi.runAllTimers();
    expect(location.pathname).toBe('/inventory');
    expect(state()).toBeUndefined();
  });

  it('returns to the menu parent without traversing a matching history entry', () => {
    location.pathname = '/play/training';
    Object.defineProperty(window.history, 'state', { value: { blockplayNavigation: { index: 4, from: 'single-player' } } });
    const back = vi.fn();
    window.history.back = back;
    returnToParent('single-player');
    vi.runAllTimers();
    expect(location.pathname).toBe('/play/single-player');
    expect(back).not.toHaveBeenCalled();
  });

  it('returns directly to a parent with no in-app history', () => {
    location.pathname = '/play/team-deathmatch/smith-street';
    returnToParent('team-deathmatch');
    vi.runAllTimers();
    expect(location.pathname).toBe('/play/team-deathmatch');
  });

  it('preserves the active-run guard for menu Back', () => {
    location.pathname = '/training';
    const unregister = registerNavigationGuard({ title: 'End exercise?', detail: 'Progress will be lost.' });
    try {
      returnToParent('training-menu');
      vi.runAllTimers();
      expect(location.pathname).toBe('/training');
      resolveConfirmation(false);
      expect(location.pathname).toBe('/training');
      returnToParent('training-menu');
      resolveConfirmation(true);
      vi.runAllTimers();
      expect(location.pathname).toBe('/play/training');
    } finally {
      resolveConfirmation(false);
      unregister();
    }
  });

  it('browser history cancels a change that has not happened yet', () => {
    location.pathname = '/inventory';
    transitionTo('settings');
    location.pathname = '/store';
    shiftAfterHistory('inventory');
    expect(state()).toBeUndefined();
    vi.runAllTimers();
    expect(location.pathname).toBe('/store');
    expect(state()).toBeUndefined();
  });
});
