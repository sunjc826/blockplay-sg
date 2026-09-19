import { getRegion, isRegionId, type RegionId } from './regions';

export type PlayableRegionId = RegionId;

export function hasRegionGame(locationId: string): locationId is PlayableRegionId {
  return isRegionId(locationId);
}

export function regionModeLabel(locationId: PlayableRegionId) {
  const region = getRegion(locationId);
  return { name: region.modeName, subtitle: region.modeSubtitle };
}
