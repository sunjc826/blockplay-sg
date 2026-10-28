import { describe, expect, it, vi } from 'vitest';
import { PublicRooms, passwordHash, roomOriginAllowed } from './public-rooms.js';

const origin = 'https://game.example';
const request = (path = '', body, headers = {}) => new Request(`${origin}/api/rooms${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function setup() {
  const storage = new Map(), sockets = [];
  let ready;
  const ctx = {
    storage: { get: async key => structuredClone(storage.get(key)), put: async (key, value) => { storage.set(key, structuredClone(value)); }, setAlarm: vi.fn() },
    blockConcurrencyWhile(work) { ready = work(); },
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
  return { directory, ctx, storage, create, socket };
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
});
