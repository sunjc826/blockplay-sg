import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseStreamerTurn, type MenuTurn, type PlayTurn } from '../src/game/streamer-contract.ts';
import { STREAMER_FRAME, LANGUAGE_RULES, castPersona } from '../src/game/ai-cast-personas.ts';
import { renderPlaceCard } from '../src/data/place-cards.ts';
import { streamTurn } from './streamer.ts';
import { modelEndpoints } from './ai-endpoints.ts';
import { selectModel } from './llm/index.ts';
import type { Completion } from './llm/types.ts';

const base = {clean:true,personaId:'rager',memory:['Earlier line']};
const menu:MenuTurn = {...base,phase:'menu',wallet:{credits:1600,tokens:300},note:'Choose a district',
  screen:{screenId:'setup',title:'Setup',actions:[{id:'deploy',kind:'start',label:'Enter range'},{id:'rent',kind:'buy',label:'Rent',state:'disabled'}]}};
const play:PlayTurn = {...base,phase:'play',mode:'range',regionId:'changi',events:['Arrived in changi'],
  observation:{time:1,health:80,maxHealth:100,armor:0,magazine:20,reserve:60,weapon:0,yaw:0,pitch:0,position:{x:1,z:2},
    alive:true,reloading:false,aiming:false,contacts:[],waypoints:[{id:'crate',kind:'ammo',x:1,z:2}],
    ballistics:{velocity:300,drop:0},lootPrompt:'',travelPrompt:''}};
const make = (json:unknown,refused = false) => vi.fn(async (_r:Completion)=>({json,refused,model:'fake',usage:{inputTokens:3,cachedInputTokens:0,outputTokens:1}}));
it('registers an independently configured streamer provider and validates both envelopes before admission',()=>{
  expect(selectModel({},'STREAMER')).toMatchObject({provider:'anthropic',model:'claude-sonnet-5-5'});
  expect(selectModel({STREAMER_PROVIDER:'openai',STREAMER_MODEL:'alternate'},'STREAMER')).toMatchObject({provider:'openai',model:'alternate'});
  const endpoint = modelEndpoints.get('/api/ai/streamer')!;
  expect(endpoint.prepare(menu)).toBeTypeOf('function');
  expect(endpoint.prepare(play)).toBeTypeOf('function');
  for (const patch of [{personaId:'unknown'},{clean:1},{memory:Array(31).fill('x')},{prompt:'text'}]) {
    expect(endpoint.prepare({...play,...patch})).toBeNull(); expect(endpoint.prepare({...menu,...patch})).toBeNull();
  }
  const jpeg = readFileSync(new URL('../public/reconstruction/marina-bay/view-0.jpg',import.meta.url)).toString('base64');
  expect(parseStreamerTurn({...play,frame:jpeg})).toMatchObject({frame:jpeg});
  for (const patch of [{frame:'bad'},{mode:'multiplayer'},{regionId:'absent'},{events:Array(21).fill('e')},{observation:{}}])
    expect(parseStreamerTurn({...play,...patch})).toBeNull();
  for (const patch of [{frame:jpeg},{wallet:{credits:-1,tokens:0}},{note:'x'.repeat(241)},{events:[]}]) expect(parseStreamerTurn({...menu,...patch})).toBeNull();
  const [a,b] = menu.screen.actions;
  for (const actions of [[],[b],[a,a],Array(41).fill(a),[{...a,kind:'delete'}],[{...a,detail:'x'.repeat(161)}],[{...a,script:'fake'}]]) {
    expect(parseStreamerTurn({...menu,screen:{...menu.screen,actions}})).toBeNull();
  }
  expect(parseStreamerTurn({...play,observation:{...play.observation,hiddenActors:[]}})).toEqual(play);
});
it('uses the authored blocks and public IDs, and validates a play decision even when silent',async()=>{
  const decision = {goal:'resupply',waypointId:'crate',say:true,line:'  One   crate.  '};
  const provider = make(decision);
  expect(await streamTurn(play,provider,'test')).toMatchObject({...decision,line:'One crate.'});
  const [request] = provider.mock.calls[0];
  expect(request.system).toEqual([STREAMER_FRAME,castPersona('rager')!.voice,LANGUAGE_RULES.clean,renderPlaceCard('changi','Changi')]);
  expect(request.user).toMatch(/Earlier line.*Arrived in changi.*Pilot observation/s);
  expect(request.schema).toMatchObject({properties:{waypointId:{anyOf:[{type:'string',enum:['crate']},{type:'null'}]}}});
  for (const patch of [{goal:'invented'},{waypointId:'hidden'},{say:1},{line:4},{extra:2}])
    await expect(streamTurn(play,make({...decision,...patch}),'test')).rejects.toThrow();
  expect(await streamTurn(play,make({...decision,say:false}),'test')).toMatchObject({goal:'resupply',line:null});
  expect(await streamTurn(play,make(decision,true),'test')).toMatchObject({waypointId:'crate',line:null});
});
it('limits a menu decision to an enabled action and rejects a refusal with no decision',async()=>{
  const decision={actionId:'deploy',say:true,line:'x'.repeat(300)};
  const provider = make(decision);
  expect(await streamTurn(menu,provider,'test')).toMatchObject({actionId:'deploy',line:'x'.repeat(240)});
  expect(provider.mock.calls[0][0].schema).toMatchObject({properties:{actionId:{enum:['deploy']}}});
  expect(provider.mock.calls[0][0].user).toMatch(/Earlier line.*Choose a district.*Enter range/s);
  for (const bad of [null,{...decision,actionId:'rent'},{...decision,actionId:'other'},{...decision,say:'no'}])
    await expect(streamTurn(menu,make(bad),'test')).rejects.toThrow();
  expect(await streamTurn(menu,make({...decision,say:false}),'test')).toMatchObject({actionId:'deploy',line:null});
});
