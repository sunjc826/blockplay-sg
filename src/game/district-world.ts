import { getRegion } from './regions';
import { getWorldZone, type WorldZoneId, type ZonePosition, type ZoneSpawn } from './world-zones';
import { zoneSectors } from './zone-sectors';
import type { ArenaEnvironment } from './arena-rules';

/**
 * Where patrols may appear. A district used to offer six points; a sectored one
 * offers those plus anchors from each named place. `createArena` picks whichever
 * point is furthest from the living, so a sector's `botWeight` does not make its
 * patrols likelier so much as give them more ground to appear on — which is what
 * stops every encounter happening in the same handful of spots.
 */
export function patrolSpawns(id: WorldZoneId): readonly ZonePosition[] {
  const zone = getWorldZone(id), sectors = zoneSectors(id);
  if (!sectors.length) return zone.encounterSpawns;
  const fromSectors = sectors.flatMap(sector =>
    sector.anchors.slice(0, Math.max(0, Math.round((sector.botWeight ?? sector.lootWeight) * 1.5))));
  return [...zone.encounterSpawns, ...fromSectors];
}

/** Build exactly one district. The caller disposes it before entering another. */
export function buildDistrictWorld(id: WorldZoneId, arrival?: ZoneSpawn) {
  const zone = getWorldZone(id), region = getRegion(id);
  const world = region.build();
  const { bounds, move } = region;
  const environment: ArenaEnvironment = { bounds, move, spawns: patrolSpawns(id), endless: true, playerSpawn: arrival ?? zone.spawn };
  return { ...world, zone, bounds, move, environment };
}
