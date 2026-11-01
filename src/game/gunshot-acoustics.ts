import * as THREE from 'three';
import type { BallisticPoint } from './fps-ballistics';
import { SPEED_OF_SOUND } from './combat-event-audio';
import { createSceneCover } from './scene-cover';
import { hitSurface, type SurfaceKind } from './fps-surfaces';
import { impactSurfaceNormal } from './fps-impact-normal';

export interface GunshotReflection { delay: number; gain: number; cutoff: number }
export interface GunshotAcoustics {
  kind: 'open' | 'facade' | 'covered' | 'enclosed';
  reflections: readonly GunshotReflection[];
  /** How much of the recording's baked-in outdoor tail remains after its attack. */
  directTail: number;
  decay: number; wet: number; cutoff: number;
}
export const OPEN_GUNSHOT_ACOUSTICS: GunshotAcoustics = Object.freeze({
  kind: 'open', reflections: [], directTail: .28, decay: .08, wet: 0, cutoff: 2600,
});
export const ACOUSTIC_RANGE = 42;
export const MAX_ACOUSTIC_CACHE = 96;
export const MAX_REMOTE_ACOUSTIC_PROBES = 4;
export interface AcousticHit { distance: number; surface: SurfaceKind }
export type AcousticTrace = (from: BallisticPoint, direction: BallisticPoint, range: number) => AcousticHit | undefined;
const HARDNESS: Record<SurfaceKind, number> = { concrete: 1, metal: .95, glass: .85, wood: .5, dirt: .08, foliage: 0, flesh: 0 };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const HORIZONTAL = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * Math.PI / 4), y: 0, z: Math.sin(i * Math.PI / 4) }));
const UPWARD = [{ x: 0, y: 1, z: 0 }, ...[0, 1, 2, 3].map(i => {
  const length = Math.hypot(1, .4);
  return { x: .4 * Math.cos(i * Math.PI / 2) / length, y: 1 / length, z: .4 * Math.sin(i * Math.PI / 2) / length };
})];

/** Thirteen short, rendered-geometry probes. A nearby wall alone is not a room:
 * several overhead probes must find a real roof before indoor reverb is used.
 * This is a bounded local acoustic approximation, not specular path tracing.
 */
export function sampleGunshotAcoustics(from: BallisticPoint, trace: AcousticTrace): GunshotAcoustics {
  if (![from.x, from.y, from.z].every(Number.isFinite)) return OPEN_GUNSHOT_ACOUSTICS;
  const read = (direction: BallisticPoint, range: number) => {
    const hit = trace(from, direction, range);
    return hit && Number.isFinite(hit.distance) && hit.distance >= .08 && hit.distance <= range && HARDNESS[hit.surface] >= .3 ? hit : undefined;
  };
  const walls = HORIZONTAL.map(d => read(d, ACOUSTIC_RANGE));
  const roofs = UPWARD.map(d => read(d, 10));
  const roofHits = roofs.filter((h): h is AcousticHit => !!h);
  const covered = roofHits.length >= 3;
  const closeWalls = walls.filter(h => h && h.distance < 12).length;
  const nearWalls = walls.filter(h => h && h.distance < 4).length;
  const roofHeight = roofHits.length ? Math.min(...roofHits.map(h => h.distance)) : Infinity;
  const enclosed = covered && (closeWalls >= 5 || roofHeight < 2.1 && nearWalls >= 3);
  const wallHits = walls.filter((h): h is AcousticHit => !!h);
  if (!covered && !wallHits.length) return OPEN_GUNSHOT_ACOUSTICS;
  const kind = enclosed ? 'enclosed' : covered ? 'covered' : 'facade';
  const hits = [...wallHits, ...(covered ? roofHits.slice(0, 1) : [])].sort((a, b) => a.distance - b.distance);
  const selected: AcousticHit[] = [];
  // Do not stack eight copies at the same delay when a box or flat slab is hit.
  for (const hit of hits) {
    if (selected.some(h => Math.abs(h.distance - hit.distance) < .65)) continue;
    selected.push(hit); if (selected.length === 4) break;
  }
  const hardness = hits.reduce((sum, h) => sum + HARDNESS[h.surface], 0) / hits.length;
  const reflections = selected.map((hit, i) => ({
    delay: clamp(2 * hit.distance / SPEED_OF_SOUND, .008, .25),
    gain: HARDNESS[hit.surface] * (.4 / (1 + hit.distance / 12)) / (1 + i * .18),
    cutoff: (enclosed ? 6200 : covered ? 4400 : 3200) * (.7 + .3 * HARDNESS[hit.surface]),
  }));
  return { kind, reflections,
    directTail: enclosed ? .45 : covered ? .52 : .4,
    decay: enclosed ? .8 + .18 * hardness : covered ? .35 + .18 * hardness : .16,
    wet: (enclosed ? .26 : covered ? .14 : .025) * hardness,
    cutoff: enclosed ? 4800 : covered ? 3300 : 2200,
  };
}

/** Cached per emitter, refreshed on movement, storey changes or a short TTL.
 * A snapshot's repeated shots reuse one probe. Busy remote firefights have a
 * strict per-100 ms budget; the local player's gun always gets a fresh space.
 */
export function createGunshotAcoustics(trace: AcousticTrace, clock = () => performance.now()) {
  const cache = new Map<string, { from: BallisticPoint; at: number; value: GunshotAcoustics }>();
  let windowAt = -Infinity, probes = 0;
  return {
    at(key: string, from: BallisticPoint, own = false) {
      const now = clock(), previous = cache.get(key);
      if (previous && now - previous.at < (own ? 350 : 800)
        && Math.hypot(from.x - previous.from.x, from.y - previous.from.y, from.z - previous.from.z) < .75) return previous.value;
      if (now - windowAt >= 100) { windowAt = now; probes = 0; }
      if (!own && probes >= MAX_REMOTE_ACOUSTIC_PROBES) return OPEN_GUNSHOT_ACOUSTICS;
      if (!own) probes++;
      const value = sampleGunshotAcoustics(from, trace);
      if (!cache.has(key) && cache.size >= MAX_ACOUSTIC_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(key, { from: { ...from }, at: now, value }); return value;
    },
    clear() { cache.clear(); windowAt = -Infinity; probes = 0; },
  };
}

/** Uses the same visible static geometry as shot cover, excluding avatars,
 * vehicles, effects and foliage. Painted green masonry is still a hard wall. */
export function createSceneGunshotAcoustics(scene: THREE.Scene, clock?: () => number) {
  const cover = createSceneCover(scene, node => node.userData.heat === 'target' || node.userData.impactSurface === 'flesh'), direction = new THREE.Vector3(), normal = new THREE.Vector3();
  return createGunshotAcoustics((from, heading, range) => {
    const hit = cover.trace(from, heading, range); if (!hit) return undefined;
    impactSurfaceNormal(hit, direction.set(heading.x, heading.y, heading.z), normal);
    let surface = hitSurface(hit, normal.y);
    if (surface === 'foliage') {
      const mesh = hit.object as THREE.Mesh, material = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material;
      let explicit = material?.userData.impactSurface === 'foliage' || /leaf|leaves|foliage|hedge|grass/i.test(material?.name ?? '');
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) explicit ||= node.userData.impactSurface === 'foliage';
      if (!explicit) surface = 'concrete';
    }
    return { distance: hit.distance, surface };
  }, clock);
}
