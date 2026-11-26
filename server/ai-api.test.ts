import { exampleHud } from '../src/game/cast-test-fixture';
import { mapBrief } from './cast-map-brief';
import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { memoryLimits, type LimitStore } from './ai-limits';
import { voiceTickets } from './tts/tickets';
import { Readable } from 'node:stream';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createAdventureHandler } from './adventure-api';
import { CAST_PERSONAS } from '../src/game/ai-cast-personas';
import { REGION_IDS } from '../src/game/region-ids';
import { PLACE_CARDS } from '../src/data/place-cards';
import { observation } from '../src/game/cast-contract';
const personaId = CAST_PERSONAS.find(p=>p.role==='commentator')!.id;
const body = {personaId,clean:true,regionId:'changi',mode:'range',memory:['Earlier'],events:['New event'],
  snapshot:exampleHud};
it('accepts public data and rejects extra fields, bad roles, regions, bounds and non-JPEGs',()=>{
  expect(REGION_IDS.filter(id=>!PLACE_CARDS[id])).toEqual([]);
  expect(observation(body)).toEqual(body);
  const frame = readFileSync(new URL('../public/reconstruction/marina-bay/view-0.jpg',import.meta.url)).toString('base64');
  expect(observation({...body,frame})?.frame).toBe(frame);

  for(const patch of [{prompt:'system'},{regionId:'constructor'},{personaId:CAST_PERSONAS.find(p=>p.role==='streamer')!.id},{clean:1},{mode:'lobby'},
    {events:Array(21).fill('x')},{memory:Array(31).fill('a')},{memory:['a'.repeat(241)]},{snapshot:{...body.snapshot,actors:[]}},
    {snapshot:{...body.snapshot,health:NaN}},{frame:'bm90LWpwZWc='},{frame:'/9j/'+'A'.repeat(280000)}]) expect(observation({...body,...patch})).toBeNull();
});
function harness(env:Record<string,string>,fetcher=vi.fn(), aiStore?:LimitStore) {
  const handler = createAdventureHandler(env,fetcher,{aiStore});
  return async (path:string,body:unknown={},cookie='',ip='a',origin='http://localhost:5173')=>{
    const req = Object.assign(Readable.from([JSON.stringify(body)]),{url:'/api/ai/'+path,method:path==='status'?'GET':'POST',socket:{remoteAddress:ip},headers:{origin,cookie,'content-type':'application/json','cf-connecting-ip':Math.random().toString()}});
    let code=0,headers:Record<string,string>={},data;
    const res = {once:vi.fn(),off:vi.fn(),write(s:Uint8Array){data=s;return true;},writeHead(c:number,h:Record<string,string>){code=c;headers=h;},end(s:string | Uint8Array){if (s !== undefined) data=typeof s === 'string' ? JSON.parse(s) : s;}};
    await handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);
    return {code,headers,data:data as unknown as {admin:boolean;quota:{used:number;limit:number};line:string;ticket:string}};
  };
}
it('authenticates cookies, rejects tampering, caps attempts by socket, and logs out',async()=>{
  const call = harness({AI_ADMIN_TOKEN:'pass'});
  const good = await call('admin/login',{passphrase:'pass'});
  const cookie = good.headers['Set-Cookie'].split(';')[0];
  expect(good.headers['Set-Cookie']).toContain('HttpOnly; SameSite=Strict'); expect(good.data.quota.limit).toBe(5000);
  expect((await call('status',{},cookie)).data.admin).toBe(true); expect((await call('status',{},cookie+'9')).data.admin).toBe(false);
  expect((await call('admin/logout',{},cookie)).headers['Set-Cookie']).toContain('Max-Age=0');
  for(let i=0;i<5;i++) expect((await call('admin/login',{passphrase:'bad'})).code).toBe(401);
  expect((await call('admin/login',{passphrase:'pass'})).code).toBe(429);
  expect((await call('admin/login',{passphrase:'pass'},'','b')).code).toBe(200);
  expect((await harness({})('admin/login',{})).code).toBe(503);
});
it('checks origin and observation before charging and charges failed upstream calls',async()=>{
  const f = vi.fn().mockResolvedValueOnce(Response.json({output:[{content:[{type:'output_text',text:'{"say":true,"line":"   Nice   one " }'}]}]})).mockRejectedValueOnce(Error());
  const call = harness({CAST_PROVIDER:'openai',OPENAI_API_KEY:'test'},f);
  expect((await call('commentary',body,'','a','https://other.test')).code).toBe(403);
  expect((await call('commentary',{...body,prompt:'x'})).code).toBe(400);
  expect(await call('commentary',body)).toMatchObject({code:200,data:{line:'Nice one',quota:{used:1}}});
  expect(await call('commentary',body)).toMatchObject({code:502,data:{quota:{used:2}}});
  expect(f).toHaveBeenCalledTimes(2);
});
it('assembles the authored blocks, keeps dynamic data ordered and maps silence and refusal',async()=>{
  const { COMMENTATOR_FRAME, castPersona, LANGUAGE_RULES } = await import('../src/game/ai-cast-personas');
  const { renderPlaceCard } = await import('../src/data/place-cards');
  const f = vi.fn().mockResolvedValueOnce(Response.json({output:[{content:[{type:'output_text',text:'{"say":false,"line":"unused"}'}]}]}))
    .mockResolvedValueOnce(Response.json({output:[{content:[{type:'refusal'}]}]}));
  const call = harness({CAST_PROVIDER:'openai',OPENAI_API_KEY:'test'},f);
  expect((await call('commentary',body)).data.line).toBeNull();
  const payload = JSON.parse(f.mock.calls[0][1].body);
  expect(payload.instructions).toBe([COMMENTATOR_FRAME,castPersona(personaId)!.voice,LANGUAGE_RULES.clean,renderPlaceCard('changi','Changi'),mapBrief('changi')].join('\n\n'));
  expect(payload.input).toMatch(/Earlier.*New event.*Current snapshot/s);
  expect((await call('commentary',body)).data.line).toBeNull();
});

