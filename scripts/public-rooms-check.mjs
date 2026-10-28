// Start pnpm preview:cloudflare first. No paid APIs or TURN credentials needed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
// Use Wrangler's installed WebSocket client to supply a browser Origin header.
const wranglerRequire = createRequire(realpathSync(new URL('../node_modules/wrangler/package.json', import.meta.url)));
const { WebSocket } = createRequire(wranglerRequire.resolve('miniflare'))('ws');
const origin = process.env.CLOUDFLARE_APP_ORIGIN || 'http://127.0.0.1:8787';
const api = async (path = '', body, headers = {}) => {
  const response = await fetch(`${origin}/api/rooms${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json(), headers: response.headers };
};
const clients = [], tickets = [];
const profile = { protocol: 1, build: 'network-check', name: 'Tester' };
const reserve = async (path, fields) => { const result = await api(path, { ...profile, ...fields }); assert.equal(result.status, 201, JSON.stringify(result.body)); tickets.push(result.body); return result.body; };
const connect = ticket => new Promise((resolve, reject) => {
  const url = new URL(`/api/rooms/${ticket.code}/ws`, origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url, ['blockplay-v1', `ticket.${ticket.token}`], { origin }); clients.push(socket);
  const messages = [], waiters = [];
  socket.on('error', reject);
  socket.on('message', raw => { const packet = JSON.parse(raw); messages.push(packet); for (const check of [...waiters]) check(); });
  const wait = predicate => new Promise((res, rej) => { const check = () => { const packet = messages.find(predicate); if (packet) { clearTimeout(timer); waiters.splice(waiters.indexOf(check), 1); res(packet); } }; const timer = setTimeout(() => { waiters.splice(waiters.indexOf(check), 1); rej(Error('Timed out waiting for relay packet')); }, 5000); waiters.push(check); check(); });
  socket.once('open', async () => { try { await wait(packet => packet.kind === 'roster'); resolve({ socket, messages, wait, send: packet => socket.send(JSON.stringify(packet)) }); } catch (error) { reject(error); } });
});
const deniedSocket = (ticket, socketOrigin = origin) => new Promise((resolve, reject) => {
  const url = new URL(`/api/rooms/${ticket.code}/ws`, origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url, ['blockplay-v1', `ticket.${ticket.token}`], { origin: socketOrigin }); clients.push(socket);
  socket.once('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode); });
  socket.once('open', () => { socket.terminate(); reject(Error('Unauthorized socket accepted')); });
  socket.once('error', reject);
});
try {
  assert.equal((await api('/health')).body.service, 'blockplay-rooms');
  assert.equal((await api('', profile, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await api('', { ...profile, password: 'abc' })).status, 400);
  assert.equal((await api('', { ...profile, title: 'x'.repeat(5000) })).status, 413);
  const hostTicket = await reserve('', { title: '<Public test>', name: 'Host\nName', password: 'room-secret' });
  assert.equal(await deniedSocket(hostTicket, 'https://evil.invalid'), 403);
  assert.equal(await deniedSocket({ ...hostTicket, token: '0'.repeat(64) }), 403);
  let host = await connect(hostTicket);
  const originalHost = host;
  host = await connect(hostTicket);
  await new Promise(resolve => originalHost.socket.readyState === WebSocket.CLOSED ? resolve() : originalHost.socket.once('close', resolve));
  assert.equal((await api()).body.rooms.find(room => room.code === hostTicket.code).players, 1, 'A resumed ticket replaces its old connection without claiming another seat');
  const listing = await api();
  const room = listing.body.rooms.find(room => room.code === hostTicket.code);
  assert.equal(room.locked, true); assert.equal(room.players, 1); assert.equal(room.host, 'HostName');
  assert.equal(room.title, '<Public test>');
  assert(!JSON.stringify(listing.body).includes('room-secret')); assert(!JSON.stringify(listing.body).includes(hostTicket.token));
  assert.equal(listing.headers.get('Cache-Control'), 'no-store');
  assert.equal((await api(`/${hostTicket.code}/join`, { ...profile, password: 'wrong' })).status, 403);
  assert.equal((await api(`/${hostTicket.code}/join`, { ...profile, password: 'room-secret', build: 'stale' })).status, 409);
  const guestTicket = await reserve(`/${hostTicket.code}/join`, { name: 'Guest', password: 'room-secret' });
  let guest = await connect(guestTicket);
  await host.wait(packet => packet.kind === 'roster' && packet.peers.length === 2);
  guest.send({ kind: 'data', from: 'forged', payload: { type: 'arena-input', value: 42 } });
  const inbound = await host.wait(packet => packet.kind === 'data'); assert.equal(inbound.from, guestTicket.id); assert.equal(inbound.payload.value, 42);
  host.send({ kind: 'data', to: guestTicket.id, payload: { type: 'arena-state', tick: 42 } });
  assert.equal((await guest.wait(packet => packet.kind === 'data')).from, hostTicket.id);
  const secondTicket = await reserve(`/${hostTicket.code}/join`, { name: 'Second', password: 'room-secret' });
  const second = await connect(secondTicket);
  guest.send({ kind: 'data', to: secondTicket.id, payload: { forbidden: true } });
  guest.send({ kind: 'ping' }); await guest.wait(packet => packet.kind === 'pong');
  assert(!second.messages.some(packet => packet.payload?.forbidden), 'No guest-to-guest relay');
  // Two simultaneous claims for the final seat: exactly one succeeds.
  const claims = await Promise.all([api(`/${hostTicket.code}/join`, { ...profile, password: 'room-secret' }), api(`/${hostTicket.code}/join`, { ...profile, password: 'room-secret' })]);
  assert.deepEqual(claims.map(result => result.status).sort(), [201, 409]);
  const finalTicket = claims.find(result => result.status === 201).body; tickets.push(finalTicket);
  assert.equal((await api()).body.rooms.find(room => room.code === hostTicket.code).players, 4);
  assert.equal((await api(`/${hostTicket.code}/leave`, { id: guestTicket.id, token: 'forged' })).status, 403);
  assert.equal((await api(`/${hostTicket.code}/leave`, { id: finalTicket.id, token: finalTicket.token })).status, 200);
  // A background phone and an abnormal socket loss retain the same room/seat.
  host.send({ kind: 'background' }); host.send({ kind: 'ping' }); await host.wait(packet => packet.kind === 'pong');
  guest.socket.terminate();
  guest = await connect(guestTicket);
  host.socket.terminate();
  host = await connect(hostTicket);
  guest.send({ kind: 'data', payload: { recovered: true } });
  assert.equal((await host.wait(packet => packet.payload?.recovered)).from, guestTicket.id);
  assert.equal((await api()).body.rooms.find(room => room.code === hostTicket.code).players, 3);
  guest.socket.close(1000, 'Left room.');
  await host.wait(packet => packet.kind === 'roster' && packet.peers.length === 2 && !packet.peers.some(peer => peer.id === guestTicket.id));
  host.socket.close(1000, 'Left room.'); await second.wait(packet => packet.kind === 'closed');
  assert(!(await api()).body.rooms.some(room => room.code === hostTicket.code));
  assert.equal((await api(`/${hostTicket.code}/join`, { ...profile, password: 'room-secret' })).status, 404);
  const openTicket = await reserve('', { title: 'Open room' }); const open = await connect(openTicket);
  const openGuest = await reserve(`/${openTicket.code}/join`, { name: 'No password' }); await connect(openGuest);
  assert.equal((await api()).body.rooms.find(room => room.code === openTicket.code).locked, false);
  open.socket.close(1000, 'Left room.');
  console.log('PASS public rooms: global list, password enforcement, private credentials, version checks, authenticated relay, sender identity, guest isolation, atomic capacity, same-seat host/guest reconnection, explicit leave cleanup and unlocked rooms.');
} finally {
  for (const ticket of tickets) await api(`/${ticket.code}/leave`, { id: ticket.id, token: ticket.token }).catch(() => {});
  for (const socket of clients) socket.terminate();
}
