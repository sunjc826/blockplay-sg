import type { WeatherId } from './world-events';

export interface MapBounds { minX: number; maxX: number; minZ: number; maxZ: number }

export const MINIMAP_CONTACT_RANGE = 60;
/** Visibility tuning: clear daylight is the baseline; darkness and weather compound. */
const CONTACT_WEATHER_SCALE: Record<WeatherId, number> = {
  sunny: 1, cloudy: .9, showers: .75, thunderstorm: .55, monsoon: .6, squall: .5, haze: .45,
};

/** `darkness` is the scene lighting's shift: 0 by day, 1 at night, blended at twilight. */
export function minimapContactRange(darkness: number, weather: WeatherId): number {
  const lightScale = 1 - .5 * Math.max(0, Math.min(1, darkness));
  return Math.round(MINIMAP_CONTACT_RANGE * lightScale * CONTACT_WEATHER_SCALE[weather]);
}

/** A local window follows the player, stopping at the district boundary. */
export function localMinimapBounds(bounds: MapBounds, player: { x: number; z: number }, span = 180): MapBounds {
  const width = Math.min(span, bounds.maxX - bounds.minX), depth = Math.min(span * 144 / 184, bounds.maxZ - bounds.minZ);
  const minX = Math.max(bounds.minX, Math.min(bounds.maxX - width, player.x - width / 2));
  const minZ = Math.max(bounds.minZ, Math.min(bounds.maxZ - depth, player.z - depth / 2));
  return { minX, maxX: minX + width, minZ, maxZ: minZ + depth };
}

/** Three.js yaw increases toward west; SVG rotation increases toward east. */
export function minimapHeading(yaw: number) { return -yaw * 180 / Math.PI; }

export interface MinimapMarker {
  id: string; x: number; z: number; label: string;
  /** `scent`: an opponent revealed by their inserts even without visual contact. */
  kind: 'target' | 'car' | 'helicopter' | 'loot' | 'npc' | 'checkpoint' | 'scent' | 'ally' | 'enemy';
  active?: boolean;
}

/** Uniform scale keeps roads/landmarks aligned when a region expands. */
export function minimapProjection(bounds: MapBounds, width = 200, height = 160, padding = 8) {
  const worldWidth = bounds.maxX - bounds.minX, worldDepth = bounds.maxZ - bounds.minZ;
  if (worldWidth <= 0 || worldDepth <= 0 || width <= padding * 2 || height <= padding * 2) throw new Error('Invalid minimap bounds.');
  const scale = Math.min((width - padding * 2) / worldWidth, (height - padding * 2) / worldDepth);
  const offsetX = (width - worldWidth * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - worldDepth * scale) / 2 - bounds.minZ * scale;
  return { scale, offsetX, offsetY, x: (x: number) => offsetX + x * scale, y: (z: number) => offsetY + z * scale, transform: `translate(${offsetX} ${offsetY}) scale(${scale})` };
}
