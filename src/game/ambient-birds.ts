import { combatRandom } from './combat-events';
import type { AmbientPoint, AmbientView } from './ambient-sky';

/** Local scenery: world-anchored roosts exist before noise sets them flying. */
export interface Bird { x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number; flap: number; size: number }
export interface Flock { id: number; birds: Bird[]; age: number; life: number; home: AmbientPoint; heading: { x: number; z: number }; ceiling: number; resting: boolean }
export const BIRDS = {
  max: 96,
  flock: [8, 12] as const,
  /** Lifetime starts at takeoff; resting birds persist. */
  life: 16,
  cruise: 11, climb: 28,
  spacing: 60, range: 110,
  shotRange: 140,
} as const;

type Surface = (x: number, z: number) => number | null;

export function createBirds(seed: number) {
  const random = combatRandom(seed), flocks: Flock[] = [], visited = new Set<string>();
  let serial = 0;
  const count = () => flocks.reduce((sum, f) => sum + f.birds.length, 0);

  function roost(centre: AmbientPoint, surface: Surface, rng: () => number) {
    const birds: Bird[] = [], size = BIRDS.flock[0] + Math.floor(rng() * (BIRDS.flock[1] - BIRDS.flock[0] + 1));
    if (count() + size > BIRDS.max) return;
    for (let i = 0; i < size; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 3;
      const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r, y = surface(x, z);
      // Keep each bird on the same deck, away from roof edges and water.
      if (y === null || Math.abs(y - centre.y) > .5) continue;
      birds.push({ x, y: y + .12, z, vx: 0, vy: 0, vz: 0, phase: rng() * Math.PI * 2, flap: 0, size: .8 + rng() * .4 });
    }
    if (birds.length < 4) return;
    flocks.push({ id: ++serial, birds, age: 0, life: BIRDS.life, home: { ...centre, y: centre.y + .12 },
      heading: { x: 0, z: 0 }, ceiling: centre.y + BIRDS.climb, resting: true });
  }

  return {
    /** Discover fixed world cells while exploring, independently of aim and fire.
     * Cells are visited once, so an emptied roost stays empty until reset. */
    populate(listener: AmbientPoint, bounds: AmbientView['bounds'], surface: Surface) {
      for (let i = flocks.length - 1; i >= 0; i--) {
        const f = flocks[i];
        if (f.resting && Math.hypot(f.home.x - listener.x, f.home.z - listener.z) > BIRDS.range + BIRDS.spacing) flocks.splice(i, 1);
      }
      const cells: { x: number; z: number; key: string; rng: () => number; distance: number }[] = [];
      for (let gx = Math.floor((listener.x - BIRDS.range) / BIRDS.spacing); gx <= Math.floor((listener.x + BIRDS.range) / BIRDS.spacing); gx++) {
        for (let gz = Math.floor((listener.z - BIRDS.range) / BIRDS.spacing); gz <= Math.floor((listener.z + BIRDS.range) / BIRDS.spacing); gz++) {
          const key = `${gx}/${gz}`; if (visited.has(key)) continue;
          const rng = combatRandom(seed ^ Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663));
          const x = (gx + .25 + rng() * .5) * BIRDS.spacing, z = (gz + .25 + rng() * .5) * BIRDS.spacing;
          const distance = Math.hypot(x - listener.x, z - listener.z);
          if (distance > BIRDS.range || x < bounds.minX + 4 || x > bounds.maxX - 4 || z < bounds.minZ + 4 || z > bounds.maxZ - 4) continue;
          cells.push({ x, z, key, rng, distance });
        }
      }
      cells.sort((a, b) => a.distance - b.distance);
      for (const cell of cells) {
        visited.add(cell.key);
        if (count() + BIRDS.flock[0] > BIRDS.max) continue;
        const y = surface(cell.x, cell.z);
        if (y !== null) roost({ x: cell.x, y, z: cell.z }, surface, cell.rng);
      }
    },
    /** Noise only changes existing birds. Shots test a 3D firing corridor;
     * explosions test a radius. Neither can conjure a new flock. */
    startle(at: AmbientPoint, strength: number, direction?: AmbientPoint, clear: (perch: AmbientPoint) => boolean = () => true) {
      const flushed: AmbientPoint[] = [];
      const length = direction ? Math.hypot(direction.x, direction.y, direction.z) : 0;
      for (const flock of flocks) {
        if (!flock.resting) continue;
        const dx = flock.home.x - at.x, dy = flock.home.y - at.y, dz = flock.home.z - at.z;
        if (direction) {
          if (!length) continue;
          const along = (dx * direction.x + dy * direction.y + dz * direction.z) / length;
          const across = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
          if (along <= 0 || along > BIRDS.shotRange || across > 8 + along * .05) continue;
        } else if (Math.hypot(dx, dy, dz) > 60 * Math.max(.3, Math.min(2, strength))) continue;
        if (!clear(flock.home)) continue;
        flock.resting = false; flock.age = 0;
        const away = Math.hypot(dx, dz), angle = random() * Math.PI * 2;
        flock.heading = away > 1 ? { x: dx / away, z: dz / away } : { x: Math.cos(angle), z: Math.sin(angle) };
        for (const bird of flock.birds) {
          const bx = bird.x - at.x, bz = bird.z - at.z, distance = Math.hypot(bx, bz) || 1, burst = 3 + random() * 3;
          bird.vx = bx / distance * burst + (random() - .5) * 4;
          bird.vz = bz / distance * burst + (random() - .5) * 4;
          bird.vy = 5 + random() * 3; bird.flap = 0;
        }
        flushed.push(flock.home);
      }
      return flushed;
    },
    step(dt: number) {
      for (let f = flocks.length - 1; f >= 0; f--) {
        const flock = flocks[f];
        if (flock.resting) continue;
        flock.age += dt;
        if (flock.age > flock.life) { flocks.splice(f, 1); continue; }
        let cx = 0, cy = 0, cz = 0; for (const b of flock.birds) { cx += b.x; cy += b.y; cz += b.z; }
        const n = flock.birds.length; cx /= n; cy /= n; cz /= n;
        for (const b of flock.birds) {
          const rising = b.y < flock.ceiling;
          const wantX = flock.heading.x * BIRDS.cruise + (cx - b.x) * .25, wantZ = flock.heading.z * BIRDS.cruise + (cz - b.z) * .25;
          const wantY = rising ? 4 : (cy - b.y) * .2 + Math.sin(flock.age * .8 + b.phase) * .6;
          const turn = Math.min(1, dt * 1.4);
          b.vx += (wantX - b.vx) * turn + (random() - .5) * dt * 3; b.vz += (wantZ - b.vz) * turn + (random() - .5) * dt * 3; b.vy += (wantY - b.vy) * turn;
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          const flapping = rising || Math.sin(flock.age * .9 + b.phase * 3) > -.2;
          b.phase += dt * (rising ? 14 : 9);
          b.flap = flapping ? Math.sin(b.phase) * .9 : .12;
        }
      }
    },
    get flocks(): readonly Flock[] { return flocks; },
    get count() { return count(); },
    reset() { flocks.length = 0; visited.clear(); },
  };
}
export type Birds = ReturnType<typeof createBirds>;
