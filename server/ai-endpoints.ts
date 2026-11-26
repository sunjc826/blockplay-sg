import { parsePilotObservation } from '../src/game/pilot-strategy-contract.ts';
import { observation } from '../src/game/cast-contract.ts';
import { commentary } from './commentary.ts';
import { planPilot } from './pilot-strategy.ts';
import type { Provider } from './llm/types.ts';

import { parseStreamerTurn } from '../src/game/streamer-contract.ts';
import { streamTurn } from './streamer.ts';

interface ModelEndpoint {
  feature: 'PILOT' | 'CAST' | 'STREAMER';
  bodyLimit: number;
  // Parsing creates a bounded model call. The handler executes it only after admission.
  prepare(body: unknown): ((complete: Provider, model: string, pilotBudget: number) => Promise<object>) | null;
}
export const modelEndpoints = new Map<string,ModelEndpoint>([
  ['/api/ai/streamer', {
    feature: 'STREAMER', bodyLimit: 310000,
    prepare(body) {
      const turn = parseStreamerTurn(body);
      return turn && ((complete, model) => streamTurn(turn, complete, model));
    },
  }],
  ['/api/ai/commentary',{
    feature: 'CAST', bodyLimit: 290000,
    prepare(body) {
      const data = observation(body);
      return data && ((complete,model) => commentary(data,complete,model));
    },
  }],
  ['/api/adventure/pilot-plan',{
    feature: 'PILOT', bodyLimit: 65536,
    prepare(body) {
      const data = parsePilotObservation(body && typeof body === 'object' && 'observation' in body ? body.observation : null);
      return data && (async (complete,model,pilotBudget) => ({plan:await planPilot(data,complete,model,pilotBudget)}));
    },
  }],
]);
