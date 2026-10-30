# Multiplayer design: fireteam co-op on Cloudflare

Status: **historical co-op proposal** (2026-10-27), not an implementation record.
Public Internet PvP rooms have since been implemented with a Durable Object
WebSocket relay; see [PUBLIC-ROOMS.md](PUBLIC-ROOMS.md) for the current transport
and limitations. The LAN-only baseline and WebRTC/STUN/TURN recommendation
below describe this earlier proposal. Fireteam expedition co-op remains future work.

This proposes Internet co-op,
with up to four players in one armed-forces fireteam fighting Black Kite in
the open-world expedition, served from the existing Worker at
`blockplaysg.fun`. PvP stays on the LAN arena for now.

## Where we start

Most of the netcode already exists. It is LAN-only and free-for-all.

| Piece | Today | File |
| --- | --- | --- |
| Authority | One browser (the host) runs `createArena`: bots, damage, heat, combat events, vehicles, respawns. Guests send input and render snapshots. | `arena-runtime.ts`, `arena-rules.ts` |
| Transport | WebRTC data channel, host-star, one **ordered reliable** channel, `iceServers: []` (LAN only, no STUN/TURN). | `lan-peer.ts` |
| Rendezvous | Node HTTP server with an in-memory room map, polled for SDP offers and answers. Not deployed. | `scripts/lan-server.mjs` |
| Messages | `arena-hello` (Armory profile), `arena-input` at 20 Hz (client-reported position), `arena-shot`, `arena-reload`, `arena-vehicle`; host sends `arena-state` at 10 Hz and `arena-hit`. | `arena-runtime.ts` |
| Factions | `hostile(a, b)` is true for any two humans, so players always fight each other. | `arena-factions.ts:74` |
| Expedition | Runs the same arena simulation through a **solo** session (`createSoloSession('Explorer')`), with heat, friendly squads, combat events and reinforcements. | `fps-engine.ts:211` |

Three conclusions follow from this:

1. **Co-op is mostly a rules change plus an expedition session that is not
   solo.** The expedition already runs on the multiplayer authority. It just
   never has a second human in it.
2. **Cloudflare replaces the Node rendezvous and adds NAT traversal.** The
   gameplay transport (WebRTC between browsers) can stay as it is.
