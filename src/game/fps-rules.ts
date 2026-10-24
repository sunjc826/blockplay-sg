import type { BipodKind } from './weapon-support';
/** Arcade tuning, intentionally independent of real equipment specifications. */
import { MACHINE_GUN_LAYOUT } from './machine-gun-layout';
import { ENEMY_WEAPON_LAYOUT } from './enemy-weapon-layout';
import { falloffScale, HITSCAN, type BallisticSpec } from './fps-ballistics';
export type WeaponOptic = 'integrated' | 'reflex' | 'precision' | 'iron';
export const HIP_FOV = 65;
export const magnifiedFov = (zoom: number) => 2 * Math.atan(Math.tan(HIP_FOV * Math.PI / 360) / zoom) * 180 / Math.PI;
export const opticMagnification = (weapon: WeaponSpec) => Math.tan(HIP_FOV * Math.PI / 360) / Math.tan(weapon.aimFov * Math.PI / 360);
/**
 * Behavior an item grants, as opposed to the numbers it shifts. The shop folds
 * these alongside the scalar modifiers and the engine reads them at the point of
 * use, so a catalog entry can change how a weapon acts rather than only how it
 * scores. Not every kind is wired into the engine yet; see docs/ARMORY-ROADMAP.md.
 */
export type WeaponTrait =
  | { kind: 'falloff'; near: number; far: number; minScale: number }
  | { kind: 'precision'; multiplier: number }
  | { kind: 'splash'; radius: number; minScale: number }
  | { kind: 'penetration'; surfaces: number; decay: number }
  | { kind: 'reload-single'; shellSeconds: number }
  | { kind: 'zeroing'; distance: number }
  | { kind: 'on-kill'; heal?: number; ammo?: number };
export type WeaponTraitKind = WeaponTrait['kind'];
/** Later sources win, matching how an attachment optic replaces the weapon's own. */
export function findTrait<K extends WeaponTraitKind>(traits: readonly WeaponTrait[] | undefined, kind: K) {
  let found: Extract<WeaponTrait, { kind: K }> | undefined;
  // The comparison cannot narrow a generic key, so the match is asserted once here.
  for (const trait of traits ?? []) if (trait.kind === kind) found = trait as Extract<WeaponTrait, { kind: K }>;
  return found;
}
/**
 * `recoil` is how hard one round throws the muzzle; `recoilRecovery` is how
 * fast it comes back, as a multiple of the baseline settle rate. See
 * `fps-recoil` for why a kick needs both numbers rather than one.
 */
