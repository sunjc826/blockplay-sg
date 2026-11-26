# AI commentary

Open **AI commentary** on the FPS start or pause card. Pick a commentator, choose the language and screenshot settings, then enable live commentary. The cast works in training, arenas and expeditions. The latest line appears in the subtitle area for six seconds. The Cast channel in the comms log retains the speaker and line. Settings persist in browser storage. Opening the panel checks availability and quota. With commentary off and the panel closed, the browser sends no cast requests.

## Local setup

Put the selected provider key in the private server environment. Start `pnpm server` and `pnpm dev` in separate terminals and open the Vite origin (normally localhost:5173). If Vite uses a different port, include its exact origin in `ADVENTURE_ALLOWED_ORIGINS`. Restart the backend after changing settings. A static build needs a same-origin backend for commentary.

| Private server setting | Default or purpose |
| --- | --- |
| CAST_PROVIDER / CAST_MODEL | anthropic / claude-sonnet-5-5 |
| STREAMER_PROVIDER / STREAMER_MODEL | anthropic / claude-sonnet-5-5 |
| PILOT_PROVIDER / PILOT_MODEL | openai / gpt-5.6-luna |
| ANTHROPIC_API_KEY / OPENAI_API_KEY | Credential for the selected provider |
| OPENAI_BASE_URL | OpenAI-compatible Responses API base |
| AI_ADMIN_TOKEN | Optional admin passphrase and cookie signing secret. Falls back to the existing AI_ADMIN_KEY binding |
| AI_DAILY_CALLS_PER_IP | 1000 |
| AI_DAILY_CALLS_ANON_TOTAL | 10000 across all anonymous callers |
| AI_DAILY_CALLS_ADMIN | 5000 across signed-in admins |

The status panel shows the caller's daily allowance and reset time in the player's local clock. The day ends at midnight in Singapore. The server checks the IP and global anonymous budgets together. A signed-in admin uses the shared admin allowance. Each identity can start 20 calls per rolling minute and hold four active requests. Admission happens after input and credential checks. An accepted call consumes one slot even if the provider fails or the caption arrives too late to display. The cost display estimates USD from token usage for known Claude models. Other models display tokens.

Open **Admin sign-in** in Streamer mode or the AI commentary panel and enter the private passphrase. The server compares fixed-length digests, limits failed sign-ins to five per IP per rolling hour and issues a signed HttpOnly cookie for 30 days. The cookie is SameSite=Strict and Secure except on loopback. Sign out to clear it in this browser. Changing the secret invalidates all sessions.

## Data sent

Both cast roles can use anything a player can read on screen or on the expanded M map. The browser builds one bounded readout in `src/game/cast-hud.ts` just before a request. It uses the rendered mode's objective, clock, map bounds and marker list. This matters in expeditions, where the page adds pickups, townsfolk and checkpoint exits to the engine's tactical markers.

- **Location and objective.** District, current named sector (or the gap between sectors), compass point and degrees, current task, planned crossing, and up to four displayed objective names, directions and distances.
- **Map and danger.** The six nearest eligible markers carry a kind, label, compass bearing and approximate metres. Distances round to 5 m nearby, 10 m at medium range and 25 m from 100 m out. Marked contacts, scent, recon, friendlies and edge indicators follow the map's rules. Jamming leaves static landmarks and hides tactical symbols, danger rings and sector ownership. Other warnings, such as an incoming-fire banner or the live grenade indicator, follow their own HUD.
- **Combat and equipment.** Current and maximum health and armor, spawn shield, stance, carried weapons, selected gun, fire mode, capacity, rounds, chamber, spare magazines and reserve, reload and aim state, accessories, burden and reserve carrier. Belt quantities, selected recovery and combat items, held grenade and fuse, supply progress, conditions, food effects and vision device status accompany them. Aboard a vehicle the readout includes seat, crew, view, instruments, hull and mounted ammunition.
- **Round and feedback.** Mode and phase, clock and session age, score, kills, assists, deaths, scoreboard place within the displayed team or FFA list, team scores, hardpoint state, elimination chain and reward progress. Available district threat, heat, facility control and wallet accompany action prompts, a focused loot card, recent chatter, radio, comms, score feed and notices. The readout also includes visible deployment or respawn choices, death recap, range earnings, streak placement, score awards, and the Merlion and proxy-operation displays when active.

