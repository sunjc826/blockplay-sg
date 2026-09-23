/** Arcade visual dimensions, not a penetration or wound simulation. */
export interface ImpactProfile {
  /** Radius of the chipped decal in world units. Caliber controls this axis. */
  holeRadius: number;
  /** Apparent cavity depth in world units, expressed through normal strength. */
  holeDepth: number;
  smokeSize: number;
  smokeOpacity: number;
  smokeLifetime: number;
  sparkCount: number;
}
const bounded = (n: number, fallback: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(n) ? n : fallback));

/** Exaggerated enough to read in play; damage controls power independently of bore. */
export function impactProfile(caliberMm = 5.56, damage = 36): ImpactProfile {
  const bore = bounded(caliberMm, 5.56, 2, 25) / 5.56;
  const power = bounded(damage, 36, 9, 144) / 36;
  return {
    holeRadius: .041 * bore,
    holeDepth: .007 * Math.pow(power, 1.6),
    smokeSize: Math.pow(power, 1.1) * Math.sqrt(bore),
    smokeOpacity: Math.min(.85, .48 * Math.pow(power, .7)),
    smokeLifetime: .6 * Math.pow(power, .8),
    sparkCount: Math.round(7 * Math.sqrt(power)),
  };
}
export const DEFAULT_IMPACT_PROFILE = impactProfile();
/** Bound data-driven overrides before they reach fixed pools or shader attributes. */
export function sanitizeImpactProfile(profile: ImpactProfile): ImpactProfile {
  const base = DEFAULT_IMPACT_PROFILE;
  return {
    holeRadius: bounded(profile.holeRadius, base.holeRadius, .008, .2),
    holeDepth: bounded(profile.holeDepth, base.holeDepth, .001, .06),
    smokeSize: bounded(profile.smokeSize, base.smokeSize, .1, 4),
    smokeOpacity: bounded(profile.smokeOpacity, base.smokeOpacity, 0, .95),
    smokeLifetime: bounded(profile.smokeLifetime, base.smokeLifetime, .1, 2),
    sparkCount: Math.round(bounded(profile.sparkCount, base.sparkCount, 0, 16)),
  };
}
