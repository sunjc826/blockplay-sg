# Sound effects

Gunshots, bullet impacts, footsteps and reload handling play recorded takes generated with
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
- `src/game/impact-audio.ts` plays two takes each for concrete, metal, wood,
  glass, foliage, dirt, flesh and water. Impacts share the visual hit's material
  classification; practice targets ring as metal. Cosmetic arena body hits
  stay silent until a confirmed wound arrives, preventing duplicate body sounds.
  Hits pan from their actual position, soften with distance and arrive after
  sound travel, fading out by 140 m. Energy changes level and pitch. At most
  24 impact voices can overlap; pause, reset, master mute and disposal cancel
  queued sounds. Material-specific synthesis covers missing/unloaded clips.

Files are served from `public/audio/sfx/`, which the service worker caches at
runtime like the Encik recordings.

## Main menu

The owner chose the Glass hover/click pair from five ElevenLabs v3 auditions,
then requested a less shrill version. `public/audio/menu/` holds that softened
pair; `src/audio/menu/manifest.json` records source/output hashes and processing.
Pitch is lowered about three semitones, the treble shelf cuts 9 dB above
2.6 kHz, a 4.8 kHz lowpass softens the top, and overall gain is reduced by 20%.
Hover stays quieter than confirmation. This processing is offline and used no
additional API credits; the ten original auditions cost 50 credits total.

`src/lib/menu-audio.ts` preloads two local clips and reuses them across menu
visits. Only `MainMenu` in `GameMenu.tsx` triggers them: mouse entry or visible
keyboard focus plays hover; accepted selections play confirmation, including
touch taps. Unloaded hovers are dropped, pointer sweeps are limited to one tick
per 75 ms, and confirmation suppresses hover. Leaving the menu cancels hover
while allowing the short click to finish over the transition. Browser autoplay
restrictions can keep hover silent until the first click or keypress. Audio
failure never delays navigation. The private API key is never used in gameplay.

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
- Pass group IDs to `pnpm sfx:publish` to publish only those groups, preserving
  the existing clips and manifest entries (for example `pnpm sfx:publish
  impact-metal impact-concrete`). This requires an existing manifest.
- The impact batch adds 16 v2 takes of 0.7 seconds each. Generation receipts
  and raw audio stay in the ignored cache; no API key ships with the soundpack.
  Impact clips trim to 1 ms before the first sample at 90% of peak, removing
  soft preliminary taps before the main strike.
