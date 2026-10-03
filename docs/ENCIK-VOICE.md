# Encik recorded callouts

The user selected **round 4 candidate 3** on 2026-09-13, ahead of round 4 #1 and round 3 #1. The selected synthetic voice is saved in the ElevenLabs account as **Blockplay Encik — Round 4 Candidate 3**.

The pack contains all **48 existing lines** of the base register in `src/game/encik-registers.ts` (16 events, three variants each). It was generated with Eleven v3, natural stability 0.5, using the selected voice. The subtitle script was preserved exactly. The MP3s total **2,534,088 bytes** and approximately **157 seconds**, at mono 44.1kHz/128kbps. Each clip decoded successfully and passed non-silence and checksum checks; individual delivery remains subject to listening review.

Listen to the complete pack at `/audio/encik/index.html` on the running game server, or open `public/audio/encik/index.html` locally. `src/audio/encik/manifest.json` records each event, variant, exact text, filename, size and SHA-256 checksum. Content hashes in filenames prevent stale browser audio after a clip is replaced.

## Registers: he defers as you outrank him

The original pack is one register — a sergeant-major shouting at a recruit —
and it is what a new player hears. Above it sit three more, and the arc is the
joke: at level 12 he drops the insults, at 20 he calls you by rank and offers
rather than orders, at 35 he apologises for speaking and asks what he should
tell the recruits. The thresholds line up with the default insignia ladder, so
a promotion and a change of tone land together.

| Register | From | He |
| --- | ---: | --- |
| Recruit | 1 | Shouts. The recorded pack. |
| Noticed | 12 | Drops the insults. Still gruff. |
| Respect | 20 | Uses your rank. Offers rather than orders. |
| Defers | 35 | Apologises for speaking at all. |

The higher registers now have **816 additional recordings**: 48 Noticed,
384 Respect and 384 Defers. Respect and Defers each cover the eight titles
reachable in that register across Field, Numerals, Service and Shadows,
including `boss` for Numerals. The original 48 clips are preserved, for a
total of **864 clips**. The additional pack uses the same selected Encik voice
and Eleven v3 settings, and lives in `src/audio/encik/rank-manifest.json`.
`encikRecordingUrl` merges both manifests and matches exact event and subtitle
text. A new custom title or edited line remains subtitle-only until recorded.

`{rank}` in a line is replaced with whatever the player's chosen insignia set
calls them, so he defers to a Colonel, a Marksman or a Legend in their own
words. It is the band *title* rather than the graded label, because "Nice work,
Corporal III" is not how anybody speaks, and a set with no titles at all (the
Numerals set) falls back to `boss`. Substitution happens at callout time, which
ensures the recording speaks the same rank as the subtitle.

**The opt-out is absolute.** `encikTone: 'recruit'` on the profile pins him to
the recorded register at any level, for a player who liked being shouted at.
The setting sits in the shop's ENCIK row with a sample of each tone in the
player's own rank. A register is resolved per callout rather than per session,
so a level bought or earned mid-exercise is heard in the next line.

Registers overlay rather than replace: one declares only the events whose
wording changes and the rest fall through to the register below, so a new one
is as small as the joke needs.

## Game playback

The shared FPS engine uses these bundled recordings in practice, arena and expeditions, including AI pilot callouts. No ElevenLabs API key or TTS request is needed during play. Audio loads on demand through the existing Web Audio context; at most eight decoded clips remain cached. A higher-priority callout replaces the active clip. Voice mute, sound mute, pause, reset and disposal stop the channel and invalidate pending audio. Captions and the comms history remain available when muted or when a recording fails to load. The former installed-OS-voice fallback has been removed to keep the chosen accent consistent.

## Generation and recovery

- `pnpm voice:missing` prints the higher-register plan without requests.
- `pnpm voice:missing --generate` fills missing reachable lines using the saved
  Encik voice and private key. It reuses valid shipped clips, caches each paid
  attempt in `.cache/encik-ranks/`, and saves the additional manifest after
  each pair of requests. Reruns reuse completed work; ambiguous attempts require
  inspection. The listening page includes both packs when generation completes.
- `pnpm voice:batch` prints the plan without requests.
- `pnpm voice:batch --generate` explicitly performs generation using the private `ELEVENLABS_API_KEY`; keep it out of `VITE_` variables.
- The approved selection is pinned in `scripts/encik-batch.mjs`, independently of future auditions. It is verified against the original cached audition before saving the voice.
- Voice creation and every individual clip have permanent attempt markers. Complete clips are reused after checksum verification; failed or interrupted requests stop for inspection rather than automatically retrying. Requests have a five-minute network timeout.
- The current batch cache is `.cache/encik-batch/01a0d406e267/`; saved voice metadata is in `.cache/encik-batch/voice-round4-candidate3.json`. Preserve these caches when resuming generation. They are intentionally ignored by Git and contain no API key.
- Source audio is cached before publishing. The source manifest is written only when all 48 clips have completed. JavaScript imports this manifest from `src`; MP3s and the listening page are served by URL from `public`. The audio and manifest are committed so teammates need neither the private cache nor an ElevenLabs account to play.

Observed batch cost: **776 credits**, matching the sum of the 48 response `character-cost` headers and the subscription delta. Account usage after the batch was **1,266 / 40,000**, including the four auditions. Before/after readings and per-request receipts are in the ignored cache. The quota reserve is an estimate, not a provider-enforced per-request spending cap.

The higher-register batch completed on **2026-10-03**. Account usage rose from
1,266 to **12,904 / 40,000**, an observed **11,638-credit** change. The response
`character-cost` headers sum to 11,895; these provider readings differ, so the
account delta is reported separately. All 816 requests completed without retries.
A second run found zero missing clips and observed zero additional credit use.
The full 864-clip pack is **38,771,971 bytes**, approximately **2,398 seconds**;
every file decoded and passed non-silence and checksum checks. The 30 relevant
unit tests, production build and browser playback check passed. Individual
performance and pronunciation remain subject to listening review.

## Verification

`pnpm test` covers every event at every level in all four shipped rank sets and
both tone modes, exact manifest/subtitle matching, audio checksums, base paths,
interruption, late fetch/decode cancellation, mute/context failure and cache bounds.
`node --experimental-strip-types --test scripts/encik-audition-check.mjs scripts/encik-batch-check.mjs`
tests generation guards with mocked requests and spends no credits. Node test
files use `-check.mjs` to avoid Vitest collecting them.

The browser check is `node scripts/encik-playback-smoke.mjs`, using an isolated Chrome debugging endpoint at port 9331 and Vite at 5175 by default (`FPS_CHROME_ORIGIN` and `FPS_APP_ORIGIN` override them). Where the environment proxies Node traffic, set `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost` for this local check.

API references: [save a designed voice](https://elevenlabs.io/docs/api-reference/text-to-voice/create), [generate speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [voice settings](https://elevenlabs.io/docs/api-reference/voices/settings/get-default). Audition history: [ENCIK-AUDITION.md](ENCIK-AUDITION.md).
