# Multiplayer movement and snapshot timing

Implemented 2026-10-29 for both public WebSocket rooms and LAN WebRTC rooms.
The host still owns collision acceptance, damage, vehicles, bots and spawning.
The guest still predicts its own infantry position locally.

## Reconciliation

Every guest movement message, including the input flushed before a shot/reload,
carries a monotonically increasing `sequence`, the host's `matchId`, the actor's
`deaths` count and its current vehicle kind. The host rejects sequenced input
from a retired match or previous life, duplicate/reordered input, and input
stamped for a different vehicle state. Legacy unsequenced LAN input remains
accepted without producing an acknowledgement.

`arena-state.acknowledgedInputs` maps each player ID to the last input sequence
processed for its current life and vehicle state. A guest keeps up to 256 sent
positions and compares its acknowledged position with the **matching sent
position**, rather than its current predicted position. Local movement since
that input remains intact. Offsets already applied after a send are accounted
for so multiple old inputs in flight cannot apply the same correction twice.

Errors below 5 mm are ignored; small real errors ease at 12/s without resetting
movement or jump velocity. Errors over 2.5 m correct immediately, preserving the
movement since the acknowledged input. Spawns still adopt the host position
directly. Death/respawn, rematches, boarding and seat changes discard pending
reconciliation history. Missing history after a long outage waits for a matching
acknowledgement instead of treating an old snapshot as a teleport instruction.

This remains position-based reconciliation. It does not implement full
movement-command replay, server-owned infantry acceleration or host migration.

## State and remote actors

Human gunfire updates the local authority view immediately and uses the regular
10 Hz full-state broadcast. It no longer broadcasts a full world per shot.
Confirmed hits retain their immediate reliable messages. Registration, reset,
vehicle actions and other infrequent lifecycle/gameplay changes can still
publish immediately. The cadence retains fractional time and avoids sending
multiple catch-up snapshots after a stall.

Guests render remote infantry using a 100 ms host-time snapshot buffer rather
than repeatedly easing toward a single stale target. The buffer handles batched
arrivals, shortest-path yaw, bounded history, lifecycle changes and teleports.
It holds the latest known position after updates stop and never extrapolates
through unknown cover. Vehicle presentation keeps its existing buffer.

Public gameplay still uses the shared Cloudflare relay and reliable WebSockets;
LAN still uses its ordered reliable data channel. This change reduces traffic
and removes delay-induced corrections, but does not remove real network delay,
host suspension, congestion or expensive host rendering/simulation.

## Verification

`arena-network.test.ts` drives two actual runtimes over a cloned, ordered test
transport. Ten-second default-loadout sprints at 0, 100, 200, 300, 400, 500 and
600 ms RTT retain approximately 65.74 m of travel with **zero corrections**.
The 100 ms case includes a 900 ms state-delivery stall; the 300 ms case adds
variable jitter. The guest also fires during these runs, exercising the fresh
input/acknowledgement path. Separate cases verify rejected large movement,
stale messages after reset and death/respawn, and four-player gunfire at 10 full
snapshots per second (the audit measured 34 previously).

`input-reconciliation.test.ts` checks subsequent travel, correction accumulation,
duplicate/old acknowledgements, missing bounded history and reset.
`actor-presentation.test.ts` checks batched host-time interpolation, yaw, hold
behavior, lifecycle changes and teleports. Existing arena, vehicle, combat and
transport tests remain relevant.

The dedicated browser network smoke adds a controlled 200 ms delay to every
outgoing gameplay packet for each peer, leaving lobby traffic and heartbeats
alone. It opens a temporary Vite server and one isolated Chrome, then runs both
actual runtimes over separate public-room WebSockets through the local Worker:

```sh
pnpm preview:cloudflare
# Another terminal; adds approximately 400 ms gameplay RTT:
NODE_USE_ENV_PROXY=0 node scripts/multiplayer-network-browser-smoke.mjs
```

Measured result: **65.81 m travelled, zero corrections, 113 snapshots carrying
input acknowledgements** during a ten-second sprint while firing. The fixture
uses an empty scene and real browser timers/transport, without WebGL. Its result
is saved to `.cache/multiplayer-network-browser/result.json`. Synthetic delay is
not a measurement of production latency or a substitute for testing phones.

The full existing public-room UI smoke was also attempted, but did not complete
in this VM: 3D loading/rendering and lifecycle handling stalled, ending in an
input/CDP timeout. No complete rendered multiplayer UI pass is claimed. The
full unit suite passed 1,735 tests across 177 files; the subsequently added
previous-life input regression also passed in the targeted ten-test network
suite. Typecheck and the Cloudflare production build passed.

Manual deployment succeeded on 2026-10-29: Cloudflare version
`7815f8d4-5172-40d6-8306-6ce414594fad`. The public domain served the matching
production assets and passed `scripts/cloudflare-check.mjs` after deployment.
