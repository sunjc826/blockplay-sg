import type { RegionBounds, Position2D } from './region-collision';
import type { SquadFaction } from './arena-factions';

/** Gameplay routes, independent of the ambient sea direction or water materials. */
export interface NavalLandingSite {
  id: string; name: string; factions: readonly SquadFaction[];
  water: RegionBounds; waterY: number;
  entry: Position2D; berth: Position2D;
  ramp: { from: Position2D & { y: number }; to: Position2D & { y: number }; width: number };
  rally: Position2D;
}
const beachLane = (x: number, side: string): NavalLandingSite => ({
  id: `sentosa-${side}`, name: `Southern beach ${side}`, factions: ['mercenaries', 'armed-forces'],
  water: { minX: -215, maxX: 215, minZ: 196, maxZ: 350 }, waterY: .14,
  entry: { x, z: 330 }, berth: { x, z: 202 },
  ramp: { from: { x, z: 198, y: .74 }, to: { x, z: 193, y: .33 }, width: 2.4 },
  rally: { x, z: 171 },
});
export const SENTOSA_LANDING_SITES: readonly NavalLandingSite[] = [beachLane(-155, 'west'), beachLane(155, 'east')];
export const districtNavalSites = (region: string): readonly NavalLandingSite[] => region === 'sentosa' ? SENTOSA_LANDING_SITES : [];

/** Entire straight hull lane must stay within authored open water. */
export function navalWaterRouteClear(site: NavalLandingSite, blocked: (x: number, z: number, radius: number) => boolean) {
  const { entry, berth, water } = site;
  for (let i = 0; i <= 80; i++) {
    const x = entry.x + (berth.x - entry.x) * i / 80, z = entry.z + (berth.z - entry.z) * i / 80;
    if (x - 1.8 < water.minX || x + 1.8 > water.maxX || z - 4.2 < water.minZ || z + 4.2 > water.maxZ || blocked(x, z, 1.8)) return false;
  }
  return true;
}
