# Sound effects

Gunshots, bullet impacts, footsteps and reload handling play recorded takes generated with
ElevenLabs' text-to-sound-effects API. The synthesised sounds they replaced
remain as the fallback while the files load, or if they never do.

## In game

- `src/game/sfx-bank.ts` fetches and decodes every group in
  `src/audio/sfx/manifest.json` once per `AudioContext`, and `pick(group)`
  rotates through a group's takes without repeating the last one. `get(group,
  index)` returns a stable reference take for gunfire.
- `src/game/gunshot-audio.ts` keeps the existing shot model (`gunshotTone`):
  calibre picks the take (9 mm pistol, 5.56 rifle, 7.62 GPMG, 12.7 HMG,
  suppressed), a distant take crossfades in from 30 m to 220 m, and a lowpass
  closes with range. Takes are loudness-matched, so `sampleGain` restores each
  gun's weight; `SAMPLE_GAIN` sits recorded shots a few dB above the synthesis
  they replaced. Echo slaps and the synthesised layers play only on fallback.
  Each calibre now uses one reference report rather than alternating unrelated
  generated takes: rifle v3-4, pistol v3-2, GPMG v2-1, HMG v2-2, suppressed v3-1,
  and the first published take of each distant group. Pitch varies only ±0.4%.
  When the same shooter fires again, the previous report fades to 18% over
  12 ms, then to silence by 60 ms; the final shot retains its natural tail.
  Actor IDs keep simultaneous shooters independent, including queued snapshot
  shots inserted out of order. The bus uses milder saturation and a compressor
  with a 55 ms release, so successive attacks avoid sustained gain reduction.
  Up to 48 gunshot voices are retained, with priority for immediate player fire.
  Pause, reset, master mute and disposal cancel playing and queued shots.
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

## Store UI

The store keeps the softened glass hover and selection sounds for tabs, platform
switches, item previews, navigation and guide controls. ElevenLabs v3 recordings
provide action feedback, with longer equip sequences selected from the equipment:

| Action | Sound |
| --- | --- |
| Hover or visible keyboard focus | Quiet softened glass tick |
| Browse, preview, navigate, advance/close the guide | Softened glass selection |
| Equip a gun or assign it to a carry slot | Magazine/feed insertion, seating, charging and release; roughly 0.9–1.6 s, matched to the weapon's feed and action |
| Equip food | Paper wrapper and takeaway-container handling; about 1.3 s |
| Equip medical supplies | Medical pouch, sterile wrapper and fastening; about 1.3 s |
| Equip grenades | Metal lever/ring handling and a nylon pouch closure; about 0.9 s |
| Equip other gear/cosmetics or empty a carry slot | Small warm mechanical latch |
| Successful unlock, supply purchase, level skip or demo token addition | Restrained rising two-note glass confirmation |
| Rejected store action | Quiet low wooden knock |

`src/lib/store-audio.ts` decorates only the store UI's callbacks. `useArmory`
returns whether a purchase/equip operation changed the profile; the corresponding
cue follows that result. Controls marked `data-store-outcome` skip the generic
selection cue, so purchases do not play two confirmations. Both purchase buttons,
carry controls and the portalled store guide are covered. Disabled buttons stay
silent; model dragging and chart inspection do not trigger UI sounds.

The store preloads 17 clips on entry, reusing the two menu assets. Hover is
limited to one tick per 80 ms and suppressed during action feedback; voices
replace each other rather than stacking. Cold or unavailable audio is dropped,
autoplay denial is caught, hiding the page stops playback, and exiting stops
hover while allowing a short action tail to finish. Nothing is triggered by
in-game/vendor callbacks outside this UI.

`public/audio/store/` contains the mono MP3s. The manifest in
`src/audio/store/manifest.json` records source/output hashes, durations and the
offline pitch/treble processing. The three half-second generations cost 15
credits in total; the private API key is not shipped. Raw receipts and the
navigation/equip/purchase/rejection preview are in `.cache/store-sfx/`.

`scripts/store-equip-sfx.mjs` lists its bounded batch by default. Run it with
`--generate` using the private environment to generate/reuse three 1.4 s
food/medical/grenade recordings (42 credits total), or `--publish` to assemble
the new equip clips offline. Nine gun sequences reuse the already generated,
weapon-specific reload actions at their natural pitch and speed, with gaps
between insertion, seating, charging and release. Source hashes and onset times
are preserved. Box-fed Ultimax uses rifle magazines and its own charging action;
drum and belt variants follow their actual feed. Gun assembly uses no new API
credits. The four-category preview and source receipts are in
`.cache/store-equip/`. Selection does not start a gameplay reload or spend ammo.

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

## Burst verification

`node scripts/gunshot-burst-smoke.mjs` requires Vite and an isolated Chrome with
autoplay enabled (defaults: ports 5194 and 9254; override `FPS_APP_ORIGIN` and
`FPS_CHROME_ORIGIN`). It verifies live automatic-fire take consistency and mute,
then renders rifle, Ultimax, MG4, pistol, GPMG, HMG, suppressed and distant bursts
through real Web Audio. It checks attack-level stability, clipping and expiry,
and saves rifle/MG4 WAV previews plus measurements in `.cache/gunshot-bursts/`.
An optional `GUNSHOT_BASELINE_MODULE` browser module path adds before/after renders.
No API generations are required for these mixing changes or checks.
