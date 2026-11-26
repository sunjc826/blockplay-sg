import { readCastStream } from './cast-stream';
import { CAST_CONTENT_TYPE } from '../game/cast-wire';
import { CastFailure } from '../game/ai-cast';
import type { CastReply } from '../game/ai-cast';

export interface CastQuota { used: number; limit: number; resetsAt: number }
export interface CastVoiceStatus { available: boolean; quota: CastQuota; remaining: number; reason?: string }
export interface CastAccounting {
  quota: CastQuota;
  voice?: CastVoiceStatus;
  usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  costUsd?: number;
}
export const castResetTime = (at: number) => new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

const TRANSIENT_RETRIES = 3, TRANSIENT_WAIT_MAX = 5000;
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve,reject) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort',stop); };
    const stop = () => { done(); reject(signal.reason); };
    const timer = setTimeout(() => { done(); resolve(); },ms);
    if (signal.aborted) stop(); else signal.addEventListener('abort',stop);
  });
}
// Report accounting even for a failed call or a caption the director will discard as late.
export async function requestCast<T extends CastReply>(endpoint: string, observation: object, signal: AbortSignal,
  account: (result: CastAccounting) => void, fetcher = fetch, speech?: () => AbortSignal | undefined): Promise<T> {
  let response: Response, body;
  let legacy = false;
  for (let attempt = 0; ; attempt++) {
    const permission = !legacy ? speech?.() : undefined;
    const spoken = permission && !permission.aborted;
    const audioAbort = new AbortController();
    response = await fetcher('/api/ai/'+endpoint, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spoken ? {...observation,spoken:true} : observation),
      signal:AbortSignal.any([signal,audioAbort.signal,AbortSignal.timeout(35000)]),
    });
    if (response.headers.get('content-type')?.split(';')[0] === CAST_CONTENT_TYPE) {
      const reply = await readCastStream(response,audioAbort);
      body = reply.body;
      if (!spoken || permission.aborted || signal.aborted || !speech?.()) reply.audio.cancel();
      else {
        // Losing playback permission cancels only the audio portion, even if
        // the menu is still waiting to show the caption.
        AbortSignal.any([permission,signal]).addEventListener('abort',reply.audio.cancel,{once:true,signal:audioAbort.signal});
        body.audio = reply.audio;
      }
    } else body = await response.json();
    // A previous server rejects the optional field before admission.
    if (spoken && response.status === 400 && body.error === 'Invalid game observation') {
      legacy = true;
      continue;
    }
    if (body.quota) account(body);
    // "Too many at once" clears as soon as an earlier call returns: wait a moment and ask again.
    if (response.status !== 429 || body.transient !== true || attempt >= TRANSIENT_RETRIES) break;
    await pause(Math.min(TRANSIENT_WAIT_MAX,Math.max(1000,Number(body.resetsAt)-Date.now() || 0)),signal);
  }
  if (!response.ok) {
    if (response.status === 429 && body.transient === true) throw new CastFailure(body.error || 'Cast busy',Date.now()+TRANSIENT_WAIT_MAX,429,true);
    const limited = response.status === 429 && Number.isFinite(body.resetsAt);
    const reason = (body.error || 'Cast unavailable')+(limited ? ' · resets at '+castResetTime(body.resetsAt) : '');
    throw new CastFailure(reason,limited ? body.resetsAt : Date.now()+30000,response.status);
  }
  return body;
}
