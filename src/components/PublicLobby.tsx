import MatchSummary from './MatchSummary';
import RespawnLoadoutSelector from './RespawnLoadoutSelector';
import { MATCH_MODES, defaultMatchFor, readMatchPreference, saveMatchPreference } from '../game/match-menu';
import { connectArenaMatch } from '../game/arena-match-session';
import { connectRoomPresence, type RoomPresence } from '../game/room-presence';
import type { ArmoryProfile } from '../game/armory-state';
import type { RespawnLoadoutSelection } from '../game/respawn-loadout';
import { TDM_AREAS, type ArenaMatch } from '../game/arena-match';
import { createSoloSession } from '../game/lan-peer';
import { requestLeave, useNavigationGuard } from '../lib/navigation-guard';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, LockKeyhole, RefreshCw, Share2, Users } from 'lucide-react';
import { createPublicRoom, joinPublicRoom, listPublicRooms, ROOM_BUILD, type PublicRoom } from '../game/room-peer';
import type { LanSession } from '../game/lan-peer';
import { HAS_PUBLIC_ROOMS } from '../lib/deployment';
import './lan-lobby.css';
import './public-lobby.css';

type Squad = 'mixed' | 'assault' | 'tank' | 'sniper' | 'heavy';
const invitedRoom = () => new URLSearchParams(window.location.search).get('room')?.replace(/[^a-f0-9]/gi, '').slice(0, 6).toUpperCase() || '';
export default function PublicLobby({ onLaunch, onBack, onDisconnect, active=true, hasMatch=false, status='In room', profile, onLoadout, leaveRequest=0 }: {
 onLaunch:(session:LanSession,bots:number,squad:Squad,match:ArenaMatch)=>void; onBack:()=>void; onDisconnect?:()=>void;
 leaveRequest?:number; active?:boolean;hasMatch?:boolean;status?:RoomPresence;profile?:ArmoryProfile;onLoadout?:(selection:RespawnLoadoutSelection)=>Promise<boolean>;
}) {
  const [mode, setMode] = useState<'choose'|'browse'|'create'|'join'|'solo'>(()=>invitedRoom()?'join':'choose');
  const [rooms, setRooms] = useState<PublicRoom[]>([]), [listError, setListError] = useState(''), [loading, setLoading] = useState(true);
  const [name, setName] = useState('Operator'), [title, setTitle] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(invitedRoom);
  const [match, setMatch] = useState<ArenaMatch>(readMatchPreference);
  const [bots, setBots] = useState(3), [squad, setSquad] = useState<Squad>('mixed');
  const [session, setSession] = useState<LanSession | null>(null), [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [resolved,setResolved]=useState<ArenaMatch>(),[presence,setPresence]=useState<Record<string,RoomPresence>>({}),[locker,setLocker]=useState(false);
  const root=useRef<HTMLElement>(null);
  useEffect(()=>{if(active&&session){const id=requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>('.lan-deploy')?.focus());return()=>cancelAnimationFrame(id);}},[active,session,resolved]);
  const presenceConnection=useRef<ReturnType<typeof connectRoomPresence>|null>(null);
  useEffect(()=>saveMatchPreference(match),[match]);
  useEffect(()=>{setResolved(undefined);if(!session)return;const stop=connectArenaMatch(session,match,setResolved);const p=connectRoomPresence(session,setPresence);presenceConnection.current=p;p.set(status);return()=>{stop();p.dispose();presenceConnection.current=null;};},[session]);
  useEffect(()=>{presenceConnection.current?.set(status);},[status]);
  useNavigationGuard(active && !!session, { title: session?.role==='solo'?'End this solo match?':'Leave this room?', detail: session?.role==='solo'?'Your current match will end. Credits and XP already earned stay saved.':session?.role === 'host' ? 'You are hosting. Leaving closes this room for everyone.' : 'You will disconnect from this room. You can rejoin with its code while it remains open.' });
  const owned = useRef<LanSession | null>(null), controller = useRef<AbortController | null>(null), alive = useRef(true), refreshId = useRef(0);
  const refresh = async () => {
    const id = ++refreshId.current;
    try { const result = await listPublicRooms(); if (alive.current && id === refreshId.current) { setRooms(result); setListError(''); } }
    catch (failure) { if (alive.current && id === refreshId.current) setListError(failure instanceof Error ? failure.message : 'Could not load public rooms.'); }
    finally { if (alive.current && id === refreshId.current) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true;
    if (HAS_PUBLIC_ROOMS) void refresh(); else { setLoading(false); setListError('Public rooms need the Cloudflare build.'); }
    const timer = HAS_PUBLIC_ROOMS ? setInterval(() => { if (!owned.current) void refresh(); }, 5000) : undefined;
    return () => { alive.current = false; refreshId.current++; clearInterval(timer); controller.current?.abort(); owned.current?.close(); };
  }, []);
  useEffect(() => {
    if (!session) { setPeers([]); setConnected(false); return; }
    const update = () => { setPeers(session.getPeers()); setConnected(session.isConnected?.() ?? true); };
    update(); return session.onPeers(update);
  }, [session]);
  const disconnect = () => { controller.current?.abort(); controller.current = null; owned.current?.close(); owned.current = null; onDisconnect?.(); setSession(null); setBusy(false); setPassword(''); setError(''); setNotice(''); void refresh(); };
  useEffect(()=>{if(leaveRequest)disconnect();},[leaveRequest]);
  const choose = (next: typeof mode) => { if (busy) return; setMode(next); setPassword(''); setError(''); setNotice(''); };
  const connect = async () => {
    if (!name.trim() || busy) return;
    if(mode==='solo'){const connection=createSoloSession(name);owned.current=connection;setSession(connection);onLaunch(connection,bots,squad,match);return;}
    const attempt = new AbortController(); controller.current = attempt; setBusy(true); setError('');
    try {
      let connection: LanSession;
      if (mode === 'create') { const result = await createPublicRoom(name, title, password, attempt.signal, match); connection = result.session; if (alive.current) setCode(result.roomCode); }
      else connection = await joinPublicRoom(name, code, password, attempt.signal);
      if (!alive.current || attempt.signal.aborted) { connection.close(); return; }
      owned.current = connection; setSession(connection); setPassword(''); void refresh();
    } catch (failure) { if (alive.current && !attempt.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not connect to room.'); }
    finally { if (alive.current && controller.current === attempt) setBusy(false); }
  };
  const invite = new URL('/multiplayer', window.location.origin); invite.searchParams.set('room', code);
  const copy = async () => { try { await navigator.clipboard.writeText(invite.toString()); setNotice('Invite copied. Share the password separately if the room is locked.'); } catch { setNotice('Select and copy the invite link below.'); } };
  const share = async () => {
    try { await navigator.share({ title: 'Join my Blockplay room', url: invite.toString() }); }
    catch (failure) { if (!(failure instanceof Error && failure.name === 'AbortError')) await copy(); }
  };
  const launch = () => { if (!session || !connected || !resolved) return; onLaunch(session, session.role !== 'guest' ? bots : 0, squad, resolved); };

  const modeSettings = <><MatchSummary match={resolved??match}/>{!session && <button className="lan-secondary" onClick={()=>choose('choose')}>Change mode</button>}{!session && match.mode==='team-deathmatch' && <div className="lan-squad-control"><label htmlFor="public-area">District area</label><select id="public-area" value={match.area} onChange={e=>setMatch({mode:'team-deathmatch',area:e.target.value as typeof match.area})}>{TDM_AREAS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}</>;
  const loadout = profile && onLoadout && !hasMatch && <div className="match-loadout"><strong>Starting loadout</strong><p>Choose weapons from your locker before entering. Your room stays connected.</p><button className="lan-secondary" onClick={()=>setLocker(true)}>Choose starting loadout</button></div>;

  const matchSettings = <>{modeSettings}{match.mode==='free-for-all' && <details className="public-options"><summary>Match settings <span>{bots} bots</span></summary>
    <div className="lan-bot-control"><div><label htmlFor="public-bots">Bot opponents</label><output>{bots}</output></div><input id="public-bots" type="range" min={0} max={6} value={bots} onChange={event => setBots(Number(event.target.value))} /></div>
    <div className="lan-squad-control"><label htmlFor="public-squad">Bot squad</label><select id="public-squad" value={squad} onChange={event => setSquad(event.target.value as Squad)} disabled={!bots}><option value="mixed">Mixed squad</option><option value="assault">Assault squad</option><option value="tank">Tank squad</option><option value="heavy">Heavy MG squad</option><option value="sniper">Sniper squad</option></select></div>
  </details>}</>;
  return <section ref={root} className={`lan-lobby public-lobby ${session ? 'has-room' : ''}`} aria-label="Public multiplayer lobby">
    <nav className="lobby-navigation" aria-label="Matches"><button className="game-back" onClick={onBack}><ArrowLeft size={16} /> Main menu</button></nav>
    <header className="lan-header"><div><span className="lan-kicker">BLOCKPLAY</span><h2>{session ? session.role==='solo'?'Solo match':'Your room' : 'Matches'}</h2><p>Solo or online <span>·</span> Pick your mode, then how to play</p></div><span className="lan-network-badge"><span className="status-dot" /> Online</span></header>
    {locker && profile && onLoadout && <RespawnLoadoutSelector deployment inventory={profile} selected={profile} onSave={onLoadout} onClose={()=>setLocker(false)}/>}
    <div className="lan-layout"><main className="lan-main">
      {!session && mode==='choose' && <div className="match-mode-cards" aria-label="Choose game mode">{MATCH_MODES.map(m=><button data-match-choice={m.mode} key={m.mode} aria-pressed={match.mode===m.mode} onClick={()=>setMatch(match.mode===m.mode?match:defaultMatchFor(m.mode))}><strong>{m.name}</strong><span>{m.description}</span><small>{m.format}</small></button>)}</div>}
      {!session && <div className="lan-mode-picker" aria-label="Room options">{(['solo', 'create', 'browse', 'join'] as const).map(option => <button key={option} disabled={busy} aria-pressed={mode === option} onClick={() => choose(option)}><strong>{option === 'browse' ? 'Browse rooms' : option === 'create' ? 'Create room' : option==='solo' ? 'Solo vs bots' : 'Join by code'}</strong></button>)}</div>}
      {!session && mode==='choose'?<p className="match-choice-hint">Choose Solo vs bots or Create room to set up your selected mode. Browse or join an existing room at any time.</p>:!session && mode === 'browse' ? <div className="public-browser">
        <div className="public-browser-heading"><h3>Open rooms <small>{rooms.length}</small></h3><button className="lan-secondary" onClick={() => void refresh()} aria-label="Refresh rooms"><RefreshCw size={17} /><span>Refresh</span></button></div>
        {loading && <p className="public-loading" role="status"><LoaderCircle size={18} className="lan-spinner" /> Finding rooms…</p>}
        {listError && <p className="lan-error" role="alert">{listError}</p>}
        {!loading && !listError && !rooms.length && <div className="public-empty"><div className="public-empty-icon"><Users size={28} /></div><h3>Bring your squad.</h3><p>No rooms open yet. Start one and send your friends an invite.</p><button className="lan-secondary" onClick={() => choose('create')}>Create the first room <ArrowRight size={16} /></button></div>}
        <ul className="public-rooms">{rooms.map(room => <li key={room.code} data-room-code={room.code}><div><strong>{room.locked && <LockKeyhole size={14} aria-label="Password protected" />} {room.title}</strong><span>{room.host} · {room.map} · {room.mode}</span><small>{room.locked ? 'Password required' : 'Open room'}</small></div><div className="public-room-action"><span><Users size={14} /> {room.players}/{room.maxPlayers}</span><button className="lan-secondary" disabled={room.players >= room.maxPlayers || room.build !== ROOM_BUILD} onClick={() => { choose('join'); setCode(room.code); }}>{room.players >= room.maxPlayers ? 'Full' : room.build !== ROOM_BUILD ? 'Reload to join' : 'Join'}</button></div></li>)}</ul>
      </div> : <>
        {!session && <>
          <div className="lan-briefing"><h3>{mode==='solo'?'Your match, ready to play.':mode === 'create' ? 'Play with your people.' : 'Got an invite?'}</h3><p>{mode==='solo'?'Pick a mode and district area. Bots fill the remaining places.':mode === 'create' ? 'Create a room, share the link, and jump in.' : 'Enter the room code to meet your squad.'}</p></div>
          <label className="lan-field"><span>Your name</span><input autoComplete="nickname" maxLength={20} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
          {mode === 'join' && <><label className="lan-field"><span>Room code</span><input className="lan-code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} value={code} disabled={busy} placeholder="ABC123" onChange={event => setCode(event.target.value.replace(/[^a-f0-9]/gi, '').toUpperCase())} /></label><label className="lan-field"><span>Password <small>If the room is locked</small></span><input type="password" autoComplete="current-password" maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connect(); }} /></label></>}
          {mode==='solo' && <>{matchSettings}{loadout}</>}
          {mode === 'create' && <>
            <details className="public-options"><summary>Room name &amp; password <LockKeyhole size={15} /></summary>
              <label className="lan-field"><span>Room name <small>Optional</small></span><input maxLength={40} value={title} disabled={busy} placeholder={`${name.trim() || 'Operator'}'s room`} onChange={event => setTitle(event.target.value)} /></label>
              <label className="lan-field"><span>Password <small>Optional · 4–64 characters</small></span><input type="password" autoComplete="new-password" maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
            </details>
            {matchSettings}{loadout}
          </>}
        </>}
        {session && <>
          {session.role!=='solo' && <div className="lan-invite"><span className="lan-kicker">ROOM CODE</span><div className="lan-room-code"><output aria-label="Room code">{code}</output><span className="public-room-capacity"><Users size={16} /> {1 + peers.length}/4</span></div>
            <div className="public-share-actions">{typeof navigator.share === 'function' && <button className="lan-secondary" onClick={() => void share()}><Share2 size={17} /> Share invite link</button>}<button className="lan-secondary" onClick={() => void copy()} aria-label="Copy invite"><Copy size={17} /> Copy link</button></div>
            <details className="public-invite-link"><summary>View invite link</summary><label className="lan-field"><span>Invite link</span><input aria-label="Invite link" value={invite.toString()} readOnly onFocus={event => event.target.select()} /></label></details>
          </div>}
          {resolved?<MatchSummary match={resolved}/>:<p role="status">Receiving the host’s match details…</p>}
          {hasMatch && <p className="match-choice-hint">Your match stays connected here. An active match keeps running and your operator remains on the field.</p>}{loadout}
        </>}
        {error && <p className="lan-error" role="alert">{error}</p>}{notice && <p className="lan-notice" role="status">{notice}</p>}
        <div className="public-actions">{session ? <><button className="lan-deploy" disabled={!connected||!resolved} onClick={launch}>{hasMatch?'Return to match':'Enter match'} <ArrowRight size={18} /></button>{!connected && <p className="lan-error" role="status">Room closed. Leave this room and reconnect.</p>}<button className="lan-cancel" onClick={() => requestLeave(disconnect)}>{session.role==='solo'?'End solo match':session.role==='host'?'Close room for everyone':'Leave room'}</button></> : <><button className="lan-deploy" disabled={busy || !name.trim() || (mode!=='solo' && !HAS_PUBLIC_ROOMS) || (mode === 'join' && !/^[A-F0-9]{6}$/.test(code))} onClick={() => void connect()}>{busy ? <><LoaderCircle size={18} className="lan-spinner" /> Connecting…</> : <>{mode==='solo'?'Enter solo match':mode === 'create' ? 'Create public room' : 'Join room'} <ArrowRight size={18} /></>}</button>{busy && <button className="lan-cancel" onClick={disconnect}>Cancel connection</button>}</>}</div>
      </>}
    </main>{session && session.role!=='solo' && <aside className="lan-sidebar"><div className="lan-roster"><div className="lan-roster-heading"><h3>Human players <span>{1 + peers.length}/4</span></h3><Users size={18} /></div><ul><li><span className="public-player-avatar">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name} <small>YOU</small></strong><span>{session.role==='host'?'Host · ':''}{presence[session.id]??'In room'}</span></div><Check size={17} /></li>{peers.map(peer => <li key={peer.id}><span className="public-player-avatar">{peer.name.slice(0, 1).toUpperCase()}</span><div><strong>{peer.name}</strong><span>{session.role==='guest'&&peer.id===session.getPeers()[0]?.id?'Host · ':''}{presence[peer.id]??'In room'}</span></div><Check size={17} /></li>)}</ul>{!peers.length && <p>Waiting for friends. You can start now; they can join during the match.</p>}</div></aside>}</div>
    <footer className="lan-footer"><details className="public-room-help"><summary>How rooms work</summary><p>The host runs the match. Switching apps holds your room for up to five minutes; return to reconnect. Share room passwords separately from invite links.</p></details></footer>
  </section>;
}
