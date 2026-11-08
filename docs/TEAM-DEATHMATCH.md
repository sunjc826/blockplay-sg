# Team Deathmatch

Enter Multiplayer → Solo vs bots or Create room → Team Deathmatch. Public rooms retain the four-human limit; the authority fills each team to four with assault bots. Alpha uses green armed-forces uniforms; Bravo uses navy contractor uniforms. Both teams' bots draw from the same role, rank and weapon rules.

The first team to 30 opponent eliminations wins. At five minutes the higher team score wins; equal scores draw, without a deaths tiebreak. Scores belong to the match and survive player departures and bot replacement. Respawns take three seconds, replenish the existing infantry loadout, and grant three seconds of protection that ends on firing or throwing a grenade. Friendly fire is off; self/environment deaths award no team point. Existing Armory gear and progression remain available.

## Initial areas

- **Toa Payoh · Dragon courtyard**: the housing-gallery courtyard and its two outer approaches; 100 × 100 metres.
- **Chinatown · Smith Street**: shopfronts, stalls and connecting market lanes; 110 × 76 metres.

These reuse existing scenery. They are a limited initial set, not a claim of competitive symmetry or completed map balance. The gold perimeter and minimap outline show the playable bounds. Ground spawn candidates are authored per side, checked against actual collision, and connected through the real navigation graph. Initial teams start on opposing sides. Later spawns can use either side to escape camping: occupied points and points within 12 metres of an enemy are rejected; remaining candidates favour distance and obstructed enemy sightlines. If none are clear, the player stays down and retries every half-second. Match perimeter limits movement but does not invent invisible ballistic cover.

## Separation from expedition

`arena-match.ts` owns the match catalog, teams and constants. `team-deathmatch-world.ts` selects its area and delegates terrain plus the bounded combat environment to `team-combat-world.ts`. It does not instantiate facilities, camp layouts, heat, logistics, capture objectives, vehicles, reinforcements or the expedition event director. No new physical cover has been added. The previous independent structure-layout installer and expedition adapter are also used by the dedicated [Hardpoint control stations](HARDPOINT.md).

`arena-rules.ts` shares infantry movement, weapon handling, damage, spotting and navigation. Team-only branches handle the roster, hostility, spawn selection, scoring and match ending. Actors without teams retain existing expedition/FFA relationships; existing FFA rules and expedition defaults are unchanged. Bots patrol the match's combat anchors and react through the existing spotting system instead of needing facility objectives. Scripted expedition combat events are refused in TDM.

`arena-match-session.ts` resolves the host's immutable mode/area before a guest constructs a world. The guest ignores other senders and unknown areas, and retries while waiting for the host to enter. Runtime registration requires the same area; snapshot validation requires the matching area, eight actors, four on each team, valid team/faction pairs and bounded team scores. The host assigns teams and computes all damage, respawns and scores; guests cannot submit teams or scores. The public directory validates and displays the selected mode/area. Reset keeps the selected area and teams, clears scores, and uses the existing match-ID protection against stale packets.

## Validation

- `team-deathmatch.test.ts`: assignment, bot replacement, legacy relationships, friendly fire, spawn protection, blocked-spawn retries, kill limit, timer/draw, retained/reset scores, snapshot rejection, and both actual district geometries. Real bots must move, fire, score for both sides and respawn without expedition services.
- `team-deathmatch-network.test.ts`: host configuration, forged/unknown configuration rejection, late host, host/guest team agreement, authoritative respawns, rematch and disconnect bot fill on both areas.
- `scripts/team-deathmatch-smoke.mjs`: real UI plus two Chrome tabs through the local Cloudflare WebSocket relay; guest-first entry, matching map/team rosters, bot eliminations, respawns and host rematch. Run Vite on 5313, Wrangler on 8787 and isolated Chrome with CDP on 9499, or set `TDM_APP_ORIGIN` / `TDM_CHROME_ORIGIN`. Uses the battery graphics preset for software rendering. Evidence goes to `.cache/tdm/`.
- `scripts/public-rooms-check.mjs`: directory metadata validation alongside existing authentication, capacity, reconnect and relay checks.

The production route supports both solo and public TDM. The developer LAN lobby retains its existing FFA controls. Transport-independent TDM rules and negotiation can be reused if a LAN mode picker is added later.
