import { COMMENTATOR_FRAME, LANGUAGE_RULES, castPersona } from '../src/game/ai-cast-personas.ts';
import { renderPlaceCard } from '../src/data/place-cards.ts';
import { REGION_NAMES } from '../src/game/region-ids.ts';
import type { Observation } from '../src/game/cast-contract.ts';
import { estimate } from './llm/index.ts';
import type { Provider } from './llm/types.ts';

/** A caption as shown: one line, capped, without the stray closing bracket or quote a model sometimes leaves after structured output. */
export function tidyLine(raw: string) {
  let line = raw.trim().replace(/\s+/g,' ').slice(0,240).trim();
  for (const [open,close] of [['{','}'],['(',')'],['[',']']]) while (line.endsWith(close) && line.split(open).length <= line.split(close).length - 1) line = line.slice(0,-1).trim();
  if (line.endsWith('"') && (line.split('"').length - 1) % 2) line = line.slice(0,-1).trim();
  return line;
}

export async function commentary(o: Observation, complete: Provider, model: string) {
  const persona = castPersona(o.personaId)!, district = REGION_NAMES[o.regionId];
  const result = await complete({ model, effort: 'low', maxOutputTokens: 2000, schemaName: 'commentary',
    schema: { type: 'object', properties: { say: { type: 'boolean' }, line: { type: 'string' } }, required: ['say','line'], additionalProperties: false },
    system: [COMMENTATOR_FRAME,persona.voice,LANGUAGE_RULES[o.clean ? 'clean' : persona.language],renderPlaceCard(o.regionId,district)],
    user: 'Lines already said (oldest first)\n'+JSON.stringify(o.memory)+'\nEvents since last line\n'+JSON.stringify(o.events)+'\nCurrent snapshot\n'+JSON.stringify({mode:o.mode,district,...o.snapshot}),
    image: o.frame ? {mediaType:'image/jpeg',base64:o.frame} : undefined });
  const caption = result.json;
  if (caption !== null && (typeof caption !== 'object' || !('say' in caption) || typeof caption.say !== 'boolean' || !('line' in caption) || typeof caption.line !== 'string' || Object.keys(caption).length !== 2)) throw new Error('Invalid caption');
  const line = caption?.say && typeof caption.line === 'string' ? tidyLine(caption.line) : '';
  return { line: line || null, usage: result.usage, costUsd: estimate(model,result.usage) };
}
