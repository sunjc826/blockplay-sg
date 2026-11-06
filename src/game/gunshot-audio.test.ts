import { describe, expect, it, vi } from 'vitest';
import { SPEED_OF_SOUND } from './combat-event-audio';
import { createGunshotAudio, gunshotSample, gunshotTone, MAX_REMOTE_GUNSHOTS, playGunshot } from './gunshot-audio';
import type { GunshotAcoustics } from './gunshot-acoustics';

const rifle = (distance = 0, own = false) => gunshotTone(5.56, 36, distance, own);

describe('gunshot tone', () => {
  it('gives a heavier gun a bigger, deeper thump and a longer echo', () => {
    const pistol = gunshotTone(9, 28, 0, true), mg = gunshotTone(7.62, 60, 0, true), heavy = gunshotTone(12.7, 160, 0, true);
    for (const [light, big] of [[pistol, rifle(0, true)], [rifle(0, true), mg], [mg, heavy]]) {
      expect(big.thump).toBeGreaterThan(light.thump);
      expect(big.thumpTo).toBeLessThan(light.thumpTo);
      expect(big.tailLength).toBeGreaterThan(light.tailLength);
      expect(big.level).toBeGreaterThan(light.level);
    }
    expect(heavy.thumpTo).toBeLessThan(45);
  });
  it('puts our own gun at the ear, louder than another beside us', () => {
    expect(rifle(0, true).level).toBeGreaterThan(rifle(5).level);
    expect(rifle(0, true).delay).toBe(0);
  });
  it('loses the crack to distance before the rumble, and arrives late', () => {
    const near = rifle(10), far = rifle(300);
    expect(far.crack / near.crack).toBeLessThan(far.thump / near.thump);
    expect(far.bodyCutoff).toBeLessThan(near.bodyCutoff);
    expect(far.tailLength).toBeGreaterThan(near.tailLength);
    expect(far.tailSpread).toBeGreaterThan(near.tailSpread);
    expect(far.delay).toBeCloseTo(300 / SPEED_OF_SOUND);
  });
  it('is silent out of earshot', () => {
    expect(rifle(650).level).toBe(0);
  });
  it('adds graded bass and recorded reflections to heavy guns while keeping suppressed fire restrained', () => {
    const mg = gunshotTone(7.62, 60), heavy = gunshotTone(12.7, 160);
    expect(rifle().sampleBassDb).toBe(0); expect(rifle().sampleEcho).toBe(0);
    expect(gunshotTone(9, 28).sampleBassDb).toBe(0);
    expect(mg.sampleBassDb).toBe(3); expect(heavy.sampleBassDb).toBe(6);
    expect(heavy.sampleEcho).toBeGreaterThan(mg.sampleEcho);
    expect(gunshotTone(12.7, 160, 200).sampleBassDb).toBeLessThan(heavy.sampleBassDb);
    const suppressed = gunshotTone(12.7, 160, 0, true, 'suppressor');
    expect(suppressed.sampleBassDb).toBe(0); expect(suppressed.sampleEcho).toBe(0);
  });
  it('plays each calibre\'s recorded takes, fading into a distant take and losing its top with range', () => {
    expect([9, 5.56, 7.62, 12.7].map(c => gunshotSample(c).near)).toEqual(['pistol-9', 'rifle-556', 'mg-762', 'hmg-127']);
    expect(gunshotSample(12.7).far).toBe('distant-heavy');
    expect(gunshotTone(5.56, 36, 0, false, 'suppressor').sample).toBe('suppressed');
    expect(rifle(10).nearMix).toBe(1);
    expect(rifle(300).nearMix).toBe(0);
    expect(rifle(120).nearMix).toBeGreaterThan(rifle(160).nearMix);
    expect(rifle(300).sampleCutoff).toBeLessThan(rifle(10).sampleCutoff / 3);
  });
});

