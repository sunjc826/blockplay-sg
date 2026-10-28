import { createServer } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createCloudflareAdventureHandler } from '../server/cloudflare-api.ts';
import { readRoomBody, roomOriginAllowed } from '../server/public-rooms.js';
export { PublicRooms } from '../server/public-rooms.js';

// One handler per isolate preserves the existing concurrency/request guards.
// Only these server bindings can reach the companion; no frontend environment dump.
const companion = createCloudflareAdventureHandler({
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  PILOT_MODEL: env.PILOT_MODEL,
  ADVENTURE_ALLOWED_ORIGINS: env.ADVENTURE_ALLOWED_ORIGINS,
  ADVENTURE_ENABLED: env.ADVENTURE_ENABLED,
  ADVENTURE_VOICE_ENABLED: env.ADVENTURE_VOICE_ENABLED,
});
createServer(companion).listen(3001);

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/api/rooms' || path.startsWith('/api/rooms/')) {
      if (!env.PUBLIC_ROOMS || env.PUBLIC_ROOMS_ENABLED === 'false') return Response.json({ error: 'Public rooms are unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      if (!roomOriginAllowed(request)) return Response.json({ error: 'Unexpected origin.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
      const headers = new Headers(request.headers);
      headers.set('x-room-client-ip', request.headers.get('CF-Connecting-IP') || 'local');
      // Detach the bounded POST body before forwarding. A DO can reject early;
      // leaving its body tied to the original request stream races the response.
      let body;
      if (request.method === 'POST') {
        try { body = await readRoomBody(request); }
        catch { return Response.json({ error: 'Room request too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } }); }
        headers.delete('Content-Length');
      }
      return env.PUBLIC_ROOMS.getByName('test-directory-v1').fetch(new Request(request.url, { method: request.method, headers, ...(body === undefined ? {} : { body }) }));
    }
    if (path === '/api/health' && request.method === 'GET') {
      return Response.json({ service: 'blockplay-cloudflare', companion: !!env.OPENAI_API_KEY && env.ADVENTURE_ENABLED !== 'false' },
        { headers: { 'Cache-Control': 'no-store' } });
    }
    if (path.startsWith('/api/adventure/')) return handleAsNodeRequest(3001, request);
    return Response.json({ error: path.startsWith('/api/lan/')
      ? 'LAN rooms require the local pnpm lan server. Solo bots are available here.' : 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
