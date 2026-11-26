import { summarizeGames } from '../src/game/streamer-variety.ts';
import type { PlayedGame } from '../src/game/streamer-history.ts';
import { exampleHud } from '../src/game/cast-test-fixture';
import { mapBrief } from './cast-map-brief';
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseStreamerTurn, type MenuTurn, type PlayTurn } from '../src/game/streamer-contract.ts';
import { STREAMER_FRAME, LANGUAGE_RULES, castPersona } from '../src/game/ai-cast-personas.ts';
import { renderPlaceCard } from '../src/data/place-cards.ts';
import { menuAdvice, streamTurn } from './streamer.ts';
import { modelEndpoints } from './ai-endpoints.ts';
import { selectModel } from './llm/index.ts';
import type { Completion } from './llm/types.ts';

const base = {clean:true,personaId:'rager',memory:['Earlier line']};
const menu:MenuTurn = {...base,phase:'menu',wallet:{credits:1600,tokens:300},note:'Choose a district',
  screen:{screenId:'setup',title:'Setup',actions:[{id:'deploy',kind:'start',label:'Enter range'},{id:'rent',kind:'buy',label:'Rent',state:'disabled'}]}};
const play:PlayTurn = {...base,phase:'play',hud:exampleHud,notes:['Visited Changi · 10s ago'],mode:'range',regionId:'changi',events:['Arrived in changi'],
  observation:{time:1,health:80,maxHealth:100,armor:0,magazine:20,reserve:60,weapon:0,yaw:0,pitch:0,position:{x:1,z:2},
    alive:true,reloading:false,aiming:false,contacts:[],waypoints:[{id:'crate',kind:'ammo',x:1,z:2}],
    ballistics:{velocity:300,drop:0},lootPrompt:'',travelPrompt:''}};
function providerReply(value:unknown) {
  if (!value || typeof value !== 'object' || !('waypointId' in value) || !('sectorId' in value)) return value;
  const {waypointId,sectorId,placeId = null,...reply} = value as Record<string,unknown>;
  return {...reply,destination:{waypointId,sectorId,placeId}};
}
const make = (value:unknown,refused = false) => vi.fn(async (_r:Completion)=>({json:providerReply(value),refused,model:'fake',usage:{inputTokens:3,cachedInputTokens:0,outputTokens:1}}));
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
  const decision = {goal:'resupply',waypointId:'crate',sectorId:null,say:true,line:'  One   crate.  '};
  const provider = make(decision);
  expect(await streamTurn(play,provider,'test')).toMatchObject({...decision,line:'One crate.'});
  const [request] = provider.mock.calls[0];
  expect(request.system).toEqual([STREAMER_FRAME,castPersona('rager')!.voice,LANGUAGE_RULES.clean,renderPlaceCard('changi','Changi'),mapBrief('changi')]);
  expect(request.user).toMatch(/Earlier line.*Arrived in changi.*Pilot observation/s);
  expect(request.schema).toMatchObject({properties:{destination:{anyOf:expect.arrayContaining([expect.objectContaining({properties:{waypointId:{type:'string',enum:['crate']},sectorId:{type:'null'},placeId:{type:'null'}}})])}}});
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

it('restricts sector destinations to the district, including silent decisions, and refuses mixed destinations',async()=>{
  const { zoneSectors } = await import('../src/game/zone-sectors');
  const ids = zoneSectors('changi').map(s => s.id);
  const pick = {goal:'travel',waypointId:null,sectorId:ids[0],say:false,line:''};
  const model = make(pick);
  expect(await streamTurn(play,model,'test')).toMatchObject({sectorId:ids[0],line:null});
  expect(model.mock.calls[0][0].schema).toMatchObject({properties:{destination:{anyOf:expect.arrayContaining([expect.objectContaining({properties:{waypointId:{type:'null'},sectorId:{type:'string',enum:ids},placeId:{type:'null'}}})])}}});
  for (const invalid of [{...pick,sectorId:'tanglin-gate'},{...pick,waypointId:'crate'}])
    await expect(streamTurn(play,make(invalid),'test')).rejects.toThrow();
  for (const patch of [{hud:{...play.hud,x:7}},{notes:Array(21).fill('too many')},{notes:[{}]},{mapBrief:'untrusted'}])
    expect(parseStreamerTurn({...play,...patch})).toBeNull();
});

