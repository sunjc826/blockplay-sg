import { describe, expect, it, vi } from 'vitest';
import { FPS_WEAPONS } from './fps-rules';
import { createReloadAudio, MAX_RELOAD_VOICES, reloadFoley, reloadMechanism, reloadSample } from './reload-audio';
import { sfxUrls } from './sfx-bank';
import manifest from '../audio/reload/manifest.json';
import { ARMORY_CATALOG, itemById } from './armory-catalog';
import { createProfile, resolveLoadout, variantSpec } from './armory-state';

const stages = ['MAG OUT', 'MAG IN', 'SEAT MAG', 'BOLT BACK', 'CHAMBER'] as const;
function fixture(loaded = true) {
  const sources: { buffer: AudioBuffer | null; playbackRate: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  const gains: { gain: { value: number }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = { currentTime: 10, state: 'running', sampleRate: 44100, destination: {},
    createBuffer: vi.fn((_n: number, frames: number) => { const data = new Float32Array(frames); return { getChannelData: () => data }; }),
    createBufferSource() {
      const source = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null };
      source.connect.mockReturnValue(source); sources.push(source); return source;
    },
    createGain() { const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; gain.connect.mockReturnValue(gain); gains.push(gain); return gain; },
  };
  const recorded = { duration: .3 } as AudioBuffer, pick = vi.fn(() => loaded ? recorded : null);
  let muted = false;
  const audio = createReloadAudio(() => context as unknown as AudioContext, () => muted, { pick });
  return { audio, context, recorded, pick, sources, gains, mute() { muted = true; } };
}

describe('weapon-specific reload audio', () => {
  it('gives all eight weapons their own five recorded actions and routes variants by their hardware', () => {
    const mechanisms = FPS_WEAPONS.map(reloadMechanism);
    expect(new Set(mechanisms).size).toBe(FPS_WEAPONS.length);
    for (const weapon of FPS_WEAPONS) for (const stage of stages) {
      const sample = reloadSample(weapon, stage);
      expect(sfxUrls(sample, '/')).toHaveLength(1);
      expect(sfxUrls(sample, '/')[0]).toMatch(/^\/audio\/reload\/reload-/);
    }
    expect(Object.keys(manifest.groups)).toHaveLength(40);
    expect(reloadMechanism({ ...FPS_WEAPONS[3], id: 'custom-mag-variant' })).toBe('belt');
    expect(reloadMechanism({ ...FPS_WEAPONS[4], id: 'custom-heavy-variant' })).toBe('heavy-belt');
  });
  it('plays the correct ElevenLabs action once at natural speed, independent of reload duration', () => {
    const f = fixture();
    for (const weapon of FPS_WEAPONS) {
      f.audio.play(weapon, 'MAG OUT');
      expect(f.pick).toHaveBeenLastCalledWith(reloadSample(weapon, 'MAG OUT'));
      const source = f.sources.at(-1)!;
      expect(source.buffer).toBe(f.recorded);
      expect(source.playbackRate.value).toBe(1);
      expect(source.start).toHaveBeenCalledWith(10);
      source.onended!();
    }
    expect(f.context.createBuffer).not.toHaveBeenCalled();
    expect(f.sources.every(s => s.disconnect.mock.calls.length === 1)).toBe(true);
    expect(f.gains.every(g => g.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('uses Kongsi box-magazine actions while retaining the Ultimax charging action, across the resolved loadout', () => {
    const profile = createProfile(); profile.guns[1].variant = 'ult-kongsi';
    const kongsi = resolveLoadout(profile).weapons[1];
    expect(kongsi.feed).toBe('magazine'); expect(kongsi.reload).toBe(1.5);
    for (const stage of ['MAG OUT', 'MAG IN', 'SEAT MAG'] as const) {
      expect(reloadSample(kongsi, stage)).toMatch(/^reload-rifle-/);
      expect(reloadSample(FPS_WEAPONS[1], stage)).toMatch(/^reload-drum-/);
    }
    for (const stage of ['BOLT BACK', 'CHAMBER'] as const) expect(reloadSample(kongsi, stage)).toBe(reloadSample(FPS_WEAPONS[1], stage));
    for (const item of ARMORY_CATALOG.filter(item => item.category === 'weapon')) {
      const spec = variantSpec(item)!;
      for (const stage of stages) expect(sfxUrls(reloadSample(spec, stage), '/')).toHaveLength(1);
      if (spec.feed === 'belt') expect(reloadSample(spec, 'MAG IN')).toMatch(/belt-in$/);
    }
    expect(variantSpec(itemById('ult-issued')!)!.feed).toBe('drum');
  });
  it('has distinct, finite, audible mechanical fallbacks with headroom and a silent tail', () => {
    const signatures = new Set<string>();
    for (const weapon of FPS_WEAPONS) for (const stage of stages) {
      const pcm = reloadFoley(weapon, stage, 22050);
      let peak = 0, energy = 0;
      expect(pcm.every(Number.isFinite)).toBe(true);
      for (const value of pcm) { peak = Math.max(peak, Math.abs(value)); energy += value ** 2; }
      expect(peak).toBeGreaterThan(.1); expect(peak).toBeLessThanOrEqual(.851);
      expect(energy).toBeGreaterThan(.1); expect(pcm.at(-1)).toBe(0);
      signatures.add(`${pcm[110]}:${pcm[500]}:${energy}`);
    }
    expect(signatures.size).toBe(40);
    const f = fixture(false);
    for (let i = 0; i < 5; i++) { f.audio.play(FPS_WEAPONS[3], 'MAG IN'); f.sources.at(-1)!.onended!(); }
    expect(f.context.createBuffer).toHaveBeenCalledTimes(2);
  });
  it('bounds voices, ignores non-actions and stops sounds on interruptions, mute, suspend and disposal', () => {
    const f = fixture();
    for (const label of ['RELOADING', 'READY', '']) f.audio.play(FPS_WEAPONS[0], label);
    expect(f.pick).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) f.audio.play(FPS_WEAPONS[4], 'CHAMBER');
    expect(f.sources).toHaveLength(MAX_RELOAD_VOICES);
    f.audio.clear(); f.audio.clear();
    expect(f.sources.every(s => s.stop.mock.calls.length === 1 && s.disconnect.mock.calls.length === 1)).toBe(true);
    f.audio.play(FPS_WEAPONS[0], 'MAG OUT'); f.mute(); f.audio.update();
    expect(f.sources.at(-1)!.stop).toHaveBeenCalledOnce();
    f.audio.play(FPS_WEAPONS[0], 'MAG IN'); expect(f.sources).toHaveLength(MAX_RELOAD_VOICES + 1);
    const suspended = fixture(); suspended.context.state = 'suspended'; suspended.audio.play(FPS_WEAPONS[0], 'MAG OUT');
    expect(suspended.sources).toHaveLength(0);
    suspended.context.state = 'running'; suspended.audio.play(FPS_WEAPONS[0], 'MAG OUT'); suspended.audio.dispose();
    expect(suspended.sources[0].stop).toHaveBeenCalledOnce();
  });
});
