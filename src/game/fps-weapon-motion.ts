import { EMPTY_RELOAD, RELOAD_POINTS, reloadLength, type WeaponSpec } from './fps-rules';

/** Which reload the player has chosen: `original` is the slower one from before the thrown magazine. The spawn rack has only the one form. */
export type ReloadStyle = 'improved' | 'original';

export const smoothStep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** One manual cycle occupies the shot cooldown: lift, pull, push and lock. */
export function boltCycleMotion(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return {
    hand: smoothStep((p - .08) / .15) * (1 - smoothStep((p - .82) / .18)),
    lift: smoothStep((p - .16) / .12) * (1 - smoothStep((p - .76) / .1)),
    travel: smoothStep((p - .28) / .18) * (1 - smoothStep((p - .58) / .18)),
  };
}

/** At the release the hand jerks back and the palm opens in one move: fastest
 * at the first instant, then it hangs there. It only returns, on a separate arc,
 * well after the action has snapped home. */
export function cockingHandRelease(time: number, style: ReloadStyle = 'improved') {
  // The original reload opens the hand just ahead of the release, and eases it clear.
  const start = style === 'original' ? 1.15 : 1.16;
  const clear = style === 'original' ? smoothStep((time - start) / .04) : 1 - (1 - Math.max(0, Math.min(1, (time - start) / .04))) ** 3;
  const returnToGrip = smoothStep((time - 1.24) / .18);
  return { active: time > start && time < 1.42, clear, returnToGrip, open: clear * (1 - returnToGrip) };
}

export const INSPECT_DURATION = 3.6;
type InspectKey = readonly [time: number, x: number, y: number, z: number, pitch: number, yaw: number, roll: number];
// Lift into view, linger over each side of the receiver, then settle at ready.
const inspectKeys: readonly InspectKey[] = [
  [0, 0, 0, 0, 0, 0, 0],
  [.20, -.12, .06, .10, .12, .48, -.72],
  [.42, -.12, .06, .10, .12, .48, -.72],
  [.64, -.17, .07, .06, -.08, -.42, .58],
  [.78, -.17, .07, .06, -.08, -.42, .58],
  [1, 0, 0, 0, 0, 0, 0],
];
/** Cosmetic camera-space offsets only: inspection never works the weapon's action. */
export function inspectMotion(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const index = Math.min(inspectKeys.length - 2, Math.max(0, inspectKeys.findIndex((_, i) => i < inspectKeys.length - 1 && t <= inspectKeys[i + 1][0])));
  const a = inspectKeys[index], b = inspectKeys[index + 1], s = smoothStep((t - a[0]) / (b[0] - a[0]));
  const v = a.slice(1).map((value, i) => value + (b[i + 1] - value) * s);
  return { x: v[0], y: v[1], z: v[2], pitch: v[3], yaw: v[4], roll: v[5] };
}
// Normalized timing follows the equipped weapon's reload duration, including shop modifiers.
// Key times are in tactical reloads, so both kinds change the magazine on the same clock.
type Key = readonly [time: number, x: number, y: number, z: number, pitch: number, yaw: number, roll: number, magazineDrop: number];
const magazineChange: readonly Key[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [.16, -.06, .15, -.04, -.10, .22, -.38, 0],
  [.34, -.06, .17, -.06, -.14, .24, -.43, .30],
  [.48, -.05, .16, -.06, -.11, .22, -.40, .36],
  [.68, -.04, .16, -.03, -.08, .17, -.34, 0],
  [.74, -.035, .17, -.05, -.03, .14, -.29, 0],
];
const tacticalKeys: readonly Key[] = [...magazineChange,
  [.84, -.02, .12, -.03, -.06, -.10, -.14, 0],
  [1, 0, 0, 0, 0, 0, 0, 0],
];
// From empty the gun turns its charging handle to the camera, the hand racks it
// and holds it back, and the release kicks the whole gun forward before it settles.
const CHARGE = { reach: .94, back: 1.04, release: 1.16, home: 1.19 } as const;
/**
 * Where the charging handle is worked: from the right side (the machine guns,
 * Ultimax, P30), or on top under the optic bridge, like a FAMAS (SAR 21).
 */
