# Range drills and equipment resupply

Every district's field range offers three drills. Choose a drill before entering
or after finishing/resetting; Practice and Counter-fire are independent choices.

| Drill | Targets | Finish |
| --- | --- | --- |
| Classic | All eight authored targets, once each | Clear all eight |
| Continuous | Up to three active/appearing targets, replaced indefinitely | Pause, then End drill & view summary |
| 90-second challenge | Up to three active/appearing targets | Ninety seconds of active play, or end early from pause |

Targets retain their 100/115 HP profiles and body/head hit zones. Dynamic drills
reuse the eight existing positions and models. A target rises over .45 seconds,
becomes hittable when fully raised, then retracts when cleared. Its position
cannot be reused for 2–5 seconds, and the director prefers fresh/older positions.
Retracted targets release their movement collider, so empty positions do not
leave invisible barriers. Positions within 4 m of the player are not selected for new appearances. The
seeded director is independent of rendering; pausing freezes its clock and the
challenge timer. Maps and the AI pilot receive active targets with unique
activation IDs. Clearing a target cancels its pending counter-fire warning.

The HUD shows cumulative clears and either elapsed time or time remaining. Every
elimination retains the existing 20 CR / 25 XP reward. Classic and a fully
finished timed challenge with at least one elimination also pay the completion
bonus; continuous sessions and challenges ended early pay no completion bonus.
Grenade-only clears are valid. Reward IDs remain unique and persisted through
the existing profile ledger. The tutorial and multiplayer/expedition rules are
unchanged. Waves and moving targets are future extensions.

## Equipment box

A labelled green equipment box is placed near the range start and marked on the
map. Walk within 3.2 m, with a clear line to it, and press E or tap Resupply.
It works on foot while playing, with no grenade or supply currently in hand.

- Ammunition: restore each carried calibre's reserve to its starting amount,
  counting a shared pool once. Loaded magazines, chambers and reload progress
  are preserved. Reload normally to load the new rounds. Surplus ammunition is
  never discarded, and uncarried guns are not refilled.
- Grenades: top up to two fragmentation and two smoke grenades.
- Utilities: three bandages, one first aid kit, two spare-insert kits and two
  ammunition pouches. Items still use their usual animations and effects;
  insert kits restore the inserts actually equipped.
- Equipment brought from the armory is copied into the practice session. The
  box also restocks those carried consumables up to their starting quantities.
  Repeated interactions top up to the stock level and never stack extra items.

Range resupply is free. Using purchased or box-provided items in a field range
changes only the session's supplies; it cannot consume purchased inventory or
transfer free stock into the armory or an expedition. Reset restores the starting
session kit. Supplies and added rounds still contribute their normal carry
weight. The box supplies infantry equipment, not vehicle repairs or mounted-gun
ammunition. The AI pilot can return for ammunition when all its carried guns
are dry.

## Implementation and checks

`range-drills.ts` owns the seeded lifecycle, activation IDs and clocks.
`equipment-resupply.ts` accepts an extensible `EquipmentStock` definition, so
future stations can provide different ammunition or supply selections.
`range-resupply.ts` owns bounded placement and the procedural box model.
The FPS engine adapts these to targets, damage, inventory, input, maps and the
pilot. The shared completion reward validates each drill's finish rule.

Unit tests cover recycling beyond eight, fixed pool sizes, pause, activation
reuse, eligible positions, clock boundaries, completion payments, shared calibre
reserves, reload/chamber preservation and profile isolation. District tests
check box placement on all nineteen actual maps. Touch tests cover the contextual
action. `pnpm test:range-drills` uses the actual FPS engine for resupply,
consumption, target recycling, classic/timed completion and early termination;
`pnpm test:range-drills:ui` checks the actual player menu and phone resupply
controls. They write screenshots and results to `.cache/range-drills/`. Start Vite and an
isolated Chrome with remote debugging; `FPS_APP_ORIGIN` and `FPS_CHROME_ORIGIN`
override their usual smoke-test addresses.
