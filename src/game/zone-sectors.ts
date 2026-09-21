import type { SectorCover } from './cover-metrics';
import type { RegionBounds } from './region-collision';
import type { WorldZoneId, ZonePosition } from './world-zones';

export type { SectorCover };

/**
 * A named sub-area of one district. Districts are currently a single tactical
 * unit — `risk`, `lootTier` and `botCount` are per-district scalars and the six
 * `encounterSpawns` double as bot spawns and loot anchors — so a map has no
 * interior structure that any system can read. Sectors are that structure.
 *
 * Bounds are axis-aligned and need not partition the district: ground that
 * belongs to nowhere in particular is left unallocated, and sectors may overlap
 * where a place genuinely does, the way the meandering channels overlap their
 * own boxes. Coordinates are duplicated from the scene rather than imported
 * from it, for the same reason the zone spawns are: `world-zones.ts` and this
 * module stay free of three.js, and `zone-sectors.test.ts` builds the real
 * scene so a later geometry change cannot silently wall a sector off.
 */
export interface ZoneSector {
  readonly id: string;
  /** Shown to the player, so it is the name they would use for the place. */
  readonly name: string;
  readonly bounds: RegionBounds;
  readonly cover: SectorCover;
  /** Relative share of the district's crates. Weights need not sum to anything. */
  readonly lootWeight: number;
  /** Shifts the district tier for crates rolled here; 0 is the district baseline. */
  readonly tierBias?: -1 | 0 | 1;
  /** Relative share of the district's patrols. Defaults to the loot weight. */
  readonly botWeight?: number;
  /**
   * Curated positions inside the sector, clear at car width and reachable from
   * the district spawn. Loot and patrols draw from these before falling back to
   * the ring around the spawn, so a sector wants more of them than it has crates.
   */
  readonly anchors: readonly ZonePosition[];
}

/**
 * HarbourFront, as the pilot. Its zone description already names the shape of
 * the place — "open quay with the ridge above it; the wharf end has cover, the
 * water end has none" — and the stamp list already names its parts. Both are
 * transcribed here rather than invented: the quay and the boardwalk are the
 * exposed ground, the wharf and the ridge are the cover, and the reward is
 * biased toward whichever of those two you are willing to cross to.
 */
