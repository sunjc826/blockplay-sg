import type { CastReply } from './ai-cast';
import { validPilotPlan, type PilotPlan, type PilotStrategy } from './pilot-strategy-contract';
import type { PilotObservation } from './fps-pilot';

export function streamerPilotStrategy(request: (observation: Readonly<PilotObservation>, signal: AbortSignal) =>
  Promise<Pick<PilotPlan,'goal'|'waypointId'> & CastReply>, speak: (line:string,ticket?:string) => void): PilotStrategy {
  const captions = new WeakMap<PilotPlan,CastReply>();
  return { id:'streamer', accepted(plan) {
    const line = captions.get(plan);
    if (line?.line) { if (line.ticket) speak(line.line,line.ticket); else speak(line.line); }
  }, async plan(observation,signal) {
    const reply = await request(observation,signal);
    signal.throwIfAborted();
    const plan = {goal:reply.goal, waypointId:reply.waypointId, summary:[reply.goal,reply.waypointId].filter(Boolean).join(' · ')};
    if (!validPilotPlan(plan,observation)) throw new Error('Invalid streamer plan');
    if (reply.line) captions.set(plan,reply);
    return plan;
  }};
}
