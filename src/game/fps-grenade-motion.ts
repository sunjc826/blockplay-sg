import { mix, pointIn, pose, type Point, type Pose } from './fps-healing';
import { smoothStep } from './fps-weapon-motion';

/**
 * The throw in the hands, as a pure function of the clocks the engine already
 * keeps, so it can be posed from any frame and tested without a renderer. The
 * order is the one CS and Call of Duty share: hand up, support hand takes the
 * pin, arm cocks back while the other points ahead, then a hard swing that lets
 * go at its far end and carries on down while the weapon comes back up.
 *
 * The fuse clock (`cooked`) drives everything from the pin onward: a held throw
 * cooks in the cocked pose, and a release books the swing on that same clock.
 */
export const GRENADE_READY_SECONDS = .35;
/** A tap still pulls the pin and cocks the arm before it swings. */
export const GRENADE_MIN_WINDUP = .22;
/** From the arm moving to the grenade leaving the hand. */
export const GRENADE_SWING_SECONDS = .1;
/** From the grenade leaving the hand to the weapon being back up. */
export const GRENADE_RECOVERY_SECONDS = .46;
/** Putting an unthrown grenade away. */
export const GRENADE_STOW_SECONDS = .2;
/** Fuse left at which the arm starts to shake. */
const SHAKE_FUSE = 1;
/** Where the tips of the left thumb and first finger meet, in that hand's own space (see `fps-viewmodel-hand`). */
export const HAND_PINCH = { x: .012, y: .066, z: -.026 };

export interface GrenadeHold {
  ready: number; cooked: number; pinned: boolean;
  /** The fuse-clock time the swing starts, or null while the throw is still held. */
  swingAt: number | null;
  /** 0 overarm, 1 the underarm lob; blended, so aiming mid-hold moves the arm rather than snapping it. */
  under: number;
  fuseLeft: number;
  /** Where the pull ring sits in the right hand's space, when the item has one. */
  ring: Point | null;
}
export interface GrenadeRelease { thrown: boolean; elapsed: number; under: number }
export interface GrenadeMotion {
  right: Pose; left: Pose;
  /** 1 closed round the item, 0 fully open. */
  grip: number;
  /** The support hand: how closed, and how far it is pinching the pin. */
  leftGrip: number; leftPinch: number;
  itemVisible: boolean;
  /** The pin has left the grenade and is in the left hand. */
  pinOut: boolean;
  /** The lever flying clear after the release, in view space. */
  spoon: Pose | null;
  /** 0 the weapon is up, 1 it is fully down and out of view. */
  weaponDown: number;
  /** A small turn of the world camera, so the throw is felt in the whole view. */
  view: { pitch: number; roll: number };
}

const between = (t: number, from: number, to: number) => smoothStep((t - from) / (to - from));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** The left hand, turned as `turn` says, placed so its pinch is at `at`. */
function pinchAt(at: Point, turn: Pose): Pose {
  const offset = pointIn({ ...turn, x: 0, y: 0, z: 0 }, HAND_PINCH);
  return { ...turn, x: at.x - offset.x, y: at.y - offset.y, z: at.z - offset.z };
}

// Below the frame, ready to come up.
const STOW = pose(.27, -.68, -.4, -.5, .9, .1), LEFT_STOW = pose(-.2, -.7, -.4, -.4, .2, -.2);
// Held low to the right, the palm turned in so the grenade shows, then lifted across for the left hand to reach.
const CARRY = pose(.21, -.19, -.47, -.28, .95, .1), MEET = pose(.14, -.15, -.44, -.3, 1.08, .12);
const PIN_TURN = pose(0, 0, 0, -.42, .5, -.85);
// Cocked: beside the ear for the overarm, down by the thigh for the lob.
const COCKED = pose(.235, -.035, -.34, .12, .78, .12), COCKED_LOW = pose(.23, -.24, -.42, -.2, .85, .14);
// The left arm points ahead at the target and holds the pin.
const GUIDE = pose(-.2, -.1, -.6, -.5, .2, -.22), GUIDE_LOW = pose(-.24, -.22, -.52, -.42, .2, -.3), TUCK = pose(-.3, -.52, -.3, -.4, .35, -.5);
// The swing over the top to the point of release, and the same for the lob.
const OVER_TOP = pose(.16, .05, -.52, -.42, .42, .18), RELEASE = pose(.05, -.03, -.76, -1.2, .1, .38);
const LOB_BOTTOM = pose(.18, -.3, -.56, -.3, .45, .16), LOB_RELEASE = pose(.08, -.1, -.76, -.72, -.04, .22);
// The arm carries on across the body and drops out of frame.
const THROUGH = pose(-.11, -.33, -.62, -1.65, .24, .72), THROUGH_LOB = pose(.04, -.06, -.74, -1.05, .05, .25), GONE = pose(-.02, -.82, -.4, -1.2, .2, .5);
const SPOON_FROM = pose(.06, .03, -.72);

