import { reloadPhase, type ReloadStyle } from './fps-reload-styles';

export const smoothStep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
// Normalized timing follows the equipped weapon's reload duration, including shop modifiers.
const keys = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [.16, -.06, .15, -.04, -.10, .22, -.38, 0],
  [.34, -.06, .17, -.06, -.14, .24, -.43, .30],
  [.48, -.05, .16, -.06, -.11, .22, -.40, .36],
  [.68, -.04, .16, -.03, -.08, .17, -.34, 0],
  [.74, -.035, .17, -.05, -.03, .14, -.29, -.012],
  [.84, -.02, .12, -.03, -.06, -.10, -.14, 0],
  [1, 0, 0, 0, 0, 0, 0, 0],
];
export function reloadMotion(progress: number, style: ReloadStyle = 'standard') {
  const p = reloadPhase(progress, style);
  const index = Math.min(keys.length - 2, Math.max(0, keys.findIndex((_, i) => i < keys.length - 1 && p <= keys[i + 1][0])));
  const a = keys[index], b = keys[index + 1], t = smoothStep((p - a[0]) / (b[0] - a[0]));
  const v = a.slice(1).map((value, i) => value + (b[i + 1] - value) * t);
  const envelope = p === 0 || p === 1 ? 0 : Math.sin(Math.PI * p) ** 2;
  const hesitation = style === 'rookie' ? Math.sin(p * Math.PI * 10) * envelope : 0;
  const retained = style === 'tactical', paired = style === 'dual-mag';
  // Independent arcs make this more than a playback-speed change.
  if (style === 'rookie') { v[0] += hesitation * .012; v[3] += hesitation * .045; v[5] += hesitation * .065; }
  if (retained) { v[0] *= .6; v[4] *= .55; v[5] *= .62; }
  if (style === 'fast') { v[3] *= .65; v[5] *= 1.18; }
  if (paired) { v[4] *= .65; v[5] *= .75; v[6] *= .55; }
  const arc = p <= .16 || p >= .74 ? 0 : Math.sin(Math.PI * smoothStep((p - .16) / .58));
  const magazineSide = retained ? -.11 * arc : 0;
  return { x: v[0], y: v[1], z: v[2], pitch: v[3], yaw: v[4], roll: v[5], magazineDrop: v[6],
    magazineVisible: retained || paired || p < .38 || p > .47,
    magazineSide,
    magazineTwist: (retained ? -.45 : style === 'fast' ? .35 : 0) * arc,
    pairSwap: paired ? smoothStep((p - .34) / .34) : 0,
    handToMagazine: smoothStep(p / .16) * (1 - smoothStep((p - .74) / .20)),
    action: p <= .77 || p >= .93 ? 0 : Math.sin(smoothStep((p - .77) / .16) * Math.PI),
  };
}
export function reloadStage(remaining: number, empty = false, style: ReloadStyle = 'standard') {
  if (remaining <= 0) return '';
  const progress = reloadPhase(1 - remaining, style);
  return progress < .16 ? 'RELOADING' : progress < .47 ? style === 'dual-mag' ? 'SWAP PAIR' : style === 'tactical' ? 'RETAIN MAG' : 'MAG OUT' : progress < .74 ? 'MAG IN' : progress < .94 ? empty ? 'CHAMBER' : 'SEAT MAG' : 'READY';
}

