import { castMemory } from './ai-cast';
import { menuTrip } from './streamer-menu';
import type { FpsHud } from './fps-engine';
import type { Wallet } from './streamer-contract';

export type StreamPhase = 'off' | 'menu' | 'play' | 'paused';
export interface StreamSettings { personaId:string; clean:boolean; screenshots:boolean }

export function phaseForHud(hud: Pick<FpsHud,'phase'|'deathRecap'|'arenaSelf'>): 'menu' | 'play' {
  return hud.phase === 'deploying' || hud.phase === 'playing' && !hud.deathRecap && hud.arenaSelf?.alive !== false ? 'play' : 'menu';
}

/** Owns cancellation, hand-offs and memory for one tab. Nothing here is persisted. */
export function streamerSession() {
  const memory = castMemory(), listeners = new Set<() => void>();
  let state = {phase:'off' as StreamPhase, reason:'', caption:'', serial:0};
  let abort = new AbortController();
  let events: string[] = [];
  const set = (phase: StreamPhase, reason = '') => {
    abort.abort(); abort = new AbortController();
    state = {...state,phase,reason};
    listeners.forEach(fn => fn());
  };
  const session = {
    settings: {personaId:'pro',clean:false,screenshots:true}, trip:menuTrip(), memory,
    wallet:{credits:1600,tokens:300} as Wallet,
    game:null as {pause():void; resume():void; line(text:string):void} | null,
    snapshot: () => state, signal: () => abort.signal,
    subscribe(fn:()=>void) { listeners.add(fn); return () => {listeners.delete(fn);}; },
    start(settings:StreamSettings) {
      session.settings = {...settings}; memory.clear(); events = []; session.trip = menuTrip();
      state = {...state,caption:'',serial:state.serial+1}; set('menu');
    },
    stop(reason = '') {
      if (state.phase !== 'off') session.game?.pause();
      session.game = null; memory.clear(); events = []; state = {...state,caption:''}; set('off',reason);
    },
    pause() { if (state.phase === 'play' || state.phase === 'menu') { set('paused'); session.game?.pause(); } },
    resume() { if (state.phase === 'paused') { set('menu'); session.game?.resume(); } },
    handoff(phase:'menu'|'play') {
      if (state.phase === phase || state.phase === 'off' || state.phase === 'paused') return;
      if (phase === 'menu') { session.trip = menuTrip(); session.trip.note = events.slice(-2).join(' · ').slice(0,150)+' Choose the next solo activity or redeploy.'; }
      set(phase);
    },
    event(text:string) { events = [...events.slice(-19),text.replace(/\s+/g,' ').slice(0,240)]; },
    takeEvents() { const batch = events; events = []; return batch; },
    speak(text:string) {
      if (state.phase === 'off' || state.phase === 'paused') return;
      memory.remember(text); state = {...state,caption:text,serial:state.serial+1}; session.game?.line(text); listeners.forEach(fn => fn());
    },
    dismissCaption() { state = {...state,caption:''}; listeners.forEach(fn => fn()); },
  };
  return session;
}
