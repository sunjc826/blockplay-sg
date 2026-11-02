import { reloadLength, type WeaponSpec } from './fps-rules';
import { smoothStep } from './fps-weapon-motion';

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

/** Cosmetic impulses on the weapon, never the camera or gameplay clock. Sampling
 * absolute progress keeps pause/resume, low frame rates and shop speed modifiers
 * deterministic. Mechanical contacts retain their existing animation/audio times. */
export function reloadEnergy(progress: number, empty: boolean, weapon: Pick<WeaponSpec, 'id' | 'weightKg' | 'feed' | 'action'>) {
  const time = Math.max(0, Math.min(1, progress)) * reloadLength(empty);
  const belt = weapon.feed === 'belt';
  // The integral launcher inherits the mass of the rifle that carries it.
  const mass = weapon.id === 'ff-oicw-launcher' ? 6.8 : weapon.weightKg ?? 3.8;
  const agility = Math.max(.38, Math.min(1.3, Math.sqrt(3.8 / Math.max(.8, mass))));
  const heft = Math.max(.8, Math.min(1.4, Math.sqrt(mass / 3.8)));
  const prepare = accent(time, 0, .035, .10);
  const lift = accent(time, .035, .12, .23);
  const pull = accent(time, belt ? .30 : .16, belt ? .345 : .225, .38);
  const seatTime = belt ? .64 : .74;
  const brace = accent(time, seatTime - .065, seatTime - .018, seatTime);
  const seat = accent(time, seatTime, seatTime + .014, seatTime + .075);
  const rebound = accent(time, seatTime + .035, seatTime + .068, seatTime + .12);
  const cover = belt ? accent(time, .74, .752, .83) : 0;
  const rack = empty ? accent(time, .94, 1.04, 1.16) : 0;
  const release = empty ? accent(time, 1.16, 1.185, 1.28) : 0;
  const shoulder = accent(time, empty ? 1.30 : .84, empty ? 1.39 : .92, reloadLength(empty));
  const turn = weapon.id === 'sar21-inspired' ? -1 : 1;
  return {
    x: agility * (.012 * prepare - .014 * lift + .012 * pull - .009 * seat + .004 * rebound),
    y: agility * (-.018 * prepare + .024 * lift - .018 * pull - .008 * brace + .024 * seat - .009 * rebound - .016 * cover - .009 * shoulder),
    z: heft * (.012 * prepare + .017 * pull + .009 * brace - .019 * seat + .008 * rebound + .012 * rack - .022 * release - .014 * shoulder),
    pitch: agility * (-.045 * prepare + .055 * lift - .035 * pull + .055 * seat - .022 * rebound - .055 * cover - .045 * release + .025 * shoulder),
    yaw: agility * (.025 * prepare - .035 * lift + .025 * pull + turn * (.025 * rack - .035 * release)),
    roll: agility * (.06 * prepare - .085 * lift + .05 * pull - .025 * brace - .045 * seat + .02 * rebound + .025 * cover + turn * .045 * release + .035 * shoulder),
  };
}
