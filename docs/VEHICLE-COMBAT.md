# Armed vehicles

The district FPS field ranges now give both existing vehicles a mounted gun and a finite hull-health pool. Infantry arena/expedition modes retain their existing vehicle availability rules.

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
