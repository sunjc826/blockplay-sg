import type { CastAudio } from './cast-stream';
import { beginCastSpeech, CAST_MIX } from './cast-mix';
import { getVoiceVolume, voiceOutput } from './voice-volume';
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

interface Turn { audio: CastAudio; context: AudioContext; deadline: number; current: () => boolean }

function playable(context: AudioContext | null | undefined) {
  return context?.state === 'running' && !globalThis.document?.hidden && getVoiceVolume() > 0;
}

export function createCastVoice() {
  let output:AudioNode|undefined, analyser:AnalyserNode|undefined, samples:Float32Array<ArrayBuffer>|undefined;
  function releaseMeter() {
    if(analyser){output?.disconnect(analyser);analyser.disconnect();}
    analyser=undefined;samples=undefined;
  }
  function level() {
    if(!output || output.context.state!=='running' || !getVoiceVolume())return 0;
    if(!analyser){
      analyser=output.context.createAnalyser();analyser.fftSize=512;
      samples=new Float32Array(analyser.fftSize);output.connect(analyser);
    }
    analyser.getFloatTimeDomainData(samples!);
    let power=0;for(const v of samples!)power+=v*v;
    return Math.sqrt(power/samples!.length);
  }
  let permission = new AbortController();
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let waiting: Turn | undefined;
  let cancel: (() => void) | undefined;
  let idle = Promise.resolve(), resolveIdle: (() => void) | undefined;

  function next() {
    clearTimeout(waitTimer);
    cancel = undefined;
    const queued = waiting;
    waiting = undefined;
    if (queued && !queued.audio.signal.aborted && playable(queued.context) && queued.deadline > Date.now() && queued.current()) start(queued);
    else { queued?.audio.cancel(); resolveIdle?.(); resolveIdle = undefined; }
  }

  function start(turn: Turn) {
    const {context, audio} = turn;
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
      audio.cancel();
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
      releaseMeter();output=undefined;
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
    const current = () => !done && !audio.signal.aborted && turn.current() && Date.now() < turn.deadline
      && playable(context);

    function cue(node: AudioNode, play: () => void) {
      if (release || done) return;
      if (!current()) { finish(false); return; }
      gain = context.createGain(); gain.gain.value = CAST_MIX.level;
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = CAST_MIX.threshold; compressor.knee.value = CAST_MIX.knee;
      compressor.ratio.value = CAST_MIX.ratio; compressor.attack.value = CAST_MIX.compressorAttack;
      compressor.release.value = CAST_MIX.compressorRelease;
      node.connect(gain).connect(compressor).connect(voiceOutput(context));
      output=compressor;
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
        const rate = 24000;
        const streaming = await loadProcessor(context);
        if (done) return;
        if (streaming) {
          try {
            worklet = new AudioWorkletNode(context, 'cast-pcm', {
              numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[1],
              processorOptions:{rate, leadMs:CAST_MIX.bufferLeadMs, stallMs:CAST_MIX.stallMs},
            });
          } catch { /* Module or constructor unavailable in this context. Play one buffer below. */ }
        }
        reader = audio.stream.getReader();
        if (worklet) {
          const node = worklet;
          node.onprocessorerror = () => finish(started);
          node.port.onmessage = ({data}) => { if (data === 'ended') finish(true); };
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
          const chunks: Uint8Array[] = [];
          let length = 0;
          while (!done) {
            const chunk = await reader.read();
            if (chunk.done) break;
            chunks.push(chunk.value);
            length += chunk.value.length;
          }
          if (!current() || length < 2) { finish(false); return; }
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
          const pcm = new DataView(bytes.buffer);
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
  function dropWaiting() {
    clearTimeout(waitTimer);
    waiting?.audio.cancel();
    waiting = undefined;
  }
  function stop() {
    permission.abort();
    permission = new AbortController();
    dropWaiting();
    cancel?.();
  }
  return {
    stop, level, releaseMeter,
    idle: () => idle,
    permission: (context: AudioContext | null | undefined) =>
      playable(context) ? permission.signal : undefined,
    play(audio: CastAudio, context: AudioContext | null, current: () => boolean) {
      if (audio.signal.aborted || !context || !playable(context) || !current()) { audio.cancel(); return; }
      const turn = {audio,context,current,deadline:Date.now()+CAST_MIX.readyMs};
      if (cancel) {
        dropWaiting();
        waiting = turn;
        waitTimer = setTimeout(dropWaiting,CAST_MIX.readyMs);
      } else {
        idle = new Promise<void>(resolve => { resolveIdle = resolve; });
        start(turn);
      }
    },
  };
}
