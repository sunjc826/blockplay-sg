import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicRooms, passwordHash, roomOriginAllowed } from './public-rooms.js';

const origin = 'https://game.example';
const request = (path = '', body, headers = {}) => new Request(`${origin}/api/rooms${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup() {
  const storage = new Map(), sockets = [];
  let ready;
  const ctx = {
    storage: { get: async key => structuredClone(storage.get(key)), put: async (key, value) => { storage.set(key, structuredClone(value)); }, setAlarm: vi.fn() },
    blockConcurrencyWhile(work) { ready = work(); },
    acceptWebSocket(socket) { sockets.push(socket); },
    getWebSockets: tag => sockets.filter(socket => !socket.closed && (!tag || socket.attachment.code === tag)),
  };
  const directory = new PublicRooms(ctx); await ready;
  const create = async () => {
    const response = await directory.fetch(request('', { name: 'Host', title: 'Room', protocol: 1, build: 'test' }));
    expect(response.status).toBe(201); const ticket = await response.json();
    const room = directory.rooms.get(ticket.code); room.members[0].connected = true;
    return { room, ticket };
  };
  const socket = (room, id) => {
    const result = { attachment: { code: room.code, id, window: Date.now(), messages: 0, bytes: 0 }, packets: [], closed: false,
      deserializeAttachment() { return { ...this.attachment }; }, serializeAttachment(value) { this.attachment = { ...value }; },
      send(data) { this.packets.push(JSON.parse(data)); }, close() { this.closed = true; } };
    sockets.push(result); return result;
  };
  const connect = async ticket => {
    vi.stubGlobal('WebSocketPair', class { constructor() { this[0] = {}; this[1] = socket({ code: ticket.code }, ticket.id); sockets.pop(); } });
    // Node's Response rejects status 101; the Worker runtime accepts upgrades.
    const NativeResponse = globalThis.Response;
    vi.stubGlobal('Response', class extends NativeResponse {
      constructor(body, init) { if (init?.status === 101) return { status: 101 }; super(body, init); }
    });
    return directory.fetch(request(`/${ticket.code}/ws`, undefined, { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `blockplay-v1, ticket.${ticket.token}` }));
  };
  return { directory, ctx, storage, create, socket, connect };
}

describe('public room boundary', () => {
  it('requires exact origin on writes and WebSocket upgrades', () => {
    expect(roomOriginAllowed(request())).toBe(true);
    expect(roomOriginAllowed(request('', {}, { Origin: 'https://evil.example' }))).toBe(false);
    expect(roomOriginAllowed(new Request(`${origin}/api/rooms`, { method: 'POST' }))).toBe(false);
    expect(roomOriginAllowed(new Request(`${origin}/api/rooms/ABCDEF/ws`, { headers: { Upgrade: 'websocket' } }))).toBe(false);
    expect(roomOriginAllowed(new Request(`${origin}/api/rooms`, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))).toBe(false);
  });
  it('derives a salted password digest', async () => {
    const digest = await passwordHash('test password', 'salt-one');
    expect(digest).toHaveLength(64);
    expect(await passwordHash('test password', 'salt-one')).toBe(digest);
    expect(await passwordHash('test password', 'salt-two')).not.toBe(digest);
  });
  it('rejects malformed and oversized bodies before reserving rooms', async () => {
    const { directory } = await setup();
    for (const body of [null, [], { name: 'x'.repeat(5000) }]) {
      expect((await directory.fetch(request('', body))).status).toBe(400);
    }
    expect(directory.rooms.size).toBe(0);
  });
  it('expires abandoned reservations and persisted host rooms', async () => {
    const { directory, create, storage } = await setup();
    const { room } = await create();
    const result = await directory.fetch(request(`/${room.code}/join`, { name: 'Guest', protocol: 1, build: 'test' }));
    expect(result.status).toBe(201);
    room.members[1].expiresAt = Date.now() - 1;
    await directory.alarm(); expect(room.members).toHaveLength(1);
    room.members[0].expiresAt = Date.now() - 1;
    await directory.alarm(); expect(directory.rooms.size).toBe(0); expect(storage.get('rooms')).toEqual([]);
  });
  it('drops oversized and flooding sockets and notifies the host', async () => {
    const { directory, create, socket } = await setup(); const { room } = await create();
    room.members.push({ id: 'guest', name: 'Guest', connected: true, expiresAt: Date.now() + 60_000 });
    const host = socket(room, room.hostId), guest = socket(room, 'guest');
    await directory.webSocketMessage(guest, 'x'.repeat(49 * 1024));
    expect(guest.closed).toBe(true); expect(room.members).toHaveLength(1);
    expect(host.packets.at(-1).kind).toBe('roster');
    const flood = socket(room, room.hostId); flood.attachment.messages = 120;
    await directory.webSocketMessage(flood, JSON.stringify({ kind: 'ping' }));
    expect(directory.rooms.size).toBe(0); expect(flood.closed).toBe(true);
  });
  it('restores directory metadata and request limits across hibernation', async () => {
    const { directory, create, storage, ctx } = await setup(); const { room } = await create();
    await directory.fetch(request());
    const copy = new PublicRooms(ctx); await new Promise(resolve => setTimeout(resolve, 0));
    expect(copy.rooms.get(room.code).hostId).toBe(room.hostId);
    expect(storage.get('rates').length).toBeGreaterThan(0);
  });
  it('keeps a background host listed and joinable beyond the normal heartbeat timeout', async () => {
    vi.useFakeTimers();
    const { directory, create, socket } = await setup(), { room } = await create();
    const host = socket(room, room.hostId);
    await directory.webSocketMessage(host, JSON.stringify({ kind: 'background' }));
    vi.setSystemTime(Date.now() + 90_000); await directory.alarm();
    expect((await (await directory.fetch(request())).json()).rooms[0].code).toBe(room.code);
    expect((await directory.fetch(request(`/${room.code}/join`, { name: 'Guest', protocol: 1, build: 'test' }))).status).toBe(201);
    await directory.webSocketMessage(host, JSON.stringify({ kind: 'foreground' }));
    expect(host.packets.at(-1)).toEqual({ kind: 'pong' });
    expect(room.members[0].expiresAt).toBe(Date.now() + 65_000);
  });
  it('reclaims the same host seat and ignores late close/error/message events from the old socket', async () => {
    const { directory, create, ctx, connect } = await setup(), { room, ticket } = await create();
    expect((await connect(ticket)).status).toBe(101);
    const old = ctx.getWebSockets(room.code)[0], id = room.hostId;
    expect((await connect(ticket)).status).toBe(101);
    const current = ctx.getWebSockets(room.code)[0]; expect(current).not.toBe(old); expect(old.closed).toBe(true);
    await directory.webSocketClose(old, 1000, 'Left room.');
    await directory.webSocketError(old);
    await directory.webSocketMessage(old, 'x'.repeat(49 * 1024));
    expect(directory.rooms.get(room.code).hostId).toBe(id); expect(room.members).toHaveLength(1);
    await directory.webSocketClose(current, 1006, ''); current.closed = true;
    expect(directory.rooms.has(room.code)).toBe(true);
    expect((await connect(ticket)).status).toBe(101);
    expect(room.hostId).toBe(id); expect(room.members).toHaveLength(1);
    const rejected = await connect({ ...ticket, token: '0'.repeat(64) }); expect(rejected.status).toBe(403);
  });
  it('reserves a dropped guest seat until recovery, then expires abandoned members', async () => {
    vi.useFakeTimers();
    const { directory, create, socket } = await setup(), { room } = await create();
    room.members[0].expiresAt = Date.now() + 6 * 60_000;
    room.members.push({ id: 'guest', name: 'Guest', connected: true, expiresAt: Date.now() + 65_000 });
    const host = socket(room, room.hostId), guest = socket(room, 'guest');
    await directory.webSocketClose(guest, 1006, '');
    expect(room.members).toHaveLength(2); expect(host.packets).toEqual([]);
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1); await directory.alarm();
    expect(room.members).toHaveLength(1); expect(host.packets.at(-1).peers).toHaveLength(1);
    await directory.webSocketClose(host, 1000, 'Left room.'); expect(directory.rooms.size).toBe(0);
  });
  it('expires a background host and honors explicit leave during the grace period', async () => {
    vi.useFakeTimers();
    const { directory, create, socket } = await setup(), { room } = await create();
    await directory.webSocketMessage(socket(room, room.hostId), JSON.stringify({ kind: 'background' }));
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1); await directory.alarm(); expect(directory.rooms.size).toBe(0);
    const next = await create(); await directory.webSocketClose(socket(next.room, next.room.hostId), 1006, '');
    expect((await directory.fetch(request(`/${next.room.code}/leave`, { id: next.ticket.id, token: next.ticket.token }))).status).toBe(200);
    expect(directory.rooms.size).toBe(0);
  });
});
