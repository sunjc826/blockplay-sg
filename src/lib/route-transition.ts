import { useSyncExternalStore } from 'react';
import { navigate, type Route } from './routes';

/**
 * A wipe between screens: stripes sweep the screen shut, the route changes
 * under cover, then they sweep on and off the other side. RouteWipe draws it;
 * this holds which phase it is in, so any screen can start one.
 */
export type Wipe = { id: number; phase: 'cover' | 'reveal'; label: string; kicker: string };

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

// A tall screen like the menu leaves the page scrolled; the next starts at its top.
function go(route: Route) {
  navigate(route);
  window.scrollTo(0, 0);
}

/** Goes to a route behind the wipe; returns false if one is already running. */
export function transitionTo(route: Route, label: string, kicker = 'BLOCKPLAY SG') {
  if (current) return false;
  if (reducedMotion()) { go(route); return true; }
  const id = ++serial;
  set({ id, phase: 'cover', label, kicker });
  window.setTimeout(() => {
    go(route);
    set({ id, phase: 'reveal', label, kicker });
    window.setTimeout(() => { if (current?.id === id) set(null); }, REVEAL_MS);
  }, COVER_MS);
  return true;
}

export function useWipe() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
