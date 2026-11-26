import { it, expect, vi } from 'vitest';
import { elevenlabs } from './elevenlabs.ts';
import { selectSpeech } from './index.ts';

const request = {voiceId:'nPczCjzI2devNBz1zQrb',model:'eleven_flash_v2_5',text:'Nice one.'};
it('sends only the line and model with one authenticated streaming PCM request',async () => {
  const fetcher = vi.fn(async (_url:RequestInfo | URL,_init?:RequestInit) => new Response(new Uint8Array([11,22])));
  const result = await elevenlabs('test',fetcher)(request);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url,init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/'+request.voiceId+'/stream?output_format=pcm_24000');
  expect(init).toMatchObject({method:'POST',redirect:'manual',headers:{'xi-api-key':'test','Content-Type':'application/json'},signal:expect.any(AbortSignal)});
  expect(JSON.parse(String(init?.body))).toEqual({text:request.text,model_id:request.model});
  expect(result).toBeInstanceOf(ReadableStream);
  expect((await result.getReader().read()).value).toEqual(new Uint8Array([11,22]));
});
it.each([[401,'invalid_api_key','forbidden'],[401,'quota_exceeded','credits'],[402,'','credits'],
  [429,'too_many_concurrent_requests','busy'],[500,'','upstream']] as const)('classifies %d %s without retry',async (status,detail,kind) => {
  const fetcher = vi.fn(async () => Response.json({detail:{status:detail}},{status}));
  await expect(elevenlabs('test',fetcher)(request)).rejects.toMatchObject({kind});
  expect(fetcher).toHaveBeenCalledOnce();
});
it('never retries an ambiguous network failure',async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('connection interrupted'));
  await expect(elevenlabs('test',fetcher)(request)).rejects.toMatchObject({kind:'upstream'});
  expect(fetcher).toHaveBeenCalledOnce();
});
it('uses only valid overrides for existing personas and requires a configured provider',() => {
  expect(selectSpeech({})).toBeNull();
  expect(selectSpeech({CAST_VOICE_PROVIDER:'unknown',ELEVENLABS_API_KEY:'test'})).toBeNull();
  const speech = selectSpeech({ELEVENLABS_API_KEY:'test',CAST_VOICE_IDS:JSON.stringify({coach:'x',parent:request.voiceId,other:request.voiceId})})!;
  expect(speech.ids.size).toBe(7);
  expect(speech.model).toBe(request.model);
  // An invalid override leaves the persona on its designed default.
  expect(speech.ids.get('coach')).toBe('6ddcdervgn4Jgwb7r7pA'); expect(speech.ids.get('parent')).toBe(request.voiceId);
  expect(speech.ids.has('other')).toBe(false);
});
it('refuses a redirect instead of following it with the key, and never asks for redirect "error"',async () => {
  // The Workers runtime throws a TypeError for redirect 'error', which made every live voice request fail.
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(new URL('./elevenlabs.ts',import.meta.url),'utf8')).not.toMatch(/redirect:\s*'error'/);
  const moved = elevenlabs('test',async () => new Response(null,{status:302,headers:{Location:'https://elsewhere.example/'}}));
  await expect(moved(request)).rejects.toMatchObject({kind:'upstream'});
});

it('returns after headers, even if the stand-in has not produced a sample yet',async () => {
  const body = new ReadableStream<Uint8Array>();
  const fetcher = vi.fn(async () => new Response(body));
  const speech = selectSpeech({ELEVENLABS_API_KEY:'test',ELEVENLABS_BASE_URL:'http://localhost:4567/'}, fetcher)!;
  expect(await speech.speak(request)).toBe(body);
  expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/^http:\/\/localhost:4567\/v1\//), expect.anything());
  await body.cancel();
});
