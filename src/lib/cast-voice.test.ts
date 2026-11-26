import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCastVoice } from './cast-voice';
import { castSpeaking, CAST_MIX } from './cast-mix';
import { createVolumeSetting } from './volume-setting';
import { createEncikAudio } from '../game/encik-audio';

const param = () => ({value:1,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
const node = () => ({connect:vi.fn((next:AudioNode)=>next),disconnect:vi.fn()});
const source = () => ({...node(),buffer:null,start:vi.fn(),stop:vi.fn(),onended:null as (()=>void)|null});
const pcmHeaders = {'X-Cast-PCM':'s16le;rate=24000;channels=1'};
const audio = () => new Response(new Uint8Array([1,128,19]),{headers:pcmHeaders});
function fixture() {
  const sources:ReturnType<typeof source>[] = [];
  const makeGain = () => ({...node(),context:{currentTime:1},gain:param()});
  const gains:ReturnType<typeof makeGain>[] = [];
  const context = Object.assign(new EventTarget(), {
    state:'running',currentTime:1,destination:{}, decodeAudioData:vi.fn(async()=>({duration:2})),
    createBuffer:vi.fn((_channels:number,length:number,_rate:number) => {
      const samples = new Float32Array(length); return {getChannelData:() => samples};
    }),
    createBufferSource() { const s = source(); sources.push(s); return s; },
    createGain() { const gain = makeGain(); gains.push(gain); return gain; },
    createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
  });
  const ctx = context as unknown as AudioContext;
  const fetcher = vi.fn(async (_url:RequestInfo | URL,_init?:RequestInit) => audio());
  const player = createCastVoice(vi.fn(),fetcher);
  const play = (line:string,current=()=>true) => player.play({line,personaId:'coach',ticket:line},ctx,current);
  return {sources,gains,context,ctx,fetcher,player,play};
}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{ vi.useRealTimers(); vi.unstubAllGlobals(); });
it('paces speech, replaces a single waiting line and releases the mix through the breath',async()=>{
  const h = fixture();
  h.play('first'); await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
  expect(h.sources[0].start).toHaveBeenCalledOnce();
  expect(h.context.createBuffer).toHaveBeenCalledWith(1,1,24000);
  expect(h.context.createBuffer.mock.results[0].value.getChannelData()[0]).toBe(-32767/32768);
  expect(castSpeaking()).toBe(true);
  h.play('older'); h.play('latest'); expect(h.fetcher).toHaveBeenCalledOnce();
  h.sources[0].onended!(); expect(castSpeaking()).toBe(false);
  await vi.advanceTimersByTimeAsync(CAST_MIX.breathMs-1);
  expect(h.fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(h.sources).toHaveLength(2);
  expect(JSON.parse(String(h.fetcher.mock.calls[1][1]?.body))).toMatchObject({line:'latest'});
  await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
  h.player.stop();
  expect(h.sources[1].stop).toHaveBeenCalledOnce(); expect(castSpeaking()).toBe(false);
  await h.player.idle();
});
it('aborts on timeout and stop, discards stale decodes and never retries',async()=>{
  const h = fixture();
  let finish!: (r:Response)=>void;
  h.fetcher.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  h.play('late');
  await vi.advanceTimersByTimeAsync(CAST_MIX.readyMs);
  expect(h.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  finish(audio()); await h.player.idle();
  let visible = true;
  h.play('stale',()=>visible); visible=false; await vi.advanceTimersByTimeAsync(0);
  let complete!: () => void;
  const response = audio();
  vi.spyOn(response,'arrayBuffer').mockImplementationOnce(()=>new Promise(resolve=>{complete=()=>resolve(new ArrayBuffer(2));}));
  h.fetcher.mockResolvedValueOnce(response);
  h.play('interrupted'); await vi.advanceTimersByTimeAsync(0);
  h.play('waiting'); h.player.stop(); complete(); await vi.advanceTimersByTimeAsync(0);
  expect(h.fetcher.mock.calls[2][1]?.signal?.aborted).toBe(true);
  expect(h.sources).toHaveLength(0); expect(h.fetcher).toHaveBeenCalledTimes(3);
  expect(castSpeaking()).toBe(false);
});
it('keeps the original effects graph, ducks from the slider, and restores the revised volume on hide',async()=>{
  const page = Object.assign(new EventTarget(),{hidden:false});
  vi.stubGlobal('document',page);
  const h = fixture(), effects = createVolumeSetting('test.cast.effects','effects');
  effects.set(.5); effects.output(h.ctx);
  const gain = h.gains[0].gain;
  expect(h.gains).toHaveLength(1); expect(gain.value).toBe(.5); expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  h.play('speak'); await vi.advanceTimersByTimeAsync(0);
  expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(.5*CAST_MIX.effects,1+CAST_MIX.attack);
  effects.set(.8);
  expect(gain.setTargetAtTime).toHaveBeenCalledWith(.8*CAST_MIX.effects,1,.02);
  await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
  page.hidden=true; page.dispatchEvent(new Event('visibilitychange'));
  expect(h.sources[0].stop).toHaveBeenCalledOnce();
  expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(.8,1+CAST_MIX.release);
  expect(castSpeaking()).toBe(false);
});
it('fades the current Encik clip before speech, suppresses new recordings, then restores the channel',async()=>{
  const h = fixture(), recordings = vi.fn(async()=>audio()), encik = createEncikAudio(()=>h.ctx,recordings);
  expect(await encik.play('first')).toBe(true);
  h.play('cast'); await vi.advanceTimersByTimeAsync(0);
  expect(h.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0,1+CAST_MIX.encikFade);
  expect(h.sources[0].stop).toHaveBeenCalledWith(1+CAST_MIX.encikFade);
  expect(CAST_MIX.encikFade).toBeLessThanOrEqual(CAST_MIX.lead);
  expect(await encik.play('during')).toBe(false); expect(recordings).toHaveBeenCalledOnce();
  h.player.stop(); expect(await encik.play('after')).toBe(true);
  encik.dispose();
});

function streamingFixture() {
  const h = fixture();
  const port = {postMessage:vi.fn(), close:vi.fn(), onmessage:null as null | ((e:{data:string}) => void)};
  const processor = {...node(),port,onprocessorerror:null as null | (()=>void)};
  vi.stubGlobal('AudioWorkletNode',class { constructor() { return processor; } });
  Object.assign(h.context,{audioWorklet:{addModule:vi.fn(async()=>{})}});
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  h.fetcher.mockResolvedValueOnce(new Response(new ReadableStream({start(c){stream=c;}}),{headers:pcmHeaders}));
  return {...h,processor,port,stream};
}
const leadBytes = 2 * 24000 * CAST_MIX.bufferLeadMs / 1000;

it.each(['end','network error','stop','processor error'])('streams the lead and releases speech and idle on %s',async ending => {
  const h = streamingFixture(), idle = vi.fn();
  h.play('long'); void h.player.idle().then(idle);
  h.stream.enqueue(new Uint8Array(leadBytes-1));
  await vi.advanceTimersByTimeAsync(100);
  expect(castSpeaking()).toBe(false);
  h.stream.enqueue(Uint8Array.of(0));
  await vi.advanceTimersByTimeAsync(0);
  expect(castSpeaking()).toBe(true);
  expect(h.port.postMessage).not.toHaveBeenCalledWith('play');
  await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
  expect(h.port.postMessage).toHaveBeenCalledWith('play');
  await vi.advanceTimersByTimeAsync(CAST_MIX.readyMs);
  expect(idle).not.toHaveBeenCalled();
  if (ending === 'stop') h.player.stop();
  else if (ending === 'processor error') h.processor.onprocessorerror!();
  else {
    if (ending === 'end') h.stream.close();
    else h.stream.error(new Error('broken transport'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.port.postMessage).toHaveBeenCalledWith('end');
    expect(castSpeaking()).toBe(true);
    h.port.onmessage!({data:'ended'});
  }
  expect(castSpeaking()).toBe(false);
  expect(h.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(h.port.close).toHaveBeenCalledOnce();
  if (ending !== 'stop') {
    await vi.advanceTimersByTimeAsync(CAST_MIX.breathMs-1);
    expect(idle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
  }
  await h.player.idle(); expect(idle).toHaveBeenCalledOnce();
});

it('rechecks caption and deadline during ducking before the first sample',async () => {
  for (const stale of ['caption','deadline']) {
    const h = streamingFixture();
    let current = true;
    h.play('stale',()=>current);
    if (stale === 'deadline') await vi.advanceTimersByTimeAsync(CAST_MIX.readyMs-50);
    h.stream.enqueue(new Uint8Array(leadBytes));
    await vi.advanceTimersByTimeAsync(0);
    if (stale === 'caption') current = false;
    await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
    expect(h.port.postMessage).not.toHaveBeenCalledWith('play');
    expect(castSpeaking()).toBe(false);
    await h.player.idle();
  }
});

it('uses the whole PCM fallback when the browser exposes no streaming body',async () => {
  const h = fixture();
  const response = audio(), pcm = await response.arrayBuffer();
  Object.defineProperty(response,'body',{value:null});
  vi.spyOn(response,'arrayBuffer').mockResolvedValue(pcm);
  h.fetcher.mockResolvedValueOnce(response);
  h.play('short'); await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
  expect(h.sources[0].start).toHaveBeenCalledOnce();
  h.player.stop();
});

it('releases the player at the worklet’s last render for a short line and a timed-out stall',async () => {
  const h = streamingFixture();
  type Processor = {port:MessagePort;process(inputs:Float32Array[][],outputs:Float32Array[][]):boolean};
  let Processor!: new (options:object) => Processor;
  let processor!: Processor;
  vi.stubGlobal('sampleRate',48000);
  vi.stubGlobal('AudioWorkletProcessor',class {
    port = {onmessage:null,postMessage:(data:string) => h.port.onmessage?.({data})};
  });
  vi.stubGlobal('registerProcessor',(_name:string, ctor:typeof Processor) => { Processor = ctor; });
  await import('./cast-pcm-worklet');
  vi.stubGlobal('AudioWorkletNode',class {
    constructor(_context:AudioContext,_name:string,options:object) {
      processor = new Processor(options);
      h.port.postMessage.mockImplementation(data => processor.port.onmessage?.call(processor.port,new MessageEvent('message',{data})));
      return h.processor;
    }
  });
  for (const ending of ['short','stall']) {
    let stream = h.stream;
    if (ending === 'stall') h.fetcher.mockResolvedValueOnce(new Response(new ReadableStream({start(c){stream=c;}}),{headers:pcmHeaders}));
    h.play(ending);
    stream.enqueue(new Uint8Array(ending === 'short' ? 121 : leadBytes));
    if (ending === 'short') stream.close();
    await vi.advanceTimersByTimeAsync(CAST_MIX.lead*1000);
    expect(castSpeaking()).toBe(true);
    const liveFrames = ending === 'short' ? 120 : 48000 * (CAST_MIX.bufferLeadMs + CAST_MIX.stallMs) / 1000;
    expect(processor.process([],[[new Float32Array(liveFrames-1)]])).toBe(true);
    expect(castSpeaking()).toBe(true);
    expect(processor.process([],[[new Float32Array(1)]])).toBe(false);
    expect(castSpeaking()).toBe(false);
    await vi.advanceTimersByTimeAsync(CAST_MIX.breathMs);
    await h.player.idle();
  }
});
