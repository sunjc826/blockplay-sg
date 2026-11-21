import * as THREE from 'three';
import type { Obstacle } from './region-collision';
import { stageStates, stagedParts, type LevelutionDescriptor, type ResolvedLevelution } from './levelution';
import { STAGE_BASE, applyStageObstacles, getStageParts, type StageFrom, type StagePart, type StageState } from './stage-parts';

/** Seconds a tagged mesh takes to fall into place once its state is set. */
export const STAGE_FALL_SECONDS = 1.1;
/** A state set longer ago than this is shown settled, with no fall (a late joiner, a resumed tab). */
const FRESH = 4;

/**
 * The renderer's side of Levelution: keeps the scene's stage parts, and on a
 * guest the obstacle list, in step with the events the host has started.
 * `sync` is idempotent and driven only by the descriptors and the match clock,
 * so a late joiner arrives at the same map as everyone else.
 *
 * Where a simulation runs on this machine (solo, host) it owns the obstacle
 * list and changes it on its own clock; pass `ownsObstacles: false` and this
 * only watches the list, so the two clocks cannot undo each other's work.
 */
export function createStageView(world: { scene: THREE.Scene; obstacles: Obstacle[] }, events: readonly ResolvedLevelution[], ownsObstacles = true) {
  const ids = new Set(stagedParts(events).map(p => p.id));
  const parts = getStageParts(world.scene).filter(p => ids.has(p.id));
  const shown = new Map<string, StageState>(parts.map(p => [p.id, STAGE_BASE]));
  const solid = new Map<string, StageState>(parts.map(p => [p.id, STAGE_BASE]));
  const objectOf = (part: StagePart, state: StageState) => state === null ? null : state === STAGE_BASE ? part.object : part.states[state]?.object ?? part.object;
  interface Fall { object: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; at: number; landed: boolean }
  const rest = new Map<THREE.Object3D, { position: THREE.Vector3; yaw: number }>();
  let falls: Fall[] = [];
  const settle = (fall: Fall) => { fall.object.position.copy(fall.to); fall.object.rotation.y = fall.toYaw; };

  /** When each part's current state was set, in match seconds. */
  function setTimes(running: readonly Readonly<LevelutionDescriptor>[], elapsed: number) {
    const times = new Map<string, number>();
    for (const descriptor of running) {
      const event = events.find(e => e.binding.id === descriptor.binding); if (!event) continue;
      for (const step of event.steps) if (step.type === 'set' && elapsed - descriptor.start >= step.at) times.set(step.part, descriptor.start + step.at);
    }
    return times;
  }

  /** Returns whether the map changed, so the caller can rebuild what it derived from the colliders. */
  function sync(running: readonly Readonly<LevelutionDescriptor>[], elapsed: number) {
    const states = stageStates(events, running, elapsed);
    let changed = false;
    if (ownsObstacles) { const moved = applyStageObstacles(world.obstacles, parts, states); changed = moved.added.length + moved.removed.length > 0; }
    else {
      // Whichever state's colliders are in the list now is the state the simulation has set.
      const live = new Set(world.obstacles);
      for (const part of parts) {
        const state = part.obstacles.some(o => live.has(o)) ? STAGE_BASE : Object.keys(part.states).find(name => part.states[name].obstacles.some(o => live.has(o))) ?? null;
        if (state !== solid.get(part.id)) { solid.set(part.id, state); changed = true; }
      }
    }
    const times = setTimes(running, elapsed);
    for (const part of parts) {
      const want = states.has(part.id) ? states.get(part.id)! : STAGE_BASE;
      if (want === shown.get(part.id)) continue;
      const from = objectOf(part, shown.get(part.id)!), to = objectOf(part, want);
      // What was falling into the old state is put down where it belongs before it is taken away.
      falls = falls.filter(fall => { let o: THREE.Object3D | null = fall.object; while (o && o !== from) o = o.parent; if (o) settle(fall); return !o; });
      if (from && from !== to) from.removeFromParent();
      if (to && to.parent !== world.scene) world.scene.add(to);
      shown.set(part.id, want); changed = true;
      const at = times.get(part.id);
      if (to && to !== part.object && at !== undefined && elapsed - at < FRESH) to.traverse(object => {
        const start = object.userData.stageFrom as StageFrom | undefined; if (!start) return;
        const home = rest.get(object) ?? { position: object.position.clone(), yaw: object.rotation.y }; rest.set(object, home);
        const fall: Fall = { object, from: new THREE.Vector3(...start.position), to: home.position, fromYaw: start.yaw ?? home.yaw, toYaw: home.yaw, at: at + (start.delay ?? 0), landed: false };
        falls.push(fall); object.position.copy(fall.from); object.rotation.y = fall.fromYaw;
      });
    }
    return changed;
  }

  /** Move what is falling. Returns where something came down this frame, for dust and sound. */
  function update(elapsed: number) {
    const landings: THREE.Vector3[] = [];
    falls = falls.filter(fall => {
      const t = Math.min(1, Math.max(0, (elapsed - fall.at) / STAGE_FALL_SECONDS)), drop = t * t;
      // Sideways travel leads the drop a little, so a box leaves the stack before it comes down.
      const slide = 1 - (1 - t) * (1 - t);
      fall.object.position.set(fall.from.x + (fall.to.x - fall.from.x) * slide, fall.from.y + (fall.to.y - fall.from.y) * drop, fall.from.z + (fall.to.z - fall.from.z) * slide);
      fall.object.rotation.y = fall.fromYaw + (fall.toYaw - fall.fromYaw) * slide;
      if (t < 1) return true;
      settle(fall); if (!fall.landed) { fall.landed = true; landings.push(fall.object.getWorldPosition(new THREE.Vector3())); }
      return false;
    });
    return landings;
  }

  return {
    sync, update,
    /** Parts currently in something other than the state they were built in. */
    get staged() { return [...shown].filter(([, state]) => state !== STAGE_BASE).length; },
    /** Back to the map as built; the scene's own dispose then frees everything. */
    dispose() { falls.forEach(settle); falls = []; sync([], 0); for (const part of parts) for (const state of Object.values(part.states)) state.object.removeFromParent(); },
  };
}
