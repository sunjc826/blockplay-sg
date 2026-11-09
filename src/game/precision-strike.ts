import type { ArenaPoint } from './arena-rules';
import type { createVerticalMovement } from './vertical-movement';

export const PRECISION_STRIKE = { range: 250, radius: 8, coreRadius: 4, damage: 250, edgeDamage: 60 } as const;

/** Full damage across the core, then falloff through the marked outer ring. */
export function precisionStrikeDamage(distance: number) {
  const { radius, coreRadius, damage, edgeDamage } = PRECISION_STRIKE;
  if (!Number.isFinite(distance) || distance < 0 || distance > radius) return 0;
  return damage - (damage - edgeDamage) * Math.max(0, distance - coreRadius) / (radius - coreRadius);
}

/** A designator needs a visible surface, not room to place a standing device.
 * Preview and authority use the same range, surface and protection checks. */
export function precisionStrikePlacement(origin: ArenaPoint, target: ArenaPoint | null, options: {
  movement: Pick<ReturnType<typeof createVerticalMovement>, 'supportHeight' | 'canOccupy'>;
  wallDistance: (from: ArenaPoint, direction: ArenaPoint, range: number) => number;
  spawns: readonly { x: number; z: number }[];
  protectedEnemies: readonly { x: number; z: number }[];
}): { at: ArenaPoint; reason: '' } | { at: null; reason: string } {
  if (!target || ![target.x, target.y, target.z].every(Number.isFinite) || Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z) > PRECISION_STRIKE.range)
    return { at: null, reason: `Aim at an enemy or visible ground within ${PRECISION_STRIKE.range}m.` };
  const floor = options.movement.supportHeight(target.x, target.z, target.y + .3, .15, .2);
  if (floor === null || Math.abs(target.y - floor) > .35 || !options.movement.canOccupy(target.x, floor, target.z, .15, .2))
    return { at: null, reason: 'Mark a supported surface inside the battlefield.' };
  const at = { x: target.x, y: floor + .4, z: target.z };
  const length = Math.hypot(at.x - origin.x, at.y - origin.y, at.z - origin.z);
  if (length > .1 && options.wallDistance(origin, { x: (at.x - origin.x) / length, y: (at.y - origin.y) / length, z: (at.z - origin.z) / length }, length) < length - .1)
    return { at: null, reason: 'An obstacle blocks the target. Aim at visible ground.' };
  if ([...options.spawns, ...options.protectedEnemies].some(p => Math.hypot(p.x - at.x, p.z - at.z) < PRECISION_STRIKE.radius + 1))
    return { at: null, reason: 'Move the strike zone farther from spawn protection.' };
  return { at, reason: '' };
}
