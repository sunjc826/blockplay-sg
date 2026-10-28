# Public room multiplayer test

Implemented for the Cloudflare build. This revision must be deployed before it is
available on the public site. No new secrets or TURN account are required.

Open **Multiplayer** from the main menu, or `/multiplayer`:

- Browse the global room list, refreshed every five seconds. Every room is listed,
  including locked rooms. Listings show name, host, map, occupancy and password lock.
- Create a named room with an optional 4–64 character password. Share its invite
  link; send the password separately. Passwords never appear in links or listings.
- Join from the list, enter a code, or follow an invite. Wrong passwords, full rooms
  and different game versions receive explicit errors.
- Up to four players fight in the Marina Bay free-for-all arena, with 0–6 bots.
  The host chooses the bots and runs the simulation. Players may join a running match.
- Leaving, closing the tab or losing the host ends the room. There is no host migration.
  A silently lost connection expires within roughly 80 seconds; a normal close is immediate.

Open-world co-op, shared expedition travel and authoritative online progression
are still future work.

## Transport and boundaries

`server/public-rooms.js` exports the `PublicRooms` Durable Object, bound in
`wrangler.jsonc` and re-exported from `cloudflare/worker.js`. One bounded directory
object holds up to 64 rooms and relays their WebSockets. This gives listings and
seat reservations a single consistent authority for this test stage. Room metadata
is persisted; accepted WebSockets use Cloudflare's hibernation API and attachments.

`src/game/room-peer.ts` implements the existing `LanSession` interface. Guests send
inputs to the host, which simulates bots, hits, vehicles and scores and sends snapshots.
WebSockets carry all traffic over TLS in production. This implementation does not use
WebRTC, STUN or TURN. The existing `pnpm lan` WebRTC transport remains available.

The Worker accepts same-origin writes and WebSocket upgrades, strips client-provided
IP identity, and supplies Cloudflare's connecting IP for request limits. Room passwords
use PBKDF2-SHA256 with 100,000 iterations and per-room salts. Random session bearer
tokens are stored only as digests and passed in WebSocket subprotocol headers, never
URLs. The server assigns sender IDs and prevents guests addressing other guests.
Requests, packets, rates, pending seat reservations and room lifetimes are bounded.
Unused reservations expire after 20 seconds; connections heartbeat every 20 seconds;
rooms have a six-hour maximum lifetime. Names/titles are bounded and rendered as text.
Build fingerprints prevent incompatible client snapshots being mixed in a room.

This remains a host-authoritative prototype. Hosts and locally saved equipment are
trusted as in LAN mode. Relay traffic and Durable Object work incur Cloudflare usage;
this has not been load-tested. The single directory is deliberately limited for testing.
Before scaling, split gameplay into per-room objects behind a directory and measure
bandwidth, latency and cost. WebRTC with STUN plus TURN fallback is a possible later
optimization; it can reuse the session interface.

## Local verification

Use Node 24 and the repository's pnpm version:

```sh
pnpm preview:cloudflare
# In another terminal:
pnpm test:rooms
pnpm test:rooms:browser
```

The API smoke uses Wrangler's installed WebSocket client. The browser smoke needs
Google Chrome (or `CHROME_BIN`); it opens two isolated profiles. Both default to
`http://127.0.0.1:8787`. `CLOUDFLARE_APP_ORIGIN` selects another origin. If a local
proxy intercepts loopback traffic, set `NO_PROXY=127.0.0.1,localhost` and `no_proxy`
to the same value.

For frontend development, `pnpm dev` proxies `/api/rooms` and WebSocket upgrades to
the Worker preview on port 8787. Browser game source changes require restarting Vite
so the build fingerprint is recalculated. Fully static Sites builds cannot host rooms.

## Deployment

```sh
pnpm check:cloudflare
pnpm deploy:cloudflare
```

The included SQLite Durable Object migration provisions the binding on deployment.
The existing GitHub deployment workflow also applies it. No runtime credentials need
to be added. Set `PUBLIC_ROOMS_ENABLED=false` in Worker variables to disable the API.
Keep the migration in later releases; do not remove it after the first deployment.
After deployment, test on separate networks/devices to measure real-world latency
and mobile tab suspension; local browser checks do not establish those properties.

Reference: [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
