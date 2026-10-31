# Naval landing parties — design proposal

Status: Sentosa pilot implemented, 31 October 2026. Other coastal districts remain proposed.

## Purpose

Give coastal districts a visible source of external infantry: a landing craft
approaches from beyond the playable coast, puts a finite squad ashore and leaves.
Survivors fight inland and try to capture existing facilities. The boat and the
landing area do not become permanent spawn points.

This creates a coastal front that can remain active even when the defending
faction controls every command post. Capturing posts still matters: it removes
the enemy's faster local reinforcement capability. Eliminating external support
permanently would require a later campaign rule; the current expedition has no
ticket or campaign-victory system.

## Relationship to existing reinforcement rules

Today, operational command posts deploy up to four infantry every 25 seconds,
with supply costs. A faction without an operational post can instead receive
reserve trucks or helicopters at intervals of at least 80 seconds. Both sides
share a district cap of 20 bots; faction heat sets their desired populations.
See [facilities](FACILITIES.md).

Proposed naval missions are eligible whether or not the faction owns a working
post. They use the same casualty queue, desired population and global actor
limits as other reinforcements. They receive no extra population allowance.
Reserve troops already booked onto a boat cannot also deploy from a post or
another transport. Surviving arrivals become ordinary squad infantry.

Naval support uses an external reserve budget, with no district supply charge.
This lets a force re-enter without local infrastructure. Its slower delivery,
exposed approach and finite manifest distinguish it from a command post.

## Player-facing sequence

1. **Warning:** comms identify the faction and coastal sector; a boat marker and
   an estimated arrival appear on the district map. Close arrivals also get the
   existing combat banner treatment.
2. **Approach:** a visible, damageable craft follows a fixed water route from
   beyond the playable edge. Its wake and engine noise make it readable.
3. **Land:** it beaches at an approved ramp, lowers its bow and unloads its
   reserved soldiers one at a time. A future quay variant would dock alongside
   a real access point instead.
4. **Push inland:** the squad gathers at an authored point clear of the ramp,
   then uses existing squad objectives to attack, recover or defend facilities.
   Fighting and danger avoidance continue during the move.
5. **Withdraw:** the empty boat reverses out and departs. A wreck eventually
   clears; neither the boat nor its wreck creates additional infantry.

Players can destroy the craft before it unloads, engage troops at the ramp, or
contest their inland route. Landed infantry remain in play if the boat is lost.
Unlanded passengers are lost with a destroyed craft and return to the normal
casualty queue with a fresh wait. There is no immediate replacement boat.

## Starting balance for playtesting

These are proposed values, not measured balance results.

| Rule | Initial value |
| --- | --- |
| Manifest | Up to four infantry, casualties first, then recruits |
| Naval interval | 150 seconds per faction, first mission no earlier than 150 s |
| External dispatch separation | At least 80 s between any reserve truck, helicopter or boat for that faction |
| Concurrency | One external transport per faction; one craft using a landing lane |
| Readable warning | At least 15 s from announcement to first soldier ashore |
| Unload | One soldier per second after the ramp is ready |
| Blocked ramp | Hold for up to 10 s, then leave with remaining passengers |
| Failed route planning | Retry after 10 s; no actors or manifest created |
| Protection | Existing friendly-fire rules; hostile arrivals have no damage immunity |

Both naval and ordinary external dispatches advance the shared 80-second gate.
A boat also advances its own 150-second gate at launch, even if destroyed or
forced to withdraw. If both kinds are due with no working post, prefer a valid
naval mission; otherwise try the existing road/air reserve planner. Post waves
keep their own schedule, but must respect every booked passenger and population
reservation. A full faction does not launch an empty boat.

Use existing faction kit and heat to set desired numbers; defer heavy weapons,
escorts, vehicle landings and naval gunfire. Ambient warships remain scenery.

## Landing sites and map eligibility

Author sites explicitly. A water material or a direction towards the sea does
not establish navigable access. Each site needs:

- A stable id, coastal-sector name, allowed factions and beach/quay type.
- Water elevation and an offshore entry, approach path, berth and exit path.
- An authored offshore water corridor, including any needed scenery extension.
- A physical ramp or gangway with matching geometry and collision.
- Separate dry disembark positions and a reachable inland rally point.
- A lane reservation so simultaneous craft cannot overlap.

Validate the entire hull route against water coverage and scenery, including
bridges, seawalls and moored ships. Keep boat movement separate from pedestrian
movement: existing water obstacles intentionally block walkers. Never remove
those obstacles globally to make a boat pass. Offshore motion may extend beyond
the infantry bounds; every disembark position must be inside them.

Validate dry support, actual height, clearance, ramp traversal and a connected
route to inland objectives against the built scene. Recheck occupancy before
launch and before each soldier steps off. Reject sites near protected player
deployment and checkpoint arrival areas. At launch, require the landing points
to be at least 45 m from living human players. After announcement, players can
approach and ambush; enemy presence alone does not cancel unloading. Physical
occupancy can hold the ramp, but cannot teleport passengers elsewhere.

