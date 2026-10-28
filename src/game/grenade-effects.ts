/** Short lived grenade conditions. Refreshes keep the strongest and longest. */
export const GRENADE_CONDITIONS = {
  dazed: 'Dazed', deafened: 'Deafened', retching: 'Retching', 'streaming-eyes': 'Streaming eyes', 'at-attention': 'At attention',
} as const;
export type GrenadeConditionKind = keyof typeof GRENADE_CONDITIONS;
export interface GrenadeCondition { kind: GrenadeConditionKind; strength: number; seconds: number }
export interface ActiveCondition { strength: number; remaining: number; seconds: number }
export type ActiveGrenadeConditions = Partial<Record<GrenadeConditionKind, ActiveCondition>>;
export function applyGrenadeConditions(active: ActiveGrenadeConditions, effects: readonly GrenadeCondition[], human = false) {
  for (const effect of effects) {
    if (!Number.isFinite(effect.strength) || !Number.isFinite(effect.seconds) || effect.strength <= 0 || effect.seconds <= 0) continue;
    const seconds = effect.seconds * (human && (effect.kind === 'dazed' || effect.kind === 'at-attention') ? .5 : 1), old = active[effect.kind];
    active[effect.kind] = { strength: Math.max(old?.strength ?? 0, effect.strength), remaining: Math.max(old?.remaining ?? 0, seconds), seconds: Math.max(old?.remaining ?? 0, seconds) };
  }
  return active;
}
export function advanceGrenadeConditions(active: ActiveGrenadeConditions, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (const kind of Object.keys(active) as GrenadeConditionKind[]) {
    const effect = active[kind]!; effect.remaining -= dt; if (effect.remaining <= 0) delete active[kind];
  }
}
export const arenaConditionModifiers = (active: ActiveGrenadeConditions = {}) => ({
  aim: active.dazed || active['at-attention'] ? 0 : 1 / (1 + (active['streaming-eyes']?.strength ?? 0)),
  recoil: 1 + (active['streaming-eyes']?.strength ?? 0), reload: 1 / (1 + (active.retching?.strength ?? 0)),
  frozen: !!active['at-attention'], deafened: !!active.deafened, dazed: !!active.dazed,
});
export const grenadeConditionViews = (active: ActiveGrenadeConditions) => (Object.keys(GRENADE_CONDITIONS) as GrenadeConditionKind[]).flatMap(kind => {
  const effect = active[kind]; return effect ? [{ kind, label: GRENADE_CONDITIONS[kind], remaining: Math.ceil(effect.remaining), share: Math.min(1, effect.remaining / effect.seconds) }] : [];
});
export type GrenadeConditionView = ReturnType<typeof grenadeConditionViews>[number];
export function validGrenadeConditions(value: unknown): value is ActiveGrenadeConditions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).length <= 5 && Object.entries(value).every(([kind, e]) => Object.prototype.hasOwnProperty.call(GRENADE_CONDITIONS, kind) && e && typeof e === 'object' &&
    [e.strength, e.remaining, e.seconds].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0) && e.strength <= 1 && e.remaining <= e.seconds && e.seconds <= 10);
}
