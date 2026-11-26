import { expect, it, vi } from 'vitest';
import { REGION_IDS, type RegionId } from './region-ids';
import { playHistory, readHistory, type PlayedGame } from './streamer-history';
import { chosenDestination, pollVerdict, pollVisit, rollPoll, shuffledScreen, summarizeGames } from './streamer-variety';
import { runMenu, menuTrip } from './streamer-menu';
import { streamerSession, historyKey } from './streamer-session';
import type { ArenaActor, ArenaSnapshot } from './arena-rules';
import { gameRecorder } from './streamer-game-record';
import type { MenuScreen } from './streamer-contract';

function seeded(seed:number) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/2**32; };
}
const screen = (screenId:string,ids:string[]):MenuScreen => ({screenId,title:screenId,
  actions:ids.map(id => ({id,kind:'select',label:id}))});
const districts = screen('world-districts',REGION_IDS.map(id => 'district-'+id));
const game = (region:RegionId):PlayedGame => ({mode:'world',region,started:100,seconds:10});

it('shuffles only the request order, deterministically with a seed, leaving every click target intact',() => {
  const inputs = [...districts.actions], random = seeded(77);
  const first = shuffledScreen(districts,random), second = shuffledScreen(districts,random);
  expect(first).toEqual(shuffledScreen(districts,seeded(77)));
  expect(first.actions).not.toEqual(inputs); expect(second.actions).not.toEqual(first.actions);
  expect(districts.actions).toEqual(inputs);
  for (const a of inputs) expect(first.actions.find(b => b.id === a.id)).toBe(a);
  expect(first.actions).toHaveLength(inputs.length);
});
it('sends the shuffled options to the model and resolves its id on the original screen',async() => {
  const abort = new AbortController(), target = vi.fn(), choice = districts.actions.at(-1)!;
  const controls = new Map([[choice.id,target]]);
  await expect(runMenu({
    read:() => districts, random:seeded(77), now:() => 0, wait:async() => {}, speak:vi.fn(),
    request:async sent => {
      expect(sent).toEqual(shuffledScreen(districts,seeded(77)));
      return {actionId:choice.id,line:null};
    },
    act:async (original,id) => {
      expect(original).toBe(districts); controls.get(id)!(); abort.abort();
    },
  },menuTrip(),abort.signal)).rejects.toThrow();
  expect(target).toHaveBeenCalledOnce();
});
it('rolls only real enabled destinations on the solo mode, range, district and arena pickers',() => {
  const random = seeded(13);
  for (const id of ['store','inventory','loadout','landing','deployment','game-menu','play','multiplayer-menu','host-hardpoint-districts']) {
    const other = screen(id,['world','training','district-tuas','back']);
    expect(rollPoll(other,[],random)).toEqual([]); expect(summarizeGames(other,[])).toBeUndefined();
  }
  for (const mode of ['world','training','team-deathmatch','free-for-all','hardpoint']) {
    const picker = screen(mode+'-districts',['district-tuas','district-changi','district-unknown','load-district','back','next-district']);
    picker.actions[1].state = 'disabled';
    expect(rollPoll(picker,[],random)).toEqual([{id:'district-tuas',share:100}]);
  }
  expect(rollPoll(screen('training-menu',['training','tutorial']),[],random)).toEqual([{id:'training',share:100}]);
  const solo = screen('single-player',['world','training-menu','hardpoint','team-deathmatch','free-for-all','back','tutorial','multiplayer']);
  for (const s of [solo,districts,screen('single-player',['world','training-menu'])]) {
    for (let n=0;n<200;n++) {
      const poll = rollPoll(s,[],random);
      expect(poll).toHaveLength(Math.min(s.actions.length,3));
      expect(poll.every(r => Number.isInteger(r.share) && r.share > 0 && !['back','tutorial','multiplayer'].includes(r.id))).toBe(true);
      expect(poll[0].share).toBeGreaterThan(poll[1].share);
      expect(poll.reduce((a,r) => a+r.share,0)).toBe(100);
      expect(new Set(poll.map(r => r.id)).size).toBe(poll.length);
    }
  }
});
it('keeps a poll through rereads, shuffled options and preview selection, then rolls on returning',() => {
  const visit = pollVisit(seeded(7)), rows = visit.read(districts,[]);
  const reread = shuffledScreen(districts,seeded(9));
  expect(visit.read(reread,[])).toBe(rows);
  const chosen = {...reread,actions:reread.actions.map(a => a.id === rows[1].id ? {...a,state:'selected' as const} : a)};
  expect(visit.read(chosen,[])).toBe(rows);
  const disabled = {...chosen,actions:chosen.actions.map(a => a.id === rows[0].id ? {...a,state:'disabled' as const} : a)};
  expect(visit.read(disabled,[])).toEqual([]); expect(visit.read(chosen,[])).toBe(rows);
  expect(pollVerdict(rows,chosenDestination(chosen,'load-district'))).toBe('Overruled chat');
  expect(pollVerdict(rows,rows[0].id)).toBe('Went with chat');
  expect(pollVerdict(rows,'district-elsewhere')).toBe('Ignored the poll');
  visit.read(screen('loadout',['back']),[]); expect(visit.read(districts,[])).not.toEqual(rows);
});
it('favours novelty and discounts the last game while every option can still lead',() => {
  const picker = screen('world-districts',['district-tuas','district-changi','district-punggol','district-orchard']);
  const games = ['changi','punggol','orchard','changi','punggol','orchard'].map(id => game(id as RegionId));
  const leaders = new Map<string,number>(), random = seeded(171);
  for (let i=0;i<5000;i++) {
    const id = rollPoll(picker,games,random)[0].id;
    leaders.set(id,(leaders.get(id) ?? 0)+1);
  }
  expect(leaders.size).toBe(4);
  expect(leaders.get('district-tuas')!).toBeGreaterThan(1.8*leaders.get('district-changi')!);
  expect(leaders.get('district-orchard')!).toBeLessThan(0.5*leaders.get('district-punggol')!);
});
it('counts actual games, carries one expedition through crossings, and caps history at twenty entries',() => {
  const history = playHistory(), record = gameRecorder((run,location,seconds,stats) => history.sample(run,location,seconds,stats,42));
  const hud = {phase:'ready' as const,elapsed:0,hits:0,arena:null,arenaSelf:null};
  record('range','tuas',hud); expect(history.games()).toEqual([]);
  for (let i=0;i<22;i++) {
    record('range','tuas',hud);
    for (const phase of ['deploying','playing','paused','playing','complete'] as const)
      record('range','tuas',{...hud,phase,hits:i,elapsed:12.4});
  }
  expect(history.games()).toHaveLength(20); expect(history.games()[0].kills).toBe(2);
  expect(history.games().at(-1)).toEqual({mode:'training',region:'tuas',started:42,seconds:12,kills:21,result:'completed'});
  const expedition = gameRecorder((run,location,seconds,stats) => history.sample(run,location,seconds,stats,80));
  expedition('expedition','tuas',{...hud,phase:'playing',elapsed:15});
  expedition('expedition','changi',hud);
  expedition('expedition','changi',{...hud,phase:'playing',elapsed:6});
  expect(history.games().at(-1)).toEqual({mode:'world',region:'tuas',started:80,seconds:21,reached:'changi',crossings:1});
  expect(readHistory(history.serialize())).toEqual(history.games());
});
it('isolates persona saves, ignores stale and malformed records, forgets even a still-running game',() => {
  const disk = new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>disk.get(k)??null,setItem:(k:string,v:string)=>disk.set(k,v),removeItem:(k:string)=>disk.delete(k)});
  try {
    const s = streamerSession(), run = {}, loc = game('tuas');
    const start = (personaId:string,keepLearning:boolean) => s.start({personaId,keepLearning,clean:true,screenshots:false});
    start('pro',false); s.recordGame(run,loc,10,{}); s.pause(); s.resume(); expect(s.games()).toHaveLength(1);
    s.stop(); expect(disk.size).toBe(0); start('pro',false); expect(s.games()).toHaveLength(0);
    s.recordGame(run,loc,2,{}); s.keepLearning(true); s.stop(); expect(readHistory(disk.get(historyKey('pro'))!)).toHaveLength(1);
    start('rager',true); expect(s.games()).toHaveLength(0); s.recordGame(run,game('changi'),3,{}); s.stop();
    start('pro',true); s.recordGame(run,loc,2,{}); expect(s.savedSummary('pro')).toContain('2 games played');
    s.forget('pro'); s.recordGame(run,loc,4,{}); expect(s.games()).toEqual([]); expect(disk.has(historyKey('pro'))).toBe(false);
    expect(s.savedSummary('rager')).toContain('1 game played');
    for (const raw of ['{','null','{"version":2,"games":[]}','{}']) expect(readHistory(raw)).toEqual([]);
    expect(readHistory(JSON.stringify({version:1,games:[loc,{...loc,seconds:-1},{...loc,region:'gone'}, {...loc,mode:'hardpoint',arena:'missing'}]}))).toEqual([loc]);
  } finally { vi.unstubAllGlobals(); }
});

