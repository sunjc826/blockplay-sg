import type { Position2D } from './region-collision';

export const PARATROOPERS = { interval: 150, externalGap: 80, retry: 10, seats: 4, warning: 12, height: 60, descent: 12, spacing: 1 } as const;
/** Explicit inland eligibility; lakes and canals do not make a district coastal. */
export const PARATROOPER_DISTRICTS = ['raffles-place', 'queenstown', 'chinatown', 'kampong-glam', 'jurong-lake', 'upper-thomson', 'geylang', 'tampines', 'toa-payoh', 'bukit-timah', 'bishan', 'orchard'] as const;
export const districtParatroopers = (id: string) => (PARATROOPER_DISTRICTS as readonly string[]).includes(id);
export const dropPoints = (center: Position2D) => [-1, 1].flatMap(x => [-1, 1].map(z => ({ x: center.x + x * 3.5, z: center.z + z * 3.5 })));
/** Keep a full canopy column and a connected, flat route out of every touchdown. */
export function planParatroopers(candidates: readonly Position2D[], humans: readonly Position2D[], protectedPoints: readonly Position2D[], clear: (p: Position2D) => boolean) {
  return candidates.find(center => humans.every(p => Math.hypot(p.x - center.x, p.z - center.z) >= 50) &&
    protectedPoints.every(p => Math.hypot(p.x - center.x, p.z - center.z) >= 30) &&
    dropPoints(center).every(p => Array.from({ length: 8 }, (_, i) => ({ x: p.x + (center.x - p.x) * i / 7, z: p.z + (center.z - p.z) * i / 7 })).every(clear)));
}
