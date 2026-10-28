import type { SharedVehicle } from './vehicle-seats';

const angle = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
/** Render a short interval behind authority so hull and camera move together between ticks. */
export function createVehiclePresentation(delay = .1) {
  const history: { at: number; state: SharedVehicle }[] = [];
  return {
    reset() { history.length = 0; },
    accept(state: SharedVehicle, at: number) {
      const last = history.at(-1);
      if (last && (Math.hypot(state.x - last.state.x, state.y - last.state.y, state.z - last.state.z) > 30 ||
        state.health > 0 && last.state.health <= 0)) history.length = 0;
      if (history.at(-1)?.at === at) history.pop();
      history.push({ at, state: { ...state } });
      if (history.length > 12) history.shift();
    },
    sample(now: number): SharedVehicle | null {
      if (!history.length) return null;
      const at = now - delay;
      while (history.length > 2 && history[1].at <= at) history.shift();
      const a = history[0], b = history[1] ?? a;
      const t = b.at > a.at ? Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at))) : 1;
      const state = { ...b.state };
      for (const key of ['x', 'y', 'z', 'speed', 'climb', 'gunPitch'] as const) state[key] = a.state[key] + (b.state[key] - a.state[key]) * t;
      state.yaw = angle(a.state.yaw, b.state.yaw, t); state.gunYaw = angle(a.state.gunYaw, b.state.gunYaw, t);
      return state;
    },
  };
}
