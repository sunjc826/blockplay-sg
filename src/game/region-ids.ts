/** Every playable district. Order drives the location picker and the expedition graph. */
export const REGION_IDS = ['marina-bay', 'raffles-place', 'queenstown', 'chinatown', 'kampong-glam', 'jurong-lake', 'changi', 'upper-thomson', 'punggol', 'harbourfront', 'sentosa', 'geylang', 'tuas', 'woodlands', 'tampines', 'toa-payoh', 'bukit-timah', 'orchard'] as const;
export type RegionId = (typeof REGION_IDS)[number];
export const isRegionId = (value: unknown): value is RegionId =>
  typeof value === 'string' && (REGION_IDS as readonly string[]).includes(value);