3. **A server-side simulation is a separate, larger project.** `createArena`
   is pure TypeScript except for its world queries. `getWalkSurfaces(scene)` and
   `getTraversalObstacles(scene)` read the three.js scene, and every shot and
   bot sight line is raycast against the rendered meshes (`coverLimit`). Moving
   authority into a Durable Object first needs baked collision data per
   district (see [phase 3](#phase-3-optional-authority-in-a-durable-object)).

## Recommendation

Keep the authority in a player's browser and use Cloudflare for everything
around it:

```
             blockplaysg.fun (Worker)
   ┌──────────────────────────────────────────────┐
   │ static assets (dist)                         │
   │ /api/adventure/*  → companion (unchanged)    │
   │ /api/rooms        → create room              │
   │ /api/rooms/:code/ws  ──► Room Durable Object │  lobby, roster, ready,
   │ /api/rooms/:code/ice ──► Realtime TURN creds │  SDP relay, build check
   └──────────────────────────────────────────────┘
        ▲ WebSocket (signaling only; hibernates)
        │
   ┌────┴─────┐  WebRTC data channels   ┌──────────┐
   │  Host    │◄──── (direct, or via ──►│  Guest   │ ×3
   │ browser  │    Cloudflare TURN)     │ browser  │
   │ createArena                        │ render + │
   └──────────┘                         │  input   │
                                        └──────────┘
```

Why this shape:

- **Smallest change.** `LanSession` already abstracts the transport
  (`send / subscribe / getPeers / onPeers / close`). A new
  `createRoomSession()` implements that interface, so `arena-runtime.ts` does
  not need to know which transport it is using.
- **Cheap.** The Durable Object only handles lobby and signaling, so it
  hibernates between messages. Gameplay bytes go peer to peer and use TURN only
  when NAT forces it. The first 1,000 GB of TURN each month are free.
- **Low latency in Singapore.** Two players in Singapore on direct WebRTC talk
  across the island, not through a data centre. Over TURN, the hop is to
  Cloudflare's Singapore edge.
- **LAN keeps working.** `pnpm lan` and `lan-peer.ts` stay as they are. The
  Internet path is a second implementation of the same interface.

The cost of this shape is that the host has to stay. If the host leaves, the
fireteam ends (as on LAN today). Also, the host's browser *is* the authority,
so the design does not try to stop cheating. That is acceptable for co-op
among friends, because rewards already live in each player's local Armory
save, the same as in solo play.

## Phase 1: fireteam rules (no Cloudflare yet; testable with `pnpm lan`)

Build and prove co-op on the LAN transport first, so phase 2 only has to swap
the pipe.

### Ruleset

Add `ruleset: 'ffa' | 'fireteam'` to `ArenaEnvironment` and carry it on the
snapshot. In `fireteam`:

- **Factions.** Every player is `armed-forces`, and `hostile()` takes the
  ruleset, so two humans are not hostile to each other. Rounds that strike a
  teammate **stop without damage**, the same rule friendly squads already
  follow. Artillery, drone blasts and vehicle wrecks still hurt everyone, as
  documented in FACTIONS.md. The AI pilot already skips friendly uniforms.
- **Downed, not dead.** At 0 health, a player is *downed* for 30 s: they can
  crawl and use a sidearm, and their position is marked on teammates' HUDs and
  minimaps. A teammate holding interact for 4 s nearby revives them at 30
  health, which reuses the `fps-healing` channel timing. Bleeding out, or the
  whole team going down, respawns them at the last checkpoint arrival with
  their checkpoint vitals. Solo play is unchanged.
- **Party-size scaling.** Mercenary headcount and top-up pace scale with the
  number of humans: `FACTION_SCALE.mercenaries.troops × (1 + 0.5·(n−1))`,
  capped by `MAX_ARENA_ACTORS`. Combat-director tempo gets a smaller bump.
  Friendly squads shrink by one per extra player, so the forces stay a backdrop.
- **Combat events for guests.** `hud.combatEventsAvailable` is currently
  `role === 'solo'`. Make it true for every fireteam member. Events target the
  nearest player, as they already do for any soldier.

### Rewards and loot

- **Kills** are already credited by `feed.killerId`. Each client pays itself,
  into its own `fieldProfile`, as it does today. Add an **assist**: damage to
  a victim within 10 s of the kill pays half XP and no credits. The host adds
  an `assists` array to the feed entry.
- **Crates and field kits** are claimed through the host. A guest sends
  `loot-claim {id}`. The host answers `loot-granted {id, to}` or
  `loot-denied`, so the first claim wins. `claimedBy` already exists on supply
  events. Field kits need the same shape. The contents go into the claimant's
  local profile.
- **Enemy issue** keeps its rule ("lasts one expedition; a LAN peer claiming
  it gets the baseline instead").

### Party travel

WORLD-ZONES.md already sets the rule: "have the host move the entire party
together with an explicit load barrier". Concretely:

1. A player who stands at a gateway and presses travel sends `travel-propose
   {gatewayId}`. The host validates it with `resolveWorldTransition` and
   broadcasts `travel-vote {gatewayId, from, to, deadline: 20 s}`.
2. Travel goes ahead when every living player is within 25 m of the gateway
   or the host confirms. The host then broadcasts `travel-go {zone, epoch}`.
   Each client snapshots its vitals and loads the destination.
3. Each guest sends `zone-ready {zone, epoch}` when its scene is built. The
   host creates the new `createArena` only when everyone is ready, or after
   a 45 s timeout that drops stragglers back to the lobby.
4. Snapshots carry `zone` and `epoch`. A client discards any snapshot for a
   zone or epoch it is not in. This is the guard against "a guest must never
   switch its local scene while remaining in a Marina authority simulation".

### Protocol hygiene (needed before any Internet play)

- **Round epoch.** `accept()` treats `next.tick < lastTick` as a new round and
  clears the feed. That is fine on an ordered channel but wrong once packets
  can arrive out of order. Add `epoch` to the snapshot. A new round or zone
  increments it. Within an epoch, drop any tick ≤ the last one.
- **Build check.** Every push to `main` redeploys, so a guest can load a newer
  build than the host. Inject a build ID through a Vite `define`, send it in
  `arena-hello`, and have the host refuse a mismatch with "Reload to match the
  host's version". The room records the host's build, so the lobby can warn
  before anyone joins.
- **Two channels.** Open a second data channel, `{ ordered: false,
  maxRetransmits: 0 }`, for `arena-state` and `arena-input`. Keep the reliable
  channel for hello, hits, shots, reloads, vehicles, loot and travel. Over the
  Internet, one lost snapshot on a reliable channel holds up every packet
  behind it.

## Phase 2: Internet rooms on Cloudflare

### Room Durable Object

One Durable Object per room, addressed by its code
(`env.ROOMS.getByName(code)`), replaces the in-memory `rooms` map in
`lan-server.mjs`. It uses SQLite-backed storage, which is what new namespaces
get.

**What it keeps:**
- room code
- host ID and the host's build ID
- ruleset and starting district
- roster: up to 4 peers, each with ID, name, token hash and ready flag
- created and last-seen times

**Connections:**
- Each peer opens a WebSocket to `/api/rooms/:code/ws?id=…`, with its token
  sent in the first message, not the URL.
- The object accepts it with `ctx.acceptWebSocket()` (the hibernation API) and
  stores `{id}` with `serializeAttachment` so the connection survives
  eviction. `setWebSocketAutoResponse('ping','pong')` keeps heartbeats from
  waking it.

**Messages:**
- `join`, `leave` and `ready`, broadcast as roster updates.
- `signal {to, description}` is relayed only between the host and a guest,
  with the same SDP checks the LAN server makes (offer from the host, answer
  from a guest, ≤ 32 KB).
- `start {district}` comes from the host only.
- Trickle ICE candidates can now flow, because a WebSocket push replaces
  polling. This removes the 3.5 s `gathered()` wait.

**Lifecycle:**
- When the host's socket closes, the object broadcasts `host-left`.
- A storage alarm deletes the room 10 minutes after its last connection.
- Gameplay never passes through the object.

### Worker routes

The Worker currently returns a 404 for `/api/lan/*`. Add these routes, which
`run_worker_first: ["/api/*"]` already sends to the Worker:

| Route | Does |
| --- | --- |
| `POST /api/rooms` | Generates a code, creates the room, returns `{code, id, token}` for the host. Rate-limited per IP. |
| `POST /api/rooms/:code/join` | Adds a guest, up to 4. Returns `{id, token, hostId, roster}`. |
| `GET /api/rooms/:code/ws` | Upgrades to the room object's WebSocket. |
| `POST /api/rooms/:code/ice` | For a tokened member only: calls `https://rtc.live.cloudflare.com/v1/turn/keys/$TURN_KEY_ID/credentials/generate-ice-servers` with `{ttl: 7200}` and returns `iceServers`. |

All of these keep the companion's same-origin check (`cloudflareOriginAllowed`)
and `Cache-Control: no-store`.

`wrangler.jsonc` additions:

```jsonc
"durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "RoomObject" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["RoomObject"] }]
```

`cloudflare/worker.js` exports `RoomObject`. Store the secrets with
`wrangler secret put TURN_KEY_ID` and `wrangler secret put TURN_KEY_API_TOKEN`.
The TURN key is created once under **Realtime → TURN** in the dashboard. The
GitHub deploy workflow needs no change, since secrets persist across deploys.

### Client

- `createRoomSession(name, code?)` in a new `src/game/room-peer.ts`. It
  implements `LanSession` and shares the peer-link code with `lan-peer.ts`,
  with these differences: WebSocket signaling, `iceServers` from `/ice`, and
  the two data channels.
- **Lobby.** The menu gets a **Co-op expedition** entry. *Create fireteam*
  makes a share link `https://blockplaysg.fun/join/ABC123`. The lobby lists
  members, ready ticks and the host's district choice. *Deploy* starts
  `ExpeditionGame` with the room session instead of `createSoloSession`.
- **Connection state.** The HUD shows each teammate's link as `direct`,
  `relay` or `lost`, read from `getStats()` (`candidateType === 'relay'`). A
  peer that stays `lost` for 10 s is dropped.
- **Join link.** Opening `/join/:code` cold first shows the normal
  pointer-capture gesture and the Armory. Equipment is fixed at hello, as on
  LAN.

### Bandwidth and cost (estimates; measure in phase 1)

An expedition snapshot holds roughly 20–30 actors, plus rounds in flight,
events, raiders and up to 64 heat rows. As JSON this is about 8–15 KB, sent at
10 Hz. That works out to:

| | Per guest | Host upload, 3 guests |
| --- | --- | --- |
| Snapshot stream | ~80–150 KB/s | ~0.25–0.45 MB/s (2–3.6 Mbit/s) |
| Over TURN, per hour | ~0.3–0.55 GB | — |

TURN is only used when a direct path fails, often on mobile carrier NAT. At
$0.05/GB after the free 1,000 GB a month, a guest on the relay for an hour
costs at most about 3 cents. Durable Object signaling is a few hundred
messages per session, billed 20:1, with hibernation in between, so it costs
almost nothing.

The host's upload is the real limit, not cost. A tethered phone hosting three
guests will struggle. If measurements confirm that, add these in order:

1. Quantise positions (cm) and angles (0.01 rad), and drop default fields.
2. Delta snapshots against the last one the guest acknowledged.
3. Interest culling: full rate for actors within 150 m, 2 Hz beyond that.

### Security

- Peer tokens are 18 random bytes, as on LAN. Store only their hashes in the
  room object. Check the token on the WebSocket's first message.
- Same-origin checks on every room route. Per-IP limits on room creation and
  joins (a few per minute, enforced in the room object and the Worker).
- TURN credentials are issued only to members of a live room, last 2 h, and
  are not logged.
- Names go through `cleanLanName`. Neither the room object nor the Worker sees
  gameplay payloads.
- No anti-cheat (see [recommendation](#recommendation)). Co-op does not put
  any economy online. Do **not** add shared or online currency until phase 3.

### Testing

- Unit tests for the room object through `wrangler dev` or the Workers Vitest
  pool: join limits, signaling rules, the host-left broadcast and alarm
  expiry.
- `pnpm preview:cloudflare` and a `test:coop` smoke that follows
  `arena-lan-smoke.mjs`: two isolated Chromes create and join a room against
  `127.0.0.1:8787`, travel together, revive, claim a crate, and the host leaves.
- A debug flag that sets `iceTransportPolicy: 'relay'` forces the TURN path in
  a manual check. TURN cannot be exercised offline.
- Extend `test:cloudflare` with `POST /api/rooms` and a WebSocket upgrade
  against the live site. It makes no TURN calls.

## Phase 3 (optional): authority in a Durable Object

Do this only if host-independent sessions are needed: Internet PvP, hosts
leaving mid-run, mobile hosts, or online rewards. Then the room object itself
runs `createArena` and steps it every 50 ms, and players connect to it over
WebSockets.

The prerequisite is world geometry the server can read:

- At build time, run each district's scene builder in Node. The world-zones
  tests already build scenes headlessly.
- Bake three things per district into a compact binary asset:
  - `getWalkSurfaces`
  - `getTraversalObstacles`
  - a triangle BVH of the solid cover meshes
- Inject `coverLimit` and those queries into `createArena` (it already takes
  `coverLimit` as a callback), so the browser and the server share one
  implementation.
- A test asserts that the baked raycasts agree with the scene raycasts on
  sampled rays.

Trade-offs:

- **Cost.** A ticking object never hibernates. That is ~0.46 GB-s per room
  per minute at 128 MB, about half a cent per room-hour at list price on the
  paid plan, plus 20:1-billed input messages.
- **Latency.** WebSockets are TCP, so a lost packet stalls those behind it.
  That is fine for PvE at 10–20 Hz, but noticeable in PvP over poor mobile
  links. Use a `locationHint: 'apac'` so the object lives near Singapore
  players.
- **CPU.** One object is single-threaded. Profile a 30-actor expedition step
  before committing. Bots' path planning and cover raycasts dominate.
- **Alternative.** If baking proves hard, Cloudflare Containers can run a
  headless Node simulation with the real scene. Even then, the room object
  stays the front door.

Once authority is on the server, client-reported positions (`arena-input`
carries `x, y, z`) should become movement intents that the server replays.
Rewards could then move to an authoritative D1 store keyed to accounts.

## Work order

| # | Step | Size | Proves |
| --- | --- | --- | --- |
| 1 | `ruleset` + `hostile` change, friendly-fire stop for humans, tests | S | Players fight together |
| 2 | Expedition on a real `LanSession` (`pnpm lan`), guests get combat events | M | Co-op expedition on LAN |
| 3 | Downed/revive, party scaling, assists | M | Co-op feels like co-op |
| 4 | Loot claims through the host | S | No duplicate crates |
| 5 | Party travel with load barrier, `zone`/`epoch` on snapshots | M | Fireteam crosses districts |
| 6 | Build ID check, unreliable second channel, measured snapshot sizes | S | Ready for the Internet |
| 7 | Room Durable Object, room routes, TURN endpoint, `room-peer.ts`, lobby UI | L | Co-op on blockplaysg.fun |
| 8 | `test:coop`, room object tests, docs (README, CLOUDFLARE.md, About) | M | Shippable |
| 9 | Snapshot compression, if step 6 numbers demand it | M | Phone hosts |
| 10 | Phase 3, if ever | XL | Host-independent play |

Steps 1–6 ship value on LAN alone, and none of them needs Cloudflare.

## References

- [Durable Objects WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (incoming WebSocket messages billed 20:1; hibernated objects accrue no duration)
- [Realtime TURN: generate credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/) ($0.05/GB after 1,000 GB/month, shared with the SFU; STUN free)
- [LAN arena](LAN-ARENA.md), [factions](FACTIONS.md), [world zones](WORLD-ZONES.md), [Cloudflare deploy](CLOUDFLARE.md)