The readout contains no world positions. Its contact symbols come from the minimap's public output. The separate pilot observation retains the player's position, public waypoint IDs and controller inputs. Both HTTP endpoints validate the readout recursively before admitting a call. Player and item names, log lines and notes are bounded observation data.

### District map brief

The last stable system block follows the persona frame, voice, language rule and place card. `server/cast-map-brief.ts` reads the game's sectors, landmark stamps, gateway and landing registries. It places each named sector in a compass third of the district, lists its stable ID and cover, and names the sectors whose bounds touch or overlap. A feature in overlapping sectors belongs to the smallest one, as on the M map. Features in gaps get a compass location of their own.

Expedition facilities depend on collision-checked placement. The small `src/data/cast-map-index.json` projection supplies district bounds, facility positions and hardpoint sites to Node and the Worker. Run `node scripts/cast-map-index.mjs` after placement changes. A parity test builds every district and checks the index. Only the server assembles the brief. The field-school tutorial and districts without sectors contribute no map block. Current ownership and match activity come from the HUD.

Both roles carry up to 30 spoken lines. Screenshots default on and have their own switch. Each optional JPEG comes from the game canvas and excludes browser chrome and DOM overlays.

## Provider and streamer extension points

`server/llm/types.ts` defines the completion contract. Implement a provider factory in that directory and add its key name, default model, pilot token budget and factory to the registry in `index.ts`. Both adapters accept an injected fetch. Input token totals include cached input. The optional price estimate discounts cache reads.

`src/game/ai-cast.ts` schedules captions using an injected clock and request function. It batches minor events for 1.5 seconds, gives major events priority, and asks after 15 quiet seconds. One call can run at a time. The director drops replies older than six seconds and invalidates pending replies when play resets. District travel retains line memory. `hudReadout` selects public HUD fields and `captureFrame` copies the next rendered view on demand.

## Streamer mode

Open **Streamer mode** on the main menu or in a solo FPS briefing or pause menu. Choose Pro gamer, Rager or Stand-up comedian, set clean language and decide whether to share game screenshots. Check the daily allowance and press **Start streamer**. Starting from an existing run opens a fresh sandbox session. The commentator's saved setting takes effect again when streaming ends.

The persona chooses solo activities, shops, picks a district and configures deployment before playing. Its latest line appears on the menu or in the game's subtitle area. Game lines also enter the Cast comms channel with the speaker's name. The last 30 lines follow the session through store visits, matches and district crossings. Stopping or starting a new persona clears them.

**Stop** and Escape end the session immediately. You can move the pointer freely while watching. Clicking, dragging, scrolling or pressing a key outside the streamer controls pauses the session, except when casting a numbered poll vote. **Resume** continues the sandbox run. **Take control** ends the sandbox and returns the player's own profile to the current route. Changing tabs also pauses the streamer.

### Two tiers of play

The infantry controller acts at 10 Hz through the usual game controls. The streamer strategy asks `POST /api/ai/streamer` for a goal, an optional waypoint, named sector or remembered place, and a caption about every ten seconds. Death, respawn, a sharp health loss, an elimination streak, exhausting ammunition, arriving in a district and round completion feed the shared HUD event detector or the menu hand-off. Major events can bring the next decision forward. Play requests are single-flight and spaced by at least three seconds. A failed re-ask keeps an active sector or remembered-place destination. Other strategy failures use the local planner. The pilot follows known waypoints and plays on foot. A round ending or a respawn choice returns control to the menu director.

The shared endpoint checks origin, validates public observations, admits calls against the same daily and rolling limits as commentary, and reports quota and usage. Menu turns send the declared choices, a short objective, sandbox balances and line history. Play turns send the HUD readout, pilot observation, events, session notes and optional game-canvas JPEG. The server constrains the decision schema to the current choices. Sector and remembered-place plans survive the ordinary 20-second expiry. Arrival, a replacement decision, death or leaving the district ends it. The pilot status names the destination while travelling.

The streamer's separate 20-entry notebook records sector visits, visible contacts and incoming fire, the killer and weapon or cause from its own death recap, used or visibly empty supply points, changes of allied control, and completed store transactions. Repeats move to the end with a count. Each play turn gives the age of the last occurrence. The notebook survives menus, pauses and district crossings and clears on stop or a new persona. Human commentary keeps its spoken-line memory. Silence can accompany a valid decision. A refusal without a decision fails the turn.

