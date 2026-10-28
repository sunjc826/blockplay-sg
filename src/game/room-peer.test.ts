import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRoom } from './room-peer';

class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = 1; bufferedAmount = 0; sent: string[] = [];
  onmessage?: (event: { data: string }) => void;
  onopen?: () => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(public url: URL, public protocols: string[]) { Socket.latest = this; }
  send(packet: string) { this.sent.push(packet); }
  close(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  receive(packet: unknown) { this.onmessage?.({ data: JSON.stringify(packet) }); }
}
const ticket = { code: 'ABC123', id: 'self', token: 'secret-token', hostId: 'host', role: 'guest' as const };
function setup() {
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { href: 'https://game.example/multiplayer' } }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
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
    session.send({ input: 1 }); expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ kind: 'data', payload: { input: 1 } });
    session.close(); expect(session.isConnected?.()).toBe(false);
  });
  it('drops oversized or buffered packets and clears peers on host closure', async () => {
    setup(); const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    socket.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    socket.sent = [];
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
  it.each(['host', 'guest'] as const)('preserves the %s room during app switching and reconnects with the same ticket', async role => {
    setup(); vi.useFakeTimers();
    const connection = connectRoom({ ...ticket, role }, 'Pilot'), original = Socket.latest;
    original.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    const changed = vi.fn(); session.onPeers(changed);
    Object.assign(document, { hidden: true }); document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(original.sent.at(-1)!)).toEqual({ kind: 'background' });
    session.send({ ignored: true });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(session.isConnected?.()).toBe(true); expect(session.getPeers()).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    Object.assign(document, { hidden: false }); document.dispatchEvent(new Event('visibilitychange'));
    const replacement = Socket.latest;
    expect(replacement).not.toBe(original); expect(replacement.protocols).toEqual(original.protocols);
    replacement.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] });
    session.send({ resumed: true }); expect(JSON.parse(replacement.sent.at(-1)!)).toEqual({ kind: 'data', payload: { resumed: true } });
    original.receive({ kind: 'closed' }); expect(session.isConnected?.()).toBe(true);
    session.close(); expect(fetch).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('pageshow')); expect(Socket.latest).toBe(replacement);
  });
  it('recovers a dropped socket without clearing peers or publishing a leave', async () => {
    setup(); vi.useFakeTimers();
    const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    socket.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    const changed = vi.fn(); session.onPeers(changed); socket.close();
    expect(session.isConnected?.()).toBe(true); expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    const replacement = Socket.latest; expect(replacement).not.toBe(socket);
    replacement.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] });
    expect(fetch).not.toHaveBeenCalled(); session.close();
  });
  it('replaces a silent socket after missed heartbeats instead of leaving the room', async () => {
    setup(); vi.useFakeTimers();
    const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    socket.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    await vi.advanceTimersByTimeAsync(80_500);
    expect(Socket.latest).not.toBe(socket); expect(fetch).not.toHaveBeenCalled(); session.close();
  });
  it('cancels a pending retry if the current connection recovers first', async () => {
    setup(); vi.useFakeTimers();
    const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    const roster = { kind: 'roster', peers: [{ id: 'host', name: 'Host' }] };
    socket.receive(roster); const session = await connection;
    socket.onerror?.(); socket.receive(roster);
    await vi.advanceTimersByTimeAsync(500);
    expect(Socket.latest).toBe(socket); expect(fetch).not.toHaveBeenCalled(); session.close();
  });
  it('stops retrying an unreachable room after five minutes', async () => {
    setup(); vi.useFakeTimers();
    const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    socket.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    socket.close(); await vi.advanceTimersByTimeAsync(5 * 60_000 + 20_000);
    expect(session.isConnected?.()).toBe(false); expect(fetch).toHaveBeenCalledOnce();
    const last = Socket.latest; await vi.advanceTimersByTimeAsync(60_000); expect(Socket.latest).toBe(last);
  });
  it('ends the session when the background recovery window expires', async () => {
    setup(); vi.useFakeTimers();
    const connection = connectRoom(ticket, 'Pilot'), socket = Socket.latest;
    socket.receive({ kind: 'roster', peers: [{ id: 'host', name: 'Host' }] }); const session = await connection;
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    window.dispatchEvent(new Event('pageshow'));
    expect(session.isConnected?.()).toBe(false); expect(fetch).toHaveBeenCalledOnce();
  });
});