export type HandleSide = 'right' | 'top';
export const handleSide = (weaponId: string): HandleSide => weaponId === 'sar21-inspired' ? 'top' : 'right';
// A right-side handle: the gun rolls the other way from the magazine change,
// towards the centre, to turn its right side up.
const rightKeys: readonly Key[] = [...magazineChange,
  [CHARGE.reach, -.10, .10, -.01, .03, -.20, .48, 0],
  [CHARGE.back, -.11, .09, .03, .05, -.24, .54, 0],
  [CHARGE.release, -.108, .095, .035, .06, -.23, .53, 0],
  [1.20, -.085, .07, -.045, -.04, -.15, .38, 0],
  [1.30, -.05, .05, -.02, -.03, -.04, .14, 0],
  [EMPTY_RELOAD.length, 0, 0, 0, 0, 0, 0, 0],
];
// A top handle: the gun comes back square to the shoulder, so the hand works the
// lever from above with the receiver top in view, not the left side. The draw
// drives into the back of the gun, so the butt dips and the muzzle lifts with it.
const topKeys: readonly Key[] = [...magazineChange,
  [CHARGE.reach, -.05, .07, -.01, -.02, .04, -.08, 0],
  [CHARGE.back, -.05, .065, .03, .08, .05, -.09, 0],
  [CHARGE.release, -.05, .068, .035, .09, .05, -.09, 0],
  [1.20, -.04, .05, -.045, -.03, .04, -.07, 0],
  [1.30, -.03, .04, -.02, -.03, .02, -.04, 0],
  [EMPTY_RELOAD.length, 0, 0, 0, 0, 0, 0, 0],
];
// The original top handle: the gun keeps the magazine change's cant and turns its
// muzzle in, laying the receiver top and the left side open to the reaching hand.
const originalTopKeys: readonly Key[] = [...magazineChange,
  [CHARGE.reach, -.05, .10, -.01, .06, .30, -.50, 0],
  [CHARGE.back, -.055, .09, .03, .08, .34, -.56, 0],
  [CHARGE.release, -.053, .095, .035, .09, .33, -.55, 0],
  [1.20, -.04, .07, -.045, -.03, .22, -.40, 0],
  [1.30, -.03, .05, -.02, -.03, .05, -.14, 0],
  [EMPTY_RELOAD.length, 0, 0, 0, 0, 0, 0, 0],
];
/** How far the charging handle is drawn back, 0..1: racked, held, then let fly. */
function handleTravel(t: number, style: ReloadStyle) {
  if (t <= CHARGE.reach || t >= CHARGE.home) return 0;
  // Take up tension, then a firm draw that is still gaining speed at the rear stop.
  if (t < .97) return .08 * smoothStep((t - CHARGE.reach) / .03);
  if (t < 1.015) return .08 + .92 * (style === 'original' ? smoothStep((t - .97) / .045) : ((t - .97) / .045) ** 1.5);
  if (t < CHARGE.release) return 1;
  const run = (t - CHARGE.release) / (CHARGE.home - CHARGE.release);
  return (1 - run) ** 3;
}
function samplePose(keys: readonly Key[], t: number) {
  const index = Math.min(keys.length - 2, Math.max(0, keys.findIndex((_, i) => i < keys.length - 1 && t <= keys[i + 1][0])));
  const a = keys[index], b = keys[index + 1], s = smoothStep((t - a[0]) / (b[0] - a[0]));
  return a.slice(1).map((value, i) => value + (b[i + 1] - value) * s);
}
export function reloadMotion(progress: number, empty = false, side: HandleSide = 'right', style: ReloadStyle = 'improved') {
  const p = Math.max(0, Math.min(1, progress)), t = p * reloadLength(empty), keys = !empty ? tacticalKeys : side !== 'top' ? rightKeys : style === 'original' ? originalTopKeys : topKeys;
  const v = samplePose(keys, t);
  return { x: v[0], y: v[1], z: v[2], pitch: v[3], yaw: v[4], roll: v[5], magazineDrop: t >= .16 && t <= .34
      ? (t < .205 ? .015 * smoothStep((t - .16) / .045) : t < .275 ? .015 + .315 * smoothStep((t - .205) / .07) : .33 - .03 * smoothStep((t - .275) / .065)) : v[6],
    magazineVisible: t < .38 || t > MAG_IN_START,
    handToMagazine: smoothStep(t / .16) * (1 - smoothStep((t - .74) / (empty ? .12 : .20))),
    handToHandle: empty ? smoothStep((t - .80) / .14) * (1 - smoothStep((t - CHARGE.home) / .12)) : 0,
    // A belt lies in the feed tray (1) or hangs free from its box (0): peeled
    // out as the box comes off, laid back in before the cover closes.
    beltSeated: t < MAG_IN_START ? 1 - smoothStep((t - .16) / .12) : smoothStep((t - .58) / .12),
    action: empty ? handleTravel(t, style) : 0,
  };
}
/** A small, steady cant exposes the feed tray while the other hand works.
 * From empty, join the existing charging stroke after the cover is closed. */
