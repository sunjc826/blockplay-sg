import type { RegionId } from './region-ids';
import { HEARTLAND_SHOPS, type NightInteriors } from './world-night-lights';

/**
 * What the upper floors of each district's buildings hold, for the rooms drawn behind windows
 * (`world-night-lights.ts`). `offices` is the share of buildings that are offices from the first floor up; the
 * rest are homes. `cbd` picks the business district's offices (open-plan floors and meeting rooms under panel
 * ceilings) over the plain kind (filing cabinets and stockrooms under tubes). Shopfronts are plain shops
 * unless `boutiques` makes them designed shop windows (`SHOP_LAYOUTS`) and `shops` says which: the
 * shopping belt's ten, four apiece on the heritage streets, and the kopitiam, provision shop, clinic, salon,
 * tuition centre and bakery under the flats of the housing towns.
 *
 * The three `cbd` districts are the ones on the `city` look. The shares are a reading of what each place is,
 * not a survey: towns are mostly homes, the airport, the port and the industrial estate mostly work.
 */
export const DISTRICT_INTERIORS: Record<RegionId, NightInteriors> = {
  'marina-bay': { offices: .9, cbd: true },
  'raffles-place': { offices: 1, cbd: true },
  orchard: { offices: .6, cbd: true, boutiques: 1 },
  tuas: { offices: .9, cbd: false },
  changi: { offices: .7, cbd: false },
  harbourfront: { offices: .6, cbd: false },
  'jurong-lake': { offices: .5, cbd: false },
  tampines: { offices: .35, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  chinatown: { offices: .25, cbd: false, boutiques: 1, shops: ['medicineHall', 'teaMerchant', 'driedGoods', 'jeweller'] },
  'kampong-glam': { offices: .25, cbd: false, boutiques: 1, shops: ['carpets', 'perfumery', 'textiles', 'cafe'] },
  'little-india': { offices: .2, cbd: false, boutiques: 1, shops: ['textiles', 'garlands', 'spices', 'jeweller'] },
  woodlands: { offices: .2, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  sentosa: { offices: .2, cbd: false },
  geylang: { offices: .15, cbd: false },
  'upper-thomson': { offices: .15, cbd: false },
  'toa-payoh': { offices: .15, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  bishan: { offices: .12, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  queenstown: { offices: .1, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  'katong-joo-chiat': { offices: .1, cbd: false, boutiques: 1, shops: ['kopitiam', 'kueh', 'tailor', 'florist'] },
  'bukit-timah': { offices: .1, cbd: false },
  punggol: { offices: .08, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  yishun: { offices: .08, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  'pulau-ubin': { offices: 0, cbd: false },
};
