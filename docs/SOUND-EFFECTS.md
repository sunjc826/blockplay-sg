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
  The impact mix keeps its close-range level through a 24 m reference distance
  before inverse-distance attenuation, alongside the 140 m fade. This lifts
  hits at 25–80 m by about 14 dB over the original mix, so their attacks remain
  distinct under gunfire. `scripts/impact-audio-smoke.mjs` renders every take at
  3, 25, 50 and 80 m against an automatic rifle burst to check the mix as well
  as playback, panning and cleanup. Existing ElevenLabs recordings are reused.

Files are served from `public/audio/sfx/`, which the service worker caches at
runtime like the Encik recordings.

## Effects and voice volume

Settings has separate Sound effects and Voice sliders, both defaulting to 100%, the
original mix. Voice covers the Encik's radio and the AI guide's replies, and
Sound effects covers everything else except music: gunfire, footsteps, vehicles,
ambience and the menu and store sounds. The Encik's in-game on/off button remains.

Both come from `createVolumeSetting` in `src/lib/volume-setting.ts`. `effectsOutput(context)` gives each `AudioContext` one gain node, after the combat
limiter, and `voiceOutput(context)` a second for speech. New sounds connect to one
of them, never to `context.destination`, and a test fails if one connects directly. Menu and store
clips are `HTMLAudioElement`s, so they multiply their own level by the setting when
played, and skip playing at 0 because iOS Safari ignores an element's volume. iOS
therefore only gets on or off for those clips.

## Main menu

The owner chose the Glass hover/click pair from five ElevenLabs v3 auditions,
then requested a less shrill version. `public/audio/menu/` holds that softened
pair; `src/audio/menu/manifest.json` records source/output hashes and processing.
Pitch is lowered about three semitones, the treble shelf cuts 9 dB above
2.6 kHz, a 4.8 kHz lowpass softens the top, and overall gain is reduced by 20%.
Hover stays quieter than confirmation. This processing is offline and used no
additional API credits; the ten original auditions cost 50 credits total.

`src/lib/menu-audio.ts` preloads two local clips and reuses them across menu
visits. `MainMenu` in `GameMenu.tsx` triggers them like this (other plain screens use `plainScreenSounds`): mouse entry or visible
keyboard focus plays hover; accepted selections play confirmation, including
touch taps. Unloaded hovers are dropped, pointer sweeps are limited to one tick
per 75 ms, and confirmation suppresses hover. Leaving the menu cancels hover
while allowing the short click to finish over the transition. Browser autoplay
restrictions can keep hover silent until the first click or keypress. Audio
failure never delays navigation. The private API key is never used in gameplay.

### Music

`src/lib/music.ts` plays ElevenLabs Music v2.5 tracks in a 2000s action shooter
style, all 128 BPM, through Web Audio so the loops have no gap. Each screen asks
for a cue, and a change of cue crossfades over 0.5 s:

| Where | Track |
| --- | --- |
| Menu, Inventory, Settings, Store, Multiplayer lobbies | `menu`: Hybrid Ops |
| Map select and the loading screen after it | `map` |
| Open World landing zone choice | `spawn` |
| First descent in Open World | `descent`, a one-shot cut so its impact lands with the camera at 3 s |
| Arena match end | `win` or `lose`, a one-shot. A draw has none |

Combat, the tutorial, pause menus, the respawn map and the death recap have no
music, so footsteps and callouts stay readable. Going quiet drops the decoded
tracks (about 20 MB per loop) rather than holding them under a 3D game. Music
suspends while the page is hidden, stays silent if a file cannot load, and
follows the game's mute button in play. The Music slider in Settings defaults to
40%, because the tracks' average level would otherwise cover the quiet glass
sounds.

Browsers hold sound until a gesture, so a page that has had none opens on a
"press any key" title screen (`src/lib/title-screen.ts`, "tap to start" on touch).
Later visits to the menu and direct links to other screens skip it. Nothing is
fetched until that first gesture.

`node --experimental-strip-types --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/music-menu.mjs`
lists the auditions; `--generate` needs an API key with the `music_generation`
permission and spends the plan's monthly music minutes (about 750 credits a
minute on Starter). `--publish` is free and offline, and `chosen` in that script
picks the take for each cue. A loop is cut on the bar line at 32 bars, because the
takes do not repeat literally and a long crossfade would smear the drums. It
folds the last 29 ms over the start and repeats 0.25 s of the loop on each side
of the file, so a decoder's start offset cannot open a gap. `--publish` also
writes `.cache/music-menu/<cue>-loop-seam-preview.mp3`, ten seconds either side
of each cut.

