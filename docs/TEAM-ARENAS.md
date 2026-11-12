# Singapore team arenas

Team Deathmatch now offers six arenas. Hardpoint offers five: Smith Street and
four additional regions. Both solo and hosted matches start with the island
arena picker; select a region, load its arena, then choose loadout and settings.

These are authored combat slices of the existing compressed Singapore scenes,
not surveyed layouts. Added barricades, supply stacks and full-height cover are
match-only scenery. They do not change the districts in Open World or Training.
No new reference imagery or audio was generated for this expansion.

| Region / arena | Combat layout | Hardpoint rotation |
| --- | --- | --- |
| Toa Payoh / Dragon courtyard | Playground centre and outer courtyard loop; existing TDM arena | TDM only |
| Chinatown / Smith Street | Close market lanes and shophouse passages; existing arena | Market crossing → Eastern opening → Southern passage |
| Tuas / Container yard | West/east spawns; container alleys join two long aprons, with staggered tall cover breaking the approaches | Gantry crossing → North loading apron → South dispatch apron |
| Woodlands / Park circuit | West/east spawns; shelters and tall cover divide the lawn into crossing and flanking routes | Central lawn → West grove → East path |
| Bishan / Shelter court | West/east spawns; shade court with two side lanes and a longer north rotation | Shade court → North court approach → Garden flank |
| Tampines / Hub court | North/south arrivals; raised sports court, sheltered ground concourses and existing accessible galleries | Centre court → North concourse → South arrival |

All modes retain 4 vs 4 teams. TDM ends at 30 eliminations or five minutes;
Hardpoint ends at 200 occupation points or six minutes, with a 60-second rotation
and ten-second preview. Hardpoints require ground-level infantry; galleries do
not capture the ground-floor objectives. Each new arena has six authored spawn
candidates per team, with at least four outside every objective's exclusion zone.

## Implementation and checks

- `arena-catalog.json` shares map names and mode availability between the client
  and the public-room service. Public listings identify the selected arena.
- `arena-match.ts` owns bounds, spawn candidates, patrol routes and match cover.
  `hardpoint.ts` owns each map's objective positions and stations.
- The selected map drives scene loading, HUD names, minimap bounds/markers,
  objective scoring, placement restrictions and authoritative network validation.
- Supply-crate seeking cannot override an active objective route.
- `expanded-arenas.test.ts` checks complete capture circles, grounded stations,
  multiple approaches, safe spawn choices, navigation, combat, rotation and reset.
  Fast-forward tests fix the navigation clock so machine load does not change how
  much pathfinding work fits into a simulated match.
- Network tests exercise all arenas, including host/guest state and reset. Room
  service tests check map acceptance, labels and rejection of unsupported areas.
- `scripts/fixtures/team-arenas.html?area=tampines-hub` renders an annotated layout.
  `scripts/team-arenas-smoke.mjs` checks both pickers, gameplay and the mobile picker.
  Set `ARENA_APP_ORIGIN` and `ARENA_CHROME_ORIGIN` for Vite and isolated Chrome/CDP.

Automated matches validate playability; competitive balance still benefits from
human playtests with different loadouts and team compositions.
