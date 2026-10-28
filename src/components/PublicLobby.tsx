import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Globe2, LoaderCircle, LockKeyhole, RefreshCw, Share2, Users } from 'lucide-react';
import { createPublicRoom, joinPublicRoom, listPublicRooms, ROOM_BUILD, type PublicRoom } from '../game/room-peer';
import type { LanSession } from '../game/lan-peer';
import { HAS_PUBLIC_ROOMS } from '../lib/deployment';
import './lan-lobby.css';
import './public-lobby.css';

type Squad = 'mixed' | 'assault' | 'tank' | 'sniper';
const invitedRoom = () => new URLSearchParams(window.location.search).get('room')?.replace(/[^a-f0-9]/gi, '').slice(0, 6).toUpperCase() || '';
export default function PublicLobby({ onLaunch, onBack }: { onLaunch: (session: LanSession, bots: number, squad: Squad) => void; onBack: () => void }) {
  const [mode, setMode] = useState<'browse' | 'create' | 'join'>(() => invitedRoom() ? 'join' : 'browse');
  const [rooms, setRooms] = useState<PublicRoom[]>([]), [listError, setListError] = useState(''), [loading, setLoading] = useState(true);
  const [name, setName] = useState('Operator'), [title, setTitle] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(invitedRoom);
  const [bots, setBots] = useState(3), [squad, setSquad] = useState<Squad>('mixed');
  const [session, setSession] = useState<LanSession | null>(null), [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
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
    const attempt = new AbortController(); controller.current = attempt; setBusy(true); setError('');
    try {
      let connection: LanSession;
      if (mode === 'create') { const result = await createPublicRoom(name, title, password, attempt.signal); connection = result.session; if (alive.current) setCode(result.roomCode); }
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
  const launch = () => { if (!session || !connected) return; owned.current = null; controller.current = null; onLaunch(session, session.role === 'host' ? bots : 0, squad); };

  return <section className="lan-lobby public-lobby" aria-label="Public multiplayer lobby">
    <header className="lan-header"><div><span className="lan-kicker">BLOCKPLAY / MULTIPLAYER TEST</span><h2>Find your next firefight.</h2><p>Public rooms. Up to four players. Marina Bay free for all.</p></div><span className="lan-network-badge"><Globe2 size={15} /> ONLINE</span></header>
    <div className="lan-layout"><main className="lan-main">
      {!session && <div className="lan-mode-picker" aria-label="Room options">{(['browse', 'create', 'join'] as const).map(option => <button key={option} disabled={busy} aria-pressed={mode === option} onClick={() => choose(option)}><strong>{option === 'browse' ? 'Browse rooms' : option === 'create' ? 'Create room' : 'Join by code'}</strong><small>{option === 'browse' ? 'Global room list' : option === 'create' ? 'Optional password' : 'Use an invite code'}</small></button>)}</div>}
      {!session && mode === 'browse' ? <div className="public-browser"><div className="public-browser-heading"><h3>Open rooms <small>{rooms.length}</small></h3><button className="lan-secondary" onClick={() => void refresh()} aria-label="Refresh rooms"><RefreshCw size={14} /> Refresh</button></div>
        <p className="public-help">All rooms are listed, including password-protected rooms. Updates every five seconds.</p>
        {loading && <p role="status"><LoaderCircle size={16} className="lan-spinner" /> Finding rooms…</p>}
        {listError && <p className="lan-error" role="alert">{listError}</p>}
        {!loading && !listError && !rooms.length && <div className="public-empty"><Users size={30} /><h3>The arena is yours.</h3><p>No rooms are open yet. Create one and invite the first players.</p><button className="lan-secondary" onClick={() => choose('create')}>Create the first room <ArrowRight size={14} /></button></div>}
        <ul className="public-rooms">{rooms.map(room => <li key={room.code}><div><strong>{room.locked && <LockKeyhole size={13} aria-label="Password protected" />} {room.title}</strong><span>{room.host} · {room.map} · {room.mode}</span><small>{room.code} · {room.locked ? 'Password required' : 'Open to everyone'}</small></div><div className="public-room-action"><span>{room.players}/{room.maxPlayers} <Users size={13} /></span><button className="lan-secondary" disabled={room.players >= room.maxPlayers || room.build !== ROOM_BUILD} onClick={() => { choose('join'); setCode(room.code); }}>{room.players >= room.maxPlayers ? 'Full' : room.build !== ROOM_BUILD ? 'Different version' : 'Join'}</button></div></li>)}</ul>
      </div> : <>
        <div className="lan-briefing"><span className="lan-kicker">{session ? 'ROOM CONNECTED' : mode === 'create' ? 'HOST A MATCH' : 'JOIN A MATCH'}</span><h3>{session ? 'Squad assembled.' : mode === 'create' ? 'Make room for your rivals.' : 'Your room is waiting.'}</h3><p>{session ? 'Deploy when ready. Players can join while the match is running.' : mode === 'create' ? 'Your room appears in the global list. Add a password to limit who can enter.' : 'Enter your callsign, room code and the password if this room is locked.'}</p></div>
        <label className="lan-field"><span>DISPLAY NAME</span><input autoComplete="nickname" maxLength={20} value={name} disabled={busy || !!session} onChange={event => setName(event.target.value)} /></label>
        {!session && mode === 'create' && <label className="lan-field"><span>ROOM NAME <small>Optional · 40 characters max</small></span><input maxLength={40} value={title} disabled={busy} placeholder={`${name.trim() || 'Operator'}'s room`} onChange={event => setTitle(event.target.value)} /></label>}
        {!session && mode === 'join' && <label className="lan-field"><span>ROOM CODE</span><input className="lan-code-input" autoComplete="off" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/[^a-f0-9]/gi, '').toUpperCase())} /></label>}
        {!session && <label className="lan-field"><span>ROOM PASSWORD <small>{mode === 'create' ? 'Optional · 4–64 characters' : 'Leave empty for open rooms'}</small></span><input type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} maxLength={64} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connect(); }} /></label>}
        {(mode === 'create' || session?.role === 'host') && <><div className="lan-bot-control"><div><label htmlFor="public-bots">BOT OPPONENTS<small>Simulated by the host</small></label><output>{bots}</output></div><input id="public-bots" type="range" min={0} max={6} value={bots} onChange={event => setBots(Number(event.target.value))} /></div><div className="lan-squad-control"><label htmlFor="public-squad">OPPONENT SQUAD</label><select id="public-squad" value={squad} onChange={event => setSquad(event.target.value as Squad)} disabled={!bots}><option value="mixed">Mixed squad</option><option value="assault">Assault squad</option><option value="tank">Tank squad</option><option value="sniper">Sniper squad</option></select></div></>}
        {session && <div className="lan-invite"><span className="lan-kicker">INVITE PLAYERS</span>{typeof navigator.share === 'function' && <button className="lan-secondary" onClick={() => void share()}><Share2 size={14} /> Share invite link</button>}<div className="lan-room-code"><output aria-label="Room code">{code}</output><button onClick={() => void copy()} aria-label="Copy invite"><Copy size={17} /></button></div><label className="lan-field"><span>INVITE LINK</span><input aria-label="Invite link" value={invite.toString()} readOnly onFocus={event => event.target.select()} /></label></div>}
        {error && <p className="lan-error" role="alert">{error}</p>}{notice && <p className="lan-notice" role="status">{notice}</p>}
        {session ? <><button className="lan-deploy" disabled={!connected} onClick={launch}>Enter multiplayer match <ArrowRight size={18} /></button>{!connected && <p className="lan-error" role="status">Room closed or connection lost. Leave this room and reconnect.</p>}<button className="lan-cancel" onClick={disconnect}>Leave room</button></> : <><button className="lan-deploy" disabled={busy || !name.trim() || !HAS_PUBLIC_ROOMS || (mode === 'join' && !/^[A-F0-9]{6}$/.test(code))} onClick={() => void connect()}>{busy ? <><LoaderCircle size={18} className="lan-spinner" /> Connecting…</> : <>{mode === 'create' ? 'Create public room' : 'Join room'} <ArrowRight size={18} /></>}</button>{busy && <button className="lan-cancel" onClick={disconnect}>Cancel connection</button>}</>}
      </>}
    </main><aside className="lan-sidebar"><div className="lan-roster"><div className="lan-roster-heading"><span className="lan-kicker">{session ? 'CONNECTED ROSTER' : 'MATCH BRIEFING'}</span><Users size={16} /></div>{session ? <ul><li><div><strong>{name} <small>YOU</small></strong><span>{session.role === 'host' ? 'Room host' : 'Guest'}</span></div><Check size={15} /></li>{peers.map(peer => <li key={peer.id}><div><strong>{peer.name}</strong><span>Connected</span></div><Check size={15} /></li>)}</ul> : <p>Marina Bay arena · Free for all · Four player slots · Optional bots · Your equipped Armory loadout.</p>}</div><div className="lan-connection-guide"><Globe2 size={18} /><h4>Different networks. Same room.</h4><p>Keep the host tab open. You can switch apps to share your invite; your room is held for up to five minutes and reconnects when you return. The match pauses while the host app is suspended. Leaving the room ends it immediately.</p><p>This test uses an online relay. Open world remains solo. Room passwords control entry and are shared separately from invites.</p></div></aside></div>
    <footer className="lan-footer"><button onClick={() => { disconnect(); onBack(); }}><ArrowLeft size={15} /> Back to menu</button><span>PUBLIC ROOM TEST · NO ACCOUNT REQUIRED</span></footer>
  </section>;
}
