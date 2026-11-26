import type { Env } from '../llm/index.ts';
import { elevenlabs } from './elevenlabs.ts';

const registry = new Map([['elevenlabs', { key: 'ELEVENLABS_API_KEY', model: 'eleven_flash_v2_5', create: elevenlabs }]]);
// Singaporean voices designed for each persona (scripts/cast-voice-audition.mjs, saved with
// cast-voice-save.mjs). They live in the owner's ElevenLabs account, so another account must
// set CAST_VOICE_IDS; ElevenLabs' stock voices work anywhere but have no local accent:
// coach nPczCjzI2devNBz1zQrb, parent Xb7hH8MSUJpSbSDYk0k2, duo FGY2WhTYpPnrIDTdsKH5,
// comic IKne3meq5aSn9XLyUdCD, pro TX3LPaxmHKxFdv7VOQHJ, rager N2lVS1w4EtoT3dr4eOWO,
// comic-streamer bIHbv24MWmeRgasZH58o.
const defaults = {
  coach: '6ddcdervgn4Jgwb7r7pA', parent: 'THIEoRRIzoJHuswdBZhN', duo: 'cRRdmE4jGLKP8vgCVNkd',
  comic: 'G7auguKPw1C9Ps4B2b2s', pro: 'HZqWDUYcn9oC7l62elTu', rager: 'nVu7gJasBmHjRxFGA5ZU',
  'comic-streamer': 'cKyCoBLjM7ZwtKPTZlOa',
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
  return { ids, model: env.CAST_VOICE_MODEL?.trim() || provider.model, speak: provider.create(key, fetcher, env.ELEVENLABS_BASE_URL?.trim() || undefined) };
}
