import type { RegionId } from './region-ids';
import type { AnimalKind } from './singapore-animals';

export interface AnimalSite {
  id: string; feature: string; habitat: 'urban' | 'wooded' | 'waterside' | 'water';
  kind: AnimalKind; points: readonly (readonly [number, number])[]; yaw: number;
}
/** Authored habitat pockets, not sightings or a uniform map-wide population.
 * Whole sites are omitted if any member or its animation envelope cannot fit. */
export const ANIMAL_SITES: Partial<Record<RegionId, readonly AnimalSite[]>> = {
  queenstown: [
    { id: 'estate-lawn-mynas', feature: 'ESTATE block west lawn, outside the void-deck approaches', habitat: 'urban', kind: 'javan-myna', points: [[-113,-52],[-111.8,-51],[-112.5,-53.2]], yaw: .7 },
    { id: 'commonwealth-garden-doves', feature: 'Commonwealth western garden quiet paved interior', habitat: 'urban', kind: 'zebra-dove', points: [[-202,-144],[-200.8,-143.5]], yaw: -1 },
    { id: 'home-cat', feature: 'HOME block sheltered rear margin, outside lobby and stairs', habitat: 'urban', kind: 'community-cat', points: [[-82,80]], yaw: 1.2 },
    { id: 'commonwealth-squirrel', feature: 'Commonwealth garden beneath the southern shade-tree group', habitat: 'wooded', kind: 'plantain-squirrel', points: [[-209,-162]], yaw: -.8 },
  ],
  bishan: [
    { id: 'park-lawn-doves', feature: 'Bishan river park northern lawn, below the walking path', habitat: 'urban', kind: 'zebra-dove', points: [[-97,-67],[-95.8,-67.5]], yaw: .5 },
    { id: 'riverbank-monitor', feature: 'Bishan naturalised river southern grass shelf', habitat: 'waterside', kind: 'water-monitor', points: [[-80,-39]], yaw: 1.57 },
    { id: 'river-family', feature: 'Bishan meander west pool, clear of footbridges and stepping stones', habitat: 'water', kind: 'smooth-coated-otter', points: [[-100,-57],[-102,-58.4],[-104,-56.5]], yaw: 0 },
  ],
  'upper-thomson': [
    { id: 'forest-squirrel', feature: 'Reservoir secondary-forest floor east of the boardwalk', habitat: 'wooded', kind: 'plantain-squirrel', points: [[-152,63]], yaw: 1.8 },
  ],
  'jurong-lake': [
    { id: 'lake-bank-monitor', feature: 'Jurong Lake northern grassy shore, outside the island crossing', habitat: 'waterside', kind: 'water-monitor', points: [[-185,-88]], yaw: 1.2 },
    { id: 'garden-mynas', feature: 'Jurong Lake northeast garden verge', habitat: 'urban', kind: 'javan-myna', points: [[-24,-105],[-22.6,-105.7],[-23.5,-107]], yaw: 2 },
  ],
};
