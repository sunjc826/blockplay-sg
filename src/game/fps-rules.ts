/** Arcade tuning, intentionally independent of real equipment specifications. */
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
export interface WeaponSpec { /** Unloaded arcade carry mass, in kg. */ weightKg?: number; fireMode?: 'auto' | 'semi'; caliberMm: number; id: string; name: string; role: string; capacity: number; reserve: number; interval: number; reload: number; recoil: number; recoilRecovery: number; sightHeight: number; damage: number; aimFov: number; mobility: number; optic?: WeaponOptic; ballistics: BallisticSpec; traits?: readonly WeaponTrait[] }
export const FPS_WEAPONS: readonly WeaponSpec[] = [
  // The rifle holds its damage to twice the support weapon's range; the support
  // weapon trades that away for its volume of fire. Paid variants lift both bands.
  // The support weapon also kicks harder and settles slower than the rifle, which
  // is what its volume of fire is bought with.
  { caliberMm: 5.56, id: 'sar21-inspired', weightKg: 3.8, name: 'SAR 21', role: 'Bullpup rifle', capacity: 30, reserve: 120, interval: 0.12, reload: 1.8, recoil: 0.018, recoilRecovery: 1, sightHeight: 0.328, damage: 36, aimFov: magnifiedFov(1.5), mobility: 1, optic: 'integrated', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 30, far: 90, minScale: 0.55 }, { kind: 'precision', multiplier: 1.6 }] },
  { caliberMm: 5.56, id: 'ultimax-inspired', weightKg: 5, name: 'Ultimax', role: 'Support weapon', capacity: 60, reserve: 180, interval: 0.085, reload: 2.5, recoil: 0.026, recoilRecovery: 0.85, sightHeight: 0.28, damage: 30, aimFov: HIP_FOV, mobility: 1, optic: 'reflex', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 14, far: 45, minScale: 0.40 }, { kind: 'precision', multiplier: 1.5 }] },
  { caliberMm: 9, id: 'p30-inspired', weightKg: 0.8, name: 'P30', role: 'Semi-auto pistol', fireMode: 'semi', capacity: 15, reserve: 60, interval: .22, reload: 1.25, recoil: .022, recoilRecovery: 1.35, sightHeight: .232, damage: 28, aimFov: HIP_FOV, mobility: 1.14, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 12, far: 42, minScale: .35 }, { kind: 'precision', multiplier: 1.8 }] },
  { caliberMm: 7.62, id: 'mag-inspired', weightKg: 11.8, name: 'FN MAG', role: 'General-purpose MG', capacity: 100, reserve: 200, interval: .12, reload: 4.6, recoil: .042, recoilRecovery: .75, sightHeight: .305, damage: 60, aimFov: HIP_FOV, mobility: .74, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 45, far: 120, minScale: .70 }, { kind: 'precision', multiplier: 1.5 }] },
  { caliberMm: 12.7, id: 'cis50-inspired', weightKg: 30, name: 'CIS 50MG', role: 'Heavy machine gun', capacity: 50, reserve: 100, interval: .14, reload: 5.8, recoil: .064, recoilRecovery: .65, sightHeight: .34, damage: 160, aimFov: HIP_FOV, mobility: .55, optic: 'iron', ballistics: HITSCAN,
    traits: [{ kind: 'falloff', near: 55, far: 140, minScale: .75 }, { kind: 'precision', multiplier: 1.4 }] },
];

/** Stable family indexes are shared by saves, keyboard shortcuts and LAN packets. */
export const validWeaponIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < FPS_WEAPONS.length;
export const DEFAULT_VARIANTS = ['sar-issued', 'ult-issued', 'p30-issued', 'mag-issued', 'cis50-issued'] as const;

export interface WeaponState { magazine: number; reserve: number; cooldown: number; reloadRemaining: number }
export const createLoadout = (weapons = FPS_WEAPONS): WeaponState[] => weapons.map(w => ({ magazine: w.capacity, reserve: w.reserve, cooldown: 0, reloadRemaining: 0 }));
export function beginReload(state: WeaponState, index: number, weapons = FPS_WEAPONS) {
  if (state.reloadRemaining > 0 || state.reserve === 0 || state.magazine === weapons[index].capacity) return false;
  state.reloadRemaining = weapons[index].reload;
  return true;
}
export function advanceWeapon(state: WeaponState, index: number, dt: number, weapons = FPS_WEAPONS) {
  dt = Math.max(0, dt);
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.reloadRemaining <= 0) return;
  state.reloadRemaining = Math.max(0, state.reloadRemaining - dt);
  if (state.reloadRemaining === 0) {
    const transfer = Math.min(weapons[index].capacity - state.magazine, state.reserve);
    state.magazine += transfer; state.reserve -= transfer;
  }
}
export function fireWeapon(state: WeaponState, index: number, weapons = FPS_WEAPONS) {
  if (state.magazine <= 0 || state.reloadRemaining > 0 || state.cooldown > 0) return false;
  state.magazine--; state.cooldown = weapons[index].interval; return true;
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
