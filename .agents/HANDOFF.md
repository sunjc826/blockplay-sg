# Blockplay: portable agent handoff

**Latest: the ammunition and health readouts move (2026-09-22).**
Digits that lag behind the engine are a hazard in a shooter — reading 12 while
holding 9 loses the fight — so the numbers stay the engine's own and the motion
is carried by bars under them, plus a one-frame tick on the digits keyed to
`hud.shots` so each round fired reads as a round fired.

**The magazine through a reload is the one exception, and it is safe because
`weaponFire` refuses while `reloadRemaining > 0`.** Nothing a player decides
rests on the digits for that window, so `magazineDisplay` climbs them — to what
the reload will *actually* transfer, which is the capacity or whatever the
reserve can spare, so the count lands on the engine's number instead of
snapping to it. `useReducedMotion` turns the climb off, since the stylesheets
cannot reach a computed value.

**Health drains in two layers.** The fill tracks health at once; the ghost
behind it leaves 150ms later over 500ms, so a burst shows what it cost as a red
sliver that then closes. Regeneration is already gradual in the engine, so
refilling needed nothing extra — the same fill grows. Both are `scaleX`, never
`width`: they restyle on every engine frame and a width would lay the chip out
each time, which is the same lesson the backdrop-filter taught. The fill takes
the chip's `currentColor`, so it turns gold and then alert with the band for
free. The magazine bar shares its slot with the reload progressbar rather than
sweeping alongside it, so only one thing moves there at a time.

687 unit tests (+4), typecheck, build and `pnpm test:fps` pass.

**Latest: the HUD speaks with one voice, and health is a state (2026-09-22).**
Every readout over the scene used to carry its own dark green, its own radius
and its own type — ten near-identical panel backgrounds and eleven golds within
one screen of each other, the badge in monospace, the vitals in DM Sans, the
minimap heading in sans-serif. `.fps-game` now holds one set of `--hud-*`
tokens, the way `.armory` and `.touch-layer` already do, and a grouped base
rule dresses the badge, score, vitals, minimap, objective, vehicle locator,
interact prompt, screen notice and incoming banner. A panel declares only what
makes it different: where it sits, and how wide.

**The token block deliberately has no `backdrop-filter`.** Ten blurred panels
compositing over an animating WebGL canvas cost enough frames that
`pnpm test:fps` stopped registering its 350ms key-hold as movement — it passes
on a clean tree and failed with the blur, which is a real cost on a weak GPU
and not only on this VM's software renderer. The panel alpha (`--hud-bg`, d9)
carries the legibility instead. Worth knowing before adding glass anywhere over
the scene.

**Health is a band, not only a number.** `HP 7` and `HP 100` rendered
identically, and the damage vignette clears between hits, so the corner said
nothing between one burst and the next. `healthBand` in `src/game/vitals.ts` is
a share of the player's *own* maximum, so the debug health multiplier moves the
thresholds with it rather than pinning them to 100: gold at half, an alert
frame that pulses under a quarter. The frame pulses, not the screen, because
the vignette already owns the screen on each hit. Spent armor goes dashed and
dim rather than shouting a zero.

The range, the arena and the expedition wrote that markup twice, so it is one
`FpsVitals` now, and the band and armor state are `data-health-band` /
`data-armor-state` on it: the stylesheet colours off them, and a browser smoke
can assert the state a player is actually being shown.

**Still open from the same review**, not done here: `.fps-incoming` (z-index
auto) is painted over by `.fps-minimap` (z-index 2) — they overlap at
`top:111px/left:24px` against `top:108px/left:18px`, so the game's most urgent
warning is unreadable behind the map. Also unshared: the compass over raw sky
with only a text-shadow, the two simultaneous hit indicators, and the HUD's
fixed pixel sizing, which a `container-type:size` on `.fps-viewport` plus one
`--hud-scale` would subsume along with most of the HUD media queries.

682 unit tests (+3), typecheck, build and `pnpm test:fps` pass.
`pnpm test:expedition:ui` fails here at its `.expedition-network` child count
(19 vs 3) — it fails the same way on a clean tree.

**Latest: the installed app broke on every load but the first (2026-09-22).**
Reported from the deployed site: first load fine, later loads dead until site
data was cleared. Reproduced in three loads against `wrangler dev`, and it is a
one-line rule with a wide blast radius.

**A response that arrived through a redirect cannot answer a navigation
request.** The browser refuses it and turns it into `net::ERR_FAILED`, and the
Cache API preserves that flag across a `put`. Cloudflare's asset server
redirects `/index.html` to `/`; the precache list was built from the Rollup
bundle, which names the page `index.html`, so `cache.addAll` followed the
redirect and stored a response with `redirected: true`. Every load the worker
answered — that is, every load after the first — failed. The first load always
looked fine, because the worker is not yet controlling the page.

The shell is now fetched and stored under `/`: the URL a navigation asks for,
the manifest's `start_url`, and the one no host redirects away from.
`withoutRedirect()` additionally rebuilds any redirected response before it is
cached or served, so a differently-configured host cannot reintroduce it, and
`routeFor` decides navigations before consulting the precache list so
`/?room=abc` still gets the shell. Navigations to real files
(`/connection-check.html`, `/audio/encik/`) are now passed to the network rather
than cached, which is also what lets the browser follow their redirects.

**Both test layers had let it through, and both are fixed.** The smoke's own
static server answered `/index.html` with a plain 200 — kinder than the
deployment it stands in for — so it now mirrors the 307. And it reused the
browser profile, so its "first load" was often a repeat load with a working
worker already installed; it now clears the origin's storage first, and reloads
once with the server still running before going offline. Verified both
directions: the hardened check fails on the old worker and passes on the new.

Already-broken browsers heal themselves. Tested with the poisoned profile: the
new worker installs on the next navigation, and because an error page holds no
controlled client it activates immediately — the very next load renders, no
clearing needed.

Rebased onto the twelve commits that landed on `main` meanwhile; only this log
conflicted. On the merged tree: 680 unit tests, typecheck, both builds,
`pnpm test:pwa` and `pnpm test:cloudflare` (which now also asserts the worker
precaches the site root and that `/` is served without a redirect) pass. Three
consecutive loads against the Worker preview render.

The deploy workflow runs `pnpm test:cloudflare` against the live site, so that
last assertion now guards production. It does not run `pnpm test:pwa`, which is
what actually catches this class of bug; adding a headless Chrome step to the
workflow would close that gap.

**Latest: the Encik defers as you outrank him (2026-09-21).** He used to shout
at a Legend exactly as he shouts at a recruit. Now his lines have four
registers — Recruit (the recorded pack), Noticed at 12, Respect at 20, Defers
at 35 — and the arc is the joke: he drops the insults, then starts using your
rank, then starts apologising for speaking. "Oi, front! This one not
sightseeing tour!" becomes "Contact, Legend. Ignore me, carry on."

**The recorded pack is the constraint that shaped this.** 48 clips are keyed by
*exact subtitle text*, so the base register is frozen: edit a character of it
and the lookup silently mutes a line. Everything above it is an overlay that
declares only the events whose wording changes, and the new lines have no
recordings **by design** — `encikRecordingUrl` finds nothing and he subtitles
in silence. Two tests hold the ends of that: every base line must still resolve
to a clip, and no higher-register line may collide with a recorded one, which
would play a shout over a deferential subtitle. Recording them later needs no
code, only clips whose text matches.

`{rank}` is substituted at callout time with what the player's *own* insignia
set calls them, which is why this and the rank work fit together: he defers to
a Colonel, a Marksman or a Legend in their words. It is the band title rather
than the graded label, because "Nice work, Corporal III" is not speech, and the
Numerals set (no titles) falls back to `boss`. Substituting at callout time is
also what makes a substituted line unable to match a recording by accident.

**Two things worth knowing before extending this.** The address is read per
callout rather than captured, so a level bought mid-exercise is heard in the
next line — `createEncikRadio` takes a getter, and `FpsGame` backs it with a
ref because the engine outlives the render that built it. And the opt-out is
absolute: `encikTone: 'recruit'` pins the recorded register at any level, for
a player who liked being shouted at. It is a profile field beside `rankSet`,
with the setting in the shop's ENCIK row showing a sample of each tone in the
player's own rank.

659 unit tests (+9), typecheck and build pass. `pnpm test:fps:voice` now proves
the whole thing in the browser three ways: at Legend his lines carry the rank
and none of the recruit shouting, they play *zero* audio, and flipping to
Recruit brings back both the shouting and the recorded playback.

**Latest: a weapon tier looks like what it is made of (2026-09-21).** The eight
variants shared two GLBs, so the shop preview separated them by accent colour
alone: the dossier said the Marksman was a different rifle and the picture said
it was a repaint. A variant now wears its build.

`weapon-hardware.ts` is pure and derives the hardware from the parts a variant's
figures already come from, rather than a second list keyed on weapon ids — a
part that adds damage is a barrel, one that adds rounds is a magazine or a drum,
one that shortens the cycle is a gas system, and a fitted handling part is a
bipod, a free-float nut or a buffer pad by what the armoury called it. A variant
added tomorrow arrives wearing its build with nothing here to update.
`weapon-fittings.ts` builds the geometry, `dressWeapon` calls it, and so the FPS
viewmodel shows the same weapon the shop previewed, for free.

**The part worth knowing before extending this:** the fittings only go where the
authored mesh leaves air — the bare barrel ahead of the handguard, past the
muzzle, under that barrel, on the magazine node, or off the back of the butt.
Those anchors were measured out of the GLBs by binning vertex positions along
-Z (see `docs/ARMORY.md`), because nothing else says where the polymer stops. A
fitting placed by eye will end up inside the receiver on one of the two models.

How pronounced a fitting is scales off the share of the *platform's own* figure
its part shifts, not off the catalog's current maximum, so adding a heavier
barrel later cannot silently reshape every weapon already on the shelf.

The magazine is the one authored node touched: a drum scales in place, a box
magazine grows through a child mesh, and both are restored on teardown. Anything
hung off a model node rather than off the `equipped-hardware` group has to be
detached by hand or it survives the next dressing — the teardown test caught
exactly that.

Words follow the geometry: the preview chips each fitting over the model and the
dossier prints what to look for under the part that paid for it.

647 unit tests (+20), typecheck and build pass. Verified by screenshotting all
eight variants in the real shop preview and the top tier of each platform in the
range, on swiftshader. `pnpm test:fps:handling` still fails here at its
sustained-fire spread assertion, which is this VM's 3 fps software renderer, not
this change — it fails the same way on a clean tree.

**Latest: ranks are a pluggable set, and levels have badges (2026-09-21).**
`progression()` used to end in a ternary chain that turned a level into one of
six words. Those words are now one *set* of four — Field (the originals, kept
exactly), Numerals, Service and Shadows — and `progression()` no longer returns
`rank` at all: it is pure XP arithmetic again, and every display goes through
`rankInsignia(level, profile.rankSet)`. The choice is dress rather than
equipment: free, saved under `rankSet`, previewed at your own level in the
shop's INSIGNIA row.

**Two decisions make fifty badges cheap, and both are the reason not to add art
files if this grows.** The emblem is a *vocabulary* — numeral, chevron, bar,
diamond, star, weapon shadow, each with a count and an optional wreath — and
`RankBadge` generates it, so `{ kind: 'star', count: 3, wreath: true }` is a
rank nobody drew. And grades come from the band rather than from more bands: a
band over levels 10-13 has four grades, so `Corporal II` needs no entry, and
`grade: 'roman' | 'arabic' | 'level' | 'none'` decides how it reads. A set is
about twelve lines. `registerRankSet` takes one at runtime; it sorts the bands
and refuses a set that does not cover level 1, because the alternative is a new
player with no badge.

**The thing worth knowing before drawing anything else at this size:** a
stroked wreath with tick-mark leaves aliases into a bowl with rays at 40px, and
whatever mark sits above it then reads as two eyes over a smile. I shipped that
twice before looking at a contact sheet of all four sets at once — which is the
real lesson, since each badge looked fine on its own. Filled leaves fanned
along a stem read as laurel, because a leaf is then a shape rather than two
converging lines. A wreathed mark is scaled into the opening rather than laid
over it, or the outer stars foul the branches.

Crossing into a band is a promotion rather than a level, so the completion card
reads PROMOTED on a band's first level and LEVEL UP inside one, off the same
`promoted` flag.

650 unit tests (+15), typecheck and build pass. `pnpm test:armory` switches all
four sets through the real controls and asserts the strip, the badge's
accessible name and the saved profile all follow.

**Latest: levels are for sale, priced by the gap they close (2026-09-21).** The
roadmap's open question — tokens do not bypass level gates, should they? — is
answered. They still don't: `purchase()`'s condition is untouched and an item
behind level 8 costs exactly what it always did. What tokens buy now is the
*level*, through `purchaseLevel()` and a control in the shop's progression
strip.

**The price is not written beside a level number, it is derived from the XP
still owed** (`levelSkip` in `progression.ts`: 25 XP per token, floored at 5).
That one decision is where the design is. Earning and paying stop competing —
standing halfway up a level halves what the rest of it costs, and the strip's
price visibly falls as you shoot. And a level costs more the higher it is for
free, because the gaps themselves grow (`100 x (2L + 1)` from L to L+1), so
there is no second rule to keep in step with the first. A bought level lands
exactly on its threshold and opens at zero progress: you are charged for the XP
you were missing and credited with precisely that, so buying two levels costs
what the two gaps cost separately.

**The thing worth knowing before extending this:** a level gate is now a price,
so anywhere that states one has to state both halves or it lies. Three places
do. The locked-item dossier used to read "Tokens do not bypass levels" and now
names the XP *and* the token climb in front of that item, discounted by XP
already banked (`skipCostFrom(xp, level)`). The breakpoint report prints the
same figure beside a tier's gate (`LV7 (+192TK)`), because what a premium
weapon costs to reach is no longer just its own price. ARMORY.md's play loop
said the same thing the dossier did and says the truth now. Adding a gated item
means checking those three, the way a new district means checking the three
prose files.

