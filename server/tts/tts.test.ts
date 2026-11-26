import { it, expect, vi } from 'vitest';
import { elevenlabs } from './elevenlabs.ts';
import { selectSpeech } from './index.ts';
import { voiceTickets } from './tickets.ts';

const request = {voiceId:'nPczCjzI2devNBz1zQrb',model:'eleven_flash_v2_5',text:'Nice one.'};
it('sends only the line and model with one authenticated MP3 request',async () => {
  const fetcher = vi.fn(async (_url:RequestInfo | URL,_init?:RequestInit) => new Response(new Uint8Array([11,22])));
  const result = await elevenlabs('test',fetcher)(request);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url,init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/'+request.voiceId+'/stream?output_format=mp3_44100_64');
  expect(init).toMatchObject({method:'POST',redirect:'error',headers:{'xi-api-key':'test','Content-Type':'application/json'},signal:expect.any(AbortSignal)});
  expect(JSON.parse(String(init?.body))).toEqual({text:request.text,model_id:request.model});
  expect(result).toEqual({audio:new Uint8Array([11,22]),contentType:'audio/mpeg',characters:9});
});
it.each([[401,'invalid_api_key','forbidden'],[401,'quota_exceeded','credits'],[402,'','credits'],
  [429,'too_many_concurrent_requests','busy'],[500,'','upstream']] as const)('classifies %d %s without retry',async (status,detail,kind) => {
  const fetcher = vi.fn(async () => Response.json({detail:{status:detail}},{status}));
  await expect(elevenlabs('test',fetcher)(request)).rejects.toMatchObject({kind});
  expect(fetcher).toHaveBeenCalledOnce();
});
it('leaves an ambiguous network failure charged once',async () => {
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
  expect(speech.ids.get('coach')).toBe(request.voiceId); expect(speech.ids.get('parent')).toBe(request.voiceId);
  expect(speech.ids.has('other')).toBe(false);
});
it('authenticates exact lines, personas and expiry and issues distinct tickets for identical captions',() => {
  let now = 1000;
  const tickets = voiceTickets('test',()=>now), ticket = tickets.issue('duo','A line.');
  expect(tickets.issue('duo','A line.')).not.toBe(ticket);
  expect(tickets.verify('duo','A line.',ticket)).toBe(121000);
  expect(tickets.verify('pro','A line.',ticket)).toBeNull();
  expect(tickets.verify('duo','A line. ',ticket)).toBeNull();
  expect(tickets.verify('duo','A line.',ticket.replace('121000','131000'))).toBeNull();
  expect(tickets.verify('duo','A line.',ticket.slice(0,-1))).toBeNull();
  expect(voiceTickets('other',()=>now).verify('duo','A line.',ticket)).toBeNull();
  now = 121000; expect(tickets.verify('duo','A line.',ticket)).toBeNull();
});
