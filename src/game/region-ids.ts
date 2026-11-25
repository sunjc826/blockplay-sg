/** Every playable district. Order drives the location picker and the expedition graph. */
export const REGION_IDS = ['marina-bay', 'raffles-place', 'queenstown', 'chinatown', 'kampong-glam', 'jurong-lake', 'changi', 'upper-thomson', 'punggol', 'harbourfront', 'sentosa', 'geylang', 'tuas', 'woodlands', 'tampines', 'toa-payoh', 'bukit-timah', 'bishan', 'orchard', 'yishun', 'little-india', 'katong-joo-chiat', 'pulau-ubin', 'botanic-gardens'] as const;
export type RegionId = (typeof REGION_IDS)[number];
export const isRegionId = (value: unknown): value is RegionId =>
  typeof value === 'string' && (REGION_IDS as readonly string[]).includes(value);

export const REGION_NAMES: Record<RegionId,string> = {
  'botanic-gardens': 'Botanic Gardens',
  'pulau-ubin': 'Pulau Ubin',
  'katong-joo-chiat': 'Katong / Joo Chiat',
  'little-india': 'Little India',
  'yishun': 'Yishun',
  'marina-bay': 'Marina Bay',
  'raffles-place': 'Raffles Place',
  'queenstown': 'Queenstown',
  'chinatown': 'Chinatown',
  'kampong-glam': 'Kampong Glam',
  'jurong-lake': 'Jurong Lake',
  'changi': 'Changi',
  'upper-thomson': 'Upper Thomson',
  'punggol': 'Punggol',
  'harbourfront': 'HarbourFront',
  'sentosa': 'Sentosa',
  'geylang': 'Geylang',
  'tuas': 'Tuas',
  'woodlands': 'Woodlands',
  'tampines': 'Tampines',
  'toa-payoh': 'Toa Payoh',
  'bukit-timah': 'Bukit Timah',
  'bishan': 'Bishan',
  'orchard': 'Orchard Road',
};
