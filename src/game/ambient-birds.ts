import { combatRandom } from './combat-events';
import type { AmbientPoint } from './ambient-sky';

/**
 * Birds that burst off the roofs when something goes bang nearby, and the odd
 * flock passing over on a quiet day. Scenery only: a seeded flock sim the
 * renderer reads, never seen by gameplay rays or other players.
 */

export interface Bird { x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number; flap: number; size: number }
export interface Flock { id: number; birds: Bird[]; age: number; life: number; home: AmbientPoint; heading: { x: number; z: number }; ceiling: number; climbing: boolean }
export const BIRDS = {
  /** Birds alive at once across every flock; the oldest flock goes first. */
  max: 96,
  /** Birds a full-sized startle (a shell landing) puts up; a gunshot is about half. */
  flock: [8, 22] as const,
  /** Seconds a flock is drawn before it has flown off. */
  life: 16,
  /** A startle within this many metres and seconds of the last flock is the same birds, already gone. */
  quiet: { metres: 30, seconds: 8 },
  cruise: 11, climb: 28,
} as const;

export function createBirds(seed: number) {
  const random = combatRandom(seed), flocks: Flock[] = [];
  let serial = 0, clock = 0;
  const recent: { at: AmbientPoint; time: number }[] = [];

  function spawn(centre: AmbientPoint, count: number, heading: { x: number; z: number }, climbing: boolean, flee?: AmbientPoint) {
    const birds: Bird[] = [];
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, r = random() * 8;
      const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r, y = centre.y + random() * 5;
      // Startled birds scatter away from the noise before they gather and go.
      const away = flee ? { x: x - flee.x, z: z - flee.z } : heading, length = Math.hypot(away.x, away.z) || 1;
      const burst = climbing ? 3 + random() * 3 : BIRDS.cruise;
      birds.push({ x, y, z, vx: away.x / length * burst + (random() - .5) * 2, vy: climbing ? 5 + random() * 3 : 0, vz: away.z / length * burst + (random() - .5) * 2,
        phase: random() * Math.PI * 2, flap: 0, size: .8 + random() * .4 });
    }
    flocks.push({ id: ++serial, birds, age: 0, life: BIRDS.life, home: { ...centre }, heading, ceiling: centre.y + BIRDS.climb, climbing });
    let total = flocks.reduce((sum, f) => sum + f.birds.length, 0);
    while (total > BIRDS.max && flocks.length > 1) total -= flocks.shift()!.birds.length;
  }

  return {
    /**
     * Something loud at `at`: birds roosting near `perch` (default: on top of
     * it) burst up and away from the noise. `strength` 1 is a shell; returns
     * whether any went up, since birds already flushed do not go twice.
     */
    startle(at: AmbientPoint, strength: number, perch: AmbientPoint = { ...at, y: at.y + 6 }) {
      if (recent.some(r => clock - r.time < BIRDS.quiet.seconds && Math.hypot(r.at.x - perch.x, r.at.z - perch.z) < BIRDS.quiet.metres)) return false;
      recent.push({ at: perch, time: clock }); if (recent.length > 12) recent.shift();
      const away = { x: perch.x - at.x, z: perch.z - at.z }, length = Math.hypot(away.x, away.z);
      const heading = length > 1 ? { x: away.x / length, z: away.z / length } : (() => { const a = random() * Math.PI * 2; return { x: Math.cos(a), z: Math.sin(a) }; })();
      const scale = Math.max(.3, Math.min(1, strength));
      spawn(perch, Math.round(BIRDS.flock[0] + (BIRDS.flock[1] - BIRDS.flock[0]) * scale * (.7 + random() * .3)), heading, true, at);
      return true;
    },
    /** A flock already in the air, crossing over on its way somewhere. */
    pass(at: AmbientPoint, heading: { x: number; z: number }) { spawn(at, 10 + Math.floor(random() * 12), heading, false); },
    step(dt: number) {
      clock += dt;
      for (let f = flocks.length - 1; f >= 0; f--) {
        const flock = flocks[f]; flock.age += dt;
        if (flock.age > flock.life) { flocks.splice(f, 1); continue; }
        let cx = 0, cy = 0, cz = 0; for (const b of flock.birds) { cx += b.x; cy += b.y; cz += b.z; }
        const n = flock.birds.length; cx /= n; cy /= n; cz /= n;
        for (const b of flock.birds) {
          const rising = flock.climbing && b.y < flock.ceiling;
          // Steer toward the flock's way out and its middle; climb until clear of the roofs.
          const wantX = flock.heading.x * BIRDS.cruise + (cx - b.x) * .25, wantZ = flock.heading.z * BIRDS.cruise + (cz - b.z) * .25;
          const wantY = rising ? 4 : (cy - b.y) * .2 + Math.sin(flock.age * .8 + b.phase) * .6;
          const turn = Math.min(1, dt * 1.4);
          b.vx += (wantX - b.vx) * turn + (random() - .5) * dt * 3; b.vz += (wantZ - b.vz) * turn + (random() - .5) * dt * 3; b.vy += (wantY - b.vy) * turn;
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          // Hard flapping while climbing; cruising, they flap in bouts and glide between.
          const flapping = rising || Math.sin(flock.age * .9 + b.phase * 3) > -.2;
          b.phase += dt * (rising ? 14 : 9);
          b.flap = flapping ? Math.sin(b.phase) * .9 : .12;
        }
      }
    },
    get flocks(): readonly Flock[] { return flocks; },
    get count() { return flocks.reduce((sum, f) => sum + f.birds.length, 0); },
    reset() { flocks.length = 0; recent.length = 0; },
  };
}
export type Birds = ReturnType<typeof createBirds>;
