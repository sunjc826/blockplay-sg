import type { ArenaPoint } from './arena-rules';

interface SentInput { point: ArenaPoint; applied: ArenaPoint }
const zero = (): ArenaPoint => ({ x: 0, y: 0, z: 0 });

/** Compare authority with the input it actually processed, preserving subsequent
 * local travel. Applied offsets keep older in-flight inputs from correcting twice. */
export function createInputReconciliation() {
  const sent = new Map<number, SentInput>();
  let acknowledged = 0, applied = zero(), target = zero();
  return {
    reset() { sent.clear(); acknowledged = 0; applied = zero(); target = zero(); },
    record(sequence: number, point: ArenaPoint) {
      sent.set(sequence, { point: { x: point.x, y: point.y, z: point.z }, applied: { ...applied } });
      if (sent.size > 256) sent.delete(sent.keys().next().value!);
    },
    acknowledge(sequence: number, point: ArenaPoint) {
      if (!Number.isSafeInteger(sequence) || sequence <= acknowledged) return;
      const input = sent.get(sequence);
      acknowledged = sequence;
      for (const key of sent.keys()) if (key <= sequence) sent.delete(key);
      // Missing history after a long outage is not evidence of divergence.
      if (!input) return;
      target = {
        x: point.x - input.point.x + input.applied.x,
        y: point.y - input.point.y + input.applied.y,
        z: point.z - input.point.z + input.applied.z,
      };
    },
    correct(point: ArenaPoint, dt: number): { point: ArenaPoint; hard: boolean } | null {
      const error = { x: target.x - applied.x, y: target.y - applied.y, z: target.z - applied.z };
      const distance = Math.hypot(error.x, error.y, error.z);
      if (distance < .005) return null;
      const hard = distance > 2.5, blend = hard ? 1 : 1 - Math.exp(-12 * Math.max(0, Math.min(.25, dt)));
      const shift = { x: error.x * blend, y: error.y * blend, z: error.z * blend };
      applied.x += shift.x; applied.y += shift.y; applied.z += shift.z;
      return { point: { x: point.x + shift.x, y: point.y + shift.y, z: point.z + shift.z }, hard };
    },
  };
}
