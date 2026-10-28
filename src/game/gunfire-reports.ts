import type { ArenaActor, ArenaPoint } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';
import type { MuzzleDevice } from './weapon-accessories';

/** One shot to be heard: where from and how far off, the gun's bore and punch, and how long after now it was fired. */
export interface GunfireReport { from: ArenaPoint; distance: number; calibre: number; power: number; after: number; muzzle?: MuzzleDevice }
/** Reports heard in one snapshot, nearest first, so a firefight stays legible rather than a wall of noise. */
export const MAX_REPORTS_PER_SNAPSHOT = 6;
/** Shots one figure makes heard per snapshot, however many the host counted. */
export const MAX_REPORTS_PER_ACTOR = 3;

/**
 * Turns the host's per-figure shot counters into reports to play, so every gun
 * on foot is heard, instant ones included, not only those whose rounds fly.
 * `last` keeps each figure's count between snapshots: one first seen, or whose
 * count went back (a new match), sets a baseline rather than firing. Our own
 * shots are already heard; mounted guns sound through the vehicle, while
 * passengers sound through their equipped firearms.
 */
export function gunfireReports(actors: readonly Pick<ArenaActor, 'id' | 'x' | 'y' | 'z' | 'shots' | 'weapon' | 'vehicle' | 'seat' | 'muzzle'>[], last: Map<string, number>, self: string, listener: ArenaPoint): GunfireReport[] {
  const reports: GunfireReport[] = [], present = new Set<string>();
  for (const actor of actors) {
    present.add(actor.id);
    const before = last.get(actor.id); last.set(actor.id, actor.shots);
    if (before === undefined || actor.id === self || actor.vehicle && (actor.seat ?? 0) < 2) continue;
    const fired = Math.min(MAX_REPORTS_PER_ACTOR, actor.shots - before);
    if (fired <= 0) continue;
    // Shots counted together were fired a cycle apart, so a burst is heard as one.
    const spec = FPS_WEAPONS[actor.weapon], distance = Math.hypot(actor.x - listener.x, actor.y - listener.y, actor.z - listener.z);
    for (let i = 0; i < fired; i++) reports.push({ from: { x: actor.x, y: actor.y, z: actor.z }, distance, calibre: spec?.caliberMm ?? 5.56, power: spec?.damage ?? 36, after: i * (spec?.interval ?? .12), ...(actor.muzzle ? { muzzle: actor.muzzle } : {}) });
  }
  for (const id of last.keys()) if (!present.has(id)) last.delete(id);
  return reports.sort((a, b) => a.distance - b.distance).slice(0, MAX_REPORTS_PER_SNAPSHOT);
}
