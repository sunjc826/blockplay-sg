import type { CastAudio } from '../lib/cast-stream';
import { playHistory, readHistory, type GameLocation, type GameStats } from './streamer-history';
import { familiarity, learningSummary, readLearning } from './streamer-familiarity';
import type { RegionId } from './region-ids';
import type { ZoneSector } from './zone-sectors';
import { sessionNotes } from './streamer-notes';
import { castMemory } from './ai-cast';
import { menuTrip } from './streamer-menu';
import type { FpsHud } from './fps-engine';
import type { Wallet } from './streamer-contract';

export type StreamPhase = 'off' | 'menu' | 'play' | 'paused';
export interface StreamSettings { personaId:string; clean:boolean; screenshots:boolean; facecam?:boolean; voice?:boolean; keepLearning?:boolean }

export function phaseForHud(hud: Pick<FpsHud,'phase'|'deathRecap'|'arenaSelf'>): 'menu' | 'play' {
  return hud.phase === 'deploying' || hud.phase === 'playing' && !hud.deathRecap && hud.arenaSelf?.alive !== false ? 'play' : 'menu';
}

export const learningKey = (persona:string) => 'blockplay.streamer.learning.v1.'+persona;
export const historyKey = (persona:string) => 'blockplay.streamer.history.v1.'+persona;
function savedHistory(persona:string) {
  try { return readHistory(localStorage.getItem(historyKey(persona))); } catch { return []; }
}
function savedLearning(persona:string) {
  try { return readLearning(localStorage.getItem(learningKey(persona))); } catch { return {}; }
}
/** Owns cancellation, hand-offs and the active persona's learning for one tab. */
export function streamerSession() {
  const notes = sessionNotes(), memory = castMemory(), listeners = new Set<() => void>();
  let state = {phase:'off' as StreamPhase, reason:'', caption:'', serial:0};
  let learning = familiarity(), dirty = false, lastSave = 0;
  let history = playHistory(), historyDirty = false, historySavedAt = 0;
  let currentRun:object|null = null, forgottenRun:object|null = null;
  let abort = new AbortController();
  let physical:string[]=[];
  let events: string[] = [];
  const set = (phase: StreamPhase, reason = '') => {
    learning.suspend();
    saveLearning(); saveHistory();
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
  function saveHistory() {
    if (!historyDirty || !session.settings.keepLearning) return;
    try {
      localStorage.setItem(historyKey(session.settings.personaId),history.serialize());
      historyDirty = false; historySavedAt = Date.now();
    } catch { /* Keep session history if storage is unavailable. */ }
  }
  const session = {
    settings: {personaId:'pro',clean:false,screenshots:true,voice:false} as StreamSettings, trip:menuTrip(), memory, notes, started:0,
    levels:(region:RegionId) => learning.levels(region),
    games:() => history.games(),
    recordGame(run:object,location:GameLocation,seconds:number,stats:GameStats) {
      if (state.phase === 'off' || state.phase === 'paused' || run === forgottenRun) return;
      currentRun = run;
      const checkpoint = history.sample(run,location,seconds,stats,Date.now());
      historyDirty = true;
      if (checkpoint || Date.now()-historySavedAt >= 10000) saveHistory();
    },
    savedSummary(persona:string) {
      const games = state.phase !== 'off' && session.settings.personaId === persona ? history.games() : savedHistory(persona);
      return learningSummary(savedLearning(persona))+' · '+games.length+(games.length === 1 ? ' game played' : ' games played');
    },
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
      if (value) { saveLearning(); saveHistory(); }
    },
    forget(persona:string) {
      try { localStorage.removeItem(learningKey(persona)); localStorage.removeItem(historyKey(persona)); } catch { /* Session reset still applies. */ }
      if (state.phase !== 'off' && session.settings.personaId === persona) {
        history = playHistory(); historyDirty = false; forgottenRun = currentRun;
        learning = familiarity(); dirty = false;
        events = events.filter(text => !text.startsWith('Map familiarity ·'));
        session.game?.forgetPlan?.();
      }
      state = {...state}; listeners.forEach(fn => fn());
    },
    wallet:{credits:1600,tokens:300} as Wallet,
    interrupt: () => {},
    voiceLine: (_text:string,_audio:CastAudio) => {},
    game:null as {pause():void; resume():void; line(text:string):void; forgetPlan?():void} | null,
    snapshot: () => state, signal: () => abort.signal,
    subscribe(fn:()=>void) { listeners.add(fn); return () => {listeners.delete(fn);}; },
    start(settings:StreamSettings) {
      saveHistory(); history = playHistory(settings.keepLearning ? savedHistory(settings.personaId) : []); historyDirty = false;
      currentRun = forgottenRun = null;
      saveLearning(); learning = familiarity(settings.keepLearning ? savedLearning(settings.personaId) : {}); dirty = false;
      session.started = Date.now(); session.settings = {...settings}; notes.clear(); memory.clear(); events = []; physical=[]; session.trip = menuTrip();
      state = {...state,caption:'',serial:state.serial+1}; set('menu');
    },
    stop(reason = '') {
      if (state.phase !== 'off') session.game?.pause();
      saveHistory(); history = playHistory(); historyDirty = false; currentRun = forgottenRun = null;
      saveLearning(); learning = familiarity(); dirty = false;
      session.game = null; notes.clear(); memory.clear(); events = []; physical=[]; state = {...state,caption:''}; set('off',reason);
    },
    pause() { if (state.phase === 'play' || state.phase === 'menu') { set('paused'); session.game?.pause(); } },
    resume() { if (state.phase === 'paused') { set('menu'); session.game?.resume(); } },
    handoff(phase:'menu'|'play') {
      if (state.phase === phase || state.phase === 'off' || state.phase === 'paused') return;
      if (phase === 'menu') { learning.leave(); session.trip = menuTrip(); session.trip.note = events.slice(-2).join(' · ').slice(0,150)+' Choose the next solo activity or redeploy.'; }
      set(phase);
    },
    event(text:string) { events = [...events.slice(-19),text.replace(/\s+/g,' ').slice(0,240)]; },
    physicalMoment(text:string) { physical=[...physical.slice(-2),text.slice(0,120)]; },
    menuNote(note:string) {
      if(!physical.length)return note;
      const moment=physical.at(-1)!;physical=[];
      return note.slice(0,237-moment.length)+' · '+moment;
    },
    takeEvents() { const batch = physical.length ? [...events,...physical].slice(-20) : events; physical=[]; events = []; return batch; },
    speak(text:string,audio?:CastAudio) {
      if (state.phase === 'off' || state.phase === 'paused') { audio?.cancel(); return; }
      memory.remember(text); state = {...state,caption:text,serial:state.serial+1}; session.game?.line(text); listeners.forEach(fn => fn());
      if (audio && session.settings.voice) session.voiceLine(text,audio);
      else audio?.cancel();
    },
    dismissCaption() { state = {...state,caption:''}; listeners.forEach(fn => fn()); },
  };
  return session;
}
