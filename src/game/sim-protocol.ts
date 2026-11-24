import type { createArena, ArenaSnapshot, ArenaShot } from './arena-rules';
import type { PlayerRespawnView } from './player-respawn';
import type { DeploymentPoint } from './expedition-deployment';
import type { ProxyCampaign } from './proxy-operations';

/** The simulation as the runtime drives it, whichever thread it runs on. */
export type Arena = ReturnType<typeof createArena>;

/**
 * How each simulation method crosses to a host on another thread:
 * - `send`: posted; nothing the caller shows depends on the result.
 * - `answer`: posted; the caller gets a provisional result at once and the host's own follows.
 * - `view`: read from the state the host last pushed.
 * - `clock`: the host keeps its own time, so the caller's steps do nothing.
 * - `direct`: test and tooling probes that only a simulation on this thread can serve.
 *
 * Every method must be listed: a new one fails the build here until it is placed.
 */
export const SIM_METHODS = {
  snapshot: 'view', takeHits: 'view', playerRespawn: 'view', playerDeployments: 'view', navigationGraphStatus: 'view',
  step: 'clock',
  boatStatus: 'direct', patrolStatus: 'direct', navigationStatus: 'direct', inFlight: 'direct',
  preparePlayer: 'send', holdPlayerShield: 'send', setPlayerRespawnSeconds: 'send', merlionAction: 'send', facilityAction: 'send',
  addPlayer: 'send', removePlayer: 'send', setInput: 'send', reloadPlayer: 'send', reset: 'send', setPlayerLoadout: 'send',
  setPlayerEquipmentRentals: 'send', setPlayerVitals: 'send', setPlayerSupplies: 'send', setPlayerGrenades: 'send',
  setPlayerHealthMultiplier: 'send', setCombatEvents: 'send', detachVehicle: 'send', callout: 'send', pickupArmor: 'send',
  pickupWeapon: 'send', useSupply: 'send',
  shoot: 'answer', activateStreak: 'answer', configureStreaks: 'answer', setStartingWeapons: 'answer', queuePlayerWeapons: 'answer',
  configureBots: 'answer', vehicleAction: 'answer', vehicleTravel: 'answer', restoreVehicleTravel: 'answer',
  triggerProxyOperation: 'answer', proxyAction: 'answer', choosePlayerRespawn: 'answer', setPlayerAutoRespawn: 'answer',
  setPlayerDeployment: 'answer', throwGrenade: 'answer', triggerLevolution: 'answer', triggerEvent: 'answer',
} as const satisfies Record<keyof Arena, 'send' | 'answer' | 'view' | 'clock' | 'direct'>;
export type SimMethod = keyof Arena;
export const isPosted = (method: string): method is SimMethod =>
  Object.hasOwn(SIM_METHODS, method) && (SIM_METHODS[method as SimMethod] === 'send' || SIM_METHODS[method as SimMethod] === 'answer');
/** Sent many times a second; the next tick's state covers them. */
export const QUIET_METHODS: ReadonlySet<string> = new Set<SimMethod>(['setInput', 'setPlayerVitals', 'holdPlayerShield']);

/** One fixed step, as the runtime's own 50 ms timer takes. */
export const SIM_TICK = .05;
/** A host that fell behind takes at most this many steps on waking, and drops the rest of the time owed. */
export const SIM_MAX_CATCH_UP = 5;

export interface SimClockReport { steps: number; stepMs: number; droppedMs: number }
export type SimToHost =
  | { type: 'call'; method: SimMethod; args: unknown[]; id?: number }
  | { type: 'run'; running: boolean };
export type SimFromHost =
  | { type: 'state'; snapshot: ArenaSnapshot; hits: ArenaShot[];
      /** Hits landed by the other players this host was asked to add (a LAN or public match's guests), by player id. */
      peerHits?: Record<string, ArenaShot[]>; respawn: PlayerRespawnView | null; deployments: DeploymentPoint[]; clock?: SimClockReport;
      /** The expedition's proxy campaign as the host now holds it; it outlives the district, so the caller keeps a copy. */
      campaign?: ProxyCampaign }
  | { type: 'answer'; id: number; method: SimMethod; value: unknown }
  | { type: 'error'; method: string; error: string };
/** Either end of the channel; a worker, or a pair of functions in a test. */
export interface SimPort<Out, In> { post(message: Out): void; listen(handler: (message: In) => void): void }
