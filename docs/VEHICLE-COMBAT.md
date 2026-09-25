# Armed vehicles

The district FPS field ranges now give both existing vehicles a mounted gun and a finite hull-health pool. LAN and solo-bot arenas share host-owned vehicles. Expedition remains its existing single-player infantry mode.

| Vehicle | Health | Weapon | Total rounds | Damage per hit | Interval |
| --- | ---: | --- | ---: | ---: | ---: |
| Utility 01 | 600 HP | Roof GPMG | 240 | 60 | 0.12 s |
| Falcon 01 | 900 HP | Chin HMG | 400 | 95 | 0.15 s |

Look to aim; hold LMB or the desktop/touch **Fire** button. The gold impact marker follows the actual gun direction, including elevation limits and cover. Shots check the path from the gun mount so a barrel pushed through cover cannot bypass it. Infantry weapon selection does not change vehicle damage or ammunition.

Each hull retains its own ammo and damage when exited or re-entered. Infantry reloads and ammunition supplies do not refill it. Empty guns stop firing; resetting the exercise restores both vehicles.

Bullets, counter-fire, nearby vehicle blasts, and hard collisions damage hulls. Counter-fire strikes the occupied hull instead of the player. Low-speed contact does not damage vehicles. Damage thresholds are:

- Above 75%: intact.
- 75% or lower: dented panels and scorched paint.
- 50% or lower: heavy damage, smoke and failed lamps.
- 25% or lower: critical damage with smoke and flames.
- 0 HP: one explosion, a charred wreck, stopped weapons/drive, and no re-entry.

Destruction is lethal to the crew. Blasts damage nearby players, targets, and other vehicles with linear falloff and static-cover obstruction. Utility/Falcon blasts reach 9/12 m with 240/320 maximum damage. Destroyed helicopters fall onto the ground or supporting roofs. Wrecks persist until exercise reset; visual flames do not apply ongoing damage.

All tuning lives in `src/game/vehicle-combat.ts`. Damage visuals preserve the equipped wrap and original transforms for reset. Smoke/fire/explosions use a fixed 96-particle pool and never block gameplay rays. This is arcade balancing, not a real vehicle specification.

## Riding together (LAN and solo arenas)

Both vehicles have four seats: driver/pilot, gunner, and two passengers. Press
**E** near a stopped vehicle to claim the first free seat, **V** (or **Switch
seat** on desktop/touch) to move to the next free seat, and **E** to exit once
slow enough and safely grounded. Occupied seats cannot be taken from another
player. The HUD lists every occupant and highlights your seat.

Only the driver controls movement. The gunner aims/fires the mounted weapon;
a driver alone may fire while the gunner seat is empty. Passengers ride and
look around, with infantry shooting disabled while seated. All seats share
the same hull and finite weapon-ammo pool. Seats and ammo are not replenished
by a player's respawn. Damage kills the entire crew if the hull is destroyed.

The host resolves seat requests, collision/movement, gun cooldown/ammo, hull
hits, blasts and deaths. Guests send bounded controls and aim, not vehicle
positions, damage, ammo or occupant lists. Inputs expire after 350 ms to stop
an abandoned control stream. Disconnect/death frees the occupied seat;
reset clears the roster, wrecks, damage and ammunition for everyone. Late
joiners receive current hulls and occupants. Bots remain infantry and do not
autonomously board vehicles.

Vehicle snapshots include seated actor locations, turret aim and shot endpoints.
Remote avatars ride at seat offsets with a seated pose; translucent glazing
makes occupants visible. The field range also offers seat switching for trying
the gunner and passenger roles alone.

Validation: 826 tests, typecheck, production build. Tests include four-way seat
contention, role authority, finite ammo, moving/airborne exit restrictions,
crew destruction, snapshot validation, and a paired host/guest replication test.
Visual browser play-testing was blocked by the cloud browser's workspace
localhost access restriction.
