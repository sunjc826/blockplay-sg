# Proxy faction design studies

Status: **first expedition combat slice implemented**. Freedom Force and
Collective Corps deploy as finite two-person cells during contested prototype
operations. Personal favor and encounter-local targets are active; faction-wide
diplomacy remains a proposal. See [proxy operations](PROXY-OPERATIONS.md).
The existing gallery remains a visual study; specialist shield/sensor mechanics
remain proposals. All eight weapon designs have playable cargo variants, and
all of them hang on the training range wall.

Review the actual procedural models at **`/faction-designs`**. Drag to rotate,
use Front/Rear, inspect Standing/Walking/Crouched poses, and toggle Grayscale.
“Compare factions” places them beside the current Armed Forces and Black Kite
under the same light and at the same scale. The gallery works on desktop and
mobile and is directly addressable; it is not a playable mode or a main-menu
faction selector.

## Direction and proxy-conflict premise

Freedom Force draws on Western/US expeditionary equipment language: modular
plates, exposed communications gear, observation equipment and compact field
loads. Collective Corps draws on Eastern-bloc/Chinese security-equipment language:
enclosed head protection, repeated rectangular armor modules, protected entry
and coordinated sensing. These are original fictional organizations, not
reproductions of actual national uniforms or insignia. Faces and skin tones vary
independently of faction; visual identity comes from authored equipment.

Both can pursue interests through advisers, access to infrastructure, local
partners, extraction and limited direct intervention. Their presence should
suggest a wider conflict without replacing the local factions with two more
large patrol armies. Neither has been assigned as the player's automatic ally
or enemy. The Armed Forces are not implicitly Freedom Force's client, and Black
Kite is not implicitly Collective Corps' client. Relationships need their own
design pass.

The first deployment uses two operators per faction around one cargo objective,
with finite arrivals and a withdrawal deadline. Each has 110 health and 65 armor;
existing role AI provides rifle, marksman and support behavior. See the operation
document for active rules rather than treating the visual studies as a combat
specification.

## Freedom Force

**Read:** pale modular expeditionary kit, steel-blue plate insert, open shoulders,
helmet ear cups and folded twin optical pods. A spread wing with a central stem
is repeated on chest, both shoulders and pack. No broad bedroll, large kite or
full facial visor: these separate it from the existing factions in grayscale.

| Color | Hex | Use |
|---|---|---|
| Sand | `#A69578` | Smock; a subdued fine blotch pattern breaks the cloth |
| Bone | `#D6C9AC` | Plate carrier, protective ribs and tool pouches |
| Steel blue | `#526F85` | Tapered chest insert, shoulder caps and specialist hardware |
| Signal amber | `#E7BC68` | Restrained helmet/arm identification trim |
| Deep blue | `#344B60` | Insignia field |
| Warm ivory | `#F1E9D6` | Wing device |

The trousers and boots use darker warm neutrals to anchor the pale upper body.
Blue stays subordinate to sand/bone, avoiding Black Kite's navy overall read.
The wing is an original geometric device rather than a national flag or service
badge. Folded optics and the microphone are modeled hardware, with no vision or
voice behavior attached.

| Specialist | Intended job | Model cues |
|---|---|---|
| **Lancer** | Precision entry specialist | Hip-mounted breaching-tool scabbard, compact tool pouch, rifle placeholder; compact rather than a conventional heavy gunner |
| **Wayfinder** | Reconnaissance and target designation | One tall radio mast and observation case, leaner build, scoped rifle placeholder; shares the faction helmet rather than copying the current boonie sniper |

## Collective Corps

**Read:** slate fabric, jade ceramic panels, continuous dark visor and jaw guard,
square shoulder shells and two segmented hip plates. A squared open-gate device
is repeated on chest, both shoulders and pack. This is a solid architectural
shape, distinct from the forces' paired bars, Black Kite's diamond and Freedom
Force's wing.

| Color | Hex | Use |
|---|---|---|
| Slate | `#677273` | Smock with restrained digital pattern |
| Jade | `#75968A` | Breastplate, rectangular shoulders, visor frame and hip armor |
| Graphite green | `#344B49` | Carrier and load-bearing kit |
| Cinnabar | `#BF5547` | Restrained identification trim, not whole-body red |
| Dark petrol | `#293E43` | Insignia field |
| Pale ceramic | `#ECE5CB` | Open-gate device |

