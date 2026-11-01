# FPS on all three maps

Select any district, then choose its FPS range — Marina, Raffles, Queenstown, Chinatown, Kampong Glam, Jurong or Changi. Every range uses its district's authored map, eight targets, the same weapon/loadout system, optional counter-fire, XP/rewards, Encik recordings, minimap, debug health controls and fullscreen. Each has its own parked car and helicopter.

Changing regions while in a practice FPS session starts a fresh range on the newly selected map. Permanent equipment and progression remain in the shared armory. Opening the shop and deploying returns to the selected region. Selecting the current region again does not restart the session. Open-world checkpoint travel retains its existing session behavior. LAN/solo arena matchmaking still uses Marina; district practice does not change the multiplayer map protocol.

## Map details and inspection

The local minimap and expanded district map draw the authored schematic roads,
buildings, water and landmark positions. All modes show sector boundaries, with
a bright outline around your current named sector. Sector areas may overlap or
leave gaps. Expedition ownership tint is a separate layer based on surviving
facilities, rather than troop presence. Static geography remains available when
the signal is jammed; tactical markers, hazards and ownership information vanish.

Press **M** or tap the minimap to open the district map. Select a marker to read
its type, distance and available status, capture progress or transport ETA.
**[** / **]** and the previous/next buttons browse markers. The map key explains
the distinct facility and equipment symbols. Desktop inspection releases mouse
capture and stops held movement/fire inputs while keeping your stance; **M**,
**Escape** or **Close** returns to play and requests capture again. A denied
capture leaves the regular Resume control available. The battlefield keeps
running while you inspect the map. Roads and landmarks are schematic positions,
not walking routes; vertical routes and floor overlays are not included.

## Shared implementation

- `fps-districts.ts` supplies map labels, spawn/orientation, target positions, vehicle parking and range props. Marina retains its original range layout.
- `district-world.ts` builds the selected scene with its movement/collision adapter and bounds. Expedition's existing import forwards to the same factory.
- `FpsGame` and `fps-engine.ts` use that district configuration for scene creation, reset, target orientation, minimap markers, completion and pilot waypoints. Map switching disposes the previous engine instead of keeping multiple renderers alive.
- Vehicle creation, driving, flight and dismounting accept regional spawns/bounds; existing callers retain Marina defaults. Queenstown/Raffles flight clearance is computed once from visible mesh bounds, including individual instances, so towers and elevated structures have height. This is conservative static clearance geometry; it is not a moving-object physics system.

## Verification

`fps-districts.test.ts` builds all three authored scenes and checks spawn/target clearance, target sightlines, vehicle parking/exits, regional bounds and instanced flight obstacles. Existing world-zone and vehicle tests cover transition compatibility and Marina defaults.

`pnpm test:fps:districts` checks selected-map entry, map switching without dropping FPS mode, same-map armory return, local minimap, captured mouse aiming/fire, all eight targets on each map, and scene cleanup. `node scripts/fps-district-vehicles-smoke.mjs` checks human movement, car drive/brake/dismount, helicopter takeoff/landing, airborne exit prevention, fullscreen and mobile width on the new maps. Both use Vite 5175 and isolated Chrome debugging port 9331 by default. Local proxy environments may need `NO_PROXY=127.0.0.1,localhost` and the lowercase equivalent.

An exploratory AI-pilot run stalled at five of eight Queenstown targets. Direct mouse input subsequently cleared all eight on every map; do not treat that pilot run as successful autonomous completion. The pilot's aiming/reacquisition limitation remains separate follow-up work.
