/** Travel limits, separate from damage falloff. Shared by authority and visuals. */
const WEAPON_RANGES: Readonly<Record<string, number>> = {
  'sar21-inspired': 300,
  'ultimax-inspired': 300,
  'p30-inspired': 180,
  'mag-inspired': 400,
  'cis50-inspired': 400,
  'xm8-inspired': 300,
  'g36-inspired': 300,
  'mg4-inspired': 300,
};
export const MAX_WEAPON_RANGE = Math.max(...Object.values(WEAPON_RANGES));
/** Variants retain their platform id; unknown platforms use the rifle limit. */
export const weaponRange = (weapon?: { id: string }) => WEAPON_RANGES[weapon?.id ?? ''] ?? 300;