it('updates arena scores through a respawn and records the outcome from the streamer’s side',() => {
  const history = playHistory();
  const record = gameRecorder((run,location,seconds,stats) => history.sample(run,location,seconds,stats,123));
  const self = {id:'me',team:'bravo',kills:3,deaths:2,alive:true} as ArenaActor;
  const arena:ArenaSnapshot = {type:'arena-snapshot',tick:1,elapsed:10,actors:[self],feed:[],finished:false,winner:'',
    teamDeathmatch:{area:'dragon-courtyard',scores:{alpha:4,bravo:3}}};
  const hud = {phase:'playing' as const,hits:0,arena,arenaSelf:self,elapsed:10};
  record('arena','toa-payoh',hud);
  record('arena','toa-payoh',{...hud,arenaSelf:{...self,alive:false,deaths:3}});
  record('arena','toa-payoh',{...hud,arenaSelf:{...self,deaths:3},elapsed:20});
  record('arena','toa-payoh',{...hud,phase:'complete',arena:{...arena,finished:true,winner:'Alpha'},arenaSelf:{...self,deaths:3},elapsed:30});
  expect(history.games()).toEqual([{mode:'team-deathmatch',region:'toa-payoh',arena:'dragon-courtyard',
    kills:3,deaths:3,seconds:30,started:123,result:'lost'}]);
});
