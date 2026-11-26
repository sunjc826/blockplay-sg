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

The commentary request includes the selected voice, clean-language setting, mode, district ID, recent visible game events, current vitals, equipment, ammunition, stance, vehicle, score, streak, session time and visible contact count when available. Up to 30 previously spoken lines travel with each request. The optional JPEG comes directly from the rendered game canvas. It excludes browser chrome, DOM overlays and the admin input. Screenshots default on and have their own switch. The server validates the shape and sizes, looks up the district locally and sends the four stable instruction blocks separately from the changing observation. Replies only supply caption text or silence.

## Provider and streamer extension points

`server/llm/types.ts` defines the completion contract. Implement a provider factory in that directory and add its key name, default model, pilot token budget and factory to the registry in `index.ts`. Both adapters accept an injected fetch. Input token totals include cached input. The optional price estimate discounts cache reads.

`src/game/ai-cast.ts` schedules captions using an injected clock and request function. It batches minor events for 1.5 seconds, gives major events priority, and asks after 15 quiet seconds. One call can run at a time. The director drops replies older than six seconds and invalidates pending replies when play resets. District travel retains line memory. `castSnapshot` selects public HUD fields and `captureFrame` copies the next rendered view on demand.

## Streamer mode

Open **Streamer mode** on the main menu or in a solo FPS briefing or pause menu. Choose Pro gamer, Rager or Stand-up comedian, set clean language and decide whether to share game screenshots. Check the daily allowance and press **Start streamer**. Starting from an existing run opens a fresh sandbox session. The commentator's saved setting takes effect again when streaming ends.

The persona chooses solo activities, shops, picks a district and configures deployment before playing. Its latest line appears on the menu or in the game's subtitle area. Game lines also enter the Cast comms channel with the speaker's name. The last 30 lines follow the session through store visits, matches and district crossings. Stopping or starting a new persona clears them.

**Stop** and Escape end the session immediately. Human pointer or keyboard input pauses it. **Resume** continues the sandbox run. **Take control** ends the sandbox and returns the player's own profile to the current route. Changing tabs also pauses the streamer.

### Two tiers of play

The infantry controller acts at 10 Hz through the usual game controls. The streamer strategy asks `POST /api/ai/streamer` for a goal, an optional known waypoint and a caption about every ten seconds. Death, respawn, a sharp health loss, an elimination streak, exhausting ammunition, arriving in a district and round completion feed the shared HUD event detector or the menu hand-off. Major events can bring the next decision forward. Play requests are single-flight and spaced by at least three seconds. Ordinary strategy failures use the local planner. The pilot follows known waypoints and plays on foot. A round ending or a respawn choice returns control to the menu director.

The shared endpoint checks origin, validates public observations, admits calls against the same daily and rolling limits as commentary, and reports quota and usage. Menu turns send the declared choices, a short objective, sandbox balances and line history. Play turns send the whitelisted pilot observation, events and an optional game-canvas JPEG. The server builds the authored frame, voice, language and place-card blocks and constrains the decision schema to the current choices. Silence can accompany a valid decision. A refusal without a decision fails the turn.

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
