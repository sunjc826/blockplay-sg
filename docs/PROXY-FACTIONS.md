# Proxy faction design studies

Status: **art prototypes, not active combat factions**. Freedom Force and
Collective Cops are small, highly elite foreign detachments intended to support
a future proxy-conflict premise. This pass establishes color, silhouette,
identification and four animated model studies. The names and specialist jobs
are working designs; combat integration remains open.

Review the actual procedural models at **`/faction-designs`**. Drag to rotate,
use Front/Rear, inspect Standing/Walking/Crouched poses, and toggle Grayscale.
“Compare factions” places them beside the current Armed Forces and Black Kite
under the same light and at the same scale. The gallery works on desktop and
mobile and is directly addressable; it is not a playable mode or a main-menu
faction selector.

## Direction and proxy-conflict premise

Freedom Force draws on Western/US expeditionary equipment language: modular
plates, exposed communications gear, observation equipment and compact field
loads. Collective Cops draws on Eastern-bloc/Chinese security-equipment language:
enclosed head protection, repeated rectangular armor modules, protected entry
and coordinated sensing. These are original fictional organizations, not
reproductions of actual national uniforms or insignia. Faces and skin tones vary
independently of faction; visual identity comes from authored equipment.

Both can pursue interests through advisers, access to infrastructure, local
partners, extraction and limited direct intervention. Their presence should
suggest a wider conflict without replacing the local factions with two more
large patrol armies. Neither has been assigned as the player's automatic ally
or enemy. The Armed Forces are not implicitly Freedom Force's client, and Black
Kite is not implicitly Collective Cops' client. Relationships need their own
design pass.

A possible future deployment scale is a two-to-four-operator cell around a
specific objective, with finite arrivals and a withdrawal condition. This is a
proposal, not a spawn rule. “Elite” currently describes visual identity and the
intended narrative role, not new health, accuracy, damage or armor values.

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

## Collective Cops

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
| Collective Cops, concept | Continuous visor/jaw guard, square shoulders, hip armor | Open gate |

Check head/shoulder-only sightings, front, rear, side, movement and smaller
on-screen sizes. Markings repeat where weapons can obscure the chest. They are
high-contrast light devices on dark fields, painted on non-camouflage geometry;
recognition must not depend on label color. Equipment still uses normal world
lighting and cover, not emissive outlines or through-wall markers.

All models use `createCharacterRig`: the existing articulated body, analytic
limb IK, gait, stances, healing and disposal. New armor and equipment merge into
existing bone meshes, keeping the per-figure mesh budget at 20 or below. New
`expeditionary` and `collective` uniforms and four specialist kit names are
visual options, not live role plugins. Palette and operator definitions live in
`src/game/proxy-factions.ts`; `proxyCharacterLook` validates faction/operator
pairings. The design gallery is `src/components/FactionDesigns.tsx`.

## Integration decisions still open

1. **Relationships:** choose which interests can cooperate or fight, and how
   that changes by objective. Today's `ArenaSide`/`hostile` system assumes only
   two sides. Registering these designs into those sides now would silently
   impose alliances and friendly-fire rules. A future multi-faction relationship
   model must be host-authoritative and serialized/validated with snapshots.
2. **Deployment:** decide event-only versus persistent presence, entry/exit
   conditions, cell size, risk gating and director budgets. Do not add them to
   `SQUAD_FACTIONS`, heat, ambient role weights or transport reinforcements as
   part of an art pass.
3. **Specialist play:** establish how entry, designation, interdiction and sensor
   command create different tactical decisions. These jobs need not inherit the
   current assault/tank/sniper roster. Keep room for retreat and counterplay.
4. **Loadouts and rewards:** choose actual weapons, availability, finite supplies,
   armor and loot economy after faction behavior is settled. Existing elite
   Black Kite events and their Ultra/Legendary weapons remain their own system.
5. **Presentation:** choose how the player learns these emblems and identifies
   changing alliances. A uniform identifies the organization, not necessarily
   whether its current orders make it friendly.

No new faction barks or sound effects were commissioned in this pass. Future
voice and sound work follows the repository's ElevenLabs once-only workflow.
