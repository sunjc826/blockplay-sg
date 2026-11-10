import type { WeaponState } from './fps-rules';
import { addReserveMagazines, availableMagazineSlots, magazineOf, restoreMagazine, type MagazineSpec, type RigMagazine } from './magazine-inventory';

export type ReserveCarrierKind = 'pack' | 'maid';
export interface ReserveCarrier { kind: ReserveCarrierKind; magazines: RigMagazine[] }
export const CARRIER_CAPACITY = { pack: 24, maid: 48 } as const;
export const CARRIER_NAME = { pack: "Encik’s 10-pack", maid: 'Maid' } as const;
export const TRANSFER_SECONDS = 1;
export const carrierSlotCost = (mag: RigMagazine) => mag.feed === 'belt' ? 3 : mag.feed === 'drum' ? 2 : 1;
export const carrierUsed = (carrier: ReserveCarrier) => carrier.magazines.reduce((sum, mag) => sum + carrierSlotCost(mag), 0);
type CarrierSpec = MagazineSpec & { reserveCarrier?: ReserveCarrierKind };
export const carrierKind = (specs: readonly CarrierSpec[]) => specs.find(s => s.reserveCarrier)?.reserveCarrier;
/** Unique feeds share stock. Four main containers for each sidearm container. */
export function startingCarrier(specs: readonly CarrierSpec[], carried: readonly number[]): ReserveCarrier | undefined {
  const kind = carrierKind(specs); if (!kind) return;
  const magazines: RigMagazine[] = [], seen = new Set<string>(), pattern: RigMagazine[] = [];
  for (const i of carried) {
    const mag = magazineOf(specs[i], i);
    if (seen.has(mag.group)) continue; seen.add(mag.group);
    for (let n = 0; n < (mag.caliberMm === 9 ? 1 : 4); n++) pattern.push(mag);
  }
  let room: number = CARRIER_CAPACITY[kind];
  while (pattern.some(mag => carrierSlotCost(mag) <= room)) {
    for (const mag of pattern) if (carrierSlotCost(mag) <= room) { magazines.push({ ...mag }); room -= carrierSlotCost(mag); }
  }
  return { kind, magazines };
}
/** Travel/loadout changes preserve finite stock, never generate fresh ammunition. */
export function restoreCarrier(kind: ReserveCarrierKind | undefined, value: unknown): ReserveCarrier | undefined {
  if (!kind) return;
  const carrier: ReserveCarrier = { kind, magazines: [] };
  if (!value || typeof value !== 'object') return carrier;
  const saved = value as ReserveCarrier;
  if (saved.kind !== kind || !Array.isArray(saved.magazines)) return carrier;
  let room: number = CARRIER_CAPACITY[kind];
  for (const raw of saved.magazines.slice(0, CARRIER_CAPACITY[kind])) {
    const mag = restoreMagazine(raw);
    if (!mag || carrierSlotCost(mag) > room) continue;
    carrier.magazines.push(mag); room -= carrierSlotCost(mag);
  }
  return carrier;
}
export function transferCandidate(state: WeaponState) {
  return state.magazineInventory?.carrier?.magazines.findIndex(mag => mag.group === state.magazineGroup && availableMagazineSlots(state, mag).length > 0) ?? -1;
}
/** Complete one transaction only after the hold duration; a held reload pouch is unavailable. */
export function transferMagazine(state: WeaponState) {
  const carrier = state.magazineInventory?.carrier, index = transferCandidate(state);
  if (!carrier || index < 0) return false;
  if (!addReserveMagazines(state, 1, carrier.magazines[index])) return false;
  carrier.magazines.splice(index, 1); return true;
}
export function refillCarrier(carrier: ReserveCarrier, specs: readonly CarrierSpec[], carried: readonly number[]) {
  const goal = startingCarrier(specs, carried); if (!goal || goal.kind !== carrier.kind) return 0;
  const remaining = new Map<string, number>();
  for (const mag of carrier.magazines) remaining.set(mag.group, (remaining.get(mag.group) ?? 0) + 1);
  let room = CARRIER_CAPACITY[carrier.kind] - carrierUsed(carrier), rounds = 0;
  for (const mag of goal.magazines) {
    const have = remaining.get(mag.group) ?? 0;
    if (have > 0) { remaining.set(mag.group, have - 1); continue; }
    if (carrierSlotCost(mag) > room) continue;
    carrier.magazines.push({ ...mag }); room -= carrierSlotCost(mag); rounds += mag.capacity;
  }
  return rounds;
}
/** Releasing or becoming ineligible loses only the unfinished magazine. */
export function stepCarrierTransfer(progress: number, dt: number, held: boolean, eligible: boolean, state: WeaponState) {
  if (!held || !eligible || transferCandidate(state) < 0) return { progress: 0, completed: 0 };
  let elapsed = progress + Math.max(0, Math.min(.1, dt)), completed = 0;
  if (elapsed + 1e-8 >= TRANSFER_SECONDS) {
    if (transferMagazine(state)) completed++;
    elapsed = 0;
  }
  return { progress: elapsed, completed };
}
