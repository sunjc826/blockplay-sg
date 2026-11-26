import { afterEach, expect, it, vi } from 'vitest';
import { menuTrip, runMenu } from './streamer-menu';
import { streamerSession, phaseForHud } from './streamer-session';
import type { MenuScreen } from './streamer-contract';
import { profileScope } from './profile-scope';
import { claimElimination, createProfile, purchase, equip } from './armory-state';

const screen:MenuScreen = {screenId:'solo',title:'Solo',actions:[{id:'play',kind:'start',label:'Start'}]};
function menuFixture() {
  let now = 0;
  const abort = new AbortController(), trip = menuTrip();
  const io = {games:()=>[], showPoll:vi.fn(), read:vi.fn<()=>MenuScreen|null>(()=>screen), request:vi.fn(async()=>({actionId:'play',line:'Lets go.'})),
    act:vi.fn(async (_:MenuScreen,_id:string,_s:AbortSignal,commit:()=>void)=>commit()),speak:vi.fn(),
    wait:vi.fn(async (ms:number)=>{now+=ms;}), now:()=>now};
  return {abort,io,trip,run:()=>runMenu(io,trip,abort.signal)};
}
it('paces choices, stops on a third repeat, and keeps the trip limit on resume',async()=>{
  const f=menuFixture(); await expect(f.run()).rejects.toThrow('three times');
  expect(f.io.act).toHaveBeenCalledTimes(2); expect(f.io.speak).toHaveBeenCalledTimes(2);
  expect(f.io.now()).toBe(2250);
  const limit=menuFixture(); limit.trip.count=24;
  await expect(limit.run()).rejects.toThrow('25 menu actions'); expect(limit.io.act).toHaveBeenCalledOnce();
});
it('aborts pending work and stops on unavailable, disabled, changed, or missing screens',async()=>{
  const quota=menuFixture(); quota.io.request.mockRejectedValue(Error('Daily allowance reached'));
  await expect(quota.run()).rejects.toThrow('allowance'); expect(quota.io.act).not.toHaveBeenCalled();
  const invalid=menuFixture(); invalid.io.request.mockResolvedValue({actionId:'other',line:'bad'});
  await expect(invalid.run()).rejects.toThrow('unavailable'); expect(invalid.io.speak).not.toHaveBeenCalled();
  const disabled=menuFixture(); disabled.io.read.mockReturnValue({...screen,actions:[{...screen.actions[0],state:'disabled'}]});
  await expect(disabled.run()).rejects.toThrow('no available'); expect(disabled.io.request).not.toHaveBeenCalled();
  const late=menuFixture(); late.io.request.mockImplementation(async()=>{late.abort.abort();return {actionId:'play',line:'late'};});
  await expect(late.run()).rejects.toThrow(); expect(late.io.act).not.toHaveBeenCalled();
  const stale=menuFixture(); stale.io.act.mockRejectedValue(Error('Control changed')); await expect(stale.run()).rejects.toThrow('changed');
  const missing=menuFixture(); missing.io.read.mockReturnValue(null); await expect(missing.run()).rejects.toThrow('did not become ready');
});
it('hands off through deployment, death, respawn and round end, preserving memory and cancelling old turns',()=>{
  const s=streamerSession(), settings={personaId:'pro',clean:true,screenshots:false};
  s.start(settings); const game={pause:vi.fn(),resume:vi.fn(),line:vi.fn()};s.game=game;
  for(let n=0;n<32;n++)s.speak('line '+n);
  const hud = {phase:'playing' as const,arenaSelf:null,deathRecap:null};
  for (const phase of ['ready','deploying','playing','defeated','playing','complete'] as const) {
    const wanted = phaseForHud({...hud,phase}), old=s.signal(), before=s.snapshot().phase;
    s.handoff(wanted); expect(s.snapshot().phase).toBe(['ready','complete','defeated'].includes(phase)?'menu':'play');
    expect(old.aborted).toBe(before!==wanted);
  }
  expect(phaseForHud({...hud,deathRecap:{} as never})).toBe('menu');
  expect(phaseForHud({...hud,arenaSelf:{alive:false} as never})).toBe('menu');
  s.pause(); s.handoff('play'); s.speak('late');expect(s.snapshot().phase).toBe('paused');
  s.resume();expect(game.resume).toHaveBeenCalledOnce();expect(s.memory.read()).toHaveLength(30);expect(s.memory.read()[0]).toBe('line 2');
  s.start({...settings,personaId:'rager'});expect(s.memory.read()).toEqual([]);
  s.speak('new voice');s.stop();s.handoff('play');expect(s.snapshot().phase).toBe('off');expect(s.memory.read()).toEqual([]);
});
afterEach(()=>vi.unstubAllGlobals());
it('isolates wallet, purchases, equipment and earned XP across stop, late saves and interrupted tabs',()=>{
  const disk = new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>disk.get(k)??null,setItem:(k:string,v:string)=>disk.set(k,v)});
  const player=profileScope(),sandbox=profileScope(true);
  player.save({...createProfile(),credits:729,xp:500});
  const original=disk.get(player.key);
  const fresh=sandbox.load();expect(fresh).toMatchObject({credits:1600,tokens:300,xp:0});
  const bought=purchase(fresh,'plate-soft');expect(bought.profile.credits).toBeLessThan(fresh.credits);
  const gear=equip(bought.profile,'plate-soft',0);expect(gear.plate).toBe('plate-soft');
  sandbox.save(claimElimination(gear,'sandbox-kill'));
  expect(profileScope().load()).toMatchObject({credits:729,xp:500,plate:'plate-none'});
  expect(profileScope(true).load()).toMatchObject({xp:25,plate:'plate-soft'});
  sandbox.save({...gear,credits:1});expect(disk.get(player.key)).toBe(original);
  expect(streamerSession().snapshot().phase).toBe('off');
});

it('plays supplied audio in an opted-in session and interrupts every phase hand-off',()=>{
  const session = streamerSession();
  const settings = {personaId:'pro',clean:true,screenshots:false};
  session.voiceLine = vi.fn(); session.interrupt = vi.fn();
  const audio={stream:new ReadableStream<Uint8Array>(),signal:new AbortController().signal,cancel:vi.fn()};
  session.start(settings); session.speak('Caption',audio); expect(audio.cancel).toHaveBeenCalledOnce(); expect(session.voiceLine).not.toHaveBeenCalled();
  session.start({...settings,voice:true}); session.speak('Silent caption'); expect(session.voiceLine).not.toHaveBeenCalled();
  session.speak('Store line',audio);
  expect(session.snapshot().caption).toBe('Store line');
  expect(session.voiceLine).toHaveBeenLastCalledWith('Store line',audio);
  vi.mocked(session.interrupt).mockClear();
  session.handoff('play'); session.handoff('play'); session.speak('Game line',audio);
  expect(session.voiceLine).toHaveBeenLastCalledWith('Game line',audio);
  session.pause(); session.speak('Late',audio); session.resume(); session.stop();
  expect(session.voiceLine).toHaveBeenCalledTimes(2); expect(session.interrupt).toHaveBeenCalledTimes(4);
});
