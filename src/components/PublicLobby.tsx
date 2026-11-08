import { DEFAULT_ARENA_MATCH, TDM_AREAS, type ArenaMatch } from '../game/arena-match';
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
export default function PublicLobby({ onLaunch, onBack }: { onLaunch: (session: LanSession, bots: number, squad: Squad, match: ArenaMatch) => void; onBack: () => void }) {
  const [mode, setMode] = useState<'browse' | 'create' | 'join' | 'solo'>(() => invitedRoom() ? 'join' : 'browse');
  const [rooms, setRooms] = useState<PublicRoom[]>([]), [listError, setListError] = useState(''), [loading, setLoading] = useState(true);
  const [name, setName] = useState('Operator'), [title, setTitle] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(invitedRoom);
  const [match, setMatch] = useState<ArenaMatch>(DEFAULT_ARENA_MATCH);
  const [bots, setBots] = useState(3), [squad, setSquad] = useState<Squad>('mixed');
  const [session, setSession] = useState<LanSession | null>(null), [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useNavigationGuard(!!session, { title: 'Leave this room?', detail: session?.role === 'host' ? 'You are hosting. Leaving closes this room for everyone.' : 'You will disconnect from this room. You can rejoin with its code while it remains open.' });
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
    const timer = HAS_PUBLIC_ROOMS ? setInterval(() => void refresh(), 5000) : undefined;
    return () => { alive.current = false; refreshId.current++; clearInterval(timer); controller.current?.abort(); owned.current?.close(); };
  }, []);
  useEffect(() => {
    if (!session) { setPeers([]); setConnected(false); return; }
    const update = () => { setPeers(session.getPeers()); setConnected(session.isConnected?.() ?? false); };
    update(); return session.onPeers(update);
  }, [session]);
  const disconnect = () => { controller.current?.abort(); controller.current = null; owned.current?.close(); owned.current = null; setSession(null); setBusy(false); setPassword(''); setError(''); setNotice(''); void refresh(); };
  const choose = (next: typeof mode) => { if (busy) return; setMode(next); setPassword(''); setError(''); setNotice(''); };
  const connect = async () => {
    if (!name.trim() || busy) return;
    if(mode==='solo'){onLaunch(createSoloSession(name),bots,squad,match);return;}
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
  const launch = () => { if (!session || !connected) return; owned.current = null; controller.current = null; onLaunch(session, session.role === 'host' ? bots : 0, squad, match); };

  const modeSettings = <div className="lan-squad-control"><label htmlFor="public-mode">Game mode</label><select id="public-mode" disabled={!!session||busy} value={match.mode} onChange={event=>setMatch(event.target.value==='hardpoint'?{mode:'hardpoint',area:'smith-street'}:event.target.value==='team-deathmatch'?{mode:'team-deathmatch',area:'dragon-courtyard'}:DEFAULT_ARENA_MATCH)}><option value="free-for-all">Free for all</option><option value="team-deathmatch">Team Deathmatch · 4 vs 4</option><option value="hardpoint">Hardpoint · 4 vs 4</option></select>{match.mode==='team-deathmatch' && <><label htmlFor="public-area">District area</label><select id="public-area" disabled={!!session||busy} value={match.area} onChange={event=>setMatch({mode:'team-deathmatch',area:event.target.value as typeof match.area})}>{TDM_AREAS.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select><p>Teams fill with bots. 30 eliminations · 5 minutes · Infantry only · Friendly fire off</p></>}{match.mode==='hardpoint' && <p>Chinatown · Smith Street · Three rotating control stations<br />200 points · 6 minutes · Rotation every 60 seconds · Friendly fire off</p>}</div>;
  const matchSettings = <>{modeSettings}{match.mode==='free-for-all' && <details className="public-options"><summary>Match settings <span>{bots} bots</span></summary>
    <div className="lan-bot-control"><div><label htmlFor="public-bots">Bot opponents</label><output>{bots}</output></div><input id="public-bots" type="range" min={0} max={6} value={bots} onChange={event => setBots(Number(event.target.value))} /></div>
    <div className="lan-squad-control"><label htmlFor="public-squad">Bot squad</label><select id="public-squad" value={squad} onChange={event => setSquad(event.target.value as Squad)} disabled={!bots}><option value="mixed">Mixed squad</option><option value="assault">Assault squad</option><option value="tank">Tank squad</option><option value="heavy">Heavy MG squad</option><option value="sniper">Sniper squad</option></select></div>
  </details>}</>;
  return <section className={`lan-lobby public-lobby ${session ? 'has-room' : ''}`} aria-label="Public multiplayer lobby">
    <nav className="lobby-navigation" aria-label="Multiplayer"><button className="game-back" onClick={onBack}><ArrowLeft size={16} /> Main menu</button></nav>
    <header className="lan-header"><div><span className="lan-kicker">BLOCKPLAY</span><h2>{session ? 'Your room is ready.' : 'Multiplayer'}</h2><p>Choose your mode <span>·</span> Solo or online <span>·</span> Up to 4 players</p></div><span className="lan-network-badge"><span className="status-dot" /> Online</span></header>
    <div className="lan-layout"><main className="lan-main">
      {!session && <div className="lan-mode-picker" aria-label="Room options">{(['browse', 'create', 'join', 'solo'] as const).map(option => <button key={option} disabled={busy} aria-pressed={mode === option} onClick={() => choose(option)}><strong>{option === 'browse' ? 'Browse rooms' : option === 'create' ? 'Create room' : option==='solo' ? 'Solo vs bots' : 'Join by code'}</strong></button>)}</div>}
      {!session && mode === 'browse' ? <div className="public-browser">
        <div className="public-browser-heading"><h3>Open rooms <small>{rooms.length}</small></h3><button className="lan-secondary" onClick={() => void refresh()} aria-label="Refresh rooms"><RefreshCw size={17} /><span>Refresh</span></button></div>
        {loading && <p className="public-loading" role="status"><LoaderCircle size={18} className="lan-spinner" /> Finding rooms…</p>}
        {listError && <p className="lan-error" role="alert">{listError}</p>}
        {!loading && !listError && !rooms.length && <div className="public-empty"><div className="public-empty-icon"><Users size={28} /></div><h3>Bring your squad.</h3><p>No rooms open yet. Start one and send your friends an invite.</p><button className="lan-secondary" onClick={() => choose('create')}>Create the first room <ArrowRight size={16} /></button></div>}
        <ul className="public-rooms">{rooms.map(room => <li key={room.code} data-room-code={room.code}><div><strong>{room.locked && <LockKeyhole size={14} aria-label="Password protected" />} {room.title}</strong><span>{room.host} · {room.map} · {room.mode}</span><small>{room.locked ? 'Password required' : 'Open room'}</small></div><div className="public-room-action"><span><Users size={14} /> {room.players}/{room.maxPlayers}</span><button className="lan-secondary" disabled={room.players >= room.maxPlayers || room.build !== ROOM_BUILD} onClick={() => { choose('join'); setCode(room.code); }}>{room.players >= room.maxPlayers ? 'Full' : room.build !== ROOM_BUILD ? 'Reload to join' : 'Join'}</button></div></li>)}</ul>
      </div> : <>
        {!session && <>
          <div className="lan-briefing"><h3>{mode==='solo'?'Train with a full squad.':mode === 'create' ? 'Play with your people.' : 'Got an invite?'}</h3><p>{mode==='solo'?'Pick a mode and district area. Bots fill the remaining places.':mode === 'create' ? 'Create a room, share the link, and jump in.' : 'Enter the room code to meet your squad.'}</p></div>
          <label className="lan-field"><span>Your name</span><input autoComplete="nickname" maxLength={20} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
          {mode === 'join' && <><label className="lan-field"><span>Room code</span><input className="lan-code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} value={code} disabled={busy} placeholder="ABC123" onChange={event => setCode(event.target.value.replace(/[^a-f0-9]/gi, '').toUpperCase())} /></label><label className="lan-field"><span>Password <small>If the room is locked</small></span><input type="password" autoComplete="current-password" maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connect(); }} /></label></>}
          {mode==='solo' && matchSettings}
          {mode === 'create' && <>
            <details className="public-options"><summary>Room name &amp; password <LockKeyhole size={15} /></summary>
              <label className="lan-field"><span>Room name <small>Optional</small></span><input maxLength={40} value={title} disabled={busy} placeholder={`${name.trim() || 'Operator'}'s room`} onChange={event => setTitle(event.target.value)} /></label>
              <label className="lan-field"><span>Password <small>Optional · 4–64 characters</small></span><input type="password" autoComplete="new-password" maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
            </details>
            {matchSettings}
          </>}
        </>}
        {session && <>
          <div className="lan-invite"><span className="lan-kicker">ROOM CODE</span><div className="lan-room-code"><output aria-label="Room code">{code}</output><span className="public-room-capacity"><Users size={16} /> {1 + peers.length}/4</span></div>
            <div className="public-share-actions">{typeof navigator.share === 'function' && <button className="lan-secondary" onClick={() => void share()}><Share2 size={17} /> Share invite link</button>}<button className="lan-secondary" onClick={() => void copy()} aria-label="Copy invite"><Copy size={17} /> Copy link</button></div>
            <details className="public-invite-link"><summary>View invite link</summary><label className="lan-field"><span>Invite link</span><input aria-label="Invite link" value={invite.toString()} readOnly onFocus={event => event.target.select()} /></label></details>
          </div>
          {session.role === 'host' && matchSettings}
        </>}
        {error && <p className="lan-error" role="alert">{error}</p>}{notice && <p className="lan-notice" role="status">{notice}</p>}
        <div className="public-actions">{session ? <><button className="lan-deploy" disabled={!connected} onClick={launch}>Enter multiplayer match <ArrowRight size={18} /></button>{!connected && <p className="lan-error" role="status">Room closed. Leave this room and reconnect.</p>}<button className="lan-cancel" onClick={() => requestLeave(disconnect)}>Leave room</button></> : <><button className="lan-deploy" disabled={busy || !name.trim() || (mode!=='solo' && !HAS_PUBLIC_ROOMS) || (mode === 'join' && !/^[A-F0-9]{6}$/.test(code))} onClick={() => void connect()}>{busy ? <><LoaderCircle size={18} className="lan-spinner" /> Connecting…</> : <>{mode==='solo'?'Enter solo match':mode === 'create' ? 'Create public room' : 'Join room'} <ArrowRight size={18} /></>}</button>{busy && <button className="lan-cancel" onClick={disconnect}>Cancel connection</button>}</>}</div>
      </>}
    </main>{session && <aside className="lan-sidebar"><div className="lan-roster"><div className="lan-roster-heading"><h3>Players <span>{1 + peers.length}/4</span></h3><Users size={18} /></div><ul><li><span className="public-player-avatar">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name} <small>YOU</small></strong><span>{session.role === 'host' ? 'Host' : 'Ready to play'}</span></div><Check size={17} /></li>{peers.map(peer => <li key={peer.id}><span className="public-player-avatar">{peer.name.slice(0, 1).toUpperCase()}</span><div><strong>{peer.name}</strong><span>Ready to play</span></div><Check size={17} /></li>)}</ul>{!peers.length && <p>Waiting for friends. You can start now; they can join during the match.</p>}</div></aside>}</div>
    <footer className="lan-footer"><details className="public-room-help"><summary>How rooms work</summary><p>The host runs the match. Switching apps holds your room for up to five minutes; return to reconnect. Share room passwords separately from invite links.</p></details></footer>
  </section>;
}
