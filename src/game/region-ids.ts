/** Every playable district. Order drives the location picker and the expedition graph. */
export const REGION_IDS = ['marina-bay', 'raffles-place', 'queenstown', 'chinatown'] as const;
export type RegionId = (typeof REGION_IDS)[number];
export const isRegionId = (value: unknown): value is RegionId =>
  typeof value === 'string' && (REGION_IDS as readonly string[]).includes(value);
