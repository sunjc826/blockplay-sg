import type { ProxyCampaign } from './proxy-operations';
import type { VehicleCrewTransfer } from './arena-rules';
import { isPosted, QUIET_METHODS, SIM_MAX_CATCH_UP, SIM_METHODS, SIM_TICK, type Arena, type SimFromHost, type SimPort, type SimToHost } from './sim-protocol';

/**
 * The vehicle and crew a player drove in from the last district take their seats in the same call that adds
 * the player, so no state ever shows the player arrived on foot. A crew that cannot be seated fails that call.
 */
export function seatArrivingCrew(arena: Arena, self: string, transfer?: VehicleCrewTransfer): Arena {
  if (!transfer) return arena;
  let waiting: VehicleCrewTransfer | undefined = transfer;
  return { ...arena, addPlayer(...args: Parameters<Arena['addPlayer']>) {
    const added = arena.addPlayer(...args);
    if (waiting && args[0] === self) { const crew = waiting; waiting = undefined; if (!arena.restoreVehicleTravel(crew, self)) throw new Error('Vehicle crew could not enter the destination district'); }
    return added;
  } };
}

export interface SimHostClock { now(): number; every(ms: number, wake: () => void): () => void }
export const realClock: SimHostClock = { now: () => performance.now(), every: (ms, wake) => { const timer = setInterval(wake, ms); return () => clearInterval(timer); } };

/**
 * Runs a simulation for a runtime on another thread: applies its calls in the
 * order sent, keeps time itself, and pushes the state after every wake that
 * stepped. `self` is the one local player whose hits and spawn views travel;
 * `campaign` is the object the simulation was given as `environment.proxies`.
 */
export function createSimHost(arena: Arena, self: string, port: SimPort<SimFromHost, SimToHost>, clock: SimHostClock = realClock, campaign?: ProxyCampaign) {
  let running = false, last = 0, owed = 0;
  const state = (report?: { steps: number; stepMs: number; droppedMs: number }): SimFromHost =>
    ({ type: 'state', snapshot: arena.snapshot(), hits: arena.takeHits(self), respawn: arena.playerRespawn(self), deployments: arena.playerDeployments(self), ...(report ? { clock: report } : {}), ...(campaign ? { campaign } : {}) });
  function wake() {
    if (!running) return;
    const now = clock.now(); owed += (now - last) / 1000; last = now;
    let steps = 0;
    while (owed >= SIM_TICK - 1e-9 && steps < SIM_MAX_CATCH_UP) { arena.step(SIM_TICK); owed -= SIM_TICK; steps++; }
    // Never spiral: time this host could not keep up with is given up, and reported.
    let droppedMs = 0;
    const lost = Math.floor((owed + 1e-9) / SIM_TICK) * SIM_TICK;
    if (lost > 0) { droppedMs = lost * 1000; owed = Math.max(0, owed - lost); }
    if (steps) port.post(state({ steps, stepMs: clock.now() - now, droppedMs }));
  }
  const stop = clock.every(SIM_TICK * 1000, wake);
  port.listen(message => {
    try {
      if (message.type === 'run') { if (message.running && !running) { last = clock.now(); owed = 0; } running = message.running === true; return; }
      if (message.type !== 'call' || !isPosted(message.method) || !Array.isArray(message.args)) throw new Error('Not a simulation call');
      const value = (arena[message.method] as (...args: unknown[]) => unknown)(...message.args);
      if (SIM_METHODS[message.method] === 'answer' && message.id !== undefined) port.post({ type: 'answer', id: message.id, method: message.method, value });
      if (!QUIET_METHODS.has(message.method)) port.post(state());
    } catch (error) {
      port.post({ type: 'error', method: message.type === 'call' ? String(message.method) : message.type, error: String((error as Error)?.stack ?? error) });
      // Whoever waits on this call is told it did not happen, rather than left waiting.
      if (message.type === 'call' && typeof message.id === 'number' && isPosted(message.method)) port.post({ type: 'answer', id: message.id, method: message.method, value: null });
    }
  });
  return { first: () => state(), wake, dispose: stop };
}
