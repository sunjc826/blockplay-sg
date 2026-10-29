import type { ArenaActor } from './arena-rules';

const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
/** A short host-time buffer for remote infantry; it never extrapolates through
 * cover when delivery stops, and lifecycle changes replace the old path. */
export function createActorPresentation(delay = .1) {
  const history: { time: number; actor: ArenaActor }[] = [];
  let receivedAt = 0, cursor = -Infinity;
  return {
    accept(actor: ArenaActor, time: number, at: number) {
      const last = history.at(-1);
      if (last && (time < last.time || actor.deaths !== last.actor.deaths || actor.alive !== last.actor.alive ||
        actor.vehicle !== last.actor.vehicle || actor.seat !== last.actor.seat ||
        Math.hypot(actor.x - last.actor.x, actor.y - last.actor.y, actor.z - last.actor.z) > 7)) {
        history.length = 0; cursor = -Infinity;
      }
      if (history.at(-1)?.time === time) history.pop();
      history.push({ time, actor: { ...actor } }); receivedAt = at;
      if (history.length > 16) history.shift();
    },
    sample(now: number): ArenaActor | null {
      const latest = history.at(-1);
      if (!latest) return null;
      // Host time, rather than packet spacing, preserves motion through batches.
      cursor = Math.max(cursor, Math.min(latest.time, latest.time + Math.max(0, now - receivedAt) - delay));
      while (history.length > 2 && history[1].time <= cursor) history.shift();
      const a = history[0], b = history[1] ?? a;
      const t = b.time > a.time ? Math.max(0, Math.min(1, (cursor - a.time) / (b.time - a.time))) : 1;
      const actor = { ...latest.actor };
      for (const key of ['x', 'y', 'z', 'pitch'] as const) actor[key] = a.actor[key] + (b.actor[key] - a.actor[key]) * t;
      actor.yaw = angle(a.actor.yaw, b.actor.yaw, t);
      return actor;
    },
  };
}
