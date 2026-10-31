import type { SquadFaction } from './arena-factions';
import type { Position2D } from './region-collision';
import type { NavalLandingSite } from './naval-landing-sites';

export const NAVAL = { interval: 150, externalGap: 80, retry: 10, seats: 4, approach: 15, rampSeconds: 2, hold: 10, exitSeconds: 12, humanClearance: 45 } as const;
export interface ReinforcementClocks { airborne?: Record<SquadFaction, number>; naval: Record<SquadFaction, number>; external: Record<SquadFaction, number> }
export function validReinforcementClocks(value: unknown): value is ReinforcementClocks {
  if (!value || typeof value !== 'object') return false;
  const c = value as ReinforcementClocks;
  const valid = (clock: unknown) => !!clock && typeof clock === 'object' && !Array.isArray(clock) && ['mercenaries', 'armed-forces'].every(f => {
    const n = (clock as Record<string, unknown>)[f]; return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 150;
  });
  return valid(c.naval) && valid(c.external) && (c.airborne === undefined || valid(c.airborne));
}
export function planNavalLanding(sites: readonly NavalLandingSite[], faction: SquadFaction, humans: readonly Position2D[], busy: ReadonlySet<string>, clearDry: (p: Position2D) => boolean, protectedPoints: readonly Position2D[] = []) {
  return sites.find(s => s.factions.includes(faction) && !busy.has(s.id) &&
    humans.every(p => Math.hypot(p.x - s.ramp.to.x, p.z - s.ramp.to.z) >= NAVAL.humanClearance) &&
    protectedPoints.every(p => Math.hypot(p.x - s.ramp.to.x, p.z - s.ramp.to.z) >= 25) &&
    Array.from({ length: 23 }, (_, i) => ({ x: s.ramp.to.x + (s.rally.x - s.ramp.to.x) * i / 22, z: s.ramp.to.z + (s.rally.z - s.ramp.to.z) * i / 22 })).every(clearDry));
}

/** Same sloping plane as the rendered bow ramp; never an arbitrary fallback spawn. */
export function navalRampPoint(site: NavalLandingSite, progress: number) {
  const k = Math.max(0, Math.min(1, progress)), { from, to } = site.ramp;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
}
