import { reloadLength, type WeaponSpec } from './fps-rules';
import { MAGAZINE_THROW, READY_BEATS, READY_SECONDS, smoothStep, type ReloadStyle } from './fps-weapon-motion';

/** Accelerate into contact; the endpoints stay still for a clean physical handoff. */
export const reloadDrive = (progress: number) => {
  const p = Math.max(0, Math.min(1, progress));
  return smoothStep(p * p);
};

// A fast attack followed by a longer recovery, with zero velocity at either end.
function accent(time: number, start: number, peak: number, end: number) {
  if (time <= start || time >= end) return 0;
  return time < peak ? smoothStep((time - start) / (peak - start)) : 1 - smoothStep((time - peak) / (end - peak));
}

/** Light guns turn more readily; heavy ones carry more along their length. */
function handlingWeight(weapon: Pick<WeaponSpec, 'id' | 'weightKg'>) {
  // The integral launcher inherits the mass of the rifle that carries it.
  const mass = weapon.id === 'ff-oicw-launcher' ? 6.8 : weapon.id === 'cc-qts11-launcher' ? 5.6 : weapon.weightKg ?? 3.8;
  return { agility: Math.max(.38, Math.min(1.3, Math.sqrt(3.8 / Math.max(.8, mass)))), heft: Math.max(.8, Math.min(1.4, Math.sqrt(mass / 3.8))) };
}

/** Cosmetic impulses on the weapon, never the camera or gameplay clock. Sampling
 * absolute progress keeps pause/resume, low frame rates and shop speed modifiers
 * deterministic. Mechanical contacts retain their existing animation/audio times. */
export function reloadEnergy(progress: number, empty: boolean, weapon: Pick<WeaponSpec, 'id' | 'weightKg' | 'feed' | 'action'>, style: ReloadStyle = 'improved') {
  const time = Math.max(0, Math.min(1, progress)) * reloadLength(empty);
  const belt = weapon.feed === 'belt';
  const { agility, heft } = handlingWeight(weapon);
  const prepare = accent(time, 0, .035, .10);
  const lift = accent(time, .035, .12, .23);
  const tension = accent(time, belt ? .28 : .16, belt ? .31 : .205, belt ? .335 : .23);
  const pull = accent(time, belt ? .315 : .205, belt ? .35 : .265, .39);
  const pullRecover = accent(time, belt ? .35 : .265, belt ? .38 : .31, .43);
  // Slinging the magazine away shoves the gun the other way, once the hand is off it.
  const fling = belt || style === 'original' ? 0 : accent(time, MAGAZINE_THROW.release, MAGAZINE_THROW.release + .015, MAGAZINE_THROW.gone);
  const seatTime = belt ? .64 : .74;
  const brace = accent(time, seatTime - .065, seatTime - .018, seatTime);
  const seat = accent(time, seatTime, seatTime + .014, seatTime + .075);
  const rebound = accent(time, seatTime + .035, seatTime + .068, seatTime + .12);
  const cover = belt ? accent(time, .74, .752, .83) : 0;
  const rack = empty ? accent(time, .97, 1.015, 1.16) : 0;
  const rackStop = empty ? accent(time, 1.015, 1.035, 1.11) : 0;
  const release = empty ? accent(time, 1.16, 1.175, 1.27) : 0;
  const releaseRecover = empty ? accent(time, 1.19, 1.23, 1.32) : 0;
  const shoulder = accent(time, empty ? 1.30 : .84, empty ? 1.39 : .92, reloadLength(empty));
  const turn = weapon.id === 'sar21-inspired' ? -1 : 1;
  return {
    x: agility * (.012 * prepare - .014 * lift - .012 * tension + .033 * pull - .012 * pullRecover + .035 * fling - .022 * seat + .010 * rebound),
    y: agility * (-.018 * prepare + .024 * lift + .016 * tension - .045 * pull + .018 * pullRecover - .018 * fling - .024 * brace + .060 * seat - .026 * rebound - .040 * cover - .009 * shoulder),
    z: heft * (.012 * prepare - .016 * tension + .045 * pull - .020 * pullRecover + .025 * brace - .048 * seat + .020 * rebound + .060 * rack - .022 * rackStop - .065 * release + .023 * releaseRecover - .014 * shoulder),
    pitch: agility * (-.045 * prepare + .055 * lift + .035 * tension - .095 * pull + .040 * pullRecover - .030 * fling - .045 * brace + .145 * seat - .065 * rebound - .130 * cover + .075 * rack - .055 * rackStop - .130 * release + .045 * releaseRecover + .025 * shoulder),
    yaw: agility * (.025 * prepare - .035 * lift + .055 * pull - .040 * fling + turn * (.055 * rack - .040 * rackStop - .070 * release + .025 * releaseRecover)),
    roll: agility * (.06 * prepare - .085 * lift - .035 * tension + .120 * pull - .045 * pullRecover + .070 * fling - .065 * brace - .115 * seat + .055 * rebound + .060 * cover + turn * (.060 * rackStop + .105 * release - .040 * releaseRecover) + .035 * shoulder),
  };
}

/** The bolt reaching home: a small jolt that dies away, gone before control returns. */
function boltJolt(seconds: number) {
  const since = seconds - READY_BEATS.home + .02, attack = .03;
  if (since <= 0) return 0;
  if (since < attack) return smoothStep(since / attack);
  const ring = since - attack;
  return Math.exp(-ring * 12) * Math.cos(ring * 2 * Math.PI * 5) * (1 - smoothStep((seconds - (READY_SECONDS - .2)) / .2));
}
const readyBeats = (progress: number) => {
  const seconds = Math.max(0, Math.min(1, progress)) * READY_SECONDS, { pull, stop, returns } = READY_BEATS;
  return {
    // The draw tugs the gun back a little. It stays there through the hold and
    // only eases off as the hand starts for the grip.
    drag: smoothStep((seconds - pull) / (stop - pull)) * (1 - smoothStep((seconds - returns) / .3)),
    jolt: boltJolt(seconds),
  };
};
/**
 * The spawn rack's force on the weapon, on top of `readyMotion`'s poses. The
 * hands ride the gun, so this stays small: the draw and the handle flying home
 * are what should read, and the hand must not be carried forward as it lets go.
 * Sampled, not simulated, so a pause or slow frame cannot change it.
 */
export function readyEnergy(progress: number, weapon: Pick<WeaponSpec, 'id' | 'weightKg'>) {
  const { agility } = handlingWeight(weapon), { drag, jolt } = readyBeats(progress);
  const turn = weapon.id === 'sar21-inspired' ? -1 : 1;
  return {
    x: 0,
    y: agility * -.006 * jolt,
    z: Math.min(1, agility) * (.02 * drag - .004 * jolt),
    pitch: agility * .03 * drag - Math.min(1, agility) * .012 * jolt,
    yaw: agility * turn * (.015 * drag - .012 * jolt),
    roll: agility * turn * (-.01 * drag + .03 * jolt),
  };
}
/** What the rack does to the view: a slight lean with the draw and a tap as the bolt lands. Reduced motion skips it. */
export function readyViewKick(progress: number, weapon: Pick<WeaponSpec, 'id' | 'weightKg'>) {
  const { agility } = handlingWeight(weapon), { drag, jolt } = readyBeats(progress);
  return {
    pitch: agility * (.002 * drag - .005 * jolt),
    roll: agility * (weapon.id === 'sar21-inspired' ? -1 : 1) * .003 * jolt,
  };
}
