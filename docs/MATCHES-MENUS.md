# Matches menus

**Play** is the main menu’s entry for Open World, Training and matches. Choose an activity first. Open World and the live-fire range use the district picker, while Training also contains the tutorial. Team Deathmatch uses the same picker to choose between the Dragon courtyard and Smith Street. Hardpoint and Free for All each have one arena, so they open match setup directly. Match setup offers **Solo vs bots** and **Host room**.

**Find a Room** is the Play menu’s entry for joining. It shows open rooms and a room-code field on one screen. Selecting a listed room fills that field. Invitation links still open `/multiplayer` with the code filled in. Returning from Team Deathmatch setup preserves the last confirmed arena.

Both host and guest see the host’s mode, map, rules and capacity before entering. Team matches have eight combatants, with at most four human room members; bots fill both teams. The human roster distinguishes In room, Loading, Ready, In match and Match complete. These are presence indicators, not a ready-up requirement. The host relays each member’s authenticated status. A room advertises its immutable match configuration before the host loads the game.

**Choose starting loadout** selects owned gear before the engine is created, including for a guest who has already joined a room. This session selection applies to the first spawn. Once entered, the existing next-respawn loadout picker remains available.

## Returning and leaving

**Return to room** preserves the session, engine, player identity and current match. **Return to match** reopens the existing game. The host continues authoritative simulation while viewing the room. The room explicitly explains that the match keeps running and the operator remains on the field, just as when opening the pause menu. This is not a spectator or invulnerability state.

**Leave room** disconnects a guest. **Close room for everyone** disconnects the host and closes the room. Navigation confirmation remains in place. Solo has **Return to setup** and **End solo match**. Ending a match retains the setup fields so the operator name is ready for another match. The room component owns the connection while its route is open and keeps the session mounted when switching between the room and game.

## Scoreboards and small screens

Hold **Tab** during play to see the live scoreboard and release it to close. When the callout wheel is open, **Tab** and **Shift+Tab** still page through callouts. The match menu also shows **Players & scores**.

Team scoreboards group Alpha and Bravo under explicit headings and mark **YOUR TEAM**. Mobile no longer hides team membership. Hardpoint ranks by uncontested hold time, then eliminations and deaths; hold time is informational and does not change team scoring. Its pause screen also shows the active station, control state and rotation countdown. FFA retains individual standings.

The activity cards stack on phones and the arena picker defaults to its list view on narrow screens. The primary room or match action receives focus when switching views, and fullscreen exits when returning to the room.

## Validation

- `scripts/matches-menu-smoke.mjs`: real desktop host and 390×844 touch-emulated guest through Cloudflare’s local WebSocket room relay. Covers mode selection, guest match details, first-spawn loadout, guest entry before host, return from ready/pause, host/guest continuity, same player IDs, retained loadout and scores, advancing authority clock, visible mobile team headings, resuming, explicit leave, bot fill and host closure, plus solo FFA and TDM start/return/end flows. Evidence is in `.cache/matches-menu/`. Uses Vite on 5313, Wrangler on 8787 and Chrome CDP on 9499, configurable with `MATCHES_APP_ORIGIN` / `MATCHES_CHROME_ORIGIN`.
- `room-presence.test.ts`: host relay, sender validation, departure cleanup and non-disconnecting presence updates.
- `ArenaScoreboard.test.tsx`: team grouping, own-team indicator, objective-first ordering and legacy FFA standings.
- `hardpoint.test.ts`: hold contribution for multiple teammates, contest and departure without multiplying team score.
- Existing TDM/Hardpoint multiplayer smokes retain gameplay and rematch coverage; full unit suite and typecheck cover expedition and other modes.

Browser mobile emulation validates responsive layout and touch flows; it is not a physical iOS/Android device test.
