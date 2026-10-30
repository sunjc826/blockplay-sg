/** Range targets are reusable slots; each appearance is a distinct activation. */
export const RANGE_DRILLS = {
  classic: { name: 'Classic', description: 'Clear every target once.' },
  continuous: { name: 'Continuous', description: 'Targets keep appearing. End the drill whenever you like.' },
  timed: { name: '90-second challenge', description: 'Clear as many targets as you can in 90 seconds.' },
} as const;
export type RangeDrillId = keyof typeof RANGE_DRILLS;
export const RANGE_DURATION = 90;
export const RANGE_RAISE_SECONDS = .45;
export type RangeTargetPhase = 'inactive' | 'appearing' | 'active' | 'retracting' | 'cooldown';
export interface RangeTargetSlot { phase: RangeTargetPhase; activation: number; since: number; readyAt: number }
export interface RangeDrillView { mode: RangeDrillId; active: number; spawned: number; goal: number | null; remaining: number | null; endedEarly: boolean }
export const validRangeDrill = (value: unknown): value is RangeDrillId => typeof value === 'string' && Object.hasOwn(RANGE_DRILLS, value);
export function rangeTargetRise(slot: RangeTargetSlot, now: number) {
  const t = Math.max(0, Math.min(1, (now - slot.since) / RANGE_RAISE_SECONDS)), eased = t * t * (3 - 2 * t);
  return slot.phase === 'active' ? 1 : slot.phase === 'appearing' ? eased : slot.phase === 'retracting' ? 1 - eased : 0;
}
export function rangeTargetHeight(slot: RangeTargetSlot, now: number) { return Math.max(0, 2.08 - (1 - rangeTargetRise(slot, now)) * 2.3); }
export function createRangeDirector(mode: RangeDrillId, count: number, seed: number) {
  if (!validRangeDrill(mode) || !Number.isInteger(count) || count < 1 || count > 64) throw new Error('Invalid range drill.');
  const slots: RangeTargetSlot[] = Array.from({ length: count }, () => ({ phase: 'inactive', activation: 0, since: 0, readyAt: 0 }));
  let randomState = seed >>> 0, serial = 0, clock = 0, finished = false;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  function activate(slot: RangeTargetSlot, now: number) { slot.phase = mode === 'classic' ? 'active' : 'appearing'; slot.activation = ++serial; slot.since = now; }
  function reset(nextSeed = seed) {
    randomState = nextSeed >>> 0; serial = clock = 0; finished = false;
    for (const slot of slots) Object.assign(slot, { phase: 'inactive', activation: 0, since: 0, readyAt: 0 });
    if (mode === 'classic') slots.forEach(slot => activate(slot, 0));
    else step(0);
  }
  function step(now: number, eligible: readonly number[] = slots.map((_, i) => i)) {
    if (finished || !Number.isFinite(now) || now < clock) return;
    clock = now;
    if (mode === 'classic' || mode === 'timed' && now >= RANGE_DURATION) return;
    for (const slot of slots) {
      if (slot.phase === 'appearing' && now - slot.since >= RANGE_RAISE_SECONDS) { slot.phase = 'active'; slot.since = now; }
      if (slot.phase === 'retracting' && now - slot.since >= RANGE_RAISE_SECONDS) { slot.phase = 'cooldown'; slot.since = now; }
    }
    const live = () => slots.filter(s => s.phase === 'appearing' || s.phase === 'active').length;
    while (live() < Math.min(3, count)) {
      const ready = slots.map((slot, i) => ({ slot, i })).filter(({ slot, i }) => eligible.includes(i) && (slot.phase === 'inactive' || slot.phase === 'cooldown' && now >= slot.readyAt));
      if (!ready.length) break;
      // Prefer anchors not used yet, then the least recently used ready group.
      const oldest = Math.min(...ready.map(({ slot }) => slot.activation)), fresh = ready.filter(({ slot }) => !oldest ? !slot.activation : slot.activation <= oldest + 2);
      activate(fresh[Math.floor(random() * fresh.length)].slot, now);
    }
  }
  function eliminate(index: number, activation: number, now: number) {
    const slot = slots[index];
    if (finished || !slot || slot.phase !== 'active' || slot.activation !== activation || !Number.isFinite(now) || now < clock || mode === 'timed' && now >= RANGE_DURATION) return false;
    slot.phase = mode === 'classic' ? 'inactive' : 'retracting'; slot.since = now; slot.readyAt = now + 2 + random() * 3;
    return true;
  }
  function view(now: number, endedEarly = false): RangeDrillView {
    return { mode, active: slots.filter(s => s.phase === 'active').length, spawned: serial, goal: mode === 'classic' ? count : null,
      remaining: mode === 'timed' ? Math.max(0, RANGE_DURATION - now) : null, endedEarly };
  }
  reset();
  return { slots, step, eliminate, reset, view, finish: () => { finished = true; }, get finished() { return finished; } };
}