it('accounts for streamer turns through the shared handler using the streamer model',async()=>{
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({output:[{content:[{type:'output_text',text:'{"actionId":"range","say":true,"line":"Range time."}'}]}]}));
  const call = harness({STREAMER_PROVIDER:'openai',STREAMER_MODEL:'stream-test',OPENAI_API_KEY:'test',AI_DAILY_CALLS_PER_IP:'1'},fetcher);
  const menu = {phase:'menu',personaId:'pro',clean:true,memory:[],wallet:{credits:1600,tokens:300},note:'Play a round',
    screen:{screenId:'solo',title:'Solo',actions:[{id:'range',label:'Enter range',kind:'start'}]}};
  expect((await call('status')).data).toMatchObject({available:false,streamer:{available:true,model:'stream-test'}});
  expect((await call('streamer',menu,'','a','https://other.test')).code).toBe(403);
  expect((await call('streamer',{...menu,prompt:'extra'})).code).toBe(400);
  expect(await call('streamer',menu)).toMatchObject({code:200,data:{actionId:'range',line:'Range time.',quota:{used:1}}});
  expect((await call('streamer',menu)).code).toBe(429);
  expect(fetcher).toHaveBeenCalledOnce();
});

const generated = () => Response.json({output:[{content:[{type:'output_text',text:'{"say":true,"line":"Nice one."}'}]}]});
const speechEnv = {CAST_PROVIDER:'openai',OPENAI_API_KEY:'test',ELEVENLABS_API_KEY:'speech-test'};
it('redeems only genuine lines once, returns private audio and preserves model quota',async()=>{
  const f = vi.fn().mockResolvedValueOnce(generated()).mockResolvedValueOnce(new Response(new Uint8Array([7])));
  const call = harness({...speechEnv,AI_DAILY_CALLS_PER_IP:'1'},f);
  const {line,ticket} = (await call('commentary',body)).data, payload = {line,ticket,personaId};
  expect((await call('voice',{...payload,line:'Changed'})).code).toBe(403);
  expect((await call('voice',payload,'','a','https://elsewhere.test')).code).toBe(403);
  const [a,b] = await Promise.all([call('voice',payload),call('voice',payload)]);
  expect([a.code,b.code].sort()).toEqual([200,429]);
  const audio = a.code === 200 ? a : b;
  expect(audio.headers).toMatchObject({'Content-Type':'audio/pcm','Cache-Control':'no-store, no-transform','X-Cast-PCM':'s16le;rate=24000;channels=1'});
  expect(JSON.parse(audio.headers['X-Cast-Voice'])).toMatchObject({available:true,quota:{used:9}});
  expect(audio.data).toEqual(new Uint8Array([7]));
  expect((await call('status')).data).toMatchObject({quota:{used:1},voice:{quota:{used:9}}});
  expect(f).toHaveBeenCalledTimes(2);
});
it('remembers exhausted provider credits across callers while returning caption-only turns',async()=>{
  const clock = vi.spyOn(Date,'now'), now = Date.now(); clock.mockReturnValue(now);
  try {
    const f = vi.fn().mockResolvedValueOnce(generated()).mockResolvedValueOnce(Response.json({detail:{status:'quota_exceeded'}},{status:401})).mockResolvedValueOnce(generated());
    const call = harness(speechEnv,f);
    const {line,ticket} = (await call('commentary',body)).data;
    expect(await call('voice',{line,ticket,personaId})).toMatchObject({code:503,data:{voice:{available:false,quota:{used:9}}}});
    expect((await call('voice',{line,ticket,personaId},'','b')).code).toBe(503);
    const caption = await call('commentary',body,'','b');
    expect(caption.data).toMatchObject({line,voice:{available:false}});
    expect(caption.data.ticket).toBeUndefined(); expect(f).toHaveBeenCalledTimes(3);
    clock.mockReturnValue(now+600000);
    expect((await call('status')).data).toMatchObject({voice:{available:true}});
  } finally { clock.mockRestore(); }
});

