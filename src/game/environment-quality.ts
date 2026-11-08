/** Independent budgets for vegetation and weather; distance is in metres. */
export type WorldDetail = 'low' | 'high' | 'ultra';
export const worldDetail = (value: unknown, fallback: WorldDetail): WorldDetail => value === 'low' || value === 'high' || value === 'ultra' ? value : fallback;
export const RAIN_DETAIL = {
  low: { radius: 24, drops: 1200, nearDrops: 1200, height: 22 },
  high: { radius: 80, drops: 6000, nearDrops: 1800, height: 36 },
  ultra: { radius: 130, drops: 12000, nearDrops: 2400, height: 46 },
} as const;
export function grassDetail(detail: WorldDetail, reduced: boolean, mobile: boolean) {
  if (reduced) return { near: 11, radius: 11, spacing: 1.35, farSpacing: 2, limit: 384, farLimit: 0 };
  if (detail === 'low') return mobile
    ? { near: 16, radius: 16, spacing: 1.05, farSpacing: 2, limit: 1536, farLimit: 0 }
    : { near: 23, radius: 23, spacing: .8, farSpacing: 2, limit: 4096, farLimit: 0 };
  if (detail === 'high') return mobile
    ? { near: 20, radius: 42, spacing: .7, farSpacing: 1.5, limit: 5000, farLimit: 5000 }
    : { near: 28, radius: 60, spacing: .55, farSpacing: 1.25, limit: 12000, farLimit: 10000 };
  return mobile
    ? { near: 26, radius: 70, spacing: .6, farSpacing: 1.4, limit: 9000, farLimit: 12000 }
    : { near: 36, radius: 100, spacing: .45, farSpacing: 1.2, limit: 26000, farLimit: 26000 };
}