it('keeps reflected sources alive through the last echo and cancels every scheduled heavy-gun layer', () => {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const nodes: { disconnect: ReturnType<typeof vi.fn> }[] = [];
  const source = () => {
    const n = { gain: param(), pan: param(), frequency: param(), Q: param(), playbackRate: param(), type: '', buffer: null,
      connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    n.connect.mockImplementation(() => n); nodes.push(n); return n;
  };
  const sources: ReturnType<typeof source>[] = [];
  const context = { createGain: source, createStereoPanner: source, createBiquadFilter: source,
    createBufferSource() { const n = source(); sources.push(n); return n; } } as unknown as BaseAudioContext;
  const sample = { duration: .2 } as AudioBuffer, onEnd = vi.fn();
  const voice = playGunshot(context, {} as AudioNode, sample, gunshotTone(12.7, 160, 0, true), 10, 0, { get: () => sample }, onEnd)!;
  expect(sources).toHaveLength(4);
  expect(voice.end).toBeGreaterThan(10.5);
  voice.fade(10.1);
  expect(sources.every(s => s.stop.mock.calls.some(([at]) => at === 10.165))).toBe(true);
  voice.stop(); voice.stop();
  expect(nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  expect(sources.every(s => s.onended === null)).toBe(true);
  expect(onEnd).toHaveBeenCalledOnce();
});

it('reuses the room impulse across shots and releases the convolution tail on burst handoff or stop', () => {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const nodes: { disconnect: ReturnType<typeof vi.fn> }[] = [];
  const node = () => {
    const n = { gain: param(), pan: param(), frequency: param(), Q: param(), playbackRate: param(), type: '', buffer: null as AudioBuffer | null,
      connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    n.connect.mockImplementation(() => n); nodes.push(n); return n;
  };
  const sources: ReturnType<typeof node>[] = [], reverbs: ReturnType<typeof node>[] = [];
  const createBuffer = vi.fn((_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }));
  const context = { sampleRate: 8000, createBuffer, createGain: node, createStereoPanner: node, createBiquadFilter: node,
    createConvolver() { const n = node(); reverbs.push(n); return n; },
    createBufferSource() { const n = node(); sources.push(n); return n; } } as unknown as BaseAudioContext;
  const sample = { duration: .15 } as AudioBuffer, space: GunshotAcoustics = {
    kind: 'enclosed', reflections: [{ delay: .02, gain: .3, cutoff: 4800 }], directTail: .45, wet: .26, decay: .98, cutoff: 4800,
  };
  const tone = gunshotTone(5.56, 36, 0, true, undefined, space), firstEnd = vi.fn(), secondEnd = vi.fn();
  const first = playGunshot(context, {} as AudioNode, sample, tone, 10, 0, { get: () => sample }, firstEnd)!;
  const firstClock = sources.at(-1)!;
  const second = playGunshot(context, {} as AudioNode, sample, tone, 10.1, 0, { get: () => sample }, secondEnd)!;
  expect(createBuffer).toHaveBeenCalledOnce(); expect(reverbs[0].buffer).toBe(reverbs[1].buffer);
  expect(first.end).toBeGreaterThan(11.1);
  first.fade(10.1); expect(firstClock.stop).toHaveBeenCalledWith(10.165);
  firstClock.onended!(); first.stop(); second.stop(); second.stop();
  expect(firstEnd).toHaveBeenCalledOnce(); expect(secondEnd).toHaveBeenCalledOnce();
  expect(nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
});

it('keeps only the loudest few of other people\'s shots sounding at once, never at the cost of our own', () => {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => {
    const n = { gain: param(), pan: param(), frequency: param(), Q: param(), playbackRate: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
      type: '', buffer: null, curve: null, oversample: '', loop: false, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    n.connect.mockImplementation(() => n); return n;
  };
  const sources: ReturnType<typeof node>[] = [];
  const context = { state: 'running', currentTime: 0, sampleRate: 8000, createBuffer: (_c: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
    createGain: node, createStereoPanner: node, createBiquadFilter: node, createWaveShaper: node, createDynamicsCompressor: node, createConvolver: node, createOscillator: node,
    createBufferSource() { const n = node(); sources.push(n); return n; } } as unknown as AudioContext;
  const sample = { duration: .2 } as AudioBuffer;
  const audio = createGunshotAudio(() => context, () => false, { get: () => sample }, () => node() as unknown as AudioNode);
  for (let i = 0; i < MAX_REMOTE_GUNSHOTS; i++) audio.fire(gunshotTone(5.56, 36, 120), 0, 0, `bot:${i}`);
  const playing = sources.length;
  audio.fire(gunshotTone(5.56, 36, 300), 0, 0, 'bot:far');
  expect(sources).toHaveLength(playing);
  audio.fire(gunshotTone(5.56, 36, 20), 0, 0, 'bot:near');
  expect(sources.length).toBeGreaterThan(playing);
  // The quietest was faded to make room.
  expect(sources.some(s => s.stop.mock.calls.some(([at]) => at === .065 + 120 / SPEED_OF_SOUND))).toBe(true);
  const before = sources.length;
  audio.fire(gunshotTone(5.56, 36, 0, true));
  expect(sources.length).toBeGreaterThan(before);
});
