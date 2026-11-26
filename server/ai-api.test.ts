import { exampleHud } from '../src/game/cast-test-fixture';
import { mapBrief } from './cast-map-brief';
import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { memoryLimits, type LimitStore } from './ai-limits';
import { CAST_CONTENT_TYPE, CAST_PCM, CAST_STALE_MS } from '../src/game/cast-wire';
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
    const chunks: Buffer[] = [];
    let code=0,headers:Record<string,string>={},data;
    const res = {once:vi.fn(),off:vi.fn(),write(s:Uint8Array){chunks.push(Buffer.from(s));return true;},writeHead(c:number,h:Record<string,string>){code=c;headers=h;},end(s:string | Uint8Array){if (s !== undefined) data=typeof s === 'string' ? JSON.parse(s) : s;}};
    await handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);
    return {code,headers,wire:Buffer.concat(chunks),data:data as unknown as {admin:boolean;quota:{used:number;limit:number};line:string}};
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
it('uses the deployed admin key and returns streamer availability and account quotas when switching access', async () => {
  const call = harness({ AI_ADMIN_KEY:'local-test', AI_DAILY_CALLS_ADMIN:'9100', STREAMER_PROVIDER:'openai', OPENAI_API_KEY:'test' });
  const signedIn = await call('admin/login', {passphrase:'local-test'});
  expect(signedIn.data).toMatchObject({admin:true, streamer:{available:true,provider:'openai'}, quota:{limit:9100}, voice:{quota:{limit:20000}}});
  const signedOut = await call('admin/logout', {}, signedIn.headers['Set-Cookie'].split(';')[0]);
  expect(signedOut.data).toMatchObject({admin:false, streamer:{available:true}, quota:{limit:1000}, voice:{quota:{limit:4000}}});
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

const menuTurn = {phase:'menu',personaId:'pro',clean:true,memory:[],wallet:{credits:10,tokens:10},note:'Choose',
  screen:{screenId:'solo',title:'Solo',actions:[{id:'range',label:'Range',kind:'start'}]}};
const playTurn = {...body,personaId:'pro',phase:'play',snapshot:undefined,hud:exampleHud,notes:[],
  observation:{time:1,health:80,maxHealth:100,armor:0,magazine:20,reserve:60,weapon:0,yaw:0,pitch:0,position:{x:1,z:2},
    alive:true,reloading:false,aiming:false,contacts:[],waypoints:[],ballistics:{velocity:300,drop:0},lootPrompt:'',travelPrompt:''}};
it.each([
  ['commentary',body,{},{}],
  ['streamer',menuTurn,{actionId:'range'},{actionId:'range'}],
  ['streamer',playTurn,{goal:'explore',destination:{waypointId:null,sectorId:null,placeId:null}},{goal:'explore'}],
] as const)('frames a complete %s reply and speaks the exact returned caption',async(path,turn,modelDecision,expected)=>{
  const model = {...modelDecision,say:true,line:'   Nice   one 你好!'};
  const f = vi.fn().mockResolvedValueOnce(Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(model)}]}]}))
    .mockResolvedValueOnce(new Response(Uint8Array.of(0xff,0,10,32)));
  const store = vi.fn(memoryLimits({}));
  const result = await harness({...speechEnv,STREAMER_PROVIDER:'openai'},f,store)(path,{...turn,spoken:true});
  expect(result.headers['Content-Type']).toBe(CAST_CONTENT_TYPE);
  const end = 4+result.wire.readUInt32BE();
  const header = JSON.parse(result.wire.subarray(4,end).toString());
  expect(header).toMatchObject({...expected,line:'Nice one 你好!',pcm:CAST_PCM,quota:{used:1},usage:{inputTokens:0}});
  expect(result.wire.subarray(end)).toEqual(Buffer.from([255,0,10,32]));
  expect(JSON.parse(f.mock.calls[1][1].body).text).toBe(header.line);
  expect(store.mock.calls.map(([op])=>op.action)).toEqual(['accept','release']);
  expect(store.mock.calls[1][0].characters).toBe(header.line.length);
});