The light jade upper armor and enclosed profile must distinguish the group from
the Armed Forces' olive cloth and horizontal bedroll. The dark visor has a
physical frame and is opaque in the current model. Avoid real national flags,
political symbols or copied police insignia. Jade, slate and red are equipment
choices; no gameplay alignment follows from them.

| Specialist | Intended job | Model cues |
|---|---|---|
| **Bastion** | Protected entry and interdiction | Broader build, tall slung shield with a viewing panel and gate insignia; shield stays on the back in the animation study |
| **Conductor** | Sensor coordination and command | Two raised sensor heads and a rigid hip-mounted tablet case; command through coordination rather than a mirror of Freedom Force's marksman |

The shield does not block bullets, the viewing panel is not functional glass,
and sensor heads do not detect targets. Those mechanics require separate combat,
AI and animation work if adopted. Rifle shapes are the existing rig's visual
placeholders, not new purchasable weapons or claims of national weapon issue.

## Recognition and rendering requirements

| Faction | Primary silhouette | Identification shape |
|---|---|---|
| Armed Forces, current | Covered helmet, open webbing, horizontal shoulder bedroll | Paired horizontal bars |
| Black Kite, current | Raised collar, face wrap, faceted shoulder guards | Single kite |
| Freedom Force, concept | Folded optical pods, comms ear cups, tapered armor, open shoulders | Spread wing |
| Collective Corps, concept | Continuous visor/jaw guard, square shoulders, hip armor | Open gate |

Check head/shoulder-only sightings, front, rear, side, movement and smaller
on-screen sizes. Markings repeat where weapons can obscure the chest. They are
high-contrast light devices on dark fields, painted on non-camouflage geometry;
recognition must not depend on label color. Equipment still uses normal world
lighting and cover, not emissive outlines or through-wall markers.

All models use `createCharacterRig`: the existing articulated body, analytic
limb IK, gait, stances, healing and disposal. New armor and equipment merge into
existing bone meshes, keeping the per-figure mesh budget at 20 or below. New
`expeditionary` and `collective` uniforms and four specialist kit names are
visual options used by the operation adapter, not separate live role plugins. Palette and operator definitions live in
`src/game/proxy-faction-catalog.ts`; `proxyCharacterLook` validates faction/operator
pairings. The design gallery is `src/components/FactionDesigns.tsx`.

## Combat integration and remaining decisions

The live registry now includes both independent identities. They remain absent
from `SQUAD_FACTIONS`, ambient heat and normal transport reinforcements. The
operation publishes explicit actor targets; the legacy palette `side` field does
not determine their alliances. Snapshot validation admits operation state only in
an opted-in expedition. Multiplayer does not enable these operations.

The first encounter uses existing rifleman, marksman and support AI with the
four proxy silhouettes. Their specialized shield, sensing, designation and entry
mechanics remain future work. Finite cells arrive on foot after the cargo-drop
warning, seek the cargo and withdraw after success or timeout. Returning cargo,
transferring it to the rival, keeping a Mythic SAR retrofit or delivering it to a
friendly facility produce different personal consequences. The retrofit uses the
existing SAR model and ammunition, not the experimental launcher art studies.

Still open: persistent diplomatic relationships, favor-unlocked services,
compromised officers, infrastructure operations, bespoke specialist mechanics and
full proxy weapon integration. Current favor lasts this expedition across travel;
it is not a permanent profile currency.
No new faction barks or sound effects were commissioned in this pass. Future
voice and sound work follows the repository's ElevenLabs once-only workflow.

## Weapon art studies

A separate eight-model shortlist and exterior preview is now available at
`/faction-designs?study=weapons`. See [proxy weapon studies](PROXY-WEAPONS.md)
for XM29/SCAR/M200 and QTS-11/QBZ-family inspirations, original model names and integration
boundaries. Operator studies still carry their existing placeholders.
The display name is now Collective Corps; the stable internal
ID remains `collective-cops`.
