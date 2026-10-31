import { districtParatroopers } from './paratroopers';
import { districtNavalSites } from './naval-landing-sites';
import { getRegion } from './regions';
import { getWorldZone, type WorldZoneId, type ZonePosition, type ZoneSpawn } from './world-zones';
import { zoneSectors } from './zone-sectors';
import type { ArenaEnvironment } from './arena-rules';
import { DISTRICT_HEAT } from './faction-heat';
import { DEFAULT_BATTLEFIELD_SIZE } from './battlefield';

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
  const navigationAnchors = [...patrolSpawns(id), ...region.mapRoads.flatMap(road => road.points.flatMap((p,i) => {
    const next=road.points[i+1]; if (!next) return [p];
    const steps=Math.ceil(Math.hypot(next.x-p.x,next.z-p.z)/20);
    return Array.from({length:steps},(_,j)=>({x:p.x+(next.x-p.x)*j/steps,z:p.z+(next.z-p.z)*j/steps}));
  }))];
  const environment: ArenaEnvironment = { bounds, move, spawns: patrolSpawns(id), endless: true, playerSpawn: arrival ?? zone.spawn,
    battlefield: { size: DEFAULT_BATTLEFIELD_SIZE }, navigationAnchors,
    // The open world is where events happen: random strikes paced by risk, and the dead return on transports.
    // The battlefield fixes the roster. Heat still drives transport pace, kit and event pressure.
    combatEvents: { risk: zone.risk }, reinforcements: true, navalSites: districtNavalSites(id), paratroopers: districtParatroopers(id),
    heat: { defaults: DISTRICT_HEAT[zone.risk], sectors: zoneSectors(id).map(s => ({ id: s.id, parent: s.parent, bounds: s.bounds, weight: s.botWeight ?? s.lootWeight, heat: s.heat })) } };
  return { ...world, zone, bounds, move, environment };
}
