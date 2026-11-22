import * as THREE from 'three';
import type { Obstacle } from './region-collision';
import { stageStates, stagedParts, type LevolutionDescriptor, type ResolvedLevolution } from './levolution';
import { STAGE_BASE, applyStageObstacles, getStageParts, type StageFrom, type StagePart, type StageState, type StageTip } from './stage-parts';

/** Seconds a tagged mesh takes to fall into place once its state is set. */
export const STAGE_FALL_SECONDS = 1.4;
/** A state set longer ago than this is shown settled, with no fall (a late joiner, a resumed tab). */
const FRESH = 4;

/**
 * The renderer's side of Levolution: keeps the scene's stage parts, and on a
 * guest the obstacle list, in step with the events the host has started.
 * `sync` is idempotent and driven only by the descriptors and the match clock,
 * so a late joiner arrives at the same map as everyone else.
 *
 * Where a simulation runs on this machine (solo, host) it owns the obstacle
 * list and changes it on its own clock; pass `ownsObstacles: false` and this
 * only watches the list, so the two clocks cannot undo each other's work.
 */
export function createStageView(world: { scene: THREE.Scene; obstacles: Obstacle[] }, events: readonly ResolvedLevolution[], ownsObstacles = true) {
  const ids = new Set(stagedParts(events).map(p => p.id));
  const parts = getStageParts(world.scene).filter(p => ids.has(p.id));
  const shown = new Map<string, StageState>(parts.map(p => [p.id, STAGE_BASE]));
  const solid = new Map<string, StageState>(parts.map(p => [p.id, STAGE_BASE]));
  const objectOf = (part: StagePart, state: StageState) => state === null ? null : state === STAGE_BASE ? part.object : part.states[state]?.object ?? part.object;
  interface Fall { object: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; at: number; landed: boolean; seconds: number; rise: boolean }
  const rest = new Map<THREE.Object3D, { position: THREE.Vector3; yaw: number }>();
  let falls: Fall[] = [];
  interface Tip { object: THREE.Object3D; spec: StageTip; at: number }
  let tips: Tip[] = [];
  let impacts: { at: THREE.Vector3; size: number }[] = [];
  const settle = (fall: Fall) => { fall.object.position.copy(fall.to); fall.object.rotation.y = fall.toYaw; };

  /** When each part's current state was set, in match seconds. */
  function setTimes(running: readonly Readonly<LevolutionDescriptor>[], elapsed: number) {
    const times = new Map<string, number>();
    for (const descriptor of running) {
      const event = events.find(e => e.binding.id === descriptor.binding); if (!event) continue;
      for (const step of event.steps) if (step.type === 'set' && elapsed - descriptor.start >= step.at - (step.lead ?? 0)) times.set(step.part, descriptor.start + step.at - (step.lead ?? 0));
    }
    return times;
  }

  /** Returns whether the map changed, so the caller can rebuild what it derived from the colliders. */
  function sync(running: readonly Readonly<LevolutionDescriptor>[], elapsed: number) {
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
    // What is drawn can run ahead of what is solid: a step's `lead` shows its state falling before it lands.
    const times = setTimes(running, elapsed), drawn = stageStates(events, running, elapsed, true);
    for (const part of parts) {
      const want = drawn.has(part.id) ? drawn.get(part.id)! : STAGE_BASE;
      if (want === shown.get(part.id)) continue;
      const from = objectOf(part, shown.get(part.id)!), to = objectOf(part, want);
      // What was falling into the old state is put down where it belongs before it is taken away.
      falls = falls.filter(fall => { let o: THREE.Object3D | null = fall.object; while (o && o !== from) o = o.parent; if (o) settle(fall); return !o; });
      tips = tips.filter(tip => { let o: THREE.Object3D | null = tip.object; while (o && o !== from) o = o.parent; return !o; });
      if (from && from !== to) from.removeFromParent();
      if (to && to.parent !== world.scene) world.scene.add(to);
      shown.set(part.id, want); changed = true;
      // Working scenery that rides on the part (a crane's hoist) goes with it and comes back with it.
      world.scene.traverse(object => { if (object.userData.stagePart === part.id) object.visible = want === STAGE_BASE; });
      const at = times.get(part.id);
      const fresh = at !== undefined && elapsed - at < FRESH;
      if (to && to !== part.object) to.traverse(object => {
        const tip = object.userData.stageTip as StageTip | undefined;
        // Something that goes over as one piece: upright when its state is set, down `seconds` later.
        if (tip) { if (fresh) { tips.push({ object, spec: tip, at: at! }); object.rotation.set(0, 0, 0); } else object.rotation.set(tip.tip, tip.yaw, 0); }
        if (fresh && typeof object.userData.stageImpact === 'number') impacts.push({ at: new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).setY(0), size: object.userData.stageImpact });
        const start = object.userData.stageFrom as StageFrom | undefined; if (!start || !fresh) return;
        const home = rest.get(object) ?? { position: object.position.clone(), yaw: object.rotation.y }; rest.set(object, home);
        const fall: Fall = { object, from: new THREE.Vector3(...start.position), to: home.position, fromYaw: start.yaw ?? home.yaw, toYaw: home.yaw, at: at! + (start.delay ?? 0), landed: !!start.rise, seconds: start.seconds ?? STAGE_FALL_SECONDS, rise: !!start.rise };
        falls.push(fall); object.position.copy(fall.from); object.rotation.y = fall.fromYaw;
      });
    }
    return changed;
  }

  /** Move what is falling. Returns where something came down this frame and how hard, for dust, sound and shake. */
  function update(elapsed: number) {
    const landings = impacts; impacts = [];
    tips = tips.filter(tip => {
      // Slow to start and fast at the end, as something toppling is.
      const t = Math.min(1, Math.max(0, (elapsed - tip.at) / tip.spec.seconds)), k = Math.pow(t, 2.4);
      tip.object.rotation.set(tip.spec.tip * k, tip.spec.yaw * k, 0);
      return t < 1;
    });
    falls = falls.filter(fall => {
      const t = Math.min(1, Math.max(0, (elapsed - fall.at) / fall.seconds)), drop = fall.rise ? t : t * t;
      // Sideways travel leads the drop a little, so a box leaves the stack before it comes down.
      const slide = 1 - (1 - t) * (1 - t);
      fall.object.position.set(fall.from.x + (fall.to.x - fall.from.x) * slide, fall.from.y + (fall.to.y - fall.from.y) * drop, fall.from.z + (fall.to.z - fall.from.z) * slide);
      fall.object.rotation.y = fall.fromYaw + (fall.toYaw - fall.fromYaw) * slide;
      if (t < 1) return true;
      settle(fall); if (!fall.landed) { fall.landed = true; landings.push({ at: fall.object.getWorldPosition(new THREE.Vector3()), size: .7 }); }
      return false;
    });
    return landings;
  }

  return {
    sync, update,
    /** Parts currently in something other than the state they were built in. */
    get staged() { return [...shown].filter(([, state]) => state !== STAGE_BASE).length; },
    /** Back to the map as built; the scene's own dispose then frees everything. */
    dispose() { falls.forEach(settle); falls = []; tips = []; impacts = []; sync([], 0); for (const part of parts) for (const state of Object.values(part.states)) state.object.removeFromParent(); },
  };
}
