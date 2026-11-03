# Proxy faction weapon studies

Status: **eight exterior design candidates**, not locked loadouts. Review at
**`/faction-designs?study=weapons`**, linked from the operator gallery. Profile,
other-side, oblique and front presets, drag rotation and grayscale support
silhouette review on desktop and mobile. Every study uses the same viewing
scale, so the compact bullpup and long precision rifle retain their differences.

This is a bounded art pass for Freedom Force and the newly named **Collective
Corps**. The stable faction ID remains `collective-cops`. The specialist roster
is not expanded into matching assault/heavy/sniper classes.

## Representative base models

| Faction / specialist | Recommended reference | Original game study | Why start here |
|---|---|---|---|
| Freedom Force / Lancer experimental option | XM29 OICW · Block 3 | **Peace Offering · Escalation Clause** (`ff-oicw`) | Stacked rifle/launcher muzzles, bulky upper receiver, large sight housing and separate front/rear feed silhouettes |
| Freedom Force / Lancer option | FN SCAR-L | **Soft Power · Foreign Aid** (`ff-scar-l`) | Compact family upper, narrow curved magazine, shared folding-style stock and a low reflex hood |
| Freedom Force / Wayfinder option | FN SCAR-H | **Hard Power · Strings Attached** (`ff-scar-h`) | Broader receiver and magazine well, wider straight magazine, prism optic; distinct from the Smart Power precision configuration |
| Freedom Force / Wayfinder | FN Mk 20 / SCAR 20S | **Smart Power · Targeted Assistance** (`ff-longwatch`) | Extended upper, precision stock, short box magazine, large scope and folded bipod give the observer a distinct long silhouette |
| Freedom Force / Wayfinder precision option | CheyTac M200 Intervention | **M200 Intervention** (`ff-intervention`) | Exposed long barrel, round fore-end, under-barrel carry handle, twin stock rods, bipod and rear monopod |
| Collective Corps / Bastion | QBZ-95 family | **Strong Objection No. 496 · Final Warning No. 497** (`cc-gatekeeper`) | Bullpup magazine behind the hand, raised open carry bridge, integrated rear stock and pointed fore-end give the protected-entry specialist a different equipment language |
| Collective Corps / Conductor | QBZ-191 family | **Consensus Builder · Unanimous Vote** (`cc-network`) | Conventional forward magazine, continuous rail and stepped adjustable-stock shape suit a modern sensor-coordination concept |
| Collective Corps / Conductor experimental option | QTS-11 integrated combat system | **QTS-11 study** (`cc-qts11`) | Dual projecting barrels, a slimmer upper launcher shell, open stock and offset sight/sensor housing contrast with the XM29 |

The shortlist is an art-direction recommendation. It is not a claim that any
real unit equips these weapons together, or that their real performance defines
the game's statistics. Exterior proportions are interpreted for the existing
low-poly style, not authored as dimensional replicas.

**Alternative:** QBU-191-inspired precision/observation equipment could replace
the older bullpup direction if a coherent modern 191-family identity becomes
more important than mixed silhouettes. That would require reconsidering the
specialist job; it should not automatically turn Bastion into a conventional
sniper. The QBU alternative is not modeled in this pass. AK-pattern references are another
possible Eastern-bloc route, but mixing more visual families now would weaken
the chosen slate/jade security-force identity.

## SCAR-family variants and agreed names

Both variants are separate selectable studies, not recolors or replacements for
Smart Power. They retain the same SCAR-family stock, cheek rest and upper rail.
In these chosen art configurations, the L has a shorter fore-end, narrower
receiver, curved magazine and reflex sight; the H has a longer fore-end, broader
receiver/well, wider straight magazine and prism optic. Single versus twin amber
side marks reinforce the distinction without replacing the geometry cues.
Smart Power keeps the precision stock, long tube scope and folded bipod.

