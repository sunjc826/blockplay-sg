# Last Train

A phone-first branching audio mystery made for an ElevenLabs hackathon. Nine narrated scenes, four endings, one empty station after midnight.

## Review

Open the deployed site and tap **Catch the last train**. The review guide at `/review.html` contains the pitch, demo sequence, technical scope, and downloadable kit. Try **Step inside → Take the umbrella → Visit that rainy day**. Other routes reveal different endings.

## Development in this repository

From `projects/last-train`:

```sh
pnpm dev
pnpm test
pnpm typecheck
pnpm deploy:cloudflare
```

The parent repository supplies TypeScript and Wrangler. The deploy script builds only this subproject and publishes the separate `last-train-elevenlabs` Worker; it does not modify or deploy Blockplay SG. No GitHub push is needed.

## Run the downloaded review kit

Unzip, then serve the `site` folder with `python3 -m http.server 5188 --directory site`. Open `http://localhost:5188`. HTTP serving is required for ES modules; opening index.html directly as a file is insufficient. All application source is in `site/app.js`, `site/story.js`, `site/style.css`, and `site/index.html`. Audio and its provenance manifest are included. Google Fonts is optional; system fonts are the fallback.

## Audio

The script `scripts/generate-audio.mjs` uses the parent repository's `once` helper. `pnpm audio:generate` explicitly generates or reuses a bounded pack. Private `ELEVENLABS_API_KEY` is required; no key is included in the build. Completed audio is reused, unresolved attempts block retry, and before/after usage readings are retained under ignored `.cache/audio-v1/`. A Python urllib adapter works with the host's proxy and passes credentials only on stdin.

Narration: ElevenLabs premade George voice, `eleven_multilingual_v2`. Atmosphere: `eleven_text_to_sound_v2`. Nine narration requests and one eight-second SFX request; response cost headers total 861 credits. Subscription count was 12,969 / 40,000 before and immediately after the batch, a zero observed meter delta. Raw private receipts stay local.

## Product scope

Authored branching fiction, pre-generated narration, captions, optional ambience, seeking, local ending collection, and native share / clipboard fallback. No live conversational AI, microphone input, runtime paid API, analytics, or account system. This is fictionalized Singapore, not navigation or transport information.

## Validation

`pnpm test` validates reachability, no story cycles, all four endings, narration text parity, and MP3 integrity. `pnpm typecheck` checks browser JavaScript under strict TypeScript. The live release is checked over HTTPS against local file hashes. Visual browser and physical phone playback checks remain pending: the development Mac was locked and no browser surface was available.
