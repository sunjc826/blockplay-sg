import { describe, expect, it, vi } from 'vitest';
import manifest from '../audio/world/manifest.json';
import { SFX_GROUPS, sfxUrls, type SfxGroup } from './sfx-bank';
import { LOOP_PAD, createWorldLoops, crossedLightning, dragonBoatStroke, worldLoopTargets, type WorldSoundState } from './world-audio';

const base: WorldSoundState = { playing: true, deafened: false, vehicle: null, speed: 0, rain: 0, wind: 0, sheltered: false, coastal: false, merlionFiring: false, inMovingLift: false, parachuting: false, transport: null };
const targets = (change: Partial<WorldSoundState>) => worldLoopTargets({ ...base, ...change });

describe('what keeps sounding', () => {
  it('plays nothing while not playing, and only a trace while deafened', () => {
    expect(targets({ playing: false, rain: .8, vehicle: 'car' })).toEqual({});
    expect(targets({ deafened: true, rain: .8 }).rain!.level).toBeLessThan(targets({ rain: .8 }).rain!.level * .3);
  });
  it('keeps the city or the sea underneath everything, quieter from inside a cab', () => {
    expect(targets({}).bed!.group).toBe('world-city-loop');
    expect(targets({ coastal: true }).bed!.group).toBe('world-coast-loop');
    expect(targets({ vehicle: 'car' }).bed!.level).toBeLessThan(targets({}).bed!.level);
  });
  it('revs the car with speed and keeps a helicopter nearly steady', () => {
    expect(targets({ vehicle: 'car', speed: 25 }).vehicle!.rate).toBeGreaterThan(targets({ vehicle: 'car', speed: 2 }).vehicle!.rate!);
    expect(targets({ vehicle: 'helicopter' }).vehicle!.group).toBe('world-heli-loop');
    expect(Math.abs(targets({ vehicle: 'helicopter', speed: 60 }).vehicle!.rate! - 1)).toBeLessThan(.1);
    expect(targets({ vehicle: 'dragon-boat-red' }).vehicle).toBeUndefined();
  });
  it('quietens rain and wind under cover and in a cab, and has none in dry calm', () => {
    expect(targets({}).rain).toBeUndefined(); expect(targets({}).wind).toBeUndefined();
    expect(targets({ rain: .8, sheltered: true }).rain!.level).toBeLessThan(targets({ rain: .8 }).rain!.level);
    expect(targets({ rain: .8, vehicle: 'car' }).rain!.level).toBeLessThan(targets({ rain: .8 }).rain!.level);
    expect(targets({ wind: 3, sheltered: true }).wind!.level).toBeLessThan(targets({ wind: 3 }).wind!.level);
  });
  it('sounds set pieces only while they run, and a passing transport by its kind and distance', () => {
    expect(targets({ merlionFiring: true }).merlion!.group).toBe('world-merlion-jet');
    expect(targets({ inMovingLift: true }).lift!.group).toBe('world-lift-motor');
    expect(targets({ parachuting: true }).chute!.group).toBe('world-chute-wind');
    expect(targets({ transport: { mode: 'sea', gain: .5, effort: 1 } }).transport).toMatchObject({ group: 'world-boat-loop' });
    expect(targets({ transport: { mode: 'air', gain: .1, effort: 0 } }).transport!.level).toBeLessThan(targets({ transport: { mode: 'air', gain: .9, effort: 0 } }).transport!.level);
  });
  it('points every target at a published recording', () => {
    const everything = { rain: .8, wind: 3, merlionFiring: true, inMovingLift: true, parachuting: true };
    for (const change of [{ vehicle: 'car' }, { vehicle: 'helicopter' }, { coastal: true }, { transport: { mode: 'land', gain: 1, effort: 1 } }, { transport: { mode: 'air', gain: 1, effort: 1 } }, { transport: { mode: 'sea', gain: 1, effort: 1 } }] as Partial<WorldSoundState>[])
      for (const target of Object.values(targets({ ...everything, ...change }))) { expect(SFX_GROUPS).toContain(target.group); expect(target.level).toBeLessThanOrEqual(1); }
  });
});
describe('one-off world sounds', () => {
  it('beats a dragon boat faster the faster it goes, and not at all at rest or in a car', () => {
    expect(dragonBoatStroke('dragon-boat-red', 0)).toBeNull();
    expect(dragonBoatStroke('car', 10)).toBeNull();
    expect(dragonBoatStroke('dragon-boat-red', 8)!).toBeLessThan(dragonBoatStroke('dragon-boat-gold', 2)!);
  });
  it('catches each lightning flash once, including across a long frame and the clock wrap', () => {
    let flashes = 0; for (let t = 0; t < 46; t += .25) if (crossedLightning(t, t + .25)) flashes++;
    expect(flashes).toBe(2);
    expect(crossedLightning(.5, 1.5)).toBe(true);
    expect(crossedLightning(2, 3)).toBe(false);
    expect(crossedLightning(3599, 1)).toBe(false);
  });
  it('registers every published group from its own folder', () => {
    for (const group of Object.keys(manifest.groups) as SfxGroup[]) { expect(SFX_GROUPS).toContain(group); expect(sfxUrls(group, '/').every(url => url.startsWith('/audio/world/'))).toBe(true); }
    const files = Object.values(manifest.groups).flat().map(take => take.file).join();
    for (const take of ['world-aim-1-', 'world-aim-2-', 'dragon-drum-1-', 'dragon-drum-3-', 'scope-click-1-', 'switch-click-1-', 'switch-click-4-', 'streak-1-', 'inspect-1-', 'brass-2-', 'chute-wind-1-']) expect(files).not.toContain(take);
  });
});
describe('looping voices', () => {
  function fixture(loaded = true) {
    const sources: { buffer: unknown; loop: boolean; loopStart: number; loopEnd: number; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; playbackRate: { setTargetAtTime: ReturnType<typeof vi.fn> } }[] = [];
    const param = () => ({ value: 0, setTargetAtTime: vi.fn() }), node = (extra: object) => ({ connect: vi.fn(function (this: unknown, next: unknown) { return next; }), disconnect: vi.fn(), ...extra });
    const gains: { gain: ReturnType<typeof param> }[] = [];
    const context = { state: 'running', currentTime: 0, destination: {}, createBufferSource: () => { const source = node({ buffer: null, loop: false, loopStart: 0, loopEnd: 0, start: vi.fn(), stop: vi.fn(), playbackRate: param() }); sources.push(source as never); return source; }, createGain: () => { const gain = node({ gain: param() }); gains.push(gain as never); return gain; }, createStereoPanner: () => node({ pan: param() }) };
    const buffer = { duration: 5 } as AudioBuffer, loops = createWorldLoops(() => context as unknown as AudioContext, { get: () => loaded ? buffer : null });
    return { context, loops, sources, gains };
  }
  it('loops inside the padding, and starts no second voice for a repeat', () => {
    const f = fixture();
    f.loops.update({ rain: { group: 'world-rain-loop', level: .5 } }, false);
    f.loops.update({ rain: { group: 'world-rain-loop', level: .6 } }, false);
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0]).toMatchObject({ loop: true, loopStart: LOOP_PAD, loopEnd: 5 - LOOP_PAD });
    expect(f.loops.playing('rain')).toBe(true);
  });
  it('stays silent until the recording has loaded, so the synthesised fallback keeps working', () => {
    const f = fixture(false);
    f.loops.update({ vehicle: { group: 'world-car-loop', level: 1 } }, false);
    expect(f.sources).toHaveLength(0); expect(f.loops.playing('vehicle')).toBe(false);
  });
  it('fades out when no longer wanted, then releases the voice, and stops on dispose', () => {
    const f = fixture();
    f.loops.update({ rain: { group: 'world-rain-loop', level: .5 } }, false);
    f.loops.update({}, false); expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .18); expect(f.sources[0].stop).not.toHaveBeenCalled();
    f.context.currentTime = 2; f.loops.update({}, false); expect(f.sources[0].stop).toHaveBeenCalledOnce(); expect(f.loops.playing('rain')).toBe(false);
    f.loops.update({ wind: { group: 'world-wind-loop', level: .5 } }, false); f.loops.dispose(); expect(f.sources[1].stop).toHaveBeenCalledOnce();
  });
  it('fades to nothing when muted and changes voice when the recording changes', () => {
    const f = fixture();
    f.loops.update({ bed: { group: 'world-city-loop', level: .5 } }, false);
    f.loops.update({ bed: { group: 'world-city-loop', level: .5 } }, true); expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .18);
    f.loops.update({ bed: { group: 'world-coast-loop', level: .5 } }, false); expect(f.sources).toHaveLength(2); expect(f.sources[0].stop).toHaveBeenCalledOnce();
  });
});
