import { STREAMER_FRAME, LANGUAGE_RULES, castPersona } from '../src/game/ai-cast-personas.ts';
import { renderPlaceCard } from '../src/data/place-cards.ts';
import { REGION_NAMES } from '../src/game/region-ids.ts';
import { record, only } from '../src/game/cast-contract.ts';
import { PILOT_GOALS, validPilotPlan } from '../src/game/pilot-strategy-contract.ts';
import type { MenuTurn, PlayTurn } from '../src/game/streamer-contract.ts';
import { estimate } from './llm/index.ts';
import { tidyLine } from './commentary.ts';
import type { Provider } from './llm/types.ts';

export async function streamTurn(turn: PlayTurn | MenuTurn, complete: Provider, model: string) {
  const persona = castPersona(turn.personaId)!;
  const play = turn.phase === 'play';
  const choices = play ? turn.observation.waypoints.map(w => w.id) : turn.screen.actions.filter(a => a.state !== 'disabled').map(a => a.id);
  const properties = {
    ...(play ? { goal: {type:'string',enum:PILOT_GOALS}, waypointId: choices.length
      ? {anyOf:[{type:'string',enum:choices},{type:'null'}]} : {type:'null'} } : {actionId:{type:'string',enum:choices}}),
    say:{type:'boolean'}, line:{type:'string'},
  };
  const region = play ? turn.regionId : '';
  const result = await complete({ model, effort:'low', maxOutputTokens:2000, schemaName:'streamer_'+turn.phase,
    schema:{type:'object', additionalProperties:false, properties, required:Object.keys(properties)},
    system:[STREAMER_FRAME,persona.voice,LANGUAGE_RULES[turn.clean ? 'clean' : persona.language],
      play ? renderPlaceCard(region,REGION_NAMES[turn.regionId]) : 'Where you are: in the game\'s menus, not yet in a district.'],
    user:'Lines already said (oldest first)\n'+JSON.stringify(turn.memory)+'\nWhat happened\n'+JSON.stringify(play ? turn.events : turn.note)+
      (play ? '\nPilot observation\n'+JSON.stringify({mode:turn.mode,regionId:region,...turn.observation})
        : '\nCurrent screen and budget\n'+JSON.stringify({screen:turn.screen,wallet:turn.wallet})),
    image:play && turn.frame ? {mediaType:'image/jpeg',base64:turn.frame} : undefined,
  });
  const reply = result.json;
  if (!record(reply) || !only(reply,Object.keys(properties)) || typeof reply.say !== 'boolean' || typeof reply.line !== 'string') throw new Error('Invalid streamer reply');
  if (play ? !validPilotPlan({...reply,summary:String(reply.goal)},turn.observation) : !choices.includes(reply.actionId as string)) throw new Error('Invalid streamer decision');
  const line = !result.refused && reply.say ? tidyLine(reply.line) : '';
  return {...(play ? {goal:reply.goal,waypointId:reply.waypointId} : {actionId:reply.actionId}), say:!!line, line:line || null,
    usage:result.usage, costUsd:estimate(model,result.usage)};
}
