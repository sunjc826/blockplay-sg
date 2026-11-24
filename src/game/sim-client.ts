import type { ArenaShot, ArenaSnapshot } from './arena-rules';
import type { PlayerRespawnView } from './player-respawn';
import type { DeploymentPoint } from './expedition-deployment';
import type { ProxyCampaign } from './proxy-operations';
import { SIM_METHODS, type Arena, type SimClockReport, type SimFromHost, type SimMethod, type SimPort, type SimToHost } from './sim-protocol';

export interface SimClientStats { states: number; steps: number; stepMs: number; maxStepMs: number; droppedMs: number; calls: number; errors: string[] }
/** A simulation hosted elsewhere, standing where the runtime's own would. */
export interface SimClient {
  arena: Arena;
  /** The host steps only between `setRunning(true)` and `setRunning(false)`. */
  setRunning(running: boolean): void;
  /** The host's own result for the `answer` call just made on `arena`. */
  lastAnswer(): Promise<unknown>;
  stats: SimClientStats;
  /** How long the host took to build its district, when it built one. */
  buildMs?: number;
  /** Called once if the host is lost after it started; nothing asked of it afterwards is answered. */
  onLost?(handler: (reason: string) => void): void;
  dispose?(): void;
}
/** Functions cannot be posted; anything carrying one is sent without it. */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') { const out: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) if (typeof item !== 'function') out[key] = plain(item); return out; }
  return typeof value === 'function' ? undefined : value;
}

/**
 * `first` is the host's state before anything was asked of it, so the runtime
 * can be built synchronously as it is around a simulation of its own.
 * `campaign` is the caller's own campaign object, kept equal to the host's.
 */
export function createSimClient(port: SimPort<SimToHost, SimFromHost>, self: string, first: Extract<SimFromHost, { type: 'state' }>, navigation: ReturnType<Arena['navigationGraphStatus']>, campaign?: ProxyCampaign): SimClient {
  let snapshot: ArenaSnapshot = first.snapshot, respawn: PlayerRespawnView | null = first.respawn, deployments: DeploymentPoint[] = first.deployments;
  const hits: ArenaShot[] = [...first.hits];
  const stats: SimClientStats = { states: 0, steps: 0, stepMs: 0, maxStepMs: 0, droppedMs: 0, calls: 0, errors: [] };
  const waiting = new Map<number, (value: unknown) => void>();
  let sequence = 0, latest: Promise<unknown> = Promise.resolve(undefined);
  const count = (clock: SimClockReport) => { stats.steps += clock.steps; stats.stepMs += clock.stepMs; stats.maxStepMs = Math.max(stats.maxStepMs, clock.stepMs); stats.droppedMs += clock.droppedMs; };
  port.listen(message => {
    if (message.type === 'state') {
      snapshot = message.snapshot; respawn = message.respawn; deployments = message.deployments; hits.push(...message.hits);
      if (campaign && message.campaign) Object.assign(campaign, message.campaign);
      stats.states++; if (message.clock) count(message.clock);
    } else if (message.type === 'answer') { waiting.get(message.id)?.(message.value); waiting.delete(message.id); }
    else if (message.type === 'error') { if (stats.errors.length < 20) stats.errors.push(`${message.method}: ${message.error}`); console.error('Simulation host:', message.method, message.error); }
  });
  function post(method: SimMethod, args: unknown[], id?: number) {
    stats.calls++;
    const message: SimToHost = { type: 'call', method, args, ...(id === undefined ? {} : { id }) };
    try { port.post(message); } catch { port.post({ ...message, args: plain(args) as unknown[] }); }
  }
  /** What the caller is told before the host has answered. */
  const provisional: Partial<Record<SimMethod, (...args: never[]) => unknown>> = {
    shoot: (): ArenaShot => ({ hitId: null, killed: false, damage: 0 }),
    // Needs the crew this very call: a vehicle cannot yet carry its riders to the next district from here.
    vehicleTravel: () => null,
    triggerLevolution: () => null, triggerEvent: () => null,
    setPlayerDeployment: (_id: string, point: string) => deployments.some(p => p.id === point && p.available !== false),
    choosePlayerRespawn: (_id: string, zone: string) => !!respawn?.zones.some(z => z.id === zone && z.available),
  };
  const views: Partial<Record<SimMethod, (...args: never[]) => unknown>> = {
    snapshot: () => snapshot, takeHits: (id: string) => id === self ? hits.splice(0) : [],
    playerRespawn: () => respawn, playerDeployments: () => deployments, navigationGraphStatus: () => navigation,
  };
  const arena: Record<string, (...args: never[]) => unknown> = {};
  for (const [method, kind] of Object.entries(SIM_METHODS) as [SimMethod, typeof SIM_METHODS[SimMethod]][]) {
    arena[method] = kind === 'view' ? views[method]!
      : kind === 'clock' ? () => {}
      : kind === 'direct' ? () => { throw new Error(`${method} is only available from a simulation on this thread`); }
      : kind === 'send' ? (...args: unknown[]) => { post(method, args); return true; }
      : (...args: unknown[]) => {
        const id = ++sequence;
        latest = new Promise(resolve => waiting.set(id, resolve));
        post(method, args, id);
        return provisional[method] ? (provisional[method] as (...args: unknown[]) => unknown)(...args) : true;
      };
  }
  return { arena: arena as unknown as Arena, setRunning: running => port.post({ type: 'run', running }), lastAnswer: () => latest, stats };
}
