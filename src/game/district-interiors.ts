import type { RegionId } from './region-ids';
import { HEARTLAND_SHOPS, type NightInteriors } from './world-night-lights';

/**
 * What the upper floors of each district's buildings hold, for the rooms drawn behind windows
 * (`world-night-lights.ts`). `offices` is the share of buildings that are offices from the first floor up; the
 * rest are homes. `cbd` picks the business district's offices (open-plan floors and meeting rooms under panel
 * ceilings) over the plain kind (filing cabinets and stockrooms under tubes). Shopfronts are plain shops
 * unless `boutiques` makes them designed shop windows (`SHOP_LAYOUTS`) and `shops` says which: the
 * shopping belt's ten, four apiece on the heritage streets, and the kopitiam, provision shop, clinic, salon,
 * tuition centre and bakery under the flats of the housing towns; fruit stalls and lighting shops in Geylang,
 * a plant nursery among Upper Thomson's cafes, souvenirs and surfboards on Sentosa and at HarbourFront, and
 * bicycle hire in Pulau Ubin's village.
 * `rooms` is the share of buildings that are hotels, factories or schools instead of either (`SPECIAL_LAYOUTS`):
 * hotels at the airport, the bay and the resort island, factories in the industrial estate, schools by the
 * lake and under the hill. A named building's wall can be marked instead (`userData.nightRooms`).
 *
 * The three `cbd` districts are the ones on the `city` look. The shares are a reading of what each place is,
 * not a survey: towns are mostly homes, the airport, the port and the industrial estate mostly work.
 */
export const DISTRICT_INTERIORS: Record<RegionId, NightInteriors> = {
  'marina-bay': { offices: .9, cbd: true, rooms: { hotel: .25 } },
  'raffles-place': { offices: 1, cbd: true },
  orchard: { offices: .6, cbd: true, boutiques: 1 },
  tuas: { offices: .9, cbd: false, rooms: { factory: .7 } },
  changi: { offices: .7, cbd: false, rooms: { hotel: .3 } },
  harbourfront: { offices: .6, cbd: false, boutiques: 1, shops: ['souvenirs', 'bags', 'cafe', 'electronics', 'sports'] },
  'jurong-lake': { offices: .5, cbd: false, rooms: { classroom: .3 } },
  tampines: { offices: .35, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  chinatown: { offices: .25, cbd: false, boutiques: 1, shops: ['medicineHall', 'teaMerchant', 'driedGoods', 'jeweller'] },
  'kampong-glam': { offices: .25, cbd: false, boutiques: 1, shops: ['carpets', 'perfumery', 'textiles', 'cafe'] },
  'little-india': { offices: .2, cbd: false, boutiques: 1, shops: ['textiles', 'garlands', 'spices', 'jeweller'] },
  woodlands: { offices: .2, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  sentosa: { offices: .2, cbd: false, rooms: { hotel: .7 }, boutiques: 1, shops: ['souvenirs', 'surfShop', 'cafe', 'toys'] },
  geylang: { offices: .15, cbd: false, boutiques: 1, shops: ['fruitStall', 'kopitiam', 'lighting', 'provisionShop'] },
  'upper-thomson': { offices: .15, cbd: false, boutiques: 1, shops: ['cafe', 'nursery', 'bakery', 'kopitiam'] },
  'toa-payoh': { offices: .15, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  bishan: { offices: .12, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  queenstown: { offices: .1, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  'katong-joo-chiat': { offices: .1, cbd: false, boutiques: 1, shops: ['kopitiam', 'kueh', 'tailor', 'florist'] },
  'bukit-timah': { offices: .1, cbd: false, rooms: { classroom: .3 } },
  punggol: { offices: .08, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  yishun: { offices: .08, cbd: false, boutiques: 1, shops: HEARTLAND_SHOPS },
  'pulau-ubin': { offices: 0, cbd: false, boutiques: 1, shops: ['bicycles', 'provisionShop', 'kopitiam'] },
  'botanic-gardens': { offices: 0, cbd: false },
};