export function beltWeaponMotion(progress: number, empty = false, style: ReloadStyle = 'improved') {
  const motion = reloadMotion(progress, empty, 'right', style), time = Math.max(0, Math.min(1, progress)) * reloadLength(empty);
  const hold = smoothStep(time / .15) * (1 - smoothStep((time - .74) / .26));
  const charge = empty ? smoothStep((time - .82) / .12) : 0;
  return { ...motion, x: -.025 * hold * (1 - charge) + motion.x * charge,
    y: .075 * hold * (1 - charge) + motion.y * charge, z: .025 * hold * (1 - charge) + motion.z * charge,
    pitch: .06 * hold * (1 - charge) + motion.pitch * charge,
    yaw: .12 * hold * (1 - charge) + motion.yaw * charge,
    roll: -.14 * hold * (1 - charge) + motion.roll * charge };
}
/** Rifle reloads keep the butt low at the shoulder while the muzzle tilts up.
 * The receiver still rolls to expose the magazine/action; mechanical timing and
 * the additive contact impulses remain independent of this presentation pose. */
export function weaponReloadMotion(progress: number, empty: boolean, weapon: Pick<WeaponSpec, 'id' | 'feed'>, style: ReloadStyle = 'improved') {
  if (weapon.feed === 'belt') return beltWeaponMotion(progress, empty, style);
  const motion = reloadMotion(progress, empty, handleSide(weapon.id), style);
  const time = Math.max(0, Math.min(1, progress)) * reloadLength(empty);
  if (weapon.id === 'p30-inspired' && style === 'improved' && time < PISTOL_FLICK_POSE[PISTOL_FLICK_POSE.length - 1][0]) {
    const [x, y, z, pitch, yaw, roll] = samplePose(PISTOL_FLICK_POSE, time);
    return { ...motion, x, y, z, pitch, yaw, roll };
  }
  if (weapon.id === 'p30-inspired' || weapon.feed === 'drum') return motion;
  const shoulder = smoothStep(time / .16) * (1 - smoothStep((time - (empty ? 1.24 : .80)) / (empty ? .26 : .20)));
  return { ...motion, x: motion.x * .6, y: motion.y * .22,
    pitch: .38 * shoulder + motion.pitch * .3, yaw: motion.yaw * .55, roll: motion.roll * .8 };
}
/** The spawn rack, from the gun starting up to full control. */
export const READY_SECONDS = 1.4;
/**
 * The rack's beats in seconds: a firm draw, a short still hold, then let go.
 * The handle runs home on its spring just before the camera touches down
 * (DEPLOYMENT_OVERLAP after the gun starts up).
 */
export const READY_BEATS = { raised: .32, reached: .42, pull: .50, stop: .70, release: .78, home: .83, returns: .98 } as const;
const readyClockKeys: readonly (readonly [seconds: number, clock: number])[] = [
  [0, .80], [READY_BEATS.reached, CHARGE.reach], [READY_BEATS.pull, .97], [READY_BEATS.stop, 1.015],
  [READY_BEATS.release, CHARGE.release], [READY_BEATS.home, CHARGE.home], [READY_BEATS.returns, 1.24], [READY_SECONDS, EMPTY_RELOAD.length],
];
/**
 * The point on the empty reload's clock that spawn progress has reached. The
 * rack reuses that reload's poses and hand paths on tighter timing of its own.
 */
