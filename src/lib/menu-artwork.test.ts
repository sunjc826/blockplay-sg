import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const made: FakeImage[] = [];
class FakeImage {
  src = '';
  decoding = '';
  decode = vi.fn(() => Promise.reject(new Error('no decoder')));
  constructor() { made.push(this); }
}
let onLoad: (() => void) | undefined;
function stubPage(readyState: string, saveData = false) {
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', { readyState });
  vi.stubGlobal('navigator', { connection: { saveData } });
  vi.stubGlobal('window', { addEventListener: (type: string, listener: () => void) => { if (type === 'load') onLoad = listener; } });
}
beforeEach(() => { vi.resetModules(); made.length = 0; onLoad = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('mode selector artwork', () => {
  it('fetches each illustration and the backdrop once, however often a menu asks', async () => {
    stubPage('complete');
    const artwork = await import('./menu-artwork');
    artwork.preloadModeArtwork(); artwork.preloadModeArtwork();
    const names = [...new Set(Object.values(artwork.MODE_ARTWORK))];
    expect(made.map(image => image.src).sort()).toEqual(['operations', ...names].map(artwork.menuArtworkUrl).sort());
    expect(made.every(image => image.decode.mock.calls.length === 1)).toBe(true);
  });
  it('asks for the same address a panel paints, and every picture exists', async () => {
    stubPage('complete');
    const artwork = await import('./menu-artwork');
    artwork.preloadModeArtwork();
    const fetched = new Set(made.map(image => image.src));
    for (const route of ['single-player', 'multiplayer-menu', 'training-menu', 'tutorial', 'host-hardpoint', 'free-for-all', 'store'] as const) {
      expect(fetched.has(artwork.panelArtworkUrl(route))).toBe(true);
    }
    for (const url of fetched) expect(existsSync(`public${url}`), url).toBe(true);
  });
  it('waits for the page to finish loading first', async () => {
    stubPage('loading');
    const artwork = await import('./menu-artwork');
    artwork.preloadModeArtwork();
    expect(made).toHaveLength(0);
    onLoad?.();
    expect(made.length).toBeGreaterThan(0);
  });
  it('leaves the pictures to be fetched on demand when the browser is saving data', async () => {
    stubPage('complete', true);
    const artwork = await import('./menu-artwork');
    artwork.preloadModeArtwork();
    expect(made).toHaveLength(0);
  });
});