/** How the platform is fed, which decides what a capacity part looks like and is called. */
export type WeaponFeed = 'magazine' | 'drum' | 'belt';
/** How the action holds its next round: closed (rifles, pistol) keeps one in the chamber; open (machine guns) does not. */
export type WeaponBolt = 'open' | 'closed';
export interface WeaponSpec { bipod?: BipodKind; feed?: WeaponFeed; bolt?: WeaponBolt; requiresMount?: boolean; /** Unloaded arcade carry mass, in kg. */ weightKg?: number; fireMode?: 'auto' | 'semi'; caliberMm: number; id: string; name: string; role: string; capacity: number; reserve: number; interval: number; reload: number; recoil: number; recoilRecovery: number; sightHeight: number; damage: number; aimFov: number; mobility: number; optic?: WeaponOptic; ballistics: BallisticSpec; traits?: readonly WeaponTrait[] }
export const FPS_WEAPONS: readonly WeaponSpec[] = [
  // The rifle holds its damage to twice the support weapon's range; the support
  // weapon trades that away for its volume of fire. Paid variants lift both bands.
  // The support weapon also kicks harder and settles slower than the rifle, which
  // is what its volume of fire is bought with.
  { caliberMm: 5.56, id: 'sar21-inspired', weightKg: 3.8, name: 'SAR 21', role: 'Bullpup rifle', capacity: 30, reserve: 120, interval: 0.12, reload: 1.8, recoil: 0.018, recoilRecovery: 1, sightHeight: 0.328, damage: 36, aimFov: magnifiedFov(1.5), mobility: 1, optic: 'integrated', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 30, far: 90, minScale: 0.55 }, { kind: 'precision', multiplier: 1.6 }] },
  { caliberMm: 5.56, id: 'ultimax-inspired', feed: 'drum', bolt: 'open', bipod: 'standard', weightKg: 5, name: 'Ultimax', role: 'Support weapon', capacity: 60, reserve: 180, interval: 0.085, reload: 2.5, recoil: 0.026, recoilRecovery: 0.85, sightHeight: 0.28, damage: 30, aimFov: HIP_FOV, mobility: 1, optic: 'reflex', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 14, far: 45, minScale: 0.40 }, { kind: 'precision', multiplier: 1.5 }] },
  { caliberMm: 9, id: 'p30-inspired', weightKg: 0.8, name: 'P30', role: 'Semi-auto pistol', fireMode: 'semi', capacity: 15, reserve: 60, interval: .22, reload: 1.25, recoil: .022, recoilRecovery: 1.35, sightHeight: .232, damage: 28, aimFov: HIP_FOV, mobility: 1.14, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 12, far: 42, minScale: .35 }, { kind: 'precision', multiplier: 1.8 }] },
  { caliberMm: 7.62, id: 'mag-inspired', feed: 'belt', bolt: 'open', bipod: 'standard', weightKg: 11.8, name: 'FN MAG', role: 'General-purpose MG', capacity: 100, reserve: 200, interval: .12, reload: 4.6, recoil: .042, recoilRecovery: .75, sightHeight: MACHINE_GUN_LAYOUT['mag-inspired'].sightHeight, damage: 60, aimFov: HIP_FOV, mobility: .74, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 45, far: 120, minScale: .70 }, { kind: 'precision', multiplier: 1.5 }] },
  { requiresMount: true, caliberMm: 12.7, id: 'cis50-inspired', feed: 'belt', bolt: 'open', bipod: 'heavy', weightKg: 30, name: 'CIS 50MG', role: 'Heavy machine gun', capacity: 50, reserve: 100, interval: .14, reload: 5.8, recoil: .064, recoilRecovery: .65, sightHeight: MACHINE_GUN_LAYOUT['cis50-inspired'].sightHeight, damage: 160, aimFov: HIP_FOV, mobility: .55, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 55, far: 140, minScale: .75 }, { kind: 'precision', multiplier: 1.4 }] },
  // Enemy issue: carried by opposing forces and taken from them, never sold.
  // The carbine trades the SAR's reach for a quicker cycle and lighter handling;
  // the rifle sits beside the SAR; the LMG is the Ultimax's belt-fed rival.
  { caliberMm: 5.56, id: 'xm8-inspired', weightKg: 3.4, name: 'XM8', role: 'Modular carbine', capacity: 30, reserve: 120, interval: .1, reload: 1.75, recoil: .017, recoilRecovery: 1.1, sightHeight: ENEMY_WEAPON_LAYOUT['xm8-inspired'].sightHeight, damage: 33, aimFov: HIP_FOV, mobility: 1.04, optic: 'reflex', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 24, far: 75, minScale: .5 }, { kind: 'precision', multiplier: 1.6 }] },
  { caliberMm: 5.56, id: 'g36-inspired', weightKg: 3.6, name: 'G36', role: 'Assault rifle', capacity: 30, reserve: 120, interval: .11, reload: 1.9, recoil: .016, recoilRecovery: 1.05, sightHeight: ENEMY_WEAPON_LAYOUT['g36-inspired'].sightHeight, damage: 36, aimFov: magnifiedFov(3), mobility: 1, optic: 'integrated', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 32, far: 95, minScale: .55 }, { kind: 'precision', multiplier: 1.6 }] },
  { caliberMm: 5.56, id: 'mg4-inspired', feed: 'belt', bolt: 'open', bipod: 'standard', weightKg: 8.2, name: 'MG4', role: 'Light machine gun', capacity: 100, reserve: 200, interval: .075, reload: 3.8, recoil: .024, recoilRecovery: .85, sightHeight: ENEMY_WEAPON_LAYOUT['mg4-inspired'].sightHeight, damage: 31, aimFov: HIP_FOV, mobility: .9, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 22, far: 65, minScale: .45 }, { kind: 'precision', multiplier: 1.5 }] },
];