it.each(['old client','voice off','no provider','over budget','silent','refused','slow','invalid field'])('returns plain JSON for %s',async reason=>{
  const clock=vi.spyOn(Date,'now'), now=Date.now();
  try {
    const f=vi.fn(async()=>{
      if (reason==='slow') clock.mockReturnValue(now+CAST_STALE_MS+1);
      if (reason==='refused') return Response.json({output:[{content:[{type:'refusal'}]}]});
      if (reason==='silent') return Response.json({output:[{content:[{type:'output_text',text:'{"say":false,"line":"unused"}'}]}]});
      return generated();
    });
    const call=harness({...speechEnv,...(reason==='no provider' && {ELEVENLABS_API_KEY:''}),
      ...(reason==='over budget' && {VOICE_DAILY_CHARS_PER_IP:'239'})},f);
    const value=reason==='old client' ? undefined : reason==='invalid field' ? 1 : reason!=='voice off';
    const res=await call('commentary',{...body,spoken:value});
    expect(res.code).toBe(reason==='invalid field' ? 400 : 200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.data).toMatchObject({voice:{quota:{used:0}}});
    if (reason==='over budget') expect(res.data).toMatchObject({voice:{available:false,reason:'Voice character limit reached'}});
    expect(f).toHaveBeenCalledTimes(reason==='invalid field' ? 0 : 1);
  } finally { clock.mockRestore(); }
});
it('ends after the header on a credit refusal and pauses the provider for ten minutes',async()=>{
  const now=Date.now(), clock=vi.spyOn(Date,'now').mockReturnValue(now);
  try {
    const f=vi.fn().mockResolvedValueOnce(generated()).mockResolvedValueOnce(new Response(null,{status:402})).mockResolvedValueOnce(generated());
    const call=harness(speechEnv,f);
    const first=await call('commentary',{...body,spoken:true});
    expect(first.wire.length).toBe(4+first.wire.readUInt32BE());
    expect(await call('commentary',{...body,spoken:true},'','b')).toMatchObject({data:{line:'Nice one.',voice:{available:false,quota:{used:0}}}});
    clock.mockReturnValue(now+600000);
    expect((await call('status')).data).toMatchObject({voice:{available:true}});
    expect(f).toHaveBeenCalledTimes(3);
  } finally { clock.mockRestore(); }
});
it.each([
  ['Node','model'],['Node','speech'],['Worker signal','model'],['Worker signal','speech'],
])('releases on %s disconnect during %s',async(runtime,phase)=>{
  const client = runtime === 'Worker signal' ? new AbortController() : undefined;
  let ready!:()=>void, resume!:()=>void, signal!:AbortSignal;
  const started=new Promise<void>(r=>{ready=r;});
  const gate=new Promise<void>(r=>{resume=r;});
  const cancel=vi.fn(), store=vi.fn(memoryLimits({}));
  const f=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
    signal=init!.signal!;
    if (String(url).endsWith('/responses')) {
      if (phase==='model') { ready(); await gate; }
      return generated();
    }
    // The complete JSON was handed to HTTP before this provider was called.
    const header = Buffer.from(res.write.mock.calls[0][0]);
    expect(header.readUInt32BE()).toBe(header.length-4);
    expect(JSON.parse(header.subarray(4).toString()).line).toBe('Nice one.');
    if (client) res.emit('close'); // Bridge header publication is not a hang-up.
    return new Response(new ReadableStream({start(c){c.enqueue(Uint8Array.of(1,2));},cancel}));
  });
  const res=Object.assign(new EventEmitter(),{writeHead:vi.fn(),end:vi.fn(),write:vi.fn((bytes:Uint8Array)=>{
    if (bytes.length===2) ready(); return true;
  })});
  const req=Object.assign(Readable.from([JSON.stringify({...body,spoken:true})]),{
    url:'/api/ai/commentary',method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'}});
  const handling=createAdventureHandler(speechEnv,f,{aiStore:store})(req as unknown as IncomingMessage,res as unknown as ServerResponse,client?.signal);
  await started;
  if (client) client.abort(); else res.emit('close');
  resume();
  await handling;
  expect(signal.aborted).toBe(true);
  expect(f).toHaveBeenCalledTimes(phase==='model' ? 1 : 2);
  if (phase==='speech') expect(cancel).toHaveBeenCalledOnce();
  expect(store.mock.calls.at(-1)?.[0]).toMatchObject({action:'release',characters:phase==='model' ? 0 : 9});
});
it.each(['empty','before PCM','after PCM'])('keeps the caption and settles a speech body ending %s',async ending=>{
  let reads=0;
  const source=new ReadableStream<Uint8Array>({pull(c){
    if (ending==='empty') c.close();
    else if (ending==='after PCM' && reads++===0) c.enqueue(Uint8Array.of(77,88));
    else c.error(new Error('interrupted'));
  }},{highWaterMark:0});
  const f=vi.fn().mockResolvedValueOnce(generated()).mockResolvedValueOnce(new Response(source));
  const call=harness(speechEnv,f);
  const res=await call('commentary',{...body,spoken:true});
  const end=4+res.wire.readUInt32BE();
  expect(JSON.parse(res.wire.subarray(4,end).toString()).line).toBe('Nice one.');
  expect(res.wire.subarray(end)).toEqual(Buffer.from(ending==='after PCM' ? [77,88] : []));
  expect((await call('status')).data).toMatchObject({voice:{quota:{used:ending==='after PCM' ? 9 : 0}},quota:{used:1}});
});