Rights follow [ElevenLabs' Music Terms](https://elevenlabs.io/music-terms), not
the Sound Effects terms: every plan short of Enterprise Music excludes Studio
Games, which a game only becomes when it is monetised and outside the Indie Game
revenue limits. Starter is for individual use and excludes music streaming
services, and no plan short of Enterprise allows offering the tracks for others
to reuse. Recheck this before adding monetisation or an open-source licence.

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

## Grenade and plate handling

`scripts/hands-sfx.mjs` holds a bounded batch of ElevenLabs v3 recordings for the
hands, published to `public/audio/hands/` and timed to their animations. Takes start
1 ms before their attack and play at natural speed.

| Beat | Group | When |
| --- | --- | --- |
| Grenade comes up | `hands-grenade-draw` | Readying it |
| Pin out | `hands-grenade-pin` | 0.1 s on the fuse clock, if the item has a ring |
| Arm swings | `hands-grenade-throw` | Start of the swing |
| Lever flies | `hands-grenade-spoon` | The release, if the item has a lever |
| Plate out of the pouch | `hands-plate-draw` | Start of the use |
| Into the carrier | `hands-plate-feed` | 47% of the use |
| Seated | `hands-plate-seat` | The commit point, with the view's hit |
| Palm on the panel, twice | `hands-plate-pat` | 80% and 84% |

`src/game/hands-audio.ts` holds the plate's timeline and the mix level, which sits
these with the reload handling and the seat a little above it. If a hitch passes
several plate cues in one step, only the latest plays. The old synthesised clack
remains the fallback at the commit point until the recordings load. Run the script
with `--generate` for the cached once-only requests and `--publish` to prepare the
clips offline. Two takes came back near silent and are listed as rejected there.

## Vehicles, weather, ambience and small handling

`scripts/world-sfx.mjs` holds these ElevenLabs v3 recordings, published to
`public/audio/world/`. Loops are folded over their own tail and padded either side, so an
MP3 decoder's start offset cannot open a gap; `createWorldLoops` loops inside the padding and
fades each voice to a target every frame. `worldLoopTargets` decides those targets from game
state, so all the mixing rules are in one tested function. The batch cost 940 credits on
2026-11-05, with near-silent takes rejected as usual.

| What | Group | Rule |
| --- | --- | --- |
| Your car or helicopter | `world-car-loop`, `world-heli-loop` | The car revs with speed. The old synth tone stays as the fallback until these load |
| A transport nearby | Same, plus `world-boat-loop` | By its kind and distance, replacing the synth tone once loaded |
| Doors, seats, crashes | `world-vehicle-door`, `world-seat`, `world-vehicle-crash` | A crash is 5 m/s lost in a frame |
| Dragon boat | `world-dragon-drum`, `world-paddle` | Strokes quicken with speed |
| Rain, wind | `world-rain-loop`, `world-wind-loop` | Follow the weather; quieter under cover or in a cab |
| Thunder | `world-thunder` | 1 to 5 s after each lightning flash in a thunderstorm |
| Ambience | `world-city-loop`, `world-coast-loop` | Coast in `COASTAL_SEA` districts; kept under footstep level on purpose |
| Merlion, lifts, parachutes | `world-merlion-jet`, `world-lift-motor`, `world-lift-ding`, `world-chute-*` | While each is running |
| Aim, scope, light and laser, cant, inspect | `world-aim`, `world-scope-click`, `world-switch-click`, `world-inspect` | |
| Stance, jump, brass | `world-cloth-*`, `world-jump`, `world-brass` | Brass at most every 0.2 s |
| Combat slide | `world-cloth-*` at each end, plus `createSlideScrape` | The scrape is synthesised, not a recording: filtered noise, brighter on metal than dirt, following the slide's speed |
| Milestones | `world-match-start`, `world-objective`, `world-streak`, `world-rank-up` | |

Inventory, Settings and multiplayer lobbies now play the menu's hover and click on any button
by delegation (`plainScreenSounds` in `GameMenu.tsx`). In play, pausing clicks and the wheels and
map tick. `node scripts/world-audio-smoke.mjs` drives a car through a thunderstorm in a real match.

## Combat feedback, pickups and footsteps

`scripts/combat-sfx.mjs` holds these ElevenLabs v3 recordings, published to
`public/audio/combat/`, with the usual `--generate` and `--publish` steps. Short bright
prompts came back near silent often enough that every take should be checked for
level before it is kept; the script lists what was rejected. The batch and its
replacements cost 547 credits on 2026-11-05.

| Event | Group | Rule |
| --- | --- | --- |
| Your hit lands | `combat-hit` | A tick at most every 55 ms, so automatic fire stays readable |
| Through the head | `combat-headshot` | Replaces the tick; heard on top of a kill |
| Your kill | `combat-kill` | Always plays |
| Hit with plates up | `combat-hurt-armor` | Not the body behind it |
| The blow that breaks them | `combat-hurt-break` | |
| Hit with no plates | `combat-hurt-body` | |
| Hit at 30% health or less | `combat-hurt-heavy` | On top of a plate hit if plates remain |
| Round glances off an insert | `combat-hurt-deflect` | |
| Low health | `combat-heartbeat` | Follows the HUD's health bands: slower when low, faster and louder when critical |
| Critical health | `combat-breath` | About every 3 s |
| Grenade bounces | `combat-grenade-bounce` | Read from its velocity flipping; 28 m |
| Smoke or gas cloud starts | `combat-smoke-hiss` | One 3 s clip, 34 m; it does not last the whole cloud |
| Deafened | Synthesised | Two close tones beating, fading as it passes |
| Pickups | `combat-pickup-*` | Ammo, item, food, armor, weapon, supply drop, vendor |
| Pickup refused | `combat-denied` | |
| In and out of water | `combat-water-*`, `combat-swim-stroke` | |

Blows under 2 points are skipped, so gas and fire do not thump every frame, and hits
pan toward where they came from when the host says. Hits carry a `headshot` flag from
`arena-rules.ts` through `mergeHits`.

Footsteps follow the surface under them (`stepGroup`): the original boots on concrete,
recorded sequences sliced into single steps for metal, wood and earth.

### Other people's footsteps

`actor-footsteps.ts` is tuned so 32 bots stay information rather than patter. Only hostile
soldiers on foot are heard, and only the three nearest moving ones, with at least 0.13 s
between any two steps. Range grows with pace, from 15 m to 26 m, which is about 18 m for a
rifleman, and level fades to nothing at the edge. Allies, riders, parachutes, swimmers,
anyone prone and anyone over 4.5 m above or below are silent. A human crouching or aiming on
the move (2.6 m/s or less) is silent too, so sneaking works; a bot's pace is its role, so a
slow gunner still sounds. A step behind a wall is quieter and muffled, and all of them duck
for 0.45 s around gunfire within 45 m.

`node scripts/combat-audio-smoke.mjs` measures this in real 32-bot matches, and hits, kills
and being shot on the range. To change the tuning, change `ACTOR_STEPS` and rerun it.

## Weapon switch

`scripts/weapon-switch-sfx.mjs` holds a bounded batch of ElevenLabs v3 recordings,
published to `public/audio/switch/`, with the same `--generate` and `--publish` steps
as the hands batch. `weapon-switch-audio.ts` times them to `weaponSwitchFrame`, and
each plays at natural speed through the hands mix and the effects slider.

| Beat | Group | Moment |
| --- | --- | --- |
| Old gun goes away | `switch-stow-<carry class>` | Start of the switch, on the side it is carried |
| New gun comes up | `switch-draw-<carry class>` | Start of the draw, on the side it is carried |
| Hand lands on it | `switch-settle-<mechanism>` | 80% of the draw, centred |
| Rifle to launcher mode | `switch-mode` | At once; there is no stow or draw |

Switching in a vehicle seat has no animation, so it plays only the settle. A launcher
mode shares its rifle's settle, as it is the same gun. Seven takes were rejected as near
silent or unusable, and the launcher settle was dropped; the script lists them. Together
the batches cost 219 credits on 2026-11-05 (7,414 to 7,633).

`node scripts/weapon-switch-audio-smoke.mjs` checks them in the real engine.

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
