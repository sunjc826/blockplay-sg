import { SpeechError, type Speak } from './types.ts';

export function elevenlabs(key: string, fetcher = fetch): Speak {
  return async ({ voiceId, model, text, signal }) => {
    const timeout = AbortSignal.timeout(15000);
    try {
      const res = await fetcher('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '/stream?output_format=mp3_44100_64', {
        method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        const detail = error?.detail;
        if (res.status === 402 || /quota_exceeded|insufficient_credits|out of credits/i.test(String(detail?.status) + ' ' + String(detail?.message))) throw new SpeechError('credits');
        if (res.status === 401 || res.status === 403) throw new SpeechError('forbidden');
        if (res.status === 429) throw new SpeechError('busy');
        throw new SpeechError('upstream');
      }
      const audio = new Uint8Array(await res.arrayBuffer());
      if (!audio.length) throw new SpeechError('upstream');
      return { audio, contentType: 'audio/mpeg', characters: text.length };
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      throw new SpeechError('upstream');
    }
  };
}
