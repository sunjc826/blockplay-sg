import type { SquadFaction } from './arena-factions';
import type { FacilityState } from './facilities';

export type BattlefieldSize = 32 | 48 | 64;
export const DEFAULT_BATTLEFIELD_SIZE: BattlefieldSize = 32;
export const BATTLEFIELD_POPULATIONS: Record<BattlefieldSize, Record<SquadFaction, number>> = {
  32: { mercenaries: 20, 'armed-forces': 12 },
  48: { mercenaries: 28, 'armed-forces': 20 },
  64: { mercenaries: 40, 'armed-forces': 24 },
};
export interface BattlefieldSquad { id: string; faction: SquadFaction; x: number; z: number; previous?: string }

/** Allocate fronts together: distance, urgency and continuity, with a strong cost for piling on. */
export function assignBattlefieldFronts(squads: readonly BattlefieldSquad[], sites: readonly FacilityState[]) {
  const assignments = new Map<string, string>();
  for (const faction of ['mercenaries', 'armed-forces'] as const) {
    const groups = squads.filter(s => s.faction === faction).sort((a,b) => a.id.localeCompare(b.id));
    const loads = new Map<string, number>();
    const homes = sites.filter(s => s.kind === 'command' && s.owner === faction && s.health > 0);
    // Keep a rear guard once there are enough squads to run several fronts.
    const home = homes.find(s => s.initialOwner === faction) ?? homes[0];
    const guard = home && groups.length >= 3 ? groups.find(s=>s.previous===home.id) ?? [...groups].sort((a,b) => Math.hypot(a.x-home.x,a.z-home.z)-Math.hypot(b.x-home.x,b.z-home.z))[0] : undefined;
    if (guard && home) { assignments.set(guard.id, home.id); loads.set(home.id, 1); }
    for (const group of groups) {
      if (group === guard) continue;
      const score = (site: FacilityState) => {
        const urgency = site.contested && site.owner === faction ? 160 : site.owner === null ? 110 : site.owner !== faction ? 90 : site.health < site.maxHealth ? 70 : 0;
        const nearbyFront=[...loads].some(([id,count])=>count>0 && id!==site.id && sites.some(other=>other.id===id && Math.hypot(site.x-other.x,site.z-other.z)<65));
        return Math.hypot(site.x-group.x,site.z-group.z) * .35 - urgency + (loads.get(site.id) ?? 0) * 250 + (nearbyFront?100:0) - (site.id === group.previous ? 30 : 0);
      };
      const site = [...sites].sort((a,b) => score(a)-score(b) || a.id.localeCompare(b.id))[0];
      if (site) { assignments.set(group.id, site.id); loads.set(site.id, (loads.get(site.id) ?? 0)+1); }
    }
  }
  return assignments;
}
