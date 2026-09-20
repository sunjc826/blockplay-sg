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
  // Real places kept deliberately off the roadmap, so building a district
  // never quietly turns this assertion into a tautology again.
  expect(hasRegionGame('pulau-ubin')).toBe(false);
  expect(hasRegionGame('lim-chu-kang')).toBe(false);
  expect(hasRegionGame('unknown')).toBe(false);
});

it('labels the region games distinctly', () => {
  expect(regionModeLabel('raffles-place').name).toBe('Raffles 3D');
  expect(regionModeLabel('queenstown').name).toBe('Queenstown 3D');
  expect(regionModeLabel('marina-bay').name).toBe('Marina 3D');
  expect(new Set(REGIONS.map(region => regionModeLabel(region.id).name)).size).toBe(REGIONS.length);
});
