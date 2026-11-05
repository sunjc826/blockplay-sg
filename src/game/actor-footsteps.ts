import { hostile } from './arena-factions';
import type { ArenaActor } from './arena-rules';

/**
 * Other people's footsteps, tuned so a district of thirty-odd soldiers stays
 * information and not patter. Only hostile soldiers on foot are heard, and only
 * close: the range grows with their pace. Only the nearest few count, however many
 * are in range, and steps are spaced so a squad never becomes a drum roll.
 */
export const ACTOR_STEPS = {
  /** Metres heard at the slowest pace and at a full sprint. A heavy gunner plods at 1.6 m/s, a player sprints at 7. */
  range: { near: 15, far: 26, slow: 2, fast: 7 },
  /** Only this many nearest soldiers are heard, the rest are in the fight but not in your ears. */
  voices: 3,
  /** Seconds between any two heard steps, whoever they belong to. */
  gap: .13,
  /** Another floor is not a threat to your flank. */
  vertical: 4.5,
  /** Standing fidgets do not count as walking. */
  minSpeed: .5,
  /** A person crouching or aiming on the move is deliberately quiet; a bot's pace is its role, so it still sounds. */
  quietHuman: 2.6,
  /** Faster than this between samples is a respawn or a lift, not walking. */
  teleport: 12,
} as const;
export const stride = (speed: number) => speed >= 5 ? 2.2 : 1.85;
export function stepRange(speed: number) {
  const { near, far, slow, fast } = ACTOR_STEPS.range;
  return near + (far - near) * Math.min(1, Math.max(0, (speed - slow) / (fast - slow)));
}
/** Fades to nothing at the edge of the range, so a step never pops into hearing. */
export const stepGain = (distance: number, range: number) => Math.pow(Math.max(0, 1 - distance / range), 1.4);

export interface ActorStep { id: string; x: number; y: number; z: number; distance: number; speed: number; gain: number }
type Listener = { x: number; y: number; z: number };
type Self = Pick<ArenaActor, 'id' | 'bot' | 'faction'>;

export function createActorFootsteps() {
  const track = new Map<string, { x: number; z: number; walked: number }>();
  let clock = -1, lastStep = -Infinity;
  return {
    /** The steps due at match time `elapsed`, nearest first. Call with each snapshot; a repeat of the same time does nothing. */
    advance(actors: readonly ArenaActor[], self: Self, listener: Listener, elapsed: number): ActorStep[] {
      const dt = elapsed - clock; if (dt <= 0) { if (dt < -1) { track.clear(); clock = elapsed; lastStep = -Infinity; } return []; }
      const first = clock < 0; clock = elapsed;
      const moving: { actor: ArenaActor; speed: number; distance: number; range: number }[] = [], due = new Set<string>(), present = new Set<string>();
      for (const actor of actors) {
        if (actor.id === self.id || !actor.alive || actor.vehicle || actor.parachuting || actor.swimming || actor.prone || actor.lift || !hostile(self, actor)) continue;
        present.add(actor.id);
        const was = track.get(actor.id);
        if (!was || first) { track.set(actor.id, { x: actor.x, z: actor.z, walked: 0 }); continue; }
        const moved = Math.hypot(actor.x - was.x, actor.z - was.z), speed = moved / dt;
        was.x = actor.x; was.z = actor.z;
        if (speed > ACTOR_STEPS.teleport || speed < ACTOR_STEPS.minSpeed) { was.walked = 0; continue; }
        if (!actor.bot && speed <= ACTOR_STEPS.quietHuman) { was.walked = 0; continue; }
        const range = stepRange(speed), distance = Math.hypot(actor.x - listener.x, actor.z - listener.z);
        was.walked += moved;
        const whole = was.walked >= stride(speed);
        if (whole) { was.walked %= stride(speed); due.add(actor.id); }
        if (distance <= range && Math.abs(actor.y - listener.y) <= ACTOR_STEPS.vertical) moving.push({ actor, speed, distance, range });
      }
      for (const id of track.keys()) if (!present.has(id)) track.delete(id);
      const nearest = moving.sort((a, b) => a.distance - b.distance).slice(0, ACTOR_STEPS.voices), heard: ActorStep[] = [];
      for (const { actor, speed, distance, range } of nearest) {
        if (!due.has(actor.id) || elapsed - lastStep < ACTOR_STEPS.gap) continue;
        lastStep = elapsed;
        heard.push({ id: actor.id, x: actor.x, y: actor.y, z: actor.z, distance, speed, gain: stepGain(distance, range) });
      }
      return heard;
    },
    reset() { track.clear(); clock = -1; lastStep = -Infinity; },
  };
}
