import { createLoadout, fullLoad, type AmmoSpec, type WeaponSpec, type WeaponState } from './fps-rules';

/** Loose ammunition capacity per calibre; rounds seated in guns are separate. */
export const MAX_RESERVE = 999;
type PoolSpec = AmmoSpec & Pick<WeaponSpec, 'caliberMm' | 'reserve'>;
export type AmmoPools = Record<string, number>;
interface ReservePool { rounds: number }
const poolsByState = new WeakMap<WeaponState, ReservePool>();
export const ammoCalibre = (mm: number) => mm.toFixed(2);
/** Identity for counting a shared reserve's carry weight just once. */
export const reservePoolOf = (state: WeaponState) => poolsByState.get(state);
const rounds = (value: number | undefined, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, Math.min(MAX_RESERVE, Math.floor(value!))) : fallback;

export function startingAmmoPools(specs: readonly PoolSpec[], carried: readonly number[]): AmmoPools {
  const result: AmmoPools = {};
  for (const index of carried) {
    const key = ammoCalibre(specs[index].caliberMm);
    result[key] = Math.min(MAX_RESERVE, (result[key] ?? 0) + specs[index].reserve);
  }
  return result;
}

/** Top-ups cannot discard rounds returned by a removed magazine above the cap. */
export function addReserveRounds(state: WeaponState, amount: number) {
  const added = Math.max(0, Math.min(amount, MAX_RESERVE - state.reserve));
  state.reserve += added;
  return added;
}

/** Snapshot each carried calibre once, including an empty pool. */
export function ammoPools(states: readonly WeaponState[], specs: readonly PoolSpec[], carried: readonly number[]): AmmoPools {
  const result: AmmoPools = {};
  for (const index of carried) {
    const key = ammoCalibre(specs[index].caliberMm);
    if (!Object.hasOwn(result, key)) result[key] = states[index].reserve;
  }
  return result;
}

/** Keep the weapon rules' numeric reserve API backed by one pool per calibre.
 * Accessors are enumerable so checkpoints remain plain serializable numbers.
 * Do not cap writes here: removing a magazine must return every round, even
 * when a pickup has already filled the loose-ammo pool to its limit.
 */
function linkReserves(states: WeaponState[], specs: readonly PoolSpec[], carried: readonly number[], reserves: AmmoPools) {
  const pools = new Map<string, ReservePool>();
  for (const state of states) {
    Object.defineProperty(state, 'reserve', { value: 0, writable: true, enumerable: true, configurable: true });
    poolsByState.delete(state);
  }
  for (const index of carried) {
    const key = ammoCalibre(specs[index].caliberMm);
    let pool = pools.get(key);
    if (!pool) { pool = { rounds: reserves[key] ?? 0 }; pools.set(key, pool); }
    const shared = pool, state = states[index];
    Object.defineProperty(state, 'reserve', { enumerable: true, configurable: true,
      get: () => shared.rounds, set: (value: number) => { shared.rounds = value; } });
    poolsByState.set(state, shared);
  }
  return states;
}

/** Starting reserves from carried guns are combined; stored guns add nothing.
 * New checkpoints save pools explicitly. Older per-weapon checkpoints merge
 * their separate reserves once when first restored.
 */
export function createPooledLoadout(specs: readonly PoolSpec[], carried: readonly number[], checkpoint?: {
  ammunition: readonly WeaponState[]; ammoPools?: AmmoPools;
}): WeaponState[] {
  const states = createLoadout(specs), reserves: AmmoPools = {};
  if (checkpoint) states.forEach((fresh, index) => {
    const saved = checkpoint.ammunition[index];
    if (!saved) return;
    states[index] = { ...saved, magazine: Math.min(fullLoad(specs[index]), rounds(saved.magazine, fresh.magazine)),
      reserve: rounds(saved.reserve, fresh.reserve), cooldown: 0, reloadRemaining: 0 };
  });
  for (const index of carried) {
    const key = ammoCalibre(specs[index].caliberMm);
    reserves[key] = Math.min(MAX_RESERVE, (reserves[key] ?? 0) + states[index].reserve);
  }
  if (checkpoint?.ammoPools) for (const key of Object.keys(reserves)) {
    // A removed magazine may temporarily put a pool over the pickup limit.
    const saved = checkpoint.ammoPools[key];
    if (Number.isFinite(saved)) reserves[key] = Math.max(0, Math.floor(saved));
  }
  return linkReserves(states, specs, carried, reserves);
}

/** A found gun brings only a loaded magazine. Keep reserves for every calibre
 * still carried, whether the matching gun is the replacement or another slot.
 */
export function replacePooledWeapon(states: WeaponState[], previous: readonly PoolSpec[], previousCarry: readonly number[],
  specs: readonly PoolSpec[], carried: readonly number[], family: number) {
  const reserves = ammoPools(states, previous, previousCarry);
  states[family] = createLoadout(specs)[family];
  return linkReserves(states, specs, carried, reserves);
}
