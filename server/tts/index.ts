import type { Env } from '../llm/index.ts';
import { elevenlabs } from './elevenlabs.ts';
import { voiceTickets } from './tickets.ts';

const registry = new Map([['elevenlabs', { key: 'ELEVENLABS_API_KEY', model: 'eleven_flash_v2_5', create: elevenlabs }]]);
const defaults = {
  coach: 'nPczCjzI2devNBz1zQrb', parent: 'Xb7hH8MSUJpSbSDYk0k2', duo: 'FGY2WhTYpPnrIDTdsKH5',
  comic: 'IKne3meq5aSn9XLyUdCD', pro: 'TX3LPaxmHKxFdv7VOQHJ', rager: 'N2lVS1w4EtoT3dr4eOWO',
  'comic-streamer': 'bIHbv24MWmeRgasZH58o',
};
export function selectSpeech(env: Env, fetcher = fetch) {
  const provider = registry.get(env.CAST_VOICE_PROVIDER?.trim() || 'elevenlabs');
  const key = provider && env[provider.key]?.trim();
  if (!provider || !key) return null;
  const ids = new Map(Object.entries(defaults));
  try {
    for (const [persona, id] of Object.entries(JSON.parse(env.CAST_VOICE_IDS || '{}'))) {
      if (ids.has(persona) && typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id)) ids.set(persona, id);
    }
  } catch { /* Use the built-in cast when the optional override is malformed. */ }
  return { ids, model: env.CAST_VOICE_MODEL?.trim() || provider.model, speak: provider.create(key, fetcher), tickets: voiceTickets(key) };
}
