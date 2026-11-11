import { isEquipmentRoute } from './equipment-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasNavigationGuard, requestLeave } from './navigation-guard';

/**
 * The player-facing screens and the developer shell. Paths rather than hashes,
 * so `/debug` is a URL worth sharing; the Cloudflare asset server and the
 * service worker both answer any extensionless navigation with the app shell.
 */
export const ROUTE_PATHS = {
  menu: '/', play: '/play', 'single-player': '/play/single-player', 'training-menu': '/play/training',
  tutorial: '/tutorial', training: '/training', world: '/world',
  'team-deathmatch': '/play/team-deathmatch',
  'dragon-courtyard': '/play/team-deathmatch/dragon-courtyard',
  'smith-street': '/play/team-deathmatch/smith-street',
  hardpoint: '/play/hardpoint', 'free-for-all': '/play/free-for-all',
  'multiplayer-menu': '/play/multiplayer',
  'host-team-deathmatch': '/play/multiplayer/team-deathmatch',
  'host-dragon-courtyard': '/play/multiplayer/team-deathmatch/dragon-courtyard',
  'host-smith-street': '/play/multiplayer/team-deathmatch/smith-street',
  'host-hardpoint': '/play/multiplayer/hardpoint',
  'host-free-for-all': '/play/multiplayer/free-for-all',
  multiplayer: '/multiplayer',
  store: '/store', inventory: '/inventory', settings: '/settings', debug: '/debug',
  'faction-designs': '/faction-designs',
} as const;

export type Route = keyof typeof ROUTE_PATHS;

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

type Entry = { index: number; menuPage?: 'title' | 'main' };
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
export const routeLabel = (route: Route) => ({
  menu: 'Main menu', play: 'Play', 'single-player': 'Single Player', 'multiplayer-menu': 'Multiplayer',
  'training-menu': 'Training', training: 'Live-fire range', tutorial: 'Tutorial',
  world: 'Open World', 'team-deathmatch': 'Team Deathmatch', 'dragon-courtyard': 'Dragon Courtyard', 'smith-street': 'Smith Street',
  hardpoint: 'Hardpoint', 'free-for-all': 'Free for All', multiplayer: 'Find a Room',
  'host-team-deathmatch': 'Team Deathmatch', 'host-dragon-courtyard': 'Dragon Courtyard', 'host-smith-street': 'Smith Street',
  'host-hardpoint': 'Hardpoint', 'host-free-for-all': 'Free for All',
  store: 'Store', inventory: 'Inventory', settings: 'Settings', debug: 'Debug', 'faction-designs': 'Faction designs',
})[route];

/** The title and main menu share a URL but are distinct navigation steps. */
export function getMenuPage() { return entry()?.menuPage; }

export function enterMainMenu() {
  if (getMenuPage() === 'main') return;
  current = { index: (entry()?.index ?? current.index) + 1, menuPage: 'main' };
  window.history.pushState({ blockplayNavigation: current }, '', ROUTE_PATHS.menu);
}

/** Every main-menu visit has a title screen immediately behind it. */
export function initializeMenuHistory(showTitle: boolean) {
  if (getMenuPage()) return;
  current = { index: entry()?.index ?? current.index, menuPage: 'title' };
  window.history.replaceState({ ...window.history.state, blockplayNavigation: current }, '', ROUTE_PATHS.menu);
  if (!showTitle) enterMainMenu();
}

export function returnToTitleScreen() {
  if (getMenuPage() === 'main') window.history.back();
}

/** Callers that already obtained permission (animated navigation) pass approved. */
export function navigate(route: Route, approved = false) {
  if (!approved) { requestLeave(() => navigate(route, true)); return; }
  const path = ROUTE_PATHS[route];
  saveView();
  if (window.location.pathname !== path || window.location.search) {
    current = { index: (entry()?.index ?? current.index) + 1 };
    window.history.pushState({ blockplayNavigation: current }, '', path);
  }
  if (route === 'menu') initializeMenuHistory(false);
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
  const displayedRoute = useRef(route);
  useLayoutEffect(() => {
    const previous = displayedRoute.current; displayedRoute.current = route;
    if (previous !== route && isEquipmentRoute(previous) && isEquipmentRoute(route)) return;
    const snapshot = views.get(route);
    const frame = requestAnimationFrame(() => {
      // Game screens own their start/pause focus. Never focus their canvas automatically.
      if (['tutorial', 'debug'].includes(route)) { window.scrollTo(0, 0); return; }
      const element = (snapshot?.focus ? document.querySelector<HTMLElement>(snapshot.focus) : null)
        ?? document.querySelector<HTMLElement>('h1') ?? document.querySelector<HTMLElement>('main');
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
