# Singapore arenas

Free for All, Team Deathmatch and Hardpoint each offer 23 arenas, one in every Singapore
region. Both solo and hosted matches start with the island arena picker; select
a region, load its arena, then choose loadout and settings.

These are authored combat slices of the existing compressed Singapore scenes,
not surveyed layouts. Added barricades, supply stacks and full-height cover are
match-only scenery. They do not change the districts in Open World or Training.
No new reference imagery or audio was generated for this expansion.

| Region / arena | Combat layout | Hardpoint rotation |
| --- | --- | --- |
| Toa Payoh / Dragon courtyard | Playground centre and outer courtyard loop | West courtyard → East courtyard → Dragon approach |
| Chinatown / Smith Street | Close market lanes and shophouse passages; existing arena | Market crossing → Eastern opening → Southern passage |
| Tuas / Container yard | West/east spawns; container alleys join two long aprons, with staggered tall cover breaking the approaches | Gantry crossing → North loading apron → South dispatch apron |
| Woodlands / Park circuit | West/east spawns; shelters and tall cover divide the lawn into crossing and flanking routes | Central lawn → West grove → East path |
| Bishan / Shelter court | West/east spawns; shade court with two side lanes and a longer north rotation | Shade court → North court approach → Garden flank |
| Tampines / Hub court | North/south arrivals; raised sports court, sheltered ground concourses and existing accessible galleries | Centre court → North concourse → South arrival |
| Marina Bay / Garden pavilions | Pavilions and garden walls split the waterfront approach into short duels and wide flanks. | Garden crossing → West pavilion → East pavilion |
| Raffles Place / Exchange square | Circle the planted square or push its central spine beneath the office towers. | Square spine → West arcade → Quay approach |
| Queenstown / Estate green | Low estate walls break up the lawn. Use the tower-side flank to turn a defended crossing. | Estate crossing → North wall → South green |
| Kampong Glam / Cafe courts | Parked cars form short cover lanes beside the cafe courtyards, with a faster exposed outer route. | Parking crossing → Cafe approach → East arrival |
| Jurong Lake / Southern gardens | A broad garden circuit with staggered cover and long approaches around the grove. | Garden crossing → Tree grove → East path |
| Changi / Arrival garden | Fight between the arrival planting and terminal edge, using compact cover to cross the long garden walk. | Garden walk → Arrival walk → Terminal edge |
| Upper Thomson / Terrace crossing | Shopfronts and terrace corners frame a fast cross-street fight with a longer route behind the houses. | Cross street → Shop approach → Terrace turn |
| Punggol / Precinct green | Hold the precinct lawn or rotate through its planted edges and short cover lanes. | Precinct lawn → North path → South path |
| HarbourFront / Gateway court | The gateway lawn has staggered cover, two side routes and a quick central crossing. | Gateway crossing → North approach → South court |
| Sentosa / Palm court | Push between the palms or flank along the resort edge, with cover breaking the open lawn. | Palm court → West walk → Beach approach |
| Geylang / Lorong crossings | Shophouse blocks create tight parallel lanes. Side crossings reward early rotations. | Central lorong → South lane → North lane |
| Bukit Timah / Rail approach | Follow the rail corridor or cross its side courts, with cover at the approaches. | Rail crossing → North path → Station approach |
| Orchard / Boulevard crossing | A compact boulevard arena with sheltered edges, staggered barriers and short mall-side flanks. | Boulevard → West canopy → East canopy |
| Yishun / Neighbourhood courts | Neighbourhood corners divide an open crossing into three capture approaches. | Court crossing → North forecourt → South walk |
| Little India / Campbell crossing | Cross the colourful arcade frontage or weave through the quieter side passages. | Campbell crossing → West arcade → East walk |
| Katong / Pavilion court | The pavilion frontage anchors a courtyard fight with veranda and street-side rotations. | Pavilion court → West arrival → East veranda |
| Pulau Ubin / Village lanes | Village houses create four corner pockets around the crossing, with long flanks outside the porches. | Village crossing → Jetty approach → Forest approach |

Free for All uses the same bounded combat layouts with shared spawn pockets around
the perimeter and interior routes. Every operator is an enemy, including bots.
Solo and hosted matches support zero to six bots; public rooms allow up to four
human players. Individual scoring ends the match at 15 eliminations or three
minutes. Respawns favour clear pockets away from enemies and briefly protect
the returning operator; firing ends that protection. Blocked spawns retry safely.

Team modes retain 4 vs 4 teams. TDM ends at 30 eliminations or five minutes;
Hardpoint ends at 200 occupation points or six minutes, with a 60-second rotation
and ten-second preview. Hardpoints require ground-level infantry; galleries do
not capture the ground-floor objectives. Each new arena has six authored spawn
candidates per team, with at least four outside every objective's exclusion zone.

## Implementation and checks

- `arena-catalog.json` shares map names and mode availability between the client
  and the public-room service. Public listings identify the selected arena.
- `arena-match.ts` and `district-team-arenas.ts` own bounds, spawn candidates,
  patrol routes, match cover and the new district rotations. `hardpoint.ts`
  assembles each map's objective stations. All placements are fixed data.
- Arena deep links and hosted match routing derive from the shared catalog,
  retaining existing URLs. A registry test requires exactly one arena per region
  in each mode, so future region additions cannot silently omit modes.
- The selected map drives scene loading, HUD names, minimap bounds/markers,
  objective scoring, placement restrictions and authoritative network validation.
- `free-for-all-world.ts` adapts the shared geometry for individual combat.
  Explicit map identities bind room joins and snapshots to the selected arena.
  Legacy area-less debug/LAN matches retain their original behaviour.
- `free-for-all.test.ts` checks all 23 maps for connected neutral spawns, full bot
  matches, individual scoring, ten-operator starts, respawn protection and reset.
  `free-for-all-network.test.ts` covers every map with host/guest synchronization,
  rejected mismatched joins/snapshots, reset and departure.
- Supply-crate seeking cannot override an active objective route.
- `expanded-arenas.test.ts` checks complete capture circles, grounded stations,
  multiple approaches, safe spawn choices, navigation, combat, rotation and reset.
  Fast-forward tests fix the navigation clock so machine load does not change how
  much pathfinding work fits into a simulated match.
- Network tests exercise all arenas, including host/guest state and reset. Room
  service tests check map acceptance, labels and rejection of unsupported areas.
- `scripts/fixtures/team-arenas.html?area=tampines-hub` renders an annotated layout.
  `scripts/team-arenas-smoke.mjs` captures every arena layout and checks both pickers, Ubin and Toa Payoh gameplay and the mobile picker.
  `scripts/free-for-all-arenas-smoke.mjs` captures neutral spawn layouts and checks
  both 23-region pickers, Marina/Tampines/Ubin gameplay and the mobile picker.
  `ARENA_SKIP_LAYOUTS=1` skips development-only fixtures for deployed smoke tests.
  Set `ARENA_APP_ORIGIN` and `ARENA_CHROME_ORIGIN` for Vite and isolated Chrome/CDP.

Automated matches validate playability; competitive balance still benefits from
human playtests with different loadouts and team compositions.
