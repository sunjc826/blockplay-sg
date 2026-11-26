import { expect, it, vi } from 'vitest';
import type { MenuPoll } from '../game/streamer-menu';
import { handleStreamerInput } from './streamer-input';

function input(type:string,key?:string,control = false) {
  return {type,key,isTrusted:true,target:{closest:() => control},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};
}

it('consumes each numbered vote before takeover, and preserves the original keyboard rules once closed',() => {
  const session = {pause:vi.fn(),stop:vi.fn()}, vote = vi.fn(()=>true);
  const rows = ['hardpoint','world','training-menu'].map((id,i)=>({id,share:[45,35,20][i]}));
  const poll:MenuPoll = {screenId:'single-player',rows,voting:{seconds:5,vote}};
  for (const [index,row] of rows.entries()) {
    const event = input('keydown',String(index+1));
    handleStreamerInput(event as unknown as Event,poll,session);
    expect(vote).toHaveBeenLastCalledWith(row.id);
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  }
  expect(session.pause).not.toHaveBeenCalled();
  for (const key of ['1','2','3']) handleStreamerInput(input('keydown',key) as unknown as Event,{...poll,voting:undefined},session);
  handleStreamerInput(input('keydown','3') as unknown as Event,{...poll,rows:rows.slice(0,2)},session);
  expect(session.pause).toHaveBeenCalledTimes(4);
  handleStreamerInput(input('keydown','Escape',true) as unknown as Event,poll,session);
  expect(session.stop).toHaveBeenCalledOnce();
});
it('lets a pointer reach and click a vote button but preserves takeover for other clicks and closed cards',() => {
  const session = {pause:vi.fn(),stop:vi.fn()};
  const poll = {screenId:'single-player',rows:[],voting:{seconds:3,vote:vi.fn()}};
  for (const type of ['pointermove','pointerdown','pointerup','click']) {
    const event = input(type,undefined,type !== 'pointermove');
    handleStreamerInput(event as unknown as Event,poll,session);
    expect(event.preventDefault).not.toHaveBeenCalled();
  }
  expect(session.pause).not.toHaveBeenCalled();
  for (const card of [poll,{...poll,voting:undefined},null]) {
    handleStreamerInput(input('click') as unknown as Event,card,session);
  }
  for (const card of [poll,{...poll,voting:undefined},null]) {
    const move = {...input('pointermove'),buttons:0};
    handleStreamerInput(move as unknown as Event,card,session);
    expect(move.preventDefault).not.toHaveBeenCalled();
    expect(move.stopImmediatePropagation).not.toHaveBeenCalled();
  }
  expect(session.pause).toHaveBeenCalledTimes(3);
  handleStreamerInput({...input('pointermove'),buttons:1} as unknown as Event,null,session);
  expect(session.pause).toHaveBeenCalledTimes(4);
});
