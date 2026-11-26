import { familiarity, learningSummary, readLearning } from './streamer-familiarity';
import type { RegionId } from './region-ids';
import type { ZoneSector } from './zone-sectors';
import { sessionNotes } from './streamer-notes';
import { castMemory } from './ai-cast';
import { menuTrip } from './streamer-menu';
import type { FpsHud } from './fps-engine';
import type { Wallet } from './streamer-contract';

export type StreamPhase = 'off' | 'menu' | 'play' | 'paused';
export interface StreamSettings { personaId:string; clean:boolean; screenshots:boolean; voice?:boolean; keepLearning?:boolean }

export function phaseForHud(hud: Pick<FpsHud,'phase'|'deathRecap'|'arenaSelf'>): 'menu' | 'play' {
  return hud.phase === 'deploying' || hud.phase === 'playing' && !hud.deathRecap && hud.arenaSelf?.alive !== false ? 'play' : 'menu';
}

export const learningKey = (persona:string) => 'blockplay.streamer.learning.v1.'+persona;
function savedLearning(persona:string) {
  try { return readLearning(localStorage.getItem(learningKey(persona))); } catch { return {}; }
}
/** Owns cancellation, hand-offs and the active persona's learning for one tab. */
export function streamerSession() {
  const notes = sessionNotes(), memory = castMemory(), listeners = new Set<() => void>();
  let state = {phase:'off' as StreamPhase, reason:'', caption:'', serial:0};
  let learning = familiarity(), dirty = false, lastSave = 0;
  let abort = new AbortController();
  let events: string[] = [];
  const set = (phase: StreamPhase, reason = '') => {
    learning.suspend();
    saveLearning();
    session.interrupt();
    abort.abort(); abort = new AbortController();
    state = {...state,phase,reason};
    listeners.forEach(fn => fn());
  };
  function saveLearning() {
    if (!dirty || !session.settings.keepLearning) return;
    try {
      localStorage.setItem(learningKey(session.settings.personaId),learning.serialize());
      dirty = false; lastSave = Date.now();
      state = {...state}; listeners.forEach(fn => fn());
    }
    catch { /* Storage may be unavailable. Keep playing with in-memory learning. */ }
  }
  const session = {
    settings: {personaId:'pro',clean:false,screenshots:true,voice:false} as StreamSettings, trip:menuTrip(), memory, notes, started:0,
    levels:(region:RegionId) => learning.levels(region),
    savedSummary:(persona:string) => learningSummary(savedLearning(persona)),
    leaveSector:() => learning.leave(),
    observe(region:RegionId,sector:ZoneSector|null,time:number,alive:boolean,kind?:'fight'|'death'|'supply') {
      if (state.phase !== 'play') return;
      if (!alive) learning.suspend();
      const result = learning.sample(region,sector?.id ?? null,time,alive || kind === 'death',!!kind);
      if (!alive) learning.leave();
      if (!result) return;
      dirty = true;
      if (result.promoted) session.event('Map familiarity · '+sector!.name+' · '+result.promoted);
      if (result.promoted || Date.now()-lastSave >= 10000) saveLearning();
    },
    keepLearning(value:boolean) {
      session.settings = {...session.settings,keepLearning:value};
      if (value) saveLearning();
    },
    forget(persona:string) {
      try { localStorage.removeItem(learningKey(persona)); } catch { /* Session reset still applies. */ }
      if (state.phase !== 'off' && session.settings.personaId === persona) {
        learning = familiarity(); dirty = false;
        events = events.filter(text => !text.startsWith('Map familiarity ·'));
        session.game?.forgetPlan?.();
      }
      state = {...state}; listeners.forEach(fn => fn());
    },
    wallet:{credits:1600,tokens:300} as Wallet,
    interrupt: () => {},
    voiceLine: (_text:string,_ticket:string) => {},
    game:null as {pause():void; resume():void; line(text:string):void; forgetPlan?():void} | null,
    snapshot: () => state, signal: () => abort.signal,
    subscribe(fn:()=>void) { listeners.add(fn); return () => {listeners.delete(fn);}; },
    start(settings:StreamSettings) {
      saveLearning(); learning = familiarity(settings.keepLearning ? savedLearning(settings.personaId) : {}); dirty = false;
      session.started = Date.now(); session.settings = {...settings}; notes.clear(); memory.clear(); events = []; session.trip = menuTrip();
      state = {...state,caption:'',serial:state.serial+1}; set('menu');
    },
    stop(reason = '') {
      if (state.phase !== 'off') session.game?.pause();
      saveLearning(); learning = familiarity(); dirty = false;
      session.game = null; notes.clear(); memory.clear(); events = []; state = {...state,caption:''}; set('off',reason);
    },
    pause() { if (state.phase === 'play' || state.phase === 'menu') { set('paused'); session.game?.pause(); } },
    resume() { if (state.phase === 'paused') { set('menu'); session.game?.resume(); } },
    handoff(phase:'menu'|'play') {
      if (state.phase === phase || state.phase === 'off' || state.phase === 'paused') return;
      if (phase === 'menu') { learning.leave(); session.trip = menuTrip(); session.trip.note = events.slice(-2).join(' · ').slice(0,150)+' Choose the next solo activity or redeploy.'; }
      set(phase);
    },
    event(text:string) { events = [...events.slice(-19),text.replace(/\s+/g,' ').slice(0,240)]; },
    takeEvents() { const batch = events; events = []; return batch; },
    speak(text:string,ticket?:string) {
      if (state.phase === 'off' || state.phase === 'paused') return;
      memory.remember(text); state = {...state,caption:text,serial:state.serial+1}; session.game?.line(text); listeners.forEach(fn => fn());
      if (ticket && session.settings.voice) session.voiceLine(text,ticket);
    },
    dismissCaption() { state = {...state,caption:''}; listeners.forEach(fn => fn()); },
  };
  return session;
}
