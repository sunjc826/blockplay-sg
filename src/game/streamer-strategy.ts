import { validPilotPlan, type PilotPlan, type PilotStrategy } from './pilot-strategy-contract';
import type { PilotObservation } from './fps-pilot';

export function streamerPilotStrategy(request: (observation: Readonly<PilotObservation>, signal: AbortSignal) =>
  Promise<Pick<PilotPlan,'goal'|'waypointId'> & {line:string|null}>, speak: (line:string) => void): PilotStrategy {
  const captions = new WeakMap<PilotPlan,string>();
  return { id:'streamer', accepted(plan) {
    const line = captions.get(plan);
    if (line) speak(line);
  }, async plan(observation,signal) {
    const reply = await request(observation,signal);
    signal.throwIfAborted();
    const plan = {goal:reply.goal, waypointId:reply.waypointId, summary:[reply.goal,reply.waypointId].filter(Boolean).join(' · ')};
    if (!validPilotPlan(plan,observation)) throw new Error('Invalid streamer plan');
    if (reply.line) captions.set(plan,reply.line);
    return plan;
  }};
}