export function readyClock(progress: number) {
  const seconds = Math.max(0, Math.min(1, progress)) * READY_SECONDS;
  const index = Math.max(0, readyClockKeys.findIndex(key => seconds <= key[0]) - 1), a = readyClockKeys[index], b = readyClockKeys[index + 1];
  return a[1] + (b[1] - a[1]) * (seconds - a[0]) / (b[0] - a[0]);
}
/** Raise, rack and shoulder the loaded weapon, without a magazine change. */
export function readyMotion(progress: number, side: HandleSide = 'right') {
  const p = Math.max(0, Math.min(1, progress)), seconds = p * READY_SECONDS, raise = Math.min(1, seconds / READY_BEATS.raised);
  const lift = smoothStep(raise);
  // Thrown up from below: it passes its mark slightly and is caught.
  const rise = 1 + 2.2 * (raise - 1) ** 3 + 1.2 * (raise - 1) ** 2;
  const motion = reloadMotion(readyClock(p) / EMPTY_RELOAD.length, true, side);
  // The hand travels with the gun, so the gun holds still until the hand has
  // jerked back and hung there, then goes straight to rest. The reload's forward
  // kick would carry the hand after the handle it has just released.
  const pose = seconds < READY_BEATS.release ? motion : reloadMotion(CHARGE.release / EMPTY_RELOAD.length, true, side);
  const settled = smoothStep((seconds - READY_BEATS.returns) / (READY_SECONDS - READY_BEATS.returns));
  const held = (value: number) => value * lift - value * lift * settled;
  return { ...motion, x: held(pose.x), y: held(pose.y) - .55 * (1 - rise), z: held(pose.z),
    pitch: held(pose.pitch) - .45 * (1 - rise), yaw: held(pose.yaw), roll: held(pose.roll),
    magazineDrop: 0, magazineVisible: true, handToMagazine: 0, beltSeated: 1 };
}
// The spent magazine: gripped, stripped down the well, then slung off the side
// of the screen. Beats are in tactical reloads, and it has to be gone by the time
// the rules count it out, because the old magazine has no state past that point.
export const MAGAZINE_THROW = { grip: .16, strip: .205, whip: .235, release: .265, gone: RELOAD_POINTS.out } as const;
type Vec = readonly [x: number, y: number, z: number];
const WHIP_REACH: Vec = [-.12, .10, -.04];
const WHIP_SECONDS = MAGAZINE_THROW.release - MAGAZINE_THROW.whip;
// Whip accelerates from rest, so this is its speed when the hand lets go.
const THROW_SPEED = WHIP_REACH.map(v => 2 * v / WHIP_SECONDS) as unknown as Vec;
const THROW_GRAVITY = 260, THROW_SPIN: Vec = [24, 9, 58];
// The hand keeps the magazine's speed at release, then brakes over this long.
const FOLLOW_THROUGH = .04;
/**
 * Everything but the pull down the well (`strip`, in gun metres) is in view
 * space, so the throw leaves the same way on every gun. Sampled from the reload
 * clock, not simulated, so a pause or slow frame cannot change where it lands.
 */
