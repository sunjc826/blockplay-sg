import { isRegionId, type RegionId } from './region-ids';

/** Connected authored districts. Coordinates are local game metres, not GPS. */
export type WorldZoneId = RegionId;
export interface ZonePosition { readonly x: number; readonly z: number }
/** Ground position and first-person orientation; eye height belongs to the engine. */
export interface ZoneSpawn extends ZonePosition { readonly yaw: number; readonly pitch: number }
export interface WorldZone {
  readonly id: WorldZoneId;
  readonly name: string;
  readonly description: string;
  readonly spawn: ZoneSpawn;
  readonly risk: 'low' | 'medium' | 'high';
  readonly lootTier: 1 | 2 | 3;
  readonly botCount: number;
  readonly composition: 'assault' | 'mixed';
  readonly encounterSpawns: readonly ZonePosition[];
}
export interface WorldGateway {
  readonly id: string;
  readonly from: WorldZoneId;
  readonly to: WorldZoneId;
  readonly name: string;
  readonly position: ZonePosition;
  readonly radius: number;
  readonly arrival: ZoneSpawn;
}
export interface WorldTransition {
  readonly gatewayId: string;
  readonly from: WorldZoneId;
  readonly to: WorldZoneId;
  readonly spawn: ZoneSpawn;
}

// Keep these defaults aligned with the authored scene spawns. Collision tests
// build the actual scenes so later geometry changes cannot silently block travel.
export const WORLD_ZONES: readonly WorldZone[] = [
  { id: 'marina-bay', name: 'Marina Bay', description: 'Waterfront approaches and garden roads.', spawn: { x: -44, z: 67, yaw: -0.82, pitch: 0 },
    risk: 'medium', lootTier: 2, botCount: 4, composition: 'mixed', encounterSpawns: [{ x: -70, z: 65 }, { x: -20, z: 65 }, { x: 25, z: 65 }, { x: -103, z: 10 }, { x: 103, z: 65 }, { x: 0, z: 94 }] },
  { id: 'raffles-place', name: 'Raffles Place', description: 'Contested CBD: heavy patrols guard the highest-tier supplies.', spawn: { x: 0, z: 52, yaw: 0, pitch: 0 },
    risk: 'high', lootTier: 3, botCount: 6, composition: 'mixed', encounterSpawns: [{ x: -75, z: 45 }, { x: 80, z: 45 }, { x: -170, z: 45 }, { x: 170, z: 45 }, { x: 0, z: -115 }, { x: 0, z: 135 }] },
  { id: 'queenstown', name: 'Queenstown', description: 'Residential courtyards, lighter patrols and starter supplies.', spawn: { x: -18, z: 83, yaw: -0.35, pitch: 0 },
    risk: 'low', lootTier: 1, botCount: 3, composition: 'assault', encounterSpawns: [{ x: -15, z: 116 }, { x: 140, z: 116 }, { x: -140, z: 116 }, { x: 140, z: 22 }, { x: -140, z: 22 }, { x: -15, z: 165 }] },
  { id: 'chinatown', name: 'Chinatown', description: 'Tight market lanes and temple forecourts; mid-tier supplies, close quarters.', spawn: { x: -55, z: 80, yaw: -Math.PI / 2, pitch: 0 },
    risk: 'medium', lootTier: 2, botCount: 4, composition: 'mixed', encounterSpawns: [{ x: 0, z: 80 }, { x: -15, z: -15 }, { x: -120, z: 14 }, { x: 95, z: 20 }, { x: -124, z: 78 }, { x: 134, z: 74 }] },
  { id: 'kampong-glam', name: 'Kampong Glam', description: 'Open mall and courtyards; long sightlines between the terraces.', spawn: { x: 10, z: -85, yaw: Math.PI, pitch: 0 },
    risk: 'low', lootTier: 1, botCount: 3, composition: 'assault', encounterSpawns: [{ x: 10, z: -14 }, { x: 10, z: -75 }, { x: -90, z: -75 }, { x: 110, z: -92 }, { x: -90, z: -20 }, { x: 110, z: 50 }] },
  { id: 'jurong-lake', name: 'Jurong Lake', description: 'Open shoreline and a single causeway; the island is a hard place to leave.', spawn: { x: -20, z: 20, yaw: Math.PI / 2, pitch: 0 },
    risk: 'medium', lootTier: 2, botCount: 4, composition: 'mixed', encounterSpawns: [{ x: -142, z: 50 }, { x: -70, z: 20 }, { x: -18, z: 60 }, { x: 65, z: -10 }, { x: 170, z: -20 }, { x: -60, z: -160 }] },
  { id: 'upper-thomson', name: 'Upper Thomson', description: 'A thin eating strip with the reservoir forest behind it; cover runs out at the causeway.', spawn: { x: -50, z: -12, yaw: Math.PI / 2, pitch: 0 },
    risk: 'low', lootTier: 1, botCount: 3, composition: 'assault', encounterSpawns: [{ x: -50, z: -14 }, { x: -92, z: -46 }, { x: 85, z: -14 }, { x: -190, z: 5 }, { x: -162, z: -64 }, { x: 192, z: 60 }] },
  { id: 'punggol', name: 'Punggol', description: 'Open water and long promenades; the crossings are few and every one is watched.', spawn: { x: 20, z: -58, yaw: 0, pitch: 0 },
    risk: 'medium', lootTier: 2, botCount: 4, composition: 'mixed', encounterSpawns: [{ x: 20, z: -60 }, { x: 20, z: -90 }, { x: 20, z: 36 }, { x: -100, z: 30 }, { x: 215, z: 75 }, { x: 139, z: -20 }] },
  { id: 'orchard', name: 'Orchard Road', description: 'Wide boulevard and mall forecourts; long sightlines beneath the rain trees.', spawn: { x: 30, z: 5, yaw: Math.PI / 2, pitch: 0 },
    risk: 'medium', lootTier: 2, botCount: 4, composition: 'mixed', encounterSpawns: [{ x: -8, z: 5 }, { x: -115, z: -18 }, { x: -24, z: 22 }, { x: 117, z: -20 }, { x: 205, z: 60 }, { x: -170, z: 5 }] },
  { id: 'changi', name: 'Changi', description: 'Long apron sightlines outside; tight terraces and walkways under the dome.', spawn: { x: 16, z: -11, yaw: 1.31, pitch: 0 },
    risk: 'high', lootTier: 3, botCount: 5, composition: 'mixed', encounterSpawns: [{ x: -55, z: 14 }, { x: 4, z: -30 }, { x: -75, z: -166 }, { x: 190, z: -20 }, { x: 60, z: 170 }, { x: 120, z: 30 }] },
];

