import type { CastReply } from './ai-cast';
import { validPilotPlan, type PilotPlan, type PilotStrategy, type RememberedPlace } from './pilot-strategy-contract';
import type { PilotObservation } from './fps-pilot';

/** Preserve selectable exits when a crowded district exceeds the wire contract. */
export function streamerObservation(o: Readonly<PilotObservation>): PilotObservation {
  const distance = (w:{x:number;z:number}) => Math.hypot(w.x-o.position.x,w.z-o.position.z);
  return {...o,
    contacts:o.contacts.length > 20 ? [...o.contacts].sort((a,b) => a.distance-b.distance).slice(0,20) : o.contacts,
    waypoints:o.waypoints.length > 40 ? [...o.waypoints].sort((a,b) =>
      Number(b.kind === 'checkpoint')-Number(a.kind === 'checkpoint') || distance(a)-distance(b)).slice(0,40) : o.waypoints,
    grenades:o.grenades && o.grenades.length > 24 ? [...o.grenades].sort((a,b) => distance(a)-distance(b)).slice(0,24) : o.grenades,
  };
}

export type StreamerDecision = Pick<PilotPlan,'goal'|'waypointId'|'sectorId'|'placeId'> & CastReply & {place?:RememberedPlace};
export function streamerPilotStrategy(request: (observation: Readonly<PilotObservation>, signal: AbortSignal, current?:PilotPlan|null, target?:RememberedPlace) =>
  Promise<StreamerDecision>, speak: (line:string,audio?:CastReply['audio']) => void, sectorIds:readonly string[] = []): PilotStrategy {
  const captions = new WeakMap<PilotPlan,CastReply>();
  const places = new WeakMap<PilotPlan,RememberedPlace>();
  return { rememberedPlace:plan => places.get(plan), id:'streamer', accepted(plan) {
    const line = captions.get(plan);
    if (line?.line) { if (line.audio) speak(line.line,line.audio); else speak(line.line); }
  }, async plan(observation,signal,current) {
    const visible = streamerObservation(observation);
    const reply = await request(visible,signal,current,current ? places.get(current) : undefined);
    signal.throwIfAborted();
    const point = reply.place;
    if (point && (!reply.placeId || point.id !== reply.placeId || !sectorIds.includes(point.sectorId) ||
      !point.name || ![point.x,point.z,point.y ?? 0].every(Number.isFinite))) throw new Error('Invalid remembered place');
    const plan = {goal:reply.goal, waypointId:reply.waypointId, sectorId:reply.sectorId, placeId:reply.placeId, summary:[reply.goal,reply.waypointId,reply.sectorId,reply.placeId].filter(Boolean).join(' · ')};
    if (!validPilotPlan(plan,visible,sectorIds,point ? [point.id] : [])) throw new Error('Invalid streamer plan');
    if (point) places.set(plan,point);
    if (reply.line) captions.set(plan,reply);
    return plan;
  }};
}
