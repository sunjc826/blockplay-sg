/** Host-owned visual identification. Partial glimpses never expose a live target. */
export interface SpottingPoint { x: number; y: number; z: number }
export type SpottingStance = 'stand' | 'crouch' | 'prone';
export interface SpottingCandidate {
  id: string; life: number; position: SpottingPoint; distance: number;
  /** The role's reference distance, including any target signature modifier. */
  referenceRange: number; speed: number; stance: SpottingStance;
  flashAt?: number; flare?: number;
}
interface Contact {
  life: number; confidence: number; seenAt?: number; position?: SpottingPoint;
}
export const SPOTTING = { recheck: .2, memory: 6, forgetSeconds: .75, flashSeconds: .6, flashBoost: 3 } as const;
const exposure = { stand: 1, crouch: .6, prone: .28 } as const;
/** Stationary standing exposure: about .4 s at 20 m, 1.2 s at 65 m and 9 s at 250 m for assault infantry. */
export function spottingSeconds(distance: number, referenceRange: number) {
  return .3 + .9 * (Math.max(0, distance) / Math.max(1, referenceRange)) ** 1.7;
}
/** Integrate a fading flash across this step, so frame rate does not alter its boost. */
export function spottingGain(target: SpottingCandidate, now: number, dt: number) {
  const step = Math.max(0, Math.min(.25, dt));
  const age = target.flashAt === undefined ? Infinity : now - target.flashAt;
  const low = Math.max(0, age - step), high = Math.min(SPOTTING.flashSeconds, age);
  const flash = high > low ? high - high * high / (2 * SPOTTING.flashSeconds) - low + low * low / (2 * SPOTTING.flashSeconds) : 0;
  const movement = 1 + .16 * Math.max(0, Math.min(7, target.speed));
  return exposure[target.stance] * movement * (step + flash * SPOTTING.flashBoost * Math.max(0, Math.min(2, target.flare ?? 0))) / spottingSeconds(target.distance, target.referenceRange);
}
/** The authority infers a settled crouch from eye height; airborne crouch claims get no concealment bonus. */
export const spottingStance = (prone: boolean | undefined, eyeHeight: number, ground: number): SpottingStance =>
  prone ? 'prone' : eyeHeight - ground <= 1.3 ? 'crouch' : 'stand';

export function createBotSpotting() {
  const contacts = new Map<string, Contact>();
  let candidateId = '', clear = false, checkedAt = -Infinity, updatedAt = -Infinity;
  let rejectedNear = '', rejectedAt = -Infinity;
  function update(candidates: readonly SpottingCandidate[], now: number, dt: number,
    sample: (candidate: SpottingCandidate) => boolean, preferred?: string, confirmed?: string): string | undefined {
    const step = Math.max(0, Math.min(.25, dt));
    const gap = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : step;
    updatedAt = now;
    for (const target of candidates) {
      const contact = contacts.get(target.id);
      if (contact && contact.life !== target.life) {
        contacts.delete(target.id);
        if (candidateId === target.id) { clear = false; checkedAt = -Infinity; }
      }
    }
    if (gap > step) for (const contact of contacts.values()) contact.confidence = Math.max(0, contact.confidence - (gap - step) / SPOTTING.forgetSeconds);
    let current = candidates.find(c => c.id === candidateId);
    const urgent = confirmed ? candidates.find(c => c.id === confirmed) : undefined;
    if (urgent) { current = urgent; candidateId = urgent.id; clear = true; checkedAt = now; }
    else if (!current || now - checkedAt >= SPOTTING.recheck - 1e-8 || gap > SPOTTING.recheck * 2) {
      const ordered = preferred ? candidates.find(c => c.id === preferred) : undefined;
      const nearby = current && clear ? candidates.find(c => c.id !== current!.id && c.distance < 12 && c.distance < current!.distance / 2 &&
        (rejectedNear !== `${c.id}:${c.life}` || now - rejectedAt >= 1)) : undefined;
      const previous = current;
      const probingNearby = !ordered && !!nearby;
      if (ordered && ordered !== current) current = ordered;
      else if (probingNearby) current = nearby;
      else if (!current || !clear) {
        const previous = candidates.findIndex(c => c.id === candidateId);
        current = candidates.length ? candidates[(previous + 1) % candidates.length] : undefined;
      }
      candidateId = current?.id ?? ''; checkedAt = now;
      // One normal visual sample per bot per recheck, even with a crowd behind walls.
      const sampledClear = !!current && sample(current);
      if (probingNearby && !sampledClear && previous) {
        // An occluded close actor must not monopolize attention or erase the
        // evidence already accumulating for a clear distant actor.
        rejectedNear = `${current!.id}:${current!.life}`; rejectedAt = now;
        current = previous; candidateId = previous.id;
      } else clear = sampledClear;
    }
    for (const [id, contact] of contacts) {
      if (id !== current?.id || !clear) contact.confidence = Math.max(0, contact.confidence - gap / SPOTTING.forgetSeconds);
      if (contact.confidence === 0 && (contact.seenAt === undefined || now - contact.seenAt > SPOTTING.memory)) contacts.delete(id);
    }
    if (!current || !clear) return undefined;
    let contact = contacts.get(current.id);
    if (!contact) { contact = { life: current.life, confidence: 0 }; contacts.set(current.id, contact); }
    const remembered = contact.seenAt !== undefined && now - contact.seenAt <= SPOTTING.memory;
    contact.confidence = urgent || remembered ? 1 : Math.min(1, contact.confidence + spottingGain(current, now, step));
    if (contact.confidence < 1) return undefined;
    contact.seenAt = now; contact.position = { x: current.position.x, y: current.position.y, z: current.position.z };
    return current.id;
  }
  /** Search only confirmed positions. Never return a partly spotted actor's location. */
  function lastKnown(now: number): SpottingPoint | undefined {
    let newest = -Infinity, point: SpottingPoint | undefined;
    for (const contact of contacts.values()) if (contact.position && contact.seenAt !== undefined && now - contact.seenAt <= SPOTTING.memory && contact.seenAt > newest) {
      newest = contact.seenAt; point = contact.position;
    }
    return point ? { ...point } : undefined;
  }
  return { update, lastKnown };
}
export type BotSpotting = ReturnType<typeof createBotSpotting>;
