import { localPilotPlanner, type PilotObservation, type PilotPlanner } from './fps-pilot';
import { validPilotPlan, type PilotPlan, type PilotStrategy, type RememberedPlace } from './pilot-strategy-contract';
import { containsPoint } from './pilot-sector';
import type { ZoneSector } from './zone-sectors';
import type { Position2D } from './region-collision';

interface SectorTravel {
  sectors:readonly ZoneSector[];
  placePoint?(place:RememberedPlace):Position2D | null;
  height?():number;
  approach?(target:Position2D & {y?:number}):{next():Position2D;blocked():void};
  point(sector:ZoneSector, from:Position2D):Position2D | null;
}
export const localPilotStrategy: PilotStrategy = {
  id: 'local', async plan(o) { return { goal: localPilotPlanner.chooseGoal(o), waypointId: null, summary: 'Local utility planner' }; },
};
export function llmPilotStrategy(fetcher: typeof fetch = (...args) => fetch(...args)): PilotStrategy {
  return { id: 'llm', async plan(observation, signal) {
    const response = await fetcher('/api/adventure/pilot-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observation }), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) throw new Error(response.status === 503 ? 'Server API key required' : response.status === 404 ? 'Restart companion server' : 'Strategy service unavailable');
    const { plan } = await response.json();
    if (!validPilotPlan(plan, observation)) throw new Error('Invalid strategy response');
    return plan;
  } };
}

/** Async strategy plugins never block the action loop. Plans expire and late replies are discarded. */
export function createStrategyPlanner(strategy: PilotStrategy, now: () => number = () => performance.now(), travel?:SectorTravel) {
  let current: PilotPlan | null = null, nextAt = 0, generation = 0, acceptedAt = 0;
  const sectors = strategy.id === 'streamer' ? travel?.sectors ?? [] : [];
  const ids = sectors.map(s => s.id);
  let destination: {sector:ZoneSector;name:string;place?:RememberedPlace;point:Position2D & {y?:number};route?:ReturnType<NonNullable<SectorTravel['approach']>>} | null = null;
  let earliest = 0;
  let request: AbortController | null = null, description = 'Local fallback · awaiting strategy';
  let latest: PilotObservation | null = null;
  const planner: PilotPlanner & { status(): string; reset(): void; replan(): void } = {
    chooseGoal(observation) {
      if (strategy.id === 'streamer' && !observation.alive && (current || request)) planner.reset();
      if (destination && (destination.place
        ? Math.hypot(destination.point.x-observation.position.x,destination.point.z-observation.position.z) <= 1.4 &&
          (destination.point.y === undefined || Math.abs((travel?.height?.() ?? 0)-destination.point.y) < .8)
        : containsPoint(destination.sector.bounds,observation.position))) {
        const arrived = destination.name;
        planner.reset(); // Ignore an answer based on the unfinished walk.
        description = 'Arrived in '+arrived;
      }
      latest = observation;
      if (current && (!destination && now() - acceptedAt > 20000 || current.waypointId && !observation.waypoints.some(w => w.id === current!.waypointId))) {
        current = null; description = 'Plan finished or expired · local fallback';
      }
      if (!request && now() >= nextAt && observation.alive) {
        const ticket = generation, controller = new AbortController(); request = controller; earliest = now()+3000; nextAt = now() + 10000;
        description = current ? 'Replanning · ' + (destination?.name ?? current.summary) : 'Planning · local fallback active';
        void strategy.plan(structuredClone(observation), controller.signal,current).then(plan => {
          if (ticket !== generation || controller.signal.aborted) return;
          const place = strategy.id === 'streamer' ? strategy.rememberedPlace?.(plan) : undefined;
          if (!latest || !validPilotPlan(plan, latest, ids,place ? [place.id] : [])) throw new Error('Strategy waypoint no longer available');
          const sector = sectors.find(s => s.id === (place?.sectorId ?? plan.sectorId));
          if (place && (!sector || !containsPoint(sector.bounds,place))) throw new Error('Invalid place sector');
          if (sector && (destination?.sector !== sector || destination.place?.id !== place?.id)) {
            const point = place ? travel?.placePoint?.(place) : travel?.point(sector,latest.position);
            if (!point) throw new Error('Sector outside walkable play area');
            destination = {sector,place,name:place?.name ?? sector.name,point,route:travel?.approach?.(point)};
            if (place?.y !== undefined) destination.route?.blocked();
          } else if (!sector) destination = null;
          current = plan; acceptedAt = now();
          description = destination ? 'Heading to '+destination.name : plan.summary;
          strategy.accepted?.(plan);
        }).catch(error => {
          controller.abort(); // Discard any audio attached to a rejected decision.
          if (ticket !== generation) return;
          if (destination) { description = 'Continuing to '+destination.name; return; }
          current = null; description = `${error instanceof Error ? error.message : 'Strategy unavailable'} · local fallback`;
        }).finally(() => { if (ticket === generation) request = null; });
      }
      return current?.goal ?? localPilotPlanner.chooseGoal(observation);
    },
    blocked: () => destination?.route?.blocked(),
    preferredSector: () => destination && {...(destination.route?.next() ?? destination.point),name:destination.name},
    preferredWaypoint: () => current?.waypointId ?? null,
    status: () => description,
    replan() { nextAt = Math.min(nextAt, earliest); },
    reset() { generation++; request?.abort(); request = null; current = null; destination = null; latest = null; nextAt = strategy.id === 'streamer' ? earliest : 0; description = 'Local fallback · awaiting strategy'; },
  };
  return planner;
}