### Learning a district

A new streamer starts with the regular’s district brief. The session samples its sector once a second on the gameplay clock while it is alive and playing. Menus, deployment, pauses and time spent dead earn no presence. The smallest containing sector owns an overlap. Time between named sectors earns nothing.

| Familiarity | When it applies | What the streamer can recall |
| --- | --- | --- |
| Heard of | Starting level | The district brief. The local row has no fine detail or place IDs. |
| Been through | Two seconds of presence, or a fight, death or supply use in the sector | Named landmarks and fixtures, facility consoles and cabinets, food counters and vendors, range stock, landing ramps, usual vehicle spots, controls and exits where present. |
| Knows well | 150 seconds of accumulated presence and incident credit, or three qualifying visits | The obvious places plus authored cover, lookouts, lifts, ladders, ground approaches to elevated routes and road crossings between neighbouring sectors. |

A fight, death or supply use contributes eight seconds of incident credit. Five quiet seconds separate fights. Incoming fire, landed hits and shooting at a visible contact count. A visit qualifies after two seconds or one incident. Pausing in place preserves that visit. Returning after leaving the sector or respawning can start another. A promotion enters the ordinary cast event queue for the next turn.

The browser sends levels for the active district and IDs for the destination. The server checks sector IDs and levels, then renders the current sector, its bordering sectors and the destination sector. Rows share a budget of 1,100 characters, with at most 360 per sector. Only the walkable places printed with IDs are offered as choices. Place IDs remain stable across visits. Bearings refer to a nearby named landmark or to a side of the named sector.

The builder uses sector food anchors, landmark stamps, checkpoints and naval landings. The scene projection in `scripts/lib/cast-place-index.ts` supplies placed facilities, vendors, motor pools, range chests, arena cover, hardpoints, street furniture, stairs, lifts and named viewpoints. A road crossing requires a mapped navigation road that actually passes between bordering sectors. The projection excludes features in gaps. A sector can have no additional local detail even after repeated visits. Regenerate the projection with `node scripts/cast-map-index.mjs` after placement changes.

Facilities and supply types follow the current mode. Expedition food counters are possible pickup spots. Stock and seed-dependent crate contents come from the live game. The notebook retains exact empty-counter receipts for the session and labels a remembered counter the streamer emptied, even after its original pickup note rolls off. A reusable range chest stays available after use.

**Keep what it learns** starts off. Stop clears active learning. Turning the switch on saves the selected persona’s sector counters locally, on promotions, periodically during play and on hand-offs. The next opted-in start restores its levels from those counters. Each persona uses its own versioned `blockplay.streamer.learning.v1.<persona>` key, separate from both armory profiles. Unknown sectors and invalid entries are ignored. The panel shows the selected persona’s saved district and well-known sector counts. **Forget** clears that persona’s saved learning immediately. During play, the same controls are under **Usage**. Forget also clears active learning and cancels the current plan.

### Choosing what to play

Each menu request shuffles a copy of the declared actions to reduce first-option bias. The back button stays last where present. The visible menu, IDs, available actions and click handlers keep their usual order and behaviour.

The Single Player mode menu, the Training menu’s live-fire range choice, and the district or arena lists for Open World, Training, Team Deathmatch, Hardpoint and Free-for-all also show the streamer a short play history. It sees its two latest games and their reported results, the most-played option available here and up to three unplayed options plus the remaining count. The summary uses the last 20 games. Place pickers count starting districts across modes, and arena pickers count arena games across rulesets. Stores, lockers, landing zones and respawn screens only get the ordinary menu choices.

On each of those choice screens the browser also simulates an audience poll. It draws up to three distinct enabled destinations and assigns percentages totalling 100. A reread or district preview keeps the same poll. Navigation and disabled entries receive no votes. All enabled controls remain available to the model. The server validates the history, candidate IDs and shares and renders both pieces of advice in the existing menu call.

Tune the poll weights in `src/game/streamer-variety.ts`. An option with *n* plays has weight `BASE_WEIGHT + NOVELTY_BONUS / (1 + n)`. The defaults are 1 and 4, giving a new option weight 5 and a once-played option weight 3. Increase the bonus to favour novelty or increase the base to soften that preference. The last game’s option gets a further multiplier of `LAST_GAME_FACTOR`, initially 0.35. Raising it toward 1 makes immediate repeats more likely. With three candidates the leader gets 37–61%, leaving room for a close vote.

