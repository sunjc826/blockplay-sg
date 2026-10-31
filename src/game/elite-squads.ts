import type { CombatPlane } from './combat-events';

export const ELITE_SQUAD = { warning: 10, minimumDistance: 45, spawnClearance: 30, cooldown: 600 } as const;
export const isEliteEvent = (kind: string) => kind === 'elite-sweep' || kind === 'command-hunt';
export const isEliteRole = (role: string) => ['elite-rifleman', 'elite-breacher', 'elite-gunner', 'elite-commander'].includes(role);
export const eliteRoster = (kind: string) => kind === 'command-hunt'
  ? ['elite-commander', 'elite-breacher', 'elite-rifleman', 'elite-gunner'] as const
  : ['elite-rifleman', 'elite-breacher', 'elite-rifleman', 'elite-gunner'] as const;

/** A dispersed four-person formation, rotated with the event heading. */
export function eliteSquadPoints(center: CombatPlane, heading: number): CombatPlane[] {
  const forward = { x: -Math.sin(heading), z: -Math.cos(heading) }, right = { x: Math.cos(heading), z: -Math.sin(heading) };
  return [[-3, -3], [3, -3], [-3, 3], [3, 3]].map(([side, along]) => ({
    x: center.x + right.x * side + forward.x * along,
    z: center.z + right.z * side + forward.z * along,
  }));
}