/** Stable family indexes are shared by saves, keyboard shortcuts and LAN packets. */
export const validWeaponIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < FPS_WEAPONS.length;
/** Each family's baseline. The enemy-issue baselines are never owned until found. */
export const DEFAULT_VARIANTS = ['sar-issued', 'ult-issued', 'p30-issued', 'mag-issued', 'cis50-issued', 'xm8-carbine', 'g36-rifle', 'mg4-standard'] as const;

/**
 * The ammunition in one weapon. `magazine` is every round in the gun, the
 * chambered one included, so a full closed-bolt rifle reads capacity + 1.
 * `reloadRemaining` is seconds left in the reload under way, measured against
 * the weapon's full `reload`, so its complement is how far through it is.
 *
 * A closed-bolt gun (rifles, the pistol) fires the round in its chamber and
 * feeds the next from the magazine; with the magazine out it still has that one
 * round, and run dry it must chamber a fresh one. An open-bolt gun (the machine
 * guns) holds no round in the chamber: `chambered` means its bolt is cocked,
 * which it stops being when the belt or drum runs dry.
 *
 * A reload takes the magazine out (`RELOAD_POINTS.out`), seats a fresh one
 * (`seat`) and, from empty, chambers a round or cocks the bolt (`chamber`).
 * The rounds left in a removed magazine go back to the reserve. A reload can be
 * interrupted (`interruptReload`); `reloadSaved` keeps how far it got, and the
 * next reload of that weapon resumes there.
 */
export interface WeaponState { magazine: number; reserve: number; cooldown: number; reloadRemaining: number;
  /** Closed bolt: a round sits in the chamber. Open bolt: the bolt is cocked. Missing reads as "rounds in the gun". */
  chambered?: boolean;
  /** The magazine is out of the gun: an interrupted reload left the well empty. */
  magazineOut?: boolean;
  /** Share of an interrupted reload already done, which the next reload resumes from. */
  reloadSaved?: number;
  /** The reload under way began with nothing ready to fire, so it ends by chambering. */
  reloadEmpty?: boolean }
/** What the ammunition rules need of a weapon; the arena host passes its own sanitized copies. */
export type AmmoSpec = Pick<WeaponSpec, 'capacity' | 'reload' | 'interval' | 'bolt'>;
const closedBolt = (weapon: AmmoSpec) => weapon.bolt !== 'open';
export const isChambered = (state: WeaponState) => state.chambered ?? state.magazine > 0;
/** A round in the chamber, counted in `magazine`; only a closed bolt ever has one. */
export const chamberRound = (state: WeaponState, weapon: AmmoSpec) => closedBolt(weapon) && isChambered(state) && state.magazine > 0 ? 1 : 0;
/** Rounds in the magazine itself, the chambered one aside. */
export const magazineRounds = (state: WeaponState, weapon: AmmoSpec) => state.magazineOut ? 0 : Math.max(0, state.magazine - chamberRound(state, weapon));
/** A full gun: a full magazine, plus one in the chamber on a closed bolt. */
export const fullLoad = (weapon: AmmoSpec) => weapon.capacity + (closedBolt(weapon) ? 1 : 0);
/** Whether a trigger pull would fire, cooldown and reload aside. */
export function roundReady(state: WeaponState, weapon: AmmoSpec) {
  if (state.magazine <= 0 || !isChambered(state)) return false;
  return closedBolt(weapon) || !state.magazineOut;
}
export const createLoadout = (weapons: readonly (AmmoSpec & { reserve: number })[] = FPS_WEAPONS): WeaponState[] =>
  weapons.map(w => ({ magazine: fullLoad(w), reserve: w.reserve, cooldown: 0, reloadRemaining: 0, chambered: true }));
