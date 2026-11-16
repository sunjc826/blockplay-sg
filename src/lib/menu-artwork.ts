import type { Route } from './routes';

/** Mode illustrations are shared by solo/host routes, independently of the home panorama. */
export const MODE_ARTWORK: Partial<Record<Route, string>> = {
  'single-player': 'mode-open-world', world: 'mode-open-world',
  'multiplayer-menu': 'mode-find-room', multiplayer: 'mode-find-room',
  'training-menu': 'mode-training', training: 'mode-training', tutorial: 'mode-tutorial',
  'team-deathmatch': 'mode-team-deathmatch', 'host-team-deathmatch': 'mode-team-deathmatch',
  hardpoint: 'mode-hardpoint', 'host-hardpoint': 'mode-hardpoint',
  'free-for-all': 'mode-free-for-all', 'host-free-for-all': 'mode-free-for-all',
};

/** The picture behind the selectors, and behind a panel with no illustration of its own. */
const BACKDROP = 'operations';

export const menuArtworkUrl = (name: string) => `/images/menu/${name}.jpg`;
export const panelArtworkUrl = (route: Route) => menuArtworkUrl(MODE_ARTWORK[route] ?? BACKDROP);

/**
 * Kept for the life of the page. A background picture is only requested once
 * an element using it is laid out, which is after the selector has appeared;
 * an image element requests it now, and while that element is alive the
 * browser hands the same loaded picture to the background instead of asking
 * the network again.
 */
const held = new Map<string, HTMLImageElement>();

function fetchArtwork() {
  for (const name of [BACKDROP, ...new Set(Object.values(MODE_ARTWORK))]) {
    if (held.has(name)) continue;
    const image = new Image();
    image.decoding = 'async';
    image.src = menuArtworkUrl(name);
    // Decoded ahead as well, so the first paint of a selector does not wait on eight JPEGs.
    image.decode?.().catch(() => { /* A failed picture is retried by the panel that needs it. */ });
    held.set(name, image);
  }
}

let started = false;

/**
 * Fetches every selector illustration from the home menu, so Single Player,
 * Multiplayer and Training open with their artwork already in place. Starts
 * after the page's own load, leaving the first screen's scripts, fonts and
 * panorama the connection to themselves.
 */
export function preloadModeArtwork() {
  if (started || typeof Image === 'undefined' || typeof document === 'undefined') return;
  // About three megabytes; someone who asked the browser to save data gets the pictures on demand.
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  started = true;
  if (document.readyState === 'complete') fetchArtwork();
  else window.addEventListener('load', fetchArtwork, { once: true });
}
