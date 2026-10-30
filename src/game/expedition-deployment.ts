import { getWorldZone, type WorldZoneId, type ZoneSpawn } from './world-zones';
import { zoneSectors } from './zone-sectors';

export interface DeploymentPoint extends ZoneSpawn { id: string; name: string }
export interface DeploymentView {
  points: readonly DeploymentPoint[];
  choice: string;
  resolved: string | null;
  canChoose: boolean;
}

/** Stable named entries from authored map anchors; geometry is checked by the caller. */
export function districtDeploymentPoints(zone: WorldZoneId, clear: (x: number, z: number) => boolean, clearEntry = clear): DeploymentPoint[] {
  const district = getWorldZone(zone), points: DeploymentPoint[] = [];
  if (clearEntry(district.spawn.x, district.spawn.z)) points.push({ ...district.spawn, id: 'entry', name: 'District entry' });
  const candidates: DeploymentPoint[] = zoneSectors(zone).flatMap(sector => {
    const point = sector.anchors.find(p => clear(p.x, p.z));
    if (!point) return [];
    const center = { x: (sector.bounds.minX + sector.bounds.maxX) / 2, z: (sector.bounds.minZ + sector.bounds.maxZ) / 2 };
    return [{ ...point, id: `sector-${sector.id}`, name: sector.name, yaw: Math.atan2(point.x - center.x, point.z - center.z), pitch: 0 }];
  });
  candidates.push(...district.encounterSpawns.filter(p => clear(p.x, p.z)).map((p, i) => ({ ...p, id: `approach-${i}`, name: `Outer approach ${i + 1}`, yaw: district.spawn.yaw, pitch: 0 })));
  // Spread the shortlist across the map instead of taking six neighboring anchors.
  while (points.length < 6 && candidates.length) {
    const distance = (p: DeploymentPoint) => points.length ? Math.min(...points.map(q => Math.hypot(p.x - q.x, p.z - q.z))) : Math.hypot(p.x - district.spawn.x, p.z - district.spawn.z);
    candidates.sort((a, b) => distance(b) - distance(a));
    const next = candidates.shift()!;
    if (points.length && distance(next) < 28) continue;
    points.push(next);
  }
  return points;
}

/** Random is resolved once at deployment, with other approved points as fallbacks. */
export function deploymentOrder(points: readonly DeploymentPoint[], choice: string, random: () => number = Math.random): readonly DeploymentPoint[] {
  if (choice !== 'random') return points.filter(p => p.id === choice);
  if (!points.length) return [];
  const value = random(), index = Math.floor((Number.isFinite(value) ? Math.max(0, Math.min(.999999999, value)) : 0) * points.length);
  return [...points.slice(index), ...points.slice(0, index)];
}
