import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRoom } from './room-peer';

class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = 1; bufferedAmount = 0; sent: string[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(public url: URL, public protocols: string[]) { Socket.latest = this; }
  send(packet: string) { this.sent.push(packet); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(packet: unknown) { this.onmessage?.({ data: JSON.stringify(packet) }); }
}
const ticket = { code: 'ABC123', id: 'self', token: 'secret-token', hostId: 'host', role: 'guest' as const };
function setup() {
  vi.stubGlobal('window', { location: { href: 'https://game.example/multiplayer' }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}));
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('public room session', () => {
  it('keeps credentials out of URLs and puts the authoritative host first', async () => {
    setup(); const connection = connectRoom(ticket, ' Pilot '); const socket = Socket.latest;
    expect(socket.url.toString()).toBe('wss://game.example/api/rooms/ABC123/ws');
    expect(socket.protocols).toContain('ticket.secret-token');
    socket.receive({ kind: 'roster', peers: [{ id: 'other', name: 'Other' }, { id: 'self', name: 'Pilot' }, { id: 'host', name: 'Host' }] });
    const session = await connection;
    expect(session.name).toBe('Pilot'); expect(session.getPeers().map(peer => peer.id)).toEqual(['host', 'other']);
    const handler = vi.fn(); session.subscribe(handler);
    socket.receive({ kind: 'data', from: 'other', payload: { forged: true } }); expect(handler).not.toHaveBeenCalled();
    socket.receive({ kind: 'data', from: 'host', payload: { tick: 1 } }); expect(handler).toHaveBeenCalledWith('host', { tick: 1 });
    session.send({ input: 1 }); expect(JSON.parse(socket.sent[0])).toEqual({ kind: 'data', payload: { input: 1 } });
    session.close(); expect(session.isConnected?.()).toBe(false);
  });
  it('drops oversized or buffered packets and clears peers on host closure', async () => {
    setup(); const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    socket.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    session.send({ large: 'x'.repeat(49 * 1024) }); expect(socket.sent).toEqual([]);
    socket.bufferedAmount = 300 * 1024; session.send({ input: 1 }); expect(socket.sent).toEqual([]);
    const changed = vi.fn(); session.onPeers(changed);
    socket.receive({ kind: 'closed', reason: 'Host left.' });
    expect(session.getPeers()).toEqual([]); expect(changed).toHaveBeenCalledOnce(); expect(session.isConnected?.()).toBe(false);
  });
  it('releases a reservation when connecting is cancelled', async () => {
    setup(); const controller = new AbortController();
    const connection = connectRoom(ticket, 'Pilot', controller.signal);
    controller.abort(); await expect(connection).rejects.toThrow('cancelled');
    expect(fetch).toHaveBeenCalledWith('/api/rooms/ABC123/leave', expect.objectContaining({ keepalive: true }));
  });
});
