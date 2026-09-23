# blockplaySG project guide

[Back to README](../README.md) · [Play the public demo](https://blockplaysg.fun/)

## Game modes and controls

### Regional exploration

Select Marina Bay, Queenstown or Raffles Place to open its walk/drive world. The Singapore locator highlights your selection; each region has a local minimap.

| Region | Approximate game extent | Collectible stamps |
| --- | --- | --- |
| Marina Bay | 726 × 616 units | 14 |
| Queenstown | 520 × 424 units | 8 |
| Raffles Place | 580 × 399 units | 11 |

Marina includes waterfront landmarks, gardens and road circuits. Queenstown includes HDB blocks, void decks, shops and an elevated station. Raffles Place includes office towers, plazas, shophouses and riverfront streets.

- **Walk:** click the scene, use WASD to move, drag to look and Shift to run.
- **Drive:** W/S accelerates or reverses, A/D steers and Space brakes.
- **Car camera:** drag to orbit without steering. While moving, releasing the drag gently returns the camera behind the car; parked views stay where you leave them.
- **Stamps:** approach orange rings to collect them. Switching Walk/Drive preserves stamps; resetting or leaving the region clears the session.

Water and buildings block movement. Layouts are deliberately compressed and handling is arcade-style. Distances are game coordinates, not surveyed distances. Playing these worlds makes no Google API requests.

### Touch controls

On a touchscreen — anything the browser reports as a coarse pointer, plus any
session you start with a tap — every 3D mode draws its controls over the scene
instead of below it:

- **Left stick** moves. It is analog, so a half-pushed stick walks at half pace,
  and pushing it out to the ring runs (or boosts a helicopter). The base is
  planted wherever your thumb lands inside the left zone.
- **The scene looks.** In the FPS modes there is no look stick: dragging
  anywhere the controls are not turns the camera, which is what a phone shooter
  does and what frees the right side of the screen. `dragLook` gives a dragged
  pixel the gain a thumb needs — unscaled it would take three swipes of a
  portrait phone to turn round — and aiming down the sights still halves it.
  The walk/drive districts keep their second stick, because ORBIT on a chase
  camera is not the same gesture.
- **FIRE** can be held and slid: the same thumb keeps the trigger down and goes
  on aiming, which one thumb otherwise cannot do.
- **The actions sit on the thumb's sweep**, not in a row — a quarter turn from
  beside the trigger to above it, which is as far as a hand holding a phone
  reaches. `thumbArc` gives each one a direction and the stylesheet the radius,
  so the same arrangement redraws smaller on a short screen; spacing is what is
  held constant, so a sixth action pushes the sweep out rather than crowding
  onto the fifth. Infantry get aim, reload, crouch (a latch, not a hold), jump
  and weapon swap; a mounted vehicle swaps in its own. They are icon-only, so
  the names live on the elements for screen readers.
- **Contextual actions are a prompt**, in the middle of the screen, and only
  while they can be pressed: entering a vehicle, picking up a crate, crossing a
  checkpoint. They are not sweep slots because a button that came and went as
  you walked would move its neighbours under your thumb. The prompt says what
  it does rather than which key a keyboard would use.
- **The menu** sits above the left stick, off both sweeps: a mis-hit there costs
  the round rather than a magazine.

Entering a mode by touch skips pointer capture entirely, and the round pauses if
a real mouse shows up, so a convertible can switch either way mid-session. The
button bar below the scene still carries every command for keyboard and
assistive-technology users, and it is hidden only in immersive fullscreen, where
the overlay already covers the same ground.

Immersive fullscreen on a phone is all scene: every bar that sits below it on
the page — the loadout, the message line, the progression summary and the AI
pilot controls — is hidden, and the comms log stands aside while the start or
pause card is up rather than covering the button on it. The pilot controls stay
on that card, so fullscreen reaches them through the menu.

`index.html` asks for `viewport-fit=cover`, so an immersive screen would
otherwise run under a status bar, a notch or the home indicator. The immersive
shell pads itself by `env(safe-area-inset-*)`: the scene is a flow child and
moves in with the HUD inside it, while the toolbar and the comms log — which
are positioned against the shell, whose padding box padding does not move —
carry the inset themselves. The thumb layer insets itself already, so inside
the padded shell it drops back to plain margins rather than counting the same
notch twice.

A landscape phone has around 350px of height for badges, vitals, a minimap, the
ammo block, a callout and two control clusters, so some of it stands aside
there: the scrollable comms log (the callout already carries the line that just
arrived), the expedition's sector label (the badge row names the district), and
the mouse-capture chip, which answers a question a phone does not ask. Portrait
keeps the log and stacks the sector between the vitals and the map.

`pnpm test:touch` drives all of it through real touch events in an emulated
phone — including that the sweep is an arc rather than a row, and that dragging
the bare scene turns — and `pnpm test:fullscreen:mobile` checks the immersive
layout in both orientations against a stand-in notch; they need Vite plus Chrome
with remote debugging, as the other browser smokes do.

### Regional FPS and armory

[Map setup and validation](FPS-DISTRICTS.md).

Select Marina Bay, Queenstown or Raffles Place → its FPS mode → Enter range. Each map has eight practice targets, optional counter-fire, a car and a helicopter. Switching regions while in FPS starts a fresh range on the selected map; the armory returns to that same map.

WASD moves, mouse looks, left mouse fires, Q toggles aim, right mouse holds aim, R reloads and 1/2 switches weapons. Shift sprints, C crouches and Space jumps. Escape pauses and releases the pointer. Desktop play requires pointer capture; touch devices get twin thumb sticks and on-screen actions over the scene (see [touch controls](#touch-controls)).

Tap **Q** once to aim and again to lower the scope; left-click fires while aim stays toggled on. This works with a trackpad without holding two buttons. Holding Q does not repeatedly toggle. You can also hold right mouse to aim or use the on-screen Aim button. Reloading, switching weapons, pausing and handing control to/from the AI clear toggled aim. The human toggle is ignored while the AI pilot is running; its direct aim commands are unchanged. The issued SAR 21 uses its integrated 1.5× picture-in-picture sight with an etched reticle and unzoomed peripheral vision. Weapon optics are fixed by variant: the SAR 21 Marksman includes a 1.75× PiP scope, other SAR variants use the integrated sight, and Ultimax variants use a red dot. Buy and equip a complete variant to change weapon performance. Shop previews and gameplay use the same optic model. PiP uses one reusable 384×384 render target and renders only while aiming; red dots use no extra world pass. Reloads animate a magazine swap and gloved hands; empty reloads add a chambering gesture. Sustained fire builds real shot spread and widens the hip-fire crosshair. Releasing the trigger lets accuracy recover; aiming and crouching tighten the cone. White hit markers confirm hits; amber marks confirm eliminations.

**Weapon hardware.** A tier looks like what it is made of. The parts a variant's
figures are built from decide the geometry on its model: a part that adds damage
is a thicker barrel (ported and fluted where it carries its own muzzle velocity,
slotted and vented where it took weight out instead), one that adds rounds is a
longer magazine or a deeper drum, one that shortens the cycle is a gas block and
tube, and fitted handling hardware is a bipod, a free-float nut or a buffer pad.
`weapon-hardware.ts` derives that from the catalog and `weapon-fittings.ts`
builds it, so a variant added later wears its build with no code to write. The
preview labels each fitting over the model and the dossier says what to look for
beside the stat that bought it. See [armory details](ARMORY.md).

**Shot effects.** Firing lights a flare at the muzzle that is re-rolled every
round — roll, core and star length — over a 75 ms envelope with a fast attack
and a fall steeper than linear, lit by a point light in the viewmodel scene and
one in the map, so a shot brightens your hands and the wall beside you. A case
leaves the ejection port on the weapon's own axes, carrying the shooter's own
ground speed, and tumbles, bounces and settles on the deck you are standing on.
Where a round stops it opens a bright ring on the surface, sprays sparks that
cool from white to ember as they fall, lifts a dust puff and leaves a scorch
that outlives all three. A round that stops on a range target reads differently:
brighter, shorter sparks, no dust and no mark on the map behind it. A round that
has already punched through a wall lands visibly weaker on the far side, because
the spray is scaled by the damage the round has left. A worked barrel gives off
smoke; a single aimed shot does not.

Recoil runs in two stages. A shot adds an impulse to a target offset; what the
camera and the viewmodel use chases that target fast while the target itself
settles back slowly, so the muzzle snaps up as the round leaves rather than
sliding down from an instant jump. Horizontal travel follows a fixed per-weapon
pattern with only a small random jitter, so a burst walks the same way every
time and can be learned and held against; the pattern restarts after a third of
a second off the trigger. The camera takes the vertical and horizontal climb;
the weapon additionally bucks back towards the shoulder and rolls away from the
side it is being pushed towards. Shot spread is still owned separately by the
accuracy model — recoil never widens a cone.

**Tuned in degrees, against the genre.** Recoil was tuned by feel twice and came
out at roughly half of what a shooter does, which is how "barely anything"
survived a change that tripled it. Kick units and ratings are internal, so the
only comparable unit is degrees of aim displacement, and `fps-recoil.test.ts`
holds the issued rifle inside a band drawn from approximate, widely-cited
figures for uncompensated climb in games that move the camera — a CS:GO AK-47
spray is about 1.5-2 degrees on the first round, 11-14 over ten and 25-27 over a
magazine; Apex and Call of Duty rifles sit a little under that and recover
harder. The SAR 21 lands at 1.7, 12.6 and 28.6; the Ultimax, being a support
weapon, is heavier still. The bands are wide on purpose: they catch a weapon
that is off by a factor, not a tuning decision off by a decimal.

**The shop draws the spray pattern.** Beside the falloff curve, a second chart
lays every round of a twenty-round held burst over the target it was aimed at,
the way a shooter draws one. Both run through the engine's own code rather than
a formula — the falloff curve through `hitDamage`, this one by stepping
`fps-recoil` and `fps-accuracy` at the weapon's own cadence — so a dossier figure
cannot drift from what the range produces.

It is plotted in *angles*, which is what lets one drawing serve three ranges: the
pattern stays where it is while the target shrinks as it moves away, so the three
rings are the same target at 12, 20 and 30 m. True aspect is therefore
non-negotiable — stretch the drawing and the rings stop being circles and
"inside the target" stops meaning anything. The rings come off the body collider
the engine builds (a 0.265-unit circle), not off the radius the AI pilot happens
to perceive targets with.

Two things are drawn, because two things decide where a round goes. The path is
the pattern proper: the deterministic climb and walk, with the random terms
stilled, which is the shape a player could learn. The cloud behind it is the same
burst fired fourteen times with its real jitter and its real shot cone, from a
seeded generator so the drawing is stable between renders. Drawing only the path
would advertise a precision the weapon does not have — and the cloud is wider
than the path's own horizontal travel, which says plainly that the sideways walk
is noise rather than a pattern worth learning.

**The opening burst is the one you can place.** The view kick and the aim climb
have opposite shapes, and they are separate profiles for that reason. The view
kick snaps hardest on the first round and settles lower, so a single aimed shot
feels like something. The climb does the reverse: the first five rounds take 45%
of the full rate before it ramps up over the next four, so a short burst can be
held on a target and a magazine held down cannot. On the SAR 21 that is 2.9
degrees across five rounds against 7.6 across the next five. The burst count
restarts after a third of a second off the trigger, so tapping in fives is a
real and learnable way to stay in the easy part of the curve — paid for in rate
of fire, which is the trade the weapon is meant to offer.

**Recoil takes your aim, which is what makes it a mechanic.** A shot moves the
shooter's own `pitch` and `yaw`, not only the rendered offset, so a burst has to
be held down rather than watched. Without that, recoil is decoration at any
amplitude: it returns to precisely where you were aiming and never asks anything
of you. The weapon hands the aim back once the trigger is released — minus
whatever you already pulled down yourself, which `compensateRecoil` takes off
the debt as you pull, so compensating a burst and then releasing does not drag
the sights below the target by exactly what you paid. The climb tops out rather
than walking the muzzle into the sky, the way spray patterns do everywhere.

The engine still owns `pitch` and `yaw`; `takeAimPush` only tells it how far to
move them, once per frame. Anything outside the engine that models where the
shooter is pointing therefore has to read the real angles rather than dead-
reckon from its own inputs — `.fps-game` publishes them as `data-player-yaw` and
`data-player-pitch`, and the AI pilot is already safe because it re-observes
from the camera every tick.

**Two ratings, the way STALKER splits them.** `recoil` is how hard one round
throws the muzzle and is felt on the first shot of a burst. `recoilRecovery` is
how fast the weapon comes back down, as a multiple of the baseline settle rate;
it does nothing to a single shot and decides everything about a held trigger,
because the decay between rounds is what says whether a burst converges low or
stacks towards the ceiling, and it is how fast the aim comes back. Both weapons
fire inside the recovery delay, so neither recovers mid-burst: how far a burst
walks is `recoil`, how long it stays walked is recovery. A heavy weapon can therefore kick hard and still be
controllable, and a light one can kick softly and still wander — which one
number cannot express. The issued rifle sits at 1.00 recovery and the support
weapon at 0.85, and both ratings improve up every rung of a platform's ladder.

How hard the game kicks overall is four per-axis gains in `fps-recoil`, from the
rating to the kick units the camera and viewmodel read. The ratings stay the
armoury's currency, so moving a gain moves every weapon and every catalog delta
together instead of needing the catalog rewritten underneath it. Ceilings on the
accumulated climb sit above where the issued weapons converge, bounding the
worst case rather than flattening the climb each weapon is meant to have.

**Recoil is what the handling slot sells.** Three foregrips form a strict
ladder — stabilizer grip, angled foregrip, match foregrip and buffer — each at
least as good as the one below on both ratings and on movement, and the hardware
premium weapons arrive with sits above all three. That is the invariant that
makes a fixed slot safe to give up, and `armory-state.test.ts` holds it.

**Swapping the look.** None of those colours live in the renderer. A weapon's
shots are described by an *effect style* — the flare's core, petals, cone and
light, the tracer, the spark ramp, the impact ring, the dust, the smoke, the
brass and how hard a scorch bites — and `fps-effects` draws whatever style it is
handed. There are three ways to change one, each weaker and more specific than
the last, and none of them needs the others:

1. **By tier.** A weapon's catalog tier picks the base style, so a new Elite
   variant fires like premium kit the day it is added, with no code at all:
   a hotter, shorter, brighter flash that throws its light further.
2. **By accent.** The colour the armoury already paints a variant's receiver is
   mixed through the flare, the tracer and the cooling end of the sparks, so a
   gold Vanguard flares gold and a steel Marksman flares pale. The heart of the
   flash stays near-white whatever the accent — a flash that is entirely its
   accent colour stops reading as ignition and starts reading as a bulb.
3. **By registration.** `registerEffectStyle(id, patch)` lays a patch over
   whatever the first two resolved, keyed on a catalog id for a weapon variant
   or a skin. A patch names only what it changes, and a skin outranks a weapon,
   since a skin is bought for how it looks.

Because the pools are shared and you can switch weapons while your last burst is
still in the air, every spawn is tagged with the style that made it and is drawn
in that style for the rest of its life: switching weapons never retints the
brass already on the floor or the marks already on the wall, and a round still
flying when you swap lands in the colours of the weapon that fired it.

Every pool is allocated once at a fixed ceiling and drawn as a single object:
one instanced draw each for the brass, the rings, the dust and the scorches,
and one batched line list for every spark in the air. Nothing is allocated or
disposed while the trigger is down. The whole world-space tree is flagged so
gameplay raycasts skip it — brass on the floor can never stop a bullet.
`pnpm test:fps:effects` drives a real browser through it, issued kit and a
premium weapon both; on a software renderer pass `EFFECTS_SMOKE_PACE=6`, as the
other browser smokes need.

**Water.** A shot into water is resolved differently from one into concrete.
Anything tagged water — the Marina bay and museum pond, and every district's
water and shallows material via `markWater` in `water.ts` — ends a shot's list of
struck surfaces, so nothing behind or beneath it is reached. `fps-splashes`
decides what happens there. Below a critical grazing angle of 6° the round skips:
it is mirrored about the surface with most of its climb bled off, keeps half its
damage, and flies on. Hitscan casts a fresh ray and in-flight rounds restart their
arc (`skipRound`), each up to twice. Any steeper and the water takes it. Either
way the surface throws spray instead of sparks, dust or a scorch: a crown of
droplets, a central jet for a plunging round (a skim sprays forward instead),
and two foam rings. Droplets are integrated in fixed 1/60 s substeps so a slow
renderer doesn't lose them in one long step. Marina's water is a shader surface
(`createWaterMaterial`): travelling-wave normals, Schlick Fresnel against a
two-colour sky, a sun glint, and up to twelve shot ripples written straight into
its uniforms. The bay is a real basin — quay walls down to a bed 3 m below —
so the transparency shows depth when you look down into it.

In the ready/pause menu, open **Debug survival** for 1×, 5× or 10× maximum health, a health refill, and optional regeneration (10% of maximum HP per second after three seconds without damage). These tab-local settings persist through zone changes and apply to practice, solo bots and expeditions. Network rooms keep their normal health rules.

**Encik radio** adds Singaporean callouts for combat, reloads, low health/ammo, supplies and AI movement. The pilot can request contact and stuck callouts through its action interface. Voice uses the bundled [48-line Encik recording pack](ENCIK-VOICE.md); **Encik on/off** mutes only speech, with subtitles retained. The existing sound mute silences speech too. No API key is needed.

The **Comms log** retains the latest 100 speech, kill and supply/travel entries. Filter All / Speech / Kills / System, expand to browse history, or scroll up without incoming messages pulling you back down. Expedition travel carries the log into the next district; restarting a round clears it. It is a local session log, not player text chat.

Use Fullscreen or F for immersive play. A denied fullscreen request falls back to an expanded viewport.

**Watch AI play** lets a local controller operate your character in practice, solo arena or expeditions. **Take control** returns to mouse capture; **Stop AI** or Escape pauses it. Choose Local planner for offline play, or LLM strategist for optional server-backed goals. Select an expedition destination on the island map to give it a checkpoint route. See [AI pilot and strategy plugins](AI-PILOT.md) for setup and limitations.

Approach Utility 01 or Falcon 01 and press E to enter or exit. Drive with WASD and Space brake; fly with WASD, Space climb, C/Ctrl descend and Shift boost. Land before leaving the helicopter.

The armory is accessed from each region’s FPS briefing or pause screen. It includes fixed weapon variants, cosmetic skins, armor and cosmetic vehicle wraps. Purchases, equipped loadouts, credits and XP persist in this browser. There are no real payments. See [armory details](ARMORY.md).

### Open world and solo arena

**Open world** connects every district through checkpoints. E collects supplies and T crosses a nearby checkpoint. Temporary gear, health and ammo carry between districts; permanent armory purchases remain separate. The island locator previews routes and threat/loot tiers without resetting the expedition. See [zones and loot](WORLD-ZONES.md).

**Solo arena** runs locally against up to six bots with mixed, assault, tank or sniper compositions. The full local build labels this entry **LAN arena**; choose **Solo vs bots** inside it. Multiplayer host/join requires the separate LAN server.

FPS modes share a lightweight local minimap using regional road data: practice shows targets and parked vehicles, expeditions show loot/checkpoints, and LAN hides opponents. Regional collectible maps and companions remain separate. Expedition and arena modes are infantry-only; cars and helicopters are available in FPS practice. See [mode comparison](FEATURE-PARITY.md).

## Install it

blockplaySG is an installable app. Use **Install** in the header on Chromium
browsers, or Share → Add to Home Screen on iOS. An installed copy keeps the
build on the device: districts you have already opened play with no network,
since each district's geometry is built in the browser. The optional companion,
live Street View and LAN rooms still need one. See [installable app and offline
play](PWA.md) for what is cached, how updates are offered and how it is tested.

## Local setup

For HTTPS hosting with the companion backend, see [Cloudflare deployment](CLOUDFLARE.md). It includes the GitHub Actions deploy that runs on every push to `main`, CLI deployment, private runtime secrets and local Worker preview.

Use Node 22.12+ and pnpm 11.22.0, pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

If pnpm is unavailable, use `npx --yes pnpm@11.22.0 install` and `npx --yes pnpm@11.22.0 dev`.

`pnpm-workspace.yaml` enforces a two-week dependency cooldown (`minimumReleaseAge: 20160`), with strict checking and no exemptions. Preserve this configuration and the lockfile.

### Optional AI companions

Read [companion abuse protections](COMPANION-SECURITY.md) before exposing an AI endpoint publicly. Validation and process-local rate limits do not replace authentication or durable spending controls.

These are **not enabled in the public game-only demo**.

Set private `OPENAI_API_KEY` in `.env` or `.env.local`, then run `pnpm server` alongside `pnpm dev`. The server reads those files; Vite proxies `/api/adventure/*` to `127.0.0.1:3001`. Restart the server after changing credentials and restart Vite if its proxy configuration is stale.

The key needs access to **gpt-5.6-luna** for request interpretation and **gpt-live-1** for voice. Never put an OpenAI secret in a `VITE_*` variable or browser code.

- **Marina 3D:** “give me something closer”, “take me to the museum” and “skip this stop” change an existing objective and its HUD/minimap/in-world highlight. Stamps are preserved.
- **Marina Bay, Queenstown and Raffles Place:** educational questions select from 18 curated, source-linked learning cards. Queenstown and Raffles Place guides are education-only. The four later districts have no reviewed cards yet and show no guide; see [districts](DISTRICTS.md).
- **Voice:** requires microphone permission and HTTPS or localhost. Plain HTTP at another computer’s LAN address is insufficient. Audio failure leaves text usable.

“Closer” uses deterministic straight-line distance, not navigable route finding. Local game logic validates destination IDs, checks arrival and rejects stale responses after resets or region changes. See [companion architecture and tests](ADVENTURE.md).

### Optional LAN multiplayer

```sh
pnpm lan
```

This builds the app and serves it on port 4173. Players open the same server URL, then host or join a room. Matches support up to four humans and six bots, using WebRTC with host-authoritative combat.

This is intended for a trusted local network, without Internet matchmaking, external STUN/TURN or host migration. Firewall rules and Wi-Fi isolation can block peers. See [LAN setup and role plugins](LAN-ARENA.md).

The LAN and companion servers are separate. Neither automatically proxies the other.

### Optional Street View

The live viewer is separate from the authored worlds. The public deployment ships no Google browser key unless a `GOOGLE_MAPS_DEMO_API_KEY` build variable is set, so the viewer reports itself unavailable there; the authored districts never need one.

1. Enable Maps JavaScript API in a Google Cloud project with billing.
2. Restrict a browser key to the required APIs and your localhost/deployment referrers.
3. Set `GOOGLE_MAPS_DEMO_API_KEY` in `.env` or `.env.local`. The viewer falls back to `VITE_GOOGLE_MAPS_API_KEY` if it is absent.
4. Restart Vite and select Street View.

These Google browser keys are exposed to the client by design; referrer/API restrictions matter. Static capture scripts use only the Static-enabled `VITE_GOOGLE_MAPS_API_KEY`. Never reuse this browser configuration for private server secrets.

The viewer retains Google controls, dates and attribution. Panorama availability and exact positions are not guaranteed. See [Google Street View documentation](https://developers.google.com/maps/documentation/javascript/streetview).

## Reference images and model work

The worlds use authored solid geometry informed by cached street-level images. They are not automatic photo reconstructions. The earlier four-photo depth experiment is retained but inactive under `public/reconstruction/marina-bay/`.

Each region’s references are under `reconstruction/<region>/references/`. Transfer these caches between computers to avoid repeating requests. Keep attribution, camera settings, checksums and review notes alongside images.

```sh
pnpm references:inventory
pnpm marina:usage
pnpm marina:browser-capture --batch --dry-run
pnpm references:static --plan reconstruction/marina-static-quality-plan.json --dry-run
```

Browser capture requires Vite and Chrome remote debugging on loopback, default port 9223. Regional batches accept `--plan reconstruction/raffles-browser-plan.json` or `--plan reconstruction/queenstown-expansion-browser-plan.json`. Static quality plans also exist for Raffles Place and Queenstown.

Remove `--dry-run` only when intentionally fetching missing references. Complete caches are reused. Browser captures block Static endpoints, but browser Street View may have separate billing.

Run captures serially and keep the capture tab foregrounded. Do not run browser smoke checks during capture: metadata can change before pixels repaint. Successful capture still needs visual review.

See [capture history](../reconstruction/README.md) and the [Marina workflow](../reconstruction/marina-bay/references/WORKFLOW.md). Static authorization and usage limits belong in [PLAN.md](../.agents/PLAN.md) and the usage ledger.

## Testing

FPS handling checks use an isolated Chrome with remote debugging on port 9228 and Vite on 5175: `pnpm test:fps:handling` and `pnpm test:fps:survival`. Set `FPS_APP_ORIGIN` to the VM’s HTTP LAN address to verify startup outside localhost. The survival check creates a zero-bot fixture through the engine’s public API, then verifies authoritative boosted health, regeneration, refill and reset.

```sh
pnpm test
pnpm build
pnpm build:sites
```

The production build has a nonblocking large-chunk warning for the game/Three.js bundles.

Browser checks require a running app and a separate Chrome profile with remote debugging. Run them serially; some reset the demo armory save on the test origin. Do not use a personal browser profile.

| Checks | App / Chrome defaults | Notes |
| --- | --- | --- |
| `pnpm test:browser` | 5173 / 9223 | Regional rendering, movement, camera, resets and mobile layout |
| `pnpm test:adventure` | 5173 / 9223 | Mocked companion, voice, failure and race checks |
| `pnpm test:fps`, `test:armory`, `test:vehicles`, `test:fullscreen` | 5175 / 9224 | Override with `FPS_APP_ORIGIN` and `FPS_CHROME_ORIGIN` |
| `pnpm test:arena:solo`, `test:expedition` | 5175 / 9228 | See script headers for origin overrides |
| `pnpm test:touch` | 5175 / 9224 | Thumb sticks, analog pace, trigger-drag aim and the district sticks, in an emulated phone. `TOUCH_SMOKE_PACE=4` on a software renderer |
| `pnpm test:fullscreen:mobile` | 5175 / 9224 | Immersive phone play in both orientations: the scene owns the screen and the HUD stays inside a stand-in safe area |

Use the normal development build for full-feature browser checks; the Sites build intentionally disables online features. `pnpm test:adventure --live` spends real model credits for text checks; other failure/voice checks remain mocked. Actual microphone and listening quality need human verification.

LAN transport/multiplayer and checkpoint-travel checks have separate prerequisites in [LAN documentation](LAN-ARENA.md) and [Open world documentation](WORLD-ZONES.md). Browser diagnostics are saved under ignored `.cache/` folders. If a VPN proxies localhost, set `NO_PROXY=127.0.0.1,localhost`.

## Deployment

### Public deployment: Cloudflare Workers

The [public demo](https://blockplaysg.fun/) is the Cloudflare Worker, reached
through the custom domain `blockplaysg.fun` and also at
`blockplay-sg.sunjc826.workers.dev`. Every push to `main` builds and publishes
it through [GitHub Actions](CLOUDFLARE.md#github-actions-this-repositorys-default),
then verifies the live site; `pnpm deploy:cloudflare` does the same by hand.

The Worker serves the game and the companion API from one origin. Multiplayer
host/join is unavailable there — the LAN rendezvous server is not deployed — and
live Street View needs a `GOOGLE_MAPS_DEMO_API_KEY` build variable. The
companions answer only while the Worker carries its private `OPENAI_API_KEY`
secret, and return a clear unavailable response without one; `/api/health`
reports which. See [Cloudflare deployment](CLOUDFLARE.md) for secrets, the
custom domain and preview.

### GPT Sites static build

`pnpm build:sites` emits a `dist` for a static, game-only host, and
`.openai/hosting.json` identifies the Site it was published to. That build
disables AI companions, host/join and Street View, and deliberately excludes the
local Google browser key. Do not include `.env` files or server secrets in an
archive.

This path is **not** what `blockplaysg.fun` serves, and nothing publishes it
automatically: reuse the existing Site, and deploy output built from the exact
source revision. GitHub pushes alone do not update it. New Sites start private;
this project's audience was explicitly changed to public. Preserve that audience
unless asked to change it.

Adding a key alone does not enable AI there: the companion backend must first be
adapted to the Sites runtime, configured with server-only secrets and re-enabled
in the client.

### Other hosts

For the same game-only experience, install with `pnpm install --frozen-lockfile`, build with `pnpm build:sites` and publish `dist`. Use the normal `pnpm build` when intentionally configuring the optional integrations.

For a full companion deployment, `pnpm build` then `pnpm server` serves assets and the two companion endpoints on `127.0.0.1:3001`. Put it behind an HTTPS reverse proxy with authentication/access controls and an explicit `ADVENTURE_ALLOWED_ORIGINS` value. The origin and rate checks are not authentication.

To serve companions and LAN from one origin, route `/api/adventure/*` to the companion server and `/api/lan/*` to the LAN server. Add any Street View deployment origin to the Google key’s allowed referrers and rebuild after changing browser variables.

## Code map and persistence

- `src/App.tsx`: region/mode selection and session transitions.
- `src/components/*Game.tsx`: game views and HUDs; `SingaporeMap.tsx`: island locator.
- `src/game/*-scene.ts` and `*-collision.ts`: authored worlds and deterministic collisions.
- `src/game/fps-engine.ts`: shared FPS rendering/input; `arena-*.ts`: bots and match rules.
- `src/game/world-zones.ts`: district/checkpoint graph.
- `src/components/AdventureCompanion.tsx`, `RegionGuide.tsx`: companion panels.
- `src/game/adventure.ts`, `learning-guide.ts`: objective and read-only guide adapters.
- `src/data/*-guide.ts`: curated facts and source links.
- `src/lib/deployment.ts`: game-only build switch.
- `server/`: private companion API; `scripts/lan-server.mjs`: LAN signaling/static server.
- `public/models/field-kit/`: original GLB assets; `asset-pack/`: editable art sources.

Stamps, conversations, expedition loot and arena scores are session-only. Armory credits, XP, ownership and equipped loadouts persist in browser local storage. There are no accounts, cloud saves or persistent online leaderboards.

See [PLAN.md](../.agents/PLAN.md) for experiments and future work, and [HANDOFF.md](../.agents/HANDOFF.md) for continuing on another computer.
