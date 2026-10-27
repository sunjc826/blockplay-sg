# Callouts and barks

Soldiers talk in a fight. Bots **bark** on their own: they report contact,
shout when they reload, call a man down. Players **call out** from a wheel.
There is no voice yet. Lines are subtitles: speech bubbles over heads, a
chatter strip on the HUD, and the **Chatter** channel of the comms log.

## NPC barks (`src/game/npc-barks.ts`)

A bark has a reason (`BarkEvent`) and a speaker. The words depend on three
things about the speaker:

| | Decides | Example |
| --- | --- | --- |
| **Faction** | The voice. Armed forces talk like an NS section; Black Kite talk like contractors watching the invoice. A faction without its own voice borrows its side's. | "Wah, enemy there leh!" vs "Hostiles! I see hostiles!" |
| **Rank** | The nerve. Recruits panic, regulars report, veterans give orders. | Recruit: "I'm hit! This was not in the contract!" Veteran: "Plate held. Push." |
| **Role** | Lines for the job, on top of the rank's. Gunners change belts, marksmen relocate, a mortar crew guards its tube. | "Changing belt! Gun down!" |

Reasons, and where the host simulation (`arena-rules.ts`) raises them:

| Event | When |
| --- | --- |
| `contact` | A bot sees an enemy after 6 s without a fight |
| `reloading` | A bot's reload starts |
| `hurt` / `incoming` | A bot is hit and survives (`incoming` if a blast hit it, or it starts running from a marked barrage) |
| `kill` | A bot kills someone |
| `man-down` | The nearest bot of the victim's faction within 30 m |
| `healing` / `retreat` | A bot starts a field dressing, or backs off to get one |
| `idle` | Every 22–40 s, the calm bot (15 s without a fight) nearest a player, within 40 m |
| `ack` / `taunted` | Answers to a player's callout (below) |

The **bark director** keeps it from turning into a wall of text: 1.1 s between
any two barks in the district (urgent ones skip that), 6 s between two from one
soldier, a per-faction cooldown per event, and a chance that only some reasons
are voiced (`BARK_TUNING`). Barks draw on a random stream of their own, so
whether anyone spoke never changes how a fight plays out.

**Who hears what** (`BARK_RANGE`): an enemy is *overheard* within 35 m
(bubble, chatter strip and log, marked "· overheard"). A friendly is on the
radio within 150 m, and their bubble shows within 60 m. Barks travel in the
snapshot (`ArenaSnapshot.barks`, last 8), so LAN guests see them as the host
does.

**Adding lines:** add to the end of a pool. A line's place in its pool is its
recording key (`barkKey`, e.g. `mercenaries.veteran.kill.2`), so don't reorder
or edit lines once they're voiced. Every faction × rank must have every event.
`npc-barks.test.ts` checks this.

## Player callouts (`src/game/player-callouts.ts`)

Three pages of eight on a wheel: **Tactical** (Contact!, Need ammo, Medic!,
Cover me, Chiong!, Fall back, Go here, Hold here), **Singlish** (Knn, Walao eh,
Steady lah, Shiok, Paiseh, Bo jio, Sian, Abuden) and **Banter** (Own time,
Don't play, Can or not?, Lag sia, Kiasu, Thanks boss, Book out, Chope).

- **Mouse:** hold **Y**, push the mouse toward a slot, release Y (or click).
  Tab or the scroll wheel turns the page; 1–8 says a slot at once; right-click
  puts the wheel away. Movement keys keep working while the wheel is open.
- **Touch:** the speech chip next to the menu chip opens the wheel; tap a slot.

A callout has several lines and the host picks one. `ping` callouts (Contact!,
Go here) carry the point under the crosshair, and listeners read it as
"· 40 m to your left". `reply` asks the bots: on `ack` (orders) the nearest
friendly bot within 40 m answers ("Roger!", "Copy, moving."), and on `taunt`
(Knn, Don't play, Kiasu) the nearest enemy within 35 m takes it personally
("Did he just swear at me?").

**Multiplayer:** callouts cross the wire as ids only (`arena-callout`
`{ callout, at? }`, guest to host), never as typed text, so a room can't be
used for free chat and the host can validate. The host rate-limits one per
1.2 s per player (`CALLOUT_COOLDOWN`) and says it into the snapshot's barks.
Other players' callouts always reach the chatter strip and log, and show over
their head within 60 m. Players who are down can still call out, but can't ping.

## Not done yet

- **Audio.** ElevenLabs is the plan. Bark keys are stable for that; player
  callouts would key on `callout id + line index`.
- Pings are text only: there is no marker in the world or on the minimap.
- Bots don't act on orders. "Fall back" gets a "Copy" and nothing else.
- No per-player mute, and no profanity toggle for the Singlish page.
