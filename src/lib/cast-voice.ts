import type { CastVoiceStatus } from './cast-client';
import { beginCastSpeech, CAST_MIX } from './cast-mix';
import { voiceOutput } from './voice-volume';
import processorUrl from './cast-pcm-worklet.ts?worker&url';

const modules = new WeakMap<AudioContext, Promise<boolean>>();
function loadProcessor(context: AudioContext) {
  if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') return false;
  let loaded = modules.get(context);
  if (!loaded) {
    loaded = context.audioWorklet.addModule(processorUrl).then(() => true, () => {
      modules.delete(context);
      return false;
    });
    modules.set(context, loaded);
  }
  return loaded;
}

interface Line { personaId: string; line: string; ticket: string }
interface Turn { line: Line; context: AudioContext; deadline: number; current: () => boolean }

export function createCastVoice(account: (voice: CastVoiceStatus) => void, fetcher = fetch) {
  let waiting: Turn | undefined;
  let cancel: (() => void) | undefined;
  let idle = Promise.resolve(), resolveIdle: (() => void) | undefined;

  function next() {
    cancel = undefined;
    const queued = waiting;
    waiting = undefined;
    if (queued && queued.context.state === 'running' && queued.deadline > Date.now() && queued.current() && !globalThis.document?.hidden) start(queued);
    else { resolveIdle?.(); resolveIdle = undefined; }
  }

  function start(turn: Turn) {
    const {context, line} = turn;
    const abort = new AbortController();
    let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined, compressor: DynamicsCompressorNode | undefined;
    let worklet: AudioWorkletNode | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let mixTimer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | undefined, done = false, started = false;
    let timer = setTimeout(() => finish(false), Math.max(0,turn.deadline-Date.now()));
    const visibility = () => { if (document.hidden) stop(); };
    const state = () => { if (context.state !== 'running') stop(); };

    function finish(breathe: boolean) {
      if (done) return;
      done = true;
      abort.abort();
      clearTimeout(timer);
      clearTimeout(mixTimer);
      void reader?.cancel().catch(() => {});
      if (worklet) {
        worklet.onprocessorerror = null;
        worklet.port.onmessage = null;
        worklet.port.postMessage('stop');
        worklet.port.close();
        worklet.disconnect();
      }
      if (source) { source.onended = null; if (started) source.stop(); source.disconnect(); }
      gain?.disconnect(); compressor?.disconnect(); release?.();
      const advance = () => {
        clearTimeout(timer);
        context.removeEventListener('statechange',state);
        globalThis.document?.removeEventListener('visibilitychange',visibility);
        next();
      };
      if (breathe) {
        cancel = advance;
        timer = setTimeout(advance, CAST_MIX.breathMs);
      } else advance();
    }
    const current = () => !done && turn.current() && Date.now() < turn.deadline
      && context.state === 'running' && !globalThis.document?.hidden;

    function cue(node: AudioNode, play: () => void) {
      if (release || done) return;
      if (!current()) { finish(false); return; }
      gain = context.createGain(); gain.gain.value = CAST_MIX.level;
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = CAST_MIX.threshold; compressor.knee.value = CAST_MIX.knee;
      compressor.ratio.value = CAST_MIX.ratio; compressor.attack.value = CAST_MIX.compressorAttack;
      compressor.release.value = CAST_MIX.compressorRelease;
      node.connect(gain).connect(compressor).connect(voiceOutput(context));
      release = beginCastSpeech();
      mixTimer = setTimeout(() => {
        if (!current()) { finish(false); return; }
        clearTimeout(timer);
        try { play(); started = true; } catch { finish(false); }
      }, CAST_MIX.lead * 1000);
    }
    cancel = () => finish(false);
    context.addEventListener('statechange',state);
    globalThis.document?.addEventListener('visibilitychange',visibility);
    void (async () => {
      try {
        const processorReady = loadProcessor(context);
        const response = await fetcher('/api/ai/voice', {
          method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
          signal:abort.signal, body:JSON.stringify(line),
        });
        if (done) return;
        if (!response.ok) {
          const error = await response.json();
          if (!done && error.voice) account(error.voice);
          finish(false); return;
        }
        const status = response.headers.get('X-Cast-Voice');
        if (status) account(JSON.parse(status));
        const format = /^s16le;rate=(24000|22050);channels=1$/.exec(response.headers.get('X-Cast-PCM') ?? '');
        if (!format) { finish(false); return; }
        const rate = Number(format[1]);
        const streaming = response.body?.getReader && await processorReady;
        if (done) return;
        if (streaming) {
          try {
            worklet = new AudioWorkletNode(context, 'cast-pcm', {
              numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[1],
              processorOptions:{rate, leadMs:CAST_MIX.bufferLeadMs, stallMs:CAST_MIX.stallMs},
            });
          } catch { /* Module or constructor unavailable in this context. Play one buffer below. */ }
        }
        if (worklet) {
          const node = worklet;
          node.onprocessorerror = () => finish(started);
          node.port.onmessage = ({data}) => { if (data === 'ended') finish(true); };
          reader = response.body!.getReader();
          const play = () => node.port.postMessage('play');
          let bytes = 0;
          try {
            while (!done) {
              const chunk = await reader.read();
              if (done || chunk.done) break;
              bytes += chunk.value.byteLength;
              node.port.postMessage(chunk.value);
              if (bytes >= 2 * rate * CAST_MIX.bufferLeadMs / 1000) cue(node, play);
            }
          } catch { /* An interrupted line still plays every complete sample received. */ }
          if (done) return;
          node.port.postMessage('end');
          if (bytes >= 2) cue(node, play);
          else finish(false);
        } else {
          const pcm = new DataView(await response.arrayBuffer());
          if (!current() || pcm.byteLength < 2) { finish(false); return; }
          const buffer = context.createBuffer(1, Math.floor(pcm.byteLength / 2), rate);
          const channel = buffer.getChannelData(0);
          for (let i = 0; i < channel.length; i++) channel[i] = pcm.getInt16(2 * i, true) / 32768;
          source = context.createBufferSource(); source.buffer = buffer;
          source.onended = () => finish(true);
          cue(source, () => source!.start());
        }
      } catch { finish(false); }
    })();
  }
  function stop() { waiting = undefined; cancel?.(); }
  return {
    stop,
    idle: () => idle,
    play(line: Line, context: AudioContext | null, current: () => boolean) {
      if (!context || context.state !== 'running' || !current() || globalThis.document?.hidden) return;
      const turn = {line,context,current,deadline:Date.now()+CAST_MIX.readyMs};
      if (cancel) waiting = turn;
      else {
        idle = new Promise<void>(resolve => { resolveIdle = resolve; });
        start(turn);
      }
    },
  };
}
