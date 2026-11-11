import { VEGETATION_SITES } from './vegetation-sites';
import type { RegionId } from './region-ids';
import { MARINA_LAYOUT_SCALE } from './marina-layout';
import { QUEENSTOWN_HDB_BLOCKS } from './queenstown-housing-layout';

/** These are furnishing strips attached to existing authored places, not
 * surveyed Singapore coordinates. Read docs/SINGAPORE-PROP-RESEARCH.md for
 * typology evidence; each feature names the source geometry in its scene. */
export type Furnishing = 'home-plants' | 'dry-trough' | 'climbing-pot' | 'fern-pot' | 'fern-bed' | 'forest-ferns' | 'shade-tree' | 'coastal-tree' | 'native-tree' | 'hawker' | 'tray-return' | 'kopitiam' | 'outdoor-dining' | 'shopfront' | 'loading' | 'workshop' | 'rest' | 'picnic' | 'chess' | 'mail' | 'estate-collection' | 'cycle-parking';
export interface StreetPropSite {
  id: string; feature: string; furnishing: Furnishing;
  from: readonly [number,number]; to: readonly [number,number];
  spacing: number; yaw: number; groundOffset: number;
}
function strip(id:string,feature:string,furnishing:Furnishing,from:readonly [number,number],to:readonly [number,number],spacing=8,yaw=0,groundOffset=.025):StreetPropSite {
  return {id,feature,furnishing,from,to,spacing,yaw,groundOffset};
}
const point=(id:string,feature:string,furnishing:Furnishing,x:number,z:number,yaw=0,groundOffset=.025)=>strip(id,feature,furnishing,[x,z],[x,z],1,yaw,groundOffset);
const pi=Math.PI;
export const STREET_PROP_SITES: Record<RegionId,readonly StreetPropSite[]> = {
  'queenstown': [
    ...QUEENSTOWN_HDB_BLOCKS.flatMap(b=>[
      strip(`${b.id}-social`,`${b.label} sheltered void deck`,'chess',[b.x-18,b.z-1],[b.x-6,b.z-1],12),
      point(`${b.id}-mail`,`${b.label} lift-lobby side`,'mail',b.x+11,b.z-3),
      point(`${b.id}-collection`,`${b.label} exterior collection apron`,'estate-collection',b.x+18,b.z+12),
    ]),
    strip('shop-dining','Neighbourhood food-shop frontage','kopitiam',[47,1],[99,1],6),
    strip('tanglin-shops','Tanglin service row front apron','outdoor-dining',[-216,61],[-180,61],9),
    strip('commonwealth-garden','Commonwealth garden sheltered seating','picnic',[-207,-152],[-183,-152],12),
  ],
  'chinatown': [
    ...[-25,-11].map((z,i)=>strip(`complex-dining-${i}`,'Chinatown Complex covered dining floor','hawker',[-142,z],[-98,z],6,0)),
    point('complex-return-west','Complex dining aisle end','tray-return',-132,4,pi),
    point('complex-return-east','Complex dining aisle end','tray-return',-106,4,pi),
    strip('smith-dining','Smith Street food terrace edge','kopitiam',[-42,77],[18,77],8,0),
    strip('pagoda-front','Pagoda shopfront edge outside through lane','shopfront',[-44,-4],[16,-4],12,pi),
    strip('complex-deliveries','Trengganu rear service edge','loading',[-44,-127],[18,-127],14,pi),
  ],
  'raffles-place': [
    strip('quay-dining-west','Quay café frontage','outdoor-dining',[-143,-70],[-105,-70],9),
    strip('quay-dining-east','Quay café frontage','outdoor-dining',[-37,-70],[12,-70],9),
    strip('river-rest','Paved quay promenade facing river','rest',[-142,-130],[142,-130],23,0),
    strip('market-front','Lau Pa Sat-inspired market edge','kopitiam',[-38,219],[38,219],7,pi),
  ],
  'marina-bay': [
    ...[-185,-133,-81,67,119,171].map(x=>strip(`retail-${x}`,'Southern promenade retail frontage','outdoor-dining',[x-13,221],[x+13,221],9,pi)),
    strip('west-civic-rest','West civic pedestrian arcade','rest',[-255,-246],[-255,52],24,pi/2),
  ].map(s=>({...s,from:s.from.map(v=>v*MARINA_LAYOUT_SCALE) as [number,number],to:s.to.map(v=>v*MARINA_LAYOUT_SCALE) as [number,number]})),
  'little-india': [
    ...[-178,-162].map(x=>strip(`tekka-${x}`,'Tekka market interior dining bays','hawker',[x,73],[x,121],6,0)),
    point('tekka-return','Tekka dining aisle south end','tray-return',-170,128,pi),
    strip('arcade-pots','Textile and flower shopfront edge','shopfront',[48,-12],[108,-12],10),
    strip('serangoon-deliveries','Serangoon retail rear edge','loading',[-193,-158],[-149,-158],14,pi),
  ],
  'katong-joo-chiat': [
    strip('east-coast-eats','East Coast food-shop frontage','outdoor-dining',[62,140],[108,140],8),
    strip('red-house-dining','Red House food frontage','kopitiam',[-208,49],[-176,49],7),
    ...[-190,-45,85].map(x=>strip(`koon-seng-${x}`,'Koon Seng terrace front edge','shopfront',[x-25,-88],[x+25,-88],12)),
    strip('pavilion-rest','Neighbourhood pavilion courtyard edge','rest',[-77,132],[-21,132],20,pi),
  ],
  'kampong-glam': [
    strip('haji-dining','Haji Lane shop edge','kopitiam',[-120,-72],[-62,-72],9,0),
    strip('bussorah-west','Bussorah café frontage outside central palm walk','outdoor-dining',[-5,-108],[-5,-46],9,pi/2),
    strip('bussorah-east','Bussorah café frontage outside central palm walk','outdoor-dining',[25,-108],[25,-46],9,-pi/2),
    strip('textile-pots','Arab Street textile frontage','shopfront',[78,-99],[132,-99],11,pi),
  ],
  'tuas': [
    strip('workshop-apron','Workshop shutter-side staging strip; truck aisle left clear','workshop',[101,-173],[173,-173],18,pi),
    strip('container-service','Container yard perimeter service strip','loading',[85,-67],[183,-67],14,pi),
    point('terminus-cycles','Terminus access-side parking bay','cycle-parking',220,145),
  ],
  'harbourfront': [
    strip('quay-rest','Quay promenade facing harbour','rest',[-195,134],[90,134],25,pi),
    strip('mall-dining','VivoCity-inspired public frontage','outdoor-dining',[30,92],[76,92],9,pi),
    strip('terminal-service','Cruise terminal rear service edge','loading',[-112,-5],[-54,-5],18,pi),
  ],
  'sentosa': [
    strip('beach-club-tables','Beach club bar deck between existing lounger rows','outdoor-dining',[8,76],[52,76],8,0,.92),
    strip('beach-rest','Beach pedestrian edge','rest',[-152,112],[-46,112],26,pi),
    strip('resort-front','Resort retail frontage','shopfront',[2,-13],[58,-13],12),
  ],
  'pulau-ubin': [
    strip('village-kopi','Kopi and provisions shop veranda','kopitiam',[-63,127],[-43,127],6),
    strip('village-provisions','Village shop side delivery area','loading',[-77,105],[-77,117],12,pi/2),
    point('village-cycles','Village bicycle rental frontage','cycle-parking',48,128),
    point('visitor-rest','Visitor cottage front rest bay','rest',211,33,pi),
  ],
  'jurong-lake': [
    strip('lakeside-rest','Eastern shore boardwalk, seats facing lake','rest',[-25,-72],[-25,112],22,pi/2),
    strip('jem-front','JEM public forecourt edge','rest',[36,-105],[90,-105],22,0),
    strip('westgate-front','Westgate entrance-side cycle parking','cycle-parking',[36,104],[90,104],27),
  ],
  'punggol': [
    strip('north-waterway','North waterway promenade facing channel','rest',[-225,-119],[225,-119],24,pi),
    strip('south-waterway','South waterway promenade facing channel','rest',[-225,-61],[225,-61],24,0),
    point('precinct-cycles','Precinct entrance outside play court','cycle-parking',-127,45),
    point('precinct-collection','Residential exterior access apron','estate-collection',-142,104),
  ],
  'changi': [
    strip('coastal-rest','Coastal pedestrian strip facing sea','rest',[237,-101],[237,109],25,-pi/2),
    strip('arrival-garden','Arrival garden path edge','rest',[-232,-80],[-232,109],27,-pi/2),
    point('village-arrival','Changi Point landing waiting apron','rest',237,195,pi),
  ],
  'upper-thomson': [
    strip('coffee-return','Existing coffee shop dining edge','tray-return',[-110,-58],[-78,-58],32,pi),
    strip('shop-pots','Thomson shopfront edge','shopfront',[-89,-18],[-20,-18],12),
    strip('shop-deliveries','Thomson rear shop service edge','loading',[-89,-45],[-20,-45],23,pi),
    point('trail-cycles','Reservoir trail approach','cycle-parking',-168,8),
  ],
  'geylang': [
    strip('serai-dining','Geylang Serai central market dining strip','hawker',[-112,31],[-112,87],7,0),
    point('serai-return','Serai market end bay','tray-return',-112,95,pi),
    strip('kopitiam-front','Kopitiam outdoor frontage','outdoor-dining',[-12,54],[12,54],8),
    strip('quay-food','Quay food-stall frontage','kopitiam',[-93,-155],[91,-155],10),
  ],
  'woodlands': [
    strip('precinct-common','Eastern precinct courtyard rest edge','rest',[111,-9],[159,-9],16),
    strip('south-common','Southern precinct sheltered linkway edge','rest',[-202,84],[-158,84],22),
    point('precinct-collection','Eastern housing exterior collection point','estate-collection',169,17),
    strip('civic-front','Civic centre pedestrian frontage','rest',[-73,25],[-19,25],20),
  ],
  'tampines': [
    strip('market-west','Round Market west perimeter dining apron','hawker',[-112,-54],[-112,-26],7,0),
    strip('market-east','Round Market east perimeter dining apron','hawker',[-48,-54],[-48,-26],7,0),
    point('market-return','Round Market side return point','tray-return',-112,-18,pi/2),
    strip('west-precinct','Western precinct sheltered common area','chess',[-218,-44.5],[-218,-35.5],9),
    strip('south-precinct','South-west precinct sheltered common area','chess',[-218,70.5],[-218,79.5],9),
    point('precinct-collection','Western precinct outdoor collection edge','estate-collection',-222,75),
  ],
  'toa-payoh': [
    strip('north-void-deck','Older slab sheltered communal bays','chess',[18,-86],[78,-86],15),
    point('north-letterboxes','Older slab ground lobby side','mail',65,-89),
    strip('south-void-deck','Older slab sheltered communal bays','chess',[22,-18],[78,-18],14),
    point('slab-collection','Older slab outside collection apron','estate-collection',81,-74),
    strip('hawker-apron','Lorong hawker outer dining apron','kopitiam',[148,-75],[190,-75],7,0),
  ],
  'bukit-timah': [
    strip('market-apron','Market hall front apron','kopitiam',[-73,2],[-37,2],7),
    strip('rail-rest','Railway station visitor approach','rest',[109,58],[109,114],22,pi/2),
    strip('beauty-world-shops','Beauty World-inspired retail front edge','shopfront',[151,-10],[207,-10],12),
  ],
  'bishan': [
    strip('park-path','Naturalised river park path edge','rest',[-197,-79],[197,-79],26,pi),
    strip('housing-social','Open housing void-deck bays','chess',[-87,92],[-39,92],12),
    point('housing-mail','Open housing lobby edge','mail',-44,89),
    point('housing-collection','Housing exterior collection apron','estate-collection',-82,133),
  ],
  'orchard': [
    strip('north-retail','Northern retail promenade edge','rest',[-172,-22],[132,-22],26,0),
    strip('south-retail','Southern retail promenade edge','rest',[-167,24],[45,24],26,pi),
    strip('emerald-front','Emerald Hill-inspired terrace frontage','shopfront',[90,38],[140,38],11,pi),
    strip('emerald-dining','Southern shophouse café frontage','outdoor-dining',[90,112],[140,112],9),
  ],
  'yishun': [
    ...[-152,-138].map((z,i)=>strip(`chong-pang-${i}`,'Chong Pang market dining bays','hawker',[-213,z],[-173,z],6,0)),
    point('chong-pang-return','Chong Pang centre-aisle end','tray-return',-166,-145,pi/2),
    ...[[-194,-30],[-70,-25],[77,-145],[195,-145],[77,-25],[195,-25],[-194,95],[-70,95]].flatMap(([x,z],i)=>[
      strip(`housing-${i}`,`Housing ${600+i} sheltered bay`,'chess',[x-18,z],[x-6,z],12),
      point(`mail-${i}`,`Housing ${600+i} lobby side`,'mail',x+12,z-4),
      point(`collection-${i}`,`Housing ${600+i} exterior collection point`,'estate-collection',x+14,z+16),
    ]),
    strip('pond-rest','Yishun Pond north path edge','rest',[52,60],[108,60],20,pi),
  ],
};

for(const [id,sites] of Object.entries(VEGETATION_SITES))STREET_PROP_SITES[id as RegionId]=[...STREET_PROP_SITES[id as RegionId],...sites];
