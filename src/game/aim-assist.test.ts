import { describe, expect, it } from 'vitest';
import { ASSIST_CONE_MAX, ASSIST_CONE_MIN, ASSIST_PULL, ASSIST_SLOWDOWN, ASSIST_TRACK, ASSIST_TRACK_JUMP, assistCone, assistLook, assistStrength, assistTrack } from './aim-assist';

// A torso about 20 m out: ~0.86° across, so a ~2.1° cone.
const torso = (yawError = 0, pitchError = 0) => ({ yawError, pitchError, angularRadius: Math.atan(.3 / 20) });

describe('aim assist', () => {
  it('does nothing without a thumb, so a burst climbs exactly as far as it would without it', () => {
    expect(assistLook(0, 0, 0, torso(), false)).toEqual({ yaw: 0, pitch: 0 });
    expect(assistLook(0, 0, 0, torso(), true)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('leaves a drag alone outside the cone or with nothing in sight', () => {
    expect(assistLook(.01, .02, 0, null, false)).toEqual({ yaw: .01, pitch: .02 });
    expect(assistLook(.01, .02, 0, torso(.2, 0), false)).toEqual({ yaw: .01, pitch: .02 });
    expect(assistStrength(torso(assistCone(torso().angularRadius) * 1.01, 0))).toBe(0);
  });

  it('scales the cone with the target and keeps it narrow', () => {
    expect(assistCone(0)).toBe(ASSIST_CONE_MIN);
    expect(assistCone(1)).toBe(ASSIST_CONE_MAX);
    expect(ASSIST_CONE_MAX).toBeLessThan(6.1 * Math.PI / 180);
  });

  it('slows a drag off the target by at most the slowdown share', () => {
    // Target dead centre; the thumb drags right (negative yaw).
    const bent = assistLook(-.004, 0, 0, torso(), false);
    expect(bent.yaw).toBeCloseTo(-.004 * (1 - ASSIST_SLOWDOWN), 9);
    expect(bent.pitch).toBeCloseTo(0, 12);
  });

  it('lengthens a drag towards the target slightly, never past it, and not while firing', () => {
    // Target sits 1° below the sights; the thumb pulls down 0.2°.
    const below = torso(0, -1 * Math.PI / 180), step = -.2 * Math.PI / 180;
    const free = assistLook(0, step, 0, below, false), firing = assistLook(0, step, 0, below, true);
    expect(free.pitch).toBeLessThan(step);
    expect(free.pitch).toBeGreaterThanOrEqual(step * (1 + ASSIST_PULL));
    expect(firing.pitch).toBeCloseTo(step, 12);
    // A drag that already reaches the target gains nothing.
    const reach = assistLook(0, below.pitchError, 0, below, false);
    expect(reach.pitch).toBeCloseTo(below.pitchError, 12);
  });

  it('leaves most of a recoil pull-down to the player', () => {
    // Recoil has walked the sights 1.5° over the target and the thumb pulls
    // it all back while still firing: the assist gives nothing.
    const over = torso(0, -1.5 * Math.PI / 180), pull = over.pitchError;
    expect(assistLook(0, pull, 0, over, true).pitch).toBeCloseTo(pull, 12);
  });

  it('works in screen space when the sights are tilted', () => {
    // At 60° up, a yaw step sweeps half as much screen; a target to the right
    // still draws a rightward drag towards it rather than overshooting.
    const right = torso(-.01, 0), step = -.004;
    const bent = assistLook(step, 0, Math.PI / 3, right, false);
    expect(bent.yaw).toBeLessThan(step);
    expect(bent.yaw * Math.cos(Math.PI / 3)).toBeGreaterThanOrEqual(right.yawError);
  });

  it('follows part of a strafing target, fading out across the cone', () => {
    const step = { yaw: .005, pitch: -.001 };
    const centre = assistTrack({ yaw: 1, pitch: 0 }, { yaw: 1 + step.yaw, pitch: step.pitch }, torso());
    expect(centre.yaw).toBeCloseTo(step.yaw * ASSIST_TRACK, 12);
    expect(centre.pitch).toBeCloseTo(step.pitch * ASSIST_TRACK, 12);
    const edge = assistTrack({ yaw: 1, pitch: 0 }, { yaw: 1 + step.yaw, pitch: 0 }, torso(assistCone(torso().angularRadius) * .8, 0));
    expect(Math.abs(edge.yaw)).toBeGreaterThan(0);
    expect(Math.abs(edge.yaw)).toBeLessThan(Math.abs(centre.yaw));
    expect(assistTrack({ yaw: 1, pitch: 0 }, { yaw: 1.005, pitch: 0 }, null)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('wraps yaw across ±π and ignores jumps', () => {
    const across = assistTrack({ yaw: Math.PI - .002, pitch: 0 }, { yaw: -Math.PI + .002, pitch: 0 }, torso());
    expect(across.yaw).toBeCloseTo(.004 * ASSIST_TRACK, 9);
    expect(assistTrack({ yaw: 0, pitch: 0 }, { yaw: ASSIST_TRACK_JUMP * 1.5, pitch: 0 }, torso())).toEqual({ yaw: 0, pitch: 0 });
  });

  it('follows a bearing, never the aim, so a climb is left alone', () => {
    // Recoil moves the aim, not the target's bearing: nothing to follow.
    expect(assistTrack({ yaw: .3, pitch: .1 }, { yaw: .3, pitch: .1 }, torso(0, -.01))).toEqual({ yaw: 0, pitch: 0 });
  });
});
