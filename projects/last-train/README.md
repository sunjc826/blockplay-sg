# ElevenLabs hackathon — exploratory workspace

**The actual hackathon project has not been chosen. Last Train is only an exploratory demo created by an assistant so the owner could review something from their phone. It is not the owner's selected product, approved direction, or committed hackathon submission.**

The owner may choose a completely different idea. Preserve Last Train as a reference unless asked otherwise. Future agents should first ask what the owner wants to build; do not infer a roadmap from the existing story, branding, pitch, assets, or deployment. Setup and inspection are fine, but do not extend Last Train, spend audio credits, redesign the project, or deploy a new concept without direction.

Starter prompts: [Codex on this Mac](prompts/codex.txt) · [pi.dev on another machine](prompts/pi-dev.txt).

## Existing demo: Last Train

A phone-first branching audio mystery demonstrating ElevenLabs narration, generated ambience, and Cloudflare hosting. Nine narrated scenes and four endings. These demonstrate a possible format, not a product commitment.

**[Play](https://last-train-elevenlabs.sunjc826.workers.dev)** · **[Pitch and demo guide](https://last-train-elevenlabs.sunjc826.workers.dev/review)**

## Start on any development machine

Requires Node.js 22.12+, pnpm 11.22.0, and Python 3. No API key is needed to run, test, or build the demo; all audio is included.

```sh
git clone https://github.com/sunjc826/elevenlabs-hackathon.git
cd elevenlabs-hackathon
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Open http://127.0.0.1:5188. On a remote development host, use its authenticated port preview or SSH forwarding for port 5188. The dev server binds to loopback by default. Serve over HTTP rather than opening index.html directly; the app uses ES modules.

## Review the exploratory demo

Tap **Catch the last train**. Try **Step inside → Take the umbrella → Visit that rainy day**. Other routes reveal different endings. `/review.html` contains an illustrative demo pitch, a playback walkthrough, architecture, and scope. The pitch is an example for Last Train, not an approved hackathon proposal. `pnpm build` also creates the downloadable review kit and copies it into `dist/`.

## Source map

- `public/story.js`: authored scenes, choices, endings and caption text.
- `public/app.js`: player, scene transitions, local ending collection and sharing.
- `public/style.css`, `public/index.html`, `public/poster.svg`: responsive interface and original vector artwork.
- `public/audio/`: completed MP3 pack and provenance/checksum manifest.
- `scripts/`: build, review packaging and bounded audio generation.
- `tests/`: story integrity, audio integrity and paid-request retry protection.

## Development agreements

This is the standalone `sunjc826/elevenlabs-hackathon` project. It originally lived in `astra-hackathon/projects/last-train`; it now has its own dependencies and generation helper and requires no parent repository files.

Preserve existing changes. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before shipping. Review mobile layout and playback in a real browser when available; report unavailable verification honestly. Do not commit `.env` files, credentials, private receipts, caches, dependencies or build output. Do not automatically regenerate paid audio. Coordinate deployments so two development machines do not overwrite each other's live work.

When working in the original nested Mac folder, Git still belongs to the Astra repository. Do not change its remote or push its game history to this standalone repository. Use a separate clone for GitHub synchronization. The original parent's local AGENTS.md remains applicable there and is excluded from exports.

## Cloudflare

`wrangler.jsonc` targets the existing `last-train-elevenlabs` Worker, separate from Blockplay SG. This project has no GitHub-triggered deployment workflow.

```sh
# Only when deployment is intended and credentials are available:
pnpm exec wrangler login
pnpm test && pnpm typecheck
pnpm deploy:cloudflare
```

Alternatively use a properly scoped `CLOUDFLARE_API_TOKEN` from the private process environment. The deployment command does not load .env files automatically. On another account, explicitly select a different Worker/account before deployment. Never claim a release is live before checking the deployment result and URL.

## Audio

Narration uses the ElevenLabs premade George voice with `eleven_multilingual_v2`; station ambience uses `eleven_text_to_sound_v2`. This is authored fiction with pre-generated narration, not a live conversational agent. There is no microphone input or runtime paid API.

`pnpm audio:plan` is a no-network dry run. `pnpm audio:generate` first verifies and reuses the shipped pack, so a fresh clone does not spend credits recreating it. New generation requires a private `ELEVENLABS_API_KEY`, explicit intent, and enough included credits. `.env.example` documents the optional variable names. The once-only helper caches requests under ignored `.cache/audio-v1/`, refuses ambiguous retries and checks cached audio hashes. Retain this cache when moving active generation work between machines through a private channel; never infer that a timed-out request was free.

The generation script uses Python urllib for this host's proxy compatibility; credentials go to the child over stdin, never command arguments or public files. Original batch: nine narration clips and one eight-second ambience clip. Response cost headers total 861 credits; subscription count was 12,969 / 40,000 before and immediately after generation, a zero observed meter delta. Private receipts are not included in Git.

## Review kit

After `pnpm build`, `public/last-train-review.zip` contains web source, pitch, poster and audio. Unzip and serve `site` using `python3 -m http.server 5188 --directory site`. Google Fonts is optional, with system-font fallbacks. The hosted download button works on the deployed site; it is not a nested copy of the ZIP inside the downloaded kit.

## Verification and scope

Checks cover every story branch, all four endings, text/audio parity, audio hashes, and safe paid-request caching. Strict TypeScript checks the browser JavaScript. The original live release's 18 files were byte-verified over HTTPS and all ten MP3 durations validated. Visual browser and physical-phone playback QA were not completed because the Mac was locked. Keep that limitation visible until actual browser testing is done.

The Singapore station is fictionalized. There are no accounts, analytics, geolocation or travel/navigation claims. Ending collection is stored only in the current browser.
