import { describe, expect, it, vi } from 'vitest';
import { bulletPass, BULLET_PASS_RANGE, createBulletFlybyAudio, MAX_BULLET_PASS_VOICES } from './bullet-flyby-audio';
import { muzzleBallistics } from './fps-ballistics';
import { sfxUrls } from './sfx-bank';

const ear = { x: 0, y: 1.75, z: 0 };
const start = (x = 1) => ({ x, y: 1.75, z: -10 });
const end = (x = 1) => ({ x, y: 1.75, z: 10 });

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
  const audio = createBulletFlybyAudio(() => context as unknown as AudioContext, () => muted, { pick });
  const pass = (round = {}, from = start(), to = end(), velocity = 495) => audio.pass(round, from, to, ear, velocity, () => -.75);
  return { audio, context, nodes, pick, take, pass, mute: () => { muted = true; } };
}

describe('bullet pass proximity', () => {
  it('uses closest distance to the traveled path in all three dimensions', () => {
    expect(bulletPass(start(2), end(2), ear, 495)).toMatchObject({ distance: 2, fraction: .5, point: { x: 2, y: 1.75, z: 0 } });
    expect(bulletPass({ x: 0, y: 4.75, z: -10 }, { x: 0, y: 4.75, z: 10 }, ear, 495)?.distance).toBe(3);
    // A faraway muzzle with a near flight still cracks; a nearby shooter firing
    // away from the ear does not. Cover clips a round before this plane.
    expect(bulletPass({ x: 1, y: 1.75, z: -100 }, end(), ear, 495)?.distance).toBe(1);
    expect(bulletPass(start(), { ...end(), z: -1 }, ear, 495)).toBeNull();
    expect(bulletPass({ ...start(), z: 1 }, end(), ear, 495)).toBeNull();
  });
  it('fades sharply with lateral distance, dulls, delays and goes silent at 18 m', () => {
    const passes = [0, 1, 3, 8, 15].map(d => bulletPass(start(d), end(d), ear, 495)!);
    expect(passes.every((p, i) => !i || p.level < passes[i - 1].level)).toBe(true);
    expect(passes[3].level).toBeLessThan(passes[1].level / 5);
    expect(passes[3].cutoff).toBeLessThan(passes[1].cutoff);
    expect(passes[3].delay).toBeCloseTo(8 / 343);
    expect(bulletPass(start(BULLET_PASS_RANGE), end(BULLET_PASS_RANGE), ear, 495)).toBeNull();
  });
  it('respects real supersonic speed despite arcade scaling and rejects invalid paths', () => {
    expect(bulletPass(start(), end(), ear, muzzleBallistics(900).velocity)).not.toBeNull();
    expect(bulletPass(start(), end(), ear, muzzleBallistics(300).velocity)).toBeNull();
    expect(bulletPass(start(), start(), ear, 495)).toBeNull();
    expect(bulletPass(start(), end(), ear, NaN)).toBeNull();
    expect(bulletPass(start(), end(), { ...ear, x: Infinity }, 495)).toBeNull();
  });
});

describe('recorded bullet crack and echo', () => {
  it('bundles two ElevenLabs pass takes and schedules a quieter, duller echo at natural speed', () => {
    expect(sfxUrls('bullet-pass', '/')).toHaveLength(2);
    const f = fixture(), pass = bulletPass(start(), end(), ear, 495)!;
    f.audio.pass({}, start(), end(), ear, 495, () => -.75, .1);
    expect(f.pick).toHaveBeenCalledWith('bullet-pass');
    const [source, filter, gain, panner, echo, echoFilter, echoGain] = f.nodes;
    expect(source.buffer).toBe(f.take); expect(source.playbackRate.value).toBe(1);
    expect(source.start).toHaveBeenCalledWith(10.1 + pass.delay);
    expect(echo.start).toHaveBeenCalledWith(10.1 + pass.delay + .075);
    expect(panner.pan.value).toBe(-.75);
    expect(echoGain.gain.value).toBeLessThan(gain.gain.value / 4);
    expect(echoFilter.frequency.value).toBeLessThan(filter.frequency.value);
    echo.onended!(); expect(f.nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('announces each round once across adjacent flight segments and repeated snapshots', () => {
    const f = fixture(), round = {};
    f.pass(round, start(), { ...end(), z: -1 }); expect(f.pick).not.toHaveBeenCalled();
    f.pass(round); f.pass(round); expect(f.pick).toHaveBeenCalledOnce();
    f.pass({}); expect(f.pick).toHaveBeenCalledTimes(2);
  });
  it('bounds dense bursts, skips subsonic/distant passes and cancels cracks and echoes on pause/mute', () => {
    const f = fixture(); f.pass({}, start(25), end(25)); f.pass({}, start(), end(), 100);
    expect(f.pick).not.toHaveBeenCalled();
    for (let i = 0; i < MAX_BULLET_PASS_VOICES + 4; i++) f.pass();
    expect(f.pick).toHaveBeenCalledTimes(MAX_BULLET_PASS_VOICES);
    f.mute(); f.audio.update();
    expect(f.nodes.filter(n => n.buffer).every(n => n.stop.mock.calls.length === 1)).toBe(true);
    f.pass(); expect(f.pick).toHaveBeenCalledTimes(MAX_BULLET_PASS_VOICES);
    f.audio.dispose(); expect(f.nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
    const paused = fixture(); paused.pass(); paused.context.state = 'suspended'; paused.audio.update();
    expect(paused.nodes[0].stop).toHaveBeenCalledOnce();
  });
  it('caches a small fallback while the recordings load and clears scheduled sounds', () => {
    const f = fixture(false); f.pass(); f.pass();
    expect(f.context.createBuffer).toHaveBeenCalledOnce();
    f.audio.clear(); expect(f.nodes[0].stop).toHaveBeenCalledOnce();
  });
});
