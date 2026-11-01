import { describe, expect, it, vi } from 'vitest';
import { FPS_WEAPONS, createLoadout, fireWeapon } from './fps-rules';
import { canDryFire, createEmptyFireAudio, emptyFireSample } from './empty-fire-audio';
import { ARMORY_CATALOG } from './armory-catalog';
import { variantSpec } from './armory-state';
import { sfxUrls } from './sfx-bank';
import manifest from '../audio/empty-fire/manifest.json';

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
  const audio = createEmptyFireAudio(() => context as unknown as AudioContext, () => muted, { pick });
  return { audio, context, recorded, pick, sources, gains, mute() { muted = true; } };
}

describe('empty-trigger feedback', () => {
  it('only accepts an unspent trigger on an unready weapon outside reload and cooldown', () => {
    const weapon = FPS_WEAPONS[0], state = createLoadout()[0];
    expect(canDryFire(state, weapon, false)).toBe(false);
    state.magazine = 0; state.chambered = false;
    expect(canDryFire(state, weapon, false)).toBe(true);
    expect(canDryFire(state, weapon, true)).toBe(false);
    expect(fireWeapon(state, 0)).toBe(false);
    expect(state.magazine).toBe(0);
    state.cooldown = .01; expect(canDryFire(state, weapon, false)).toBe(false);
    state.cooldown = 0; state.reloadRemaining = .1;
    expect(canDryFire(state, weapon, false)).toBe(false);
    state.reloadRemaining = 0; state.magazine = 10; state.chambered = false;
    expect(canDryFire(state, weapon, false)).toBe(true);
    state.chambered = true; expect(canDryFire(state, weapon, false)).toBe(false);
    state.magazine = 1; state.magazineOut = true;
    expect(canDryFire(state, weapon, false)).toBe(false); // usable chamber round
  });
  it('routes every catalog weapon to a published receiver-specific recording', () => {
    expect(new Set(FPS_WEAPONS.map(emptyFireSample)).size).toBe(11);
    for (const item of ARMORY_CATALOG.filter(item => item.category === 'weapon')) {
      const weapon = variantSpec(item)!;
      expect(sfxUrls(emptyFireSample(weapon), '/')[0]).toMatch(/^\/audio\/(?:empty-fire|proxy)\/empty-fire-/);
      if (weapon.id === 'ultimax-inspired') expect(emptyFireSample(weapon)).toBe('empty-fire-drum');
    }
    expect(Object.keys(manifest.groups)).toHaveLength(8);
    expect(manifest.receipts.reduce((n, r) => n + r.credits, 0)).toBe(40);
  });
  it('plays at natural speed and bounds overlapping clicks to one voice', () => {
    const f = fixture(); f.audio.play(FPS_WEAPONS[0]);
    expect(f.sources[0].buffer).toBe(f.recorded);
    expect(f.sources[0].playbackRate.value).toBe(1);
    expect(f.sources[0].start).toHaveBeenCalledWith(10);
    f.audio.play(FPS_WEAPONS[2]);
    expect(f.sources[0].stop).toHaveBeenCalledOnce();
    f.sources[1].onended!(); f.audio.clear();
    expect(f.sources[1].disconnect).toHaveBeenCalledOnce();
  });
  it('drops cold clicks and respects mute, suspended audio, clear and disposal', () => {
    const cold = fixture(false); cold.audio.play(FPS_WEAPONS[0]);
    expect(cold.sources).toHaveLength(0);
    const f = fixture(); f.audio.play(FPS_WEAPONS[0]); f.mute(); f.audio.update();
    expect(f.sources[0].stop).toHaveBeenCalledOnce();
    f.audio.play(FPS_WEAPONS[0]); expect(f.sources).toHaveLength(1);
    const paused = fixture(); paused.context.state = 'suspended'; paused.audio.play(FPS_WEAPONS[0]);
    expect(paused.sources).toHaveLength(0);
    const active = fixture(); active.audio.play(FPS_WEAPONS[0]); active.audio.dispose(); active.audio.dispose();
    expect(active.sources[0].stop).toHaveBeenCalledOnce();
  });
});