/** Shares of a reload: the magazine comes out, the fresh one seats, and from empty a round is chambered. */
export const RELOAD_POINTS = { out: .38, seat: .74, chamber: .9 } as const;
/**
 * Where in a reload the gun is ready again: once the fresh magazine seats, or,
 * from empty, once the round is chambered. Stopping before it costs the progress
 * the next reload resumes from; after it, only the settle is skipped.
 * The fractions match the viewmodel's MAG OUT, MAG IN and CHAMBER stages.
 */
export const reloadCommit = (empty: boolean) => empty ? RELOAD_POINTS.chamber : RELOAD_POINTS.seat;
/** How far through its reload a weapon is, 0..1, or 0 when it is not reloading. */
export const reloadProgress = (state: WeaponState, index: number, weapons: readonly AmmoSpec[] = FPS_WEAPONS) =>
  state.reloadRemaining > 0 ? Math.max(0, Math.min(1, 1 - state.reloadRemaining / weapons[index].reload)) : 0;
/**
 * Anything to do: a magazine to top up from the reserve, an empty well to fill,
 * or a seated magazine whose round still has to be chambered.
 */
export function canReload(state: WeaponState, weapon: AmmoSpec) {
  if (state.magazineOut) return true;
  if (!isChambered(state) && state.magazine > 0) return true;
  return state.reserve > 0 && magazineRounds(state, weapon) < weapon.capacity;
}
export function beginReload(state: WeaponState, index: number, weapons: readonly AmmoSpec[] = FPS_WEAPONS) {
  if (state.reloadRemaining > 0 || !canReload(state, weapons[index])) return false;
  state.reloadEmpty = !roundReady({ ...state, magazineOut: false }, weapons[index]);
  // Nothing ready means nothing chambered (or no bolt cocked), whatever was last recorded.
  if (state.reloadEmpty) state.chambered = false;
  // Resume an interrupted reload where it stopped, always short of the point
  // where it would be ready, so a resumed reload still gets there.
  const saved = Math.max(0, Math.min(reloadCommit(state.reloadEmpty) - .01, Number.isFinite(state.reloadSaved) ? state.reloadSaved! : 0));
  state.reloadRemaining = weapons[index].reload * (1 - saved);
  state.reloadSaved = 0;
  return true;
}
/**
 * Stops a reload, for a shot, a sprint, a weapon change or anything else that
 * needs the hands. Past its commit point the gun is ready and the reload is
 * simply `finished`; before it the reload is `suspended`, its progress kept for
 * the next one to resume, and the gun is left as that progress left it: with
 * its old magazine, an empty well, or a fresh magazine yet to be chambered.
 */
