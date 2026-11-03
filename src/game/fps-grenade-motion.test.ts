import { describe, expect, it } from 'vitest';
import { GRENADE_MIN_WINDUP, GRENADE_READY_SECONDS, GRENADE_RECOVERY_SECONDS, GRENADE_STOW_SECONDS, GRENADE_SWING_SECONDS, HAND_PINCH, heldGrenadeMotion, releasedGrenadeMotion, type GrenadeHold } from './fps-grenade-motion';
import { pointIn, type Pose } from './fps-healing';

const ring = { x: -.022, y: .1, z: -.071 };
const hold = (over: Partial<GrenadeHold> = {}): GrenadeHold => ({ ready: GRENADE_READY_SECONDS, cooked: 0, pinned: false, swingAt: null, under: 0, fuseLeft: 3.5, ring, ...over });
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const continuous = (a: Pose, b: Pose) => { expect(distance(a, b)).toBeLessThan(.001); expect(Math.abs(a.rx - b.rx) + Math.abs(a.ry - b.ry) + Math.abs(a.rz - b.rz)).toBeLessThan(.01); };

describe('grenade throw motion', () => {
  it('raises the grenade from below the frame as the weapon goes down', () => {
    const start = heldGrenadeMotion(hold({ ready: 0 })), up = heldGrenadeMotion(hold());
    expect(start.right.y).toBeLessThan(-.6); expect(start.weaponDown).toBe(0);
    expect(up.right.y).toBeGreaterThan(-.3); expect(up.weaponDown).toBe(1);
    expect(up.pinOut).toBe(false); expect(up.left.y).toBeLessThan(-.6);
  });
  it('brings the left pinch to the ring, then takes the pin out', () => {
    const grab = heldGrenadeMotion(hold({ pinned: true, cooked: .085 }));
    expect(distance(pointIn(grab.left, HAND_PINCH), pointIn(grab.right, ring))).toBeLessThan(.005);
    expect(grab.pinOut).toBe(false);
    const out = heldGrenadeMotion(hold({ pinned: true, cooked: .16 }));
    expect(out.pinOut).toBe(true);
    expect(distance(pointIn(out.left, HAND_PINCH), pointIn(out.right, ring))).toBeGreaterThan(.08);
    expect(heldGrenadeMotion(hold({ pinned: true, cooked: .16, ring: null })).pinOut).toBe(false);
  });
  it('holds cocked with the arm back and the other pointing ahead, for as long as it cooks', () => {
    const cocked = heldGrenadeMotion(hold({ pinned: true, cooked: 1 }));
    expect(cocked.right.z).toBeGreaterThan(-.36); expect(cocked.right.y).toBeGreaterThan(-.1);
    expect(cocked.left.z).toBeLessThan(-.55); expect(cocked.left.x).toBeLessThan(-.15);
    const later = heldGrenadeMotion(hold({ pinned: true, cooked: 2 }));
    expect(distance(cocked.right, later.right)).toBeLessThan(.02);
  });
  it('shakes only as the fuse runs down', () => {
    const swing = (fuseLeft: number) => Math.max(...[1, 1.02, 1.04, 1.06, 1.08, 1.1].map(cooked => heldGrenadeMotion(hold({ pinned: true, cooked, fuseLeft })).right.x)) - Math.min(...[1, 1.02, 1.04, 1.06, 1.08, 1.1].map(cooked => heldGrenadeMotion(hold({ pinned: true, cooked, fuseLeft })).right.x));
    expect(swing(3)).toBeLessThan(1e-9); expect(swing(.1)).toBeGreaterThan(.002);
  });
  it('leads the lob low and keeps it low', () => {
    const over = heldGrenadeMotion(hold({ pinned: true, cooked: 1 })), under = heldGrenadeMotion(hold({ pinned: true, cooked: 1, under: 1 }));
    expect(under.right.y).toBeLessThan(over.right.y - .15);
    const end = (u: number) => heldGrenadeMotion(hold({ pinned: true, cooked: 1 + GRENADE_SWING_SECONDS, swingAt: 1, under: u })).right;
    expect(end(1).y).toBeLessThan(end(0).y); expect(Math.abs(end(1).rx)).toBeLessThan(Math.abs(end(0).rx));
  });
  it('starts the swing from where the arm was, however long it cooked, and speeds up to the release', () => {
    for (const swingAt of [GRENADE_MIN_WINDUP, 1.3, 2.71]) {
      const at = (share: number) => heldGrenadeMotion(hold({ pinned: true, cooked: swingAt + GRENADE_SWING_SECONDS * share, swingAt })).right;
      continuous(heldGrenadeMotion(hold({ pinned: true, cooked: swingAt })).right, at(0));
      expect(distance(at(.8), at(1))).toBeGreaterThan(distance(at(0), at(.2)) * 2);
    }
    const end = heldGrenadeMotion(hold({ pinned: true, cooked: 1 + GRENADE_SWING_SECONDS, swingAt: 1 }));
    expect(end.right.z).toBeLessThan(-.7); expect(end.grip).toBeLessThan(.3); expect(end.view.pitch).toBeLessThan(0);
  });
  it('carries straight on from the release, with the item gone, and hands back to the weapon', () => {
    for (const under of [0, 1]) {
      const end = heldGrenadeMotion(hold({ pinned: true, cooked: 1 + GRENADE_SWING_SECONDS, swingAt: 1, under })), after = releasedGrenadeMotion({ thrown: true, elapsed: 0, under });
      continuous(end.right, after.right);
      expect(after.view.pitch).toBeCloseTo(end.view.pitch, 5); expect(after.view.roll).toBeCloseTo(end.view.roll, 5);
      expect(after.itemVisible).toBe(false); expect(after.weaponDown).toBe(1);
    }
    const done = releasedGrenadeMotion({ thrown: true, elapsed: GRENADE_RECOVERY_SECONDS, under: 0 });
    expect(done.weaponDown).toBe(0); expect(done.right.y).toBeLessThan(-.6); expect(done.left.y).toBeLessThan(-.6); expect(done.view.pitch).toBeCloseTo(0, 6); expect(done.spoon).toBeNull();
    expect(releasedGrenadeMotion({ thrown: true, elapsed: .1, under: 0 }).spoon).not.toBeNull();
  });
  it('puts an unthrown grenade away, item and all', () => {
    const start = releasedGrenadeMotion({ thrown: false, elapsed: 0, under: 0 }), end = releasedGrenadeMotion({ thrown: false, elapsed: GRENADE_STOW_SECONDS, under: 0 });
    expect(start.itemVisible).toBe(true); expect(start.weaponDown).toBe(1); expect(start.right.y).toBeGreaterThan(-.3);
    expect(end.weaponDown).toBe(0); expect(end.right.y).toBeLessThan(-.6); expect(end.pinOut).toBe(false);
  });
});
