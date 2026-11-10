import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import { createVerticalNavigator, type NavigationPoint } from './vertical-navigation';
import type { NavigationBake } from './navigation-bake';
import type { Obstacle } from './region-collision';

export const MAID_WALK_SPEED = 2.4;
export const MAID_REACH = 2.8;
const distance = (a: NavigationPoint, b: NavigationPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Personal non-combat follower. All movement uses the infantry collision kernel;
 * there is no rubber-band speed, blink, or unreachable-target repositioning. */
export function createMaidFollower(world: VerticalWorld, entry: NavigationPoint, arrivalSeconds = 0,
  anchors: readonly { x: number; z: number }[] = [], bake?: NavigationBake) {
  const movement = createVerticalMovement(world);
  let navigator: ReturnType<typeof createVerticalNavigator> | undefined;
  let state = { ...entry, velocityY: 0 }, path: NavigationPoint[] = [], route: Generator<undefined, NavigationPoint[]> | undefined;
  let cooldown = 0, arrival = Number.isFinite(arrivalSeconds) ? Math.max(0, arrivalSeconds) : 0;
  let facing = 0, walking = 0, lastTarget = { ...entry };
  const trail: NavigationPoint[] = [];
  let recorded = { ...entry };
  function update(dt: number, target: NavigationPoint, extra: readonly Obstacle[] = []) {
    const tick = Math.max(0, Math.min(.1, dt)); walking = 0; lastTarget = { ...target };
    if (arrival > 0) { arrival = Math.max(0, arrival - tick); return; }
    // Retain the owner's route at walking-scale intervals. Long chases target
    // an earlier point on that route, so running beyond the navigation graph's
    // local search radius cannot strand her at the previous district entry.
    if (distance(recorded, target) >= 1) { trail.push({ ...target }); recorded = { ...target }; }
    if (distance(state, target) < 2) trail.length = 0;
    else { for (let i = trail.length - 1; i >= 0; i--) if (distance(state, trail[i]) < 2) { trail.splice(0, i + 1); break; } }
    if (trail.length > 4096) trail.splice(0, trail.length - 4096);
    const goal = distance(state, target) > 35 ? trail.find(p => distance(state, p) > 15) ?? target : target;
    cooldown -= tick;
    // Never plan every frame or drain an entire district search synchronously.
    if (!route && cooldown <= 0 && distance(state, target) > 1.9) {
      navigator ??= createVerticalNavigator(world, anchors.length ? anchors : [entry], bake);
      route = navigator.plan(state, goal, undefined, extra); cooldown = 1;
    }
    if (route) for (let i = 0; i < 12; i++) {
      const result = route.next();
      if (result.done) { if (result.value.length) path = result.value; route = undefined; break; }
    }
    while (path.length && distance(state, path[0]) < .18) path.shift();
    const waypoint = path[0];
    let dx = 0, dz = 0;
    if (waypoint && distance(state, target) > 1.8) {
      const length = Math.hypot(waypoint.x - state.x, waypoint.z - state.z);
      const step = Math.min(length, MAID_WALK_SPEED * tick);
      if (length > .001) { dx = (waypoint.x - state.x) / length * step; dz = (waypoint.z - state.z) / length * step; }
    }
    const next = movement.move(state, dx, dz, tick, .38, 1.8, extra);
    const moved = Math.hypot(next.x - state.x, next.z - state.z);
    if (moved > .001) facing = Math.atan2(-(next.x - state.x), -(next.z - state.z));
    walking = tick > 0 ? Math.min(MAID_WALK_SPEED, moved / tick) : 0;
    state = next;
  }
  function reachable(target: NavigationPoint, extra: readonly Obstacle[] = []) {
    if (arrival > 0 || distance(state, target) > MAID_REACH || Math.abs(state.y - target.y) > .6) return false;
    // Being close through a wall does not permit fetching a magazine.
    const length = Math.hypot(target.x - state.x, target.z - state.z), steps = Math.max(1, Math.ceil(length / .2));
    for (let i = 1; i <= steps; i++) if (!movement.canOccupy(state.x + (target.x - state.x) * i / steps,
      state.y + (target.y - state.y) * i / steps, state.z + (target.z - state.z) * i / steps, .1, 1.5, extra)) return false;
    return true;
  }
  return { update, reachable,
    get position() { return { x: state.x, y: state.y, z: state.z }; },
    get facing() { return facing; }, get walking() { return walking; }, get arriving() { return arrival > 0; },
    get distance() { return distance(state, lastTarget); },
    // Crossing a district boundary preserves the time she still owes; the next
    // district's fixed entry point is where she arrives, never the moving player.
    travelSeconds(target: NavigationPoint) {
      const points = [state, ...path, target];
      const routeDistance = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
      return arrival + Math.max(0, Math.max(distance(state, target), routeDistance) - 1.8) / MAID_WALK_SPEED;
    },
  };
}
