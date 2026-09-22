/**
 * Request routing for the service worker, kept free of worker globals so the
 * decisions can be unit-tested. The worker in `src/sw/service-worker.ts` does
 * the caching; everything that decides *what* happens to a request lives here.
 */

/** Same-origin directories that hold real files, never client-side routes. */
export const STATIC_PREFIXES = ['/assets/', '/audio/', '/models/', '/reconstruction/', '/icons/'] as const;

export type Route =
  /** Left to the network untouched: the companion API, uploads, other origins. */
  | 'bypass'
  /** A client-side route: answer navigations from the cached app shell. */
  | 'shell'
  /** Part of the build, cached at install time, served cache-first. */
  | 'precache'
  /** Scene geometry, weapon models and voice lines: cached the first time they are used. */
  | 'runtime';

export interface RouteInput {
  method: string;
  /** Absolute request URL. */
  url: string;
  /** Origin the worker is installed on. */
  origin: string;
  /** `request.mode === 'navigate'`. */
  navigate: boolean;
  /** A ranged media request, which the Cache API cannot answer with a 206. */
  range?: boolean;
}

const hasFileExtension = /\.[a-z0-9]{2,5}$/i;

/** True for build output and other names carrying a content hash, e.g. `index-9f3c2a1b.js`. */
export const isFingerprinted = (path: string): boolean => /[.-][0-9a-f]{8,}\.[a-z0-9]+$/i.test(path);

export function routeFor(input: RouteInput, precached: ReadonlySet<string>): Route {
  if (input.method !== 'GET') return 'bypass';
  let path: string;
  try {
    const url = new URL(input.url);
    if (url.origin !== input.origin) return 'bypass'; // Google Maps, fonts, OpenAI voice.
    path = url.pathname;
  } catch {
    return 'bypass';
  }
  // The companion and health endpoints must always see the live network: a
  // cached answer would claim the backend is reachable when it is not.
  if (path.startsWith('/api/')) return 'bypass';
  if (input.range) return 'bypass';
  const isFile = hasFileExtension.test(path) || STATIC_PREFIXES.some(prefix => path.startsWith(prefix));
  // Navigations are decided before the precache lookup: `/?room=…` is the same
  // app as `/`, and a cache lookup for that exact URL would miss it. A
  // navigation to a real page (`/connection-check.html`, the `/audio/encik/`
  // listening page) is left to the browser, which can follow the redirects and
  // content negotiation a cached response cannot carry.
  if (input.navigate) return isFile ? 'bypass' : 'shell';
  if (precached.has(path)) return 'precache';
  return 'runtime';
}

/**
 * Caches to drop on activation: everything from an older build, keeping the
 * current shell and the shared media cache.
 */
export function staleCaches(names: readonly string[], keep: readonly string[]): string[] {
  return names.filter(name => name.startsWith('blockplay-') && !keep.includes(name));
}

/**
 * Media entries to drop when the build changes. Content-hashed files (the voice
 * pack) are safe to keep across deployments; `scene.json` or a `.glb` under the
 * same name may have been rebuilt, so those are re-fetched once.
 */
export function stalePaths(paths: readonly string[]): string[] {
  return paths.filter(path => !isFingerprinted(path));
}
