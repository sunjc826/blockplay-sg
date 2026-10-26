/**
 * Accessories a variant is built with: what is on the muzzle, what is on the
 * rail, which sight sits on top, and whether a brace sits behind the grip.
 *
 * Like the rest of a variant they are fixed, never sold or swapped on their
 * own; they arrive as `FittedPart.accessories` and resolve onto the weapon's
 * spec. What separates them from a barrel or a buffer is that each one changes
 * something besides a figure in the dossier: how loud the shot is and how far
 * it carries, whether it flashes, where a hip-fired round goes, what lights up
 * at night, and which sight the eye goes to. This module says how much; the
 * engine, the audio and the models read it from here.
 */

/** A can quietens the shot and hides the flash; a compensator does the reverse to keep the muzzle down. */
export type MuzzleDevice = 'suppressor' | 'compensator';
/** What is clamped to the rail: an aiming laser, a torch, or one housing with both. */
export type RailDevice = 'laser' | 'light' | 'laser-light';
/**
 * Which housing a fitted sight is. The weapon's `optic` still says how it aims
 * (`reflex` at 1x, `precision` magnified); this says what it looks like and
 * which reticle it carries.
 * - `mini-reflex`: a slide-cut pistol dot, co-witnessed with the iron sights.
 * - `holo`: a holographic window with a ring around the dot.
 * - `prism`: a short fixed-power prism scope with a chevron.
 * - `pistol-scope`: a long eye-relief scope on a pistol's frame rail.
 */
export type SightModel = 'mini-reflex' | 'holo' | 'prism' | 'pistol-scope';
export interface WeaponAccessories {
  muzzle?: MuzzleDevice;
  rail?: RailDevice;
  sight?: SightModel;
  /** A 1x dot at 45° beside a magnified sight, used by canting the weapon over. */
  offsetDot?: boolean;
  /** A folding brace behind a pistol grip, shouldered when firing. */
  brace?: boolean;
}

export const hasLaser = (accessories?: WeaponAccessories) => accessories?.rail === 'laser' || accessories?.rail === 'laser-light';
export const hasLight = (accessories?: WeaponAccessories) => accessories?.rail === 'light' || accessories?.rail === 'laser-light';

/**
 * How much of the hip-fire cone is left. A laser puts a dot where the round is
 * going, so the shooter lets the gun settle on it rather than guessing at the
 * crosshair; a brace holds the gun against the shoulder. Aimed fire is already
 * on the sights, so neither changes it: `weaponSpread` applies this to the hip
 * half of the cone only.
 */
export function hipSpreadScale(accessories?: WeaponAccessories) {
  return (hasLaser(accessories) ? .5 : 1) * (accessories?.brace ? .75 : 1);
}

/** The same cone, aimed in by `aim` (0 hip to 1 on the sights). */
export function accessorySpreadScale(accessories: WeaponAccessories | undefined, aim: number) {
  const hip = hipSpreadScale(accessories), aiming = Math.max(0, Math.min(1, aim));
  return hip + (1 - hip) * aiming;
}

/**
 * What a shot gives away. `flare` and `light` scale the muzzle flash and the
 * light it throws, `report` the loudness of the shot as anyone hears it, and
 * `heat` how much the shot counts towards drawing the fighting to that spot
 * (arena-rules' heat map, which the event director aims at).
 */
export interface MuzzleSignature { flare: number; light: number; report: number; heat: number }
const SIGNATURES: Record<MuzzleDevice | 'bare', MuzzleSignature> = {
  bare: { flare: 1, light: 1, report: 1, heat: 1 },
  // Not silent: the action still cycles and a rifle round still cracks past.
  suppressor: { flare: .1, light: .12, report: .4, heat: .3 },
  // The gas that would lift the muzzle goes sideways, where everyone sees and hears it.
  compensator: { flare: 1.6, light: 1.45, report: 1.3, heat: 1.2 },
};
export const muzzleSignature = (device?: MuzzleDevice): MuzzleSignature => SIGNATURES[device ?? 'bare'];

/** How far a weapon rolls to bring an offset dot to the eye. */
export const CANT_ROLL = Math.PI / 4;

/** A muzzle device named by a value from the network, or none. */
export const sanitizeMuzzle = (value: unknown): MuzzleDevice | undefined =>
  value === 'suppressor' || value === 'compensator' ? value : undefined;
