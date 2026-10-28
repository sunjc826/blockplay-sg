// Test-stage directory and relay. One bounded Durable Object gives the room list
// and seat reservations a single authority; game simulation remains in the host.
export const ROOM_PROTOCOL = 1;
const MAX_ROOMS = 64, MAX_PLAYERS = 4, MAX_PACKET = 48 * 1024;
const RESERVATION_MS = 20_000, PEER_TIMEOUT_MS = 65_000, ROOM_LIFETIME_MS = 6 * 60 * 60 * 1000;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const clean = (value, size, fallback) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, size) || fallback : fallback;
const random = () => crypto.randomUUID().replaceAll('-', '');
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function roomOriginAllowed(request) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  return request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}
export async function readRoomBody(request) {
  const reader = request.body?.getReader();
  let raw = '', size = 0;
  const decoder = new TextDecoder();
  if (reader) try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 4096) { await reader.cancel(); throw new Error('Request too large.'); } raw += decoder.decode(value, { stream: true }); }
  } finally { reader?.releaseLock(); }
  return raw + decoder.decode();
}
async function bodyOf(request) {
  const body = JSON.parse(await readRoomBody(request) || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');
  return body;
}

export class PublicRooms {
  constructor(ctx) {
    this.ctx = ctx;
    this.rooms = new Map();
    this.rates = new Map();
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => { this.rooms = new Map(await ctx.storage.get('rooms') || []); this.rates = new Map(await ctx.storage.get('rates') || []); });
  }
  // Password derivation yields to other events; serialize mutations explicitly so
  // concurrent joins cannot reserve the same last seat or resurrect a closed room.
  exclusive(work) { const result = this.queue.then(work); this.queue = result.catch(() => {}); return result; }
  save() { return this.ctx.storage.put('rooms', [...this.rooms]); }
  sockets(code) { return this.ctx.getWebSockets(code); }
  summary(room) {
    return { code: room.code, title: room.title, host: room.members[0].name, players: room.members.length, maxPlayers: MAX_PLAYERS, locked: !!room.passwordHash, createdAt: room.createdAt, build: room.build, map: 'Marina Bay', mode: 'Free for all' };
  }
  limited(key, max, windowMs = 60_000) {
    const now = Date.now();
    for (const [id, value] of this.rates) if (value.until <= now) this.rates.delete(id);
    let rate = this.rates.get(key);
    if (!rate) { if (this.rates.size >= 512) return true; this.rates.set(key, rate = { count: 0, until: now + windowMs }); }
    return ++rate.count > max;
  }
  send(socket, packet) { try { socket.send(JSON.stringify(packet)); } catch { /* Close callback handles a broken connection. */ } }
  roster(room) {
    const peers = room.members.filter(member => member.connected).map(({ id, name }) => ({ id, name }));
    for (const socket of this.sockets(room.code)) this.send(socket, { kind: 'roster', peers });
  }
  closeRoom(room, reason = 'Host left. The room is closed.') {
    this.rooms.delete(room.code);
    for (const socket of this.sockets(room.code)) { this.send(socket, { kind: 'closed', reason }); try { socket.close(1000, reason); } catch {} }
  }
  prune() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const stale = room.members.filter(member => member.expiresAt <= now);
      if (room.createdAt + ROOM_LIFETIME_MS <= now || stale.some(member => member.id === room.hostId)) { this.closeRoom(room, 'Room expired or host disconnected.'); continue; }
      if (!stale.length) continue;
      const ids = new Set(stale.map(member => member.id));
      room.members = room.members.filter(member => !ids.has(member.id));
      for (const socket of this.sockets(room.code)) if (ids.has(socket.deserializeAttachment()?.id)) try { socket.close(1000, 'Connection expired.'); } catch {}
      this.roster(room);
    }
  }
  async fetch(request) {
    return this.exclusive(async () => {
      try {
        if (!roomOriginAllowed(request)) return json({ error: 'Unexpected origin.' }, 403);
        this.prune();
        const url = new URL(request.url), path = url.pathname;
        if (path === '/api/rooms/health' && request.method === 'GET') return json({ service: 'blockplay-rooms', protocol: ROOM_PROTOCOL });
        if (path === '/api/rooms' && request.method === 'GET') return json({ rooms: [...this.rooms.values()].filter(room => room.members[0]?.connected).map(room => this.summary(room)) });
        const ip = request.headers.get('x-room-client-ip') || 'local';
        if (this.limited(`request:${ip}`, 120)) return json({ error: 'Too many room requests. Try again in a minute.' }, 429);
        const match = path.match(/^\/api\/rooms\/([A-F0-9]{6})\/(join|ws|leave)$/);
        if (match?.[2] === 'ws' && request.method === 'GET') return this.connect(request, match[1]);
        if (request.method !== 'POST') return json({ error: 'Unknown room endpoint.' }, 404);
        let body;
        try { body = await bodyOf(request); } catch { return json({ error: 'Invalid JSON or request too large.' }, 400); }
        const creating = path === '/api/rooms';
        if (!creating && !match) return json({ error: 'Unknown room endpoint.' }, 404);
        if (!creating && match[2] === 'leave') {
          const room = this.rooms.get(match[1]);
          const member = room?.members.find(member => member.id === body.id);
          // Leave uses the same bearer token as the WebSocket, never a room code alone.
          if (!member || member.tokenHash !== await hash(String(body.token || ''))) return json({ error: 'Invalid room session.' }, 403);
          this.remove(room, member.id); await this.save(); return json({ ok: true });
        }
        if (body.protocol !== ROOM_PROTOCOL || typeof body.build !== 'string' || !/^[a-zA-Z0-9.-]{1,80}$/.test(body.build)) return json({ error: 'Update the game before joining multiplayer.' }, 409);
        if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length > 64)) return json({ error: 'Passwords must be at most 64 characters.' }, 400);
        const name = clean(body.name, 20, 'Recruit'), password = body.password || '';
        if (creating && password && password.length < 4) return json({ error: 'Use at least 4 characters for a room password.' }, 400);
        let room;
        if (creating) {
          if (this.limited(`create:${ip}`, 6)) return json({ error: 'Too many new rooms. Try again in a minute.' }, 429);
          if (this.rooms.size >= MAX_ROOMS) return json({ error: 'The test server is full. Try again later.' }, 503);
          let code; do { code = random().slice(0, 6).toUpperCase(); } while (this.rooms.has(code));
          const salt = random();
          room = { code, title: clean(body.title, 40, `${name}'s room`), createdAt: Date.now(), hostId: '', build: body.build, salt, passwordHash: password ? await passwordHash(password, salt) : '', members: [] };
          this.rooms.set(code, room);
        } else {
          room = this.rooms.get(match[1]);
          if (!room || !room.members[0]?.connected) return json({ error: 'Room closed or not found. Refresh the room list.' }, 404);
          if (this.limited(`join:${ip}`, 12)) return json({ error: 'Too many join attempts. Try again in a minute.' }, 429);
          if (room.build !== body.build) return json({ error: 'This room uses a different game version. Both players should reload.' }, 409);
          if (room.members.length >= MAX_PLAYERS) return json({ error: 'This room is full (4 players).' }, 409);
          if (room.passwordHash && await passwordHash(password, room.salt) !== room.passwordHash) return json({ error: 'Incorrect room password.' }, 403);
        }
        const token = random() + random(), id = random();
        const member = { id, name, tokenHash: await hash(token), connected: false, expiresAt: Date.now() + RESERVATION_MS };
        room.members.push(member); if (creating) room.hostId = id;
        await this.save(); await this.ctx.storage.setAlarm(Date.now() + 15_000);
        return json({ code: room.code, id, token, hostId: room.hostId, role: creating ? 'host' : 'guest' }, 201);
      } finally { await this.save(); await this.ctx.storage.put('rates', [...this.rates]); }
    });
  }
  async connect(request, code) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(value => value.trim());
    const token = protocols.find(value => /^ticket\.[a-f0-9]{64}$/.test(value))?.slice(7);
    const room = this.rooms.get(code);
    const digest = token ? await hash(token) : '';
    const member = room?.members.find(member => member.tokenHash === digest && !member.connected);
    if (!protocols.includes('blockplay-v1') || !member) return json({ error: 'Invalid or expired room session.' }, 403);
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    member.connected = true; member.expiresAt = Date.now() + PEER_TIMEOUT_MS;
    this.ctx.acceptWebSocket(server, [code]);
    server.serializeAttachment({ code, id: member.id, window: Date.now(), messages: 0, bytes: 0 });
    await this.save();
    this.send(server, { kind: 'welcome', id: member.id, hostId: room.hostId }); this.roster(room);
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'blockplay-v1' } });
  }
  remove(room, id) {
    if (room.hostId === id) this.closeRoom(room);
    else { room.members = room.members.filter(member => member.id !== id); for (const socket of this.sockets(room.code)) if (socket.deserializeAttachment()?.id === id) try { socket.close(1000, 'Left room.'); } catch {} this.roster(room); }
  }
  webSocketMessage(socket, data) {
    return this.exclusive(async () => {
      const attachment = socket.deserializeAttachment();
      const room = this.rooms.get(attachment?.code), member = room?.members.find(member => member.id === attachment.id);
      if (!member) { socket.close(1008, 'Session expired.'); return; }
      if (typeof data !== 'string' || data.length > MAX_PACKET || new TextEncoder().encode(data).byteLength > MAX_PACKET) { this.remove(room, member.id); socket.close(1009, 'Packet too large.'); await this.save(); return; }
      const now = Date.now();
      if (now - attachment.window >= 1000) { attachment.window = now; attachment.messages = 0; attachment.bytes = 0; }
      attachment.messages++; attachment.bytes += data.length;
      // Accommodates 20 Hz inputs and automatic weapons, plus 10 Hz snapshots.
      if (attachment.messages > 120 || attachment.bytes > 1024 * 1024) { this.remove(room, member.id); socket.close(1008, 'Room rate limit.'); await this.save(); return; }
      socket.serializeAttachment(attachment);
      let packet; try { packet = JSON.parse(data); } catch { return; }
      if (!packet || typeof packet !== 'object') return;
      member.expiresAt = now + PEER_TIMEOUT_MS;
      if (packet.kind === 'ping') { this.send(socket, { kind: 'pong' }); await this.save(); return; }
      if (packet.kind !== 'data' || !packet.payload || typeof packet.payload !== 'object') return;
      const host = member.id === room.hostId;
      // Guests can only address the host. The relay supplies the sender identity.
      if (packet.to !== undefined && typeof packet.to !== 'string') return;
      if (!host && packet.to && packet.to !== room.hostId) return;
      for (const target of this.sockets(room.code)) {
        const id = target.deserializeAttachment()?.id;
        if (id === member.id || (host ? packet.to && id !== packet.to : id !== room.hostId)) continue;
        this.send(target, { kind: 'data', from: member.id, payload: packet.payload });
      }
    });
  }
  webSocketClose(socket) { return this.exclusive(async () => { const attachment = socket.deserializeAttachment(); const room = this.rooms.get(attachment?.code); if (room) { this.remove(room, attachment.id); await this.save(); } }); }
  webSocketError(socket) { return this.webSocketClose(socket); }
  alarm() { return this.exclusive(async () => { this.prune(); await this.save(); if (this.rooms.size) await this.ctx.storage.setAlarm(Date.now() + 15_000); }); }
}
