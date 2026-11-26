import {expect,it,vi} from 'vitest';
import {castDirector,CastFailure,hudEvents} from './ai-cast';
import type { FpsHud } from './fps-engine';
const scene = {mode:'range',regionId:'changi',snapshot:{health:100,armor:0,weapon:'test',magazine:2,reserve:3,stance:'standing',vehicle:'on-foot',score:0,seconds:30,streak:0}} as const;
it('batches, holds events in flight and enforces caption spacing',async()=>{
  let t=0, finish!: (v:{line:string})=>void;
  const req=vi.fn(()=>new Promise<{line:string}>(r=>{finish=r;})), speak=vi.fn(), d=castDirector(()=>t,req,speak,vi.fn());
  d.event('supplies'); await d.tick(scene);expect(req).not.toHaveBeenCalled();
  t=1500;const flight=d.tick(scene);d.event('death',true);await d.tick(scene);expect(req).toHaveBeenCalledTimes(1);
  finish({line:'One'});await flight;t=5499;await d.tick(scene);expect(req).toHaveBeenCalledTimes(1);
  t++;const next=d.tick(scene);expect(req.mock.lastCall).toEqual([scene,['death'],['One'],expect.anything()]);finish({line:'Two'});await next;
});
it('drops stale and invalidated replies and backs off until reset',async()=>{
  let t=0, resolve!: (v:{line:string})=>void;
  const req=vi.fn(()=>new Promise<{line:string}>(r=>{resolve=r;})),speak=vi.fn(),report=vi.fn();
  const d=castDirector(()=>t,req,speak,report);
  t=15000;let f=d.tick(scene);t+=6001;resolve({line:'late'});await f;
  d.event('new',true);f=d.tick(scene);d.reset();resolve({line:'old'});await f;expect(speak).not.toHaveBeenCalled();
  t+=15000;req.mockRejectedValueOnce(new CastFailure('Daily limit',t+60000));await d.tick(scene);
  expect(report).toHaveBeenCalledWith('Daily limit');d.event('major',true);t+=59999;await d.tick(scene);expect(req).toHaveBeenCalledTimes(3);
  t++;req.mockRejectedValueOnce(TypeError());await d.tick(scene);expect(report).toHaveBeenCalledWith('Cast connection interrupted');
});
it('bounds memory, carries it on travel, clears it on persona change',async()=>{
  let t=0,i=0;
  const req=vi.fn(async (..._args:unknown[])=>({line:String(++i)})),d=castDirector(()=>t,req,()=>{},()=>{});
  for(let n=0;n<32;n++){t+=15000;await d.tick(scene);}
  d.reset(true);t+=15000;await d.tick(scene);expect(req.mock.lastCall?.[2]).toEqual(Array.from({length:30},(_,n)=>String(n+3)));
  d.reset();t+=15000;await d.tick(scene);expect(req.mock.lastCall?.[2]).toEqual([]);
});
it('reads rapid cumulative damage, streaks, reloads, local comms, death and respawn',()=>{
  const add=vi.fn(),feed=hudEvents(add);
  const base={health:100,maxHealth:100,phase:'playing',comms:[],chain:0,vehicle:'on-foot'} as unknown as FpsHud;
  feed(base,0);feed({...base,health:99},50);feed({...base,health:80},300);
  feed({...base,health:65,chain:2,reloading:1,reloadEmpty:true,comms:[{id:1,at:400,channel:'system',source:'Field',text:'Supplies'}]},400);
  expect(add).toHaveBeenCalledWith('Health fell sharply to 65',true);expect(add).toHaveBeenCalledWith('2 elimination streak',true);
  expect(add).toHaveBeenCalledWith('Reloading an empty magazine');expect(add).toHaveBeenCalledWith('Field · Supplies');
  feed({...base,health:0},700);feed(base,1000);expect(add).toHaveBeenCalledWith('Player died',true);expect(add).toHaveBeenCalledWith('Player respawned',true);
});

it('holds incoming events until the spoken caption and breath have finished',async()=>{
  let now=0, ended!:()=>void;
  const req=vi.fn(async()=>({line:'Hello',ticket:'signed'}));
  const speak=vi.fn(()=>new Promise<void>(resolve=>{ ended=resolve; }));
  const director=castDirector(()=>now,req,speak,vi.fn());
  director.event('first',true); const active=director.tick(scene);
  await Promise.resolve(); expect(speak).toHaveBeenCalledWith('Hello','signed');
  now=10000; director.event('second',true); await director.tick(scene); expect(req).toHaveBeenCalledOnce();
  ended(); await active; speak.mockResolvedValueOnce();
  await director.tick(scene); expect(req).toHaveBeenCalledTimes(2);
});
