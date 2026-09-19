import { getRegion } from './regions';
import { getWorldZone, type WorldZoneId, type ZoneSpawn } from './world-zones';
import type { ArenaEnvironment } from './arena-rules';

/** Build exactly one district. The caller disposes it before entering another. */
export function buildDistrictWorld(id: WorldZoneId, arrival?: ZoneSpawn) {
  const zone = getWorldZone(id), region = getRegion(id);
  const world = region.build();
  const { bounds, move } = region;
  const environment: ArenaEnvironment = { bounds, move, spawns: zone.encounterSpawns, endless: true, playerSpawn: arrival ?? zone.spawn };
  return { ...world, zone, bounds, move, environment };
}
