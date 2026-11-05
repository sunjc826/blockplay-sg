import { describe, expect, it, vi } from 'vitest';
import manifest from '../audio/combat/manifest.json';
import { HIT_CONFIRM_GAP, createEarRing, createSlideScrape, damageCues, grenadeBounces, hitConfirmGroups, lowHealthPulse, stepGroup } from './combat-feedback';
import type { LiveGrenade } from './grenade-system';
import { SFX_GROUPS, sfxUrls, type SfxGroup } from './sfx-bank';

const groups = (before: [number, number], after: [number, number]) => damageCues({ health: before[0], armor: before[1] }, { health: after[0], armor: after[1] }, 100).map(cue => cue.group);

describe('hit confirmation', () => {
  it('tells a hit, a headshot and a kill apart, and hears a head kill as both', () => {
    expect(hitConfirmGroups('hit', false)).toEqual(['combat-hit']);
    expect(hitConfirmGroups('hit', true)).toEqual(['combat-headshot']);
    expect(hitConfirmGroups('kill', false)).toEqual(['combat-kill']);
    expect(hitConfirmGroups('kill', true)).toEqual(['combat-kill', 'combat-headshot']);
    expect(HIT_CONFIRM_GAP).toBeLessThan(.08); // a 750 rpm gun lands one every 80 ms.
  });
});
describe('the slide scrape', () => {
  function fixture(state = 'running') {
    const param = () => ({ value: 0, setTargetAtTime: vi.fn() }), node = () => ({ connect: vi.fn(function (to) { return to; }), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param(), buffer: null, loop: false, type: '', onended: null });
    const sources: ReturnType<typeof node>[] = [], gains: ReturnType<typeof node>[] = [], filters: ReturnType<typeof node>[] = [];
    const context = { state, currentTime: 0, sampleRate: 100, createBuffer: () => ({ getChannelData: () => new Float32Array(100) }), createBufferSource: () => { const n = node(); sources.push(n); return n; }, createBiquadFilter: () => { const n = node(); filters.push(n); return n; }, createGain: () => { const n = node(); gains.push(n); return n; }, destination: {} };
    return { context: context as unknown as AudioContext, sources, gains, filters };
  }
  it('costs nothing between slides, follows the speed and stops its source afterwards', () => {
    const f = fixture(), scrape = createSlideScrape(() => f.context, () => false);
    scrape.update(0, 'concrete'); expect(f.sources).toHaveLength(0);
    scrape.update(1, 'concrete'); scrape.update(.5, 'concrete');
    expect(f.sources).toHaveLength(1);
    const levels = f.gains[0].gain.setTargetAtTime.mock.calls.map(call => call[0]);
    expect(levels[1]).toBeLessThan(levels[0]);
    scrape.update(0, 'concrete');
    expect(f.gains[0].gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBe(0);
    expect(f.sources[0].stop).toHaveBeenCalledOnce();
  });
  it('sounds brighter on metal than on dirt', () => {
    const metal = fixture(), dirt = fixture();
    createSlideScrape(() => metal.context, () => false).update(1, 'metal');
    createSlideScrape(() => dirt.context, () => false).update(1, 'dirt');
    expect(metal.filters[0].frequency.value).toBeGreaterThan(dirt.filters[0].frequency.value);
  });
  it('is silent when muted', () => {
    const f = fixture(), scrape = createSlideScrape(() => f.context, () => true);
    scrape.update(1, 'concrete'); expect(f.sources).toHaveLength(0);
  });
});
describe('taking damage', () => {
  it('sounds like what was hit', () => {
    expect(groups([100, 50], [95, 30])).toEqual(['combat-hurt-armor']);
    expect(groups([100, 10], [90, 0])).toEqual(['combat-hurt-break']);
    expect(groups([100, 0], [70, 0])).toEqual(['combat-hurt-body']);
  });
  it('lands heavy once nearly gone, plates or not, and at the end', () => {
    expect(groups([40, 0], [20, 0])).toEqual(['combat-hurt-heavy']);
    expect(groups([35, 30], [25, 20])).toEqual(['combat-hurt-armor', 'combat-hurt-heavy']);
    expect(groups([10, 0], [0, 0])).toEqual(['combat-hurt-heavy']);
  });
  it('stays out of the way of slivers and healing', () => {
    expect(groups([50, 0], [49.5, 0])).toEqual([]);
    expect(groups([50, 0], [60, 0])).toEqual([]);
    expect(groups([50, 20], [50, 40])).toEqual([]);
  });
  it('scales with the blow', () => {
    const level = (lost: number) => damageCues({ health: 100, armor: 0 }, { health: 100 - lost, armor: 0 }, 100)[0].level;
    expect(level(5)).toBeLessThan(level(30));
    expect(level(30)).toBeLessThanOrEqual(1);
  });
  it('quickens with the health band, and only then', () => {
    expect(lowHealthPulse(100, 100)).toBeNull();
    expect(lowHealthPulse(0, 100)).toBeNull();
    const low = lowHealthPulse(30, 100)!, critical = lowHealthPulse(10, 100)!;
    expect(low.breath).toBeNull();
    expect(critical.beat).toBeLessThan(low.beat);
    expect(critical.level).toBeGreaterThan(low.level);
    expect(critical.breath).toBeGreaterThan(0);
  });
});
describe('grenades in flight', () => {
  const grenade = (serial: number, vy: number, rested = false, vx = 0) => ({ serial, velocity: { x: vx, y: vy, z: 0 }, position: { x: 1, y: 0, z: 2 }, rested }) as LiveGrenade;
  it('clinks when falling turns into not falling, once per bounce', () => {
    const seen = new Map();
    expect(grenadeBounces([grenade(1, -6)], seen)).toEqual([]);
    expect(grenadeBounces([grenade(1, -7)], seen)).toEqual([]);
    expect(grenadeBounces([grenade(1, 3)], seen)).toHaveLength(1);
    expect(grenadeBounces([grenade(1, 2)], seen)).toEqual([]);
    expect(grenadeBounces([grenade(1, -4)], seen)).toEqual([]);
    expect(grenadeBounces([grenade(1, 0, true)], seen)).toHaveLength(1);
    expect(grenadeBounces([grenade(1, 0, true)], seen)).toEqual([]);
  });
  it('ignores a slow roll and forgets grenades that are gone', () => {
    const seen = new Map();
    grenadeBounces([grenade(1, -.5)], seen);
    expect(grenadeBounces([grenade(1, 0, true)], seen)).toEqual([]);
    grenadeBounces([], seen); expect(seen.size).toBe(0);
  });
});
describe('footstep surfaces', () => {
  it('routes every surface to a recording, and keeps the boots on concrete', () => {
    expect(stepGroup('concrete', false)).toBe('walk'); expect(stepGroup('concrete', true)).toBe('run');
    expect(stepGroup('metal', false)).toBe('combat-step-metal'); expect(stepGroup('wood', true)).toBe('combat-step-wood');
    expect(stepGroup('foliage', false)).toBe('combat-step-dirt'); expect(stepGroup('dirt', false)).toBe('combat-step-dirt');
    for (const surface of ['concrete', 'metal', 'wood', 'glass', 'foliage', 'dirt', 'flesh'] as const) expect(SFX_GROUPS).toContain(stepGroup(surface, false));
  });
});
describe('published recordings', () => {
  it('registers every group from its own folder, with short confirmations', () => {
    for (const group of Object.keys(manifest.groups) as SfxGroup[]) { expect(SFX_GROUPS).toContain(group); expect(sfxUrls(group, '/').every(url => url.startsWith('/audio/combat/'))).toBe(true); }
    const longest = (group: keyof typeof manifest.groups) => Math.max(...manifest.groups[group].map(take => take.seconds));
    expect(longest('combat-hit')).toBeLessThanOrEqual(.1);
    expect(longest('combat-kill')).toBeLessThanOrEqual(.3);
  });
  it('leaves out the takes that came back near silent', () => {
    const files = Object.values(manifest.groups).flat().map(take => take.file).join();
    for (const take of ['headshot-1-', 'headshot-2-', 'kill-1-', 'kill-2-', 'hurt-armor-1-', 'hurt-armor-3-', 'grenade-bounce-1-', 'grenade-bounce-3-']) expect(files).not.toContain(take);
  });
});
describe('ringing ears', () => {
  function fixture() {
    const tones: { stop: ReturnType<typeof vi.fn> }[] = [], gain = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    const context = { state: 'running', currentTime: 0, createGain: () => gain, createOscillator: () => { const tone = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }; tones.push(tone); return tone; } };
    return { context, gain, tones };
  }
  it('rings only while deafened, fades with the end of it, and costs nothing until needed', () => {
    const f = fixture(), ring = createEarRing(() => f.context as unknown as AudioContext, () => false);
    ring.update(undefined); expect(f.tones).toHaveLength(0);
    ring.update({ remaining: 5, strength: 1 });
    const full = f.gain.gain.setTargetAtTime.mock.calls[0][0]; expect(full).toBeGreaterThan(0);
    ring.update({ remaining: .5, strength: 1 }); expect(f.gain.gain.setTargetAtTime.mock.calls[1][0]).toBeLessThan(full);
    ring.update(undefined); expect(f.gain.gain.setTargetAtTime.mock.calls[2][0]).toBe(0);
    ring.dispose(); expect(f.tones[0].stop).toHaveBeenCalledOnce();
  });
  it('stays silent when muted', () => {
    const f = fixture(), ring = createEarRing(() => f.context as unknown as AudioContext, () => true);
    ring.update({ remaining: 5, strength: 1 }); expect(f.gain.gain.setTargetAtTime.mock.calls[0][0]).toBe(0);
  });
});