The real-world references are the [SCAR-L](https://fnherstal.com/en/defence/portable-weapons/fn-scar-l-mk2/)
(5.56mm) and [SCAR-H](https://fnherstal.com/en/defence/portable-weapons/fn-scar-h-mk2/)
(7.62mm). Those labels identify the art inspirations; the gallery does not
define ammunition, damage, recoil or caliber rules. The greater length in this particular H
study is an art choice, not a claim that every H configuration is longer than
every L configuration. The later playable cargo variants share these designs;
they do not add specialist roles.

The agreed two-level display names are:

| Reference | Family label | Signature variant | Full display name |
|---|---|---|---|
| SCAR-L | **Soft Power** | **Foreign Aid** | **Soft Power · Foreign Aid** |
| SCAR-H | **Hard Power** | **Strings Attached** | **Hard Power · Strings Attached** |
| Mk 20 / SCAR 20S | **Smart Power** | **Targeted Assistance** | **Smart Power · Targeted Assistance** |

The family labels communicate the intended light/heavy art distinction; the
signature names provide the proxy-conflict joke. These are display labels for
the gallery and the later playable cargo variants. Stable
`ff-scar-l` / `ff-scar-h` / `ff-longwatch` IDs are unchanged. The former
Longwatch display name is superseded by Smart Power · Targeted Assistance;
the Mk 20 study and its playable cargo variant retain their existing geometry,
weapon-family index and behavior. The gallery picker and preview banner separate family and signature labels;
the description and accessible canvas label use the full name.

## Smart Power cargo handling

Smart Power carries a 20-round 7.62 mm magazine and fires one round per press,
with a 0.24 s minimum follow-up interval. Its cargo build deals 105 damage before
falloff and armor, with a 2.4× head multiplier. Reduced recoil and faster recovery
support deliberate follow-ups; aimed spread is 60% tighter than the ordinary
rifle cone, and its smaller bloom recovers between shots at that cadence.

The live scope offers **2× and 4×**, starting at 4×. Use `[` / `]`, scroll while
aiming, or the HUD's minus/plus controls. Zoom selection is remembered across
weapon switches and does not change damage or accuracy. The folded bipod remains
visual only. The rifle still takes two body hits against a fresh Freedom Force
operator (110 HP, 65 armor), so its magazine and handling improvements matter in
the encounter that awards it.

Smart Power and the M200 use wider precision eyepieces with 0.15-unit eye relief.
At full aim, their clear lens diameters occupy approximately 42% and 46% of the
viewport height, respectively, versus 26% for Peace Offering. The larger window
shows more surrounding detail at the existing zoom power; magnification, damage
and spread are unchanged. The modelled housings, glass and live scope image share
the same enlarged aperture.

## Collective Corps family and signature names

| Reference / specialist | Family label | Signature variant | Stable study ID |
|---|---|---|---|
| QBZ-191 family / Conductor | **Consensus Builder** | **Unanimous Vote** | `cc-network` |
| QBZ-95 family / Bastion | **Strong Objection No. 496** | **Final Warning No. 497** | `cc-gatekeeper` |

Consensus Builder / Unanimous Vote fits Conductor's coordination theme. The
numbered-notice pair fits Bastion's protected-entry/interdiction study. **496**
fills the owner's unspecified first number so it immediately precedes **497**;
this is a naming choice, not an asserted historical sequence for the models.
Final Warning No. 497 references [China's final warning](https://en.wikipedia.org/wiki/China%27s_final_warning),
as requested. Gatekeeper and Network are superseded display names; stable IDs,
models and the two-operator roster are unchanged. These Collective Corps
family/signature pairs remain gallery labels without live family registration.

Other brainstormed names retained for later use: Polite Request / Final Notice,
Small Talk / Big Talk, Budget Approval / Cost Overrun and Limited Intervention /
Extended Stay. Democracy Lite / Democracy Deluxe were superseded working titles.

## Paired experimental systems

The owner's requested Chinese counterpart to the XM29 is represented by a
separate **QTS-11 study** (`cc-qts11`), a Conductor experimental option. It sits
alongside the two named Collective Corps rifle families;
it does not replace them or expand the specialist roster.

The agreed XM29 study name is **Peace Offering · Escalation Clause**:
**Peace Offering** is its family label and **Escalation Clause** its signature
variant. The gallery separates the two labels and retains XM29 OICW as the base
reference. Its stable `ff-oicw` ID is unchanged. QTS-11 keeps its working reference
name until a fictional name is chosen. The SCAR-L remains **Soft Power · Foreign
Aid** and the SCAR-H remains **Hard Power · Strings Attached**.

The counterpart relationship describes the combined rifle/launcher concept,
not equivalent real-world performance or matched gameplay roles. QTS-11 is the
label used by the inspected CCTV report. Other reported designations are not
asserted here as confirmed aliases.

## Model interpretation

**Peace Offering · Escalation Clause (XM29 OICW):** replaces the retired compact-carbine study. The visual
reference is the boxy Block 3 exterior: a broad upper launcher body over a
smaller projecting rifle, two bore heights, a rear launcher-feed box, a forward
rifle magazine and a large chamfered sight housing. Freedom Force's sand/bone
shell, dark hardware, steel-blue side covers and amber marks adapt the reference
to the faction. Both muzzle openings and the supported sight case have real
geometry. The family/signature naming follows the agreed Freedom Force pattern.

The gallery shows the dual muzzle/feed arrangement as exterior art. The lower rifle muzzle
and upper launcher muzzle have separate optional art sockets, as do the two
magazine positions. The later playable cargo version adds rifle/impact-launcher firing, separate
magazines and reloads. See [cargo implementation](PROXY-OPERATIONS.md) for U /
mode controls and tuning. Range programming and targeting electronics remain
outside that implementation.

**M200 Intervention:** an additional Freedom Force precision candidate,
not a replacement for Smart Power. The manufacturer's side photo informed the
long exposed barrel, round fore-end, open under-barrel carry handle, stock rods,
cheek rest, large scope, bipod and rear monopod. Bone/sand hardware, steel-blue
panels and an amber mark adapt it to the faction. Carry-handle and stock gaps
are real negative space; the bipod is splayed for review. The model is visibly
longer than Smart Power at the same scale. Portrait framing now allows the longer
profile for every study without individually rescaling weapons.

The display name is M200 Intervention; no fictional name is selected. Its
Mythic cargo version now has a manual bolt cycle, a live 6× sight, .408
magazines, a deployable bipod and weapon-specific recorded action audio. The
gallery retains its static review pose; the rear monopod remains static.

**QTS-11 study:** a narrower slate/graphite upper launcher shell sits above a
conventional rifle with a forward curved magazine. Two projecting muzzle
openings, a skeletal stock with real negative space, a supported long sight and
an offset jade sensor pod create an asymmetric silhouette. Cinnabar marks keep
it within Collective Corps' palette. These exterior choices contrast with the
XM29's broad rear body and launcher-feed box in color and grayscale. The model
has a launcher muzzle socket but no protruding rear launcher magazine or rear
magazine socket. Stock proportions, pod shape and faction panels are stylized
art choices, not a dimensional reproduction of a particular production variant.
No launcher, sight electronics or targeting behavior is implemented.

**Smart Power · Targeted Assistance:** bone/sand furniture, long upper rail, broad precision cheek rest,
shorter straight magazine, large tube optic and folded bipod. Its precision stock, long scope and folded bipod distinguish it from the
SCAR-L and SCAR-H studies. The tall optic and
stock profile must remain readable in grayscale. The fore-end uses actual
openings; the sight lenses are opaque material studies, not functional scopes.

**Strong Objection No. 496 · Final Warning No. 497:** graphite body, jade fore-end inserts, a small cinnabar marker,
curved rear magazine and open carry bridge. The existing SAR 21 is already a
bullpup, so magazine position alone does not create enough distinction. Keep the
QBZ-inspired bridge and compact pointed fore-end prominent; avoid copying the
SAR's long integrated cylindrical optic housing. The bridge and trigger guard
have real negative space rather than a dark painted rectangle.

**Consensus Builder · Unanimous Vote:** slate receiver, graphite stock/fore-end and jade observation-optic
casing. Preserve the forward magazine, low straight upper, stepped telescoping
stock and compact angular optic. It is visually distinct from the QBZ-95 study's
bullpup architecture, while its panels and restrained cinnabar identification
mark keep the two in one faction. The observation optic does not detect or mark
anyone in gameplay.

No real manufacturer logos, national flags, specifications for fabrication,
weapon purchases or ballistics are added. Faction weapon names are fictional;
XM29 OICW remains the base reference for Peace Offering; QTS-11 retains its
working reference name.

## Existing systems and integration boundary

- `src/game/proxy-weapon-models.ts` owns the eight studies, reference links,
  geometry builder, grip/foregrip/magazine/muzzle art sockets and disposal. The
  experimental systems also have optional launcher muzzle art sockets; only
  the XM29 has a rear-feed art socket.
  Outside surfaces merge by material, using at most six weapon mesh draws.
- `src/components/ProxyWeaponStudies.tsx` provides the review page inside the
  existing faction-design route. The operator gallery still uses the original
  generic rifle/marksman placeholders. All five Freedom Force designs now also have playable cargo variants,
  integrated in `buildServiceWeapon` and the live catalog. Peace Offering has
  an integral launcher mode with its own ammunition, not another cargo reward
  or carry slot. Collective Corps designs remain gallery-only.
- Gallery art sockets are distinct from the playable attachment/hand poses.
  The two new cargo integrations, controls and separate ammunition are described
  in [proxy operations](PROXY-OPERATIONS.md).
- Before replacing an operator's placeholder, review shoulder/grip fit, left
  hand clearance, scope placement, shield interference and gait/stance coverage.
  The bullpup will need a distinct rear-magazine reload if it becomes playable.
  Weapon-specific cargo sound work follows the local ElevenLabs once-only
  workflow. `scripts/proxy-cargo-sfx.mjs` owns the bounded 20-clip batch;
  published provenance lives in `src/audio/proxy/manifest.json`.

Tests keep unimplemented candidates out of live catalogs and check eight different geometric silhouettes,
magazine layout relative to the grip, real stock/bridge openings, finite
geometry, render budget and idempotent cleanup. Browser review covers all eight
models at multiple angles, grayscale, mouse/touch rotation, portrait layout and
navigation between weapon and operator studies.

## Primary references and evidence limits

- [CheyTac M200 product page](https://cheytac.com/precision-firearms/m200-intervention-sniper-rifle/): directly inspected manufacturer feature list and side-view photo for the exposed barrel, tubular fore-end, open carry handle, stock, bipod and monopod. The photo is cached locally and not shipped. The [2026 military catalog](https://cheytac.com/wp-content/uploads/2026/03/MIL-Catalog-2026.pdf), page 2, also identifies the bipod and adjustable stock/monopod; its text was read, while detailed geometry was taken from the product photo. Scope, faction finishes, proportions and bipod pose are art interpretation. No exact dimensions, internal construction or manufacturer performance claims are adopted as game rules.

- [CCTV, 17 May 2018](https://news.cctv.com/2018/05/17/ARTImlq4JrQyBg9bmY4Lh44O180517.shtml): directly inspected report names QTS11 and identifies two barrels. Its photo, credited to PLA Pictorial, was downloaded and visually reviewed for broad dual-barrel/sight layout; it is cached reference evidence and is not shipped. [China Military, 9 January 2019](https://eng.chinamil.com.cn/CHINA_209163/TopStories_209189/9400035.html) describes a rifle/launcher with an aiming module and compares the concept to XM29; indexed article text was available, but direct retrieval timed out. These sources do not establish exact dimensions, service status today or performance parity.
- [U.S. Army 2003 Weapon Systems Handbook](https://asc.army.mil/docs/wsh2/2003-wsh.pdf): the indexed OICW entry describes an integrated dual-barrel system and fire-control unit. Direct retrieval returned HTTP 403 in this pass, so its full PDF was not inspected. The [Block 3 photo attributed to U.S. Army / PM Soldier](https://commons.wikimedia.org/wiki/File:XM29_Block3.jpg) was downloaded to the local review cache and visually inspected for the outside silhouette, sight housing, barrel stack and feed positions. The photo is reference evidence, not a shipped game texture or mesh. No dimensional replica or internal mechanism is reproduced.
- [FN's SCAR 20S announcement](https://fnamerica.com/press-releases/fn-announces-release-fn-scar-20s-precision-rifle/): identifies the Mk 20 SSR relationship, extended receiver and adjustable precision stock. The manufacturer's external side image informed the broad silhouette.
- [Australian Army DATE: QBZ 95](https://date.army.gov.au/equipment/qbz-95): identifies the bullpup layout and curved polymer box magazine. The study is QBZ-95-family-inspired, not an asserted exact 95B/95-1 configuration.
- [China Military: 191 rifle family](https://eng.chinamil.com.cn/CHINA_209163/WeaponryEquipment/News_209182/15962288.html): the indexed article identifies marksman, automatic-rifle and short-rifle members. The page timed out during direct retrieval in this pass, so family naming is supported by its indexed text rather than an inspected full article. [China Military's earlier comparison](https://eng.chinamil.com.cn/CHINA_209163/TopStories_209189/9660844.html) describes the transition from a bullpup to a conventional layout. Detailed geometry, sensors and faction finishes here remain original interpretation.

References establish inspiration and broad layout. The studies do not certify
real-world service issue, equipment compatibility or performance.
