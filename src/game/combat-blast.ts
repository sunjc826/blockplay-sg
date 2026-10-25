import { splashScale } from './fps-rules';
import type { BlastSpec, CombatVector } from './combat-events';

/**
 * One resolver for everything that explodes: artillery shells and vehicle
 * wrecks alike. Pure: the caller says what stands where and whether a line
 * from the blast to it is clear, and applies the damage it hands back.
 */
export type BlastStance = 'stand' | 'crouch' | 'prone';
/** A body close to the ground presents less of itself to a blast. */
export const BLAST_STANCE: Readonly<Record<BlastStance, number>> = { stand: 1, crouch: .8, prone: .5 };
/** Share of an `overhead` blast (a bomb) that reaches a body with a roof over it. */
export const OVERHEAD_SHELTER = .2;
export interface BlastTarget<T> { item: T; point: CombatVector; vehicle?: boolean; stance?: BlastStance }
export interface BlastHit<T> { item: T; damage: number; distance: number }

export function blastDamage(blast: BlastSpec, distance: number, target: Pick<BlastTarget<unknown>, 'vehicle' | 'stance'>) {
  const share = splashScale(distance, blast.radius, blast.minScale);
  if (share <= 0) return 0;
  const body = target.vehicle ? blast.vehicleScale : blast.stance ? BLAST_STANCE[target.stance ?? 'stand'] : 1;
  return blast.damage * share * body;
}
/**
 * Damage for every target in reach whose line to `center` is clear, in the
 * order given, so a caller that lists hulls first chains wrecks before crews.
 */
export function resolveBlast<T>(center: CombatVector, blast: BlastSpec, targets: Iterable<BlastTarget<T>>, clear: (from: CombatVector, to: CombatVector, distance: number) => boolean): BlastHit<T>[] {
  const hits: BlastHit<T>[] = [];
  for (const target of targets) {
    const distance = Math.hypot(target.point.x - center.x, target.point.y - center.y, target.point.z - center.z);
    const damage = blastDamage(blast, distance, target);
    if (damage > 0 && clear(center, target.point, distance)) hits.push({ item: target.item, damage, distance });
  }
  return hits;
}
