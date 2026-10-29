# Multiplayer rubberbanding audit

Historical findings before the 2026-10-29 fix. See
[the implementation and regression checks](MULTIPLAYER-PERFORMANCE.md) for the
current behavior.

Date: 2026-10-29. Scope: the current local working tree, including its existing
uncommitted changes. No gameplay code was changed by this audit. This is a code
audit with a synthetic latency reproduction, not a measurement of the deployed
site, a particular player's connection, or production Cloudflare performance.

## Main finding: ordinary network delay becomes a movement error

**P1 — confirmed by reproduction.** `arena-runtime.ts:499` compares the guest's
current predicted eye position with the latest received host actor position and
flags a correction above 2.5 m. `fps-engine.ts:2174` then teleports the guest to
that old position and resets vertical velocity and movement momentum.

Inputs contain positions but no input sequence, client time or acknowledged input
(`arena-rules.ts:129`). The host only changes a human's position when an input
arrives (`arena-rules.ts:626`); it does not advance that human's infantry motion
between packets. The snapshot therefore contains the guest's position from an
earlier input. There is no history to compare that position to the matching local
position, nor to replay movement performed since that input.

Guests send inputs at up to 20 Hz (`arena-runtime.ts:478`); periodic state goes
back at approximately 10 Hz (`arena-runtime.ts:388`). The position being compared
can lag by a complete guest→host→guest trip, plus input and broadcast scheduling
delays and host/browser stalls. At the tested default sprint speed of 6.649 m/s,
2.5 m represents only about 376 ms of movement. The comparison mistakes that
expected movement for divergence. It runs every render frame, including frames
where no new snapshot has arrived. Input submission also happens before the
renderer applies the correction, so already queued movement can return later and
compound the oscillation.

The host avoids that network round trip: its renderer calls its local simulation
directly. That explains why the host can feel smooth while guests repeatedly snap.

### Reproduction

The harness uses the actual `createArenaRuntime`, default profile movement factor,
infantry acceleration and momentum reset. Two runtimes exchange cloned messages
over a synthetic ordered transport with equal delay in both directions. Both
update every 10 ms. The arena has no bots, obstacles or vehicles; each case warms
up for two seconds, then sprints for ten seconds. These are controlled examples,
not universal latency thresholds or measurements of browser rendering FPS.

| Synthetic gameplay RTT | Snapbacks in 10 s | Net sprint distance |
| --- | ---: | ---: |
| 0 ms | 0 | 65.74 m |
| 100 ms | 0 | 65.74 m |
| 200 ms | 1 | 62.46 m |
| 300 ms | 16 | 13.26 m |
| 400 ms | 19 | 3.75 m |
| 500 ms | 16 | 4.65 m |
| 600 ms | 14 | 3.53 m |
| 100 ms, plus one 900 ms host-state delivery stall | 2 | 59.20 m |

Reproduction source: `.cache/multiplayer-audit/latency.test.ts`; config:
`.cache/multiplayer-audit/vitest.config.mjs`. These are local ignored audit
artifacts. With a working Node executable, from the repository root:

```sh
node node_modules/vitest/vitest.mjs run \
  --config "$PWD/.cache/multiplayer-audit/vitest.config.mjs" \
  --root .cache/multiplayer-audit
```

## Contributors and amplifiers

### P2 — full snapshots are published for every player shot

The guest-shot handler calls `publish()` after every structurally valid shot
request, even when the simulation refuses that shot (`arena-runtime.ts:369`).
The local host's `shoot()` also publishes immediately (`arena-runtime.ts:518`).
These sends are additional to periodic broadcasts. A second synthetic test
registered four humans, no bots, and submitted one shot per human every 150 ms.
It measured **34 full snapshots in one second**, versus **10** while idle;
average payload size was 3,366 bytes and maximum 4,387 bytes in this small fixture
(before transport envelope overhead). With four players, snapshot rate grows
with their combined firing rate. Each publication rebuilds and
serializes the entire actor/projectile/event state (`arena-rules.ts:2074`), rather
than only sending a shot event or waiting for the next scheduled state update.

Both transports use one ordered reliable stream for movement and gameplay:
public rooms use a WebSocket (`room-peer.ts:81`), and LAN creates one ordered
WebRTC data channel (`lan-peer.ts:145`). There is no replacement of queued old
snapshots with the latest state. Both stop sending above roughly 256 KiB of
buffered data; those guards do not remove stale data already queued and silently
drop critical events along with movement (`room-peer.ts:43`, `lan-peer.ts:66`).

