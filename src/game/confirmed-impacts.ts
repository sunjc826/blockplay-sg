/** Host-confirmed wounds, independent of cosmetic avatar meshes and tracers. */
export interface ConfirmedImpact {
  id: number; time: number; victim: string;
  point: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  calibre: number; power: number;
}
export const MAX_CONFIRMED_IMPACTS = 64;
export const IMPACT_LIFETIME = 1;

/** Deduplicates repeated snapshots, expires history, and skips stale join data. */
export function takeConfirmedImpacts(events: readonly ConfirmedImpact[], seen: Set<number>, now: number) {
  const fresh = events.filter(event => !seen.has(event.id) && event.time <= now && now - event.time <= IMPACT_LIFETIME);
  const current = new Set(events.map(event => event.id));
  for (const id of seen) if (!current.has(id)) seen.delete(id);
  events.forEach(event => seen.add(event.id));
  return fresh;
}
