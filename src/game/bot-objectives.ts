interface GroundPoint { x: number; z: number }
const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** A bounded flank through authored ground anchors, with a direct lane as well.
 * Reachability is still checked by the navigator; callers must time out a
 * failed approach so a disconnected anchor cannot strand an attack squad.
 */
export function objectiveApproach(from: GroundPoint, goal: GroundPoint, anchors: readonly GroundPoint[], lane: number,
  clear: (p: GroundPoint) => boolean, occupied: readonly GroundPoint[] = []): GroundPoint | undefined {
  const length = distance(from, goal);
  if (length < 45 || lane === 0) return;
  const dx = (goal.x - from.x) / length, dz = (goal.z - from.z) / length;
  const width = Math.min(45, length * .25) * Math.sign(lane);
  const ideal = { x: from.x + dx * length * .45 - dz * width, z: from.z + dz * length * .45 + dx * width };
  const candidates = anchors.filter(p => {
    const along = ((p.x - from.x) * dx + (p.z - from.z) * dz) / length;
    const across = ((p.z - from.z) * dx - (p.x - from.x) * dz) * Math.sign(lane);
    return along > .2 && along < .8 && across > 8 && distance(from, p) + distance(p, goal) < length * 1.6 && clear(p);
  });
  const score = (p: GroundPoint) => distance(p, ideal) + (distance(from, p) + distance(p, goal) - length) * .25 +
    occupied.filter(q => distance(p, q) < 24).length * 60;
  return candidates.sort((a, b) => score(a) - score(b))[0];
}

/** Spread a moving squad laterally; converge at corners and narrow entrances.
 * Only a lateral correction is added, so spacing cannot reverse an advance.
 */
export function spacedObjectiveStep(from: GroundPoint & { y?: number }, intended: { dx: number; dz: number },
  neighbors: readonly (GroundPoint & { y?: number })[], stride: number, remaining: number) {
  const length = Math.hypot(intended.dx, intended.dz);
  if (length < .001 || remaining < 5) return intended;
  const nx = -intended.dz / length, nz = intended.dx / length;
  let lateral = 0;
  for (const other of neighbors) {
    const dx = from.x - other.x, dz = from.z - other.z, d = Math.hypot(dx, dz);
    if (d < .01 || d > 4 || Math.abs((from.y ?? 0) - (other.y ?? 0)) > 1) continue;
    const side = dx * nx + dz * nz;
    // Near-collinear soldiers pick opposite sides from their along-track order.
    const sign = Math.abs(side) > .15 ? Math.sign(side) : Math.sign(dx * intended.dx + dz * intended.dz);
    lateral += sign * (1 - d / 4);
  }
  const push = Math.max(-.65, Math.min(.65, lateral)) * stride;
  const dx = intended.dx + nx * push, dz = intended.dz + nz * push;
  const scale = Math.min(1, stride / Math.max(.001, Math.hypot(dx, dz)));
  return { dx: dx * scale, dz: dz * scale };
}

/** Capture workers stay within one metre of their squad slot (2.6 m from the facility). */
export function objectiveStep(from: GroundPoint, goal: GroundPoint, intended: { dx: number; dz: number }, stride: number) {
  const dx = goal.x - from.x, dz = goal.z - from.z, distance = Math.hypot(dx, dz);
  if (distance > 1) {
    const step = Math.min(Math.max(0, distance - .4), Math.max(0, stride));
    return { dx: dx / distance * step, dz: dz / distance * step };
  }
  return Math.hypot(from.x + intended.dx - goal.x, from.z + intended.dz - goal.z) <= 1 ? intended : { dx: 0, dz: 0 };
}
