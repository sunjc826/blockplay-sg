import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCastVoice } from './cast-voice';
import { castSpeaking, CAST_MIX } from './cast-mix';
import { createVolumeSetting } from './volume-setting';
import { createEncikAudio } from '../game/encik-audio';

const param = () => ({value:1,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
const node = () => ({connect:vi.fn((next:AudioNode)=>next),disconnect:vi.fn()});
const source = () => ({...node(),buffer:null,start:vi.fn(),stop:vi.fn(),onended:null as (()=>void)|null});
const audio = () => new Response(new Uint8Array([1,2]));
function fixture() {
  const sources:ReturnType<typeof source>[] = [];
  const makeGain = () => ({...node(),context:{currentTime:1},gain:param()});
  const gains:ReturnType<typeof makeGain>[] = [];
  const context = Object.assign(new EventTarget(), {
    state:'running',currentTime:1,destination:{}, decodeAudioData:vi.fn(async()=>({duration:2})),
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
  expect(h.sources[0].start).toHaveBeenCalledWith(1+CAST_MIX.lead);
  expect(castSpeaking()).toBe(true);
  h.play('older'); h.play('latest'); expect(h.fetcher).toHaveBeenCalledOnce();
  h.sources[0].onended!(); expect(castSpeaking()).toBe(false);
  await vi.advanceTimersByTimeAsync(CAST_MIX.breathMs-1);
  expect(h.fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(h.sources).toHaveLength(2);
  expect(JSON.parse(String(h.fetcher.mock.calls[1][1]?.body))).toMatchObject({line:'latest'});
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
  let decode!: (buffer:{duration:number})=>void;
  h.context.decodeAudioData.mockImplementationOnce(()=>new Promise(resolve=>{decode=resolve;}));
  h.play('interrupted'); await vi.advanceTimersByTimeAsync(0);
  h.play('waiting'); h.player.stop(); decode({duration:1}); await vi.advanceTimersByTimeAsync(0);
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
