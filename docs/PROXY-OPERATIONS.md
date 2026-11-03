# Contested prototype operations

The first proxy gameplay slice is enabled in Open World expeditions. It is not
in training, solo arena or LAN. No global alliance changes are introduced.

After 60 seconds of simulation time, the director searches for clear ground
45–65 m from a living, playing human, with two clear approach corridors. A failed
search waits 20 seconds before trying again. A successful operation has an 18 s
cargo descent/warning. Six seconds into the warning, two Freedom Force and two
Collective Corps operators descend from 60 m under sand and jade parachutes,
touching down around the crate's landing. Both landing zones are marked on the
minimap. Full canopy columns are checked against the scene before insertion and
again at touchdown; operators cannot fire during descent. They fight each other and seek the crate;
they initially leave the player and both local factions alone. Owners alternate
between operations. The next operation waits seven minutes after the previous
one finishes. The debug menu can request an operation; disabling random events
also disables automatic proxy operations.

Approach the landed cargo within 4 m and press E (or tap Inspect cargo / choose).
The choice panel shows consequences before acting. Desktop uses keys 1–4; touch
uses buttons. Movement/fire stop while choosing, but the world continues.

| Choice | Favor | Benefit / cost |
| --- | --- | --- |
| Return to owner | Owner +15; rival unchanged | Relinquish the prototype; surviving owner cell withdraws |
| Hand over to rival | Rival +12; owner −20 | Owner pursues the player; requires a surviving recipient |
| Keep upgrade | Owner −20; rival unchanged | The crate’s selected Mythic weapon, for the current life |
| Carry to Armed Forces | Owner −20; rival unchanged | Deliver within 4 m of an operational friendly facility for up to 60 district supplies, full equipment repair and immediate deployment readiness |

Delivery requires a real beneficiary: damaged equipment, a deployment cooldown,
or room in the district supply stock. The receipt reports the actual supply gain
when the cap prevents all 60 being added. Carrying is not a remote donation:
the player must reach the facility alive. Death or leaving the district forfeits
undelivered cargo. Cargo can still be delivered after the recovery team departs;
it prevents another operation from replacing that unfinished delivery.

Favor ranges from −100 to +100 independently for each proxy. It is personal and
lasts this expedition, including district travel and player deaths; leaving Open
World starts a new campaign. This slice records favor but does not yet unlock
shops, contracts or global diplomatic changes. Returning stolen property costs
the valuable upgrade. Merely hurting one proxy never earns the other's favor.
The pause menu shows the current favor ledger.

## Hostility and aftermath

The cargo tracker explicitly broadcasts its location; taking or diverting it
identifies the player to its owner. A deliberate landed bullet or damaging blast
against a neutral operator also provokes that cell (−10 once per player/cell).
Nearby Armed Forces soldiers may defend a targeted player when they can see the
approaching proxy. Only those individual defenders become targets. Distant
friendly soldiers and facilities retain their normal relationships. The actor
relationship is symmetric so defenders can return fire. Neutral proxies are
labelled neutral on the minimap and excluded from AI-pilot targeting.

The existing cells conduct a single 65 s recovery operation, then retreat on foot
past their landing zones along clear ground routes. Encounter hostility ends
after 18 s; surviving operators keep walking instead of disappearing at the
deadline. Cleanup requires at least 25 m from the crate, at least 20 m from every
living player, and a full second outside every player's view or behind cover.
Visible survivors can remain after the recovery window closes; the next event
waits until those operators are gone. They do not summon an endless pursuit army.
Dead operators do not respawn or drop repeatable prototype rewards. Personal
favor remains, but encounter targets are cleared.

Unattended cargo can be secured by either proxy after an uninterrupted eight
seconds within 3 m, with no rival within 8 m and a clear line to the crate. A
three-minute unresolved contest ends in withdrawal. Ignoring the event has no
favor penalty. Outcomes and actual rewards appear in the comms feed.

## Equipment and implementation boundaries

