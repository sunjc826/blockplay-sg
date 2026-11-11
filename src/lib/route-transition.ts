import { isEquipmentRoute } from './equipment-navigation';
import { requestLeave } from './navigation-guard';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { navigate, ROUTE_PATHS, routeFromPath, type Route } from './routes';

/**
 * A quick shift between screens: the old one slips away, the route changes,
 * and the new one slides in from the other side. Going forward the content
 * moves left; the same pair of screens the other way round moves it right.
 * RouteShift and route-shift.css draw it; this holds which phase it is in, so
 * any screen can start one.
 */
export type ShiftDirection = 'forward' | 'back';
export type Shift = { id: number; phase: 'leaving' | 'entering'; direction: ShiftDirection };

/** Match the timings in route-shift.css. */
export const LEAVE_MS = 80;
export const ENTER_MS = 170;

/** Where each screen sits, left to right. Every pair of screens gets opposite directions from this. */
const ORDER = Object.keys(ROUTE_PATHS) as Route[];

export const directionBetween = (from: Route, to: Route): ShiftDirection => ORDER.indexOf(to) < ORDER.indexOf(from) ? 'back' : 'forward';

let current: Shift | null = null;
let serial = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function set(next: Shift | null) {
  current = next;
  // On the page rather than a wrapper: a wrapper would change the layout of every screen.
  if (next) document.documentElement.dataset.routeShift = `${next.phase}-${next.direction}`;
  else delete document.documentElement.dataset.routeShift;
  listeners.forEach(listener => listener());
}

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function settle(id: number) {
  window.setTimeout(() => { if (current?.id === id) set(null); }, ENTER_MS);
}

/** Goes to a route with a shift; returns false if the screen is already on its way out. */
export function transitionTo(route: Route, approved = false): boolean {
  if (current?.phase === 'leaving') return false;
  if (!approved) return requestLeave(() => { transitionTo(route, true); });
  if (reducedMotion()) { navigate(route, true); return true; }
  const id = ++serial, direction = directionBetween(routeFromPath(window.location.pathname), route);
  set({ id, phase: 'leaving', direction });
  window.setTimeout(() => {
    if (current?.id !== id) return;
    // Committed before the browser paints again, so the old screen never shows the new one's entrance.
    flushSync(() => { set({ id, phase: 'entering', direction }); navigate(route, true); });
    settle(id);
  }, LEAVE_MS);
  return true;
}

/** In-game Back follows the menu hierarchy, independent of browser history. */
export function returnToParent(route: Route) {
  transitionTo(route);
}

/** The browser's own Back and Forward have already changed the route, so only the entrance is left to play. */
export function shiftAfterHistory(from: Route) {
  // A native Back can interrupt a pending click transition, even at the same URL.
  set(null);
  if (reducedMotion()) return;
  const route = routeFromPath(window.location.pathname);
  if (isEquipmentRoute(from) && isEquipmentRoute(route)) { set(null); return; }
  if (route === 'debug' || route === from) return;
  const id = ++serial;
  set({ id, phase: 'entering', direction: directionBetween(from, route) });
  settle(id);
}

export function useShift() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