export function interruptReload(state: WeaponState, index: number, weapons: readonly AmmoSpec[] = FPS_WEAPONS): 'finished' | 'suspended' | null {
  if (state.reloadRemaining <= 0) return null;
  const progress = reloadProgress(state, index, weapons);
  state.reloadRemaining = 0;
  if (progress >= reloadCommit(state.reloadEmpty === true)) return 'finished';
  state.reloadSaved = progress;
  return 'suspended';
}
function removeMagazine(state: WeaponState, weapon: AmmoSpec) {
  if (state.magazineOut) return;
  const kept = chamberRound(state, weapon);
  state.reserve += state.magazine - kept; state.magazine = kept; state.magazineOut = true;
}
function seatMagazine(state: WeaponState, weapon: AmmoSpec) {
  removeMagazine(state, weapon);
  const fresh = Math.max(0, Math.min(weapon.capacity, state.reserve));
  state.magazine += fresh; state.reserve -= fresh; state.magazineOut = false;
  // An open bolt that is still cocked fires straight from the fresh belt or drum.
}
export function advanceWeapon(state: WeaponState, index: number, dt: number, weapons: readonly AmmoSpec[] = FPS_WEAPONS) {
  dt = Math.max(0, dt);
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.reloadRemaining <= 0) return;
  const weapon = weapons[index], before = reloadProgress(state, index, weapons);
  state.reloadRemaining = Math.max(0, state.reloadRemaining - dt);
  const after = state.reloadRemaining === 0 ? 1 : reloadProgress(state, index, weapons);
  const crossed = (point: number) => before < point && after >= point;
  if (crossed(RELOAD_POINTS.out)) removeMagazine(state, weapon);
  if (crossed(RELOAD_POINTS.seat)) seatMagazine(state, weapon);
  if (state.reloadEmpty && crossed(RELOAD_POINTS.chamber)) {
    // The charging handle: a round from the fresh magazine into the chamber, or the bolt cocked.
    // A reload resumed past the seat point still needs a magazine to chamber from.
    if (state.magazineOut || magazineRounds(state, weapon) === 0) seatMagazine(state, weapon);
    state.chambered = state.magazine > 0;
  }
}
export function fireWeapon(state: WeaponState, index: number, weapons: readonly AmmoSpec[] = FPS_WEAPONS) {
  const weapon = weapons[index];
  if (state.reloadRemaining > 0 || state.cooldown > 0 || !roundReady(state, weapon)) return false;
  state.magazine--; state.cooldown = weapon.interval;
  // The next round feeds from the magazine; with none, or none seated, the
  // chamber is empty. An open bolt runs home on its last round and must be cocked.
  state.chambered = closedBolt(weapon) ? !state.magazineOut && state.magazine > 0 : state.magazine > 0;
  return true;
}
export function movementInput(forward: number, side: number, yaw: number, speed: number, dt: number) {
  const normal = Math.max(1, Math.hypot(forward, side));
  return { x: (-Math.sin(yaw) * forward + Math.cos(yaw) * side) / normal * speed * dt, z: (-Math.cos(yaw) * forward - Math.sin(yaw) * side) / normal * speed * dt };
}
export const FPS_SPAWN = { x: -44, z: 68, yaw: 0, pitch: -0.03 };
export const FPS_TARGETS = [
  { x: -44, z: 56 }, { x: -50, z: 57 }, { x: -38, z: 57 }, { x: -56, z: 62 },
  { x: -32, z: 62 }, { x: -60, z: 55 }, { x: -26, z: 55 }, { x: -14, z: 64 },
];

/**
 * Damage a single round lands, given the range it travelled and the zone it
 * struck. Both the engine and the shop's preview read this, so a purchased
 * falloff or precision trait cannot mean one thing in the range and another on
 * the dossier. Rounded, so shots-to-kill breakpoints stay predictable.
 */
export function hitDamage(weapon: WeaponSpec, distance: number, zone?: string) {
  const falloff = findTrait(weapon.traits, 'falloff'), precision = findTrait(weapon.traits, 'precision');
  const ranged = weapon.damage * (falloff ? falloffScale(distance, falloff.near, falloff.far, falloff.minScale) : 1);
  return Math.max(1, Math.round(ranged * (zone === 'head' && precision ? precision.multiplier : 1)));
}

/**
 * Damage multiplier for a target caught `distance` from a burst's centre: full
 * at the centre, `minScale` at the edge, nothing beyond it.
 */
export function splashScale(distance: number, radius: number, minScale: number) {
  const reach = Math.max(0, radius), range = Math.max(0, distance);
  if (range > reach || reach === 0) return 0;
  return 1 + (Math.max(0, Math.min(1, minScale)) - 1) * (range / reach);
}
