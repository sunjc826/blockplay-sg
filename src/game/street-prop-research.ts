import type { StreetPropKind } from './street-props';
/** Evidence for object types and use; game positions and dimensions are authored. */
export const STREET_PROP_RESEARCH: Partial<Record<StreetPropKind,{label:string;url:string}>> = {
  'recycling-station': {label:'NEA · Blue recycling bins',url:'https://www.nea.gov.sg/our-services/waste-management/3r-programmes-and-resources/national-recycling-programme'},
  'tray-return': {label:'NEA · Hawker-centre tray returns',url:'https://www.nea.gov.sg/media/news/advisories/index/cleaner-tables-in-hawker-centres-and-coffeeshops'},
  'hawker-table': {label:'CNA · Dining furniture and tray returns',url:'https://www.channelnewsasia.com/commentary/tray-return-public-hygiene-campaign-nea-table-cleaner-job-fine-196291'},
  'chess-table': {label:'NHB · Singapore’s void decks',url:'https://www.roots.gov.sg/~/media/Roots/Images/resources/e-books/nhb_ebook_void_decks.pdf'},
  letterboxes: {label:'IMDA · Communal letterboxes',url:'https://www.imda.gov.sg/regulations-and-licensing-listing/postal/letter-box-specifications-and-guidelines'},
  'park-bin': {label:'NParks · Landscape furniture guidance',url:'https://www.nparks.gov.sg/services/development-plan-submission/before-submit-development-plan'},
};
