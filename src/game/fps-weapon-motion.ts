import { EMPTY_RELOAD, reloadLength } from './fps-rules';

export const smoothStep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
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
// From empty the gun rolls the other way, towards the centre, to turn its
// right side and charging handle to the camera; the hand racks the handle and
// holds it back, and the release kicks the whole gun forward before it settles.
const CHARGE = { reach: .94, back: 1.04, release: 1.16, home: 1.19 } as const;
const emptyKeys: readonly Key[] = [...magazineChange,
  [CHARGE.reach, -.10, .17, -.01, .03, -.20, .48, 0],
  [CHARGE.back, -.11, .16, .03, .05, -.24, .54, 0],
  [CHARGE.release, -.108, .165, .035, .06, -.23, .53, 0],
  [1.20, -.085, .13, -.045, -.04, -.15, .38, 0],
  [1.30, -.05, .08, -.02, -.03, -.04, .14, 0],
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
export function reloadMotion(progress: number, empty = false) {
  const p = Math.max(0, Math.min(1, progress)), t = p * reloadLength(empty), keys = empty ? emptyKeys : tacticalKeys;
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