// These connections compress travel between districts. They do not claim that
// their scene coordinate systems line up or represent a continuous street map.
// Arrivals face into the new district, twelve metres beyond its return gateway.
export const WORLD_GATEWAYS: readonly WorldGateway[] = [
  { id: 'marina-to-raffles', from: 'marina-bay', to: 'raffles-place', name: 'Raffles Place checkpoint', position: { x: -103, z: 94 }, radius: 4, arrival: { x: 246, z: 45, yaw: Math.PI / 2, pitch: 0 } },
  { id: 'raffles-to-marina', from: 'raffles-place', to: 'marina-bay', name: 'Marina Bay checkpoint', position: { x: 258, z: 45 }, radius: 4, arrival: { x: -91, z: 94, yaw: -Math.PI / 2, pitch: 0 } },
  { id: 'raffles-to-queenstown', from: 'raffles-place', to: 'queenstown', name: 'Queenstown checkpoint', position: { x: -258, z: 45 }, radius: 4, arrival: { x: 223, z: 22, yaw: Math.PI / 2, pitch: 0 } },
  { id: 'queenstown-to-raffles', from: 'queenstown', to: 'raffles-place', name: 'Raffles Place checkpoint', position: { x: 235, z: 22 }, radius: 4, arrival: { x: -246, z: 45, yaw: -Math.PI / 2, pitch: 0 } },
  { id: 'raffles-to-chinatown', from: 'raffles-place', to: 'chinatown', name: 'Chinatown checkpoint', position: { x: 0, z: 238 }, radius: 4, arrival: { x: 100, z: -168, yaw: Math.PI, pitch: 0 } },
  { id: 'chinatown-to-raffles', from: 'chinatown', to: 'raffles-place', name: 'Raffles Place checkpoint', position: { x: 100, z: -180 }, radius: 4, arrival: { x: 0, z: 226, yaw: 0, pitch: 0 } },
  { id: 'chinatown-to-kampong-glam', from: 'chinatown', to: 'kampong-glam', name: 'Kampong Glam checkpoint', position: { x: 0, z: 180 }, radius: 4, arrival: { x: 0, z: -163, yaw: Math.PI, pitch: 0 } },
  { id: 'kampong-glam-to-chinatown', from: 'kampong-glam', to: 'chinatown', name: 'Chinatown checkpoint', position: { x: 0, z: -175 }, radius: 4, arrival: { x: 0, z: 168, yaw: 0, pitch: 0 } },
  { id: 'queenstown-to-jurong-lake', from: 'queenstown', to: 'jurong-lake', name: 'Jurong Lake checkpoint', position: { x: -235, z: 22 }, radius: 4, arrival: { x: 233, z: 20, yaw: Math.PI / 2, pitch: 0 } },
  { id: 'jurong-lake-to-queenstown', from: 'jurong-lake', to: 'queenstown', name: 'Queenstown checkpoint', position: { x: 245, z: 20 }, radius: 4, arrival: { x: -223, z: 22, yaw: -Math.PI / 2, pitch: 0 } },
  { id: 'kampong-glam-to-changi', from: 'kampong-glam', to: 'changi', name: 'Changi checkpoint', position: { x: 0, z: 175 }, radius: 4, arrival: { x: -243, z: -30, yaw: -Math.PI / 2, pitch: 0 } },
  { id: 'chinatown-to-orchard', from: 'chinatown', to: 'orchard', name: 'Orchard checkpoint', position: { x: -100, z: -180 }, radius: 4, arrival: { x: -223, z: 5, yaw: -Math.PI / 2, pitch: 0 } },
  { id: 'orchard-to-chinatown', from: 'orchard', to: 'chinatown', name: 'Chinatown checkpoint', position: { x: -235, z: 5 }, radius: 4, arrival: { x: -100, z: -168, yaw: Math.PI, pitch: 0 } },
  { id: 'orchard-to-upper-thomson', from: 'orchard', to: 'upper-thomson', name: 'Upper Thomson checkpoint', position: { x: 235, z: 5 }, radius: 4, arrival: { x: -223, z: 5, yaw: -Math.PI / 2, pitch: 0 } },
  { id: 'upper-thomson-to-orchard', from: 'upper-thomson', to: 'orchard', name: 'Orchard checkpoint', position: { x: -235, z: 5 }, radius: 4, arrival: { x: 223, z: 5, yaw: Math.PI / 2, pitch: 0 } },
  { id: 'upper-thomson-to-punggol', from: 'upper-thomson', to: 'punggol', name: 'Punggol checkpoint', position: { x: 20, z: 195 }, radius: 4, arrival: { x: 20, z: -193, yaw: Math.PI, pitch: 0 } },
  { id: 'punggol-to-upper-thomson', from: 'punggol', to: 'upper-thomson', name: 'Upper Thomson checkpoint', position: { x: 20, z: -205 }, radius: 4, arrival: { x: 20, z: 183, yaw: 0, pitch: 0 } },
  { id: 'punggol-to-changi', from: 'punggol', to: 'changi', name: 'Changi checkpoint', position: { x: 245, z: 20 }, radius: 4, arrival: { x: 80, z: 198, yaw: 0, pitch: 0 } },
  { id: 'changi-to-punggol', from: 'changi', to: 'punggol', name: 'Punggol checkpoint', position: { x: 80, z: 210 }, radius: 4, arrival: { x: 233, z: 20, yaw: Math.PI / 2, pitch: 0 } },
  { id: 'changi-to-kampong-glam', from: 'changi', to: 'kampong-glam', name: 'Kampong Glam checkpoint', position: { x: -255, z: -30 }, radius: 4, arrival: { x: 0, z: 163, yaw: 0, pitch: 0 } },
];

