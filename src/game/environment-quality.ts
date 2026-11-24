/** Independent budgets for vegetation and weather; distance is in metres. */
export type WorldDetail = 'low' | 'high' | 'ultra';
export const worldDetail = (value: unknown, fallback: WorldDetail): WorldDetail => value === 'low' || value === 'high' || value === 'ultra' ? value : fallback;
export const RAIN_DETAIL = {
  low: { radius: 24, drops: 1200, height: 22, spray: 0 },
  high: { radius: 80, drops: 6000, height: 36, spray: 240 },
  ultra: { radius: 130, drops: 12000, height: 46, spray: 440 },
} as const;
/** The sward of short blades round the viewer: a clump every `spacing` out to `inner`, then fewer and wider
 * clumps until none are left at `radius`. Null where the budget has no room for it. */
export function swardDetail(detail: WorldDetail, reduced: boolean, mobile: boolean) {
  if (reduced || detail === 'low') return null;
  if (detail === 'high') return mobile ? { radius: 14, inner: 5, spacing: .28 } : { radius: 22, inner: 7, spacing: .22 };
  return mobile ? { radius: 18, inner: 6, spacing: .24 } : { radius: 30, inner: 9, spacing: .19 };
}
/** The share of the sward's clumps still standing at `distance`: all of them to `inner`, none by `radius`,
 * falling away fast at first so the far, thin part costs little. The grass shader computes the same. */
export const swardDensity = (distance: number, inner: number, radius: number) => { const t = Math.min(1, Math.max(0, (distance - inner) / (radius - inner))); return (1 - t) * (1 - t); };
/** How far short of a grass layer's reach its tufts begin to shrink: a long band on the outermost layer, so the
 * far grass dwindles away instead of ending at a line, and a short one where a nearer layer hands over to the next. */
export const grassFadeBand = (reach: number, outermost: boolean) => outermost ? Math.max(6, reach * .4) : 6;
export function grassDetail(detail: WorldDetail, reduced: boolean, mobile: boolean) {
  if (reduced) return { near: 11, radius: 11, spacing: 1.35, farSpacing: 2, limit: 384, farLimit: 0 };
  if (detail === 'low') return mobile
    ? { near: 16, radius: 16, spacing: 1.05, farSpacing: 2, limit: 1536, farLimit: 0 }
    : { near: 23, radius: 23, spacing: .8, farSpacing: 2, limit: 4096, farLimit: 0 };
  if (detail === 'high') return mobile
    ? { near: 20, radius: 55, spacing: .7, farSpacing: 1.7, limit: 5000, farLimit: 5000 }
    : { near: 28, radius: 85, spacing: .55, farSpacing: 1.4, limit: 12000, farLimit: 14000 };
  return mobile
    ? { near: 26, radius: 85, spacing: .6, farSpacing: 1.6, limit: 9000, farLimit: 12000 }
    : { near: 36, radius: 120, spacing: .45, farSpacing: 1.35, limit: 26000, farLimit: 26000 };
}
