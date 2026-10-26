import { smoothStep } from './fps-weapon-motion';

/**
 * Using a supply takes time, the way a reload does: the weapon goes down, the
 * hands do the job, and the effect lands at a commit point near the end. Until
 * then the supply is not spent, so a fresh trigger pull, a fresh sprint, a
 * reload, a weapon swap or getting into a vehicle simply stops the use and
 * keeps the item (`fps-reload`'s gate decides what counts as fresh).
 */
export type SupplyStyle = 'eat' | 'bandage' | 'medkit' | 'plates' | 'ammo';
export interface SupplyProfile {
  style: SupplyStyle;
  /** Seconds from raising the item to the weapon being back up. */
  seconds: number;
  /** Share of `seconds` at which the effect is applied and the item is spent. */
  commit: number;
  /** HUD verb: what the player is doing. */
  verb: string;
}
interface SupplyLike { id?: string; supplyType?: string; medical?: 'dressing' | 'kit'; effect?: { health?: number; armor?: number; reserve?: number } }

/** How a supply is used, from what it is and how much it does. Bigger meals take longer to eat. */
export function supplyProfile(item: SupplyLike): SupplyProfile {
  const { health = 0, armor = 0, reserve = 0 } = item.effect ?? {};
  if (item.supplyType === 'food') return { style: 'eat', seconds: 1.9 + Math.min(100, health) * .02, commit: .8, verb: 'EATING' };
  if (item.medical === 'kit' || (health && armor && item.medical !== 'dressing')) return { style: 'medkit', seconds: 4.4, commit: .8, verb: 'TREATING' };
  // A short roll is wound on quicker than a full field dressing.
  if (health) return { style: 'bandage', seconds: 2.4 + Math.min(60, health) * .0133, commit: .84, verb: 'DRESSING WOUND' };
  if (armor) return { style: 'plates', seconds: 2.6, commit: .76, verb: 'SWAPPING PLATES' };
  if (reserve) return { style: 'ammo', seconds: 1.8, commit: .72, verb: 'RESTOCKING' };
  return { style: 'bandage', seconds: 3, commit: .84, verb: 'USING' };
}

export interface SupplyUse { profile: SupplyProfile; elapsed: number; committed: boolean }
export const startSupplyUse = (profile: SupplyProfile): SupplyUse => ({ profile, elapsed: 0, committed: false });
export const supplyProgress = (use: SupplyUse) => Math.max(0, Math.min(1, use.elapsed / use.profile.seconds));
/** Steps a use: `commit` is true on the one step that crosses the commit point, `done` once it is over. */
export function advanceSupplyUse(use: SupplyUse, dt: number) {
  use.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
  const progress = supplyProgress(use), commit = !use.committed && progress >= use.profile.commit;
  if (commit) use.committed = true;
  return { commit, done: progress >= 1 };
}
/** Walking pace while the hands are busy. */
export const SUPPLY_MOVE_SCALE = .55;

const between = (p: number, from: number, to: number) => smoothStep((p - from) / (to - from));
const wave = (t: number, cycles: number) => Math.abs(Math.sin(Math.max(0, Math.min(1, t)) * Math.PI * cycles));
export interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number }
export interface SupplyMotion {
  /** 0 the weapon is up, 1 it is fully down and out of view. */
  weaponDown: number;
  /** The supply in the right hand, the support hand, and the item itself, in view space (metres, -z ahead). */
  right: Pose; left: Pose; item: Pose;
  /** What is left of the item: food being eaten, a roll being unwound. */
  remaining: number;
  /** Style-specific 0..1 action: a pouch lid opening, a wrap growing round the forearm. */
  action: number;
}
const pose = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Pose => ({ x, y, z, rx, ry, rz });
const mix = (a: Pose, b: Pose, t: number): Pose => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
  rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t, rz: a.rz + (b.rz - a.rz) * t });

/**
 * The hands' choreography for each kind of supply, as a pure function of
 * progress so the viewmodel can be posed from any frame and tested without a
 * renderer. Everything below the screen's bottom edge (about y −.34 at
 * z −.5) is out of view, which is where items come from and go.
 */
