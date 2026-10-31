interface GroundPoint { x: number; z: number }
/** Capture workers stay within one metre of their squad slot (2.6 m from the facility). */
export function objectiveStep(from: GroundPoint, goal: GroundPoint, intended: { dx: number; dz: number }, stride: number) {
  const dx = goal.x - from.x, dz = goal.z - from.z, distance = Math.hypot(dx, dz);
  if (distance > 1) {
    const step = Math.min(Math.max(0, distance - .4), Math.max(0, stride));
    return { dx: dx / distance * step, dz: dz / distance * step };
  }
  return Math.hypot(from.x + intended.dx - goal.x, from.z + intended.dz - goal.z) <= 1 ? intended : { dx: 0, dz: 0 };
}
