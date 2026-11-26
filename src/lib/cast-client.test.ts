import { expect, test, vi } from 'vitest';
import { CastFailure } from '../game/ai-cast';
import { requestCast } from './cast-client';

const quota = { used: 1, limit: 1000, resetsAt: 0 };
const reply = (status: number, body: object) => new Response(JSON.stringify({ quota, ...body }), { status });

test('a "too many at once" refusal is waited out and retried, not surfaced', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply(429, { error: 'Concurrent calls', transient: true, resetsAt: Date.now() + 60000 }))
      .mockResolvedValueOnce(reply(200, { line: 'Steady.' }));
    const asked = requestCast('commentary', {}, new AbortController().signal, () => {}, fetcher);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(asked).resolves.toMatchObject({ line: 'Steady.' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

test('it gives up quietly after a few tries, and a daily limit is not retried at all', async () => {
  vi.useFakeTimers();
  try {
    const busy = vi.fn<typeof fetch>(async () => reply(429, { error: 'Concurrent calls', transient: true, resetsAt: Date.now() + 2000 }));
    const asked = requestCast('commentary', {}, new AbortController().signal, () => {}, busy).catch(e => e);
    await vi.advanceTimersByTimeAsync(20000);
    const failure = await asked;
    expect(failure).toBeInstanceOf(CastFailure); expect(failure.transient).toBe(true); expect(busy).toHaveBeenCalledTimes(4);

    const daily = vi.fn<typeof fetch>(async () => reply(429, { error: 'IP daily limit', resetsAt: Date.now() + 3600000 }));
    const refused = await requestCast('commentary', {}, new AbortController().signal, () => {}, daily).catch(e => e);
    expect(refused.transient).toBe(false); expect(refused.message).toContain('IP daily limit'); expect(daily).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

import { CAST_CONTENT_TYPE, CAST_PCM } from '../game/cast-wire';
import { createCastVoice } from './cast-voice';

function framed() {
  const header=Buffer.from(JSON.stringify({line:'来了 🎙',pcm:CAST_PCM,quota}));
  const size=Buffer.alloc(4); size.writeUInt32BE(header.length);
  return Buffer.concat([size,header]);
}
test.each([1,3,19,2048])('parses a complete UTF-8 header at %i-byte boundaries with PCM still pending',async step=>{
  const prefix=framed(), bytes=Buffer.concat([prefix,Buffer.from([1,0,255])]);
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const source=new ReadableStream<Uint8Array>({start(c){controller=c;}});
  const account=vi.fn(), signal=new AbortController().signal;
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(source,{headers:{'Content-Type':CAST_CONTENT_TYPE}}));
  const request=requestCast('streamer',{phase:'menu'},signal,account,fetcher,()=>signal);
  for(let i=0;i<bytes.length;i+=step) controller.enqueue(bytes.subarray(i,i+step));
  const result=await request;
  expect(result.line).toBe('来了 🎙');
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({phase:'menu',spoken:true});
  expect(account).toHaveBeenCalledOnce();
  controller.enqueue(Uint8Array.of(7)); controller.close();
  expect(new Uint8Array(await new Response(result.audio!.stream).arrayBuffer())).toEqual(Uint8Array.of(1,0,255,7));
  result.audio!.cancel();
});
test('switching Voice off while waiting preserves the caption and cancels the body',async()=>{
  const player=createCastVoice(),ctx={state:'running'} as AudioContext;
  const cancelled=vi.fn();
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const source=new ReadableStream<Uint8Array>({start(c){controller=c;},cancel:cancelled});
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(source,{headers:{'Content-Type':CAST_CONTENT_TYPE}}));
  const asked=requestCast('commentary',{},new AbortController().signal,()=>{},fetcher,()=>player.permission(ctx));
  player.stop();
  controller.enqueue(framed());
  const result=await asked;
  expect(result.line).toBe('来了 🎙'); expect(result.audio).toBeUndefined();
  expect(cancelled).toHaveBeenCalledOnce();
});
test('parses the whole response when the browser exposes no streaming body',async()=>{
  const data=Buffer.concat([framed(),Buffer.from([42,0])]);
  const response=new Response(data,{headers:{'Content-Type':CAST_CONTENT_TYPE}});
  Object.defineProperty(response,'body',{value:null});
  vi.spyOn(response,'arrayBuffer').mockResolvedValue(Uint8Array.from(data).buffer);
  const signal=new AbortController().signal;
  const reply=await requestCast('commentary',{},signal,vi.fn(),async()=>response,()=>signal);
  expect(reply.line).toBe('来了 🎙');
  expect(new Uint8Array(await new Response(reply.audio!.stream).arrayBuffer())).toEqual(Uint8Array.of(42,0));
  reply.audio!.cancel();
});
test('an older server can reject the speech flag and still deliver the decision as plain JSON',async()=>{
  const ask=vi.fn<typeof fetch>()
    .mockResolvedValueOnce(reply(400,{error:'Invalid game observation'}))
    .mockResolvedValueOnce(reply(200,{actionId:'enter',line:'Go.'}));
  const signal=new AbortController().signal;
  const result=await requestCast('streamer',{phase:'menu'},signal,vi.fn(),ask,()=>signal);
  expect(result).toMatchObject({actionId:'enter',line:'Go.'});
  expect(ask.mock.calls.map(([,init])=>JSON.parse(String(init?.body)))).toEqual([{phase:'menu',spoken:true},{phase:'menu'}]);
});
