# AI pilot and strategy plugins

The pilot controls the player's infantry slot in practice, arenas and expeditions. Click **Watch AI play**. **Take control** requests normal pointer capture; **Stop AI** or Escape pauses. Watching needs no mouse capture. In an expedition, select a destination on the island map: the pilot follows the displayed checkpoint route and resumes after district loading with its carried equipment and selected strategy.

## Local and LLM strategies

**Local planner** works offline. It chooses combat, resupply, travel or exploration from current observations. A 10 Hz controller turns, aims, shoots, reloads, switches weapons, moves and interacts through the same engine functions as human input. ADS engages after alignment, retains the current visible target and holds steady while the sight rises. If the scope continues hiding the target, the controller reacquires at hip level and suppresses ADS for three seconds so it can complete a burst without cycling the sight. It never fires or tracks a target while that target is hidden.

All three strategies let the local controller recover with carried food, bandages or first-aid kits when health is at or below 85%. It waits four seconds without visible enemies, damage, incoming fire, gunfire within 80 m or nearby marked hazards. It chooses the smallest available belt item that covers the wound (otherwise the largest), crouches and stays still through the normal supply animation. A returning threat puts the item away immediately; before the normal commit point, the item is kept. Safety is an estimate from player-visible cues, so an unseen ambush can still interrupt recovery.

**LLM strategist** chooses a high-level goal and optional known waypoint. The local controller keeps running while requests are pending and handles immediate visible threats. Requests are throttled to one per ten seconds with one outstanding request. Plans expire after twenty seconds; missing waypoints, errors and unavailable service fall back to local planning. Pause, respawn, strategy changes and zone disposal cancel outstanding plans.

**Streamer** chooses a goal and may name a known waypoint, a district sector or a remembered place while speaking to chat in the same turn. A solo session owns this strategy across deployment, play, respawn and results. The shared HUD events can request an earlier plan after three seconds. See [Streamer mode](AI-CAST.md#streamer-mode) for its controls, sandbox and limits.

To try it, configure private `OPENAI_API_KEY` in `.env.local`, run/restart `pnpm server`, and run `pnpm dev` in another terminal. Select **LLM strategist**, then **Watch AI play**. `PILOT_MODEL` optionally overrides the server's `gpt-5.6-luna` default. No key is needed for the local planner. The public Cloudflare deployment serves that backend from its own origin, so the strategist works there while the Worker carries its private `OPENAI_API_KEY` secret; without one it falls back to the local planner. A static host with no backend always falls back.

The server uses the Responses API with [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) to constrain `{ goal, waypointId, summary }`. Streamer play adds optional `sectorId` and `placeId` to the local plan. The play reply has a `destination` object with `waypointId`, `sectorId` and `placeId`. At most one is non-null. The server builds mutually exclusive schema alternatives from observed waypoints, the district’s sectors and the learned place IDs actually printed this turn. After validation, a place decision includes the server’s stored name, sector and position for the controller. The model only selects an ID. The local and LLM strategies retain their waypoint contract.

The streamer controller clips sector bounds to the playable area, selects a walkable bot navigation anchor or a tested patrol anchor, and otherwise searches outwards from the clipped centre. It steers through the regular input path. If blocked it uses the existing unstick maneuver and advances a bot navigation graph search over subsequent pilot decisions. Entering the sector rectangle completes the trip, even before the chosen point. The periodic strategy request continues during travel. Pending or failed requests leave the sector active beyond 20 seconds. A valid replacement, death, or district disposal clears it. Visible combat, live grenades, safe healing, reloads and needed supplies retain priority.

A remembered-place plan uses the same steering and interruptions. The controller looks for usable footing at the place, then immediately beside it for solid cabinets or walls. It checks the playable bounds and the remembered floor. Elevated destinations start a navigation search on acceptance. A place trip ends within 1.4 m of its selected footing and within 0.8 m of its height. Entering the surrounding sector keeps the place trip active. A periodic re-ask includes the destination sector and place ID, even after the original sector drops out of the local neighbourhood. Forget cancels pending decisions and clears travel.

The UI displays the current plan or fallback reason. Only the server holds credentials; this feature sends the pilot's public observation to the configured model endpoint when selected.

## Information and controls

`fps-pilot-perception.ts` exposes the bearings, distances and apparent sizes of on-screen contacts through line-of-sight, scene-occlusion and weapon-aperture checks. The controller also gets its own position, pose, vitals, weapon ballistics, prompts, warned grenade hazards and public supply, target and checkpoint waypoint positions and IDs. The streamer additionally reads the player's HUD and expanded M map. It can report an enemy revealed by recon, a teammate's mark or scent when the map shows that information. Its controller still needs an on-screen contact to aim or fire. Hidden actor state, unmarked enemy positions and collision geometry stay outside the model observations. Local navigation can consult the game's walking data.

`PilotAction` permits held movement/aim/fire, bounded relative look deltas, reload, jump, weapon selection, pickup, checkpoint interaction and using or cancelling a healing belt supply. Observations include the available healing options, whether the hands are busy using a supply and a public danger signal. The pilot may also request `contact`, `moving` or `stuck` radio callouts; the shared radio director applies cooldowns and selects an Encik line. Reload, kill and other action events produce the same radio feedback as human actions. It cannot teleport, grant ammo or directly apply damage. The server independently whitelists observation fields before sending a strategy request.

## Extension points

- `fps-pilot.ts`: observation/action contracts and local action controller. Pass a `PilotPlanner` to `createPlayerPilot` to replace synchronous goal selection.
- `pilot-strategy-contract.ts`: async `PilotStrategy` interface. Implement `plan(observation, signal)` returning a valid `PilotPlan`; respect cancellation and use only observation data.
- `pilot-strategy.ts`: `createStrategyPlanner` adapts an async strategy to a synchronous planner with throttling, expiry, cancellation and fallback. Exported `localPilotStrategy` and `llmPilotStrategy()` implement the same plugin contract.
- `createFpsEngine(..., { playerPilot })`: accepts a custom `PlayerPilot` with `decide` and `reset`. An async adapter's reset should be called from the injected pilot's reset as well as its controller reset. The UI strategy selector restores a built-in controller when changed.

Existing squad NPCs still use their separate role plugins. They have not been migrated to this player perception/control contract. Persistent NPC identities, saved lives and full pathfinding are future work. Current navigation follows known waypoints and recovers from bumps; complex obstacles can still defeat it. The pilot does not drive vehicles.

## Verification

Run `pnpm test` and `pnpm build`. With Vite at `127.0.0.1:5175` and an isolated Chrome profile exposing DevTools on port 9228, run:

```sh
NO_PROXY='*' no_proxy='*' pnpm test:fps:pilot
NO_PROXY='*' no_proxy='*' pnpm test:fps:pilot:travel
NO_PROXY='*' no_proxy='*' node scripts/fps-pilot-recovery-smoke.mjs
```

Override `FPS_APP_ORIGIN` and `FPS_CHROME_ORIGIN` for other ports. The range check covers all eight targets, stopping and pointer-locked takeover. The travel fixture declares a starting position near a real checkpoint and seeded weapon crate, then verifies autonomous pickup, travel and resumption with one renderer. The recovery fixture checks real belt consumption and restored health, and injects a public threat cue to verify interruption before first aid commits and subsequent recovery. These checks need no model key or external map requests.
