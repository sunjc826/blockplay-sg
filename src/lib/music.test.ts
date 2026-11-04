import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../audio/music/manifest.json';

type Source = { buffer: unknown; loop: boolean; loopStart: number; loopEnd: number; onended: (() => void) | null; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
const makeGain = () => ({ connect: vi.fn(), gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } });
const contexts: FakeContext[] = [];
class FakeContext {
  currentTime = 0;
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  gains: ReturnType<typeof makeGain>[] = [];
  sources: Source[] = [];
  decodeAudioData = vi.fn(() => Promise.resolve({ duration: 60.5 }));
  constructor() { contexts.push(this); }
  createGain() { const gain = makeGain(); this.gains.push(gain); return gain; }
  createBufferSource() {
    const source: Source = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, onended: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.sources.push(source);
    return source;
  }
  /** The master gain is first; each voice's follows in the order it started. */
  voiceRamp(index: number) { return this.gains[index + 1].gain.linearRampToValueAtTime.mock.lastCall; }
}

const listeners: Record<string, Set<() => void>> = {};
const target = {
  addEventListener: (type: string, listener: () => void) => { (listeners[type] ??= new Set()).add(listener); },
  removeEventListener: (type: string, listener: () => void) => { listeners[type]?.delete(listener); },
};
const fire = (type: string) => [...(listeners[type] ?? [])].forEach(listener => listener());
const settled = () => new Promise(resolve => setImmediate(resolve));
const KEY = 'blockplay-sg-menu-music-volume-v1';
let stored: Record<string, string>;
let activated: boolean;
let fetcher: ReturnType<typeof vi.fn>;
const fetched = () => fetcher.mock.calls.map(call => String(call[0]));

