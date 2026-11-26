import { afterEach, expect, it, vi } from 'vitest';
import { familiarity, readLearning, WELL_SECONDS, INCIDENT_SECONDS } from './streamer-familiarity';
import { streamerSession, learningKey } from './streamer-session';
import { zoneSectors } from './zone-sectors';
import { profileScope } from './profile-scope';

const region = 'queenstown', court = zoneSectors(region).find(s => s.id === 'community-court')!;
const settings = {personaId:'pro',clean:true,screenshots:false};
afterEach(() => vi.unstubAllGlobals());

it('credits elapsed play and distinct visits, with a promotion event only at a threshold',() => {
  const f = familiarity();
  const sample = (seconds:number,active=true) => f.sample(region,court.id,seconds,active);
  sample(0); sample(.8); expect(f.levels(region)).toEqual({});
  expect(sample(1)?.promoted).toBeUndefined();
  expect(sample(2)?.promoted).toBe('been through');
  sample(3,false); sample(900,false); sample(901);
  expect(sample(902)?.promoted).toBeUndefined();
  expect(readLearning(f.serialize())[region]?.[court.id]).toEqual({seconds:3,visits:1,incidents:0});
  f.sample(region,null,1000,true); sample(1001); sample(1003);
  f.sample('changi','not-a-sector',2000,true); sample(2001);
  expect(sample(2003)?.promoted).toBe('knows well');
  expect(sample(2004)?.promoted).toBeUndefined();
  expect(f.levels('changi')).toEqual({});
});

it('reaches knows well after real presence, or earlier with an incident',() => {
  for (const incident of [false,true]) {
    const f=familiarity(), duration=WELL_SECONDS-(incident ? INCIDENT_SECONDS : 0);
    f.sample(region,court.id,0,true,incident);
    f.sample(region,court.id,duration-1,true);
    expect(f.levels(region)[court.id]).toBe('been through');
    expect(f.sample(region,court.id,duration,true)?.promoted).toBe('knows well');
  }
});

it('retains session learning through menus, pauses, deaths and district changes without crediting idle time',() => {
  const s=streamerSession();
  s.start(settings); s.observe(region,court,0,true); s.observe(region,court,100,true);
  expect(s.levels(region)).toEqual({});
  s.handoff('play'); s.observe(region,court,101,true); s.observe(region,court,103,true);
  s.pause(); s.observe(region,court,1000,true); s.resume(); s.handoff('play');
  s.observe(region,court,1002,true); s.observe(region,court,1003,false,'death');
  s.observe(region,court,5000,false); s.observe(region,court,5001,true);
  s.handoff('menu'); s.observe(region,court,9000,true);
  expect(s.takeEvents()).toEqual(['Map familiarity · Community court · been through']);
  s.handoff('play'); const next=zoneSectors('changi')[0];
  s.observe('changi',next,0,true); s.observe('changi',next,2,true);
  expect(s.levels(region)).toEqual({[court.id]:'been through'});
  s.stop(); expect(s.levels(region)).toEqual({});
  s.start(settings); expect(s.levels('changi')).toEqual({});
});

it('keeps only counters per opted-in persona and forgets active, saved and pending map knowledge in isolation',() => {
  const disk = new Map([[profileScope().key,'real profile'],[profileScope(true).key,'sandbox profile']]);
  vi.stubGlobal('localStorage',{getItem:(k:string)=>disk.get(k) ?? null,setItem:(k:string,v:string)=>disk.set(k,v),removeItem:(k:string)=>disk.delete(k)});
  const s=streamerSession();
  const play = (personaId:string,keepLearning:boolean) => {
    s.start({...settings,personaId,keepLearning}); s.handoff('play');
  };
  const walk = () => { s.observe(region,court,0,true); s.observe(region,court,WELL_SECONDS,true); };
  play('pro',false); walk(); s.stop(); expect(disk.size).toBe(2);
  play('pro',true); expect(s.levels(region)).toEqual({}); walk();
  s.speak('Private line'); s.notes.add('Private receipt',1000); s.stop();
  const stored=JSON.parse(disk.get(learningKey('pro'))!);
  expect(stored).toEqual({version:1,districts:{queenstown:{[court.id]:{seconds:150,incidents:0,visits:1}}}});
  expect(s.savedSummary('pro')).toBe('Knows 1 district, 1 sector well · 0 games played');
  play('rager',true); expect(s.levels(region)).toEqual({}); walk();
  play('pro',false); expect(s.levels(region)).toEqual({});
  play('pro',true); expect(s.levels(region)[court.id]).toBe('knows well');
  s.game={pause:vi.fn(),resume:vi.fn(),line:vi.fn(),forgetPlan:vi.fn()};
  s.forget('rager'); expect(s.levels(region)[court.id]).toBe('knows well');
  s.forget('pro'); expect(s.game.forgetPlan).toHaveBeenCalledOnce(); expect(s.levels(region)).toEqual({});
  expect(s.savedSummary('pro')).toBe('Nothing learned yet · 0 games played'); s.stop();
  expect([...disk.values()]).toEqual(['real profile','sandbox profile']);
});

it('ignores corrupt versions, obsolete sectors and malformed counters while preserving valid neighbours',() => {
  for (const raw of ['oops','null','{}','[]','{"version":2,"districts":{}}']) expect(readLearning(raw)).toEqual({});
  const good={seconds:17,incidents:2,visits:1};
  expect(readLearning(JSON.stringify({version:1,districts:{atlantis:{known:good},queenstown:{
    [court.id]:good,unknown:good,station:{...good,seconds:-1},gateway:{...good,visits:'2'},dawson:{...good,notes:[]}
  }}}))).toEqual({queenstown:{[court.id]:good}});
});