The anchor, if the rate is ever retuned: 252 TK buys every gate in the catalog
(level 8 is the last), which is less than the 340 TK item that gate holds back.
Levels are meant to be a shortcut past the climb, not the sink — invert that
and the gear stops being the purchase.

635 unit tests (+8), typecheck and build pass. `pnpm test:armory` passes here
against Chromium on a software renderer, and now buys two levels through the
real control mid-run and asserts the Vanguard's gate opens at its own price.

**Latest: a weapon's shots are data now, not constants (2026-09-21).** The shot
effects that landed earlier today had their colours written into the renderer.
They are an `EffectStyle` now — flare core/star/cone/light, tracer, spark ramp,
impact ring, dust, smoke, brass and scorch bite — and `fps-effects` draws
whatever it is handed. A premium weapon flares, traces and ejects in its own
accent without the engine knowing anything beyond "weapon 0" and "weapon 1".

Three ways in, each weaker and more specific, none needing the others: the
catalog **tier** picks the base (a new Elite variant looks premium the day it is
added, with no code), the variant's **accent** — the same colour the armoury
paints its receiver — is mixed through the flare, tracer and the cooling end of
the sparks, and `registerEffectStyle(id, patch)` lays a partial over the result,
keyed on a weapon or skin catalog id. A skin outranks a weapon, because a skin
is bought for how it looks.

**The part worth knowing before extending this:** the pools are shared, and a
player can switch weapons while their last burst is still in the air. So every
spawn carries the *id* of the style that made it, and the renderer looks the
style back up per record per frame rather than reading "current". Switching
weapons does not retint the brass already on the floor or the marks already on
the wall, and a round still flying when you swap lands in the colours of the
weapon that fired it. That is also why `resolveEffectStyle` derives its id from
the request (`elite:sar-vanguard:skin-issued`) rather than inventing one: two
calls for the same loadout have to agree or a spawn loses its style.

The tag is an opaque `style?: string` on `Casing`, `Impact`, `Spark` and
`Scorch`. The pure modules never read it — they are still renderer-free and
their tests still run without three.js.

Brass needed a per-instance colour for this, so `casingMesh` now carries
`instanceColor` over a white base material and two weapons can leave two
colours of case in the same instanced draw. Metalness and roughness still come
from the weapon in hand, since they cannot vary per instance.

`fps-effects.test.ts` is new and is the first test over that layer: three.js
only needs a GPU to *draw*, so building the scene graph and reading back which
colour landed on which instance works headless. It is a better instrument than
screenshots here — a 75 ms flare at 3 fps is not reliably catchable. The browser
smoke gained the end-to-end half: it asserts the style id follows a weapon
switch, then seeds a Vanguard into the stored profile, reloads, and checks the
range comes up as `elite:sar-vanguard:skin-issued` and still throws brass.

627 unit tests (+22), typecheck and build pass; `pnpm test:fps:effects` passes
with `EFFECTS_SMOKE_PACE=6`.

**Latest: the FPS shoots like something from this decade (2026-09-21).** Every
visible part of a shot was one object with a boolean: one additive sphere at the
muzzle shown for a fixed 45 ms, one line for the tracer, one amber sphere moved
to wherever the last round stopped, and a single `kick` scalar damped toward
zero. No brass at all. That is now five modules.

The pure ones — `fps-recoil`, `fps-casings`, `fps-impacts`, `fps-muzzle` — own
the arcs, the lifetimes and the shapes, and are tested without a renderer (24
new unit tests). `fps-effects` is the only file that knows what an
`InstancedMesh` is, and the engine got *smaller*: it hands the effects layer a
shot and a frame and gets its filters back as one `fpsEffect` flag.

**Recoil is two-stage.** A shot adds an impulse to a *target* offset; what the
camera and viewmodel read chases that target fast while the target itself decays
slowly. The gap between the two rates is the whole effect — the muzzle snaps up
as the round leaves and then settles, where one damped scalar can only slide
back down from an instant jump. Horizontal travel is a fixed per-weapon pattern
with a small jitter, so a burst is learnable; it restarts after a third of a
second off the trigger. Ceilings and the same `VIEW_SCALE` coupling keep the aim
displacement a burst costs exactly what it was, and spread stays owned by
`fps-accuracy` — nothing here widens a cone.

Three things cost real time to get right, and are worth knowing before touching
this again:

**Effect pools are wall-clock, not physics.** They started out advancing on the
engine's `dt`, which is clamped to 50 ms. On this VM's software renderer, which
runs the range at 3–4 fps, rounds still left the barrel at their real rate while
everything they threw off aged six times too slowly, so brass piled up and
nothing expired. Recoil had the same fault. Both now take `realDt`, as the
weapon cooldowns already did, and the pools' internal step ceilings went to
250 ms so one stalled frame still advances most of the way.

**A decal cannot be additive and `instanceColor` cannot fade one.** A scorch has
to *darken* the wall, which additive blending cannot do, and `instanceColor`
tints an instance rather than setting its coverage, so it cannot fade a normally
blended one either. The blend does the work instead: `dst x (1 - src)` through
`CustomBlending` with `ZeroFactor` / `OneMinusSrcColorFactor`, which turns the
per-instance colour into the fade with no patched shader and nothing extra per
vertex. **The alpha factors matter as much as the colour ones** — left to follow
the colour blend they multiply the framebuffer's own alpha to nothing, and the
page underneath shows through as a pale square around every mark. Alpha is
passed through with `ZeroFactor` / `OneFactor`.

**Brass does not land on y = 0.** Marina's plaza deck sits at about y = 0.11, so
cases dropped to the engine's ground plane sank out of sight. One downward
raycast every three-quarters of a second tracks the floor the player is actually
standing on — far cheaper than one cast per case, and it follows you up stairs
closely enough for something that lies there four seconds.

One cost to keep an eye on: the map now carries a point light for the muzzle
flash (`createFpsEffects(..., { worldLight: false })` is the one switch if it
ever matters). It is what makes a shot brighten the wall next to you. I could
not measure its cost here — this VM drifts from 3 to 9 fps across consecutive
samples, so the instrument is useless at that resolution.

`pnpm test:fps:effects` is the new smoke: it fires into concrete and asserts
brass, sparks, scorches and a recoil climb that settles, then fires at a target
and asserts it sprays sparks but leaves the map behind it unmarked, then checks
that a shot crosses the brass and marks it just laid to reach that target, and
that resetting the exercise clears every pool. It needs `EFFECTS_SMOKE_PACE=6`
on a software renderer. 605 unit tests, typecheck and build pass; `pnpm test:fps`
and `pnpm test:fps:optics` still pass. `pnpm test:fps:handling` fails here on
its "sustained fire spreads crosshair" assertion — it fails identically on the
unmodified tree, because a fixed 1400 ms trigger hold at 3 fps fires four rounds
instead of eleven.

**Latest: the thumb layer is laid out like a phone shooter (2026-09-21).** The
repo owner's note was that the buttons were "just laid out in a row, not very
friendly", and that a look stick makes no sense in an FPS when dragging the
right of the screen should look.

**The look stick is gone.** The engine already had drag-to-look on the canvas
(`pointerdown`/`pointermove` set `drag` for touch and pen only), and
`.touch-layer` is `pointer-events:none`, so the scene was always a look surface
wherever a control was not — the stick was taking a corner of the screen to do
what the rest of it already did. What it was missing is gain: `turnFpsLook`
reads .0023 rad/px, so a bare drag needs about 1370px for a half turn, three
swipes of a portrait phone. `dragLook` (in `touch-controls.ts`, tested) scales
both touch paths — the scene drag and the trigger's own slide — by 2.6, with
the vertical gain holding the sticks' X:Y ratio so a wandering thumb does not
fling the pitch. `setLookAxis` and the per-frame `lookStick` branch in the
animation loop are deleted; nothing else called them. The walk/drive districts
keep their two sticks: ORBIT on a chase camera is a different gesture, and they
were not what the note was about.

**The actions moved onto the thumb's sweep.** `thumbArc` returns a unit
direction per slot and a `spread`; the stylesheet supplies the radius, so one
arrangement redraws smaller on a short screen without new maths. Two decisions
worth keeping:

- **The sweep is a quarter turn, no more.** The trigger sits hard in the corner,
  so a slot past vertical hangs off the edge of the phone. A unit test pins
  that: every slot is left of and above the trigger.
- **Spacing is held constant, not the span.** Four buttons sit at the same pitch
  as five; a sixth pushes the whole sweep outwards instead of landing on its
  neighbour. That is what `spread` is, and why the cluster's reserved box —
  and the `--touch-inset` the HUD is lifted by — is computed from it.

**Contextual actions became a prompt** in the middle of the screen, shown only
while they can be pressed, saying what they do rather than which key a keyboard
would use (`promptLabel` drops the "E · "). They are not sweep slots because a
button that appeared as you walked past a crate would move its neighbours under
your thumb. The read-only HUD line they replace is hidden while the layer is
up, which is what the new `data-pilot` attribute on the root is for: with the
AI playing there is no layer, so the line has to stay.

**What a landscape phone gives up.** 844x390 cannot hold badges, vitals, a
sector label, a minimap, an ammo block, a callout and two clusters. The
scrollable comms log stands aside there (`.fps-radio` already prints the line
that just arrived across the middle), as does the expedition's sector label,
and the mouse-capture chip goes on every touchscreen — it answers a question a
phone does not ask, and it was widening the vitals row into the callout.
Portrait keeps the log and stacks the sector between the vitals and the map;
that sector/vitals collision was there on the desktop too and is fixed at
source in `expedition.css`.

591 unit tests (+10), typecheck and build pass. `pnpm test:touch` was rewritten
around the change — it now asserts the five infantry actions are equidistant
from the trigger and not in one row, and that dragging the bare scene turns far
enough — and it, `test:fullscreen`, `test:fullscreen:mobile` and `test:fps` all
pass. `pnpm test:pointer` fails here on the unmodified tree too (pointer lock
never engages in this container), so it is not from this work.

**Latest: fullscreen on a phone is actually fullscreen (2026-09-21).** Two
things the repo owner hit on a phone, both in immersive FPS play.

The "Watch AI play" bar was still on screen. `FpsPilotPanel` renders twice — on
the start / pause card and as a flow sibling below the scene — and the immersive
rule that hides the loadout, the message line and the progression summary never
listed it. So it kept a static strip of the screen: measured at 136px of 844 in
portrait and 96px of 390 in landscape, roughly a third of a landscape phone, and
the immersive toolbar was drawn straight over it. It is hidden by
`.fps-game.is-immersive>.fps-pilot-panel` (a child selector: the copy on the card
is a descendant and has to stay). Fullscreen now reaches the AI through the
menu, which is where the loadout already lives.

The top of the game was cut off because `index.html` asks for
`viewport-fit=cover`, so an immersive screen runs under the status bar, the notch
and the home indicator, and only the thumb layer was safe-area aware. The
immersive shell now pads itself by `env(safe-area-inset-*)`. **The mechanism
worth remembering:** padding a box does not move its absolutely positioned
descendants, which resolve against its *padding box*. The first attempt padded
`.fps-viewport` and pushed the canvas 47px off the top — the original bug, worse.
What works is padding the shell, because `.fps-viewport` is a *flow* child and
takes the whole HUD in with it; anything positioned against the shell — the
toolbar, the comms log — carries `var(--safe-bottom)`/`--safe-left` itself. The
thumb layer, which insets itself, drops to plain margins inside the padded shell
so the same notch is not counted twice.

Two smaller things from the same screenshots: the comms log sits at `z-index:4`
above the scene and is nearly full width on a phone, so it covered the start card
and the button on it — it and the menu now swap, the way the toolbar and the hint
already do. And in portrait the centred setting line (`.fps-compass`) printed
straight through the vitals row, which reaches past the middle of a 390px
screen; the minimap under it already carries the heading, so it is hidden there.

`pnpm test:fullscreen:mobile` is the new smoke: an emulated phone in both
orientations, asserting nothing but the scene is left in flow, the canvas fills
the screen, the AI controls stay on the card, the comms log yields to the menu,
and the badges, toolbar, card and thumb sticks all sit inside a stand-in notch
(CDP cannot emulate `env()`, so it sets the custom properties directly). It
fails on the unfixed tree with `["fps-pilot-panel"]` left in flow. 581 unit
tests, typecheck and build pass; `pnpm test:fullscreen` and `pnpm test:touch`
still pass, so the desktop and touch paths are intact.

**Correction: blockplaysg.fun is the Cloudflare Worker, not the Sites build
(2026-09-21).** The docs had said the public demo was the GPT Sites static
deployment; the repo owner confirms the custom domain is attached to the Worker,
so every push to `main` has been updating the public URL since the deploy
workflow landed. `docs/PROJECT-GUIDE.md`, `docs/CLOUDFLARE.md`, `README.md`,
`docs/AI-PILOT.md` and a dated note in `docs/BUILD-STORY.md` now say so, and the
post-deploy check defaults to `https://blockplaysg.fun` — the URL people
actually open — rather than the `workers.dev` origin.

`pnpm build:sites` and `.openai/hosting.json` are still in the tree for a
static, game-only copy; the guide now marks that path as not what the domain
serves and not published by anything automatic.

Two consequences worth knowing. The Worker build leaves the companion UI
enabled, so the public demo shows it and answers only while the Worker carries
`OPENAI_API_KEY`; `/api/health` reports which. And Street View is reachable
there rather than hidden — with no `GOOGLE_MAPS_DEMO_API_KEY` build variable it
falls into `loadGoogleMaps`'s developer-facing "add it to .env.local" message,
which is the wrong audience for a public page.

