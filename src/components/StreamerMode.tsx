import { holdCaption } from '../game/caption-time';
import { createCastVoice } from '../lib/cast-voice';
import { CastVoiceSwitch } from './CastVoiceSwitch';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CAST_PERSONAS, castPersona } from '../game/ai-cast-personas';
import { CastFailure, hudEvents } from '../game/ai-cast';
import type { CastMode } from '../game/cast-contract';
import type { RegionId } from '../game/region-ids';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import type { PilotPlan } from '../game/pilot-strategy-contract';
import { streamerPilotStrategy } from '../game/streamer-strategy';
import { phaseForHud, streamerSession } from '../game/streamer-session';
import { runMenu, waitFor } from '../game/streamer-menu';
import { castResetTime, requestCast, type CastAccounting, type CastQuota, type CastVoiceStatus } from '../lib/cast-client';
import { clickStreamerAction, readStreamerScreen } from '../lib/streamer-screen';
import { useModalFocus } from '../lib/use-modal-focus';
import { requestLeave } from '../lib/navigation-guard';
import './streamer-mode.css';

const voices = CAST_PERSONAS.filter(p => p.role === 'streamer');
function controller() {
  const session = streamerSession();
  const key = 'blockplay-sg-streamer-v1';
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    session.settings = {personaId:castPersona(saved.personaId)?.role === 'streamer' ? saved.personaId : 'pro',
      clean:saved.clean === true, screenshots:saved.screenshots !== false, voice:saved.voice === true};
  } catch { /* Use the session defaults. */ }
  const s = Object.assign(session, {
    engine:null as FpsEngine|null, menuAudio:null as AudioContext|null,
    save() { try { localStorage.setItem(key,JSON.stringify(s.settings)); } catch { /* session only */ } },
    voiceAccount: (_voice:CastVoiceStatus) => {},
    player:createCastVoice(voice => s.voiceAccount(voice)),
    unlock() {
      if (!s.settings.voice) return;
      try {
        s.engine?.getCastAudio(true);
        // Reserve a gesture-unlocked context for store visits after the game context closes.
        s.menuAudio ??= new AudioContext();
        void s.menuAudio.resume().catch(() => {});
      } catch { /* Captions work without Web Audio. */ }
    },
    closeAudio() { s.player.stop(); void s.menuAudio?.close().catch(() => {}); s.menuAudio = null; },
    dock: (_node:HTMLDivElement|null) => {},
    nextPlan:0,
    startRegion:undefined as RegionId | undefined,
    account: (_result:CastAccounting) => {},
    open: (_region?:RegionId) => {},
  });
  session.interrupt = s.player.stop;
  session.voiceLine = (line,ticket) => {
    const serial = s.snapshot().serial;
    const context = s.engine?.castMuted ? null : s.engine?.getCastAudio() ?? s.menuAudio;
    s.player.play({line,personaId:s.settings.personaId,ticket},context,() =>
      s.snapshot().serial === serial && !!s.snapshot().caption && !s.signal().aborted && !!s.settings.voice);
  };
  return s;
}
const Context = createContext<ReturnType<typeof controller>|null>(null);
export const SoloStreamer = createContext(false);
export const useStreamer = () => useContext(Context);
const idle = () => false, noop = () => () => {};
export function useStreamerActive() {
  const s = useStreamer();
  return useSyncExternalStore(s?.subscribe ?? noop,s ? () => s.snapshot().phase !== 'off' : idle,idle);
}

export function StreamerDock() {
  const s = useStreamer();
  return <div className="streamer-dock" ref={s?.dock}/>;
}

export function StreamerEntry({region}:{region?:RegionId}) {
  const s = useStreamer(), active = useStreamerActive(), solo = useContext(SoloStreamer);
  return s && solo && !active ? <button type="button" className="session-button streamer-entry" onClick={()=>s.open(region)}>Streamer mode</button> : null;
}

