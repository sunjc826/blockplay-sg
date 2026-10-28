/**
 * What a meal does besides heal. Every effect comes from something actually
 * in the food: the kopi in a breakfast set, the Sichuan peppercorn in a mala
 * bowl, the broth dock coolies ate before a day of hauling cargo. A food's
 * tier is how much of a meal it is, so a snack carries one small, short
 * effect, a hawker plate two, a full ration three. Ultra and up are local
 * legend instead (Ah Ma's cooking, the smoking corner that somehow always
 * runs fastest) and carry the strongest version of what they give.
 *
 * Effects do not stack with themselves: eating something that gives one
 * already running keeps whichever is stronger and whichever lasts longer.
 */
export type FoodEffectKind = 'wired' | 'energised' | 'steady' | 'well-fed' | 'load-bearer' | 'numb' | 'fired-up' | 'ah-ma';
export interface FoodEffect {
  kind: FoodEffectKind;
  /**
   * `wired`: share faster reloads. `energised`: share faster on foot.
   * `steady`: share faster onto the sights and share less recoil.
   * `well-fed`: health per second. `load-bearer`: share of carried weight
   * not felt. `numb`: share of incoming damage not taken. `fired-up`: share
   * faster cycling and share more damage per round, both at once. `ah-ma`: the
   * health a lethal hit leaves instead, once.
   */
  strength: number;
  seconds: number;
}

export interface FoodEffectInfo { label: string; summary: (strength: number) => string }
const percent = (share: number) => `${Math.round(share * 100)}%`;
export const FOOD_EFFECTS: Readonly<Record<FoodEffectKind, FoodEffectInfo>> = {
  wired: { label: 'Wired', summary: s => `Reloads ${percent(s)} faster` },
  energised: { label: 'Energised', summary: s => `Moves ${percent(s)} faster` },
  steady: { label: 'Steady aim', summary: s => `Aims ${percent(s)} faster with ${percent(s)} less kick` },
  'well-fed': { label: 'Well fed', summary: s => `+${s} HP every second` },
  'load-bearer': { label: 'Load bearer', summary: s => `Feels ${percent(s)} of the load lighter` },
  numb: { label: 'Numb', summary: s => `Takes ${percent(s)} less damage` },
  'fired-up': { label: 'Fired up', summary: s => `Fires ${percent(s)} faster and hits ${percent(s)} harder` },
  'ah-ma': { label: "Ah Ma's watching", summary: s => `Once, a hit that would drop you leaves ${s} HP` },
};
/** Display order, which is also the order effects are listed on an item. */
export const FOOD_EFFECT_ORDER: readonly FoodEffectKind[] = ['well-fed', 'energised', 'steady', 'wired', 'load-bearer', 'numb', 'fired-up', 'ah-ma'];

/** One line per effect: "Well fed · +1 HP every second · 40 s". */
export const foodEffectLines = (effects: readonly FoodEffect[] = []) =>
  [...effects].sort((a, b) => FOOD_EFFECT_ORDER.indexOf(a.kind) - FOOD_EFFECT_ORDER.indexOf(b.kind))
    .map(effect => `${FOOD_EFFECTS[effect.kind].label} · ${FOOD_EFFECTS[effect.kind].summary(effect.strength)} · ${effect.seconds} s`);

export interface ActiveFoodEffect { strength: number; remaining: number; seconds: number }
export type ActiveFoodEffects = Partial<Record<FoodEffectKind, ActiveFoodEffect>>;

const finite = (value: number) => Number.isFinite(value) ? value : 0;

/** Starts a meal's effects, refreshing any already running without stacking them. */
export function applyFoodEffects(active: ActiveFoodEffects, effects: readonly FoodEffect[] = []) {
  for (const effect of effects) {
    const strength = Math.max(0, finite(effect.strength)), seconds = Math.max(0, finite(effect.seconds));
    if (!strength || !seconds) continue;
    const running = active[effect.kind];
    active[effect.kind] = running
      ? { strength: Math.max(running.strength, strength), remaining: Math.max(running.remaining, seconds), seconds: Math.max(running.remaining, seconds) }
      : { strength, remaining: seconds, seconds };
  }
  return active;
}

