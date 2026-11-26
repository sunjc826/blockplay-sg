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

// Report accounting even for a failed call or a caption the director will discard as late.
export async function requestCast<T extends CastReply>(endpoint: string, observation: object, signal: AbortSignal,
  account: (result: CastAccounting) => void, fetcher = fetch): Promise<T> {
  const response = await fetcher('/api/ai/'+endpoint, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(observation),
    signal:AbortSignal.any([signal,AbortSignal.timeout(35000)]),
  });
  const body = await response.json();
  if (body.quota) account(body);
  if (!response.ok) {
    const limited = response.status === 429 && Number.isFinite(body.resetsAt);
    const reason = (body.error || 'Cast unavailable')+(limited ? ' · resets at '+castResetTime(body.resetsAt) : '');
    throw new CastFailure(reason,limited ? body.resetsAt : Date.now()+30000,response.status);
  }
  return body;
}
