# Callouts and barks

Soldiers talk in a fight. Bots **bark** on their own: they report contact,
shout when they reload, call a man down. Players **call out** from a wheel,
and give **orders** that friendly bots act on.
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
| `ack` / `taunted` | An ally taking an order, or an enemy answering a taunt (below) |

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

Four pages. **Orders** comes first, and is the only page that changes what
bots do. Its slots are drawn apart (teal, square-cornered, with a status line)
and the hub reads "Allies act on these · 3 in range". Every other page says
"Talk only · nobody acts on it", and no bot acknowledges talk, so nothing that
does nothing sounds as if it did.

| Page | Callouts |
| --- | --- |
| **Orders** | Gather on me, Move there, Hold position, Focus fire, Scatter, Reinforce |
| **Tactical** | Contact!, Need ammo, Medic!, Cover me, Reloading, Enemy down, Area clear, Sniper! |
| **Singlish** | Knn, Walao eh, Steady lah, Shiok, Paiseh, Bo jio, Sian, Abuden |
| **Banter** | Own time, Don't play, Can or not?, Lag sia, Kiasu, Thanks boss, Book out, Chope |

- **Mouse:** hold **Y**, push the mouse toward a slot, release Y (or click).
  Tab or the scroll wheel turns the page; a number key says that slot at once;
  right-click puts the wheel away. Movement keys keep working while it is open.
- **Touch:** the speech chip next to the menu chip opens the wheel; tap a slot.

A callout has several lines and the host picks one. `ping` callouts (Contact!,
Sniper!, Move there, Focus fire) carry the point under the crosshair, and
listeners read it as "· 40 m to your left". Taunts (Knn, Don't play, Kiasu)
get a retort from the nearest enemy within 35 m. That is words only.

## Orders (`src/game/squad-orders.ts`)

An order goes to the friendly bots within 60 m of the caller, nearest first, at
most eight (`ORDER_TUNING`). It steers their feet only: their eyes and
trigger keep working, so an ally on its way to you still shoots back, and one
running from a marked barrage still runs. The nearest ally acknowledges in
words for that order and their rank. The caller's line says how many took it,
and an order that went nowhere says why ("No allies within 60 m.").

| Order | What allies do | Lasts |
| --- | --- | --- |
| **Gather on me** | Make for a ring 3.5 m round the caller and keep to it as they move. Ends if the caller falls. | 40 s |
| **Move there** | Make for a ring round the point aimed at, then stand there. | 45 s |
| **Hold position** | Stop where they are and stay. | 45 s |
| **Focus fire** | Go after the enemy nearest the point aimed at (within 25 m), ahead of anyone nearer. | 30 s, or until it dies |
| **Scatter** | Run 16 m directly away from the caller, fanned out, faster than a walk. Then back to normal. | up to 7 s |
| **Reinforce** | HQ sends a truck or helicopter with a fireteam of four, landing 45–90 m from the caller. They gather on the caller for 40 s once down. | once per 150 s per player |

Reinforce works only where the district has transports (expeditions). In the
arena HQ answers "No transports out here", and on cooldown it gives the wait;
the wheel shows the same on the slot (Ready, 74 s, Not here). A new order
replaces an old one. A fallen player gives no orders, and a bot's order dies
with it. Orders cross the wire like any callout, as an id; the host carries
them out and reports the outcome in the bark (`ArenaBark.order`), and a
player's wait for HQ in the snapshot (`ArenaActor.reinforceIn`).

**Multiplayer:** callouts cross the wire as ids only (`arena-callout`
`{ callout, at? }`, guest to host), never as typed text, so a room can't be
used for free chat and the host can validate. The host rate-limits one per
1.2 s per player (`CALLOUT_COOLDOWN`) and says it into the snapshot's barks.
Other players' callouts always reach the chatter strip and log, and show over
their head within 60 m. Players who are down can still call out, but can't
ping or give orders.

## Not done yet

- **Audio.** ElevenLabs is the plan. Bark keys are stable for that; player
  callouts would key on `callout id + line index`.
- Pings are text only: there is no marker in the world or on the minimap.
- Orders have no map or world marker; the move point and focus target are known only from the text.
- Bots in vehicles ignore orders until they get out.
- No per-player mute, and no profanity toggle for the Singlish page.
