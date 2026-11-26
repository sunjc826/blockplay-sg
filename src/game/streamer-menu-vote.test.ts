import { afterEach, expect, it, vi } from 'vitest';
import { MENU_WAIT_MS, runMenu, waitFor, type MenuPoll } from './streamer-menu';
import { streamerSession } from './streamer-session';
import { applyViewerVote, POLL_VOTE_SECONDS } from './streamer-variety';
import type { MenuScreen } from './streamer-contract';

const picker:MenuScreen = {screenId:'single-player',title:'Solo',
  actions:['world','hardpoint','training-menu'].map(id => ({id,kind:'select',label:id}))};

function fixture(screen = picker) {
  vi.useFakeTimers();
  const session = streamerSession();
  session.start(session.settings);
  const request = vi.fn(async () => ({actionId:screen.actions[0].id,line:null}));
  const showPoll = vi.fn<(poll:MenuPoll|null)=>void>();
  const read = vi.fn<()=>MenuScreen|null>(() => screen);
  const io = {read,request,showPoll,now:Date.now,wait:waitFor,games:session.games,act:vi.fn(),speak:vi.fn()};
  const run = () => runMenu(io,session.trip,session.signal()).catch(error => error);
  const done = run();
  return {showPoll,request,read,session,done,run,card:() => showPoll.mock.lastCall![0]!};
}
afterEach(()=>vi.useRealTimers());

it('holds the first request, accepts one vote between ticks and reuses its final shares on reread',async()=>{
  const f = fixture();
  await vi.advanceTimersByTimeAsync(750+340);
  const {voting,rows} = f.card(), pick = rows[2].id;
  expect(f.request).not.toHaveBeenCalled();
  expect(voting!.seconds).toBe(POLL_VOTE_SECONDS);
  expect(voting!.vote('outside')).toBe(false);
  expect(voting!.vote(pick)).toBe(true);
  expect(voting!.vote(rows[0].id)).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(f.card()).toMatchObject({rows:applyViewerVote(rows,pick),viewerVote:pick,voting:undefined});
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.anything(),
    expect.objectContaining({poll:f.card().rows,viewerVote:pick}));
  await vi.advanceTimersByTimeAsync(750);
  expect(f.request).toHaveBeenCalledTimes(2);
  expect(f.showPoll.mock.calls.filter(([card]) => card?.voting)).toHaveLength(1);
  f.session.stop(); await f.done;
});
it('counts down once, sending the original shares with no viewer field when time runs out',async()=>{
  const f = fixture();
  await vi.advanceTimersByTimeAsync(750 + POLL_VOTE_SECONDS*1000 - 1);
  expect(f.showPoll.mock.calls.map(([poll])=>poll?.voting?.seconds)).toEqual([5,4,3,2,1]);
  const rows = f.card().rows, vote = f.card().voting!.vote;
  expect(f.request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.request).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.anything(),{poll:rows,history:expect.anything()});
  expect(vote(rows[0].id)).toBe(false);
  await vi.advanceTimersByTimeAsync(750);
  expect(f.request).toHaveBeenCalledTimes(2);
  f.session.stop(); await f.done;
});
it('sends non-poll requests at the usual menu pace',async()=>{
  const f = fixture({...picker,screenId:'store'});
  await vi.advanceTimersByTimeAsync(750);
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.showPoll.mock.calls).toEqual([[null]]);
  f.session.stop(); await f.done;
});
it('Stop cancels the open timer, rejects later input and sends no request',async()=>{
  const f = fixture();
  await vi.advanceTimersByTimeAsync(750);
  const {rows,voting} = f.card();
  f.session.stop();
  expect(voting!.vote(rows[0].id)).toBe(false);
  expect(await f.done).toMatchObject({name:'AbortError'});
  expect(f.card()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(f.request).not.toHaveBeenCalled();
});
it('does not reopen voting after a human pause and resume',async()=>{
  const f = fixture();
  await vi.advanceTimersByTimeAsync(750);
  f.session.pause(); await f.done;
  f.session.resume();
  const resumed = f.run();
  await vi.advanceTimersByTimeAsync(750);
  expect(f.showPoll.mock.calls.filter(([card]) => card?.voting)).toHaveLength(1);
  expect(f.request).toHaveBeenCalledOnce();
  f.session.stop(); await resumed;
});
it('grants the next loading screen its full readiness timeout after a voting window',async()=>{
  const f = fixture();
  await vi.advanceTimersByTimeAsync(750 + POLL_VOTE_SECONDS*1000);
  expect(f.request).toHaveBeenCalledOnce();
  f.read.mockReturnValue(null);
  await vi.advanceTimersByTimeAsync(MENU_WAIT_MS-750);
  expect(f.session.snapshot().phase).toBe('menu');
  f.read.mockReturnValue(picker);
  await vi.advanceTimersByTimeAsync(750);
  expect(f.request).toHaveBeenCalledTimes(2);
  f.session.stop(); await f.done;
});