Freedom Force crates roll one of five faction weapons with equal probability
when the operation spawns: **Soft Power · Foreign Aid** (SCAR-L, 5.56 mm,
30-round magazines, reflex sight), **Hard Power · Strings Attached** (SCAR-H,
7.62 mm, 20-round magazines, 2× optic), or **Smart Power · Targeted Assistance** (semi-automatic
precision rifle, 7.62 mm, 10-round magazines, 4× optic), **Peace Offering ·
Escalation Clause** (40-round 5.56 mm rifle and separate 6-round 20 mm impact
launcher, shared 4× sight), or **M200 Intervention** (7-round .408 bolt-action
sniper, 6× sight and deployable bipod). All five are Mythic; each has a 20% chance. The selection remains
fixed through warning, inspection and recovery; the choice panel names the
weapon before acting. Freedom Force cargo never grants a SAR 21.

Each weapon has a separate live weapon family, its faction model, detachable
magazine, working sight and charging handle. The two 7.62 mm rifles share box
magazines, separately from FN MAG belts; the SCAR-L shares 5.56 mm rifle
magazines. Keeping cargo equips the selected weapon in the normal pickup slot,
with a loaded magazine and up to four spare magazines in available rig slots.
It grants no permanent ownership and is removed on death, including after
travel. The Collective Corps’ existing SAR retrofit reward remains unchanged.
Peace Offering switches between rifle and integral launcher with **U** or the
HUD mode button (mouse or touch). The two modes use the same carry slot and
keep separate loaded magazines, cooldowns and reload progress. Launcher spares
occupy real rig positions alongside rifle/pistol spares; cargo adds up to two
rifle and two launcher magazines where room exists. To fit its launcher kit,
a full rig exchanges excess compatible rifle spares above two for launcher
magazines and reports that exchange in the HUD; pistol and other-calibre
spares are preserved. Retained compatible rifle magazines keep their capacity,
including 30-round magazines in the 40-round rifle. If other equipment fills
the remaining positions, only the available launcher spares can be supplied.

Launcher grenades follow a gravity arc at an arcade 70 m/s, burst on impact,
and have a three-second safety fuse. Their blast is 100 damage over 4 m with
cover and stance checks, friendly protection and self-damage from the existing
grenade authority. They cannot be thrown as hand grenades. There is no range
programming/airburst-setting UI. Firing/reloading is validated by the host;
mode switching cannot grant another weapon slot, ammunition or ownership.

Peace Offering's rifle alone exceeds the current XM8 variants in per-hit damage
and precise-hit damage over range, firing cadence, recoil/recovery and muzzle
velocity. Its Mythic build deals 72 base damage at an 80 ms cadence, with full
damage to 70 m. Bulk costs mass, movement/aim speed and reload handling. The
XM8 automatic rifle keeps its specialized 100-round drum capacity; these are
not matching magazine configurations. These are game balance choices, not
claims about real weapon performance.

The M200 uses a 1.4-second manual cycle, 160 base damage, 6× scope and a distinct
10.36 mm ammunition group. Its seven-round magazines do not share rifle/GPMG
or pistol spares. The right hand lifts/pulls/pushes/locks the bolt within the
firing interval; a held trigger cannot repeatedly fire it. Its bipod deploys
in a supported prone stance. Heavy-round armor/audio treatment avoids treating
.408 as pistol ammunition. The QTS-11 and other Collective weapon designs
remain gallery studies; operator loadouts are unchanged.

`proxy-operations.ts` owns bounded personal state, choice validation, claims and
lifetimes. `arena-rules.ts` owns placement, actors, sight/reach checks, combat
provocation and facility rewards. `arena-runtime.ts` accepts operation state only
in opted-in environments; guests cannot submit proxy actions or targets. Shared
visual identity lives in `proxy-faction-catalog.ts`; it has no rendering imports.
`ProxyOperationHud` and `proxy-operation-visuals.ts` present the decisions and the
single reusable cargo/parachute model. The normal two-faction squad heat and
facility ownership rules are unchanged.
