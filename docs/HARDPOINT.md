# Smith Street Hardpoint

Choose **Multiplayer → Solo vs bots / Create room → Hardpoint**. The host selects Smith Street for everyone. Four players per team, with assault bots filling vacant seats; public rooms retain the four-human limit. Alpha and Bravo retain TDM uniforms, loadouts, friendly-fire rules and three-second respawns.

The active station rotates every 60 seconds: Market crossing → Eastern opening → Southern passage → repeat. Its next destination appears ten seconds early. Living infantry inside the ground-level four-metre ring earn one team point per second while uncontested, regardless of head count. Both teams inside pauses scoring; empty zones earn nothing. Kills contribute only to personal statistics. Crouching and prone players count; rooftops and vehicles do not. First to 200 points wins, otherwise the higher score at six minutes wins; equal scores draw. Scores survive departures and bot replacement. Firing, throwing a grenade or entering the active zone ends spawn protection.

## Dedicated structures and boundaries

`hardpoint.ts` defines the three control sites separately from `HARDPOINT_LAYOUT`. Each permanent station has a signal beacon, a ground ring with marker lights, and a low barricade. Active neutral, Alpha, Bravo and contested states use white, blue, amber and red; the upcoming station lights yellow. Inactive stations dim. Collision and navigation stay fixed throughout rotation. These are mode-owned physical structures: no facility capture state, repair, supply, faction logistics or vehicle services are installed.

| Station | Centre (x, z) | Approaches |
| --- | --- | --- |
| Market crossing | -20, 80 | Both directions along the market lane |
| Eastern opening | 31, 56 | North and south along the eastern lane |
| Southern passage | -25, 117 | East and west along the southern street |

The playable bounds are x -65…45, z 42…124. Only Hardpoint extends the TDM boundary six metres south to fit the final ring and its cover. District geometry and TDM bounds are unchanged. The map remains asymmetrical; this is a validated initial layout, not a competitive balance certification.

Initial teams spawn on opposite sides. Respawns share the existing team-combat safety ranking: clear ground, over two metres from any actor, over twelve metres from enemies, with distance and blocked sightlines favoured. Hardpoint additionally rejects spawns within fourteen metres of any station, including inactive ones. If all candidates are unsafe, respawn waits and retries. Players face along the open Smith Street spawn lane. Bots use the shared navigation and combat systems to reach spread-out positions inside the active ring. One bot per team heads toward the next site during the ten-second preview; other bots hold or contest the current site. Danger avoidance and healing remain available. Squad movement orders cannot pull bots away from their assigned stations.

## Authority and separation

`team-combat-world.ts` shares terrain, bounds and the perimeter between TDM and Hardpoint. `hardpoint-world.ts` installs the dedicated layout before movement/navigation construction and owns station presentation/disposal. Expedition continues using its existing physical-layout adapter; TDM still installs no additional structures.

`createHardpoint` accumulates uncontested time, splits ticks across rotation boundaries, and caps scores. The arena authority handles teams, occupancy, rotation, scoring and the winner. Snapshots carry active/next station, remaining rotation time, occupancy, owner, contested state and scores. Validation checks these against the clock, actors and authored sites. Runtime registration checks both mode and area, preventing a TDM Smith Street guest from entering Hardpoint. Guests cannot submit team or score changes. Late join receives the current objective; rematch resets both rotation and scores through the existing match-ID mechanism.

## Validation

- `src/game/hardpoint.test.ts`: occupation/contest rules, stance and height exclusion, preview and boundary timing, score cap, kill-independent scoring, time-limit draw, score-limit finish, retained/reset scores, malformed snapshots, real district placement and cover. Every eligible spawn routes to all four bot positions at every site; both approaches to each ring are traversable. A six-minute real-geometry simulation verifies both teams scoring, all three objectives, early rotation, firing, safe respawns and match completion.
- `src/game/hardpoint-network.test.ts`: authoritative host/guest state, forged updates, wrong-mode rejection, joining after rotation, rematch, departure and bot fill.
- `scripts/hardpoint-smoke.mjs`: actual public-room UI and WebSocket relay in two Chrome tabs, guest-first negotiation, team assignment, movement, bot combat/respawns, scoring, preview, rotation and rematch. Run Vite on 5313, Wrangler on 8787 and isolated Chrome with CDP on 9499, or set `HARDPOINT_APP_ORIGIN` / `HARDPOINT_CHROME_ORIGIN`. Evidence is written to `.cache/hardpoint/`.
- `scripts/fixtures/hardpoint-stations.html`: daylight visual review of the real installed stations; `showStation(index, 'alpha' | 'bravo' | 'contested' | 'neutral')` changes the view and presentation.
- Regression checks include the full Vitest suite, typecheck, TDM's real multiplayer smoke, public room authentication/metadata checks, and the alternative/empty structure-layout browser proof. Desktop and portrait phone HUDs were visually reviewed.

The developer LAN lobby keeps its existing FFA controls. The production multiplayer lobby supports both solo and public Hardpoint.
