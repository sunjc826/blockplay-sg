# Open-world vehicles

Each loaded district has one Utility 01 and one Falcon 01. The fleet uses the district's authored training spawns when clear; blocked pads relocate nearby, checking hulls, street obstacles, traversal structures, rotor clearance and district bounds, and keeping the pad away from locals and the arrival point. Loot placement avoids the parked hulls. Both appear on the district map. Vehicles belong to the current district session; crossing a checkpoint remains on foot and loading another district creates its fleet anew.

E boards/exits (a looked-at loot item takes priority on foot); V changes to a vacant seat without unloading the crew. Touch has a contextual Board/Exit button plus seat, brake, climb and descend controls. The normal mounted hull, ammunition, crew list and aiming display also work in expeditions. Infantry supplies do not refill a hull.

A destroyed, empty hull becomes eligible for replacement after 45 seconds. An empty working vehicle away from its pad becomes eligible after 120 seconds. Replacements restore health and mounted ammunition at the motor pool. A living player within 25 m of either a wreck or the destination pad delays replacement; reclaiming an abandoned working vehicle also requires the player to be at least 60 m away. Living AI within 8 m of either location and occupied/blocked pads delay replacement. A vehicle in use never gets replaced. Training and match resets retain their previous behavior.

Calm, healthy patrol AI without an active movement order within 24 m can approach and board cars, or ride/gun in a helicopter with an existing pilot. Only allied crews share vehicles. AI leaves an unattended vehicle for a player already within 12 m, waits three seconds for nearby crew before driving, and uses collision-checked local patrol segments at roughly 7 m/s. If there is no usable route or progress for five seconds, it stops and dismounts. This is local patrol steering, not a district road-routing system.

An AI driver stops and unloads when an enemy is visible within 35 m, when the hull is critically damaged, when a strike threatens it, or when it gets stuck. That includes a lone driver choosing to fight on foot. AI gunners use the mounted gun and its finite ammunition. Mounted AI does not also walk or fire its infantry weapon.

When the driver exits, the whole crew exits together. Every exit is planned against scenery, other hulls, nearby people and the other exits before any seat is freed. A blocked or moving crew stays aboard until it can unload safely. AI waits 12 seconds before considering boarding again. A lost/disconnected driver also makes the remaining crew stop and unload; an airborne helicopter without a pilot first descends, keeping passengers aboard until a ground-level exit is possible.

Helicopters remain player-piloted; autonomous AI flight and navigation to a landing zone are outside this change. AI supports helicopter passenger and gunner seats.

Validation: `world-vehicles.test.ts` covers every district's motor pool plus crew exits, blocked exits, AI patrol/combat, faction boarding, abandonment, wreck replacement and training isolation. `scripts/world-vehicle-smoke.mjs` exercises expedition boarding, driving, firing, switching seats, dismounting, and mobile controls with the local development server and an isolated Chrome debugging endpoint.

Verified locally: 50 focused vehicle/control tests, district scene checks, TypeScript checking, production build, and the desktop/mobile browser smoke all passed. The browser smoke reported no runtime errors or remote map requests.
