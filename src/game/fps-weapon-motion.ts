import { EMPTY_RELOAD, reloadLength } from './fps-rules';

export const smoothStep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

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
  [.74, -.035, .17, -.05, -.03, .14, -.29, -.012],
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
// A top handle: the gun keeps the magazine change's cant and turns its muzzle
// in, laying the receiver top and the left side open to the reaching hand.
const topKeys: readonly Key[] = [...magazineChange,
  [CHARGE.reach, -.05, .10, -.01, .06, .30, -.50, 0],
  [CHARGE.back, -.055, .09, .03, .08, .34, -.56, 0],
  [CHARGE.release, -.053, .095, .035, .09, .33, -.55, 0],
  [1.20, -.04, .07, -.045, -.03, .22, -.40, 0],
  [1.30, -.03, .05, -.02, -.03, .05, -.14, 0],
  [EMPTY_RELOAD.length, 0, 0, 0, 0, 0, 0, 0],
];
/** How far the charging handle is drawn back, 0..1: racked, held, then let fly. */
function handleTravel(t: number) {
  if (t <= CHARGE.reach || t >= CHARGE.home) return 0;
  if (t < CHARGE.back) return smoothStep((t - CHARGE.reach) / (CHARGE.back - CHARGE.reach));
  if (t < CHARGE.release) return 1;
  const run = (t - CHARGE.release) / (CHARGE.home - CHARGE.release);
  return 1 - run * run;
}
export function reloadMotion(progress: number, empty = false, side: HandleSide = 'right') {
  const p = Math.max(0, Math.min(1, progress)), t = p * reloadLength(empty), keys = !empty ? tacticalKeys : side === 'top' ? topKeys : rightKeys;
  const index = Math.min(keys.length - 2, Math.max(0, keys.findIndex((_, i) => i < keys.length - 1 && t <= keys[i + 1][0])));
  const a = keys[index], b = keys[index + 1], s = smoothStep((t - a[0]) / (b[0] - a[0]));
  const v = a.slice(1).map((value, i) => value + (b[i + 1] - value) * s);
  return { x: v[0], y: v[1], z: v[2], pitch: v[3], yaw: v[4], roll: v[5], magazineDrop: v[6],
    magazineVisible: t < .38 || t > MAG_IN_START,
    handToMagazine: smoothStep(t / .16) * (1 - smoothStep((t - .74) / (empty ? .12 : .20))),
    handToHandle: empty ? smoothStep((t - .80) / .14) * (1 - smoothStep((t - CHARGE.home) / .12)) : 0,
    // A belt lies in the feed tray (1) or hangs free from its box (0): peeled
    // out as the box comes off, laid back in before the cover closes.
    beltSeated: t < MAG_IN_START ? 1 - smoothStep((t - .16) / .12) : smoothStep((t - .58) / .12),
    action: empty ? handleTravel(t) : 0,
  };
}
/** Raise, rack and shoulder the loaded weapon, without a magazine change. */
export function readyMotion(progress: number, side: HandleSide = 'right') {
  const p = Math.max(0, Math.min(1, progress)), lift = smoothStep(p / .22);
  const motion = reloadMotion((.80 + (EMPTY_RELOAD.length - .80) * p) / EMPTY_RELOAD.length, true, side);
  return { ...motion, x: motion.x * lift, y: motion.y * lift - .55 * (1 - lift), z: motion.z * lift,
    pitch: motion.pitch * lift - .45 * (1 - lift), yaw: motion.yaw * lift, roll: motion.roll * lift,
    magazineDrop: 0, magazineVisible: true, handToMagazine: 0, beltSeated: 1 };
}
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