const HARBOURFRONT_SECTORS: readonly ZoneSector[] = [
  // The promenade strip you spawn on: twelve metres of paving between the
  // frontage and the basin wall, running most of the district's width. It is
  // the fastest way east or west and there is nothing on it to hide behind.
  { id: 'quay', name: 'HarbourFront quay', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1.5,
    bounds: { minX: -232, maxX: 146, minZ: 122, maxZ: 140 },
    anchors: [{ x: 20, z: 134 }, { x: -75, z: 134 }, { x: -200, z: 132 }, { x: -140, z: 132 }, { x: 75, z: 132 }, { x: 122, z: 132 }] },
  // The mall is one solid stepped mass, so its sector is the ring of ten- to
  // fourteen-metre lanes around it, plus the amphitheatre and the station
  // entrance at its quay corner. Central, so everyone passes through it.
  { id: 'vivocity', name: 'VivoCity terraces', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: 0, maxX: 124, minZ: -14, maxZ: 114 },
    anchors: [{ x: 60, z: -6 }, { x: 60, z: 108 }, { x: 117, z: 40 }, { x: 117, z: 86 }, { x: 117, z: -6 }] },
  // The cruise hall and its two boarding gangways, west of the quay street.
  // Same shape as VivoCity — a big mass with lanes round it — one street over.
  { id: 'cruise-centre', name: 'Cruise Centre', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -130, maxX: -20, minZ: -14, maxZ: 114 },
    anchors: [{ x: -75, z: -6 }, { x: -25, z: 50 }, { x: -75, z: 108 }, { x: -124, z: 50 }, { x: -25, z: -6 }] },
  // The furthest ground from the spawn, so it carries the reward — and since
  // the container rows were laid out properly it is also the only ground in the
  // district with cover worth the name: 4.5 m to the nearest hard edge, against
  // 8 m at the malls and nothing at all on the quay. That is what the zone
  // description always promised by "the wharf end has cover, the water end has
  // none", and it is now true rather than aspirational.
  { id: 'keppel-wharf', name: 'Keppel wharf', cover: 'dense', lootWeight: 3, tierBias: 1, botWeight: 2,
    bounds: { minX: 146, maxX: 218, minZ: 132, maxZ: 188 },
    anchors: [{ x: 180, z: 134 }, { x: 180, z: 160 }, { x: 155, z: 155 }, { x: 155, z: 175 }, { x: 180, z: 178 }] },
  // Eleven metres wide, fifty-six long, water on both sides and the Sentosa
  // checkpoint at the far end. A crate here is a dare rather than a supply.
  { id: 'boardwalk', name: 'Sentosa boardwalk', cover: 'dense', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: 100, maxX: 120, minZ: 132, maxZ: 196 },
    anchors: [{ x: 109, z: 165 }, { x: 109, z: 145 }, { x: 109, z: 180 }] },
  // Terraces stacked to a lookout. They are impassable, so the fighting is in
  // the lanes between their skirts and the perimeter: short sightlines, and the
  // one place in the district that is not overlooked by something else.
  { id: 'faber-ridge', name: 'Mount Faber ridge', cover: 'broken', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -226, maxX: -150, minZ: -146, maxZ: -30 },
    anchors: [{ x: -185, z: -140 }, { x: -152, z: -85 }, { x: -218, z: -85 }, { x: -185, z: -35 }] },
  // The green continuing north off the ridge, and the ground the Queenstown
  // checkpoint lands you on. Four tree trunks and nothing else wide enough to
  // hide behind, so arriving here means arriving in the open.
  { id: 'telok-blangah', name: 'Telok Blangah green', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 0.5,
    bounds: { minX: -226, maxX: -150, minZ: -25, maxZ: 110 },
    anchors: [{ x: -185, z: 50 }, { x: -185, z: -10 }, { x: -218, z: -20 }, { x: -185, z: 20 }, { x: -152, z: 50 }] },
  // Annexe, car-park deck and depot along the inland edge, with a gap at the
  // quay street between the first two. Furthest from the water, least reason to
  // be there, so the trek is worth a couple of crates.
  { id: 'harbour-depot', name: 'Harbour depot row', cover: 'broken', lootWeight: 2, botWeight: 1,
    bounds: { minX: -130, maxX: 218, minZ: -142, maxZ: -52 },
    anchors: [{ x: 180, z: -60 }, { x: 60, z: -60 }, { x: -75, z: -60 }, { x: 0, z: -70 }, { x: 130, z: -70 }, { x: -10, z: -105 }] },
  // Open lawn between the depot row and the wharf: the eastern approach, and
  // the ground the practice range is laid out on. Four trees and two benches.
  { id: 'gateway-lawn', name: 'Gateway lawn', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 146, maxX: 218, minZ: -10, maxZ: 110 },
    anchors: [{ x: 180, z: 50 }, { x: 180, z: 88 }, { x: 155, z: 20 }, { x: 205, z: 70 }] },
];

/**
 * Districts that have been sectored. Absent districts behave exactly as before,
 * so consumers read this through `zoneSectors` and fall back to their current
 * whole-district behaviour rather than branching on the id.
 */
export const ZONE_SECTORS: Partial<Record<WorldZoneId, readonly ZoneSector[]>> = {
  harbourfront: HARBOURFRONT_SECTORS,
};

export function zoneSectors(id: WorldZoneId): readonly ZoneSector[] {
  return ZONE_SECTORS[id] ?? [];
}

/** The sector containing a point, or null for ground that belongs to none. */
export function sectorAt(id: WorldZoneId, x: number, z: number): ZoneSector | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // Overlaps are deliberate but rare; the smaller sector is the more specific
  // description of where you are, so it wins.
  const area = (s: ZoneSector) => (s.bounds.maxX - s.bounds.minX) * (s.bounds.maxZ - s.bounds.minZ);
  return zoneSectors(id)
    .filter(s => x >= s.bounds.minX && x <= s.bounds.maxX && z >= s.bounds.minZ && z <= s.bounds.maxZ)
    .sort((a, b) => area(a) - area(b))[0] ?? null;
}
