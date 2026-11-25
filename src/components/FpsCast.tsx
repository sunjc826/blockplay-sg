import { StreamerGame, StreamerCaption, useStreamerActive } from './StreamerMode';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { castDirector, castSnapshot, hudEvents } from '../game/ai-cast';
import { castPersona, CAST_PERSONAS } from '../game/ai-cast-personas';
import type { CastMode } from '../game/cast-contract';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { requestCast, castResetTime, type CastQuota } from '../lib/cast-client';
import './fps-cast.css';

const voices = CAST_PERSONAS.filter(p => p.role === 'commentator');
const defaults = { enabled:false, personaId:voices[0].id, clean:false, screenshots:true };
type Settings = typeof defaults;
const key = 'blockplay-sg-cast-v1';
function saved(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    return {enabled:s.enabled === true, clean:s.clean === true, screenshots:s.screenshots !== false,
      personaId:castPersona(s.personaId)?.role === 'commentator' ? s.personaId : defaults.personaId};
  } catch { return defaults; }
}
interface Status { available:boolean; admin:boolean; model:string; provider:string; quota:CastQuota }
type Props = { hud:FpsHud; engine:RefObject<FpsEngine|null>; mode:CastMode; session:number };
function useCast({hud,engine,mode,session}:Props) {
  const streaming = useStreamerActive();
  const [stored,setSettings] = useState(saved), [status,setStatus] = useState<Status|null>(null);
  const settings = streaming ? {...stored,enabled:false} : stored;
  const [reason,report] = useState(''), [panelError,panelReport] = useState(''), [caption,setCaption] = useState<{name:string;text:string}|null>(null);
  const [cost,setCost] = useState<number|null>(null), [tokens,setTokens] = useState(0);
  const latest = useRef(settings); latest.current = settings;
  const update = (patch:Partial<Settings>) => {
    const next = {...settings,...patch}; latest.current = next; setSettings(next);
    try { localStorage.setItem(key,JSON.stringify(next)); } catch { /* session only */ }
  };
  const [director] = useState(() => castDirector(Date.now,async (scene,events,memory,signal) => {
    const s = latest.current;
    const frame = s.screenshots ? await engine.current?.captureFrame() : undefined;
    signal.throwIfAborted();
    return requestCast('commentary',{...scene,events,memory,personaId:s.personaId,clean:s.clean,frame:frame || undefined},signal,({quota,usage,costUsd}) => {
      setStatus(prev => prev && {...prev,quota});
      if (typeof costUsd === 'number') setCost(c => (c ?? 0)+costUsd);
      if (usage) setTokens(n => n+usage.inputTokens+usage.outputTokens);
    });
  },text => {
    const name = castPersona(latest.current.personaId)!.name;
    setCaption({name,text}); engine.current?.addCastLine(name,text);
  },report));
  const refresh = useCallback(async (action = 'status',passphrase?:string) => {
    try {
      const res = await fetch('/api/ai/'+action,action === 'status' ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase})});
      const data = await res.json();
      if (!res.ok) { panelReport((data.error || 'Cast unavailable')+(data.resetsAt ? ' · resets '+castResetTime(data.resetsAt) : '')); return; }
      if (typeof data.available !== 'boolean') throw new Error();
      setStatus(data); panelReport('');
      if (action !== 'status') { director.resume(); report(''); }
    } catch { panelReport('Cast server unavailable'); setStatus(null); }
  },[director]);
  useEffect(() => { if (settings.enabled) void refresh(); },[settings.enabled,refresh]);
  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => setCaption(null),6000); return () => clearTimeout(t);
  },[caption]);
  const [track] = useState(() => ({engine:null as FpsEngine|null, region:'', phase:'', diff:hudEvents(director.event), started:Date.now()}));
  useEffect(() => {
    director.reset(); setCaption(null); track.phase = ''; track.region = ''; track.diff = hudEvents(director.event);
    return () => director.reset();
  },[director,settings.enabled,settings.personaId,session,track]);
  useEffect(() => { director.reset(true); setCaption(null); },[director,settings.clean,settings.screenshots]);
  useEffect(() => { track.started = Date.now(); setCost(null); setTokens(0); },[session,track]);
  useEffect(() => {
    const e = engine.current;
    if (!settings.enabled || !status?.available || !e) return;
    const active = hud.phase === 'playing', ended = hud.phase === 'complete' || hud.phase === 'defeated';
    const changed = track.engine !== e, region = e.castRegion;
    const respawning = hud.phase === 'deploying' && hud.deploymentIntro?.respawn;
    if (changed || (!respawning && !active && !ended && track.phase !== hud.phase)) {
      const restarted = hud.phase === 'ready' && track.region === region && track.phase !== 'deploying';
      director.reset(!restarted);
      if (restarted) { track.started = Date.now(); setCost(null); setTokens(0); }
      track.diff = hudEvents(director.event); setCaption(null);
    }
    track.engine = e; track.phase = hud.phase;
    if (!active && !ended) return;
    if (region !== track.region) { director.event('Arrived in '+region,true); track.region = region; }
    track.diff(hud,Date.now());
    void director.tick({mode,regionId:region,snapshot:castSnapshot(hud,e.getLoadout().weapons[hud.weapon]?.name ?? 'Unarmed',Math.floor((Date.now()-track.started)/1000))},ended);
  },[hud,engine,mode,settings,status?.available,director,track]);
  return { settings,update,status,reason:panelError || reason,caption,cost,tokens,refresh };
}
const Cast = createContext<ReturnType<typeof useCast>|null>(null);
export function CastSession({children,...props}:Props & {children:ReactNode}) {
  const streaming = useStreamerActive();
  return <Cast.Provider value={useCast(props)}>{streaming && <StreamerGame {...props}/>}{children}</Cast.Provider>;
}
export function CastPanel() {
  const cast = useContext(Cast), [pass,setPass] = useState('');
  const streaming = useStreamerActive();
  if (!cast || streaming) return null;
  const {settings:s,update,status,reason,refresh,cost,tokens} = cast, q = status?.quota;
  return <details className="cast-panel" onToggle={e => { if (e.target === e.currentTarget && e.currentTarget.open) void refresh(); }}>
    <summary>AI commentary{s.enabled && status?.available ? ' · On' : ''}</summary>
    <p>Enabling commentary sends game state and, with screenshots on, a small picture of the game view to the AI provider.</p>
    <label><input type="checkbox" checked={s.enabled && status?.available === true} disabled={!status?.available} onChange={e=>update({enabled:e.target.checked})}/> Live commentary</label>
    <label>Commentator <select value={s.personaId} onChange={e=>update({personaId:e.target.value})}>{voices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
    <small>{castPersona(s.personaId)?.blurb}</small>
    <label><input type="checkbox" checked={s.clean} onChange={e=>update({clean:e.target.checked})}/> Clean language</label>
    <label><input type="checkbox" checked={s.screenshots} onChange={e=>update({screenshots:e.target.checked})}/> Send screenshots</label>
    {status && <small>{status.available ? status.provider+' · '+status.model : 'Cast provider unavailable'}</small>}
    {q && <><progress aria-label="Daily AI calls" value={q.used} max={Math.max(1,q.limit)}/><small>{q.used} / {q.limit} calls · {q.used >= q.limit ? 'Limit reached, resets at ' : 'Resets at '}{castResetTime(q.resetsAt)} · {cost === null ? tokens+' tokens' : 'Est. $'+cost.toFixed(4)}</small></>}
    {reason && <p role="status">{reason}</p>}
    <details><summary>{status?.admin ? 'Admin' : 'Admin sign-in'}</summary>
      {status?.admin ? <button type="button" onClick={()=>void refresh('admin/logout')}>Sign out</button> :
        <form onSubmit={e=>{e.preventDefault(); void refresh('admin/login',pass); setPass('');}}>
          <label>Passphrase <input type="password" autoComplete="off" value={pass} onChange={e=>setPass(e.target.value)}/></label><button>Sign in</button>
        </form>}
    </details>
  </details>;
}
export function CastCaption() {
  const cast = useContext(Cast);
  const streaming = useStreamerActive();
  if (streaming) return <StreamerCaption />;
  if (!cast?.settings.enabled) return null;
  return <div className="cast-caption" aria-live="polite">{cast.caption && <><b>{cast.caption.name}</b> {cast.caption.text}</>}</div>;
}
