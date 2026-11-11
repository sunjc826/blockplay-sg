import { isEquipmentRoute } from './equipment-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasNavigationGuard, requestLeave } from './navigation-guard';
import { getMenuDesign } from './menu-design';

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
  'faction-designs': '/faction-designs', 'prop-designs': '/prop-designs',
} as const;

export type Route = keyof typeof ROUTE_PATHS;

/** Shared hierarchy for on-screen links and native/browser Back. */
export function parentRoute(route: Route): Route {
  switch (route) {
    case 'single-player': case 'multiplayer-menu': return getMenuDesign() === 'classic' ? 'play' : 'menu';
    case 'training-menu': case 'world': case 'team-deathmatch': case 'hardpoint': case 'free-for-all': return 'single-player';
    case 'training': case 'tutorial': return 'training-menu';
    case 'dragon-courtyard': case 'smith-street': return 'team-deathmatch';
    case 'host-dragon-courtyard': case 'host-smith-street': return 'host-team-deathmatch';
    case 'multiplayer': case 'host-team-deathmatch': case 'host-hardpoint': case 'host-free-for-all': return 'multiplayer-menu';
    default: return 'menu';
  }
}

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

type Entry = { index: number; menuPage?: 'title' | 'main'; hierarchy?: true };
const listeners = new Set<() => void>();
const views = new Map<Route, { scroll: number; focus?: string }>();
let current: Entry = { index: 0 };
let initialized = false;
let restoreHistory: (() => void) | null = null;
let approvedHistory = false;
let acceptedPath = '';
let backAction: (() => void) | null = null;

/** A deployed session sits one level below its district picker at the same URL. */
export function useBackAction(action: (() => void) | null) {
  useLayoutEffect(() => {
    backAction = action;
    return () => { if (backAction === action) backAction = null; };
  }, [action]);
}

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
  store: 'Store', inventory: 'Inventory', settings: 'Settings', debug: 'Debug', 'faction-designs': 'Faction designs', 'prop-designs': 'Street props',
})[route];

/** The title and main menu share a URL but are distinct navigation steps. */
export function getMenuPage() { return entry()?.menuPage; }

export function enterMainMenu() {
  if (getMenuPage() === 'main') return;
  current = { index: (entry()?.index ?? current.index) + 1, menuPage: 'main', hierarchy: true };
  window.history.pushState({ blockplayNavigation: current }, '', ROUTE_PATHS.menu);
}

/** Every main-menu visit has a title screen immediately behind it. */
export function initializeMenuHistory(showTitle: boolean) {
  if (getMenuPage()) return;
  current = { index: entry()?.index ?? current.index, menuPage: 'title', hierarchy: true };
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
    current = { index: (entry()?.index ?? current.index) + 1, hierarchy: true };
    window.history.pushState({ blockplayNavigation: current }, '', path);
  }
  if (route === 'menu') initializeMenuHistory(false);
  acceptedPath = path;
  listeners.forEach(listener => listener());
}

/** Seed a same-document Back step even for an installed app opened at a deep link. */
export function initializeRouteHistory() {
  if (initialized) return;
  const path = window.location.pathname;
  const url = path + window.location.search + (window.location.hash || '');
  current = entry()?.hierarchy ? entry()! : { index: 0, hierarchy: true };
  window.history.scrollRestoration = 'manual';
  window.history.replaceState({ ...window.history.state, blockplayNavigation: current }, '');
  if (current.index === 0 && routeFromPath(path) !== 'menu') {
    initializeMenuHistory(true);
    enterMainMenu();
    current = { index: 2, hierarchy: true };
    window.history.pushState({ blockplayNavigation: current }, '', url);
  }
  acceptedPath = path;
  initialized = true;
}

/** Native Android Back arrives here too; the popped URL is not its destination. */
export function handleRouteHistory(event: PopStateEvent) {
  if (restoreHistory) { const restored = restoreHistory; restoreHistory = null; restored(); return; }
  const target = entry();
  const notify = () => {
    listeners.forEach(listener => listener());
    window.dispatchEvent(new CustomEvent('blockplay:history', { detail: { nativeTransition: !!(event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition } }));
  };
  const delta = target ? target.index - current.index : 0;
  if (!approvedHistory && target && delta < 0) {
    const from = routeFromPath(acceptedPath);
    if (from === 'menu' && current.menuPage === 'main') {
      // Collapse all previous detours to the original title. Back there can exit.
      const title = () => { current = entry()!; acceptedPath = ROUTE_PATHS.menu; notify(); };
      if (target.index > 0) { restoreHistory = title; window.history.go(-target.index); }
      else title();
      return;
    }
    if (from !== 'menu') {
      const action = backAction ?? (() => navigate(parentRoute(from), true));
      // Restore before prompting so Cancel preserves the URL and the running game.
      restoreHistory = () => { requestLeave(() => { saveView(); action(); notify(); }); };
      window.history.go(-delta);
      return;
    }
  }
  if (!approvedHistory && hasNavigationGuard() && target && delta !== 0) {
    restoreHistory = () => { requestLeave(() => { approvedHistory = true; window.history.go(delta); }); };
    window.history.go(-delta);
    return;
  }
  approvedHistory = false;
  saveView(); current = target ?? { index: 0 }; acceptedPath = window.location.pathname;
  notify();
}

export function useRoute(): Route {
  const read = () => routeFromPath(window.location.pathname);
  const [route, setRoute] = useState(() => {
    const canonical = canonicalUrl(window.location.pathname, window.location.search);
    if (canonical) window.history.replaceState(null, '', canonical);
    initializeRouteHistory();
    return read();
  });
  useEffect(() => {
    const update = () => setRoute(read());
    listeners.add(update); window.addEventListener('popstate', handleRouteHistory);
    return () => { listeners.delete(update); window.removeEventListener('popstate', handleRouteHistory); };
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
