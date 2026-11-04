import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../audio/music/manifest.json';

const contexts: FakeContext[] = [];
class FakeContext {
  currentTime = 0;
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  gainNode = { connect: vi.fn(), gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } };
  sources: { buffer: unknown; loop: boolean; loopStart: number; loopEnd: number; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  decodeAudioData = vi.fn(() => Promise.resolve({ duration: 60.5 }));
  constructor() { contexts.push(this); }
  createGain() { return this.gainNode; }
  createBufferSource() {
    const source = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.sources.push(source);
    return source;
  }
  lastRamp() { return this.gainNode.gain.linearRampToValueAtTime.mock.lastCall; }
}

const listeners: Record<string, Set<() => void>> = {};
const target = {
  addEventListener: (type: string, listener: () => void) => { (listeners[type] ??= new Set()).add(listener); },
  removeEventListener: (type: string, listener: () => void) => { listeners[type]?.delete(listener); },
};
const fire = (type: string) => [...(listeners[type] ?? [])].forEach(listener => listener());
const settled = () => new Promise(resolve => setImmediate(resolve));
let stored: Record<string, string>;
let activated: boolean;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules(); contexts.length = 0; stored = {}; activated = false;
  for (const type of Object.keys(listeners)) delete listeners[type];
  fetcher = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('window', { ...target, AudioContext: FakeContext });
  vi.stubGlobal('document', { ...target, hidden: false });
  vi.stubGlobal('navigator', { get userActivation() { return { hasBeenActive: activated }; } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored[key] ?? null, setItem: (key: string, value: string) => { stored[key] = value; } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('menu music', () => {
  it('ships the published take, with loop points exactly 32 bars apart at 128 BPM', () => {
    const { file, sha256, loopStart, loopEnd } = manifest.tracks.menu;
    const path = `public/audio/music/${file}`;
    expect(existsSync(path)).toBe(true);
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(sha256);
    expect(loopEnd - loopStart).toBe(32 * 4 * 60 / 128);
    expect(loopStart).toBeGreaterThan(0);
  });

  it('plays over the menu, Inventory and Settings only', async () => {
    const { hasMenuMusic } = await import('./menu-music');
    expect(['menu', 'inventory', 'settings'].every(hasMenuMusic)).toBe(true);
    expect(['store', 'tutorial', 'training', 'world', 'multiplayer', 'debug'].some(hasMenuMusic)).toBe(false);
  });

  it('fetches nothing until the first gesture, then loops from the first loop point and fades in', async () => {
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    await settled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(0);
    fire('pointerdown');
    await settled();
    const source = contexts[0].sources[0];
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(source).toMatchObject({ loop: true, loopStart: manifest.tracks.menu.loopStart, loopEnd: manifest.tracks.menu.loopEnd });
    expect(source.start).toHaveBeenCalledWith(0, manifest.tracks.menu.loopStart);
    expect(contexts[0].lastRamp()).toEqual([.4, .5]);
  });

  it('starts straight away when the player has already interacted, and retries a suspended context on gestures', async () => {
    activated = true;
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    await settled();
    expect(contexts[0].sources).toHaveLength(1);
    fire('touchend');
    await settled();
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(contexts[0].sources).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fades out, then frees the track and context on leaving', async () => {
    activated = true;
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    await settled();
    vi.useFakeTimers();
    music.setMenuMusicWanted(false);
    expect(contexts[0].lastRamp()).toEqual([0, .5]);
    expect(contexts[0].close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(contexts[0].sources[0].stop).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
    fire('pointerdown');
    expect(contexts).toHaveLength(1);
  });

  it('keeps playing when the player comes back during the fade', async () => {
    activated = true;
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    await settled();
    vi.useFakeTimers();
    music.setMenuMusicWanted(false);
    music.setMenuMusicWanted(true);
    vi.advanceTimersByTime(1000);
    expect(contexts[0].close).not.toHaveBeenCalled();
    expect(contexts[0].lastRamp()).toEqual([.4, .5]);
    expect(contexts[0].sources).toHaveLength(1);
  });

  it('does not start a track that finishes loading after the player left', async () => {
    activated = true;
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    music.setMenuMusicWanted(false);
    await settled();
    expect(contexts[0].sources).toHaveLength(0);
  });

  it('suspends while the page is hidden and resumes on return', async () => {
    activated = true;
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    await settled();
    const resumed = contexts[0].resume.mock.calls.length;
    vi.stubGlobal('document', { ...target, hidden: true });
    fire('visibilitychange');
    expect(contexts[0].suspend).toHaveBeenCalledTimes(1);
    vi.stubGlobal('document', { ...target, hidden: false });
    fire('visibilitychange');
    expect(contexts[0].resume).toHaveBeenCalledTimes(resumed + 1);
  });

  it('remembers the volume, loads nothing at zero, and starts when turned back up', async () => {
    stored['blockplay-sg-menu-music-volume-v1'] = '0';
    activated = true;
    const music = await import('./menu-music');
    music.setMenuMusicWanted(true);
    await settled();
    expect(fetcher).not.toHaveBeenCalled();
    music.setMenuMusicVolume(.35);
    await settled();
    expect(stored['blockplay-sg-menu-music-volume-v1']).toBe('0.35');
    expect(contexts[0].sources).toHaveLength(1);
    expect(contexts[0].lastRamp()).toEqual([.35, .5]);
  });

  it('stays silent when the file cannot load, and ignores a bad saved volume', async () => {
    stored['blockplay-sg-menu-music-volume-v1'] = 'loud';
    activated = true;
    fetcher.mockResolvedValueOnce({ ok: false });
    const music = await import('./menu-music');
    expect(music.getMenuMusicVolume()).toBe(.4);
    music.setMenuMusicWanted(true);
    await settled();
    expect(contexts[0].sources).toHaveLength(0);
  });
});