The **Chat poll · simulated** card shows the leader first. Each new poll holds that screen’s menu request for up to `POLL_VOTE_SECONDS` (5 by default). Click or tap a button, or press its number (1–3), to vote once. Voting leaves the streamer in control and sends the request immediately. If time runs out, the original chat shares go through. Rereading a picker or previewing another district keeps the same result and does not restart the clock. Stop and Escape still end the session.

A vote adds `VIEWER_VOTE_POINTS` (25 by default) to the chosen option, capped at 100%. The other options give up those points in proportion to their shares. The bars show the rounded percentages, totalling 100, and **Your vote** marks the viewer’s pick. The server names that pick separately from chat. The streamer can choose any enabled action.

After the streamer clicks, the card says **Went with your vote** or **Overruled your vote**. Without a viewer vote it keeps the existing chat verdict, including **Ignored the poll** for a choice outside the poll. Loading the previewed district counts as choosing it. The verdict stays for three seconds or until the next poll opens. The card moves clear of the caption, chip and cursor target.

Game history begins at deployment or play. It records start time, mode, starting district or arena, approximate gameplay seconds, and available results and scores. District crossings update the same expedition with its latest district and crossing count. Pausing or respawning keeps the same game. Session history clears on Stop. **Keep what it learns** saves up to 20 records under `blockplay.streamer.history.v1.<persona>`, separately from sector learning and both armory profiles. The count beside **Forget** covers the retained games. Forget clears the selected persona’s saved games and learning and clears both from an active session. The current forgotten game stays forgotten through its remaining HUD updates. Poll votes are transient.

### Declaring a control

Put `data-ai-screen` and `data-ai-title` on the solo screen. Give each eligible HTML button, internal link or disclosure summary a unique, stable `data-ai-action` and one of the kinds `navigate`, `select`, `buy`, `equip` or `start` in `data-ai-kind`. Supply an accessible name. Native disabled and ARIA selected/pressed states are read automatically. `data-ai-detail` can carry a short price, ownership or location note. For example:

```tsx
<button data-ai-action="enter-range" data-ai-kind="start" disabled={loading} onClick={enterRange}>
  Enter range
</button>
```

Controls must be inside the active solo route and visible foreground screen. A modal declares its own screen. Hidden panels, covered buttons, external links and undeclared controls cannot be activated. Keep profile administration, resets, multiplayer, debug tools and global settings outside the declared action set. A control's ordinary click handler remains responsible for purchases, route transitions and navigation guards.

Each menu turn exposes up to 40 choices. The cursor moves for half a second, or jumps with reduced motion. The actor rechecks the control and its price or state before clicking. The loop pauses between choices, stops on the third consecutive identical choice and caps each trip at 25 actions. Invalid decisions, service errors, exhausted quota and stalled menus end the menu session with a visible reason.

### Profile isolation

The game keeps the player's armory mounted while the sandbox has its own armory and game instance. A fresh sandbox starts with 1,600 credits, 300 tokens and issued gear. Purchases, rentals and play time, equipped items, consumables, XP and rewards persist under `blockplay.armory.v1.streamer`. Later streamer sessions reuse that balance. Every save callback retains its original storage key, including cleanup and page-exit callbacks. The active-session flag lives only in memory. Reopening the tab starts with the player's profile even if the previous tab closed during a sandbox purchase or match.

## Optional live voice

**Voice** starts off. Commentary and both streamer phases add `"spoken": true` to their existing request when Voice is on, the page is visible and an unmuted audio context is running. The request carries the usual game observation. The server chooses the persona’s voice and sends ElevenLabs the exact caption it just produced. Pilot planning keeps its existing protocol.

A voiced reply has content type `application/vnd.blockplay.cast+pcm` and `Cache-Control: no-store, no-transform`. The first four bytes are an unsigned big-endian byte count. Read exactly that many UTF-8 bytes as the JSON reply, including the line, any streamer decision, usage, cost when known, quota, voice status and `"pcm": "s16le;rate=24000;channels=1"`. All remaining bytes through EOF are signed 16-bit little-endian mono samples at 24 kHz. The server writes the header before requesting audio. The browser can display the caption and use the decision immediately, even when the provider fails and EOF follows the header.

