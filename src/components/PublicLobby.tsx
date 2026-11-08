import MatchSummary from './MatchSummary';
import RespawnLoadoutSelector from './RespawnLoadoutSelector';
import { connectArenaMatch } from '../game/arena-match-session';
import { connectRoomPresence, type RoomPresence } from '../game/room-presence';
import type { ArmoryProfile } from '../game/armory-state';
import type { RespawnLoadoutSelection } from '../game/respawn-loadout';
import { DEFAULT_ARENA_MATCH, type ArenaMatch } from '../game/arena-match';
import MatchBotSettings, { type MatchSquad } from './MatchBotSettings';
import { requestLeave, useNavigationGuard } from '../lib/navigation-guard';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, LockKeyhole, RefreshCw, Share2, Users } from 'lucide-react';
import { createPublicRoom, joinPublicRoom, listPublicRooms, ROOM_BUILD, type PublicRoom } from '../game/room-peer';
import type { LanSession } from '../game/lan-peer';
import { HAS_PUBLIC_ROOMS } from '../lib/deployment';
import { ROUTE_PATHS } from '../lib/routes';
import './lan-lobby.css';
import './public-lobby.css';

const invitedRoom = () => new URLSearchParams(window.location.search).get('room')?.replace(/[^a-f0-9]/gi, '').slice(0, 6).toUpperCase() || '';
export default function PublicLobby({ match, onLaunch, onBack, backLabel, onDisconnect, active=true, hasMatch=false, status='In room', profile, onLoadout, leaveRequest=0 }: {
 match?: ArenaMatch; backLabel: string;
 onLaunch:(session:LanSession,bots:number,squad:MatchSquad,match:ArenaMatch)=>void; onBack:()=>void; onDisconnect?:()=>void;
 leaveRequest?:number; active?:boolean;hasMatch?:boolean;status?:RoomPresence;profile?:ArmoryProfile;onLoadout?:(selection:RespawnLoadoutSelection)=>Promise<boolean>;
}) {
  const joining = !match;
  const [rooms, setRooms] = useState<PublicRoom[]>([]), [listError, setListError] = useState(''), [loading, setLoading] = useState(true);
  const [name, setName] = useState('Operator'), [title, setTitle] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(() => joining ? invitedRoom() : '');
  const [bots, setBots] = useState(3), [squad, setSquad] = useState<MatchSquad>('mixed');
  const [session, setSession] = useState<LanSession | null>(null), [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [resolved,setResolved]=useState<ArenaMatch>(),[presence,setPresence]=useState<Record<string,RoomPresence>>({}),[locker,setLocker]=useState(false);
  const root=useRef<HTMLElement>(null);
  const roomCode = useRef<HTMLInputElement>(null);
  const roomPassword = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(active&&session){const id=requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>('.lan-deploy')?.focus());return()=>cancelAnimationFrame(id);}},[active,session,resolved]);
  const presenceConnection=useRef<ReturnType<typeof connectRoomPresence>|null>(null);
  useEffect(()=>{setResolved(undefined);if(!session)return;const stop=connectArenaMatch(session,match ?? DEFAULT_ARENA_MATCH,setResolved);const p=connectRoomPresence(session,setPresence);presenceConnection.current=p;p.set(status);return()=>{stop();p.dispose();presenceConnection.current=null;};},[session,match]);
  useEffect(()=>{presenceConnection.current?.set(status);},[status]);
  useNavigationGuard(active && !!session, { title: 'Leave this room?', detail: session?.role === 'host' ? 'You are hosting. Leaving closes this room for everyone.' : 'You will disconnect from this room. You can rejoin with its code while it remains open.' });
  const owned = useRef<LanSession | null>(null), controller = useRef<AbortController | null>(null), alive = useRef(true), refreshId = useRef(0);
  const refresh = async () => {
    const id = ++refreshId.current;
    try { const result = await listPublicRooms(); if (alive.current && id === refreshId.current) { setRooms(result); setListError(''); } }
    catch (failure) { if (alive.current && id === refreshId.current) setListError(failure instanceof Error ? failure.message : 'Could not load public rooms.'); }
    finally { if (alive.current && id === refreshId.current) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true;
    if (joining && HAS_PUBLIC_ROOMS) void refresh();
    if (!HAS_PUBLIC_ROOMS) setLoading(false);
    const timer = joining && HAS_PUBLIC_ROOMS ? setInterval(() => { if (!owned.current) void refresh(); }, 5000) : undefined;
    return () => { alive.current = false; refreshId.current++; clearInterval(timer); controller.current?.abort(); owned.current?.close(); };
  }, [joining]);
  useEffect(() => {
    if (!session) { setPeers([]); setConnected(false); return; }
    const update = () => { setPeers(session.getPeers()); setConnected(session.isConnected?.() ?? true); };
    update(); return session.onPeers(update);
  }, [session]);
  const disconnect = () => { controller.current?.abort(); controller.current = null; owned.current?.close(); owned.current = null; onDisconnect?.(); setSession(null); setBusy(false); setPassword(''); setError(''); setNotice(''); if (joining && HAS_PUBLIC_ROOMS) void refresh(); };
  useEffect(()=>{if(leaveRequest)disconnect();},[leaveRequest]);
  const canConnect = !busy && !!name.trim() && HAS_PUBLIC_ROOMS && (!joining || /^[A-F0-9]{6}$/.test(code));
  const connect = async () => {
    if (!canConnect || owned.current || controller.current) return;
    const attempt = new AbortController(); controller.current = attempt; setBusy(true); setError('');
    try {
      let connection: LanSession;
      if (match) { const result = await createPublicRoom(name, title, password, attempt.signal, match); connection = result.session; if (alive.current && !attempt.signal.aborted) setCode(result.roomCode); }
      else connection = await joinPublicRoom(name, code, password, attempt.signal);
      if (!alive.current || attempt.signal.aborted) { connection.close(); return; }
      owned.current = connection; setSession(connection); setPassword('');
    } catch (failure) { if (alive.current && !attempt.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not connect to room.'); }
    finally { if (controller.current === attempt) { controller.current = null; if (alive.current) setBusy(false); } }
  };
  const selectRoom = (room: PublicRoom) => {
    setCode(room.code);
    setPassword('');
    setError('');
    (room.locked ? roomPassword : roomCode).current?.focus();
  };
  const invite = new URL(ROUTE_PATHS.multiplayer, window.location.origin); invite.searchParams.set('room', code);
  const copy = async () => { try { await navigator.clipboard.writeText(invite.toString()); setNotice('Invite copied. Share the password separately if the room is locked.'); } catch { setNotice('Select and copy the invite link below.'); } };
  const share = async () => {
    try { await navigator.share({ title: 'Join my Blockplay room', url: invite.toString() }); }
    catch (failure) { if (!(failure instanceof Error && failure.name === 'AbortError')) await copy(); }
  };
  const launch = () => { if (!session || !connected || !resolved) return; onLaunch(session, session.role !== 'guest' ? bots : 0, squad, resolved); };

  const loadout = profile && onLoadout && !hasMatch && <div className="match-loadout"><strong>Starting loadout</strong><p>Choose weapons from your locker before entering. Your room stays connected.</p><button className="lan-secondary" onClick={()=>setLocker(true)}>Choose starting loadout</button></div>;

  return <section ref={root} className={`lan-lobby public-lobby ${session ? 'has-room' : ''}`} aria-label="Public multiplayer lobby">
    <nav className="lobby-navigation" aria-label="Multiplayer"><button className="play-nav-back" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</button></nav>
    <header className="lan-header">
      <div><span className="lan-kicker">MULTIPLAYER</span>
        <h1>{session ? 'Your room' : match ? 'Host a match' : 'Find a Room'}</h1>
        <p>{session ? 'Online match' : joining ? 'Choose a room below or enter an invite code.' : 'Create a room and share its invite link with your squad.'}</p>
      </div>
    </header>
    {locker && profile && onLoadout && <RespawnLoadoutSelector deployment inventory={profile} selected={profile} onSave={onLoadout} onClose={()=>setLocker(false)}/>}
    <div className="lan-layout"><div className="lan-main">
        {!session && <>
          {match && <MatchSummary match={match} />}
          {!HAS_PUBLIC_ROOMS && <p className="match-choice-hint">Online rooms are unavailable in this build.</p>}
          <label className="lan-field"><span>Your name</span><input autoComplete="nickname" maxLength={20} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
          {joining && <>
            <label className="lan-field"><span>Room code</span><input ref={roomCode} className="lan-code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} value={code} disabled={busy} placeholder="ABC123" onChange={event => { setCode(event.target.value.replace(/[^a-f0-9]/gi, '').toUpperCase()); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') void connect(); }} /></label>
            <label className="lan-field"><span>Password <small>If the room is locked</small></span><input ref={roomPassword} type="password" autoComplete="current-password" maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connect(); }} /></label>
          </>}
          {match && <details className="public-options"><summary>Room name &amp; password <LockKeyhole size={15} /></summary>
            <label className="lan-field"><span>Room name <small>Optional</small></span><input maxLength={40} value={title} disabled={busy} placeholder={`${name.trim() || 'Operator'}'s room`} onChange={event => setTitle(event.target.value)} /></label>
            <label className="lan-field"><span>Password <small>Optional · 4–64 characters</small></span><input type="password" autoComplete="new-password" maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
          </details>}
          {match?.mode === 'free-for-all' && <MatchBotSettings bots={bots} squad={squad} onBots={setBots} onSquad={setSquad} />}
          {match && loadout}
        </>}
        {session && <>
          <div className="lan-invite"><span className="lan-kicker">ROOM CODE</span><div className="lan-room-code"><output aria-label="Room code">{code}</output><span className="public-room-capacity"><Users size={16} /> {1 + peers.length}/4</span></div>
            <div className="public-share-actions">{typeof navigator.share === 'function' && <button className="lan-secondary" onClick={() => void share()}><Share2 size={17} /> Share invite link</button>}<button className="lan-secondary" onClick={() => void copy()} aria-label="Copy invite"><Copy size={17} /> Copy link</button></div>
            <details className="public-invite-link"><summary>View invite link</summary><label className="lan-field"><span>Invite link</span><input aria-label="Invite link" value={invite.toString()} readOnly onFocus={event => event.target.select()} /></label></details>
          </div>
          {resolved?<MatchSummary match={resolved}/>:<p role="status">Receiving the host’s match details…</p>}
          {hasMatch && <p className="match-choice-hint">Your match stays connected here. An active match keeps running and your operator remains on the field.</p>}{loadout}
        </>}
        {error && <p className="lan-error" role="alert">{error}</p>}{notice && <p className="lan-notice" role="status">{notice}</p>}
        <div className="public-actions">{session ? <>
          <button className="lan-deploy" disabled={!connected || !resolved} onClick={launch}>{hasMatch ? 'Return to match' : 'Load arena'} <ArrowRight size={18} /></button>
          {!connected && <p className="lan-error" role="status">Room closed. Leave this room and reconnect.</p>}
          <button className="lan-cancel" onClick={() => requestLeave(disconnect)}>{session.role === 'host' ? 'Close room for everyone' : 'Leave room'}</button>
        </> : <>
          <button className="lan-deploy" disabled={!canConnect} onClick={() => void connect()}>
            {busy ? <><LoaderCircle size={18} className="lan-spinner" /> Connecting…</> : <>{joining ? 'Join room' : 'Create public room'} <ArrowRight size={18} /></>}
          </button>
          {busy && <button className="lan-cancel" onClick={disconnect}>Cancel connection</button>}
        </>}</div>
        {joining && !session && HAS_PUBLIC_ROOMS && <section className="public-browser" aria-labelledby="public-rooms-heading">
          <div className="public-browser-heading"><h2 id="public-rooms-heading">Open rooms <small>{rooms.length}</small></h2><button className="lan-secondary" onClick={() => void refresh()} aria-label="Refresh rooms"><RefreshCw size={17} /><span>Refresh</span></button></div>
          {loading && <p className="public-loading" role="status"><LoaderCircle size={18} className="lan-spinner" /> Finding rooms…</p>}
          {listError && <p className="lan-error" role="status">{listError}</p>}
          {!loading && !listError && !rooms.length && <p className="match-choice-hint">No rooms are listed right now. You can still enter a room code.</p>}
          <ul className="public-rooms">{rooms.map(room => <li key={room.code} data-room-code={room.code}>
            <div><strong>{room.locked && <LockKeyhole size={14} aria-label="Password protected" />} {room.title}</strong><span>{room.host} · {room.map} · {room.mode}</span><small>{room.locked ? 'Password required' : 'Open room'}</small></div>
            <div className="public-room-action"><span><Users size={14} /> {room.players}/{room.maxPlayers}</span>
              <button className="lan-secondary" aria-label={room.players >= room.maxPlayers || room.build !== ROOM_BUILD ? undefined : `Select ${room.title}`} disabled={busy || room.players >= room.maxPlayers || room.build !== ROOM_BUILD} onClick={() => selectRoom(room)}>{room.players >= room.maxPlayers ? 'Full' : room.build !== ROOM_BUILD ? 'Reload to join' : 'Select'}</button>
            </div>
          </li>)}</ul>
        </section>}
    </div>{session && <aside className="lan-sidebar"><div className="lan-roster"><div className="lan-roster-heading"><h3>Human players <span>{1 + peers.length}/4</span></h3><Users size={18} /></div><ul><li><span className="public-player-avatar">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name} <small>YOU</small></strong><span>{session.role==='host'?'Host · ':''}{presence[session.id]??'In room'}</span></div><Check size={17} /></li>{peers.map(peer => <li key={peer.id}><span className="public-player-avatar">{peer.name.slice(0, 1).toUpperCase()}</span><div><strong>{peer.name}</strong><span>{session.role==='guest'&&peer.id===session.getPeers()[0]?.id?'Host · ':''}{presence[peer.id]??'In room'}</span></div><Check size={17} /></li>)}</ul>{!peers.length && <p>Waiting for friends. You can start now; they can join during the match.</p>}</div></aside>}</div>
    <footer className="lan-footer"><details className="public-room-help"><summary>How rooms work</summary><p>The host runs the match. Switching apps holds your room for up to five minutes; return to reconnect. Share room passwords separately from invite links.</p></details></footer>
  </section>;
}