/**
 * Steps every timer. Returns the health `well-fed` restores over the step (only
 * while it lasts) and the effects that ran out on it.
 */
export function advanceFoodEffects(active: ActiveFoodEffects, dt: number) {
  const step = Math.max(0, finite(dt));
  let heal = 0;
  const expired: FoodEffectKind[] = [];
  for (const kind of Object.keys(active) as FoodEffectKind[]) {
    const effect = active[kind]!, spent = Math.min(step, effect.remaining);
    if (kind === 'well-fed') heal += effect.strength * spent;
    effect.remaining -= spent;
    if (effect.remaining <= 0) { delete active[kind]; expired.push(kind); }
  }
  return { heal, expired };
}

const strengthOf = (active: ActiveFoodEffects, kind: FoodEffectKind) => active[kind]?.strength ?? 0;
/** How fast a reload runs: 1 normally. */
export const reloadRate = (active: ActiveFoodEffects) => 1 + strengthOf(active, 'wired');
/** Applied on top of the load's own movement scale. */
export const footSpeedScale = (active: ActiveFoodEffects) => 1 + strengthOf(active, 'energised');
/** How fast the sights come up: 1 normally. */
export const aimSpeedScale = (active: ActiveFoodEffects) => 1 + strengthOf(active, 'steady');
/** Applied to each shot's kick. */
export const recoilScale = (active: ActiveFoodEffects) => 1 - Math.min(.6, strengthOf(active, 'steady'));
/** Share of carried weight that does not slow the eater (0..1). */
export const loadRelief = (active: ActiveFoodEffects) => Math.min(1, strengthOf(active, 'load-bearer'));
/** Damage that still lands, as a share. */
export const damageTakenScale = (active: ActiveFoodEffects) => 1 - Math.min(.9, strengthOf(active, 'numb'));
/** How fast the gun cycles between shots: 1 normally. */
export const cycleRate = (active: ActiveFoodEffects) => 1 + strengthOf(active, 'fired-up');
/** The eater's own rounds hit this much harder: 1 normally. */
export const damageDealtScale = (active: ActiveFoodEffects) => 1 + strengthOf(active, 'fired-up');

/**
 * What the arena simulation needs to know, since in an expedition it, not the
 * engine, cycles the gun, lands the rounds and takes the hits. Movement and
 * healing stay with the engine, which already reports both.
 */
export interface ArenaFoodModifiers { reloadRate: number; cycleRate: number; damage: number; damageTaken: number; ahMa: number }
export const arenaFoodModifiers = (active: ActiveFoodEffects): ArenaFoodModifiers => ({
  reloadRate: reloadRate(active), cycleRate: cycleRate(active), damage: damageDealtScale(active), damageTaken: damageTakenScale(active), ahMa: strengthOf(active, 'ah-ma'),
});
export const NO_FOOD: ArenaFoodModifiers = { reloadRate: 1, cycleRate: 1, damage: 1, damageTaken: 1, ahMa: 0 };

/**
 * The health after a hit, with Ah Ma's effect spent if the hit would have been
 * lethal. She steps in once per meal; eat again to have her watching again.
 */
export function survivesWithAhMa(active: ActiveFoodEffects, health: number) {
  const ahMa = active['ah-ma'];
  if (health > 0 || !ahMa) return { health, saved: false };
  delete active['ah-ma'];
  return { health: ahMa.strength, saved: true };
}

/** For the HUD: what is running, in display order, with whole seconds left. */
export interface FoodEffectView { kind: FoodEffectKind; label: string; summary: string; remaining: number; share: number }
export const foodEffectViews = (active: ActiveFoodEffects): FoodEffectView[] => FOOD_EFFECT_ORDER.flatMap(kind => {
  const effect = active[kind];
  return effect ? [{ kind, label: FOOD_EFFECTS[kind].label, summary: FOOD_EFFECTS[kind].summary(effect.strength),
    remaining: Math.ceil(effect.remaining), share: effect.seconds ? Math.max(0, Math.min(1, effect.remaining / effect.seconds)) : 0 }] : [];
});