/** Mounted only during a sandbox game. Engine changes across districts replace the binding. */
export function StreamerGame({hud,engine,mode}:{hud:FpsHud;engine:RefObject<FpsEngine|null>;mode:CastMode}) {
  const s = useStreamer()!, e = engine.current;
  const [track] = useState(() => ({region:'', diff:hudEvents((text,major) => { s.event(text); if (major) engine.current?.replanPilot(); })}));
  const resumePlay = useRef(false), lastPhase = useRef<'menu'|'play'>('menu');
  useLayoutEffect(() => {
    if (!e) return;
    const name = castPersona(s.settings.personaId)!.name;
    const game = {
      pause() { resumePlay.current = s.snapshot().phase === 'paused' && lastPhase.current === 'play'; e.pause(); },
      resume() { if (resumePlay.current) e.startPilot(); resumePlay.current = false; },
      line(text:string) { e.addCastLine(name,text); },
    };
    s.game = game; s.engine = e;
    const off = e.onCastAudioStop(s.player.stop);
    const strategy = streamerPilotStrategy(async (observation,planSignal) => {
      // The first pilot tick can precede React's deployment hand-off.
      if (s.snapshot().phase !== 'play') throw new Error('Waiting for deployment');
      const signal = AbortSignal.any([planSignal,s.signal()]);
      if (s.settings.voice) await s.player.idle();
      if (Date.now() < s.nextPlan) await waitFor(s.nextPlan-Date.now(),signal);
      signal.throwIfAborted();
      s.nextPlan = Date.now()+3000;
      const frame = s.settings.screenshots ? await e.captureFrame() : null;
      signal.throwIfAborted();
      const decision = await requestCast<Pick<PilotPlan,'goal'|'waypointId'> & {line:string|null}>('streamer',{
        phase:'play',personaId:s.settings.personaId,clean:s.settings.clean,memory:s.memory.read(),regionId:e.castRegion,
        mode,events:s.takeEvents(),observation,frame:frame || undefined,
      },signal,s.account).catch(error => {
        if (!signal.aborted && error instanceof CastFailure && !error.transient && (error.status === 429 || error.status === 503)) s.stop(error.message);
        throw error;
      });
      signal.throwIfAborted();
      return decision;
    },s.speak);
    e.setPilotStrategy('streamer',strategy);
    return () => {
      off(); s.player.stop();
      if (s.game === game) { s.game = null; s.engine = null; s.handoff('menu'); }
    };
  },[s,e,mode]);
  useEffect(() => {
    if (!e || s.snapshot().phase === 'paused' || s.snapshot().phase === 'off') return;
    if (hud.phase === 'error') { s.stop(hud.message || 'The game could not load.'); return; }
    if (track.region !== e.castRegion) {
      track.region = e.castRegion; s.event('Arrived in '+e.castRegion); e.replanPilot();
    }
    track.diff(hud,Date.now());
    if (hud.phase === 'loading') return;
    const phase = phaseForHud(hud);
    lastPhase.current = phase;
    if (phase === "play" && s.snapshot().phase !== phase) e.replanPilot();
    s.handoff(phase);
    if (phase === 'play' && hud.phase === 'playing' && !hud.pilotEnabled) e.startPilot();
  },[hud,e,s,track]);
  return null;
}

export function StreamerHost({children}:{children:ReactNode}) {
  const [s] = useState(controller);
  return <Context.Provider value={s}>{children}<StreamerOverlay session={s}/></Context.Provider>;
}