An absent or false speech flag, an unavailable provider, insufficient character budget, an empty or refused line, and a model reply later than six seconds all produce ordinary JSON. A validation or admission failure also uses JSON. The six-second cutoff is shared with the commentary director. If the handler observes a disconnect during generation, it skips speech. During streaming it aborts the upstream fetch and cancels its body. Node listens for the HTTP response closing. The Worker passes the original Fetch request signal through the Node bridge and keeps the settlement alive with `waitUntil`.

| Server setting | Default or purpose |
| --- | --- |
| CAST_VOICE_PROVIDER | elevenlabs |
| CAST_VOICE_MODEL | eleven_flash_v2_5 |
| ELEVENLABS_API_KEY | Enables live voice on the server |
| ELEVENLABS_BASE_URL | Optional private API origin for a local stand-in. Defaults to https://api.elevenlabs.io. The adapter appends the versioned speech path. |
| CAST_VOICE_IDS | Optional JSON object mapping persona IDs to 20-character alphanumeric voice IDs. The seven built-in voices are in the provider registry. |
| VOICE_DAILY_CHARS_PER_IP | 4,000 characters per anonymous IP |
| VOICE_DAILY_CHARS_ANON_TOTAL | 8,000 characters across anonymous callers |
| VOICE_DAILY_CHARS_ADMIN | 20,000 characters across signed-in admins |

The same transaction that admits a model call reserves 240 characters, the maximum caption length, in the caller’s daily pool and, for anonymous callers, the shared pool. Signed-in admins have a separate pool. A full voice pool still admits an otherwise eligible model call and reports the reason in `voice`. The model call counts once and occupies one in-flight slot through the end of the response. The per-minute guard covers the entire request.

Node uses the in-memory store and the Worker uses the AI usage Durable Object. Both track settled daily totals and outstanding holds by lease expiry. Status and the combined header include outstanding holds in `voice.quota.used` and deduct them from `voice.remaining`. Release removes the hold and records the caption’s actual length if PCM was sent, or zero if no PCM was sent. A repeated release cannot double-charge. An abandoned hold expires after one minute. Daily pools reset at Singapore midnight. A provider credit or authorization refusal pauses speech across callers for ten minutes.

The browser cues speech after 250 ms of PCM arrives (`CAST_MIX.bufferLeadMs`), or at EOF for a shorter line. One AudioWorklet keeps a ring of source samples, carries a split sample’s low byte across reads, and keeps the interpolation phase across audio render blocks at the device rate. An underrun fades to silence and re-primes the lead. Two seconds of starvation (`CAST_MIX.stallMs`) ends the line. Browsers without a readable response body or usable worklet play the whole PCM response as one AudioBuffer. The game and menu use their own unlocked contexts. The worklet module loads on first voice use and the service worker runtime-caches the built asset.

Playback must start within `CAST_MIX.readyMs` of the caption. A line whose caption has expired or been superseded stays silent. The player buffers up to one waiting line while the current line finishes, cancels a replaced line, and signals idle after the final playback and a 350 ms breath. Switching Voice off while a model call is pending preserves its caption and decision.

### Checking the Worker

Run `pnpm build:cloudflare` and `pnpm test:cloudflare:voice`. The check starts the real Worker entry with a fresh local usage database and disposable loopback stand-ins configured through the server-only `OPENAI_BASE_URL` and `ELEVENLABS_BASE_URL`. The speech stand-in waits for the client to parse the JSON before sending any PCM, then waits for the client to read audio before sending the tail. The check compares the bytes, inspects settled usage, verifies silent and slow turns, serves the worklet, and reports whether a client disconnect reaches the provider. An in-process `workerd` run with service bindings observed cancellation during PCM and skipped speech after a disconnect during generation. Browser-to-Worker disconnect propagation also depends on the HTTP front end. Earlier Wrangler runs did not reliably deliver that signal.

### Mixing and tuning

Edit `CAST_MIX` in `src/lib/cast-mix.ts` to tune playback gain, compressor, duck levels, lead, fade, recovery and breath. Speech goes through the Voice slider. A 160 ms lead gives a playing Encik clip 150 ms to fade out and lets music and effects duck over 120 ms. During speech, music plays at one third of its selected level and the effects bus, including the combat limiter, drops 4 dB. Both recover to the current slider values over 400 ms. New Encik recordings stay silent during the line. Their subtitles and comms entries continue normally.