beforeEach(() => {
  vi.resetModules(); contexts.length = 0; stored = {}; activated = true;
  for (const type of Object.keys(listeners)) delete listeners[type];
  fetcher = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('window', { ...target, AudioContext: FakeContext });
  vi.stubGlobal('document', { ...target, hidden: false });
  vi.stubGlobal('navigator', { get userActivation() { return { hasBeenActive: activated }; } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored[key] ?? null, setItem: (key: string, value: string) => { stored[key] = value; } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('music tracks', () => {
  it('ships every published take, and each loop is exactly 32 bars at 128 BPM', () => {
    for (const track of Object.values(manifest.tracks)) {
      const path = `public/audio/music/${track.file}`;
      expect(existsSync(path)).toBe(true);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(track.sha256);
    }
    for (const { loopStart, loopEnd } of [manifest.tracks.menu, manifest.tracks.map, manifest.tracks.spawn]) {
      expect(loopEnd - loopStart).toBe(32 * 4 * 60 / 128);
      expect(loopStart).toBeGreaterThan(0);
    }
  });

  it('puts the theme on the browsing screens and leaves play screens to their own cues', async () => {
    const { hasMenuTheme } = await import('./music');
    expect(['menu', 'inventory', 'settings', 'store'].every(hasMenuTheme)).toBe(true);
    expect(['tutorial', 'training', 'world', 'multiplayer', 'debug'].some(hasMenuTheme)).toBe(false);
  });
});

describe('loops', () => {
  it('fetches nothing until the first gesture, then loops from the first loop point and fades in', async () => {
    activated = false;
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(0);
    fire('pointerdown');
    await settled();
    const source = contexts[0].sources[0];
    expect(fetched()[0]).toContain(manifest.tracks.menu.file);
    expect(source).toMatchObject({ loop: true, loopStart: manifest.tracks.menu.loopStart, loopEnd: manifest.tracks.menu.loopEnd });
    expect(source.start).toHaveBeenCalledWith(0, manifest.tracks.menu.loopStart);
    expect(contexts[0].voiceRamp(0)).toEqual([1, .5]);
    expect(contexts[0].gains[0].gain.value).toBe(.4);
  });

  it('retries a held context on gestures without loading the track twice', async () => {
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    fire('touchend');
    await settled();
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(contexts[0].sources).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('crossfades between cues in one context, stopping the old track after its fade', async () => {
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    music.setMusicCue('map');
    expect(contexts[0].voiceRamp(0)).toEqual([0, .5]);
    await settled();
    expect(contexts[0].sources).toHaveLength(2);
    expect(contexts[0].sources[1].loopEnd).toBe(manifest.tracks.map.loopEnd);
    expect(contexts[0].voiceRamp(1)).toEqual([1, .5]);
    expect(contexts[0].sources[0].stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(contexts[0].sources[0].stop).toHaveBeenCalled();
    expect(contexts[0].close).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(1);
  });

  it('fades out, then frees the tracks and context on going quiet', async () => {
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    music.setMusicCue(null);
    expect(contexts[0].voiceRamp(0)).toEqual([0, .5]);
    expect(contexts[0].close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(contexts[0].sources[0].stop).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
    fire('pointerdown');
    expect(contexts).toHaveLength(1);
  });

  it('keeps playing when the same cue comes back during the fade', async () => {
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    music.setMusicCue(null);
    music.setMusicCue('menu');
    vi.advanceTimersByTime(1000);
    expect(contexts[0].close).not.toHaveBeenCalled();
    expect(contexts[0].sources[0].stop).not.toHaveBeenCalled();
    expect(contexts[0].voiceRamp(0)).toEqual([1, .5]);
    expect(contexts[0].sources).toHaveLength(1);
  });

  it('does not start a track that finishes loading after the player moved on', async () => {
    const music = await import('./music');
    music.setMusicCue('menu');
    music.setMusicCue(null);
    await settled();
    expect(contexts[0].sources).toHaveLength(0);
  });

  it('suspends while the page is hidden and resumes on return', async () => {
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    const resumed = contexts[0].resume.mock.calls.length;
    vi.stubGlobal('document', { ...target, hidden: true });
    fire('visibilitychange');
    expect(contexts[0].suspend).toHaveBeenCalledTimes(1);
    vi.stubGlobal('document', { ...target, hidden: false });
    fire('visibilitychange');
    expect(contexts[0].resume.mock.calls.length).toBeGreaterThan(resumed);
  });

  it('remembers the volume, loads nothing at zero, and starts when turned back up', async () => {
    stored[KEY] = '0';
    const music = await import('./music');
    music.setMusicCue('menu');
    await settled();
    expect(fetcher).not.toHaveBeenCalled();
    music.setMusicVolume(.35);
    await settled();
    expect(stored[KEY]).toBe('0.35');
    expect(contexts[0].sources).toHaveLength(1);
    expect(contexts[0].gains[0].gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(contexts[0].gains[0].gain.value).toBe(.35);
  });

  it('stays silent when the file cannot load, and ignores a bad saved volume', async () => {
    stored[KEY] = 'loud';
    fetcher.mockResolvedValueOnce({ ok: false });
    const music = await import('./music');
    expect(music.getMusicVolume()).toBe(.4);
    music.setMusicCue('menu');
    await settled();
    expect(contexts[0].sources).toHaveLength(0);
  });
});

describe('stingers', () => {
  it('plays once without looping, and frees the context when it ends with no cue left', async () => {
    const music = await import('./music');
    await music.playMusicStinger('win');
    const source = contexts[0].sources[0];
    expect(fetched()[0]).toContain(manifest.tracks.win.file);
    expect(source.loop).toBe(false);
    expect(source.start).toHaveBeenCalled();
    expect(contexts[0].close).not.toHaveBeenCalled();
    source.onended?.();
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it('outlives the loop fading under it, so the descent can follow the spawn track', async () => {
    const music = await import('./music');
    music.setMusicCue('spawn');
    await settled();
    music.prepareMusicStinger('descent');
    await settled();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    music.setMusicCue(null);
    await music.playMusicStinger('descent');
    vi.advanceTimersByTime(1000);
    expect(contexts[0].close).not.toHaveBeenCalled();
    expect(fetched().filter(url => url.includes(manifest.tracks.descent.file))).toHaveLength(1);
    contexts[0].sources[1].onended?.();
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it('cancels one that is still loading when stopped', async () => {
    const music = await import('./music');
    const playing = music.playMusicStinger('lose');
    music.stopMusicStinger();
    await playing;
    expect(contexts[0].sources).toHaveLength(0);
  });

  it('skips stingers while muted by the slider or the page is hidden', async () => {
    stored[KEY] = '0';
    const music = await import('./music');
    await music.playMusicStinger('win');
    music.prepareMusicStinger('descent');
    expect(contexts).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