This makes queueing and retransmission delays particularly harmful to the first
finding. Actual queue sizes, bandwidth saturation and rate-limit violations in
the reported match have not been measured. Public packets also have a 48 KiB cap,
with a 120-message / 1 MiB per-second relay guard (`public-rooms.js:162`); no
claim is made that normal matches currently exceed those limits.

### P2 — remote infantry smoothing cannot absorb jitter

`arena-runtime.ts:424` eases the displayed avatar toward the latest snapshot at
an exponential rate of 15/s. It has no timestamped infantry snapshot buffer or
velocity-based extrapolation. During a gap the avatar approaches its old target
and stops; a later update makes it speed up again. Gaps over 7 m cause an outright
teleport. This explains stutter of other players even when the local camera has
not crossed the correction threshold.

Vehicles already have a separate 100 ms presentation buffer
(`vehicle-presentation.ts:5`). They should not be described as having the same
missing interpolation as infantry. Their controls still depend on guest→host
delivery and expire after 350 ms without renewal (`arena-rules.ts:646`).

### P2 — host frame stalls delay everyone's authority

Simulation runs on the host browser's main thread using a 50 ms interval
(`arena-runtime.ts:389`), alongside rendering and other browser work. A delayed
callback can catch up as much as three seconds synchronously before publishing.
Catch-up advances simulation time; it cannot reconstruct the intermediate
snapshots that were never delivered.

Scene cover checks inspect rendered meshes (`scene-cover.ts:10`), filter the
cached list and perform recursive ray intersections (`fps-raycast.ts:8`). The
current working tree checks cover on each projectile flight segment
(`arena-rules.ts:734`, `arena-rules.ts:825`), in addition to bot sight checks.
This is a plausible combat-related CPU amplifier requiring profiling in the real
Marina scene; the empty-scene reproduction does not establish its timing cost.
Backgrounding a public host also suppresses its outgoing gameplay
(`room-peer.ts:44`).

### P2 — public gameplay shares one relay and mutation queue

The implemented public route sends all rooms through
`getByName('test-directory-v1')` (`cloudflare/worker.js:36`). Gameplay WebSocket
messages enter the same `exclusive()` promise queue used for directory mutations
and joins (`server/public-rooms.js:46`, `:157`). The queue can wait behind
asynchronous lobby work, and rooms share that contention. Public gameplay makes
a relay trip in both directions; it is not the direct WebRTC proposal in
`MULTIPLAYER.md`. Actual relay placement and production queue delay are unknown.

## Recommended repair order

1. **Fix reconciliation first.** Add match/spawn identity, input sequence numbers
   and explicit host acknowledgements. Compare an accepted position against the
   stored local position for that input; preserve movement performed afterward.
   Apply small real errors smoothly and reserve teleports for authoritative
   spawns or large actual errors. A full movement-command/replay design should
   use the same movement and collision rules on host and client.
2. **Bound snapshot traffic.** Keep state broadcasts on a fixed cadence, coalesce
   obsolete unsent state, and give reliable gameplay events a separate delivery
   policy. Separate lossy/latest-state traffic on LAN where supported. Public
   WebSocket traffic still needs bounded queues because it remains reliable.
3. **Buffer remote infantry snapshots** using host simulation time and a bounded
   jitter allowance. Reuse the vehicle presentation approach where appropriate,
   with explicit respawn/reset handling.
4. **Instrument and profile** gameplay RTT, snapshot age, host tick duration,
   snapshot size/rate, buffered bytes, dropped sends and correction distances.
   Then optimize scene raycasts and split gameplay relays per room if measured
   contention warrants it.

Simply raising the 2.5 m threshold or increasing send frequency can conceal the
symptom for some connections while retaining the underlying stale-state error.

## Test coverage gap

Existing runtime pairs deliver synchronously. Browser smoke tests run on local
connections and check position replication after movement and a settling delay;
their Chrome flags disable background timer throttling. They do not assert
correction frequency or movement continuity under WAN delay, jitter, stalls and
congestion. Add those conditions as regression cases when implementing the fix.

Validation completed: the latency reproduction passed; the separate snapshot
amplification reproduction passed; **37 existing tests passed** across
`arena-runtime.test.ts`, `room-peer.test.ts`, `vehicle-presentation.test.ts` and
`server/public-rooms.test.js`. The initial audit run exceeded Vitest's default
five-second test timeout; rerunning with a 60-second allowance passed. No live
Internet match, mobile-device profile, production relay telemetry or real-scene
CPU benchmark was performed.