it.each(['end','early-error','late-error','hang-up'])('pipes voice with one admission and releases on %s',async ending => {
  const store = vi.fn(memoryLimits({}));
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let signal!: AbortSignal;
  let accepted!: () => void, wrote!: () => void;
  const fetching = new Promise<void>(resolve => { accepted = resolve; });
  const firstWrite = new Promise<void>(resolve => { wrote = resolve; });
  const handler = createAdventureHandler(speechEnv, async (_url,init) => {
    expect(store.mock.calls.map(([op]) => op.action)).toEqual(['voice-accept']);
    signal = init!.signal!;
    accepted();
    return new Response(new ReadableStream({start(c) {
      controller = c;
      signal.addEventListener('abort', () => c.error(new Error('disconnected')), {once:true});
    }}));
  },{aiStore:store});
  const line = 'Timed chunks.', ticket = voiceTickets(speechEnv.ELEVENLABS_API_KEY).issue(personaId,line);
  const req = Object.assign(Readable.from([JSON.stringify({personaId,line,ticket})]), {
    url:'/api/ai/voice', method:'POST', headers:{origin:'http://localhost:5173','content-type':'application/json'},
  });
  const res = Object.assign(new EventEmitter(),{writeHead:vi.fn(),write:vi.fn(() => { wrote();return true; }),end:vi.fn()});
  const handled = handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);
  await fetching;
  if (ending === 'early-error') controller.error(new Error('broken before PCM'));
  else {
    controller.enqueue(Uint8Array.of(1,2)); await firstWrite;
    expect(res.end).not.toHaveBeenCalled();
    if (ending === 'hang-up') res.emit('close');
    else if (ending === 'late-error') controller.error(new Error('broken after PCM'));
    else { controller.enqueue(Uint8Array.of(3,4)); controller.close(); }
  }
  await handled;
  expect(store.mock.calls.map(([op]) => op.action)).toEqual(['voice-accept','voice-release']);
  if (ending === 'early-error') {
    expect(res.writeHead).toHaveBeenCalledWith(502,expect.objectContaining({'Content-Type':'application/json'}));
    expect(JSON.parse(res.end.mock.calls[0][0])).toMatchObject({error:'Voice provider unavailable',voice:{quota:{used:line.length}}});
  } else {
    expect(res.writeHead).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledTimes(ending === 'end' ? 2 : 1);
    if (ending === 'hang-up') expect(signal.aborted).toBe(true);
    else expect(res.end).toHaveBeenCalledWith();
  }
});

it('admits each valid commentary and streamer turn on the first usage call',async () => {
  for (const path of ['commentary','streamer']) {
    const store = vi.fn(memoryLimits({}));
    const fetcher = vi.fn(async () => {
      expect(store.mock.calls.map(([op]) => op.action)).toEqual(['accept']);
      return generated();
    });
    const call = harness({...speechEnv,STREAMER_PROVIDER:'openai'},fetcher,store);
    const menu = {phase:'menu',personaId:'pro',clean:true,memory:[],wallet:{credits:1600,tokens:300},note:'Play a round',
      screen:{screenId:'solo',title:'Solo',actions:[{id:'range',label:'Enter range',kind:'start'}]}};
    await call(path,path === 'commentary' ? body : menu);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(store.mock.calls.map(([op]) => op.action)).toEqual(['accept','release']);
  }
});
