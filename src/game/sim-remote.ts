import type { ArenaEnvironment, ArenaVehicleOptions } from './arena-rules';
import { createSimClient, type SimClient } from './sim-client';
import type { SimFromHost } from './sim-protocol';
import type { SimCoverRay, SimWorkerInit, SimWorldSpec } from './sim-worker';
import { getBotDifficulty, subscribeBotDifficulty } from './bot-difficulty-setting';

/** Rebuilt by the worker from its own district: functions, or objects that carry them. */
const REBUILT: ReadonlySet<string> = new Set(['bounds', 'move', 'botDifficulty', 'dropColumnClear', 'proxies', 'levolution']);
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') { const out: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) if (typeof item !== 'function') out[key] = plain(item); return out; }
  return typeof value === 'function' ? undefined : value;
}

/** A district build on a slow phone takes a while; past this the worker is taken as stuck. */
const START_LIMIT_MS = 45_000;
/** A running host reports twenty times a second; this many silent seconds in a row and it is taken as lost. */
const SILENT_SECONDS = 4;

/**
 * Starts a solo game's simulation in a worker. Rejects if the worker cannot be made, cannot build the
 * district, or does not answer in time. Once started, a worker that fails or falls silent while it should be
 * stepping is terminated and reported through `onLost`.
 */
export function createWorkerSimulation(init: { world: SimWorldSpec; props?: SimWorkerInit['props'];
  /** A match with guests plays at one difficulty for everyone, whatever this player's own setting. */
  fixedDifficulty?: SimWorkerInit['difficulty']; self: string; environment?: ArenaEnvironment; vehicles?: ArenaVehicleOptions; botCount: number; composition?: string; vehicleTravel?: SimWorkerInit['vehicleTravel'] }): Promise<SimClient> {
  return new Promise<SimClient>((resolve, reject) => {
    const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
    const environment: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(init.environment ?? {})) if (!REBUILT.has(key) && typeof value !== 'function') environment[key] = plain(value);
    let started = false, running = false, heard = false, silent = 0, lostFor: string | null = null, tellLost: ((reason: string) => void) | null = null;
    let unsubscribe = () => {};
    const stop = () => { clearTimeout(startTimer); clearInterval(watchdog); unsubscribe(); worker.terminate(); };
    const fail = (reason: string) => {
      stop();
      if (!started) reject(new Error(reason));
      else if (lostFor === null) { lostFor = reason; tellLost?.(reason); }
    };
    const startTimer = setTimeout(() => fail('Simulation worker did not start in time'), START_LIMIT_MS);
    // Counted in whole ticks rather than by the clock: after the page itself froze, a tick can run before the
    // host's queued reports are delivered, and one late tick must not read as seconds of silence.
    const watchdog = setInterval(() => {
      if (!started || !running || (typeof document !== 'undefined' && document.hidden) || heard) { heard = false; silent = 0; return; }
      if (++silent >= SILENT_SECONDS) fail('Simulation worker stopped answering');
    }, 1000);
    let handler: ((message: SimFromHost) => void) | null = null, probes = 0;
    const probing = new Map<number, (result: unknown) => void>();
    worker.onerror = event => fail(`Simulation worker failed: ${event.message || 'it could not be loaded'}`);
    worker.onmessageerror = () => fail('Simulation worker sent a message that could not be read');
    worker.onmessage = event => {
      const message = event.data; heard = true;
      if (message.type === 'failed') fail(message.error);
      else if (message.type === 'probed') { probing.get(message.id)?.(message); probing.delete(message.id); }
      else if (message.type === 'ready') {
        if (started) return;
        started = true; clearTimeout(startTimer);
        const client = createSimClient({ post: out => worker.postMessage(out), listen: next => { handler = next; } }, init.self, message.first, message.navigation, init.environment?.proxies);
        if (!init.fixedDifficulty) unsubscribe = subscribeBotDifficulty(() => worker.postMessage({ type: 'difficulty', value: getBotDifficulty() }));
        if (import.meta.env.DEV) {
          // Development probe: what the worker's own copy of the district answers to these cover rays.
          (globalThis as { blockplaySimCover?: unknown }).blockplaySimCover = (rays: SimCoverRay[]) => new Promise(done => { const id = ++probes; probing.set(id, done); worker.postMessage({ type: 'probe', id, rays }); });
          // Development probe: hold the simulation still, so both copies can be asked at the same instant.
          (globalThis as { blockplaySimRun?: unknown }).blockplaySimRun = (on: boolean) => { running = on; client.setRunning(on); };
          // Development probe: end the worker as a crash would, to try the way back to the main thread.
          (globalThis as { blockplaySimKill?: unknown }).blockplaySimKill = (silently = false) => { if (silently) worker.terminate(); else fail('Simulation worker ended by the development probe'); };
        }
        // For profiling scripts; the performance overlay reads the same numbers (perf-overlay.ts).
        (globalThis as { blockplaySimStats?: unknown }).blockplaySimStats = Object.assign(client.stats, { buildMs: message.buildMs });
        resolve({ ...client, buildMs: message.buildMs,
          setRunning: on => { running = on; heard = true; client.setRunning(on); },
          onLost: next => { tellLost = next; if (lostFor !== null) next(lostFor); },
          dispose: stop });
      } else handler?.(message);
    };
    try {
      worker.postMessage({ type: 'init', world: init.world, props: init.props, self: init.self, environment, campaign: init.environment?.proxies && { ...init.environment.proxies, favor: { ...init.environment.proxies.favor } }, difficulty: init.fixedDifficulty ?? getBotDifficulty(), vehicles: plain(init.vehicles), botCount: init.botCount, composition: init.composition, vehicleTravel: init.vehicleTravel } as SimWorkerInit);
    } catch (error) { fail(`Simulation worker could not be given the district: ${String(error)}`); }
  });
}