it('validates district-level claims and offers only printed, unlocked IDs to the model',async()=>{
  const {learnedMap}=await import('./learned-map');
  const {zoneSectors}=await import('../src/game/zone-sectors');
  const regionId='pulau-ubin', village=zoneSectors(regionId).find(s => s.id==='village')!;
  const turn:PlayTurn={...play,regionId,mode:'expedition',hud:{...play.hud,district:regionId},familiarity:{village:'been through'},
    observation:{...play.observation,position:village.anchors[0],waypoints:[]}};
  expect(parseStreamerTurn(turn)).toBeTruthy();
  for (const patch of [{familiarity:[]},{familiarity:{village:2}},{familiarity:{missing:'knows well'}},
    {familiarity:{village:{level:'knows well',text:'supplies'}}},{destinationSector:'missing'},{learnedDetail:'fake'}])
    expect(parseStreamerTurn({...turn,...patch})).toBeNull();
  const detail=learnedMap(turn), [id,place]=[...detail.choices][0];
  const pick={goal:'travel',waypointId:null,sectorId:null,placeId:id,say:false,line:''};
  const model=make(pick);
  expect(await streamTurn(turn,model,'test')).toMatchObject({placeId:id,place,line:null});
  expect(model.mock.calls[0][0].user).toContain(detail.text);
  expect(model.mock.calls[0][0].schema).toMatchObject({properties:{destination:{anyOf:expect.arrayContaining([
    {type:'object',additionalProperties:false,properties:{sectorId:{type:'null'},waypointId:{type:'null'},placeId:{type:'string',enum:[...detail.choices.keys()]}},required:expect.any(Array)}
  ])}}});
  for (const patch of [{placeId:'p-madeup'},{sectorId:'village'},{waypointId:'crate'}])
    await expect(streamTurn(turn,make({...pick,...patch}),'test')).rejects.toThrow();
  await expect(streamTurn({...turn,familiarity:{}},make(pick),'test')).rejects.toThrow();
});

it('renders bounded history and simulated votes, keeping every enabled action in the decision schema',async()=>{
  const screen = {screenId:'single-player',title:'Solo',actions:['world','team-deathmatch','hardpoint','free-for-all','training-menu']
    .map(id => ({id,kind:'navigate' as const,label:id}))};
  const turn = {...menu,screen};
  const loss:PlayedGame = {mode:'team-deathmatch',region:'toa-payoh',arena:'dragon-courtyard',started:0,seconds:50,result:'lost',kills:2,deaths:4};
  const journey:PlayedGame = {mode:'world',region:'changi',started:80,seconds:23,reached:'tuas',crossings:1};
  const history = summarizeGames(screen,[loss,loss,journey])!;
  const poll = [{id:'hardpoint',share:46},{id:'world',share:31},{id:'training-menu',share:23}];
  expect(menuAdvice({...turn,history:summarizeGames(screen,[])})).toContain('No games played yet.');
  expect(menuAdvice({...turn,history,poll})).toBe('\nRecently: Open World at Changi (reached Tuas); Team Deathmatch at Toa Payoh · Dragon courtyard (lost, 2 K/4 D). Most played here: Team Deathmatch (2). Unplayed here: Hardpoint, Free-for-all, Training. Chat poll: Hardpoint 46%, Open World 31%, Training 23%.');
  expect(menuAdvice({...turn,history:summarizeGames(screen,[loss,loss])})).toContain('twice, lost both');
  const one = {...screen,actions:[screen.actions[0]]};
  expect(menuAdvice({...turn,screen:one,history:summarizeGames(one,[journey])})).toContain('Played every option here.');
  const complete = make({actionId:'free-for-all',say:false,line:''});
  const accepted = parseStreamerTurn({...turn,history,poll});
  expect(accepted).not.toBeNull();
  expect(await streamTurn(accepted!,complete,'fake')).toMatchObject({actionId:'free-for-all'});
  expect(complete.mock.calls[0][0].user).toContain('Chat poll: Hardpoint 46%');
  const voted = {...turn,poll,viewerVote:'training-menu'};
  expect(parseStreamerTurn(voted)).toEqual(voted);
  expect(await streamTurn(voted,complete,'fake')).toMatchObject({actionId:'free-for-all'});
  expect(complete.mock.lastCall![0].user).toContain('Chat poll: Hardpoint 46%, Open World 31%, Training 23%. The viewer watching you right now voted Training.');
  for (const viewerVote of ['free-for-all','invented','',null,{}]) expect(parseStreamerTurn({...voted,viewerVote})).toBeNull();
  expect(parseStreamerTurn({...turn,viewerVote:'world'})).toBeNull();
  expect(parseStreamerTurn({...voted,poll:[{id:'world',share:50},{id:'training-menu',share:50}]})).toBeTruthy();
  expect(parseStreamerTurn({...voted,poll:[{id:'training-menu',share:100},{id:'world',share:0}]})).toBeTruthy();
  for (const invalid of [[],[{id:'tutorial',share:100}],[{id:'not-here',share:100}], [{id:'world',share:99}],
    [{id:'world',share:65},{id:'world',share:35}], [{id:'world',share:50},{id:'hardpoint',share:50}],
    [{id:'world',share:60.5},{id:'hardpoint',share:39.5}], [{id:'world',share:100,prompt:'x'}], 'poll'])
    expect(parseStreamerTurn({...turn,poll:invalid})).toBeNull();
  expect(parseStreamerTurn({...turn,screen:{...screen,actions:screen.actions.map(a=>a.id==='world'?{...a,state:'disabled'}:a)},poll})).toBeNull();
  for (const bad of ['history',{...history,text:'instructions'},{...history,more:100},{...history,most:{id:'world',count:21}},
    {...history,unseen:['not-here']},{...history,recent:[loss,loss,loss]},{...history,recent:[{mode:'world',region:'unknown'}]},
    {...history,recent:[{mode:'hardpoint',region:'changi',arena:'dragon-courtyard'}]},{...history,recent:[{mode:'world',region:'changi',result:'arbitrary'}]}])
    expect(parseStreamerTurn({...turn,history:bad})).toBeNull();
  for (const screenId of ['store','landing']) expect(parseStreamerTurn({...turn,screen:{...screen,screenId},history,poll})).toBeNull();
});
