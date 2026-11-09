import type { ArenaPoint } from './arena-rules';
import type { createVerticalMovement } from './vertical-movement';

/** Shared by the preview and authority. Guardian is a small defensive device,
 * not a standing soldier or an offensive spawn-targeted streak. */
export function guardianPlacement(origin: ArenaPoint, target: ArenaPoint | null, options: {
  movement: Pick<ReturnType<typeof createVerticalMovement>, 'supportHeight' | 'canOccupy'>;
  wallDistance: (from: ArenaPoint, direction: ArenaPoint, range: number) => number;
  enemySpawns: readonly { x: number; z: number }[];
  protectedEnemies: readonly { x: number; z: number }[];
}): { at: ArenaPoint; reason: '' } | { at: null; reason: string } {
  if (!target || ![target.x, target.y, target.z].every(Number.isFinite) || Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z) > 8)
    return { at: null, reason: 'Look down at clear ground within 8m.' };
  const floor = options.movement.supportHeight(target.x, target.z, target.y + .3, .4, 1.2);
  if (floor === null || Math.abs(target.y - floor) > .35 || !options.movement.canOccupy(target.x, floor, target.z, .4, 1.2))
    return { at: null, reason: 'The Guardian needs a clear, supported spot.' };
  const at = { x: target.x, y: floor + .7, z: target.z };
  const length = Math.hypot(at.x - origin.x, at.y - origin.y, at.z - origin.z);
  // Smoke does not prevent physically setting down equipment.
  if (length > .1 && options.wallDistance(origin, { x: (at.x - origin.x) / length, y: (at.y - origin.y) / length, z: (at.z - origin.z) / length }, length) < length - .1)
    return { at: null, reason: 'An obstacle is between you and this spot.' };
  if (options.enemySpawns.some(p => Math.hypot(p.x - at.x, p.z - at.z) < 5) || options.protectedEnemies.some(p => Math.hypot(p.x - at.x, p.z - at.z) < 6))
    return { at: null, reason: 'Move farther from the enemy spawn protection.' };
  return { at, reason: '' };
}
