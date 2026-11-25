import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createAdventureHandler } from './adventure-api';
import { CAST_PERSONAS } from '../src/game/ai-cast-personas';
import { REGION_IDS } from '../src/game/region-ids';
import { PLACE_CARDS } from '../src/data/place-cards';
import { observation } from '../src/game/cast-contract';
const personaId = CAST_PERSONAS.find(p=>p.role==='commentator')!.id;
const body = {personaId,clean:true,regionId:'changi',mode:'range',memory:['Earlier'],events:['New event'],
  snapshot:{health:95,armor:0,weapon:'SAR 21',magazine:10,reserve:60,score:1,seconds:10,streak:1,stance:'standing',vehicle:'on-foot'}};
it('accepts public data and rejects extra fields, bad roles, regions, bounds and non-JPEGs',()=>{
  expect(REGION_IDS.filter(id=>!PLACE_CARDS[id])).toEqual([]);
  expect(observation(body)).toEqual(body);
  const frame = readFileSync(new URL('../public/reconstruction/marina-bay/view-0.jpg',import.meta.url)).toString('base64');
  expect(observation({...body,frame})?.frame).toBe(frame);

  for(const patch of [{prompt:'system'},{regionId:'constructor'},{personaId:CAST_PERSONAS.find(p=>p.role==='streamer')!.id},{clean:1},{mode:'lobby'},
    {events:Array(21).fill('x')},{memory:Array(31).fill('a')},{memory:['a'.repeat(241)]},{snapshot:{...body.snapshot,actors:[]}},
    {snapshot:{...body.snapshot,health:NaN}},{frame:'bm90LWpwZWc='},{frame:'/9j/'+'A'.repeat(280000)}]) expect(observation({...body,...patch})).toBeNull();
});
function harness(env:Record<string,string>,fetcher=vi.fn()) {
  const handler = createAdventureHandler(env,fetcher);
  return async (path:string,body:unknown={},cookie='',ip='a',origin='http://localhost:5173')=>{
    const req = Object.assign(Readable.from([JSON.stringify(body)]),{url:'/api/ai/'+path,method:path==='status'?'GET':'POST',socket:{remoteAddress:ip},headers:{origin,cookie,'content-type':'application/json','cf-connecting-ip':Math.random().toString()}});
    let code=0,headers:Record<string,string>={},data;
    const res = {writeHead(c:number,h:Record<string,string>){code=c;headers=h;},end(s:string){data=JSON.parse(s);}};
    await handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);
    return {code,headers,data:data as unknown as {admin:boolean;quota:{used:number;limit:number};line:string}};
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
  expect(payload.instructions).toBe([COMMENTATOR_FRAME,castPersona(personaId)!.voice,LANGUAGE_RULES.clean,renderPlaceCard('changi','Changi')].join('\n\n'));
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
