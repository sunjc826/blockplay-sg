# Proxy faction weapon studies

Status: **six exterior art candidates**, not locked loadouts. Review at
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
| Freedom Force / Lancer | SIG MCX SPEAR LT | **Strider** (`ff-strider`) | Compact modular rifle; open folding-stock shape and low reflex sight suit the expeditionary entry specialist |
| Freedom Force / Lancer option | FN SCAR-L | **Democracy Lite** (`ff-scar-l`) | Compact family upper, narrow curved magazine, shared folding-style stock and a low reflex hood |
| Freedom Force / Wayfinder option | FN SCAR-H | **Democracy Deluxe** (`ff-scar-h`) | Broader receiver and magazine well, wider straight magazine, prism optic; distinct from the Longwatch precision configuration |
| Freedom Force / Wayfinder | FN Mk 20 / SCAR 20S | **Longwatch** (`ff-longwatch`) | Extended upper, precision stock, short box magazine, large scope and folded bipod give the observer a distinct long silhouette |
| Collective Corps / Bastion | QBZ-95 family | **Gatekeeper** (`cc-gatekeeper`) | Bullpup magazine behind the hand, raised open carry bridge, integrated rear stock and pointed fore-end give the protected-entry specialist a different equipment language |
| Collective Corps / Conductor | QBZ-191 family | **Network** (`cc-network`) | Conventional forward magazine, continuous rail and stepped adjustable-stock shape suit a modern sensor-coordination concept |

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

## SCAR-L / SCAR-H variants and working names

Both variants are separate selectable studies, not recolors or replacements for
Longwatch. They retain the same SCAR-family stock, cheek rest and upper rail.
In these chosen art configurations, the L has a shorter fore-end, narrower
receiver, curved magazine and reflex sight; the H has a longer fore-end, broader
receiver/well, wider straight magazine and prism optic. Single versus twin amber
side marks reinforce the distinction without replacing the geometry cues.
Longwatch keeps the precision stock, long tube scope and folded bipod.

The real-world references are the [SCAR-L](https://fnherstal.com/en/defence/portable-weapons/fn-scar-l-mk2/)
(5.56mm) and [SCAR-H](https://fnherstal.com/en/defence/portable-weapons/fn-scar-h-mk2/)
(7.62mm). Those labels identify the art inspirations; no ammunition, damage,
recoil or caliber rules are added. The greater length in this particular H
study is an art choice, not a claim that every H configuration is longer than
every L configuration. Neither variant adds a specialist role or live loadout.

Working paired-name ideas, with stable IDs independent of the eventual names:

| L / H pair | Tone |
|---|---|
| **Democracy Lite / Democracy Deluxe** | Recommended provisional pair: Freedom Force's policy sold in two packages |
| **Polite Request / Final Notice** | Dry escalation, with a bureaucratic edge |
| **Small Talk / Big Talk** | Short and readable; communication-themed swagger |
| **Freedom Trial / Freedom Subscription** | A more overt software-subscription joke |

The first pair is displayed provisionally in the gallery. Names are not locked.

## Model interpretation

**Strider:** sand receiver, pale skeleton stock, a steel-blue side panel and a
small amber identification mark. Preserve the stock's open triangle, forward
curved magazine, compact vented fore-end and reflex hood. A short cylindrical
muzzle shroud is an original visual treatment. This should not read as the
existing XM8's rounded polymer shell and integrated sighting module, or a G36's
high carry handle.

**Longwatch:** bone/sand furniture, long upper rail, broad precision cheek rest,
shorter straight magazine, large tube optic and folded bipod. It is a heavier
precision visual rather than a longer recolor of Strider. The tall optic and
stock profile must remain readable in grayscale. The fore-end uses actual
openings; the sight lenses are opaque material studies, not functional scopes.

**Gatekeeper:** graphite body, jade fore-end inserts, a small cinnabar marker,
curved rear magazine and open carry bridge. The existing SAR 21 is already a
bullpup, so magazine position alone does not create enough distinction. Keep the
QBZ-inspired bridge and compact pointed fore-end prominent; avoid copying the
SAR's long integrated cylindrical optic housing. The bridge and trigger guard
have real negative space rather than a dark painted rectangle.

**Network:** slate receiver, graphite stock/fore-end and jade observation-optic
casing. Preserve the forward magazine, low straight upper, stepped telescoping
stock and compact angular optic. It is visually distinct from Gatekeeper's
bullpup architecture, while its panels and restrained cinnabar identification
mark keep the two in one faction. The observation optic does not detect or mark
anyone in gameplay.

No real manufacturer logos, national flags, specifications for fabrication,
weapon purchases or ballistics are added. The model names are fictional.

## Existing systems and integration boundary

- `src/game/proxy-weapon-models.ts` owns the six studies, reference links,
  geometry builder, grip/foregrip/magazine/muzzle art sockets and disposal.
  Outside surfaces merge by material, using at most six weapon mesh draws.
- `src/components/ProxyWeaponStudies.tsx` provides the review page inside the
  existing faction-design route. The operator gallery still uses the original
  generic rifle/marksman placeholders. The new models are not registered in
  `buildServiceWeapon`, the armory catalog, role definitions, weapon families,
  stores, loot or encounter spawning.
- No hand animation, reload, sight, optic reflection, firing effect, sounds,
  damage, recoil, ammunition pool, shield behavior or sensor logic is added.
  The art sockets are future attachment references, not animation contracts.
- Before replacing an operator's placeholder, review shoulder/grip fit, left
  hand clearance, scope placement, shield interference and gait/stance coverage.
  The bullpup will need a distinct rear-magazine reload if it becomes playable.
  Weapon-specific sound work follows the local ElevenLabs once-only workflow;
  none is commissioned here.

Tests check absence from live catalogs, six different geometric silhouettes,
magazine layout relative to the grip, real stock/bridge openings, finite
geometry, render budget and idempotent cleanup. Browser review covers all six
models at multiple angles, grayscale, mouse/touch rotation, portrait layout and
navigation between weapon and operator studies.

## Primary references and evidence limits

- [SIG MCX SPEAR LT product family](https://www.sigsauer.com/mcx-spear-lt.html)
  and [SIG operator manual](https://www.sigoptics.com/media/sigsauer/resources/OPERATORS-MANUAL-MCX-SPEAR-LT-2402988-01_REV01.pdf): compact modular rifle and folding-stock external language. Product family listings and the manual description informed the reference choice; no internal mechanism is reproduced.
- [FN's SCAR 20S announcement](https://fnamerica.com/press-releases/fn-announces-release-fn-scar-20s-precision-rifle/): identifies the Mk 20 SSR relationship, extended receiver and adjustable precision stock. The manufacturer's external side image informed the broad silhouette.
- [Australian Army DATE: QBZ 95](https://date.army.gov.au/equipment/qbz-95): identifies the bullpup layout and curved polymer box magazine. The study is QBZ-95-family-inspired, not an asserted exact 95B/95-1 configuration.
- [China Military: 191 rifle family](https://eng.chinamil.com.cn/CHINA_209163/WeaponryEquipment/News_209182/15962288.html): the indexed article identifies marksman, automatic-rifle and short-rifle members. The page timed out during direct retrieval in this pass, so family naming is supported by its indexed text rather than an inspected full article. [China Military's earlier comparison](https://eng.chinamil.com.cn/CHINA_209163/TopStories_209189/9660844.html) describes the transition from a bullpup to a conventional layout. Detailed geometry, sensors and faction finishes here remain original interpretation.

References establish inspiration and broad layout. The studies do not certify
real-world service issue, equipment compatibility or performance.