**Latest: main deploys itself (2026-09-21).**
`.github/workflows/deploy-cloudflare.yml` — the repository's first workflow —
typechecks, tests, builds and publishes the Cloudflare Worker on every push to
`main`, then runs `pnpm test:cloudflare` against the live origin, so a deploy
that breaks routing, the service worker or the API fails the run instead of
sitting there green. It needs one repository secret, `CLOUDFLARE_API_TOKEN`; the
account comes from `wrangler.jsonc` and `OPENAI_API_KEY` stays a Worker secret
that deploys do not touch.

It deploys with the Wrangler pinned in the lockfile rather than an action that
fetches its own, which keeps the two-week cooldown meaningful for the thing that
publishes the site. The deploy step is `pnpm deploy:cloudflare` minus its
rebuild, so the bundle that was tested is the bundle that ships. Deploys are
serialised and a queued run waits rather than cancelling one mid-upload.

**This and Cloudflare's own Git integration are alternatives.** If the Worker is
also connected to the repository in the Cloudflare dashboard, two systems will
publish the same commit; `docs/CLOUDFLARE.md` now documents both paths and says
to pick one.

Verified here as far as the container allows: the YAML parses, `pnpm
check:cloudflare` bundles and validates the Worker config, and `pnpm
test:cloudflare` passes against a local `wrangler dev` serving that bundle. Not
verified: Node 24.21.0 (only 22 is installed here — the workflow pins the
version `docs/CLOUDFLARE.md` gives for Cloudflare's own build image), and the
upload itself, which needs the account token. The first run on `main` is the
real check, and a failure leaves the previous deploy serving.

**Latest: the game is playable with thumbs (2026-09-21).** Every 3D mode now
draws twin floating sticks and its actions over the scene on a touchscreen,
instead of the row of arrow buttons under it. `src/game/touch-controls.ts` holds
the whole feel as pure functions, so the range, the expedition and the
walk/drive districts cannot drift apart, and the tuning is testable without a
browser.

Three decisions worth keeping:

- **The stick wins over the keys, it is never summed with them.**
  `resolveMovement` returns one intent; a key left stuck down by a lost keyup
  therefore cannot drag a touch player sideways. Analog magnitude survives into
  `movementInput`, which only normalises vectors longer than one — so a
  half-pushed stick walks at half pace for free, and the sprint is the outer
  ring rather than a button.
- **Look is a rate, applied per frame, in mouse pixels.** `lookDelta` feeds
  `turnFpsLook`, so touch and mouse share one sensitivity curve and one clamp.
  The districts pass `REGION_LOOK_SCALE` because their own per-pixel constant is
  nearly twice the range's. The response is squared: small pushes aim, full
  pushes spin.
- **FIRE forwards its own drag as look travel** (`engine.lookBy`). One thumb
  otherwise has to choose between holding the trigger and correcting the aim,
  which is the single worst thing about touch shooters.

Layout was the fiddly half. The HUD assumed free bottom corners, so everything
anchored there is lifted by one `--touch-inset` variable; portrait has no room
for two sticks and a trigger across 390px, so the trigger stacks above its stick
and the readouts move to the top-right. A landscape phone also now gets the
stacked page layout — the `max-width:720px` block gained an
`(orientation:landscape) and (max-height:560px)` arm — rather than the desktop
two columns squeezed into 844px.

The sticks are aria-hidden (a bare drag surface announces nothing useful) but
every action button keeps `aria-label`, because short screens drop the visible
labels. The bar below the scene stays as the keyboard/AT path and is hidden only
in immersive fullscreen.

`pnpm test:touch` is the new browser smoke: an emulated phone, real
`Input.dispatchTouchEvent` sequences, asserting the sticks walk and turn, that a
half-push covers less ground than a full one, that FIRE-and-slide both shoots
and aims, that the crouch latches, and that entering by touch never requests
pointer capture. 581 unit tests (+25), typecheck and build pass; `pnpm
test:pointer` and `pnpm test:fps` still pass, so the mouse path is intact.

Two failures in this container are not from this work: `pnpm test:vehicles`
fails identically on the unmodified tree (fixed 1.1s key-holds against a
software renderer, no pace knob), and `pnpm test:expedition` asserts three
districts in the network list when there are now nineteen.

**Latest: blockplaySG installs as an app (2026-09-21).** A web app manifest,
four generated icons, and a service worker built by `scripts/service-worker-plugin.mjs`
out of `src/sw/service-worker.ts`. No new dependency: the plugin runs a second
Vite build in `closeBundle`, after the app bundle exists, so the worker can
precache that build's hashed filenames and land unhashed at `/sw.js` — a worker
only controls its own directory and below.

**What is cached is a decision, not a default.** The 1.6 MB shell (HTML, JS, CSS,
manifest, icons) is precached at install; the ~10 MB under `public/` — district
geometry, weapon models, the 2.6 MB voice pack — is cached the first time it is
used, so installing does not download nineteen districts for a player who opens
two. `/api/*` is never cached: a cached companion answer would make an
unreachable backend look like a working one. On activation the worker drops
older shell caches and any media whose filename carries no content hash, because
a rebuilt `scene.json` or `.glb` changes under the same URL while the hashed
voice files do not.

Routing lives in `src/lib/sw-policy.ts` rather than in the worker, so it is
ordinary tested code. The rule that earned its test: a navigation to
`/audio/encik/` or `/connection-check.html` is a real page, not a client-side
route, and must not be answered with the app shell.

An update installs in the background and waits behind a **Reload** pill instead
of swapping code under a running game; `skipWaiting()` only fires when the
player accepts. The header **Install** button appears only while the browser is
offering `beforeinstallprompt`, which is why `src/lib/pwa.ts` builds its store at
import time — the event beats React's first render. iOS has no such event; the
About dialog names Add to Home Screen.

`pnpm test:pwa` serves `dist` from its own static server so it can stop it and
reload. With the server stopped, the district list, the mode cards and the
Marina Bay scene (live WebGL context, `0 / 14 stamps`) all came up, a warmed
`.glb` still loaded, `/api/health` correctly failed, and nothing reached the
absent server. 556 unit tests (+21), typecheck, build and `pnpm test:cloudflare`
against a local Worker preview pass; the Cloudflare check now also asserts
`/sw.js`, the manifest and an icon are served from the root. `docs/PWA.md` has
the full design. Other browser and FPS smokes were not run here.

**Latest: every district sectored (2026-09-21).** 195 sectors across nineteen
districts, nine to eleven each, in `src/data/region-sectors.ts` beside the stamp
lists. Loot spreads across every sector of every district and none falls outside
one; the pilot is over.

**The anchors were placed by a tool, not by hand.** `pnpm sector:anchors` takes
the creative part as input — where a sector is, what it is called, what it is
worth — and does the mechanical part: it seeds each sector from the district's
own stamps and encounter spawns, fills the rest by farthest-point sampling over
the reachable set, insets fill anchors off the rectangle edges so crates do not
land on sector corners, and measures the cover band so no label is a guess.
Five hundred hand-picked positions would not have been reliable. It caught two
of its own bugs on the first run: an apostrophe in "People's Park Complex" broke
the quoting, and a stamp sitting on an encounter spawn emitted a duplicate
anchor, which silently costs a crate slot under the 3 m spacing rule. The test
now guards anchor uniqueness.

Sector names come from each district's stamps and the weights from its zone
description, both of which already named the places and their character. The
lorongs are five narrow sectors in a row across Geylang; Jurong's causeway and
Bishan's stepping stones are the thinnest sectors in the set, deliberately.

**Cover: 137 of 186 new sectors read `open`.** Only HarbourFront has had a cover
pass, so that is the honest state of the maps. Orchard is the best unpassed
district (two dense, six broken); Queenstown and Sentosa measure open
throughout. That list is the work order for the next cover pass, and
`pnpm analyse:cover -- --sectors` regenerates it.

Two test assertions had to change, both because they encoded the pilot rather
than the design. The cover-variety check required two distinct bands per
district, which an unpassed district honestly cannot meet; it now checks
differentiation across the whole tactical tuple (cover, loot weight, tier bias).
And the regression guard asserted named districts had no sectors — now none
qualify, so it pins the useful guarantee instead: the sector path is inert when
a caller supplies no sectors, which is what protects a district whose data is
withdrawn.

535 unit tests (+91, mostly the per-district suite now running nineteen times),
typecheck and build pass. `docs/WORLD-ZONES.md` gained a Sectors section.
Browser and FPS smokes still not run here.

**Latest: sectors wired into the open world (2026-09-21).** Sector data was
inert; it now drives four things in expedition mode. Only HarbourFront carries
sectors, and the other eighteen districts are provably unchanged — the
regression test asserts an unsectored district's loot is bit-identical with and
without the new code path.

**Loot is allocated across sectors** by `lootWeight`, drawing from that sector's
anchors, with `tierBias` leaning the roll. Measured over 400 seeds:

    keppel-wharf  w3.0 bias+1   21% of crates   68% elite weapons
    vivocity      w2.5 bias 0   17%             36%
    cruise-centre w2.0 bias 0   14%             40%
    harbour-depot w2.0 bias 0   14%             39%
    faber-ridge   w1.5 bias+1   10%             72%
    quay          w1.0 bias-1    7%             12%
    boardwalk     w0.5 bias+1    4%             60%

The boardwalk is the shape of the intent: a crate lands there rarely, it is
good when it does, and you are in the open for the whole crossing. The quay you
spawn on is the opposite. Bias leans odds and never guarantees a tier — the
test holds both ends off 0% and 100%.

Sector choice runs on its own RNG stream (`:sectors`), so the existing
`:contents` and `:positions` streams are undisturbed and a district gaining
sectors cannot silently reroll gear. Bias follows where a crate came to rest,
not how it got there, so a fallback position in an exposed sector is rewarded
the same way.

Note a property rather than a bug: with 43 anchors for 11 crates, nothing in
HarbourFront now lands outside a sector, so the perimeter margins are dead
ground for looting. That is arguably right — loot belongs in places — but it is
a choice, not an accident.

**The HUD names where you are.** `hud.sector` comes from `sectorAt`, shows in
the expedition HUD, and posts one comms line on crossing. **Patrols** spawn from
sector anchors as well as the six zone points (`patrolSpawns`), so encounters
stop recurring in the same handful of spots; `createArena` still picks the point
furthest from the living, so `botWeight` controls how much ground a sector
offers rather than how likely it is. **The minimap** tints sectors by cover band
under the roads, in expedition mode only.

`zone-sectors.ts` is now genuinely a pure data module — `coverFor` and
`COVER_BANDS` moved to `cover-metrics.ts`, so importing sector data no longer
drags three.js in through the cover metric.

444 unit tests (+8), typecheck and build pass. Browser and FPS smokes still not
run here, and the expedition UI smoke would be the one worth running for the new
HUD element.

**Latest: cover measured honestly, and HarbourFront passed (2026-09-21).**

**The earlier cover table was wrong and is superseded.** It measured the
movement collision list, which is the wrong set: `Obstacle` is a flat footprint
with no height — what stops your feet — whereas a round is resolved by
raycasting scene meshes (`fps-engine.ts` -> `firstVisibleHit`). The two
disagree both ways. HarbourFront's basin is a 228x40 m collider whose box tops
out at y=0.14, so the whole harbour counted as cover and Jurong Lake read 12.8 m
better than it is; meanwhile loggia bands and bridge decks that never call
`solid()` stop rounds but were invisible. A second bug: the span filter required
1.5 m on the *shorter* plan axis, which throws away every wall, hoarding and
parapet while keeping nothing useful.

`src/game/cover-metrics.ts` now measures from rendered geometry with real
heights. A mass is cover if its longer plan axis is >= 1.5 m, it starts at or
below 1.0 m, and it reaches 1.15 m (crouch) or 1.75 m (stand) — the engine's two
eye heights. Water, kerbs, canopies and lamp posts drop out on their own.
Distances come from an exact squared-distance transform over a 2 m lattice,
O(cells) rather than pairwise: Queenstown alone yields ~14,700 instance boxes.
`standable` narrows "open" to ground a player could occupy, so a district does
not read worse for having water in it.

**Corrected baseline** (crouch median, worst first):

    bukit-timah 42.0  upper-thomson 41.2  tampines 41.2  queenstown 37.7
    sentosa 37.2  jurong-lake 36.2  toa-payoh 36.2  woodlands 32.3
    marina-bay 30.1  changi 30.1  punggol 30.0  chinatown 26.8  tuas 26.1
    bishan 26.0  raffles-place 24.1  geylang 22.8  orchard 20.9
    kampong-glam 20.0  harbourfront 20.0

**HarbourFront has had the pass.** 32.0 m -> 20.0 m district-wide, and every
sector now sits between 4.5 m and 10.0 m, against a target of 8-12 m. It is the
best-covered district in the set. Added in the idiom of the place, not as
crates: quay shelters, baggage cages and planter walls down the promenade;
planter beds and shelter pods along the boardwalk; a four-column ridge-walk of
shelters, terraced planters and boulders across the Telok Blangah green;
container flats and a service compound on the gateway lawn; parked trailers and
pallet stacks on the depot apron.

The gateway lawn carries the practice range, so everything there sits west of
x 162, east of x 200 or south of z 44 — outside the cone from the range spawn to
its furthest target, and clear of the helicopter climb-out. The FPS sightline
and departure guards passed unchanged, which is what proves it.

The district-wide 20.0 m does not go lower because the bare perimeter margin
outside the loop road is standable and has nothing on it. That is honest: the
sectored places are covered, the leftover ground is not.

**Tooling, committed.** `pnpm analyse:cover` (`scripts/cover-report.mjs`) reports
per district and, with `--sectors`, per sector; `--json` for machine use;
`--district <id>` for one. Formatting only — the measurement lives in
`cover-metrics.ts`, so the report and the `zone-sectors.test.ts` label guard
cannot disagree, following the `analyse:weapons` precedent. Both apply the same
`standable` narrowing; they were briefly out by 0.2 m before that was fixed, and
a sector sitting exactly on a band edge is worth nudging rather than leaving.

**Bands are recalibrated** to dense <= 6 m, broken <= 12 m, open > 12 m. They
describe a district that has had a pass; expect an unpassed one to read `open`
almost throughout. That is the point, not a miscalibration.

Still open, and it bears on using this as a design target: the Penetrator
magazine sells rounds that carry through cover, so cover's worth is now partly a
function of what the shooter bought. The geometry metric does not model that.

436 unit tests (+7), typecheck and build pass. Browser and FPS smokes still not
run here.

**Latest: the cover measurement, and what it says about every map (2026-09-21).**
Sectors gave us an instrument, and the first thing it measured is the real
problem with these districts. Across all nineteen:

    district        playable      median run to cover
    bukit-timah      189k m²           43.9 m
    tampines         190k m²           42.0 m
    toa-payoh        190k m²           39.4 m
    upper-thomson    192k m²           38.4 m
    queenstown       205k m²           36.0 m
    harbourfront     169k m²           32.0 m
    kampong-glam     149k m²           18.0 m   (the best one)

A competitive FPS map is on the order of a hundred metres square with cover a
step or two away. These are 15-30x that playable area with a median run to
cover of 18-44 m — five to eight seconds fully exposed at the engine's 4.2 m/s
walk. That, not a shortage of named places, is why the maps do not fight well.
**Median-to-cover is the number to drive down; 8-12 m is the target.**
`measureSectorCover` computes it for any bounds, so progress is checkable.

Sector granularity is capped by this: you cannot name a pit that does not
exist. Nine sectors on HarbourFront is not too many, but five of them measured
zero usable cover, so they are nine names for four places and five fields.

**Keppel wharf is the worked example.** Its container row stepped x by a fifth
of the loop index, so five eleven-metre boxes landed within eight metres of
each other and collided as one blob — the apron measured 4% solid under a zone
description promising cover there. Relaid as four rows with driving lanes
between them: **8.9 m -> 4.5 m median**, and it is now the only ground in the
district with cover worth the name. The zone description is true rather than
aspirational for the first time.

**The cover bands are distance-only, and that correction matters.** The first
version also gated `dense` on a quarter of the ground being solid. The
measurements read backwards: VivoCity is 57% solid with an 8.2 m median because
its solid is one mass you run around; the wharf is 9% solid with 4.5 m because
its solid is scattered rows. The second is better cover. Only distance is
measured now.

Worth keeping: **cover labels must be measured, not eyeballed.** Of nine
hand-written labels, three were wrong on the first pass and three more moved
when the bands were corrected. `zone-sectors.test.ts` holds every label to the
built scene, so one cannot drift from the geometry it describes.

353 unit tests and typecheck pass. The scene change is geometry, so the road,
reachability, sightline, helicopter-departure and draw-call guards all
exercised it. Build not re-run (nothing touched the Vite config, entrypoints or
worker); browser and FPS smokes still not run here.


**Latest: sectors, piloted on HarbourFront (2026-09-20).** A district has until
now been one uniform tactical unit: `risk`, `lootTier`, `botCount` and the loot
rules are per-district scalars, and the six `encounterSpawns` do double duty as
bot spawns and loot anchors (`fps-engine.ts:127`). So a map had no interior
structure any system could read, even though every zone description already
names two or three places in prose. `src/game/zone-sectors.ts` is that structure:
named sub-areas with bounds, a cover character, loot and patrol weights, a tier
bias and curated anchors.

Data only so far — nothing consumes it yet. The consumers are loot allocation
(weight the `kinds` array across sectors, which needs its own RNG stream or it
breaks the existing "contents and positions are separate streams" guarantee),
patrol seeding in `createArena`, minimap tinting via the existing `decor`
rects, and a sector-name callout on crossing.

Sectors live in their own module rather than in the scene files, for the reason
the zone spawns do: `world-zones.ts` and `zone-sectors.ts` stay free of three.js,
and the test builds the real scene so a geometry change cannot silently wall a
sector off.

Two things worth keeping. **Cover labels must be measured, not eyeballed** —
`measureSectorCover` samples usable cover (anything under 1.5 m is a lamp post,
not cover) and `coverFor` bands it; the test holds every declared label to it.
Three of nine hand-written labels were wrong, including Keppel wharf, which was
declared `dense` on the strength of its gantries and measures **4% solid**. That
is a real finding, not a naming slip: the zone description promises "the wharf
end has cover" and the geometry does not deliver it. The fix is deepening the
container stack, not a kinder label. **Telok Blangah green measures 0% usable
cover** — four tree trunks — so arriving from the Queenstown checkpoint means
arriving in the open.

HarbourFront now reads 2 dense / 2 broken / 5 open, which is coherent with its
`risk: high` rating: it is dangerous because there is nowhere to hide, not
because it is crowded.

353 unit tests (+6) and typecheck pass; build not re-run as nothing touched the
Vite config, entrypoints or worker, and browser/FPS smokes still not run here.

**Latest: ballistics, range damage and penetration (2026-09-20).** The armory
roadmap's phases 0, 1, 1b and penetration are in; 2, 4, 5, 6 and zeroing are not
started. Weapons carry a `ballistics` spec and a trait list, and `resolveLoadout`
folds traits beside the scalars, so the shop, engine, arena and expedition cannot
disagree about what an item does. Hitscan is the degenerate case, not a second
path: infinite velocity and no drop collapse to the single straight raycast, and
an instant weapon never enters the in-flight list.

`hitDamage` resolves every round from the range it travelled and the zone it
struck; targets gained a head collider above centre mass. Rifle and support
weapon now have different effective bands, and drill targets at 12.0-30.3 units
sit inside the rifle's but across the support weapon's. Marksman and Bastion
extend the ladder to levels 6 and 7 and carry the first finite muzzle
velocities; the Penetrator magazine sells shots that carry through cover.

The AI pilot holds over for drop and tests its firing gate against the
compensated error. `PilotContact` carries range and the observation carries
ballistics, both copied explicitly through the strategy whitelist, which drops
what it does not name. JSON has no Infinity, so a hitscan velocity crosses the
wire as null and is restored to instant.

**378 tests, typecheck and build pass.** Browser: armory, FPS and optics smokes
pass, plus a seeded ballistic loadout resolving a kill across frames. Chromium
here needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL, and
the fixed key-hold smokes are pace-sensitive on it: a first cold run can fail on
movement and pass on re-run. `pnpm test:fps:pilot` times out clearing eight
targets, verified identical on the previous commit, so it is the known
software-renderer pilot limit rather than a regression. See
[armory roadmap](../docs/ARMORY-ROADMAP.md).

**Armory roadmap (2026-09-20).** Planning only, no code. `docs/ARMORY-ROADMAP.md`
records the decision that the shop sells power on a strict ladder and behavior on
a second axis, and sequences the work in seven phases. Key constraints found while
scoping: `resolveLoadout` is a scalar fold over five numeric fields, so no catalog
item can express behavior; drill targets sit 12.0-30.3 units from spawn, making
realistic muzzle velocities invisible in the range; `simulation.shoot()` returns an
`ArenaShot` in the same tick, so travel time forces deferred host resolution; and
`fps-pilot.ts` nulls aim error without leading, so ballistics would worsen the
recorded 5/8 stall. Sidegrades, per-weapon upgrade points and weapon condition were
considered and rejected by the owner. The token level-gate bypass is left open as an
owner decision. See [armory roadmap](../docs/ARMORY-ROADMAP.md).
**Latest: Bukit Timah and Bishan (2026-09-20).** Nineteen districts, 209
stamps. These close the two thin regions the last coverage pass left: the
north-west and the north-east belt. One district each rather than one per town
— Choa Chu Kang, Bukit Panjang and Clementi are much the same as each other,
and so are Ang Mo Kio, Hougang and Sengkang; Bukit Timah and Bishan are the
ones with distinct material.

Bukit Timah brings the first real topography: a ridge terracing up to a trig
marker, the old rail corridor on ballast and sleepers crossing the road on a
Warren-web truss, and black-and-white bungalows on pier undercrofts.

Bishan added a pattern worth reusing. Every channel before it was an
axis-aligned rectangle or a list of them, which a meander cannot be; its river
is a chain of short boxes stepped along a sine curve, overlapping so the chain
collides as one continuous bank while each box stays axis-aligned. The
gap-at-every-street rule still applies to the chain. `docs/DISTRICTS.md` records
it, since it is the general answer to curved water.

Coverage now: 79% of the mainland north-south, 80% east-west, mean
nearest-neighbour 3.8 km, every planning region represented. Bedok and Pasir
Ris are the only named towns still unbuilt, and Tampines carries that region.
347 unit tests, typecheck and build pass; browser and FPS smokes still not run
here.

**Earlier: the three coverage gaps filled (2026-09-20).** Seventeen districts,
187 stamps. Woodlands, Tampines and Toa Payoh close the three holes the
coverage review named. Woodlands puts the causeway and its checkpoint across
the strait, crossed in exactly two places, both gaps in the water rather than
decks over it. Tampines has the round market — a drum of outward stall bays
under a radial roof — with a banked stadium bowl and a filled quarry. Toa Payoh
is the first-generation new town the set lacked: balcony access decks, a
Y-plan point block, the mosaic dragon and the spiral park lookout. Queenstown
is no longer the only housing estate.

Watch the FPS district test, not just regions.test: Tampines passed the region
bar but failed `fps-districts.test.ts`, whose sightline and helicopter
climb-out checks caught scrub and a tree crown laid through the practice range.
And `region-selection.test.ts` had used 'tampines' as its example of an unbuilt
district, which building one quietly falsified; it now names places kept off
the roadmap.

Coverage after this: the remaining thin spots are the north-west (Choa Chu
Kang, Bukit Panjang, Clementi, Bukit Timah) and the north-east belt (Ang Mo
Kio, Hougang, Sengkang, Serangoon). Bedok and Pasir Ris are still unbuilt in
the east, though Tampines now represents it.

**Earlier: Tuas (2026-09-20).** Fourteen districts, 154 stamps. Added after a
coverage review showed nine of thirteen districts sat within 6 km of Raffles
Place, with nothing at all in the far west. Tuas is the first district with no
housing or shopfronts in it: tank farms behind bunds, trayed columns under a
guyed flare, a pipe rack with an expansion loop, a stepped dry dock with a hull
on keel blocks, rail stacking gantries over container rows, and a pylon run
down the eastern aisle. The strait sits outside the perimeter loop so no street
runs into it, and the Tuas Link terminus rides over the coast road on piers
rather than blocking it. Links to Jurong Lake only — it is the end of the
island. 317 unit tests, typecheck and build pass; browser and FPS smokes still
not run here.

Coverage after this: the north is still empty (no Woodlands, Sembawang,
Yishun), as are the eastern heartlands (Bedok, Tampines, Pasir Ris) and the
mature HDB belt (Ang Mo Kio, Bishan, Toa Payoh). Queenstown remains the only
housing estate, and it is the atypical heritage one.

**Earlier: scene code-splitting measured, then dropped (2026-09-20).** The
standing follow-up — every scene builder statically imported, so all districts
ship in the main bundle — was measured rather than acted on, and is not worth
doing. Cold load is 412 kB gzipped: 241 kB `index` plus 181 kB `three`. Each
district costs ~4 kB gzipped (measured: six districts added 25 kB), so all
thirteen are ~54 kB, and splitting still loads whichever district you enter, so
the real saving is ~50 kB **once**, on a cold visit, against filenames that are
content-hashed and cached indefinitely after that.

Against that: `build()` is synchronous and called from `RegionGame`,
`district-world.ts` and `fps-engine.ts`, so splitting makes it async through the
FPS startup path; and the expedition crosses checkpoints between districts at
runtime, which is instant today and would become a fetch on each first
crossing. Prefetching neighbours to avoid the stall gives the saving back. If
bundle size ever matters, `three` is 44% of the total and is the only target
worth attacking — and measure time-to-interactive first.

**Earlier: Geylang (2026-09-20).** Thirteen districts are playable, 143 stamps.
The lorong grid is the district: six close-set numbered lanes at 56-metre
spacing, terraces turned outward onto them with a back lane between, and a
canal along the rear bridged at every lane. It links Kampong Glam to Changi,
which is the first time a new district has been slotted between two existing
ones rather than hung off the end. 310 unit tests, typecheck and the build
pass; browser and FPS smokes still not run here.

**Earlier: five more authored districts (2026-09-20).** Twelve districts were
playable, 132 stamps. Upper Thomson, Punggol, HarbourFront, Sentosa and Orchard
Road were added on the existing platform — a registry entry plus a scene file
each, with no change to `RegionGame.tsx`, the minimaps or the harness. All five
were authored from general knowledge with **no reference capture and no Google
API requests**, so nine of the twelve now record an empty `referenceFeatures`
list and only Marina, Raffles and Queenstown are reference-informed. Three new
checkpoint pairs link them in: Chinatown to Orchard to Upper Thomson to Punggol
to Changi, and Queenstown to HarbourFront to Sentosa, which is reachable only
across its boardwalk. Water is now cast as a list of spans wherever a road has
to cross it, and HarbourFront's middle street is laid by hand so it stops at
the quay; `docs/DISTRICTS.md` has both patterns. 304 unit tests, typecheck and
the production build pass; the browser and FPS smokes have not been run in this
environment (they need Vite plus Chrome with remote debugging). The main bundle
is now 711 kB / 238 kB gzipped, since every scene builder is still statically
imported.

**Earlier: four authored districts and a region platform (2026-09-19).** Seven
districts are playable. Adding one is now a registry entry in
`src/game/regions.ts` plus a scene file built with `src/game/scene-kit.ts`;
`RegionGame.tsx` is the single walk/drive harness and `regions.test.ts` holds
every district to the same reachability, drivable-road and batching bar.
Chinatown, Kampong Glam, Jurong Lake and Changi were authored from general
knowledge with **no reference capture and no Google API requests**, and record
an empty `referenceFeatures` list; they have no learning cards and no guide
panel. Read `docs/DISTRICTS.md` before adding or describing a district. 274
tests, build and a seven-district browser smoke pass.

**Latest: counter-fire freeze fix (2026-09-13).** Reproduced the first incoming-shot line-of-sight check crashing the frame loop: floating vehicle label sprites were included in camera-free raycasts, but `Sprite.raycast` requires a camera. Opening audio only coincided with the first attack. Vehicle labels now opt out of raycasting; physical vehicles remain cover. Added a regression using the actual vehicle scene and `test:fps:counter-fire`, which passes repeated damage, movement and Escape checks in all three districts with no uncaught errors or live map requests. 240 unit tests and Cloudflare build/dry run pass.

**Latest: simultaneous mouse aim/fire fix (2026-09-13).** Reproduced RMB-held then LMB missing fire: pointer events report only the first mouse press/final release in a button chord. Shared FPS engine now uses captured `mousedown`/`mouseup` for independent mouse buttons; touch/pen drag remains on pointer events, Q retains its own aim latch, and mouse handlers ignore AI control. Disposal removes both new listeners. Expanded `test:fps:aim-toggle` reproduces the failure before the fix and passes both press/release orders, repeated LMB firing under held RMB, no stuck fire/aim, Q+RMB coexistence, reload/switch/pause reset and AI isolation with eight targets cleared. Single-click test waits for ammo change instead of a short VM-sensitive sleep. 239 unit tests and Cloudflare build/dry run passed.

**Latest: Cloudflare deployment setup (2026-09-13).** Added Workers static assets plus the existing Node companion through `cloudflare:node`, same-origin HTTPS validation, API-first routing and `/api/health`. `pnpm build:cloudflare`, `check:cloudflare`, `preview:cloudflare`, `deploy:cloudflare` and `test:cloudflare` are ready. The cloud build keeps companions/LLM strategy available, offers Solo arena, and disables unsupported LAN host/join; local LAN and the static Sites build retain their behavior. Wrangler 4.127.1 is pinned with pnpm 11 and the unchanged two-week cooldown; workerd's binary installation is allowed. Private keys use Worker secrets; local preview reads only `.dev.vars`. **239 tests, cloud build/dry run, local workerd routing/model/audio smoke and production browser Queenstown FPS/pointer-lock/minimap checks passed.** Local verification used no paid service calls. Published directly to **https://blockplay-sg.sunjc826.workers.dev** in the user-selected Sunjc826 account; config pins that account. Uploaded the existing OpenAI key as a private Worker secret. Live asset/API smoke and browser Queenstown FPS/capture/minimap checks passed; one real LLM pilot request returned HTTP 200 with a valid resupply goal. No GitHub integration or repo admin access was needed. Setup and GitHub build settings are in [Cloudflare deployment](../docs/CLOUDFLARE.md).

**Latest: direct FPS in all three districts (2026-09-13).** Queenstown FPS and Raffles FPS now sit alongside Marina FPS. Each loads its actual scene, eight targets, regional spawn/props/car/helicopter, bounds and minimap through shared district configuration/world construction. Switching maps in FPS keeps that mode and starts a fresh range; armory/deploy returns to the selected map. Weapons/ADS/reload, counter-fire, XP, recordings, debug controls and fullscreen use the shared engine. Vehicle movement/dismount accept regional bounds; new-map flight clearance uses static mesh/instance bounds including raised structures. LAN arena stays Marina; expedition's existing world import forwards to the shared factory. **236 tests and production build pass after rebasing onto `origin/main` (`e2f2de1`)**, plus browser checks for all 24 targets with captured mouse fire, map/armory/minimap switching, one active scene, and both new maps' car drive/brake/exit, helicopter takeoff/land/exit guard, fullscreen and mobile layout. No live map/TTS requests. An exploratory Queenstown AI-pilot run stalled at 5/8; manual play clears all eight. Record this as an existing aiming/reacquisition limitation, not a successful AI completion. See [FPS districts](../docs/FPS-DISTRICTS.md). Rebase completed, preserving upstream companion safeguards and the pilot route; all three maps' captured-fire browser checks passed again against the combined version. No push.

**Latest: Encik manifest import fix (2026-09-13).** Moved the canonical manifest from `public/audio/encik/` to `src/audio/encik/manifest.json`; runtime/tests now import it from source, and the batch generator writes future manifests there. MP3s and listening page remain served from `public/audio/encik/`. Verified the actual Vite dev module transform has no public-directory import warning, two recording tests and five mocked batch checks pass, and production build passes. No audio regenerated or credits spent.

**Latest: approved Encik voice and full batch (2026-09-13).** User selected round 4 candidate 3 (then round 4 #1, round 3 #1) and authorized the full batch. Saved the chosen synthetic voice and generated all 48 existing callouts with Eleven v3, preserving subtitle text. Committed assets live in `public/audio/encik/` with hashed filenames, manifest and listening page. Total 2,534,088 bytes / 157 seconds; all 48 decode and are non-silent. Batch cost **776 credits**, matching response receipts and subscription delta; total **1,266/40,000** including auditions. The shared FPS engine now plays bundled MP3s for human/AI events; eight-buffer cache, priority interruption and late fetch/decode cancellation on mute/pause/reset/disposal. Captions/comms survive mute or load failure. No gameplay API key or installed-voice fallback. **220 app tests, nine Node tool checks and production build pass**. Isolated browser verified real recorded playback, voice/master mute, pause, subtitles and zero browser TTS/ElevenLabs requests. Node check files renamed `-check.mjs` to prevent Vitest collecting `node:test` suites. Generation caches are ignored; markers prevent accidental spending after failures/timeouts. See [recorded callouts](../docs/ENCIK-VOICE.md). No further generations authorized by this batch; request feedback before regenerating variants.

**Latest: Encik audition round 4 (2026-09-13).** User ranked round 3 #1 best, #3 second, rejected #2 for British drift; #1 sounds too young. User requested further improvement. One authorized request used the same 127-character dialogue/model/seed/guidance, changing description to around sixty with chest resonance, worn texture and measured delivery. Three valid MP3 previews (10.0s, 8.8s, 9.3s) at `.cache/encik-audition/36b76e0cf1bd/index.html`, with round 3 #1 embedded for comparison. These are newly designed voices, not edits of #1. Follow-up quota: 127 credits for round 4, 490/40000 total used. Four mocked tests pass. Await user feedback before further generation; no saved voice or full batch.

**Latest: Encik audition round 3 (2026-09-13).** User found round 2 accents natural and #2 hostile but insufficiently coarse/crude; explicitly authorized another two-line audition. Retained Singaporean/kopitiam direction, adding grainy rasp, weathered throaty texture, weary irritation and short barks, plus blunter 127-character dialogue. One Voice Design request returned three valid MP3 candidates (7.1s, 7.2s, 6.8s), at `.cache/encik-audition/0731c4fd24ac/index.html`; comparison links to round 2. These are new designed voices, not edits of round 2 #2. Follow-up quota: 127 credits for round 3, 363/40000 total used. Four mocked tests pass. Await user feedback; no voice saved and full batch still on hold.

**Latest: Encik audition round 2 (2026-09-13).** User rejected round 1 accents: 1/3 British-sounding, 2 slightly Hong Kong-ish, and explicitly approved one more small set. Changed only the voice description to everyday colloquial Singapore English / understated kopitiam conversation; same two lines, seed, guidance and model. One API request returned three valid MP3 candidates (8.0s, 6.8s, 8.0s), saved at `.cache/encik-audition/7ce08f42e116/index.html`, with a link to round 1. Follow-up usage confirmed 118 credits for round 2, 236/40000 total used. Four mocked tests pass. Await user feedback before any further generation or saving a voice. Full game callout batch remains on hold.

**Latest: paid-plan Encik audition succeeded (2026-09-13).** User upgraded to Starter and authorized retrying the same two-line audition. One Voice Design v3 request returned three valid mono 44.1kHz/128kbps MP3 candidates (7.4s, 8.8s, 7.8s). Listen at `.cache/encik-audition/93f198a2b596/index.html`; MP3s and generated voice IDs are cached alongside it. The immediate quota delta was zero; a subsequent read confirmed **118 credits used of 40,000**, recorded in `usage-followup.json`. Key permissions now suffice. The tool now allows paid plans and rejects Free before generation, while retaining included-quota checks, permanent attempt markers and no automatic retries. Four mocked tests pass. Confirmed prior free-plan denials were archived before the authorized retry. **Wait for the user to pick a candidate before saving a voice or generating the full callout pack.** No game audio changed. See [audition setup](../docs/ENCIK-AUDITION.md).

**Latest: trackpad aim toggle (2026-09-13).** Q toggles the existing human aim latch, while RMB still holds aim. Key-repeat does not retrigger it; reload, weapon swap, pause and control handoff clear it. The on-screen Aim button and Q use the same guarded function and are ignored during AI control, death, vehicle use or reloading. Pilot aim decisions and action application are unchanged. Shared weapon HUD and practice/arena/expedition control guides show Q. Build and 14 focused pointer/pilot tests pass; `pnpm test:fps:aim-toggle` verified released-Q scoped firing, repeat suppression, RMB hold, reload/switch/pause reset and AI isolation with all eight targets cleared.

**Latest: Encik radio, comms history and ADS recovery (2026-09-13).** Added 48 fictional Singaporean radio lines for combat, reloads, supplies, AI movement/stuck recovery and match events. Installed local English TTS prefers en-SG; subtitles/log entries survive voice mute. No remote TTS required. A shared cooldown/priority director prevents speech queues and repeated frame-rate requests; player AI can request contact/moving/stuck through its bounded action contract. FPS and expedition share a timestamped, channel-filtered, expandable 100-entry speech/kill/system log, carried with the voice preference across districts. History stays put when scrolled up and resets with a round. Arena entries use the existing public kill feed; this is session history, not LAN text chat. Reproduced another ADS loop after pause/resume: transient scope occlusion caused target switching. The pilot now holds its target briefly and, if visibility fails, reacquires at hip for three seconds before trying ADS again. Browser `test:fps:radio` passed all eight kills, muted callout logging, filters/history and mobile width. 213 tests and production build pass. Additional browser checks confirmed installed local speech invocation/mute, fullscreen log bounds, and comms/voice-preference carry across district travel. Physical voice accent/quality depends on installed OS voices.

**Latest: AI player pilot and optional strategy plugins (2026-09-13).** Watch AI play runs an observation-limited local controller through normal player movement, look, fire, reload, pickup and checkpoint functions. Take control restores pointer capture; Escape/Stop AI pauses even with the strategy selector focused. ADS alignment/hysteresis fixes the reproduced scope-toggle stall; browser cleared all eight practice targets. Local and optional LLM strategists share a plugin contract; the new `/api/adventure/pilot-plan` endpoint uses server credentials and `PILOT_MODEL` (default `gpt-5.6-luna`). Restart `pnpm server` for this route. Requests are throttled, abortable and validated against current known waypoints, with local fallback. Expedition checkpoint state carries pilot/strategy mode and resumes after loading. Verified 207 tests and production build, real LLM response and UI selection, pause/takeover, and autonomous loot/checkpoint travel into CBD. Navigation is heuristic; existing squad NPCs have not migrated to the player perception contract, and permanent NPC lives are not implemented. See [AI pilot](../docs/AI-PILOT.md), `pnpm test:fps:pilot`, and `pnpm test:fps:pilot:travel`.

**Open-world review / LAN region crash (2026-09-13).** Reproduced a blank React page when selecting Queenstown on plain LAN HTTP: `learning-guide.ts` still used `crypto.randomUUID()` directly. Raffles shares the same guide. Switched to the shared `randomUuid()` fallback; both-region regressions fail before the fix and pass afterward. Expedition UI smoke passes on both localhost and `http://192.168.65.2:5173`, including map selection, district entry, minimap, input, fullscreen and cleanup. Travel smoke passed all four gateway directions with carried health/armor/ammo/field variants and persistent collected crates. Focused tests and build passed. **Remaining integration gap:** expedition kill feed only updates announcements; neither `ExpeditionGame` nor `updateArena` connects elimination XP to the permanent armory. Expedition state is in memory, solo only, and uses explicit T checkpoint travel. Menus intentionally keep patrols active.

**Latest: SAR optic attachments and PiP (2026-09-13).** Issued SAR now uses the native integrated 1.5× scope; the GLB exports its complete scope/bridge as `sar21-inspired__optic`. The 350 CR level-1 red-dot conversion replaces that assembly with a rail and unmagnified reflex sight. Removing the optic restores the issued setup. Precision lens saves remain compatible and use 1.75× PiP. `weapon-optics.ts` supplies shared shop/game geometry and a reusable 384×384 scope target; peripheral FOV stays unzoomed and the extra world pass runs only for active magnified ADS. Ultimax defaults to an unmagnified reflex. Unit suite passed at 186 tests, then two added asset/render-gating tests passed (188 total); build and `pnpm test:fps:optics` passed. Browser check covers shop purchase/equip/removal and scoped/unscoped rendering, with screenshots in `.cache/fps-handling/`. Rebuild only SAR using Blender `--background --python asset-pack/scripts/build_assets.py -- --sar-only`; this also copies the updated GLB into the app.

**Latest: FPS handling, survival controls and upstream sync (2026-09-13).** Rebased main onto `fb8cc47`; restored all local work and retained upstream's concise README, putting control details in `docs/PROJECT-GUIDE.md`. New shared `FpsWeaponHud`, procedural gloved hands and hollow reflex optics keep weapons visible throughout smooth ADS. Reload keyframes remove/reseat magazines and add an empty-reload action; mechanical sound follows phase changes and equipped reload speed. Thin crosshair ticks project the same spread cone used by hitscan, widening with sustained fire/movement and recovering after a 0.2s firing break. ADS/crouch reduce spread; support weapons bloom more. Separate white hit/amber kill markers confirm outcomes. Debug survival in ready/pause menus supplies 1×/5×/10× HP, refill and 10% max-HP/s regeneration after 3s without damage, for practice/solo/expeditions. Session storage preserves settings across zones, medical pickups use the boosted cap, and the solo simulation owns actual health. Host/guest network rooms reject this local debug API. 182 unit tests/build pass; dedicated browser checks cover both ADS optics, tactical/empty reloads, sustained fire, actual solo regeneration/refill/reset; expedition UI passes. New repeatable checks: `pnpm test:fps:handling` and `pnpm test:fps:survival` with a separate Chrome profile on port 9228 and Vite 5175 (override FPS_APP_ORIGIN to test LAN HTTP).

**Validation limit:** the full `test:fps` regression completed all eight targets on one run but failed its final multi-kill assertion after a reload broke the chain; the assertion now observes announcements during the drill. Subsequent VM runs were inconsistent: one paused mid-drill, and the last was still locked but looking into the sky during the initial target test. The targeted handling/survival and expedition checks passed. Do not report the full FPS smoke as passing; verify it in a stable browser input environment.

**Mouse/network diagnosis resolved by user:** the host browsers lacked macOS Privacy & Security → Local Network permission. The user enabled it and confirmed FPS capture/turning works in the host browser. Inside UTM, the guest Dock can still show a cursor despite browser pointer lock; further web pointer changes are not required for host-browser play. The separate LAN HTTP randomUUID startup crash was also reproduced and fixed as described below.

**Latest: LAN HTTP startup crash fixed (2026-09-13).** Reproduced an entirely empty React page at `http://192.168.65.2:5173/`: `createAdventure()` called `crypto.randomUUID()`, which is unavailable on this insecure origin. Added `src/lib/random-id.ts` with a `getRandomValues` UUID fallback and used it for adventure sessions and voice event IDs. A regression test covers startup, reset IDs and stale-response rejection without `randomUUID`. 169 tests and production build pass. A fresh Chrome session on the actual LAN HTTP address now renders the default page and reaches Marina FPS ready with no exceptions. The user's physical mouse issue remains unverified: the cursor reaches the **guest VM's Dock** while the HUD still reports MOUSE LOCKED. Host-browser testing was blocked by the startup crash; do not claim that fixing page loading fixes UTM mouse delivery.

**Latest: mouse capture bypass fix (2026-09-13).** Removed `(pointer: fine)` from FPS input selection. Actual pointer events distinguish mouse from touch/pen; mouse play always waits for real pointer lock. Touch-to-mouse input pauses for recapture. Entry and animation guards prevent mouse play without lock, including a suppressed `pointerlockchange`. Both FPS UIs display capture status beside health/armor. 168 unit tests pass; browser checks cover coarse-device mouse capture, denied capture, native touch dragging, mouse handoff, missed lock notification, multi-turn heading, expedition/fullscreen/mobile. Physical UTM delivery is still a separate user verification; do not claim a synthetic browser test proves host cursor capture.

**Latest: local FPS minimap (2026-09-13).** `FpsMinimap.tsx` is reused by practice, expeditions and LAN. It reuses driving's existing road data and `minimapProjection`; regional stamp/companion map markup remains separate. The SVG follows a local 180m window, points the arrow along camera yaw, shows surviving practice targets/parked vehicles or expedition loot/checkpoints, and highlights the planned next exit. LAN receives no opponent markers. HUD publication remains 10Hz and there is no additional renderer or external request. Unit suite: 167 passing; production build passes. Browser checks pass for FPS target removal, view direction, expedition maps/fullscreen/mobile, car/helicopter play and two-browser LAN with opponents hidden. Pointer/browser checks use integer mouse deltas because the MouseEvent constructor rounds movement to whole pixels.

**Current integration (2026-09-13):** rebased multiplayer/bot-role/expedition work onto `dbeb858`. SingaporeMap now previews checkpoint routes during expeditions and follows actual zone arrivals; outside expeditions it retains upstream region selection. New expeditions start in the selected district. App keeps a stable expedition component while `ExpeditionGame` owns per-zone scene replacement and persistent field loot. Route selection must never remount that session or invoke remote travel. 163 unit tests and build pass, along with expedition UI, four-direction travel, upstream three-region walk/drive/map/mobile and two-browser LAN gameplay checks. See [connected districts](../docs/WORLD-ZONES.md), [LAN setup](../docs/LAN-ARENA.md), [role plugins](../docs/arena-plugins.md), and [feature parity audit](../docs/FEATURE-PARITY.md). FPS local minimaps were added in the subsequent pass described above. The entries below document earlier milestones and their then-current limitations.

Last updated: 2026-09-13. Start by reading this file, `.agents/PLAN.md`, and `README.md`, then inspect the checkout and any applicable `AGENTS.md` instructions.

Regional education added: `src/data/raffles-guide.ts` and `queenstown-guide.ts` each contain six source-checked cards covering all 11/eight game stops. Shared catalog now has 18 topics. `RegionGuide.tsx` and `learning-guide.ts` bridge current position/stamps into an education-only companion; they cannot mutate game state. Queenstown/Raffles reset remounts the panel and clears history, while region switches cancel requests. Backend accepts all three region snapshots but only Marina may propose objective changes. Luna text and GPT-Live-1 voice remain shared. Live browser verified Queenstown library and Boat Quay answers with unchanged stamps; physical microphone quality remains untested. Theme-to-stop mappings are not surveyed landmark coordinates.

Latest model choice supersedes earlier Astra runtime instructions: use `gpt-5.6-luna` for companion text interpretation and delegated transcripts, as requested by the user. Speech stays `gpt-live-1`; no automatic fallback. UI and server tests identify Luna. Astra remains the build tool, and historical Astra test results below are not Luna verification.

Luna browser failure resolved: a stale frontend returned 404 for API requests while backend port 3001 succeeded. Restart `pnpm dev` after proxy configuration changes (and `pnpm server` after server changes). Live Luna education/closer/named/skip now verified in browser; 109 unit tests and build pass. A missing-route error now gives explicit restart guidance instead of a generic model failure.

Navigation simplification: Joyride and fixed-camera Target practice are removed from the app. Region Walk/Drive, Street View and Marina FPS remain. Armory is reachable only from the Marina FPS briefing/pause screen’s Open armory button, not the sidebar; FPS remains selected while shopping. Historical prototype source remains unmounted. Browser shop scripts enter FPS before opening the shop.

Location/UI follow-up: only Marina Bay, Raffles Place and Queenstown remain selectable. `SingaporeMap.tsx` supplies a local SVG overview and central inset, linked to the same selection handler with click/keyboard controls; no Maps calls. Reset labels disclose stamp/history clearing, Privacy describes region/mode progress loss, The idea covers education/fullscreen, and Joyride is correctly labelled a 240 m checkpoint run. Motor Pool no longer exposes weapon attachment controls; level 50 has maximum-level copy. Tests cover the location list, map selection and keyboard access, About/Privacy, separate armory panels, and maximum-level wording.

Independent follow-up copy review is clear within its reviewed scope after fixing Target practice’s reset label and specifying Marina FPS credit rewards. Verification: 108 tests, production build, companion/copy/armory browser checks and all three regions/map selection/keyboard/mobile checks pass; no Maps calls or uncaught browser errors. Existing Three.js chunk-size warning remains nonblocking.

**Combined companion/FPS checkpoint:** rebased the adventure companion, educational guide and objective highlights onto `2b8257c` (FPS armory/progression/vehicles/fullscreen). Preserved both sets of styles, handoff history, and privacy disclosures for local armory storage and optional OpenAI interaction. Combined unit suite: **106 tests passing**, production build passing with the existing nonblocking Three.js chunk-size warning. Earlier counts below describe individual milestones.

**Current integrated checkpoint:** rebased FPS, armory, XP, vehicle and asset-pack work onto `2f27af2` while preserving all three region refinements and reference caches. Immersive fullscreen is now available through the toolbar or F; Escape pauses/releases capture, and denied native fullscreen has an expanded-view fallback. The session remains intact when changing screen mode. Current verification: **75 tests + production build**, with local FPS/shop/vehicle/fullscreen browser workflows passing during this integration. Aircraft clearance heights also cover the expanded Marina structures. `pnpm test:fullscreen` is the new browser check; see `docs/ARMORY.md`.

**Latest armory / progression / pointer-capture pass:** Field exchange is available in the sidebar. The FPS session now also includes Utility 01 driving, Falcon 01 flight, E entry/exit, chase cameras, a landing pad and five separately equipped vehicle wraps. It includes 27 permanent items, stronger premium variants, skins, attachments, ILBV/LBS-inspired rigs and separate armor inserts. Level-gated purchasing, 50 XP levels, rank badges and timed double/triple/multi-kill callouts are connected to FPS target health and completion rewards. Optional counter-fire applies actual armor/health damage, dodge warnings and defeat. Desktop gameplay now requires successful pointer lock; Escape releases and pauses, and denied capture prevents play. Wallet/XP/inventory/loadout persist locally; no real payments or backend. See [docs/ARMORY.md](../docs/ARMORY.md) for balance, architecture and sources.

Current verification: **47 tests + production build pass**. Both `pnpm test:fps` and `pnpm test:armory` passed against isolated local Chrome, including all-eight completion, XP/level-up/callouts, shop purchases/equipment/save reload, armor absorption/defeat, mouse confinement and capture-denial regression, mobile layout and mode cleanup. No uncaught browser errors or map requests. Preview/FPS screenshots were inspected; `.cache/` holds local evidence. pnpm 11 and the 14-day dependency cooldown remain intact; no dependencies were added.

**Latest local FPS integration:** Marina Bay now has a separate **Marina FPS** sidebar mode. It reuses the authored map and obstacle collision, adds two local GLB weapons, eight targets, pointer-lock/free movement, sprint/crouch/jump, automatic fire, optical aim overlay, recoil/effects, magazines/reserves, animated reload poses, switching, pause/reset and timed accuracy scoring. Touch controls and touch-device drag-look are included. Desktop pointer lock is mandatory. Files: `src/components/FpsGame.tsx`, `src/game/fps-engine.ts`, `fps-rules.ts`, `fps-raycast.ts`; six portable GLBs under `public/models/field-kit/`. Default Marina walk/drive and the old fixed-camera Target practice remain available. No live map requests, capture spending or new runtime dependencies. Keep pnpm 11.22.0 and the strict 14-day cooldown.

Verification for FPS: **26 tests and production build pass**. Local Chrome smoke passed model loading, target hits, ammo/reload with pause, switching, movement, aim, all-eight-target completion, reset, 390px layout and mode cleanup, with zero map requests and no uncaught browser exceptions. Gameplay/aim/completion screenshots were visually inspected. Actual touchscreen play and physical-device performance remain unmeasured.

FPS is an arcade range with optional target counter-fire and player/armor damage; it has no navigating enemy AI, multiplayer or skeletal hand rig. Viewmodel lenses are opaque; aiming uses a separate overlay. Ground-plane jumping does not let players vault building colliders. FPS dynamic shadows are disabled and pixel ratio is capped at 1.35 for this VM. `pnpm test` includes ammo/occlusion/layout checks; `pnpm test:fps` runs the dedicated local Chrome smoke workflow described in README. Commit/copy the public GLBs with the code; the game does not depend on the asset workshop directory or Blender.

## Newest feature: Marina adventure companion

Educational extension: `src/data/singapore-guide.ts` contains eight reviewed, source-linked fact cards and reflection prompts. `server/adventure-api.ts` adds structured `learn` intent/topic ID selection to the existing Astra endpoint; GPT-Live delegates educational questions too. The shared client validates topic IDs and session/revision before showing a card/returning its facts for speech, without calling the game mutation path. `AdventureCompanion.tsx` adds quick questions and source cards. Ask “tell me about the museum” versus “take me to the museum” to check the learning/travel distinction. Questions about Queenstown/Raffles Place work from Marina; those regions do not yet mount the companion. Keep facts curated, source links trusted and operational information (hours/prices/exhibitions) out of scope unless verified. Current unit/build baseline: 79 tests passing; no new dependencies or Maps calls.

Objective visibility was strengthened: named purple/white minimap diamond/halo and straight-line guide, plus a world-space purple beacon, ground ring and recolored active collectible. `src/game/objective-highlight.ts` owns decorative resources/material restoration; do not change collision/arrival behavior. Its selection tracks the same active ID as the HUD. 74 tests and browser regressions pass.

Read `docs/ADVENTURE.md` before changing text/voice behavior. `pnpm server` loads private `OPENAI_API_KEY` and starts the two API endpoints on loopback 3001; `pnpm dev` proxies them. Never put the key in a VITE variable. Requested models are exactly `gpt-6-astra` and `gpt-live-1`; preserve the separate Live protocol and shared local apply logic. No new dependencies. Game geometry, routes and Google image cache/ledger are unchanged.

`adventure.ts` owns objective IDs, request/revision/session guards and deterministic closer selection; `MarinaGame.tsx` feeds position/collection and draws active HUD/minimap. Reset remounts the panel and invalidates requests. Objective changes must never mutate collected stamps or bypass existing arrival checks. `adventure-client.ts` is shared by text and voice, and only acknowledges a game-applied update. `live-voice.ts` owns microphone/WebRTC/delegation/cleanup; never run actions from transcript-gap heuristics. Origin checks are not authentication: add access control before public deployment. Browser QA commands and synthetic-audio caveats are in `docs/ADVENTURE.md`.

Verified: **72 tests and production build pass**, live Astra text works for closer/museum/skip, and a synthetic spoken request completed real GPT-Live transcription → Astra → applied objective → spoken output. Real microphone and human listening quality remain manual checks. Per-delegation cancellation now blocks stale applies after spontaneous voice closure or newer delegation, even if fetch ignores abort. Pending transcript/reply timers fail back to text; old session cleanup cannot clear a new session’s audio. Secret scan found no OpenAI key in commit candidates or production assets. Keep test input audio streaming after the phrase (the live voice harness pads it), otherwise its media clock can stop before commentary is acknowledged.

## Latest pass: Static references and model refinement

User authorized 25 Static images per region (75 total) to improve model quality, with one refining subagent per world. Root's new `scripts/capture-static-references.mjs` uses the private Static-enabled `VITE_GOOGLE_MAPS_API_KEY`, never the browser-only demo key. Plans: `reconstruction/marina-static-quality-plan.json`, `reconstruction/raffles-static-quality-plan.json`, `reconstruction/queenstown-static-quality-plan.json`. Run `pnpm references:static --plan <path> --dry-run` first. References are original JPEGs plus individual source/camera/checksum/review manifests, retained outside public assets. Reusing stored panorama metadata avoids additional metadata calls. Regional allowance baselines/caps are in the ledger; see newest PLAN section for authority and usage rather than older figures below. Preserve independent driving-camera behavior and the current world bounds/objective counts during this quality pass.

Capture completed: all 75 images saved, no failures, zero metadata requests; all three regional allowances are exhausted. Ledger total is 105 conservative Static attempts, not 105 successful image downloads (98 image attempts plus seven metadata attempts). Cache-only reruns require no credentials/network. New image review: Marina 19 accepted/six limited, Raffles 25 accepted, Queenstown 23 accepted/two limited. Read `docs/MARINA-EXPANSION.md`, Marina `references/static-quality-review.md`, and both other `REGION.md` documents for the image-to-model mapping. All three models now have richer structural/material detail while preserving their extents and 14/11/eight objectives. Full reference cache: 285 images. Do not reinterpret the remaining global safety cap as authorization to fetch more Static images.

Final quality-pass verification: **48 tests across 15 files, production build and all three region browser/camera/mobile checks pass**. Browser checks made zero Maps requests and had no uncaught errors. Targeted model close-ups were reviewed; all 285 reference checksums and the credential scan pass. The existing Three.js chunk-size warning is nonblocking. No dependencies changed; retain pnpm 11 and strict 14-day release age. Remaining work: human full-objective play-through, actual-phone performance, camera occlusion, NPC/traffic behavior and geographic refinement, then deployment/video. All sections below record earlier milestones; their quotas and counts are superseded by this section and the newest PLAN entry.

## Earlier scope: all three regions expanded

Completed the further large reference-and-map expansion with one modeling agent per region; browser operations remain serialized. Current worlds: Marina **726 × 616 / 14 stamps**, Raffles **580 × 399 / 11 stamps**, Queenstown **520 × 424 / eight stamps**. Latest pass added 114 screenshots; the full portable cache contains **210 images** (72 Marina, 64 Raffles, 74 Queenstown), all checksum-valid. Read the newest PLAN section and scoped region documents first. `pnpm references:inventory` is an offline checksum/review inventory; keep the cache and manifests together and preserve rejected captures. Queenstown now uses bounds-derived minimap projection and exported road paths, matching Marina/Raffles; all region HUD stamp counts must remain dynamic.

Latest capture plans: `reconstruction/marina-district-browser-plan.json`, `reconstruction/raffles-expansion-browser-plan.json`, `reconstruction/queenstown-district-browser-plan.json`. Marina/Raffles are fully cached; Queenstown saved 34/40 before stopping, so a full run without `--dry-run` would intentionally fetch missing images. Do not blindly rerun it. Earlier Queenstown plans retain original/replacement frames and their review outcomes. No new dependencies; pnpm 11 and strict two-week cooldown remain intact.

Verification at handoff: **41 tests, production build, three-region browser/camera/mobile checks and cache checksums pass**. No live Maps calls occur during game checks. Credential scan passed. The build still emits the nonblocking Three.js chunk-size warning. Remaining follow-ups are human full-objective play-through, actual-phone performance, camera collision/occlusion and geographic refinement; current agents' expansion work is complete.

## Current entry point: three regions and independent car camera

Raffles Place is integrated alongside Marina and the richer Queenstown estate. Read `reconstruction/raffles-place/REGION.md` and `reconstruction/queenstown/REGION.md` for geometry, references and review limitations. App uses location ID for default selection, so adding a location no longer changes the default via an array index. `src/game/drive-camera.ts` is the shared driving orbit helper: drag must never modify vehicle heading while in Drive. All three controllers use independent look state, reset it on travel-mode changes, and recenter only while moving after an idle delay. Preserve this behavior in new controllers. Browser smoke covers stationary/moving drag, no accidental steering, recenter/reset/mode switching in all three regions with test-only WebGL camera observation.

**Capture reliability:** serialize capture, selection AND browser smoke runs; do not switch tabs while capturing. Background Street View may report the right POV with old pixels. `capture-readiness.mjs` and the runner enforce foreground/POV/zoom/overlay/repaint checks and detect exact duplicate images; still inspect every frame. Older rejected files are retained and marked in manifests/region notes, replacements use new IDs. Transfer complete region reference directories plus plans/ledger, never environment credentials. Raffles batch: `reconstruction/raffles-browser-plan.json`; Queenstown expansion and replacement plans are in `reconstruction/`. Use `--dry-run` first; cache-only reruns make no requests. Source cache is not copied to public game assets.

## Previous milestone: two region games

**Latest allowance update:** user renewed the remaining Static allowance to **50 images**. The ledger preserves baseline 8 and all history, with `maxAdditionalImages: 65` (15 used + 50 remaining). .agents/PLAN.md is authoritative; older budget figures below are historical. README intentionally omits limits.

The user explicitly expanded work to **Marina Bay and Queenstown** and requested subagents. Marina now spans 556 × 466 game units, with outer road connections and nine collectibles. Queenstown is a separate 368 × 288-unit estate with open void decks, station/train, shops, library-inspired garden and five collectibles. Both are authored compressed interpretations. Prior Marina-only scope notes below are superseded; Tampines/Toa Payoh are still future region maps.

`App.tsx` uses `hasRegionGame`/`regionModeLabel` from `src/game/region-selection.ts` to open the corresponding `MarinaGame` or `QueenstownGame`. Queenstown owns `queenstown-scene.ts`/`queenstown-collision.ts`; Marina uses its expanded bounds/`MARINA_MAP_ROADS`. The Marina minimap is bounds-derived using `src/game/minimap.ts`; HUD stamp count is dynamic. Keyed region switching disposes the outgoing scene.

New cached references: 8 Marina browser screenshots at four new positions; 4 Queenstown screenshots at two positions. Plans: `reconstruction/marina-expansion-browser-plan.json` and `reconstruction/queenstown-browser-plan.json`. Use `pnpm marina:browser-capture --plan <plan-path> --dry-run` before any capture; complete-cache reruns use no requests. Source directories remain `reconstruction/<region>/references/`; preserve metadata/galleries/reports. Budget events now carry the correct region, browser events remain excluded from Static limits, and **35 additional Static images remain**.

Read `docs/MARINA-EXPANSION.md` and `reconstruction/queenstown/REGION.md` for specifics, sources and limitations. `pnpm test:browser` checks both regions with local Vite/Chrome (loopback debugging port 9223 by default; `REGION_APP_ORIGIN`/`CHROME_DEBUG_ORIGIN` overrides). Tests use their own tab, do not load Google Maps, and place screenshots in `.cache/browser-checks/`. Keep checksums, secrets exclusions, pnpm11 and the strict14-day cooldown intact. No public deployment is implied.

**Newest gameplay geometry pass:** cached screenshots now inform angular museum shells/supports/lily pond, Fullerton-inspired stone arcade, roof louvers/masts/stays, entrance canopy/blue fins/bollards, finer paving/rail braces, curved shade beams, benches and planting/shade trees. `reconstruction/marina-bay/references/GAME-DETAILS.md` maps observations to changes. Code: `src/game/marina-scene.ts`; static details remain batched and ground obstacles use existing collision handling. All 20 tests/build and browser movement/reset/mobile checks pass. No capture/API spending; Static allowance remains 35. Other locations remain future work, Marina-only focus unchanged.

**Release handoff:** this milestone includes the game improvements, demo-key browser capture workflow, corrected Static-only budget accounting, batch plan, 15 cached reference JPEGs, 9 cached browser PNGs, metadata/checksums, galleries and benchmark reports. Clone/pull the repository to transfer these references; do not recapture. Private `.env`, model caches and older rejected/source captures remain excluded. The credential scan found no configured API-key values in the files prepared for commit. Remaining work: visual feedback, full collectible completion/actual-phone checks, then deployment/video; no public deployment yet.

## Most recent: batch workflow and corrected limits

**Screenshots do not consume Static API allowances**, per the user's explicit clarification. `api-budget.mjs` and usage reporting now separate them. Static: 15/50 additional images used, **35 remaining**; 23 total images + 7 metadata = 30/1000 conservative Static attempts. Browser: 9 screenshots, 5 panorama loads/changes, 4 selections, separately tracked. Historical shared-limit figures below are superseded; never reset the ledger.

`pnpm marina:browser-capture --batch --dry-run` validates the editable `reconstruction/marina-browser-plan.json` without requests. `--batch` resumes eight configured views across four reviewed centers, reusing panoramas by source, caching PNG/metadata/checksums and generating timing reports/contact sheet. Per-run screenshot bounds are operational safeguards, not Static quota. Cache mismatch stops; use a new view ID for changed camera settings. Fresh captures require local Vite + Chrome debugging; complete-cache reruns are offline. Details in `reconstruction/marina-bay/references/WORKFLOW.md`.

Measured: 8/8 screenshots in 21.826s, four panorama loads/changes, zero Static calls/failures, ~11.4 MiB. Cache rerun: 33ms, eight hits, zero browser/network. All images visually reviewed and metadata annotated; source dates span 2012/2021/2022. **20 tests + build pass**. Keep the reference folder, reports, gallery and plan together for cross-machine reuse. No new game geometry in this pass.

## Latest steering — read first

**Browser/demo-key capture now verified:** Vite explicitly maps `GOOGLE_MAPS_DEMO_API_KEY` to the existing frontend browser-key slot when set; otherwise uses `VITE_GOOGLE_MAPS_API_KEY`. This exposes only the intended browser credential, not all `.env` variables. Static scripts continue using the original key. Restart/reload on key changes; do not print keys.

Run `pnpm marina:browser-capture` for the single configured north-bay view. It uses `scripts/pages/capture-streetview.html` served by Vite and a separate local Chrome debugging tab; blocks Static endpoints; caches a 1280×900 PNG plus metadata/checksum; leaves attribution/date intact. A fresh capture needs Vite and Chrome debug port 9223 (configurable `MARINA_APP_ORIGIN` / `CHROME_DEBUG_ORIGIN`); a cached rerun needs neither a browser nor credentials. Screenshot was visually checked with the demo key and cache rerun made zero requests. No new dependencies. Build/17 tests passed.

**Latest counters:** 36 conservative ledger entries; 23 Static images unchanged; 1 browser panorama load and 1 screenshot reservation newly recorded. Additional-image allowance **16/50 used, 34 remaining** across both capture paths. These override earlier counts below. Screenshot reservations are not Google API calls; Dynamic Street View loads may be billed independently. Cached screenshots are in the same portable reference folder.

**Latest detail pass:** colors and materials now follow reviewed references; Sands proportions use published dimensions at 0.54 landmark scale (ground layout still compressed). More detailed paving/railings/palms/planting/lights, Shoppes podium/roof, tower facades and museum pond/supports are implemented. Static box details are instanced. Current verification: **17 tests + build**, browser movement/reset/mobile smoke; full road clearance and spawn/stamp clearance are unit-tested.

**New capture authority/cache:** up to 50 additional Marina Bay images authorized; **15 used, 35 remain**. All 15 JPEGs and per-view JSON are saved in `reconstruction/marina-bay/references/`, intentionally eligible for Git/transfer (not public runtime assets). Include this folder on the next commit or cross-machine transfer so agents do not re-query it. Each frame has heading/pitch/FOV, size and SHA-256. The reference README explains actual coverage and source dates (2012, 2021, 2022).

**Updated budget:** `pnpm marina:usage` now reports **34 total attempts, 23 Static images**, 966 conservative attempts remaining. `api-usage.json.imageAllowance` enforces a separate 50-image cap from baseline 8, including the first three previews. This supersedes the older 13-attempt figures below; never reset either counter. `pnpm marina:references` and `pnpm marina:references --surroundings` reuse the complete cache with zero requests, but may fetch missing files—transfer the cache first. No key is needed to play the game.

The user clarified: **3D game rendering of Marina Bay in Joyride's low-poly art style**, not photographs or depth-warped imagery. The active default is now `src/components/MarinaGame.tsx`, using authored solid geometry in `src/game/marina-scene.ts`. Saved photos informed waterfront details, but the map is compressed and authored, **not automatically reconstructed or surveyed**.

**Confirmed scope:** eventually apply this location-specific walkable/drivable 3D treatment to **all locations**, including Tampines, Toa Payoh and Queenstown. **Marina Bay is the only current implementation focus.** Establish and validate the approach there before expanding; existing generic Joyride presets do not count as completed location maps.

Current game: modeled Sands/SkyPark, lotus-like museum, Helix crossing, city skyline, palm promenade, bay road loop, visible mint car, walk/run/drive, obstacle collisions, five collectible stamps, minimap and reset. `src/game/marina-collision.ts` provides subdivided AABB collision and wall sliding. The historical `MarinaWorld.tsx` depth viewer is unmounted; assets/pipeline remain for reference. Do not restore it as the default.

Validation: production build and **14 tests pass**. Local browser smoke checks passed rendering, walk/drive movement, reset, mobile width, no uncaught errors and zero live Static requests; walk/drive screenshots inspected. Full five-stamp completion, full road-lap verification, actual-phone performance and portable end-to-end tests remain open. A non-blocking Three.js chunk-size warning remains.

Controls: click canvas; WASD walks, drag looks, Shift runs. Drive gives a chase camera and visible car; W/S throttle/reverse, A/D steer, Space brakes. Switching modes preserves location. Reset clears stamps and distance. Movement is flat-ground arcade handling, with water/building obstacles but no gravity, slopes, suspension or camera collision. Distances are game-scale estimates.

No new API or image-generation calls were made for this pass; ledger stays **13 attempts (8 images)**. No key, capture, model inference or saved photo asset is needed to play the new game. Keep pnpm 11.22.0 and strict 14-day cooldown. Never reset the capture ledger or print/commit environment secrets.

Next: get visual feedback; refine landmark proportions/reference fidelity; validate all stamps and the road loop; improve camera/vehicle/accessibility; then expand other locations only after Marina is accepted. See the top of `.agents/PLAN.md`. No public deployment or video yet.

Portable setup remains `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, `pnpm marina:usage`, `pnpm dev`, using Node 22.12+ and pnpm 11.22.0. If absent, bootstrap with `npx --yes pnpm@11.22.0`. Never copy the original machine's absolute cache paths or process IDs. The repository's initial published milestone is `a8a6eba`; inspect checkout status for subsequent work.

## Historical handoff below

The remaining sections preserve prior implementation history and detailed setup. Statements describing the depth viewer as the current/default scene, no collisions, 11 tests, or improving depth as the highest priority are historical and superseded by the section above. Setup, secret handling and budget constraints still apply.

## Product context (previous depth milestone)

Two-person Singapore hackathon prototype, built with Astra as an engineering collaborator. The user wants realistic, playable experiences in everyday Singapore as well as tourist destinations. Driving and an NS-inspired FPS were the original ideas. A deployed URL and 90-second video are the final event deliverables; neither has been produced yet.

**Latest user clarification:** Build real 3D scenes from street-level images of Singapore and allow continuous walking/driving inside them. The user explicitly corrected the earlier panorama-viewer interpretation. GPT-Image-2.5 may help if useful; a bitmap alone is not the desired result.

**Current implementation:** Marina 3D is a working small-area depth reconstruction from four waterfront images, with continuous walk/drive controls. It is not a complete district or a metric photogrammetry model. The app also retains live Street View and the original procedural game modes; those are separate experiences.

**Latest authority and scope:** The user confirmed permission to reconstruct Street View imagery and selected **Marina Bay first**. Do not ask for permission again. They also imposed a **1,000 Static API query limit**, requested persistent accounting, and asked to minimize images.

**Latest work:** `scripts/capture-marina.mjs` captures one reviewed panorama in four directions; `scripts/reconstruct-marina.mjs` estimates local depth, stitches sector edges, and writes geometry/texture assets; `src/components/MarinaWorld.tsx` provides continuous walk/drive controls. The generated scene is included in `public/reconstruction/marina-bay/` and starts by default. It needs no Maps key or model inference to play. Capture is from **February 2012**, not current imagery. Scale/ground are approximate; exploration is bounded to a 4-unit radius. There is no true vehicle physics or mesh collision system.

**Key issue resolved:** the latest key in `.env` succeeded. No need to ask the user to enable Static API again. `reconstruction/api-usage.json` currently records **13 capture attempts: 8 Static images, 4 Static metadata requests, and 1 Maps JavaScript panorama selection**. Four early image downloads were an unsuitable indoor panorama; they are not in the scene. Check `pnpm marina:usage` for the current count. Preserve the ledger; never reset it. No more image calls are needed to run/build the current scene. See `reconstruction/README.md`.

## Explicit user preferences

- Use **pnpm 11**, currently pinned to **11.22.0**.
- Enforce a **two-week minimum dependency release age** (`20160` minutes).
- Preserve `minimumReleaseAgeStrict: true` and the lockfile. Do not bypass the cooldown to solve an install issue.
- Keep the plan/history and handoff useful for agents on different computers.
- Do not overwrite the user's private environment settings or publish their credentials.

## Transfer the work first

Repository: `git@github.com:ryanpeh/astra-hackathon.git`, branch `main`. The owner requested an initial commit and upstream push of this prototype, its generated assets, and these documents. Use the published branch as the transfer source and run `git status` before starting new work. Source images/caches and `.env` are intentionally excluded; generated scene assets are included so another machine can play immediately.

Include: `src/`, `scripts/`, `public/reconstruction/marina-bay/`, `reconstruction/api-usage.json`, `reconstruction/marina-bay.capture.json`, `reconstruction/README.md`, `index.html`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.env.example`, `README.md`, `.agents/PLAN.md`, `.agents/HANDOFF.md`.

Exclude: `node_modules/`, `dist/`, `.cache/`, `*.tsbuildinfo`, actual `.env` / `.env.local`, local browser profiles, and temporary screenshots/scripts. Generated public scene assets are portable and should be included. If rebuilding depth locally, copy the four approved images plus `capture.json` from the ignored `reconstruction/marina-bay/source/` through the owner's normal file transfer process; do not recapture unnecessarily. Do not transfer the rejected indoor set as reconstruction input. Obtain any required keys separately. Never copy the first machine's npm cache paths, process IDs, or browser sessions into setup instructions.

## Bring up a new machine

1. Install Node **22.12+** (a supported even-numbered LTS release is appropriate).
2. Make pnpm **11.22.0** available. If it is absent, use `npx --yes pnpm@11.22.0` as the launcher for the commands below; npm here bootstraps pnpm, it does not install the app dependencies.
3. From the project root:

```sh
pnpm --version
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

If pnpm is not installed globally:

```sh
npx --yes pnpm@11.22.0 install --frozen-lockfile
npx --yes pnpm@11.22.0 test
npx --yes pnpm@11.22.0 build
npx --yes pnpm@11.22.0 dev
```

Read the URL Vite prints; it normally uses port 5173 but may select another if occupied. No absolute filesystem paths, OS-specific shell commands, global pnpm install, or old running processes are required.

### Google Maps setup

Create `.env.local` from `.env.example` and set:

```dotenv
VITE_GOOGLE_MAPS_API_KEY=your_browser_key
```

Vite also reads `.env`; `.env.local` overrides a conflicting `.env` value. `.env.example` is documentation only. Restart Vite after configuring the key. Both real environment files are ignored by Git.

Enable Maps JavaScript API and billing. Restrict the browser key to this API and the relevant HTTP referrers. `http://localhost:5173/*` and `http://127.0.0.1:5173/*` are different referrers; allow whichever you use, plus the deployed site. A browser key is public in the client bundle by design. Never use a secret OpenAI key in a `VITE_*` variable.

The first machine has a user-provided `.env`; its value is deliberately not in this handoff. The app now starts in **Marina 3D**, using local generated assets regardless of key presence. The key is only needed for the separate live Street View mode or recapturing sources. Source images are processed locally; no image-generation API is used.

## Architecture and extension points

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Selected location/mode, game session state, overall UI, information dialogs. Keys `StreetView` by location to reset viewpoint state. |
| `src/data/locations.ts` | Four destinations and three approximate panorama search points each. Edit starting positions/headings here. |
| `src/components/StreetView.tsx` | Official panorama viewer; 200 m outdoor nearest search; viewpoint tabs; look/move/recenter controls; status/errors; listener cleanup. |
| `src/lib/google-maps.ts` | Shared browser SDK Promise, async callback loader, timeout/network/auth reporting. |
| `src/lib/street-view-navigation.ts` | Selects a forward/backward connected panorama by heading, handling north wraparound and dead ends. |
| `src/game/World.tsx` | Procedural Three.js world; requestAnimationFrame loop; camera movement; click raycasting; resource disposal. |
| `src/game/physics.ts` | Speed limits, acceleration/braking, and checkpoint count. |
| `src/styles.css` | Responsive styling, including dedicated Street View frame and controls. |
| `src/components/MarinaWorld.tsx` | Loads estimated-depth meshes; walk/drive, mouse look, touch controls, reset, bounded exploration. Shows an explicit missing-assets status until reconstruction is built. |
| `scripts/capture-marina.mjs` | Budgeted, cached four-image capture. Reads the local key without logging it. |
| `scripts/api-budget.mjs` | Reserves attempts before network access, persistent 1,000-attempt cap, and local capture lock. |
| `scripts/reconstruct-marina.mjs`, `scripts/depth-mesh.mjs` | Local ONNX depth inference and approximate textured geometry export. |
| `reconstruction/api-usage.json` | Persistent request ledger; include when transferring work. |
| `src/**/*.test.ts` | Eleven current unit tests, run through Vitest. |
| `pnpm-workspace.yaml` | Dependency cooldown and esbuild-only build-script allowance. |

Historical scaffold state was in React/in-memory refs. The current app adds the local armory save and FPS/collision described above; there is still no database, authentication, backend or multiplayer. External services are Google Maps and Google Fonts, plus a model-weight download for the local reconstruction build. Authorized captures and derived scene assets now exist. The browser loads only generated assets in Marina 3D; the model runs offline at build time. See the reconstruction README for limitations.

## What was verified

- Current Marina build: local inference completed, 11 tests and production build passed, and browser checks verified scene loading, walk/drive translation, reset, mobile width, no uncaught errors, and **zero live Static API requests**. Screenshots of the real scene were inspected. Some image stretching is visible and expected from this single-center depth approximation.
- Initial scaffold: production build, physics tests, desktop WebGL/game controls/target hits, missing-key view, and mobile overflow checks passed.
- Latest Street View pass: production build and six unit tests passed; browser rendered content for all 12 starting viewpoints; look-right, actual forward panorama changes, and recenter worked; no horizontal overflow at a 390 px mobile viewport.
- **Historical auxiliary-viewer limitation:** screenshots before the final key update showed a Google configuration warning. The final key successfully fetched valid Static images, and the generated Marina scene was visually checked. Recheck the separate live viewer if needed; do not confuse its earlier warning with the current local-assets scene. The agent did not modify Cloud settings.
- Browser checks used a temporary headless Chrome session on the first machine. Those temporary scripts are not a project dependency or a portable test suite. Recheck with a normal browser on your own origin/key.
- No hosted deployment, actual-phone performance test, or runtime Astra API test has been completed.

## Fast manual acceptance check

1. Reload: Marina 3D should load the waterfront scene without requiring a key or making a Static API request. Click the canvas, use WASD, drag to look, switch Walk/Drive, and reset. The gold ring marks the exploration limit; distances are approximate.
2. For the optional live viewer, choose Street View and try destinations/tabs. This uses the configured key and separate Maps JavaScript traffic.
3. In that viewer, turn left/right, step along the road, and recenter. Step buttons may be disabled if no connected photograph exists in the current direction. Rotate to find a path.
4. Switch to Joyride: start, hold W/up, steer with A/D, brake with S/Space, pause/resume/reset, and complete all three gates.
5. Switch to Target practice: hit all five orange targets and reset.
6. Test a narrow/mobile viewport. Ensure the Google attribution is not obscured and the app does not overflow horizontally.
7. With no key, confirm the no-key demo still works. If testing an invalid key, never print it in logs or commit it.

## Known limits and next steps

- The small four-image Marina proof of concept now works. Next validate depth at more viewing angles and decide whether to extend with translated captures, calibrated geometry/scale, and actual collision. Do not silently spend more image quota. The current asset format is JSON BufferGeometry plus JPEG, not GLB.
- Image generation is optional for texture/appearance completion. Its output does not replace geometry, camera calibration, collision, or validation of spatial consistency. No GPT-Image-2.5 endpoint/access has been verified; use the actual event-provided capability rather than inventing a model/API contract.
- A Google Maps warning was recorded before the final key update. Static API now works; the auxiliary live viewer should be rechecked separately if used in a demo. Preserve source attribution and capture date in the reconstruction.
- Approximate search points are not guaranteed landmark coordinates; Google may snap multiple points to the same panorama. Human curation of heading and distinctness remains useful.
- Street View transitions between capture positions. Do not add fabricated speed/distance claims or imply it supplies depth/collision geometry.
- Test slow networks, failed authorization, unavailable imagery, and rapid viewpoint switching more deeply. The SDK is shared within a page; after changing key restrictions or an authorization failure, a full reload is the reliable recovery path.
- The generic 3D scene varies palette/height, not neighborhood geography. Improving it requires original or suitably licensed data/assets.
- Terms/privacy dialogs are prototype text; keyboard focus trapping and an accessibility pass remain open.
- Highest-value next step: evaluate and improve the bounded depth reconstruction before expanding capture volume. Do not make further panorama navigation the main deliverable. See `.agents/PLAN.md` for acceptance criteria and ordered work.

## Deploy on a new host

Static frontend: install `pnpm install --frozen-lockfile`, build `pnpm build`, publish `dist`. Configure the Maps key at **build time**, add the deployed referrer to the key, and rebuild after env changes. No SPA path rewrites are currently needed because there are no pathname routes.

Before finishing a change, run relevant tests and `pnpm build`, record what you actually verified in `.agents/PLAN.md`, and update this handoff if setup or architecture changes. Do not claim that a local test proves the public deployment works.
