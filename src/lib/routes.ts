import { useEffect, useLayoutEffect, useState } from 'react';
import { hasNavigationGuard, requestLeave } from './navigation-guard';

/**
 * The player-facing screens and the developer shell. Paths rather than hashes,
 * so `/debug` is a URL worth sharing; the Cloudflare asset server and the
 * service worker both answer any extensionless navigation with the app shell.
 */
export type Route = 'menu' | 'tutorial' | 'training' | 'world' | 'multiplayer' | 'store' | 'inventory' | 'settings' | 'debug' | 'faction-designs';

export const ROUTE_PATHS: Record<Route, string> = {
  menu: '/', tutorial: '/tutorial', training: '/training', world: '/world', store: '/store', inventory: '/inventory', settings: '/settings', debug: '/debug',
  multiplayer: '/multiplayer',
  'faction-designs': '/faction-designs',
};

export function routeFromPath(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (Object.keys(ROUTE_PATHS) as Route[]).find(route => ROUTE_PATHS[route] === path) ?? 'menu';
}

/**
 * LAN invites written before the menu existed point at `/?room=…`; the lobby
 * lives in the debug shell now, so carry the query there.
 */
export function canonicalUrl(pathname: string, search: string): string | null {
  if (routeFromPath(pathname) === 'menu' && new URLSearchParams(search).has('room')) return `${ROUTE_PATHS.debug}${search}`;
  return null;
}

type Entry = { index: number; from?: Route };
const listeners = new Set<() => void>();
const views = new Map<Route, { scroll: number; focus?: string }>();
let current: Entry = { index: 0 };
let initialized = false;
let restoreHistory: (() => void) | null = null;
let approvedHistory = false;
let acceptedPath = '';

function entry(): Entry | undefined { return window.history.state?.blockplayNavigation; }
function saveView() {
  if (typeof document === 'undefined' || !document.activeElement) return;
  const active = document.activeElement;
  const parts: string[] = [];
  let node: Element | null = active;
  while (node && node !== document.body) {
    if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`);
    node = parent;
  }
  views.set(routeFromPath(acceptedPath || window.location.pathname), { scroll: window.scrollY, focus: active === document.body ? undefined : parts.join(' > ') });
}
export function getBackRoute(): Route { return entry()?.from ?? 'menu'; }
export function goBack() {
  if (entry()?.from) window.history.back(); else navigate('menu');
}
export const routeLabel = (route: Route) => ({ menu: 'Main menu', store: 'Store', inventory: 'Inventory', settings: 'Settings', training: 'Training', world: 'Open World', tutorial: 'Tutorial', multiplayer: 'Multiplayer', debug: 'Debug', 'faction-designs': 'Faction designs' })[route];

/** Callers that already obtained permission (animated navigation) pass approved. */
export function navigate(route: Route, approved = false) {
  if (!approved) { requestLeave(() => navigate(route, true)); return; }
  const path = ROUTE_PATHS[route];
  saveView();
  if (window.location.pathname !== path || window.location.search) {
    current = { index: (entry()?.index ?? current.index) + 1, from: routeFromPath(window.location.pathname) };
    window.history.pushState({ blockplayNavigation: current }, '', path);
  }
  acceptedPath = path;
  listeners.forEach(listener => listener());
}

export function useRoute(): Route {
  const read = () => routeFromPath(window.location.pathname);
  const [route, setRoute] = useState(() => {
    const canonical = canonicalUrl(window.location.pathname, window.location.search);
    if (canonical) window.history.replaceState(null, '', canonical);
    if (!initialized) {
      current = entry() ?? { index: 0 };
      window.history.scrollRestoration = 'manual';
      window.history.replaceState({ ...window.history.state, blockplayNavigation: current }, '');
      acceptedPath = window.location.pathname;
      initialized = true;
    }
    return read();
  });
  useEffect(() => {
    const update = () => setRoute(read());
    const history = (event: PopStateEvent) => {
      if (restoreHistory) { const restored = restoreHistory; restoreHistory = null; restored(); return; }
      const target = entry();
      if (!approvedHistory && hasNavigationGuard() && target && target.index !== current.index) {
        const delta = target.index - current.index;
        // Restore the current entry before asking: Cancel leaves both URL and run intact.
        restoreHistory = () => { requestLeave(() => { approvedHistory = true; window.history.go(delta); }); };
        window.history.go(-delta);
        return;
      }
      approvedHistory = false;
      saveView(); current = target ?? { index: 0 }; acceptedPath = window.location.pathname;
      update(); window.dispatchEvent(new CustomEvent('blockplay:history', { detail: { nativeTransition: !!(event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition } }));
    };
    listeners.add(update); window.addEventListener('popstate', history);
    return () => { listeners.delete(update); window.removeEventListener('popstate', history); };
  }, []);
  useLayoutEffect(() => {
    const snapshot = views.get(route);
    const frame = requestAnimationFrame(() => {
      // Game screens own their start/pause focus. Never focus their canvas automatically.
      if (['training', 'world', 'tutorial', 'multiplayer', 'debug'].includes(route)) { window.scrollTo(0, 0); return; }
      const element = (snapshot?.focus ? document.querySelector<HTMLElement>(snapshot.focus) : null)
        ?? document.querySelector<HTMLElement>('h1, main');
      if (element && !element.closest('[inert]')) {
        if (element.tabIndex < 0) element.tabIndex = -1;
        element.focus({ preventScroll: true });
      }
      window.scrollTo(0, snapshot?.scroll ?? 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);
  return route;
}
