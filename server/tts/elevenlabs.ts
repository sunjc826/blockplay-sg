import { SpeechError, type Speak } from './types.ts';

export function elevenlabs(key: string, fetcher = fetch, baseUrl = 'https://api.elevenlabs.io'): Speak {
  return async ({ voiceId, model, text, signal }) => {
    const timeout = AbortSignal.timeout(15000);
    try {
      const res = await fetcher(baseUrl.replace(/\/$/, '') + '/v1/text-to-speech/' + encodeURIComponent(voiceId) + '/stream?output_format=pcm_24000', {
        // 'manual', not 'error': the Workers runtime throws on redirect 'error'. A redirect is refused below,
        // so the key is never sent on to another host.
        method: 'POST', redirect: 'manual', signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }),
      });
      if (res.status >= 300 && res.status < 400 || res.type === 'opaqueredirect') throw new SpeechError('upstream');
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        const detail = error?.detail;
        if (res.status === 402 || /quota_exceeded|insufficient_credits|out of credits/i.test(String(detail?.status) + ' ' + String(detail?.message))) throw new SpeechError('credits');
        if (res.status === 401 || res.status === 403) throw new SpeechError('forbidden');
        if (res.status === 429) throw new SpeechError('busy');
        throw new SpeechError('upstream');
      }
      if (!res.body) throw new SpeechError('upstream');
      return res.body;
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      throw new SpeechError('upstream');
    }
  };
}
