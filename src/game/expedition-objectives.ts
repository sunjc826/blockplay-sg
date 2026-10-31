import { PLAYER_FACTION } from './arena-factions';
import type { FacilityState } from './facilities';
import type { ZoneSector } from './zone-sectors';

export type SectorControl = 'ally' | 'enemy' | 'contested' | 'neutral';
export const CONTROL_LABEL: Record<SectorControl, string> = { ally: 'Allied control', enemy: 'Enemy control', contested: 'Contested', neutral: 'Unclaimed' };
export const CONTROL_COLOR: Record<SectorControl, string> = { ally: '#70cfff', enemy: '#ff8870', contested: '#efd077', neutral: '#a6b3a8' };

/** Ownership of surviving facilities, not heat or hidden troop positions. */
export function sectorFacilityControl(sector: ZoneSector, sites: readonly FacilityState[]): SectorControl {
  const { minX, maxX, minZ, maxZ } = sector.bounds;
  const local = sites.filter(s => s.health > 0 && s.owner && s.x >= minX && s.x <= maxX && s.z >= minZ && s.z <= maxZ);
  if (!local.length) return 'neutral';
  const ally = local.some(s => s.owner === PLAYER_FACTION), enemy = local.some(s => s.owner !== PLAYER_FACTION);
  if (ally && enemy || local.some(s => s.contested || s.suppressed || s.action && s.action.faction !== s.owner)) return 'contested';
  return ally ? 'ally' : 'enemy';
}

export function enemyObjectives(sites: readonly FacilityState[], player: { x: number; z: number }): FacilityState[] {
  return sites.filter(s => s.health > 0 && s.owner && s.owner !== PLAYER_FACTION)
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z) || a.id.localeCompare(b.id));
}

/** Intact neutral forward posts and depots are actionable capture objectives too. */
export function captureObjectives(sites: readonly FacilityState[], player: { x: number; z: number }): FacilityState[] {
  return sites.filter(s=>s.health>0 && s.owner!==PLAYER_FACTION)
    .sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z)||a.id.localeCompare(b.id));
}
