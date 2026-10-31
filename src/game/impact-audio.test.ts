import { describe, expect, it, vi } from 'vitest';
import { createImpactAudio, impactTone, IMPACT_SOUND_RANGE, MAX_IMPACT_VOICES } from './impact-audio';
import { SURFACE_KINDS } from './fps-surfaces';
import { sfxUrls } from './sfx-bank';
import { gunshotTone } from './gunshot-audio';

function makeNode() {
  const n = { buffer: null as unknown, gain: { value: 0 }, pan: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 }, playbackRate: { value: 1 }, type: '',
    onended: null as (() => void) | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  n.connect.mockImplementation(() => n); return n;
}
function fixture(loaded = true) {
  const nodes: ReturnType<typeof makeNode>[] = [];
  function node() { const n = makeNode(); nodes.push(n); return n; }
  const context = { state: 'running', currentTime: 10, sampleRate: 44100, destination: {}, createBufferSource: vi.fn(node), createGain: node, createBiquadFilter: node, createStereoPanner: node,
    createBuffer: vi.fn((_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) })) };
  const take = { duration: .3 } as AudioBuffer, pick = vi.fn(() => loaded ? take : null);
  let muted = false;
  const audio = createImpactAudio(() => context as unknown as AudioContext, () => muted, { pick });
  return { audio, context, nodes, pick, take, mute: () => { muted = true; } };
}

describe('surface impact audio', () => {
  it('maps every material and water to at least two bundled takes', () => {
    for (const surface of [...SURFACE_KINDS, 'water'] as const) {
      const tone = impactTone(surface);
      expect(tone.sample).toBe(`impact-${surface}`);
      expect(sfxUrls(tone.sample, '/').length).toBeGreaterThanOrEqual(2);
    }
  });
  it('arrives from the impact after sound travel and falls quiet with distance or spent energy', () => {
    const near = impactTone('metal', 3), far = impactTone('metal', 80);
    expect(far.level).toBeLessThan(near.level / 6);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(far.delay).toBeCloseTo(80 / 343);
    expect(impactTone('metal', IMPACT_SOUND_RANGE).level).toBe(0);
    expect(impactTone('metal', 3, 0).level).toBe(0);
    expect(impactTone('metal', 3, .3).level).toBeLessThan(near.level);
    expect(impactTone('foliage').level).toBeLessThan(impactTone('concrete').level);
  });
  it('keeps combat-range hit transients in the mix beside the player muzzle report', () => {
    const muzzle = gunshotTone(5.56, 36, 0, true).level;
    expect(impactTone('concrete', 25).level).toBeGreaterThan(muzzle * .9);
    expect(impactTone('concrete', 50).level).toBeGreaterThan(muzzle * .35);
    expect(impactTone('flesh', 50).level).toBeGreaterThan(muzzle * .25);
    expect(impactTone('concrete', 80).level).toBeGreaterThan(muzzle * .15);
    // No distant loudness floor: nearby strikes stay stronger and the range
    // boundary, including invalid distances, remains silent.
    for (const surface of [...SURFACE_KINDS, 'water'] as const) {
      const levels = [0, 25, 50, 80, 120, 140].map(d => impactTone(surface, d).level);
      expect(levels[0]).toBeLessThan(.5);
      expect(levels.every((level, i) => i === 0 || level < levels[i - 1])).toBe(true);
      expect(impactTone(surface, NaN).level).toBe(0);
    }
  });
  it('plays the recorded material from the struck direction, through a distance lowpass', () => {
    const f = fixture(); f.audio.hit('glass', 34.3, -.7);
    expect(f.pick).toHaveBeenCalledWith('impact-glass');
    const [source, filter, gain, panner] = f.nodes;
    expect(source.buffer).toBe(f.take); expect(source.start).toHaveBeenCalledWith(10.1);
    expect(filter.frequency.value).toBeCloseTo(impactTone('glass', 34.3).cutoff);
    expect(gain.gain.value).toBeCloseTo(impactTone('glass', 34.3).level);
    expect(panner.pan.value).toBe(-.7);
    source.onended!(); expect(f.nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('falls back while unloaded and stops pending sounds on mute, pause or disposal', () => {
    const f = fixture(false); f.audio.hit('dirt', 90);
    expect(f.context.createBuffer).toHaveBeenCalledOnce();
    f.mute(); f.audio.update();
    expect(f.nodes[0].stop).toHaveBeenCalledOnce();
    f.audio.hit('metal', 2); expect(f.context.createBufferSource).toHaveBeenCalledOnce();
    f.audio.dispose(); expect(f.nodes[0].disconnect).toHaveBeenCalledOnce();
    const paused = fixture(); paused.audio.hit('wood', 30); paused.audio.clear();
    expect(paused.nodes[0].stop).toHaveBeenCalledOnce();
  });
  it('bounds bursts, releases completed voices and drops inaudible or suspended hits', () => {
    const f = fixture();
    f.audio.hit('metal', 200); f.context.state = 'suspended'; f.audio.hit('wood', 1);
    expect(f.pick).not.toHaveBeenCalled(); f.context.state = 'running';
    for (let i = 0; i < MAX_IMPACT_VOICES + 10; i++) f.audio.hit('concrete', 4);
    expect(f.context.createBufferSource).toHaveBeenCalledTimes(MAX_IMPACT_VOICES);
    f.nodes[0].onended!(); f.audio.hit('concrete', 4);
    expect(f.context.createBufferSource).toHaveBeenCalledTimes(MAX_IMPACT_VOICES + 1);
    f.audio.dispose();
    expect(f.nodes.filter(n => n.buffer).every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
