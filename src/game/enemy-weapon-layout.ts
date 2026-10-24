/**
 * Shared authored coordinates for the enemy-issue platforms: the model, its
 * sight line, the eye position and the hands must agree. Local -Z is forward.
 *
 * Each platform has fixed configurations (a barrel length, a stock, a feed),
 * and a variant names one of them. The model carries every configuration's
 * parts and shows only the selected set; `muzzle` is where that set's flash
 * hider ends, so flare and tracers leave from the right place.
 */
type Point = readonly [number, number, number];
interface EnemyWeaponLayout {
  axisY: number; sightHeight: number; aimDepth: number;
  defaultConfig: string;
  configs: Readonly<Record<string, { muzzle: number }>>;
  /** Pistol grip, support hand and the magazine the support hand reaches for. */
  hands: { right: Point; support: Point; magazine: Point };
}
export const ENEMY_WEAPON_LAYOUT = {
  'xm8-inspired': {
    axisY: .20, sightHeight: .305, aimDepth: -.28, defaultConfig: 'carbine',
    configs: { carbine: { muzzle: -.525 }, compact: { muzzle: -.375 }, sharpshooter: { muzzle: -.655 }, automatic: { muzzle: -.645 } },
    hands: { right: [.027, .095, .075], support: [-.033, .128, -.235], magazine: [-.033, .04, -.06] },
  },
  'g36-inspired': {
    axisY: .20, sightHeight: .318, aimDepth: -.30, defaultConfig: 'rifle',
    configs: { rifle: { muzzle: -.615 }, k: { muzzle: -.515 }, c: { muzzle: -.405 }, mg: { muzzle: -.615 } },
    hands: { right: [.027, .095, .09], support: [-.034, .128, -.255], magazine: [-.034, .04, -.075] },
  },
  'mg4-inspired': {
    axisY: .215, sightHeight: .312, aimDepth: -.40, defaultConfig: 'standard',
    configs: { standard: { muzzle: -.665 }, short: { muzzle: -.535 }, heavy: { muzzle: -.675 } },
    hands: { right: [.03, .09, .085], support: [-.038, .14, -.27], magazine: [-.085, .09, -.06] },
  },
} as const satisfies Record<string, EnemyWeaponLayout>;
export type EnemyWeaponId = keyof typeof ENEMY_WEAPON_LAYOUT;
export const isEnemyWeaponId = (id: string): id is EnemyWeaponId => id in ENEMY_WEAPON_LAYOUT;
