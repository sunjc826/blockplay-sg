import type { CastReply } from './ai-cast';
import { validPilotPlan, type PilotPlan, type PilotStrategy } from './pilot-strategy-contract';
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

export function streamerPilotStrategy(request: (observation: Readonly<PilotObservation>, signal: AbortSignal) =>
  Promise<Pick<PilotPlan,'goal'|'waypointId'|'sectorId'> & CastReply>, speak: (line:string,ticket?:string) => void, sectorIds:readonly string[] = []): PilotStrategy {
  const captions = new WeakMap<PilotPlan,CastReply>();
  return { id:'streamer', accepted(plan) {
    const line = captions.get(plan);
    if (line?.line) { if (line.ticket) speak(line.line,line.ticket); else speak(line.line); }
  }, async plan(observation,signal) {
    const visible = streamerObservation(observation);
    const reply = await request(visible,signal);
    signal.throwIfAborted();
    const plan = {goal:reply.goal, waypointId:reply.waypointId, sectorId:reply.sectorId, summary:[reply.goal,reply.waypointId,reply.sectorId].filter(Boolean).join(' · ')};
    if (!validPilotPlan(plan,visible,sectorIds)) throw new Error('Invalid streamer plan');
    if (reply.line) captions.set(plan,reply);
    return plan;
  }};
}
