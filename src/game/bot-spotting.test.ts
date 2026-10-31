import { describe, expect, it, vi } from 'vitest';
import { createBotSpotting, spottingGain, spottingStance, type SpottingCandidate } from './bot-spotting';

const candidate = (extra: Partial<SpottingCandidate> = {}): SpottingCandidate => ({ id: 'player', life: 0,
  position: { x: 0, y: 1.75, z: 65 }, distance: 65, referenceRange: 65, speed: 0, stance: 'stand', ...extra });
function detectionTime(target: SpottingCandidate, dt = .02, flashes = false) {
  const spotting = createBotSpotting();
  for (let now = dt; now < 100; now += dt) {
    if (flashes) target = { ...target, flashAt: Math.floor((now - dt) / .12) * .12 };
    if (spotting.update([target], now, dt, () => true)) return now;
  }
  throw Error('Target was never identified');
}

describe('gradual visual spotting', () => {
  it('takes longer as distance grows, preserving an advantage for marksmen', () => {
    const times = [20, 65, 150, 250].map(distance => detectionTime(candidate({ distance })));
    expect(times[0]).toBeGreaterThan(.3); expect(times[0]).toBeLessThan(.5);
    expect(times[1]).toBeCloseTo(1.2, 1);
    expect(times[2]).toBeGreaterThan(3); expect(times[3]).toBeGreaterThan(8);
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
    expect(detectionTime(candidate({ distance: 150, referenceRange: 110 }))).toBeLessThan(times[2]);
  });
  it('spots walking and sprinting players sooner, with crouch and prone concealment', () => {
    const standing = detectionTime(candidate({ distance: 150 }));
    const walking = detectionTime(candidate({ distance: 150, speed: 4.2 }));
    const sprinting = detectionTime(candidate({ distance: 150, speed: 7 }));
    const crouched = detectionTime(candidate({ distance: 150, stance: 'crouch' }));
    const prone = detectionTime(candidate({ distance: 150, stance: 'prone' }));
    expect(sprinting).toBeLessThan(walking); expect(walking).toBeLessThan(standing);
    expect(standing).toBeLessThan(crouched); expect(crouched).toBeLessThan(prone);
  });
  it('uses accepted flash strength: compensator > bare > suppressor > quiet', () => {
    const quiet = detectionTime(candidate({ distance: 150 }));
    const suppressed = detectionTime(candidate({ distance: 150, flare: .1 }), .02, true);
    const bare = detectionTime(candidate({ distance: 150, flare: 1 }), .02, true);
    const compensator = detectionTime(candidate({ distance: 150, flare: 1.6 }), .02, true);
    expect(compensator).toBeLessThan(bare); expect(bare).toBeLessThan(suppressed); expect(suppressed).toBeLessThan(quiet);
    expect(bare).toBeGreaterThan(.5);
  });
  it('keeps acquisition and flash integration consistent across frame rates', () => {
    expect(detectionTime(candidate({ distance: 150 }), .01)).toBeCloseTo(detectionTime(candidate({ distance: 150 }), .05), 1);
    const target = candidate({ flashAt: 0, flare: 1 });
    let fine = 0; for (let now = .01; now < .60001; now += .01) fine += spottingGain(target, now, .01);
    let coarse = 0; for (let now = .1; now < .60001; now += .1) coarse += spottingGain(target, now, .1);
    expect(fine).toBeCloseTo(coarse, 8);
  });
  it('cannot detect through cover or expose a partially seen target position', () => {
    const spotting = createBotSpotting(), target = candidate();
    for (let now = .02; now < .4; now += .02) expect(spotting.update([target], now, .02, () => true)).toBeUndefined();
    expect(spotting.lastKnown(.4)).toBeUndefined();
    for (let now = .4; now < 5; now += .02) expect(spotting.update([target], now, .02, () => false)).toBeUndefined();
    expect(spotting.lastKnown(5)).toBeUndefined();
  });
  it('forgets brief glimpses behind cover instead of pooling unlimited peeks', () => {
    const spotting = createBotSpotting(), target = candidate({ distance: 150 });
    for (let now = .02; now < 10; now += .02) {
      const clear = now % 1 < .2;
      expect(spotting.update([target], now, .02, () => clear)).toBeUndefined();
    }
  });
  it('keeps confidence separate for different actors and respawned lives', () => {
    const spotting = createBotSpotting(), one = candidate();
    for (let now = .02; now < 1; now += .02) spotting.update([one], now, .02, () => true);
    expect(spotting.update([candidate({ id: 'other' })], 1, .02, () => true)).toBeUndefined();
    const second = createBotSpotting();
    second.update([one], 0, .02, () => true, undefined, one.id);
    expect(second.update([{ ...one, life: 1 }], .02, .02, () => true)).toBeUndefined();
    expect(second.lastKnown(.02)).toBeUndefined();
  });
  it('remembers only the last visible position, reacquires briefly, and expires memory', () => {
    const spotting = createBotSpotting(), target = candidate();
    expect(spotting.update([target], 0, .02, () => true, undefined, target.id)).toBe(target.id);
    const hidden = { ...target, position: { x: 100, y: 1.75, z: 65 } };
    expect(spotting.update([hidden], .3, .25, () => false)).toBeUndefined();
    const remembered = spotting.lastKnown(.3)!; expect(remembered.x).toBe(0); remembered.x = 999;
    expect(spotting.lastKnown(.3)!.x).toBe(0);
    expect(spotting.update([hidden], .6, .25, () => true)).toBe(target.id);
    for (let now = .9; now < 8; now += .2) spotting.update([hidden], now, .2, () => false);
    expect(spotting.lastKnown(8)).toBeUndefined();
    expect(spotting.update([hidden], 8.2, .2, () => true)).toBeUndefined();
  });
  it('does not accrue spotting through long simulation gaps', () => {
    const spotting = createBotSpotting(), target = candidate();
    spotting.update([target], 0, .02, () => true, undefined, target.id);
    expect(spotting.update([target], 20, .02, () => true)).toBeUndefined();
  });
  it('moves past an occluded nearest candidate with bounded sight samples', () => {
    const spotting = createBotSpotting(), targets = [candidate({ id: 'wall' }), candidate({ id: 'clear', distance: 20 })];
    const sample = vi.fn((target: SpottingCandidate) => target.id === 'clear');
    let identified: string | undefined;
    for (let now = .02; now < 1; now += .02) identified = spotting.update(targets, now, .02, sample) ?? identified;
    expect(identified).toBe('clear'); expect(sample.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it('immediately confirms a visible attacker without discarding cover checks in the caller', () => {
    const spotting = createBotSpotting(), target = candidate({ distance: 250, stance: 'prone' });
    expect(spotting.update([target], 0, .02, () => true)).toBeUndefined();
    expect(spotting.update([target], .02, .02, () => false, undefined, target.id)).toBe(target.id);
  });
  it('derives settled stances from authoritative eye and support heights', () => {
    expect(spottingStance(false, 11.75, 10)).toBe('stand');
    expect(spottingStance(false, 11.15, 10)).toBe('crouch');
    expect(spottingStance(true, 10.55, 10)).toBe('prone');
    expect(spottingStance(false, 13, 10)).toBe('stand');
  });
});
