# AI commentary

Open **AI commentary** on the FPS start or pause card. Pick a commentator, choose the language and screenshot settings, then enable live commentary. The cast works in training, arenas and expeditions. The latest line appears in the subtitle area for six seconds. The Cast channel in the comms log retains the speaker and line. Settings persist in browser storage. Opening the panel checks availability and quota. With commentary off and the panel closed, the browser sends no cast requests.

## Local setup

Put the selected provider key in the private server environment. Start `pnpm server` and `pnpm dev` in separate terminals and open the Vite origin (normally localhost:5173). If Vite uses a different port, include its exact origin in `ADVENTURE_ALLOWED_ORIGINS`. Restart the backend after changing settings. A static build needs a same-origin backend for commentary.

| Private server setting | Default or purpose |
| --- | --- |
| CAST_PROVIDER / CAST_MODEL | anthropic / claude-sonnet-5-5 |
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

Register a streamer route in `server/ai-endpoints.ts`. Its prepare function validates the observation and returns a function for the model call. The shared handler handles identity, atomic admission, quota reporting and lease release. The existing pilot-plan endpoint uses that budget too and keeps its original response body with quota in the `X-AI-Quota` header. Use `requestCast` in `src/lib/cast-client.ts` for the shared quota, cost and retry handling. A streamer loop can reuse the snapshot, frame capture and the authored streamer voices while sending control decisions through the pilot contract. Commentary has no engine action channel.
