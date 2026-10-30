# Sound effects

Gunshots, footsteps and reload handling play recorded takes generated with
ElevenLabs' text-to-sound-effects API. The synthesised sounds they replaced
remain as the fallback while the files load, or if they never do.

## In game

- `src/game/sfx-bank.ts` fetches and decodes every group in
  `src/audio/sfx/manifest.json` once per `AudioContext`, and `pick(group)`
  rotates through a group's takes without repeating the last one.
- `src/game/gunshot-audio.ts` keeps the existing shot model (`gunshotTone`):
  calibre picks the take (9 mm pistol, 5.56 rifle, 7.62 GPMG, 12.7 HMG,
  suppressed), a distant take crossfades in from 30 m to 220 m, and a lowpass
  closes with range. Takes are loudness-matched, so `sampleGain` restores each
  gun's weight; `SAMPLE_GAIN` sits recorded shots a few dB above the synthesis
  they replaced. Echo slaps and the synthesised layers play only on fallback.
- `src/game/fps-engine.ts` plays `walk`/`run` footfalls (alternating feet,
  slight pitch and level variation) and the `MAG OUT`, `MAG IN`, `SEAT MAG`,
  `BOLT BACK` and `CHAMBER` reload stages.

Files are served from `public/audio/sfx/`, which the service worker caches at
runtime like the Encik recordings.

## Generating and publishing

- `pnpm sfx:batch` prints every take without sending requests.
  `pnpm sfx:batch --generate [sound ids…]` generates missing takes with the
  private `ELEVENLABS_API_KEY` (the key needs the Sound Effects permission).
  Completed takes are cached in `.cache/sfx-batch/` and reused; a failed or
  ambiguous attempt is never retried automatically. Credits are read once
  before and after a run, because the subscription endpoint rate-limits.
- The first batch (58 takes, 2026-10-30, Starter plan) cost about 10 credits
  per second of audio. The newer `eleven_text_to_sound_v3` model gave far
  sharper gunshots than v2, whose pistol and suppressed takes were near
  silent.
- `pnpm sfx:publish` is free and offline. `PICKS` in `scripts/sfx-publish.mjs`
  chooses the takes for each group. Each take starts 1 ms before its main
  transient (the first sample at 30% of peak), so a quiet lead-in never makes a
  shot land late. Takes are loudness-matched (loudest 50 ms at -12 dBFS RMS,
  peaks capped) and encoded as 96 kbps mono MP3s. Publishing warns about any
  non-distant take that peaks more than 40 ms in. Shots peaking 30 ms or more
  after their onset were heard as late and are left out of `PICKS`.
  Footstep sequences are sliced into single footfalls, keeping the six most
  even per take. The manifest and public files are rewritten, and
  `.cache/sfx-batch/audition.html` lists every raw take next to what the game
  plays. `pnpm sfx:publish --analyse` prints level, crest and brightness per
  take.