If the ramp cannot clear within the hold time, return undelivered passengers
to reserve on departure, retain the spent cooldown and release the lane. Do not
substitute an unrelated inland spawn position.

### Rollout

Start with **Sentosa's southern beach**, authoring at least two separated lanes
and a short offshore water extension so the approach visibly comes from outside
the map. Keep its lagoon and northern boardwalk arrival out of this pilot.

The current coastal scenery registry also lists Changi, HarbourFront, Marina
Bay, Tuas, Woodlands and Punggol. Treat those as candidates requiring individual
route audits. In particular, HarbourFront's rendered basin is enclosed by land,
and Marina Bay has raised quay walls: neither supports an automatic straight
approach from the ambient sea direction. HarbourFront needs an authored water
connection before enabling a mission; quay maps also need usable access to land.
Lakes, reservoirs and canals do not qualify as external naval access by default.

## Authority, persistence and implementation boundaries

The arena host owns route selection, clocks, manifests, lane reservations, hull
damage and each transition from embarked to landed. Clients render snapshots;
an insert cue alone must not spawn a soldier. Use explicit water elevation
instead of interpreting boat height as helicopter altitude above dry ground.

Extend the current transport family with a sea mode, a boat hull and an explicit
approach/berth/ramp/unload/depart lifecycle. Audit every land/air branch, including
collision and driver hit points, hull damage, emergency exits, wrecks, validation,
visuals, audio, banners and debug controls. A sea passenger cannot use the
truck/helicopter emergency-exit fallback to appear on water or unrelated ground.
On a beach, a surviving passenger can exit only through the approved dry ramp.

Persist naval cooldown remaining and the shared external-dispatch gate in the
district's expedition state. Follow the current rule that unloaded districts do
not simulate. For the first version, district travel withdraws active boats and
returns undelivered reservations to the casualty queue while retaining the
cooldown; landed troops follow existing district re-entry rules. This must not
duplicate troops, restart a free wave, or accumulate overdue missions. The
existing expedition continues while its menu is open, including naval arrivals;
unloaded districts suspend their remaining clocks. A new expedition resets them.

Suggested code boundaries:

- `naval-landing-sites.ts`: authored site data, independent of ambient scenery.
- `naval-landings.ts`: route planning and landing lifecycle rules.
- `district-world.ts` / `arena-rules.ts`: validated sites, reservations and scheduling.
- `combat-events.ts` / `combat-transports.ts`: sea transport contracts and damage.
- `combat-event-visuals.ts` / audio / HUD: craft, ramp, wake and warning presentation.
- Expedition persistence: remaining clocks and reconciliation on district travel.

## Acceptance criteria for a playable version

- Sentosa launches a real four-person boat mission with friendly and hostile
  variants; inland maps and unapproved water bodies never launch one.
- Missions work with all posts friendly, all posts hostile and no posts operating.
- Full populations, simultaneous post waves, other transports and casualties
  cannot overbook actors or deploy one soldier twice.
- Water-route and pedestrian-path checks use the real scene, including ramp
  height and collision; no soldier appears in water, walls or protected arrivals.
- Destruction before unloading, partial unloading, driver loss, blocked ramps
  and aborted approaches settle every passenger and release every reservation.
- An interception delays the next mission; a nearby player can ambush after
  announcement without causing the craft or passengers to teleport.
- Menu, reset, district travel and return follow expedition clock rules without extra waves.
- Host snapshots validate sea states; browser checks cover warnings, real hull
  damage, ramp traversal, inland squad movement, cleanup and phone layouts.
- Relevant unit tests, full suite and typecheck pass before the playable version
  is manually deployed and verified. Longer combat playtests tune the values above.


## Playing the Sentosa pilot

Open World in Sentosa enables two southern beach lanes, west and east. Each
faction may send up to four troops after 150 seconds, subject to casualties,
headcount, clear routes and its shared 80-second external dispatch gate. No boat
launches while that side is at full strength. Command-post ownership does not
disable naval support. Posts and boats cannot deploy the same reservist.

Comms and the district map identify incoming craft. Approach takes 15 seconds,
the bow ramp takes two seconds to lower, and soldiers cross one at a time before
moving inland. The 900 HP hull and its coxswain are separately vulnerable. An
open-water driver loss holds the passengers aboard; a beached craft can still
unload through its ramp. Destruction loses the remaining manifest. A blocked
ramp holds for up to ten seconds, then returns undelivered troops to reserve.
Troops already ashore remain ordinary infantry and can fight for facilities.

The existing Debug survival panel has a **Landing craft** button. It can bypass
the initial naval timer for inspection, but still needs a free lane, population
room or waiting casualties, and a safe approach. Other districts have no routes.

Source tests: `naval-landings.test.ts`, the transport/event and arena-runtime
suites, and `FpsMinimap.test.tsx`. The rendered host/guest smoke is
`node scripts/naval-landings-smoke.mjs`, with Vite on 5196 and Chrome CDP on 9346
(or EXPEDITION_APP_ORIGIN / EXPEDITION_CHROME_ORIGIN). It uses the actual Sentosa
scene and saves evidence under `.cache/naval-landings/`. The full engine smoke
checks the in-game warning, map marker and expedition travel state.
