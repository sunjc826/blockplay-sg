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

export function connectRoom(ticket: Ticket, name: string, signal?: AbortSignal): Promise<LanSession> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API}/${ticket.code}/ws`, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Keep bearer credentials out of URLs, browser history and invite links.
    const socket = new WebSocket(url, ['blockplay-v1', `ticket.${ticket.token}`]);
    let closed = false, ready = false, peers: LanPeer[] = [], lastPong = Date.now();
    const listeners = new Set<(from: string, payload: unknown) => void>(), peerListeners = new Set<() => void>();
    const notify = () => { for (const handler of [...peerListeners]) handler(); };
    const leave = () => {
      void fetch(`${API}/${ticket.code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ticket.id, token: ticket.token }), keepalive: true }).catch(() => {});
    };
    const session: LanSession = {
      id: ticket.id, name: cleanLanName(name), role: ticket.role, transport: 'public',
      isConnected: () => ready && !closed,
      send(payload, to) {
        if (!ready || closed || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256 * 1024) return;
        let packet; try { packet = JSON.stringify({ kind: 'data', payload, ...(to ? { to } : {}) }); } catch { return; }
        if (new TextEncoder().encode(packet).byteLength <= MAX_PACKET) socket.send(packet);
      },
      subscribe(handler) { listeners.add(handler); return () => { listeners.delete(handler); }; },
      getPeers: () => peers.map(peer => ({ ...peer })),
      onPeers(handler) { peerListeners.add(handler); return () => { peerListeners.delete(handler); }; },
      close() {
        if (closed) return; closed = true;
        clearTimeout(timeout); clearInterval(heartbeat); window.removeEventListener('pagehide', session.close); signal?.removeEventListener('abort', abort);
        peers = []; notify(); listeners.clear(); peerListeners.clear();
        socket.close(1000, 'Left room.'); leave();
        if (!ready) reject(new Error('Room connection cancelled or closed.'));
      },
    };
    const fail = (message: string) => { if (!ready) reject(new Error(message)); session.close(); };
    const abort = () => fail('Room connection cancelled.');
    const timeout = setTimeout(() => fail('Room connection timed out. Refresh the room list and try again.'), 15_000);
    const heartbeat = setInterval(() => {
      if (Date.now() - lastPong > 60_000) { fail('Connection lost. Rejoin the room.'); return; }
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'ping' }));
    }, 20_000);
    window.addEventListener('pagehide', session.close); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    socket.onmessage = event => {
      if (closed || typeof event.data !== 'string' || event.data.length > MAX_PACKET) return;
      let packet; try { packet = JSON.parse(event.data); } catch { return; }
      if (packet?.kind === 'pong') { lastPong = Date.now(); return; }
      if (packet?.kind === 'closed') { fail(packet.reason || 'Host left. The room is closed.'); return; }
      if (packet?.kind === 'roster' && Array.isArray(packet.peers)) {
        peers = packet.peers.slice(0, 4).filter((peer: LanPeer) => peer && typeof peer.id === 'string' && typeof peer.name === 'string' && peer.id !== ticket.id).map((peer: LanPeer) => ({ id: peer.id, name: cleanLanName(peer.name) }));
        // Host is always first; arena-runtime derives its authority from this list.
        peers.sort((a, b) => Number(b.id === ticket.hostId) - Number(a.id === ticket.hostId));
        notify();
        if (!ready && (ticket.role === 'host' || peers.some(peer => peer.id === ticket.hostId))) { ready = true; clearTimeout(timeout); resolve(session); }
      } else if (packet?.kind === 'data' && typeof packet.from === 'string' && peers.some(peer => peer.id === packet.from)) {
        if (ticket.role === 'guest' && packet.from !== ticket.hostId) return;
        for (const handler of [...listeners]) handler(packet.from, packet.payload);
      }
    };
    socket.onclose = () => fail('Room closed or connection lost. Rejoin from the room list.');
    socket.onerror = () => fail('Could not open the room connection. Refresh and try again.');
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
