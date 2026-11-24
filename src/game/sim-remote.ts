import type { ArenaEnvironment, ArenaVehicleOptions } from './arena-rules';
import { createSimClient, type SimClient } from './sim-client';
import type { SimFromHost } from './sim-protocol';
import type { SimCoverRay, SimWorkerInit } from './sim-worker';
import type { WorldZoneId } from './world-zones';
import { getBotDifficulty, subscribeBotDifficulty } from './bot-difficulty-setting';

/** Rebuilt by the worker from its own district: functions, or objects that carry them. */
const REBUILT: ReadonlySet<string> = new Set(['bounds', 'move', 'botDifficulty', 'dropColumnClear', 'proxies', 'levolution']);
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') { const out: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) if (typeof item !== 'function') out[key] = plain(item); return out; }
  return typeof value === 'function' ? undefined : value;
}

/** Starts an expedition's simulation in a worker; rejects if the worker cannot build the district. */
export function createWorkerSimulation(init: { zone: WorldZoneId; spawn?: SimWorkerInit['spawn']; self: string; environment?: ArenaEnvironment; vehicles?: ArenaVehicleOptions; botCount: number; composition?: string }): Promise<SimClient> {
  const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
  const environment: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(init.environment ?? {})) if (!REBUILT.has(key) && typeof value !== 'function') environment[key] = plain(value);
  return new Promise<SimClient>((resolve, reject) => {
    const fail = (reason: string) => { worker.terminate(); reject(new Error(reason)); };
    let handler: ((message: SimFromHost) => void) | null = null, probes = 0;
    const probing = new Map<number, (result: { sight: number[]; bullet: number[]; struck: string[] }) => void>();
    worker.onerror = event => fail(`Simulation worker failed: ${event.message}`);
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'failed') fail(message.error);
      else if (message.type === 'probed') { probing.get(message.id)?.(message); probing.delete(message.id); }
      else if (message.type === 'ready') {
        const client = createSimClient({ post: out => worker.postMessage(out), listen: next => { handler = next; } }, init.self, message.first, message.navigation, init.environment?.proxies);
        const unsubscribe = subscribeBotDifficulty(() => worker.postMessage({ type: 'difficulty', value: getBotDifficulty() }));
        // Development probe: what the worker's own copy of the district answers to these cover rays.
        (globalThis as { blockplaySimCover?: unknown }).blockplaySimCover = (rays: SimCoverRay[]) => new Promise(done => { const id = ++probes; probing.set(id, done); worker.postMessage({ type: 'probe', id, rays }); });
        // For profiling scripts and, later, the performance overlay.
        (globalThis as { blockplaySimStats?: unknown }).blockplaySimStats = Object.assign(client.stats, { buildMs: message.buildMs });
        resolve({ ...client, buildMs: message.buildMs, dispose: () => { unsubscribe(); worker.terminate(); } });
      } else handler?.(message);
    };
    worker.postMessage({ type: 'init', zone: init.zone, spawn: init.spawn, self: init.self, environment, campaign: init.environment?.proxies && { ...init.environment.proxies, favor: { ...init.environment.proxies.favor } }, difficulty: getBotDifficulty(), vehicles: plain(init.vehicles), botCount: init.botCount, composition: init.composition } as SimWorkerInit);
  });
}
