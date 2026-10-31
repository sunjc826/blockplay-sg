import { describe, expect, it, vi } from 'vitest';
import { createGunshotAudio, gunshotTone } from './gunshot-audio';
import type { SfxGroup } from './sfx-bank';

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
}
function node() {
  return { connect: vi.fn(function(this: unknown) { return this; }), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
    gain: parameter(), pan: parameter(), frequency: parameter(), Q: parameter(), playbackRate: parameter(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(),
    buffer: null as unknown, type: '', curve: null as unknown, oversample: '' };
}
function fixture() {
  const gains: ReturnType<typeof node>[] = [], sources: ReturnType<typeof node>[] = [];
  const context = { state: 'running', currentTime: 5, sampleRate: 44100, destination: node(),
    createGain: () => { const n = node(); gains.push(n); return n; },
    createBufferSource: () => { const n = node(); sources.push(n); return n; },
    createBiquadFilter: node, createStereoPanner: node, createWaveShaper: node, createDynamicsCompressor: node,
    createBuffer: (_channels: number, size: number) => ({ getChannelData: () => new Float32Array(size) }) };
  const get = vi.fn((_group: SfxGroup, _index?: number) => ({ duration: .8 }) as AudioBuffer);
  let muted = false;
  const audio = createGunshotAudio(() => context as unknown as AudioContext, () => muted, { get });
  return { audio, context, gains, sources, get, mute: () => { muted = true; } };
}
const rifle = gunshotTone(5.56, 36, 0, true);
describe('automatic gunshot mixing', () => {
  it('keeps one reference report and tightly bounds pitch variation across a burst', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) f.audio.fire(rifle, 0, i * .075);
    expect(f.get.mock.calls).toHaveLength(20);
    expect(f.get.mock.calls.every(args => args[0] === 'rifle-556' && args[1] === 2)).toBe(true);
    expect(f.sources.every(n => n.playbackRate.value >= .996 && n.playbackRate.value <= 1.004)).toBe(true);
    expect(f.sources[0].start).toHaveBeenCalledWith(5);
  });
  it('crossfades old echoes at the next attack, leaving the final tail intact', () => {
    const f = fixture(); f.audio.fire(rifle); f.audio.fire(rifle, 0, .075);
    const envelope = f.gains.find(g => g.gain.cancelScheduledValues.mock.calls.length)!;
    expect(envelope.gain.cancelScheduledValues).toHaveBeenCalledWith(5.075);
    expect(envelope.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 5.135);
    expect(f.sources[0].stop.mock.calls[0][0]).toBeCloseTo(5.14);
    expect(f.sources[1].stop).not.toHaveBeenCalled();
    expect(f.sources[1].start).toHaveBeenCalledWith(5.075);
  });
  it('mixes each shooter independently, including shots inserted before a queued report', () => {
    const f = fixture();
    f.audio.fire(rifle, -.5, 0, 'actor:a'); f.audio.fire(rifle, .5, .05, 'actor:b');
    expect(f.sources.every(n => n.stop.mock.calls.length === 0)).toBe(true);
    f.audio.fire(rifle, -.5, .2, 'actor:a'); f.audio.fire(rifle, -.5, .1, 'actor:a');
    expect(f.sources[0].stop).toHaveBeenLastCalledWith(5.165);
    expect(f.sources[3].stop.mock.calls[0][0]).toBeCloseTo(5.265);
    expect(f.sources[1].stop).not.toHaveBeenCalled(); expect(f.sources[2].stop).not.toHaveBeenCalled();
  });
  it('cancels queued shots on mute or reset and releases every source on disposal', () => {
    const f = fixture(); f.audio.fire(rifle, 0, .2); f.mute(); f.audio.update();
    expect(f.sources[0].stop).toHaveBeenCalledWith(); expect(f.sources[0].disconnect).toHaveBeenCalledOnce();
    f.audio.fire(rifle); expect(f.sources).toHaveLength(1); f.audio.dispose();
    expect(f.sources[0].disconnect).toHaveBeenCalledOnce();
    const reset = fixture(); reset.audio.fire(rifle); reset.audio.clear();
    expect(reset.sources[0].disconnect).toHaveBeenCalledOnce();
  });
  it('bounds simultaneous reports and gives a new player shot a voice', () => {
    const f = fixture();
    for (let i = 0; i < 55; i++) f.audio.fire(rifle, 0, 0, `actor:${i}`);
    expect(f.sources).toHaveLength(48); f.audio.fire(rifle);
    expect(f.sources).toHaveLength(49); expect(f.sources[0].disconnect).toHaveBeenCalledOnce();
    f.audio.dispose(); expect(f.sources.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
