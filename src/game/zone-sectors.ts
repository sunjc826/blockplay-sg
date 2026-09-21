import type { SectorCover } from './cover-metrics';
import type { RegionBounds } from './region-collision';
import type { WorldZoneId, ZonePosition } from './world-zones';
import { REGION_SECTORS } from '../data/region-sectors';

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
/**
 * Every district carries sectors. The data lives in `src/data/region-sectors.ts`
 * beside the stamp lists, for the same reason: it is transcribed coordinates,
 * and keeping it out of here leaves this module the type and the lookups.
 */
export const ZONE_SECTORS: Partial<Record<WorldZoneId, readonly ZoneSector[]>> = REGION_SECTORS;

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
