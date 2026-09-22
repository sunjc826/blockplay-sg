/**
 * blockplaySG service worker.
 *
 * Built by `scripts/service-worker-plugin.mjs` as a separate bundle so `sw.js`
 * lands unhashed at the site root (a worker only controls its own directory and
 * below). The plugin injects the two constants below; the routing rules live in
 * `../lib/sw-policy.ts` where they can be tested.
 *
 * What is cached, and when:
 *  - install: the build's app shell — HTML, JS, CSS, manifest, icons.
 *  - first use: scene geometry, weapon models and the Encik voice pack, which
 *    add up to ~10 MB and would make every install pay for districts nobody
 *    opened.
 *  - never: `/api/*`, so an offline companion reads as offline rather than
 *    replaying yesterday's answer.
 */
import { routeFor, staleCaches, stalePaths } from '../lib/sw-policy';

/** Injected at build time: every app-shell path, and a hash of that list. */
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

interface ExtendableEventLike { waitUntil(work: Promise<unknown>): void }
interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface MessageEventLike { data: unknown }
interface WorkerScope {
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
  location: { origin: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}
// `self` is typed as a Window by the app's DOM lib; reach the worker scope
// without redeclaring it.
const worker = globalThis as unknown as WorkerScope;

const SHELL_CACHE = `blockplay-shell-${__VERSION__}`;
/** Deliberately unversioned: a 2.6 MB voice pack should survive a deployment. */
const MEDIA_CACHE = 'blockplay-media';
/** The URL a navigation asks for, which is what the shell is cached under. */
const SHELL_DOCUMENT = '/';
/** Enough for every district's geometry plus the voice pack, with headroom. */
const MEDIA_ENTRY_LIMIT = 320;

const precached = new Set(__PRECACHE__);

/**
 * A response that arrived through a redirect cannot answer a navigation
 * request — the browser turns it into a network error — and the Cache API
 * remembers that flag. Cloudflare's asset server redirects `/index.html` to
 * `/`, so rebuild any redirected response into a plain one before storing or
 * serving it.
 */
async function withoutRedirect(response: Response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
}

worker.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(__PRECACHE__.map(async path => {
      // `cache: 'reload'` keeps a stale HTTP-cached copy of the page from being
      // installed as the shell of a build it does not match.
      const response = await fetch(new Request(path, { cache: 'reload' }));
      // Fail the install rather than activate a worker with half a build; the
      // previous one keeps serving.
      if (!response.ok) throw new Error(`Precache failed: ${path} responded ${response.status}`);
      await cache.put(path, await withoutRedirect(response));
    }));
  })());
});

worker.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(staleCaches(names, [SHELL_CACHE, MEDIA_CACHE]).map(name => caches.delete(name)));
    // Drop media whose filename carries no content hash: the same URL may hold
    // different bytes in this build.
    const media = await caches.open(MEDIA_CACHE);
    const keys = await media.keys();
    const stale = new Set(stalePaths(keys.map(request => new URL(request.url).pathname)));
    await Promise.all(keys.filter(request => stale.has(new URL(request.url).pathname)).map(request => media.delete(request)));
    await worker.clients.claim();
  })());
});

/** Oldest-first eviction; Cache API `keys()` preserves insertion order. */
async function trim(cache: Cache, limit: number) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map(request => cache.delete(request)));
}

/**
 * Serves from `cacheName`, falling back to the network. A miss that is worth
 * keeping is stored through `event.waitUntil`, so writing a 2 MB model to disk
 * keeps the worker alive without holding up the response.
 */
async function cacheFirst(event: FetchEventLike, cacheName: string, store: boolean) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const response = await fetch(event.request);
  // Only same-origin, complete, successful responses are worth keeping; an
  // opaque or partial one would poison the cache with an unreadable answer.
  if (store && response.ok && response.type === 'basic') {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trim(cache, MEDIA_ENTRY_LIMIT)));
  }
  return response;
}

async function appShell(request: Request) {
  const cache = await caches.open(SHELL_CACHE);
  const shell = await cache.match(SHELL_DOCUMENT);
  if (shell) return withoutRedirect(shell);
  return fetch(request);
}

worker.addEventListener('fetch', event => {
  const { request } = event;
  const route = routeFor({
    method: request.method,
    url: request.url,
    origin: worker.location.origin,
    navigate: request.mode === 'navigate',
    range: request.headers.has('range'),
  }, precached);
  if (route === 'bypass') return;
  if (route === 'shell') { event.respondWith(appShell(request)); return; }
  if (route === 'precache') { event.respondWith(cacheFirst(event, SHELL_CACHE, false)); return; }
  event.respondWith(cacheFirst(event, MEDIA_CACHE, true));
});

// The page offers a reload rather than swapping the build under a running
// game; this is what that button calls.
worker.addEventListener('message', event => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void worker.skipWaiting();
});
