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
| AI_ADMIN_TOKEN | Optional admin passphrase and cookie signing secret |
| AI_DAILY_CALLS_PER_IP | 1000 |
| AI_DAILY_CALLS_ANON_TOTAL | 10000 across all anonymous callers |
| AI_DAILY_CALLS_ADMIN | 5000 across signed-in admins |

The status panel shows the caller's daily allowance and reset time in the player's local clock. The day ends at midnight in Singapore. The server checks the IP and global anonymous budgets together. A signed-in admin uses the shared admin allowance. Each identity can start 20 calls per rolling minute and hold two active requests. Admission happens after input and credential checks. An accepted call consumes one slot even if the provider fails or the caption arrives too late to display. The cost display estimates USD from token usage for known Claude models. Other models display tokens.

Open **Admin sign-in** in the panel and enter the private passphrase. The server compares fixed-length digests, limits failed sign-ins to five per IP per rolling hour and issues a signed HttpOnly cookie for 30 days. The cookie is SameSite=Strict and Secure except on loopback. Sign out to clear it in this browser. Changing the secret invalidates all sessions.

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

**Stop** and Escape end the session immediately. Human pointer or keyboard input pauses it. **Resume** continues the sandbox run. **Take control** ends the sandbox and returns the player's own profile to the current route. Changing tabs also pauses the streamer.

### Two tiers of play

The infantry controller acts at 10 Hz through the usual game controls. The streamer strategy asks `POST /api/ai/streamer` for a goal, an optional known waypoint or named sector, and a caption about every ten seconds. Death, respawn, a sharp health loss, an elimination streak, exhausting ammunition, arriving in a district and round completion feed the shared HUD event detector or the menu hand-off. Major events can bring the next decision forward. Play requests are single-flight and spaced by at least three seconds. A failed re-ask keeps an active sector destination. Other strategy failures use the local planner. The pilot follows known waypoints and plays on foot. A round ending or a respawn choice returns control to the menu director.

The shared endpoint checks origin, validates public observations, admits calls against the same daily and rolling limits as commentary, and reports quota and usage. Menu turns send the declared choices, a short objective, sandbox balances and line history. Play turns send the HUD readout, pilot observation, events, session notes and optional game-canvas JPEG. The server constrains the decision schema to the current choices. A sector plan survives the ordinary 20-second expiry. Arrival, a replacement decision, death or leaving the district ends it. The pilot status names the destination while travelling.

The streamer's separate 20-entry notebook records sector visits, visible contacts and incoming fire, the killer and weapon or cause from its own death recap, used or visibly empty supply points, changes of allied control, and completed store transactions. Repeats move to the end with a count. Each play turn gives the age of the last occurrence. The notebook survives menus, pauses and district crossings and clears on stop or a new persona. Human commentary keeps its spoken-line memory. Silence can accompany a valid decision. A refusal without a decision fails the turn.

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

**Voice** starts off. Each cast panel saves its own preference. Turning it on sends only the server-generated line to the voice provider. Captions appear immediately. If audio takes more than 2.5 seconds to prepare, the player keeps the caption and drops the audio. The director waits for playback and a 350 ms breath before requesting another line. Pause, mute, taking control, hiding the tab and leaving play cancel pending or playing speech.

The private server adapter lives in `server/tts/`. Its injected fetch makes a single streaming MP3 request and buffers the short reply for both Node and the Worker. A provider implements `Speak` and registers its factory, credential name and default model in `index.ts`.

| Server setting | Default or purpose |
| --- | --- |
| CAST_VOICE_PROVIDER | elevenlabs |
| CAST_VOICE_MODEL | eleven_flash_v2_5 |
| ELEVENLABS_API_KEY | Enables live voice on the server |
| CAST_VOICE_IDS | Optional JSON object mapping persona IDs to 20-character alphanumeric voice IDs. The seven built-in voices are in the provider registry. |
| VOICE_DAILY_CHARS_PER_IP | 4,000 characters per anonymous IP |
| VOICE_DAILY_CHARS_ANON_TOTAL | 8,000 characters across anonymous callers |
| VOICE_DAILY_CHARS_ADMIN | 20,000 characters across signed-in admins |

A nonempty commentary or streamer response can include a two-minute ticket. Its HMAC covers the exact line, persona, expiry and a unique nonce, using a signing key derived from the private provider credential. The browser redeems it once at `POST /api/ai/voice`. Admission atomically marks the ticket used and charges the line length before contacting the provider. An ambiguous failure still consumes that allowance. Model-call counters are independent. Node uses the in-memory store and the Worker uses the shared AI usage Durable Object. Both reset daily totals at Singapore midnight. An upstream credit or authorization refusal pauses speech for ten minutes across callers. Captions and game decisions continue.

Status and cast JSON responses include `voice.available`, the caller’s `voice.quota` (used, limit, resetsAt), and remaining characters after the shared cap. Successful audio carries the same voice accounting in the `X-Cast-Voice` header. The response is marked no-store and the service worker bypasses the API.

At the owner's stated Flash rate of half a credit per character, a 110-character line costs about 55 credits. A 40,000-credit month covers about 727 such lines. The estimated 22,000 credits remaining cover about 400. The daily character limits control game usage independently of the provider’s monthly balance.

### Mixing and tuning

Edit `CAST_MIX` in `src/lib/cast-mix.ts` to tune playback gain, compressor, duck levels, lead, fade, recovery and breath. Speech goes through the Voice slider. A 160 ms lead gives a playing Encik clip 150 ms to fade out and lets music and effects duck over 120 ms. During speech, music plays at one third of its selected level and the effects bus, including the combat limiter, drops 4 dB. Both recover to the current slider values over 400 ms. New Encik recordings stay silent during the line. Their subtitles and comms entries continue normally.