export function supplyMotion(style: SupplyStyle, progress: number): SupplyMotion {
  const p = Math.max(0, Math.min(1, progress));
  const raise = between(p, 0, .18), lower = between(p, .86, 1), present = raise * (1 - lower);
  const weaponDown = between(p, 0, .12) * (1 - between(p, .9, 1));
  const hidden = pose(.16, -.62, -.42), hiddenLeft = pose(-.16, -.62, -.42);
  const work = (p - .18) / (.86 - .18);
  let right: Pose, left: Pose, item: Pose, remaining = 1, action = 0;
  switch (style) {
    case 'eat': {
      // Three bites: up to the mouth and back, a little less left each time.
      const bite = wave(work, 3);
      const held = mix(pose(.11, -.27, -.46, -.3, -.2, .1), pose(.035, -.16, -.27, .35, .1, -.05), bite);
      right = mix(hidden, held, present); left = mix(hiddenLeft, pose(-.15, -.31, -.5, -.2, .3, -.2), present);
      item = { ...right, z: right.z - .045, y: right.y + .045 };
      remaining = 1 - Math.min(.7, Math.floor(Math.max(0, work) * 3 + .5) * .23);
      action = bite;
      break;
    }
    case 'bandage': {
      // The left forearm held across; the right hand winds the roll round it.
      const turn = Math.max(0, work) * Math.PI * 2 * 4, wrapping = between(p, .22, .3) * (1 - between(p, .78, .84));
      left = mix(hiddenLeft, pose(-.07, -.25, -.44, -.2, 1.15, -.15), present);
      const around = pose(-.03 + Math.cos(turn) * .055 * wrapping, -.22 + Math.sin(turn) * .045 * wrapping, -.43 + Math.sin(turn) * .02 * wrapping, -.3, .2, Math.cos(turn) * .4 * wrapping);
      right = mix(hidden, around, present);
      item = { ...right, x: right.x - .03, y: right.y + .02 };
      remaining = 1 - Math.max(0, Math.min(1, work)) * .65;
      action = between(p, .24, .82);
      break;
    }
    case 'medkit': {
      // Pouch out, lid open, injector to the arm and pressed home, lid shut.
      const lid = between(p, .2, .32) * (1 - between(p, .74, .84));
      const reach = between(p, .32, .44), press = between(p, .5, .58) * (1 - between(p, .66, .72));
      left = mix(hiddenLeft, pose(-.1, -.27, -.47, -.4, .25, 0), present);
      const atPouch = pose(-.06, -.24, -.46, -.5, 0, .2), atArm = pose(-.2, -.18 - press * .04, -.34, -.1, .9, 1.2);
      right = mix(hidden, mix(pose(.1, -.3, -.5, -.3, 0, 0), mix(atPouch, atArm, between(p, .44, .52) * (1 - between(p, .7, .78))), reach), present);
      item = { ...left, y: left.y + .03 };
      action = lid; remaining = 1 - press;
      break;
    }
    case 'plates': {
      // Both hands hold the insert up, tip it flat and slide it down into the carrier.
      const slide = between(p, .42, .78);
      const held = pose(0, -.24 - slide * .3, -.5 + slide * .12, -.15 - slide * 1.2, 0, 0);
      item = mix(pose(0, -.62, -.42), held, raise);
      right = { ...item, x: item.x + .14, rz: -.3 }; left = { ...item, x: item.x - .14, rz: .3 };
      action = slide;
      break;
    }
    case 'ammo': {
      // Pouch held low left, the right hand pulls loaded magazines across.
      const pull = wave(work, 2);
      left = mix(hiddenLeft, pose(-.12, -.3, -.48, -.35, .3, 0), present);
      right = mix(hidden, mix(pose(-.06, -.28, -.47, -.4, 0, .3), pose(.12, -.33, -.44, -.2, -.2, -.2), pull), present);
      item = { ...left, y: left.y + .035 };
      action = pull;
      break;
    }
  }
  return { weaponDown, right, left, item, remaining, action };
}
