# Expedition facilities

Expedition combat is organized around independent equipment sites. Each district
starts with an allied command post, a Black Kite command post and garage, and an
unbuilt helipad. Sites use the existing authored ground anchors and validated
motor pools; they are gameplay additions, not claims about real facilities.

There is no territory-wide percentage capture. A faction can own disconnected
posts or a building's equipment while enemies occupy the surrounding streets.
Facility ownership, local enemy pressure and equipment health are separate.

## Playing

New expeditions open on a live aerial view of the district, with **Random entry
point** selected. Click or tap a landing marker directly over the 3D scenery to
choose that starting location. Drag to pan; use the wheel or +/− to zoom, and
**View all** to restore the full district. The controls sit beside the map on
short landscape screens. **Briefing & settings** holds mission and environment
options, and **Enter district** deploys from the current aerial camera. Each map
offers its original district entry plus up to five spread-out entries drawn
from existing authored ground anchors and checked against scenery, vehicles,
NPCs and facility positions. The authority rechecks occupancy when deploying;
random selection can fall back to another approved point if one is blocked.
Selection does not rebuild the world or move facilities. The choice is locked
once play starts; pause/resume preserves it. After death, choose an operational allied control zone (command post, garage
or helipad). You can select during the three-second timeout, or wait and choose
after it ends. **Auto-respawn** is unchecked by default; checking it chooses an
available allied zone automatically at timeout, preferring distance from enemies.
The preference lasts for the expedition, including district travel. Each death
clears the manual selection. Destroyed, suppressed or blocked destinations are
disabled; ownership and safe exits are rechecked at respawn. If a selected zone
becomes unavailable, select another or enable auto-respawn. With no available
allied zone, you wait until one becomes available. Desktop death releases mouse
capture so the choices can be clicked; Resume captures the mouse after respawn.
Checkpoint travel keeps its authored arrival point.

Entering a fresh expedition plays a 3.8-second deployment intro: a downward
sky view accelerates into a dive, brakes smoothly and levels into first person.
Speed-driven radial blur softens the world during the dive and fades before
arrival. The weapon begins rising during the final .85 seconds of approach,
so its support-hand rack already flows into the first-person view. The gun
stays sharp. Staggered mission-style lines reveal the district, Singapore time
and simulated weather from the actual entry conditions. The simulation starts
after the sequence, so patrols cannot hurt the player during it. Space or **Skip intro** starts play
immediately; Escape or **Menu** freezes the intro, and Resume continues it.
Reduced-motion preferences omit the aerial travel and blur and show all three
briefing lines immediately. Reduced effects also disables the blur. The animation
doesn't change ammunition or health. It doesn't replay after pausing, on death respawns or on
checkpoint travel. A sheltered entry uses a brief fade across its roof.

Open the map with M to find facility squares: blue allied, orange hostile, gray
unbuilt. Dashed squares indicate destroyed or unbuilt equipment. Approach the
equipment cabinet; the nearby card explains its owner, health and operation.
Within 4 m, press E or tap the action button to start work:

- **Capture intact:** 24 seconds at a one-person advantage, free, preserves health.
- **Build equipment:** 22 seconds; command post 35 supply, garage 50, helipad 70.
- **Repair friendly equipment:** 12 seconds, 15 supply, restores full health.

Remain nearby until work completes. Infantry within 18 m, on the same level with
an unobstructed line to the site, contribute equally. Two attackers versus one
defender can complete a capture. Equal or inferior presence stalls it; an
advantage of two or more doubles the work rate. Dead troops, vehicle occupants,
paused players and troops on other floors do not contribute. Leaving, dying or
boarding cancels unfinished work and refunds its supply cost.

Shoot the cabinet or use explosions to destroy enemy equipment. Landmark
buildings remain intact. Allied infrastructure is protected from friendly fire.
Destroyed equipment retains its owner but cannot deploy anything until rebuilt.
Sustained hostile numerical advantage within 9 m of the cabinet suppresses
deployment after five seconds. Clearing that pressure restores operations.

## Reinforcement and production

Each faction has district supply: 100 initially, up to 180, recovering at 0.5 per
second. This belongs to the expedition, separate from permanent armory currency.

- Command posts can deploy up to four soldiers every 25 seconds, at three supply
  per soldier, within the existing population cap and where exits are clear.
- Garages replace wrecked or abandoned cars for 25 supply.
- Helipads replace helicopters for 45 supply.
- Vehicle production follows the existing wreck/abandonment delays, requires a
  clear motor pool, and waits while people are close. Leave at least 25 m of
  clearance to let a new hull arrive. Existing vehicles survive facility loss.

The radio reinforcement order reports the post's next wave and operating
constraints. It no longer creates extra troops beside the caller independently
of infrastructure. If a faction has no operational command post, slower reserve
transports can deliver troops through a bounded set of authored outer anchors,
at most once every 80 seconds. The former arbitrary 45-second bot respawn is
disabled in facility expeditions. Combat support events remain off-map support.

Sentosa also receives external naval landing parties through two authored southern
beach lanes, even while command posts are operational. Each craft brings up to
four infantry, uses the existing population limits and casualty reservations,
and leaves after unloading. A faction's naval interval is 150 seconds; all its
external transports share an 80-second minimum dispatch gap. Incoming craft are
announced in comms and marked on the map. Destroying the boat loses troops still
aboard; already landed soldiers continue fighting. Menu-open expeditions remain
active, while district travel saves the remaining clocks. Other districts are
not enabled. See [naval landing rules and validation](NAVAL-LANDINGS.md).

Bots are grouped into stable squads of up to four, with shared facility
objectives and spaced approach positions. An available surviving member leads
work at the target. Existing player orders override their movement assignment;
individual fighting, healing and danger avoidance continue. This is a first
objective-based squad implementation, not a formation or suppression simulator.

## Persistence and scope

Ownership, damage, supply, deployment cooldowns and fleet condition/positions
survive leaving and returning to a district during one expedition. Unfinished
work is canceled and refunded. Vehicle seats are cleared when the district is
rebuilt, and infantry squads are re-established from the available posts or held
in reserve. Unloaded districts do not simulate battles. A new expedition starts
fresh; no cross-session save or campaign victory/ticket system is included.

The arena authority owns facility actions, damage, presence and resources. The
client submits only the requested site id, with proximity, faction, life and
security checked by the host. Practice, tutorial and ordinary arena modes retain
their existing rules.

## Validation

`facilities.test.ts` covers contested capture, local suppression, floors/cover,
construction, repair, costs, cancellation, persistence and snapshot validation.
`facility-arena.test.ts` covers real shots, facility takeover, vehicle production,
fleet persistence and squad deployments. `facility-sites.test.ts` checks all 19
districts against their actual collision and motor pools.

Run `node scripts/facilities-smoke.mjs` with Vite on 5191 and Chrome CDP on 9341
(or set FPS_APP_ORIGIN/FPS_CHROME_ORIGIN). Its real-engine fixture checks building,
district return and desktop/portrait/landscape facility controls. It does not
replace a prolonged combat balance playtest.