const KICK_BACK = { pitch: .012, roll: -.012 }, KICK_THROW = { pitch: -.028, roll: .016 };

export function heldGrenadeMotion({ ready, cooked, pinned, swingAt, under, fuseLeft, ring }: GrenadeHold): GrenadeMotion {
  const raised = between(ready, 0, GRENADE_READY_SECONDS * .85);
  // Comes up past its mark and settles, then rests with a slight bob.
  const lift = Math.sin(raised * Math.PI) * .018 + Math.sin(ready * 1.9) * .0035;
  const c = pinned ? cooked : 0, at = swingAt === null ? c : Math.min(c, swingAt);
  const cocking = between(at, .1, GRENADE_MIN_WINDUP);
  const cocked = mix(COCKED, COCKED_LOW, under), guide = mix(GUIDE, GUIDE_LOW, under);
  const up = mix(mix(CARRY, MEET, between(at, 0, .08)), cocked, cocking);
  // Held cocked: breathing, and a shake as the fuse runs down.
  const shake = Math.max(0, 1 - fuseLeft / SHAKE_FUSE) * cocking;
  const breath = Math.sin(at * 3.4) * .0035 * cocking;
  const placed = mix(STOW, up, raised);
  let right = { ...placed, x: placed.x + Math.sin(at * 47) * .0024 * shake, y: placed.y + lift + breath, rz: placed.rz + Math.sin(at * 53) * .012 * shake };
  // The left hand takes the ring where it stands once the right has come across, pulls it clear, then points ahead.
  const reach = ring ? pointIn(MEET, ring) : pointIn(MEET, { x: -.05, y: .12, z: -.03 });
  const take = pinchAt(reach, PIN_TURN), pulled = { ...take, x: take.x - .1, y: take.y - .03, z: take.z - .03, rz: take.rz + .3 };
  let left = pinned
    ? mix(mix(mix(LEFT_STOW, take, between(at, 0, .085)), pulled, between(at, .09, .16)), guide, between(at, .15, .3))
    : LEFT_STOW;
  let grip = 1, view = { pitch: KICK_BACK.pitch * cocking, roll: KICK_BACK.roll * cocking };
  const swing = swingAt === null ? 0 : clamp01((cooked - swingAt) / GRENADE_SWING_SECONDS);
  if (swing > 0) {
    // Accelerates all the way to the release: the speed is the point of it.
    const drive = swing * swing, top = mix(OVER_TOP, LOB_BOTTOM, under), end = mix(RELEASE, LOB_RELEASE, under);
    right = mix(mix(right, top, drive), mix(top, end, drive), drive);
    left = mix(left, TUCK, smoothStep(swing));
    grip = 1 - between(swing, .68, 1) * .8;
    view = { pitch: view.pitch + (KICK_THROW.pitch - view.pitch) * drive, roll: view.roll + (KICK_THROW.roll - view.roll) * drive };
  }
  return { right, left, grip, leftGrip: pinned ? .5 : .8, leftPinch: pinned && at > .06 ? 1 : 0, itemVisible: true, pinOut: pinned && at >= .1 && !!ring, spoon: null,
    weaponDown: between(ready, 0, GRENADE_READY_SECONDS * .5), view };
}

export function releasedGrenadeMotion({ thrown, elapsed, under }: GrenadeRelease): GrenadeMotion {
  if (!thrown) {
    const away = between(elapsed, 0, GRENADE_STOW_SECONDS);
    return { right: mix(CARRY, STOW, away), left: LEFT_STOW, grip: 1, leftGrip: .8, leftPinch: 0, itemVisible: true, pinOut: false, spoon: null, weaponDown: 1 - away, view: { pitch: 0, roll: 0 } };
  }
  const end = mix(RELEASE, LOB_RELEASE, under), through = mix(THROUGH, THROUGH_LOB, under);
  const carry = 1 - (1 - clamp01(elapsed / .15)) ** 2;
  const right = mix(mix(end, through, carry), GONE, between(elapsed, .13, .36));
  const left = mix(TUCK, LEFT_STOW, between(elapsed, .03, .24));
  const settle = 1 - between(elapsed, 0, .32);
  // The lever springs off up and to the right as the striker goes.
  const t = elapsed, spoon = t < .38 ? pose(SPOON_FROM.x + t * 1.25, SPOON_FROM.y + t * 1.05 - t * t * 4.9, SPOON_FROM.z + t * .55, t * 34, t * 19, t * 27) : null;
  return { right, left, grip: .2, leftGrip: .5, leftPinch: 1, itemVisible: false, pinOut: true, spoon,
    weaponDown: 1 - between(elapsed, .14, GRENADE_RECOVERY_SECONDS), view: { pitch: KICK_THROW.pitch * settle, roll: KICK_THROW.roll * settle } };
}
