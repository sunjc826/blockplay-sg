import type { RegionId } from './region-ids';
import type { StreetPropSite, Furnishing } from './street-prop-sites';
import { QUEENSTOWN_HDB_BLOCKS } from './queenstown-housing-layout';

/** Authored microhabitats, not claims about plants at surveyed addresses.
 * No fill target. Failed sites stay empty; see SINGAPORE-VEGETATION.md. */
const site=(id:string,feature:string,furnishing:Furnishing,x:number,z:number,groundOffset=.025):StreetPropSite=>({id,feature,furnishing,from:[x,z],to:[x,z],spacing:1,yaw:0,groundOffset});
export const VEGETATION_SITES: Partial<Record<RegionId,readonly StreetPropSite[]>> = {
  queenstown: QUEENSTOWN_HDB_BLOCKS.flatMap(b=>[
    site(`${b.id}-home-plants`,`${b.label} sheltered void-deck outer bay: maintained semi-shade pots, away from lift doors`,'home-plants',b.x+5,b.z+4),
    site(`${b.id}-dry-trough`,`${b.label} bright exterior edge: drained concrete snake-plant trough`,'dry-trough',b.x-22,b.z+12),
  ]),
  'katong-joo-chiat':[
    site('red-house-coir','Red House sheltered side of food frontage: tended climbing money plant','climbing-pot',-211,43),
    site('pavilion-fern-bowls','Neighbourhood pavilion eave: tended moist fern bowl','fern-pot',-80,140),
  ],
  changi:[
    ...[-67,-43,-19,5].map((z,i)=>site(`jewel-fern-${i}`,'Jewel garden-edge containers: tended fern bowls in humid filtered light, clear of radial approaches','fern-pot',-77,z)),
    ...[-80,-30,20].map((z,i)=>site(`coastal-almond-${i}`,'Changi coastal sandy planting strip inland of the pedestrian rest strip: sunny, salt-exposed tree site','coastal-tree',221,z)),
  ],
  bishan:[
    site('park-umbrella-west','Bishan river-park west lawn: broad shade canopy set back from path and flood channel','shade-tree',-169,-59),
    site('park-umbrella-east','Bishan river-park east lawn: open-grown shade tree, with fern supported in branch fork','shade-tree',174,-53),
  ],
  'upper-thomson':[
    ...[[-151,35],[-151,92],[-136,126]].map(([x,z],i)=>site(`forest-fern-${i}`,'Reservoir forest trail planted shoulder: moist semi-shade under existing canopy, off the walking route','forest-ferns',x,z)),
  ],
  'pulau-ubin':[
    site('village-money-plant','Kampong provisions veranda outer edge: cultivated pot tended by the shop','climbing-pot',-77,123),
    site('visitor-sea-apple','Visitor cottage coastal woodland margin: native evergreen tree, outside boardwalk access','native-tree',235,-5),
    site('visitor-fern-bed','Visitor cottage inland garden edge: moist native fern bed, outside tidal mangroves','forest-ferns',232,13),
  ],
};
