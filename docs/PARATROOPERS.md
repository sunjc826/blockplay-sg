# Inland paratrooper reinforcements

Open World's twelve inland districts can receive external infantry under
parachutes: Raffles Place, Queenstown, Chinatown, Kampong Glam, Jurong Lake,
Upper Thomson, Geylang, Tampines, Toa Payoh, Bukit Timah, Bishan and Orchard.
Lakes and canals do not exclude airborne support. Coastal districts retain
their current rules; this does not enable new naval routes.

Each faction can dispatch up to four troops after 150 seconds, independently
of command-post ownership. Casualties awaiting deployment take priority over
new recruits. Concurrent missions reserve separate landing areas. The existing faction headcount, twenty-bot district cap and
actor limit apply. Reservations prevent a post or another transport deploying
the same soldier. Every launch spends the shared eighty-second external gate
and the airborne interval, including an intercepted or aborted mission.

A twelve-second warning identifies the drop sector through comms and a
faction-colored parachute map symbol. A cargo plane crosses overhead. Troops
release one second apart at sixty metres, descend for twelve seconds, discard
their canopy on touchdown and become normal squad infantry. They can be shot
while descending, receive no spawn shield and cannot fire or capture facilities
in the air. The cargo flyover is presentation, like the existing supply-drop
plane; it has no damageable aircraft or pilot.

The planner uses existing patrol anchors, requiring a connected flat patch
for all four touchdown positions and full canopy clearance. Built-scene tests
include foliage, overhead roofs, ground support and collision. Water remains
blocked. Sites must be at least fifty metres from living human players and
thirty metres from protected deployment/arrival points. Players may approach
after the warning. Each release rechecks physical clearance; an obstructed
column cancels that soldier's release and returns the reservation to reserve.
An obstruction or occupied point at touchdown causes a normal casualty rather
than teleporting a soldier elsewhere. Arrivals already landed remain in play.

The host owns bookings, release, descent, damage and touchdown. Guests render
validated snapshots and never create troops from a visual cue. Travel retains
the airborne and shared cooldowns in district infrastructure; unloaded districts
suspend these clocks. Active descents follow the same transient-actor reset on
travel as other district troops. Old saved clocks without an airborne field
start at the full interval. Reset clears the drop and its recruits. The game
continues to simulate while its menu is open, as before.

The survival debug panel's **Paratroopers** control bypasses the initial timer
but still requires a valid inland site and available troops. Tests live in
`paratroopers.test.ts` and `paratrooper-districts.test.ts`; the rendered
host/guest smoke is `node scripts/paratroopers-smoke.mjs` (Vite 5198, Chrome CDP
9348, or EXPEDITION_APP_ORIGIN / EXPEDITION_CHROME_ORIGIN). Evidence is saved in
`.cache/paratroopers/`.


## Verified release

Manually deployed on 31 October 2026, runtime `dbfcdef`,
Cloudflare version `2654c18f-b08c-4396-b453-152d4cb4e597`. Both production origins serve
assets matching the tested build. All 103 focused checks, production typecheck
and build pass. Rendered host/guest drops and actual expedition desktop/phone
warnings, map glyphs, descent and travel cooldown checks pass. The broad suite
passed 1,988 tests with one unrelated night-light audit timeout; that file's
15 tests passed on isolated rerun. A full single-run green result is not claimed.
