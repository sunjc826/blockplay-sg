import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FLINCH, createFlinch, flinchAim, flinchEnvelope, flinchStrength } from './fps-flinch';

const deg = THREE.MathUtils.radToDeg;
const zero = { pitch: 0, yaw: 0, roll: 0 };

describe('player flinch', () => {
  it('ignores gas and grazes, reads a rifle round as about half, and a blast or half a bar as full', () => {
    expect(flinchStrength(1)).toBe(0);
    expect(flinchStrength(NaN)).toBe(0);
    expect(flinchStrength(25)).toBeCloseTo(.5);
    expect(flinchStrength(60)).toBe(1);
    expect(flinchStrength(5, 100, true)).toBe(1);
    expect(flinchStrength(4)).toBe(.2);
  });

  it('throws the aim up by about half a degree for a rifle round, never more than a degree and a quarter', () => {
    const rifle = flinchAim(flinchStrength(25), 0, .5);
    expect(deg(rifle.pitch)).toBeGreaterThan(.4); expect(deg(rifle.pitch)).toBeLessThan(.7);
    for (const random of [0, .3, .99]) for (const bearing of [-Math.PI, -1, 0, 1, Math.PI / 2]) {
      const aim = flinchAim(1, bearing, random);
      expect(aim.pitch).toBeGreaterThan(0);
      expect(deg(Math.hypot(aim.pitch, aim.yaw))).toBeLessThan(1.4);
    }
  });

  it('pushes the view away from the side the round came from', () => {
    for (const random of [0, .5, .99]) {
      expect(flinchAim(1, Math.PI / 2, random).yaw).toBeGreaterThan(0); // from the right: turn left
      expect(flinchAim(1, -Math.PI / 2, random).yaw).toBeLessThan(0);
    }
    // From straight ahead it still wanders, either way.
    expect(flinchAim(1, 0, 0).yaw).toBeLessThan(0);
    expect(flinchAim(1, 0, .99).yaw).toBeGreaterThan(0);
    expect(flinchAim(1, undefined, .5).yaw).toBe(0);
  });

  it('snaps the view within 50 ms and settles completely', () => {
    expect(flinchEnvelope(0)).toBe(0);
    expect(flinchEnvelope(FLINCH.peak)).toBeCloseTo(1);
    expect(flinchEnvelope(FLINCH.seconds)).toBe(0);
    const flinch = createFlinch();
    expect(flinch.sample()).toEqual(zero);
    flinch.hit(1, Math.PI / 2, .5);
    flinch.advance(FLINCH.peak);
    const snap = flinch.sample();
    expect(snap.pitch).toBeGreaterThan(0); expect(snap.yaw).toBeGreaterThan(0); expect(snap.roll).not.toBe(0);
    expect(deg(Math.hypot(snap.pitch, snap.yaw, snap.roll))).toBeLessThan(3);
    // Through a 4x scope it moves half as far, and reduced motion keeps it still.
    expect(flinch.sample(4).pitch).toBeCloseTo(snap.pitch / 2);
    expect(flinch.sample(1, true)).toEqual(zero);
    flinch.advance(FLINCH.seconds);
    expect(flinch.sample()).toEqual(zero);
  });

  it('hands over its aim once and keeps nothing to give back', () => {
    const flinch = createFlinch();
    const first = flinch.hit(.5, 0, .2), second = flinch.hit(.5, 0, .8);
    const owed = flinch.takeAim();
    expect(owed.pitch).toBeCloseTo(first.pitch + second.pitch);
    expect(owed.yaw).toBeCloseTo(first.yaw + second.yaw);
    expect(flinch.takeAim()).toEqual(zero);
    flinch.advance(5);
    expect(flinch.takeAim()).toEqual(zero);
  });

  it('refreshes the snap on a second hit rather than stacking it', () => {
    const flinch = createFlinch();
    flinch.hit(1, 0, .5); flinch.advance(FLINCH.peak);
    const one = flinch.sample().pitch;
    flinch.hit(1, 0, .5); flinch.advance(FLINCH.peak);
    expect(flinch.sample().pitch).toBeCloseTo(one);
    flinch.reset();
    expect(flinch.sample()).toEqual(zero); expect(flinch.takeAim()).toEqual(zero);
  });
});
