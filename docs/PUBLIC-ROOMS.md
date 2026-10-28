# Public room multiplayer test

Implemented for the Cloudflare build. This revision must be deployed before it is
available on the public site. No new secrets or TURN account are required.

Open **Multiplayer** from the main menu, or `/multiplayer`:

- The phone lobby puts Browse, Create and Join first, with optional room/password
  and bot settings folded away. Connected rooms put invite sharing beside the
  room code, with a player roster and a single enter-match action.
- Matches fill the screen in portrait and landscape, including browsers without
  native fullscreen. Thumb controls stay on the scene. The pause menu contains
  scores, sound/display options and loadout information; host restart and leaving
  remain available there. Developer panels and duplicate button bars stay in Debug.
- Browse the global room list, refreshed every five seconds. Every room is listed,
  including locked rooms. Listings show name, host, map, occupancy and password lock.
- Create a named room with an optional 4–64 character password. Share its invite
  link with the native share button where supported, or copy the invite; send the
  password separately. Passwords never appear in links or listings.
- Join from the list, enter a code, or follow an invite. Wrong passwords, full rooms
  and different game versions receive explicit errors.
- Up to four players fight in the Marina Bay free-for-all arena, with 0–6 bots.
  The host chooses the bots and runs the simulation. Players may join a running match.
- Switching apps or opening the share sheet preserves the room for up to five
  minutes. Returning reconnects with the same room code, player identity and roster.
  The host still runs the simulation, so gameplay pauses when its browser is suspended.
- Explicitly leaving ends the host's room immediately. An interrupted connection
  reserves its seat for five minutes; a closed/abandoned tab expires automatically.
  A silent active connection without a background notification expires within
  roughly 80 seconds. There is no host migration or recovery after a page reload.

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
Background notifications extend a seat's deadline to five minutes, and unexpected
socket closure reserves the same seat for reconnection. Tickets remain in memory.
An authenticated replacement socket takes over that seat; an older socket's late
messages and close/error events cannot remove it. Recoverable interruptions keep
the logical roster stable so actors and scores survive. Page lifecycle events never
send a leave request; explicit Leave and component disposal still release the seat.

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
node scripts/public-rooms-mobile-smoke.mjs
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
The browser smoke freezes a host tab for 70 seconds while a guest uses its invite,
then checks reconnection and continues the two-player gameplay checks. This covers
browser suspension beyond the normal heartbeat deadline, not actual phone OS behavior.
The mobile smoke covers two clients at 390px portrait, 844px landscape and 320px
width, simulated safe-area padding, touch movement/fire, pause/resume, scores,
settings, host restart and leaving. Captures are saved in `.cache/public-rooms-mobile/`.

Reference: [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
