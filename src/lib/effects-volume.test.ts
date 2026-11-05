import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'blockplay-sg-effects-volume-v1';
let stored: Record<string, string>;

const fakeContext = (state = 'running') => {
  const output = { connect: vi.fn(), gain: { value: -1, setTargetAtTime: vi.fn() } };
  return { state, currentTime: 3, destination: {}, createGain: vi.fn(() => output), output };
};
type Fake = ReturnType<typeof fakeContext>;
const asContext = (context: Fake) => context as unknown as BaseAudioContext;

class FakeAudio {
  preload = ''; volume = 1; readyState = 4; currentTime = 0; paused = true;
  load = vi.fn(); pause = vi.fn();
  play = vi.fn(() => Promise.resolve());
  constructor(public src: string) { made.push(this); }
}
const made: FakeAudio[] = [];

beforeEach(() => {
  vi.resetModules(); stored = {}; made.length = 0;
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored[key] ?? null, setItem: (key: string, value: string) => { stored[key] = value; } });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('document', { hidden: false });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('effects volume', () => {
  it('defaults to the full mix, restores a saved level and ignores a bad one', async () => {
    expect((await import('./effects-volume')).getEffectsVolume()).toBe(1);
    vi.resetModules(); stored[KEY] = '.35';
    expect((await import('./effects-volume')).getEffectsVolume()).toBe(.35);
    vi.resetModules(); stored[KEY] = 'loud';
    expect((await import('./effects-volume')).getEffectsVolume()).toBe(1);
    vi.resetModules(); stored[KEY] = '4';
    expect((await import('./effects-volume')).getEffectsVolume()).toBe(1);
  });
  it('still works when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', undefined);
    const { getEffectsVolume, setEffectsVolume } = await import('./effects-volume');
    expect(getEffectsVolume()).toBe(1);
    expect(() => setEffectsVolume(.5)).not.toThrow();
    expect(getEffectsVolume()).toBe(.5);
  });
  it('clamps and saves a new level', async () => {
    const { getEffectsVolume, setEffectsVolume } = await import('./effects-volume');
    setEffectsVolume(2); expect(getEffectsVolume()).toBe(1);
    setEffectsVolume(-1); expect(getEffectsVolume()).toBe(0);
    expect(stored[KEY]).toBe('0');
  });
  it('makes one output per context, at the saved level, wired to the speakers', async () => {
    stored[KEY] = '.25';
    const { effectsOutput } = await import('./effects-volume');
    const context = fakeContext();
    expect(effectsOutput(asContext(context))).toBe(context.output);
    expect(effectsOutput(asContext(context))).toBe(context.output);
    expect(context.createGain).toHaveBeenCalledTimes(1);
    expect(context.output.gain.value).toBe(.25);
    expect(context.output.connect).toHaveBeenCalledWith(context.destination);
  });
  it('moves running contexts to a new level and leaves closed ones alone', async () => {
    const { effectsOutput, setEffectsVolume } = await import('./effects-volume');
    const running = fakeContext(), closed = fakeContext();
    effectsOutput(asContext(running)); effectsOutput(asContext(closed));
    closed.state = 'closed';
    setEffectsVolume(.5);
    expect(running.output.gain.setTargetAtTime).toHaveBeenCalledWith(.5, 3, .02);
    expect(closed.output.gain.setTargetAtTime).not.toHaveBeenCalled();
  });
});

describe('menu and store sounds', () => {
  it('scale the menu click and keep its own level at full volume', async () => {
    const { setEffectsVolume } = await import('./effects-volume');
    const { playMenuSound } = await import('./menu-audio');
    playMenuSound('click');
    expect(made[1].volume).toBeCloseTo(.65);
    setEffectsVolume(.5);
    playMenuSound('click');
    expect(made[1].volume).toBeCloseTo(.325);
  });
  it('do not play when off, as iOS Safari ignores an element volume of zero', async () => {
    const { setEffectsVolume } = await import('./effects-volume');
    const menu = await import('./menu-audio'), store = await import('./store-audio');
    setEffectsVolume(0);
    menu.playMenuSound('click'); store.playStoreSound('purchase');
    expect(made.every(audio => audio.play.mock.calls.length === 0)).toBe(true);
  });
  it('scale store clips from each clip\'s own level', async () => {
    const { setEffectsVolume } = await import('./effects-volume');
    const { playStoreSound } = await import('./store-audio');
    setEffectsVolume(.5);
    playStoreSound('blocked');
    const played = made.find(audio => audio.play.mock.calls.length === 1)!;
    expect(played.volume).toBeCloseTo(.225);
  });
});

describe('sound routing', () => {
  it('leaves only music and this output connecting to the speakers directly', () => {
    const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
    });
    const direct = sources('src').filter(path => /\.connect\([^)]*\.destination\)|\?\? \w+\.destination|= \w+\.destination\b/.test(readFileSync(path, 'utf8')));
    expect(direct.map(path => path.replace(/\\/g, '/')).sort()).toEqual(['src/lib/effects-volume.ts', 'src/lib/music.ts']);
  });
});
