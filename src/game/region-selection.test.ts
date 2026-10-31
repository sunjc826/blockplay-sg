import { expect, it } from 'vitest';
import { hasRegionGame, regionModeLabel } from './region-selection';
import { locations } from '../data/locations';
import { REGION_IDS, REGIONS } from './regions';

it('lists exactly the developed worlds in the location picker', () => {
  expect(locations.map(location => location.id)).toEqual([...REGION_IDS]);
  expect(locations.every(location => hasRegionGame(location.id))).toBe(true);
  expect(locations[0].id).toBe('marina-bay');
});

it('offers real region maps only for implemented destinations', () => {
  for (const id of REGION_IDS) expect(hasRegionGame(id)).toBe(true);
  // Keep explicit examples of both an implemented island and a destination
  // without a scene, independently of the registry loop above.
  expect(hasRegionGame('pulau-ubin')).toBe(true);
  expect(hasRegionGame('lim-chu-kang')).toBe(false);
  expect(hasRegionGame('unknown')).toBe(false);
});

it('labels the region games distinctly', () => {
  expect(regionModeLabel('raffles-place').name).toBe('Raffles 3D');
  expect(regionModeLabel('queenstown').name).toBe('Queenstown 3D');
  expect(regionModeLabel('marina-bay').name).toBe('Marina 3D');
  expect(new Set(REGIONS.map(region => regionModeLabel(region.id).name)).size).toBe(REGIONS.length);
});
