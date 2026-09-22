import { describe, expect, it } from 'vitest';
import { isFingerprinted, routeFor, staleCaches, stalePaths, type RouteInput } from './sw-policy';

const ORIGIN = 'https://blockplaysg.fun';
const SHELL = new Set(['/', '/assets/index-9f3c2a1b.js', '/assets/three-77a1c0de.js', '/manifest.webmanifest']);
const request = (url: string, extra: Partial<RouteInput> = {}) =>
  routeFor({ method: 'GET', url, origin: ORIGIN, navigate: false, ...extra }, SHELL);

describe('service worker routing', () => {
  it('serves the app shell for a client-side route', () => {
    expect(request(`${ORIGIN}/`, { navigate: true })).toBe('shell');
    expect(request(`${ORIGIN}/play/queenstown`, { navigate: true })).toBe('shell');
    expect(request(`${ORIGIN}/?room=abc`, { navigate: true })).toBe('shell');
  });

  it('does not answer a real page with the app shell', () => {
    // These are files the deployment actually serves, not routes the app owns,
    // and the browser handles them better than a cached copy would.
    expect(request(`${ORIGIN}/connection-check.html`, { navigate: true })).toBe('bypass');
    expect(request(`${ORIGIN}/audio/encik/`, { navigate: true })).toBe('bypass');
  });

  it('answers a navigation from the shell even when the URL carries a query', () => {
    // '/' is precached, but `cache.match('/?room=abc')` would miss it.
    expect(request(`${ORIGIN}/?room=abc`, { navigate: true })).toBe('shell');
    expect(request(`${ORIGIN}/`, { navigate: true })).toBe('shell');
    // Fetched as a file rather than navigated to, it is a precache hit.
    expect(request(`${ORIGIN}/`)).toBe('precache');
  });

  it('serves build output from the install-time cache', () => {
    expect(request(`${ORIGIN}/assets/index-9f3c2a1b.js`)).toBe('precache');
    expect(request(`${ORIGIN}/manifest.webmanifest`)).toBe('precache');
  });

  it('caches scenes, models and voice lines on first use', () => {
    expect(request(`${ORIGIN}/models/field-kit/sar21-inspired.glb`)).toBe('runtime');
    expect(request(`${ORIGIN}/audio/encik/reload-1-0dde60ee82.mp3`)).toBe('runtime');
    expect(request(`${ORIGIN}/reconstruction/marina-bay/scene.json`)).toBe('runtime');
  });

  it('never caches the companion API, so an offline backend reads as offline', () => {
    expect(request(`${ORIGIN}/api/health`)).toBe('bypass');
    expect(request(`${ORIGIN}/api/adventure/pilot-plan`)).toBe('bypass');
    expect(request(`${ORIGIN}/api/adventure/voice`, { navigate: true })).toBe('bypass');
  });

  it('leaves other origins, writes and ranged media alone', () => {
    expect(request('https://maps.googleapis.com/maps/api/js')).toBe('bypass');
    expect(request(`${ORIGIN}/api/adventure/pilot-plan`, { method: 'POST' })).toBe('bypass');
    expect(request(`${ORIGIN}/assets/index-9f3c2a1b.js`, { method: 'POST' })).toBe('bypass');
    // The Cache API cannot answer a range request with a 206.
    expect(request(`${ORIGIN}/audio/encik/reload-1-0dde60ee82.mp3`, { range: true })).toBe('bypass');
  });

  it('bypasses a request whose URL cannot be parsed', () => {
    expect(request('not a url')).toBe('bypass');
  });
});

describe('cache housekeeping', () => {
  it('keeps the current shell and the media cache, and drops older builds', () => {
    const names = ['blockplay-shell-aaaa', 'blockplay-shell-bbbb', 'blockplay-media', 'workbox-precache'];
    expect(staleCaches(names, ['blockplay-shell-bbbb', 'blockplay-media'])).toEqual(['blockplay-shell-aaaa']);
  });

  it('leaves caches belonging to something else on the origin', () => {
    expect(staleCaches(['some-other-app'], ['blockplay-media'])).toEqual([]);
  });

  it('re-fetches media that could have changed under the same name', () => {
    const cached = [
      '/audio/encik/reload-1-0dde60ee82.mp3',
      '/models/field-kit/sar21-inspired.glb',
      '/reconstruction/marina-bay/scene.json',
      '/reconstruction/marina-bay/view-0.jpg',
    ];
    expect(stalePaths(cached)).toEqual([
      '/models/field-kit/sar21-inspired.glb',
      '/reconstruction/marina-bay/scene.json',
      '/reconstruction/marina-bay/view-0.jpg',
    ]);
  });

  it('recognises a content hash wherever the build puts it', () => {
    expect(isFingerprinted('/assets/index-9f3c2a1b.js')).toBe(true);
    expect(isFingerprinted('/assets/index.9f3c2a1b.css')).toBe(true);
    expect(isFingerprinted('/models/manifest.json')).toBe(false);
  });
});
