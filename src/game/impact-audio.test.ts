import { describe, expect, it, vi } from 'vitest';
import { createImpactAudio, impactSoundWeight, impactTone, IMPACT_SOUND_RANGE, MAX_IMPACT_VOICES } from './impact-audio';
import { SURFACE_KINDS } from './fps-surfaces';
import { sfxUrls } from './sfx-bank';
import { gunshotTone } from './gunshot-audio';
import { impactProfile } from './fps-impact-profile';

// These fakes count every node a sound makes; the shared output outlives the sound.
vi.mock('../lib/effects-volume', () => ({ effectsOutput: (context: BaseAudioContext) => context.destination }));

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
    expect(far.level).toBeLessThan(near.level / 2);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(far.delay).toBeCloseTo(80 / 343);
    expect(impactTone('metal', IMPACT_SOUND_RANGE).level).toBe(0);
    expect(impactTone('metal', 3, 0).level).toBe(0);
    expect(impactTone('metal', 20, .3).level).toBeLessThan(impactTone('metal', 20).level);
    expect(impactTone('foliage', 20).level).toBeLessThan(impactTone('concrete', 20).level);
  });
  it('uses inverse-distance amplitude after the near-field cap, with stronger close hits and quiet distant hits', () => {
    const muzzle = gunshotTone(5.56, 36, 0, true).level;
    expect(impactTone('concrete', 10).level).toBeCloseTo(.8);
    expect(impactTone('concrete', 20).level).toBeCloseTo(.4);
    expect(impactTone('concrete', 40).level).toBeCloseTo(.2);
    expect(impactTone('concrete', 80).level).toBeCloseTo(.1);
    for (const surface of [...SURFACE_KINDS, 'water'] as const) {
      const near = impactTone(surface, 20).level, far = impactTone(surface, 40).level;
      expect(far / near).toBeCloseTo(.5);
      expect((far / near) ** 2).toBeCloseTo(.25);
    }
    expect(impactTone('concrete', 25).level).toBeGreaterThan(muzzle);
    expect(impactTone('concrete', 80).level).toBeLessThan(muzzle * .35);
    expect(impactTone('concrete', 80).cutoff).toBeGreaterThan(8500);
    // No distant loudness floor: nearby strikes stay stronger and the range
    // boundary, including invalid distances, remains silent.
    for (const surface of [...SURFACE_KINDS, 'water'] as const) {
      const levels = [0, 25, 50, 80, 120, 140].map(d => impactTone(surface, d).level);
      expect(levels[0]).toBeLessThan(.85);
      expect(levels.every((level, i) => i === 0 || level < levels[i - 1])).toBe(true);
      expect(impactTone(surface, NaN).level).toBe(0);
    }
  });
  it('smoothly fades only near the range boundary and caps all near-field weapon/material combinations', () => {
    expect(impactTone('concrete', 100).level).toBeCloseTo(.08);
    expect(impactTone('concrete', 120).level).toBeCloseTo(8 / 120 * .5);
    expect(impactTone('concrete', 139.9).level).toBeGreaterThan(0);
    expect(impactTone('concrete', 140).level).toBe(0);
    for (const distance of [0, -10, .01, 1, 3]) {
      expect(impactTone('metal', distance, 2, impactProfile(25, 256)).level).toBe(.82);
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
  it('uses the decal profile to scale calibre and power independently, retaining material and spent energy', () => {
    const rifle = impactProfile(), wider = impactProfile(7.62, 36), stronger = impactProfile(5.56, 60), heavy = impactProfile(12.7, 145);
    expect(impactSoundWeight(rifle)).toBe(1);
    for (const profile of [wider, stronger, heavy]) expect(impactTone('concrete', 50, 1, profile).level).toBeGreaterThan(impactTone('concrete', 50, 1, rifle).level);
    expect(impactTone('concrete', 50, 1, heavy).level).toBeGreaterThan(impactTone('concrete', 50, 1, rifle).level * 1.7);
    expect(impactTone('concrete', 50, .2, heavy).level).toBeLessThan(impactTone('concrete', 50, 1, heavy).level);
    expect(impactTone('foliage', 50, 1, heavy).level).toBeLessThan(impactTone('metal', 50, 1, heavy).level);
    expect(impactTone('metal', 0, 2, heavy).level).toBeLessThanOrEqual(.82);
    const malformed = { ...heavy, holeRadius: Infinity, holeDepth: NaN };
    expect(Number.isFinite(impactSoundWeight(malformed))).toBe(true);
    expect(impactTone('concrete', IMPACT_SOUND_RANGE, 1, heavy).level).toBe(0);
  });
  it('passes a resolved weapon profile to recorded playback', () => {
    const f = fixture(), profile = impactProfile(12.7, 145);
    f.audio.hit('metal', 50, 0, .5, profile);
    expect(f.nodes[2].gain.value).toBeCloseTo(impactTone('metal', 50, .5, profile).level);
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