export function isWorldZoneId(value: unknown): value is WorldZoneId {
  return isRegionId(value) && WORLD_ZONES.some(zone => zone.id === value);
}

export function getWorldZone(id: WorldZoneId): WorldZone {
  const zone = WORLD_ZONES.find(candidate => candidate.id === id);
  if (!zone) throw new Error(`Unknown world zone: ${String(id)}`);
  return zone;
}

/** Fewest checkpoint crossings, using gameplay links rather than GPS distance. */
export function findWorldRoute(from: WorldZoneId, to: WorldZoneId): readonly WorldGateway[] {
  const queue: { zone: WorldZoneId; route: WorldGateway[] }[] = [{ zone: from, route: [] }];
  const seen = new Set<WorldZoneId>([from]);
  for (const current of queue) {
    if (current.zone === to) return current.route;
    for (const gateway of WORLD_GATEWAYS.filter(item => item.from === current.zone)) {
      if (seen.has(gateway.to)) continue;
      seen.add(gateway.to);
      queue.push({ zone: gateway.to, route: [...current.route, gateway] });
    }
  }
  return [];
}

/** Proximity alone advertises a prompt; the caller must explicitly request travel. */
export function findWorldGateway(zone: WorldZoneId, position: ZonePosition): WorldGateway | null {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return WORLD_GATEWAYS.find(gateway => gateway.from === zone &&
    Math.hypot(position.x - gateway.position.x, position.z - gateway.position.z) <= gateway.radius) ?? null;
}

/** Pure validation, with no inventory, rewards, scene loading or network mutation. */
export function resolveWorldTransition(zone: WorldZoneId, gatewayId: string, position: ZonePosition): WorldTransition | null {
  const gateway = findWorldGateway(zone, position);
  if (!gateway || gateway.id !== gatewayId) return null;
  return { gatewayId: gateway.id, from: zone, to: gateway.to, spawn: { ...gateway.arrival } };
}
