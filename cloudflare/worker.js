import { createServer } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createCloudflareAdventureHandler } from '../server/cloudflare-api.ts';
import { readRoomBody, roomOriginAllowed } from '../server/public-rooms.js';
import { handleLevelReviews } from '../server/level-reviews.ts';
export { AiUsage } from './ai-usage.js';
export { LevelReviews } from '../server/level-reviews.ts';
export { PublicRooms } from '../server/public-rooms.js';

// One handler per isolate preserves the existing concurrency/request guards.
// Only these server bindings can reach the companion; no frontend environment dump.
const companion = createCloudflareAdventureHandler({
  STREAMER_PROVIDER: env.STREAMER_PROVIDER,
  STREAMER_MODEL: env.STREAMER_MODEL,
  CAST_VOICE_PROVIDER: env.CAST_VOICE_PROVIDER,
  CAST_VOICE_MODEL: env.CAST_VOICE_MODEL,
  CAST_VOICE_IDS: env.CAST_VOICE_IDS,
  VOICE_DAILY_CHARS_PER_IP: env.VOICE_DAILY_CHARS_PER_IP,
  VOICE_DAILY_CHARS_ANON_TOTAL: env.VOICE_DAILY_CHARS_ANON_TOTAL,
  VOICE_DAILY_CHARS_ADMIN: env.VOICE_DAILY_CHARS_ADMIN,
  ELEVENLABS_BASE_URL: env.ELEVENLABS_BASE_URL,
  ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY,
  CAST_PROVIDER: env.CAST_PROVIDER,
  CAST_MODEL: env.CAST_MODEL,
  PILOT_PROVIDER: env.PILOT_PROVIDER,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  AI_ADMIN_TOKEN: env.AI_ADMIN_TOKEN,
  AI_DAILY_CALLS_PER_IP: env.AI_DAILY_CALLS_PER_IP,
  AI_DAILY_CALLS_ANON_TOTAL: env.AI_DAILY_CALLS_ANON_TOTAL,
  AI_DAILY_CALLS_ADMIN: env.AI_DAILY_CALLS_ADMIN,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  PILOT_MODEL: env.PILOT_MODEL,
  ADVENTURE_ALLOWED_ORIGINS: env.ADVENTURE_ALLOWED_ORIGINS,
  ADVENTURE_ENABLED: env.ADVENTURE_ENABLED,
  ADVENTURE_VOICE_ENABLED: env.ADVENTURE_VOICE_ENABLED,
}, fetch, async op => {
  const response = await env.AI_USAGE.getByName('global').fetch('https://usage/check', { method: 'POST', body: JSON.stringify(op) });
  if (!response.ok) throw new Error('Usage unavailable');
  return response.json();
});
createServer((req, res) => {
  // The Node bridge emits 'close' when it publishes the response headers.
  // The original Request signal tracks the actual client throughout the body.
  if (req.url === '/api/ai/commentary' || req.url === '/api/ai/streamer') {
    const { env: lifecycle, ctx } = req.cloudflare;
    ctx.waitUntil(companion(req, res, lifecycle.signal));
  } else {
    void companion(req, res);
  }
}).listen(3001);

export default {
  async fetch(request, _bindings, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/api/level-review' || path.startsWith('/api/level-review/') || path === '/api/asset-review' || path.startsWith('/api/asset-review/')) return handleLevelReviews(request, env);
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
    if (path === '/api/ai/commentary' || path === '/api/ai/streamer') return handleAsNodeRequest(3001, request, { signal: request.signal }, ctx);
    if (path.startsWith('/api/adventure/') || path.startsWith('/api/ai/')) return handleAsNodeRequest(3001, request);
    return Response.json({ error: path.startsWith('/api/lan/')
      ? 'LAN rooms require the local pnpm lan server. Solo bots are available here.' : 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
