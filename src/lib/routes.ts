import { useEffect, useState } from 'react';

/**
 * The player-facing screens and the developer shell. Paths rather than hashes,
 * so `/debug` is a URL worth sharing; the Cloudflare asset server and the
 * service worker both answer any extensionless navigation with the app shell.
 */
export type Route = 'menu' | 'training' | 'world' | 'store' | 'debug';

export const ROUTE_PATHS: Record<Route, string> = {
  menu: '/', training: '/training', world: '/world', store: '/store', debug: '/debug',
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

const listeners = new Set<() => void>();

export function navigate(route: Route) {
  const path = ROUTE_PATHS[route];
  if (window.location.pathname !== path || window.location.search) window.history.pushState(null, '', path);
  listeners.forEach(listener => listener());
}

export function useRoute(): Route {
  const read = () => routeFromPath(window.location.pathname);
  const [route, setRoute] = useState(() => {
    const canonical = canonicalUrl(window.location.pathname, window.location.search);
    if (canonical) window.history.replaceState(null, '', canonical);
    return read();
  });
  useEffect(() => {
    const update = () => setRoute(read());
    listeners.add(update); window.addEventListener('popstate', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); };
  }, []);
  return route;
}
