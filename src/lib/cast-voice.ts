import type { CastVoiceStatus } from './cast-client';
import { beginCastSpeech, CAST_MIX } from './cast-mix';
import { voiceOutput } from './voice-volume';

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
    if (queued && queued.deadline > Date.now() && queued.current() && !globalThis.document?.hidden) start(queued);
    else { resolveIdle?.(); resolveIdle = undefined; }
  }

  function start(turn: Turn) {
    const {context, line} = turn;
    const abort = new AbortController();
    let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined, compressor: DynamicsCompressorNode | undefined;
    let release: (() => void) | undefined, done = false, started = false;
    let timer = setTimeout(() => finish(false), Math.max(0,turn.deadline-Date.now()));
    const visibility = () => { if (document.hidden) stop(); };
    const state = () => { if (context.state !== 'running') stop(); };

    function finish(breathe: boolean) {
      if (done) return;
      done = true;
      abort.abort();
      clearTimeout(timer);
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
    cancel = () => finish(false);
    context.addEventListener('statechange',state);
    globalThis.document?.addEventListener('visibilitychange',visibility);
    void (async () => {
      try {
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
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (done) return;
        if (!turn.current() || Date.now() >= turn.deadline || context.state !== 'running' || globalThis.document?.hidden) { finish(false); return; }
        clearTimeout(timer);
        source = context.createBufferSource(); source.buffer = buffer;
        gain = context.createGain(); gain.gain.value = CAST_MIX.level;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = CAST_MIX.threshold; compressor.knee.value = CAST_MIX.knee;
        compressor.ratio.value = CAST_MIX.ratio; compressor.attack.value = CAST_MIX.compressorAttack;
        compressor.release.value = CAST_MIX.compressorRelease;
        source.connect(gain).connect(compressor).connect(voiceOutput(context));
        release = beginCastSpeech();
        source.onended = () => finish(true);
        source.start(context.currentTime + CAST_MIX.lead);
        started = true;
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
