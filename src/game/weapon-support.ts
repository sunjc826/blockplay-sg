/** Fixed variant hardware; multipliers are additional to the body's stance bonus. */
export type BipodKind = 'none' | 'quick' | 'standard' | 'heavy';
export const BIPOD_PROFILES = {
  none: { name: 'No bipod', deploy: 0, retract: 0, recoil: 1, thickness: 0, spread: 0 },
  quick: { name: 'Quick-deploy bipod', deploy: .30, retract: .20, recoil: .90, thickness: .8, spread: .27 },
  standard: { name: 'Standard bipod', deploy: .55, retract: .32, recoil: .80, thickness: 1, spread: .32 },
  heavy: { name: 'Heavy support bipod', deploy: .95, retract: .45, recoil: .65, thickness: 1.35, spread: .40 },
} as const;
export function bipodRecoilMultiplier(kind: BipodKind | undefined, deployment: number, prone: boolean, grounded: boolean, speed: number) {
  if (!prone || !grounded || !Number.isFinite(speed) || speed >= .15 || !Number.isFinite(deployment)) return 1;
  // The legs must spread and extend before they bear load. Bonus builds during
  // the final quarter of deployment and is lost immediately upon moving.
  const t = Math.max(0, Math.min(1, (deployment - .75) / .25));
  return 1 - (1 - BIPOD_PROFILES[kind ?? 'none'].recoil) * t * t * (3 - 2 * t);
}
export function bipodDescription(kind: BipodKind) {
  const profile = BIPOD_PROFILES[kind];
  return kind === 'none' ? 'No bipod: lighter mobile configuration; normal prone recoil, no support bonus.'
    : `${profile.name}: ${profile.deploy.toFixed(2)}s leg deployment, ${profile.retract.toFixed(2)}s folding. ${Math.round((1 - profile.recoil) * 100)}% less recoil on top of the prone bonus once supported. Setup follows lowering into prone; crawling or losing ground support removes the bonus.`;
}
