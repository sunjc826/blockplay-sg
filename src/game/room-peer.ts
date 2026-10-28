import { cleanLanName, cleanRoomCode, type LanPeer, type LanSession } from './lan-peer';

export interface PublicRoom {
  code: string; title: string; host: string; players: number; maxPlayers: number;
  locked: boolean; createdAt: number; build: string; map: string; mode: string;
}
export const ROOM_BUILD: string = import.meta.env.VITE_ROOM_BUILD || 'development';
const API = '/api/rooms', PROTOCOL = 1, MAX_PACKET = 48 * 1024;
interface Ticket { code: string; id: string; token: string; hostId: string; role: 'host' | 'guest' }
export async function roomApi<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Public rooms are unavailable here. Use the Cloudflare build or start the Worker preview.'); }
  if (!response.ok) throw new Error(result.error || 'Could not contact the room server.');
  return result as T;
}
export const listPublicRooms = async () => (await roomApi<{ rooms: PublicRoom[] }>()).rooms;
export const publicRoomsAvailable = async () => {
  try { return (await roomApi<{ service: string }>('/health')).service === 'blockplay-rooms'; } catch { return false; }
};

// Matches the relay's bounded seat reservation while a phone is suspended.
const RECONNECT_MS = 5 * 60_000;
export function connectRoom(ticket: Ticket, name: string, signal?: AbortSignal): Promise<LanSession> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API}/${ticket.code}/ws`, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket | undefined, closed = false, ready = false, socketReady = false;
    let background = document.hidden, peers: LanPeer[] = [], lastPong = Date.now(), recoveryUntil = 0, retries = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined;
    const listeners = new Set<(from: string, payload: unknown) => void>(), peerListeners = new Set<() => void>();
    const notify = () => { for (const handler of [...peerListeners]) handler(); };
    const control = (kind: string) => {
      if (socket?.readyState === WebSocket.OPEN) try { socket.send(JSON.stringify({ kind })); } catch { /* Close/heartbeat recovers the socket. */ }
    };
    const session: LanSession = {
      id: ticket.id, name: cleanLanName(name), role: ticket.role, transport: 'public',
      // A recoverable socket interruption preserves the logical room and actors.
      isConnected: () => ready && !closed,
      send(payload, to) {
        if (!socketReady || closed || background || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256 * 1024) return;
        let packet; try { packet = JSON.stringify({ kind: 'data', payload, ...(to ? { to } : {}) }); } catch { return; }
        if (new TextEncoder().encode(packet).byteLength <= MAX_PACKET) try { socket.send(packet); } catch { reconnect(); }
      },
      subscribe(handler) { listeners.add(handler); return () => { listeners.delete(handler); }; },
      getPeers: () => peers.map(peer => ({ ...peer })),
      onPeers(handler) { peerListeners.add(handler); return () => { peerListeners.delete(handler); }; },
      close() {
        if (closed) return; closed = true;
        clearTimeout(timeout); clearTimeout(retry); clearInterval(heartbeat);
        window.removeEventListener('pagehide', suspend); window.removeEventListener('pageshow', resume); window.removeEventListener('online', resume);
        document.removeEventListener('visibilitychange', visibility); signal?.removeEventListener('abort', abort);
        peers = []; notify(); listeners.clear(); peerListeners.clear();
        socket?.close(1000, 'Left room.');
        void fetch(`${API}/${ticket.code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ticket.id, token: ticket.token }), keepalive: true }).catch(() => {});
        if (!ready) reject(new Error('Room connection cancelled or closed.'));
      },
    };
    const fail = (message: string) => { if (!ready) reject(new Error(message)); session.close(); };
    const abort = () => fail('Room connection cancelled.');
    function reconnect() {
      if (closed) return;
      socketReady = false;
      clearTimeout(timeout);
      if (!ready) { fail('Could not open the room connection. Refresh and try again.'); return; }
      recoveryUntil ||= Date.now() + RECONNECT_MS;
      if (Date.now() >= recoveryUntil) { fail('Connection lost. Rejoin the room.'); return; }
      if (background || retry !== undefined) return;
      retry = setTimeout(() => { retry = undefined; open(); }, Math.min(500 * 2 ** retries++, 5000));
    }
    function open() {
      if (closed) return;
      clearTimeout(timeout); clearTimeout(retry); retry = undefined;
      socketReady = false;
      // Keep bearer credentials out of URLs, browser history and invite links.
      const previous = socket;
      let current: WebSocket;
      try { current = new WebSocket(url, ['blockplay-v1', `ticket.${ticket.token}`]); } catch { reconnect(); return; }
      socket = current;
      previous?.close(1000, 'Reconnecting.');
      timeout = setTimeout(() => ready ? reconnect() : fail('Room connection timed out. Refresh the room list and try again.'), 15_000);
      current.onopen = () => { if (socket === current && background) control('background'); };
      current.onmessage = event => {
        if (closed || socket !== current || typeof event.data !== 'string' || event.data.length > MAX_PACKET) return;
        let packet; try { packet = JSON.parse(event.data); } catch { return; }
        lastPong = Date.now();
        if (packet?.kind === 'pong') return;
        if (packet?.kind === 'closed') { fail(packet.reason || 'Host left. The room is closed.'); return; }
        if (packet?.kind === 'roster' && Array.isArray(packet.peers)) {
          peers = packet.peers.slice(0, 4).filter((peer: LanPeer) => peer && typeof peer.id === 'string' && typeof peer.name === 'string' && peer.id !== ticket.id).map((peer: LanPeer) => ({ id: peer.id, name: cleanLanName(peer.name) }));
          // Host is always first; arena-runtime derives its authority from this list.
          peers.sort((a, b) => Number(b.id === ticket.hostId) - Number(a.id === ticket.hostId));
          if (ticket.role === 'host' || peers.some(peer => peer.id === ticket.hostId)) {
            socketReady = true; retries = 0; clearTimeout(timeout); clearTimeout(retry); retry = undefined;
            if (!background) recoveryUntil = 0;
            control(background ? 'background' : 'foreground');
            if (!ready) { ready = true; resolve(session); }
          }
          notify();
        } else if (socketReady && packet?.kind === 'data' && typeof packet.from === 'string' && peers.some(peer => peer.id === packet.from)) {
          if (ticket.role === 'guest' && packet.from !== ticket.hostId) return;
          for (const handler of [...listeners]) handler(packet.from, packet.payload);
        }
      };
      current.onclose = event => {
        if (closed || socket !== current) return;
        if (event.code === 1008 || event.code === 1009) fail('Room session expired or rejected. Rejoin from the room list.');
        else reconnect();
      };
      current.onerror = () => { if (socket === current) reconnect(); };
    }
    function suspend() {
      if (closed || background) return;
      background = true; recoveryUntil = Date.now() + RECONNECT_MS;
      clearTimeout(retry); retry = undefined;
      control('background');
    }
    function resume() {
      if (closed || document.hidden) return;
      const wasBackground = background; background = false;
      if (recoveryUntil && Date.now() >= recoveryUntil) { fail('Connection lost. Rejoin the room.'); return; }
      // Replace even an apparently open socket: mobile browsers may silently
      // discard its underlying connection while JavaScript is frozen.
      if (wasBackground || !socketReady) { lastPong = Date.now(); open(); }
    }
    function visibility() { if (document.hidden) suspend(); else resume(); }
    const heartbeat = setInterval(() => {
      if (background || document.hidden) return;
      if (Date.now() - lastPong > 60_000) { reconnect(); return; }
      control('ping');
    }, 20_000);
    window.addEventListener('pagehide', suspend); window.addEventListener('pageshow', resume); window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visibility); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    open();
  });
}
export async function createPublicRoom(name: string, title: string, password = '', signal?: AbortSignal) {
  const ticket = await roomApi<Ticket>('', { name: cleanLanName(name), title, password, protocol: PROTOCOL, build: ROOM_BUILD });
  return { session: await connectRoom(ticket, name, signal), roomCode: ticket.code };
}
export async function joinPublicRoom(name: string, code: string, password = '', signal?: AbortSignal) {
  code = cleanRoomCode(code);
  if (!/^[A-F0-9]{6}$/.test(code)) throw new Error('Enter the six-character room code.');
  const ticket = await roomApi<Ticket>(`/${code}/join`, { name: cleanLanName(name), password, protocol: PROTOCOL, build: ROOM_BUILD });
  return connectRoom(ticket, name, signal);
}
