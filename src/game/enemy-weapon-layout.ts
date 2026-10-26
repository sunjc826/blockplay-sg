/**
 * Shared authored coordinates for the enemy-issue platforms: the model, its
 * sight line, the eye position and the hands must agree. Local -Z is forward.
 *
 * Each platform has fixed configurations (a barrel length, a stock, a feed),
 * and a variant names one of them. The model carries every configuration's
 * parts and shows only the selected set; `muzzle` is where that set's flash
 * hider ends, so flare and tracers leave from the right place.
 */
import type { ScopeReticle } from './scope-reticles';

type Point = readonly [number, number, number];
/**
 * A sight you look through rather than over: `weapon-optics` seats its lens at
 * `lens` on the `height` line, `radius` wide, and puts the eye `aimDepth` from
 * the model origin. A `reflex` draws a collimated dot at any magnification the
 * spec asks for; a `scope` renders the magnified picture-in-picture, etched
 * with `reticle` (the G36's ZF pattern when none is named).
 */
export interface EnemyOptic { kind: 'reflex' | 'scope'; height: number; lens: number; radius: number; aimDepth: number; reticle?: ScopeReticle }
interface EnemyWeaponLayout {
  axisY: number; sightHeight: number; aimDepth: number;
  defaultConfig: string;
  configs: Readonly<Record<string, { muzzle: number; optic?: EnemyOptic }>>;
  /** Pistol grip, support hand and the magazine the support hand reaches for. */
  hands: { right: Point; support: Point; magazine: Point };
}
/** The XM8's integrated sighting module: a 1x red dot in a window on the carry handle. */
const ISM: EnemyOptic = { kind: 'reflex', height: .309, lens: -.088, radius: .025, aimDepth: -.24 };
/**
 * The sharpshooter trades the ISM for a 3.5x telescopic sight in rings on a
 * rail along the carry handle, its axis on the ISM's line so the hands and
 * the cheek weld stay where they were.
 */
const XM8_SCOPE: EnemyOptic = { kind: 'scope', height: .309, lens: .062, radius: .018, aimDepth: -.235, reticle: 'xm8-mil' };
/** The G36's carry handle is its optic: a 3x scope behind a rubber eyecup, with a 1x reflex on top. */
const DUAL_OPTIC: EnemyOptic = { kind: 'scope', height: .32, lens: .128, radius: .019, aimDepth: -.30 };
/** The G36C's short rail handle carries a tube red dot instead. */
const RAIL_DOT: EnemyOptic = { kind: 'reflex', height: .318, lens: -.047, radius: .021, aimDepth: -.22 };
export const ENEMY_WEAPON_LAYOUT = {
  'xm8-inspired': {
    axisY: .20, sightHeight: ISM.height, aimDepth: ISM.aimDepth, defaultConfig: 'carbine',
    configs: { carbine: { muzzle: -.525, optic: ISM }, compact: { muzzle: -.375, optic: ISM }, sharpshooter: { muzzle: -.655, optic: XM8_SCOPE }, automatic: { muzzle: -.645, optic: ISM } },
    hands: { right: [.027, .095, .075], support: [-.033, .128, -.235], magazine: [-.033, .04, -.06] },
  },
  'g36-inspired': {
    axisY: .20, sightHeight: DUAL_OPTIC.height, aimDepth: DUAL_OPTIC.aimDepth, defaultConfig: 'rifle',
    configs: { rifle: { muzzle: -.615, optic: DUAL_OPTIC }, k: { muzzle: -.515, optic: DUAL_OPTIC }, c: { muzzle: -.405, optic: RAIL_DOT }, mg: { muzzle: -.615, optic: DUAL_OPTIC } },
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
/** The sight a configuration aims through, if it has one; the MG4 has irons. */
export const enemyOptic = (id: string, config: unknown): EnemyOptic | undefined => {
  if (!isEnemyWeaponId(id)) return undefined;
  const configs = ENEMY_WEAPON_LAYOUT[id].configs as Readonly<Record<string, { optic?: EnemyOptic }>>;
  return configs[typeof config === 'string' && configs[config] ? config : ENEMY_WEAPON_LAYOUT[id].defaultConfig].optic;
};
