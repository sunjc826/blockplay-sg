import { useSyncExternalStore } from 'react';
import { navigate, routeFromPath, type Route } from './routes';

/**
 * A wipe between screens: stripes sweep the screen shut, the route changes
 * under cover, then they sweep on and off the other side. Going forward they
 * travel right to left; heading back to the menu, left to right. RouteWipe
 * draws it; this holds which phase it is in, so any screen can start one.
 */
export type WipeDirection = 'forward' | 'back';
export type Wipe = { id: number; phase: 'cover' | 'reveal'; direction: WipeDirection; label: string; kicker: string };

/** Matches the stripe timings in route-wipe.css. */
export const COVER_MS = 470;
export const REVEAL_MS = 520;

let current: Wipe | null = null;
let serial = 0;
const listeners = new Set<() => void>();
const set = (next: Wipe | null) => { current = next; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const LABELS: Record<Route, string> = {
  menu: 'Menu', tutorial: 'Tutorial', training: 'Training', world: 'Open World', multiplayer: 'Multiplayer', store: 'Store', settings: 'Settings', debug: 'Debug',
};

const directionTo = (route: Route): WipeDirection => route === 'menu' ? 'back' : 'forward';

// A tall screen like the menu leaves the page scrolled; the next starts at its top.
function go(route: Route) {
  navigate(route);
  window.scrollTo(0, 0);
}

function reveal(wipe: Omit<Wipe, 'phase'>) {
  set({ ...wipe, phase: 'reveal' });
  window.setTimeout(() => { if (current?.id === wipe.id) set(null); }, REVEAL_MS);
}

/** Goes to a route behind the wipe; returns false if one is already running. */
export function transitionTo(route: Route, label: string, kicker = 'BLOCKPLAY SG', direction = directionTo(route)) {
  if (current) return false;
  if (reducedMotion()) { go(route); return true; }
  const wipe = { id: ++serial, direction, label, kicker };
  set({ ...wipe, phase: 'cover' });
  window.setTimeout(() => { go(route); reveal(wipe); }, COVER_MS);
  return true;
}

/**
 * The browser's own Back and Forward have already switched screens by the time
 * they tell us, so there is nothing to cover: the stripes start closed over
 * the new screen and sweep off it, which hides the cut just the same.
 */
export function revealAfterHistory() {
  if (current || reducedMotion()) return;
  const route = routeFromPath(window.location.pathname);
  if (route === 'debug') return;
  reveal({ id: ++serial, direction: directionTo(route), label: LABELS[route], kicker: 'BLOCKPLAY SG' });
}

export function useWipe() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