export function magazineThrow(time: number) {
  const { grip, strip, whip, release, gone } = MAGAZINE_THROW;
  const wound = Math.max(0, Math.min(1, (time - whip) / WHIP_SECONDS)) ** 2, flight = Math.max(0, time - release);
  const along = (reach: number, speed: number, travelled: number) => reach * wound + speed * travelled;
  const fall = .5 * THROW_GRAVITY * flight * flight;
  const braked = Math.min(flight, FOLLOW_THROUGH), handTravel = braked - braked * braked / (2 * FOLLOW_THROUGH);
  const handHome = smoothStep((time - .335) / (gone - .335));
  return {
    strip: .015 * smoothStep((time - grip) / (strip - grip)) + .135 * smoothStep((time - strip) / (release - strip - .005)),
    flown: [along(WHIP_REACH[0], THROW_SPEED[0], flight), along(WHIP_REACH[1], THROW_SPEED[1], flight) - fall, along(WHIP_REACH[2], THROW_SPEED[2], flight)] as Vec,
    hand: WHIP_REACH.map((reach, i) => along(reach, THROW_SPEED[i], handTravel)) as unknown as Vec,
    /** How far the hand has gone back to its ordinary reload path. */
    handHome,
    spin: [THROW_SPIN[0] * flight, THROW_SPIN[1] * flight, THROW_SPIN[2] * flight - .35 * wound] as Vec,
    /** The hand clamps on, then is thrown open by the release, for as long as it hangs out there. */
    clamp: smoothStep((time - grip) / (strip - grip)) * (1 - smoothStep((time - release + .004) / .008)),
    open: smoothStep((time - release + .004) / .012) * (1 - handHome),
    /** The arm follows the hand up into the frame, so the forearm's cut end stays out of it. */
    armOut: smoothStep((time - strip) / (release - strip)) * (1 - handHome),
    active: time >= grip && time < gone,
  };
}
// The pistol's spent magazine goes with one hand: the support hand drops away, the
// thumb works the catch, and a snap of the wrist slings the magazine off the lower
// right. Beats are in tactical reloads, as with the rifle's throw.
export const PISTOL_FLICK = { press: .14, snap: .175, slide: .185, whip: .215, release: .24, stop: .24, gone: RELOAD_POINTS.out } as const;
const FLICK_SLIDE = .115, FLICK_GRAVITY = 24, FLICK_SPIN: Vec = [7, 4, -24];
const FLICK_SPEED: Vec = [3, -1.2, 0];
const FLICK_REACH = FLICK_SPEED.map(v => v * (PISTOL_FLICK.release - PISTOL_FLICK.whip) / 2) as unknown as Vec;
const FLICK_HAND_AWAY: Vec = [-.2, -.46, .02];
/** Sampled from the reload clock, like the rifle's throw. `slide` runs in gun metres along the well, the rest in view space. */
export function pistolMagazineFlick(time: number) {
  const { press, snap, slide, whip, release, gone } = PISTOL_FLICK;
  const wound = Math.max(0, Math.min(1, (time - whip) / (release - whip))) ** 2, flight = Math.max(0, time - release);
  const along = (axis: 0 | 1 | 2) => FLICK_REACH[axis] * wound + FLICK_SPEED[axis] * flight;
  const away = smoothStep((time - .02) / .13) * (1 - smoothStep((time - RELOAD_POINTS.out) / .09));
  return {
    strip: FLICK_SLIDE * smoothStep((time - slide) / (release - slide)),
    flown: [along(0), along(1) - .5 * FLICK_GRAVITY * flight * flight, along(2)] as Vec,
    spin: [FLICK_SPIN[0] * flight, FLICK_SPIN[1] * flight, FLICK_SPIN[2] * flight] as Vec,
    /** The firing thumb on the catch, off it as soon as the wrist has gone. */
    press: smoothStep((time - press) / (snap - press)) * (1 - smoothStep((time - snap) / .05)),
    /** The support hand, clear of the gun for as long as the wrist needs the room. */
    handAway: [FLICK_HAND_AWAY[0] * away, FLICK_HAND_AWAY[1] * away, FLICK_HAND_AWAY[2] * away] as Vec,
    handOut: away,
    /** How much of the ordinary reload's magazine path the hand has come back to. */
    handFollow: smoothStep((time - .30) / .08),
    active: time >= slide && time < gone,
  };
}
// The wrist winds up with the butt to the left, so the snap has room to throw it
// right. It stops dead, hangs a moment, then turns the well to the hand bringing
// the fresh magazine, joining the common magazine pose.
const PISTOL_FLICK_POSE: readonly Key[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [.12, -.045, .11, -.03, -.04, .16, -.26, 0],
  [PISTOL_FLICK.snap, -.05, .12, -.03, -.03, .18, -.34, 0],
  [PISTOL_FLICK.stop, .025, .085, -.02, .05, -.10, .30, 0],
  [.30, .02, .09, -.03, .06, -.08, .22, 0],
  magazineChange[3],
];
/** Where the fresh magazine starts in: the end of the MAG OUT stage, in tactical reloads. */
export const MAG_IN_START = .47;
export function reloadStage(remaining: number, empty = false) {
  if (remaining <= 0) return '';
  const t = (1 - remaining) * reloadLength(empty);
  if (t < .16) return 'RELOADING';
  if (t < MAG_IN_START) return 'MAG OUT';
  if (t < .74) return 'MAG IN';
  if (!empty) return t < .94 ? 'SEAT MAG' : 'READY';
  return t < CHARGE.reach ? 'SEAT MAG' : t < CHARGE.release ? 'BOLT BACK' : t < 1.28 ? 'CHAMBER' : 'READY';
}
