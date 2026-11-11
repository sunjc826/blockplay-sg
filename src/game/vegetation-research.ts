import type { VegetationKind } from './vegetation-props';
const snake={label:'NParks · Dracaena trifasciata (introduced)',url:'https://www.nparks.gov.sg/florafaunaweb/flora/2/4/2420'};
const money={label:'NParks · Epipremnum aureum (introduced)',url:'https://www.nparks.gov.sg/florafaunaweb/flora/1/3/1390'};
const nest={label:'NParks · Asplenium nidus (native)',url:'https://www.nparks.gov.sg/florafaunaweb/flora/1/5/1541'};
export const VEGETATION_RESEARCH:Record<VegetationKind,{label:string;url:string}>={
  'snake-pot':snake,'snake-trough':snake,'money-pot':money,'money-pole':money,'bird-nest-pot':nest,'bird-nest-fern':nest,
  'sword-fern':{label:'NParks · Native ferns',url:'https://www.nparks.gov.sg/publications-resources/articles/is-it-a-fern--double-con-fern!'},
  'rain-tree':{label:'NParks · Native or not?',url:'https://www.nparks.gov.sg/publications-resources/articles/native-or-not'},
  'sea-almond':{label:'NParks · Ketapang (native)',url:'https://biodiversitysg.nparks.gov.sg/our-biodiversity/flowering-plants/trees/ketapang-/'},
  'sea-apple':{label:'NParks · Syzygium grande (native)',url:'https://www.nparks.gov.sg/florafaunaweb/flora/3/1/3160'},
};
