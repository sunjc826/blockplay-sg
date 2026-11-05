import { weaponCarryClass, weaponCarryPose, type WeaponSwitch } from './fps-weapon-carry';
import type { WeaponSpec } from './fps-rules';
import type { HandsCue } from './hands-audio';
import { reloadMechanism } from './reload-audio';
import type { SfxGroup } from './sfx-bank';

/** Share of the draw at which the gun has all but arrived and the support hand meets it. */
export const SWITCH_SETTLE_AT = .8;

/** The carry point's side of the body: metres from the centre line happen to suit pan directly. */
const carrySide = (spec: WeaponSpec) => weaponCarryPose(spec).position[0];

/** The hand landing on this gun, at the level it was published. A launcher mode is the same gun as its rifle. */
export function weaponSettleCue(spec: WeaponSpec): Omit<HandsCue, 'at'> {
  const mechanism = reloadMechanism(spec);
  return { group: `switch-settle-${mechanism === 'oicw-launcher' ? 'oicw' : mechanism}` as SfxGroup, pan: 0, level: 1 };
}
/** A thumb moving the selector, for a rifle's launcher mode. */
export const WEAPON_MODE_CUE: Omit<HandsCue, 'at'> = { group: 'switch-mode', pan: 0, level: 1 };

/**
 * Stow, draw and settle, on the beats of `weaponSwitchFrame` in seconds. Each is
 * timed from its attack, at the recording's natural speed. Switches are locked out
 * until this ends, so these never stack up.
 */
export function weaponSwitchCues(state: Pick<WeaponSwitch, 'from' | 'to' | 'stow' | 'draw'>, specs: readonly WeaponSpec[]): HandsCue[] {
  const from = specs[state.from], to = specs[state.to];
  return [
    { at: .001, group: `switch-stow-${weaponCarryClass(from)}` as SfxGroup, pan: carrySide(from), level: 1 },
    { at: state.stow, group: `switch-draw-${weaponCarryClass(to)}` as SfxGroup, pan: carrySide(to), level: 1 },
    { at: state.stow + state.draw * SWITCH_SETTLE_AT, ...weaponSettleCue(to) },
  ];
}
/** The cue this step reached. A hitch can pass several: only the latest plays. */
export function weaponSwitchCue(state: Pick<WeaponSwitch, 'from' | 'to' | 'stow' | 'draw'>, specs: readonly WeaponSpec[], from: number, to: number) {
  return weaponSwitchCues(state, specs).filter(cue => from < cue.at && cue.at <= to).pop() ?? null;
}