function StreamerOverlay({session:s}:{session:ReturnType<typeof controller>}) {
  const state = useSyncExternalStore(s.subscribe,s.snapshot,s.snapshot);
  const [panel,setPanel] = useState(false), [settings,setSettings] = useState(s.settings);
  const [status,setStatus] = useState<{available:boolean;model:string;provider:string;quota:CastQuota;voice?:CastVoiceStatus}|null>(null);
  const [problem,setProblem] = useState(''), [usage,setUsage] = useState({cost:0,tokens:0,priced:false});
  const [dock,setDock] = useState<HTMLDivElement|null>(null);
  s.dock = setDock;
  const [host,setHost] = useState<Element|null>(null), cursor = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null), resumeButton = useRef<HTMLButtonElement>(null);
  useModalFocus(panelRef, panel && !!host, () => setPanel(false));
  useEffect(() => { if (state.phase === "paused") resumeButton.current?.focus(); },[state.phase]);
  const active = state.phase !== 'off';
  s.open = region => {s.startRegion = ['/world','/training'].includes(window.location.pathname) ? region : undefined;setProblem('');setStatus(null);setPanel(true);};
  s.voiceAccount = voice => setStatus(old => old && {...old,voice});
  s.account = ({quota,voice,usage,costUsd}) => {
    setStatus(old => old && {...old,quota,voice});
    if (usage) setUsage(old => ({cost:old.cost+(costUsd ?? 0),priced:old.priced || typeof costUsd === 'number',tokens:old.tokens+usage.inputTokens+usage.outputTokens}));
  };
  useEffect(() => {
    if (!panel) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/ai/status',{cache:'no-store',signal:abort.signal}), data = await res.json();
        if (!res.ok || typeof data.streamer?.available !== 'boolean' || !data.quota) throw new Error();
        if (!abort.signal.aborted) setStatus({...data.streamer,quota:data.quota,voice:data.voice});
      } catch { if (!abort.signal.aborted) setProblem('Streamer service unavailable.'); }
    })();
    return () => abort.abort();
  },[panel]);
  useEffect(() => { if (active) return s.closeAudio; },[active,s]);
  useEffect(() => {
    if (!active && !panel && !state.reason) return;
    const sync = () => setHost(document.fullscreenElement ?? document.body);
    sync(); document.addEventListener('fullscreenchange',sync);
    return () => document.removeEventListener('fullscreenchange',sync);
  },[active,panel,state.reason]);
  useEffect(() => {
    if (!active) return;
    const input = (ev:Event) => {
      if (!ev.isTrusted) return;
      const escape = ev instanceof KeyboardEvent && ev.key === 'Escape';
      if (!escape && (ev.target as Element)?.closest?.('[data-streamer-controls]')) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (escape) s.stop(); else s.pause();
    };
    const events = ['keydown','pointerdown','pointermove','pointerup','click','wheel'];
    for (const event of events) window.addEventListener(event,input,{capture:true,passive:false});
    const blur = () => s.pause();
    const visibility = () => { if (document.hidden) s.pause(); };
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('blur',blur);
    return () => { for (const event of events) window.removeEventListener(event,input,true); window.removeEventListener('blur',blur); document.removeEventListener('visibilitychange',visibility); };
  },[active,s]);
  useEffect(() => {
    if (state.phase !== 'menu') return;
    const abort = new AbortController(), signal = AbortSignal.any([s.signal(),abort.signal]);
    void runMenu({
      read:() => readStreamerScreen(document), now:Date.now, wait:waitFor,
      request:async (screen,note,signal) => {
        if (s.settings.voice) await s.player.idle();
        signal.throwIfAborted();
        return requestCast<{actionId:string;line:string|null;ticket?:string}>('streamer',{
          phase:'menu',screen,note,wallet:s.wallet,personaId:s.settings.personaId,clean:s.settings.clean,memory:s.memory.read(),
        },signal,s.account);
      },
      act:(screen,id,signal,onClick) => clickStreamerAction(document,screen,id,signal,(x,y) => {
        if (cursor.current) cursor.current.style.transform = 'translate('+x+'px,'+y+'px)';
      },onClick),
      speak:s.speak,
    },s.trip,signal).catch(err => { if (!signal.aborted) s.stop(err instanceof Error ? err.message : 'Menu connection interrupted.'); });
    return () => abort.abort();
  },[s,state.phase]);
  useEffect(() => {
    if (!state.caption) return;
    return holdCaption(state.caption,() => s.player.idle(),() => { if (s.snapshot().serial === state.serial) s.dismissCaption(); });
  },[state.caption,state.serial,s]);
  if (!host || !active && !panel && !state.reason) return null;
  const q = status?.quota, name = castPersona(s.settings.personaId)?.name;
  const limit = q && q.used >= q.limit;
  return createPortal(<>
    {panel && <section ref={panelRef} className="streamer-settings cast-panel" role="dialog" aria-modal="true" aria-label="Streamer mode">
      <h2>Streamer mode</h2><p>Your streamer plays solo using its own wallet and loadout. Menu choices, game state, past lines and optional game screenshots go to the AI provider. With Voice on, the streamer’s lines go to the voice provider.</p>
      <CastVoiceSwitch enabled={!!settings.voice} voice={status?.voice} change={voice=>setSettings({...settings,voice})}/>
      <label>Streamer <select value={settings.personaId} onChange={e=>setSettings({...settings,personaId:e.target.value})}>{voices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <small>{castPersona(settings.personaId)?.blurb}</small>
      <label><input type="checkbox" checked={settings.clean} onChange={e=>setSettings({...settings,clean:e.target.checked})}/> Clean language</label>
      <label><input type="checkbox" checked={settings.screenshots} onChange={e=>setSettings({...settings,screenshots:e.target.checked})}/> Send gameplay screenshots</label>
      <small>{problem || (status ? status.available ? status.provider+' · '+status.model : 'Streamer provider unavailable' : 'Checking availability…')}</small>
      {q && <><progress aria-label="Daily AI calls" value={q.used} max={Math.max(1,q.limit)}/><small>{q.used} / {q.limit} calls · {limit ? 'Limit reached, resets at ' : 'Resets at '}{castResetTime(q.resetsAt)} · {usage.priced ? 'Est. $'+usage.cost.toFixed(4) : usage.tokens+' tokens'}</small></>}
      <button onClick={()=>setPanel(false)}>Close</button> <button disabled={!status?.available || !!limit} onClick={()=>{
        setPanel(false); requestLeave(() => {setUsage({cost:0,tokens:0,priced:false}); s.nextPlan=0; s.start(settings); s.save(); s.unlock();});
      }}>Start streamer</button>
    </section>}
    {active && createPortal(<div className="streamer-chip" data-streamer-controls><strong>{name}</strong>
      {state.phase === 'paused' && <><span>Paused</span><button onClick={()=>s.stop()}>Take control</button><button ref={resumeButton} onClick={()=>{ s.unlock(); s.resume(); }}>Resume</button></>}
      <button onClick={()=>s.stop()}>Stop</button>
      {q && <details className="streamer-usage"><summary aria-label="Streamer AI usage">Usage</summary><div>
        <progress aria-label="Daily AI calls" value={q.used} max={Math.max(q.limit,1)}/>
        <span>{q.used} / {q.limit} calls · Resets at {castResetTime(q.resetsAt)}</span>
        <CastVoiceSwitch enabled={!!s.settings.voice} voice={status?.voice} change={voice=>{
          s.settings = {...s.settings,voice}; setSettings(s.settings); s.save();
          if (voice) s.unlock(); else s.closeAudio();
        }}/>
        <span>{usage.priced ? 'Est. $'+usage.cost.toFixed(4) : usage.tokens+' tokens'}</span>
      </div></details>}
    </div>,dock ?? host)}
    {state.phase === 'menu' && <div ref={cursor} className="streamer-cursor" aria-hidden="true"/>}
    {active && state.phase !== 'play' && state.caption && <div className="streamer-menu-caption cast-caption" aria-live="polite"><b>{name}</b> {state.caption}</div>}
    {!active && state.reason && <div className="streamer-chip" role="status">{state.reason}<button onClick={()=>s.stop()}>Dismiss</button></div>}
  </>,host);
}

export function StreamerCaption() {
  const s = useStreamer()!;
  const state = useSyncExternalStore(s.subscribe,s.snapshot,s.snapshot);
  return state.phase === 'play' && state.caption ? <div className="cast-caption" aria-live="polite"><b>{castPersona(s.settings.personaId)?.name}</b> {state.caption}</div> : null;
}
