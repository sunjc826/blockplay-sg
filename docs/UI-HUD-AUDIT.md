# Combat HUD layout review — 29 October 2026

## Implemented

Health, armor and ammo now share one combat cluster in training, arenas and
expeditions. On desktop, larger health and armor cards sit immediately beside
ammo with the utility belt above. Health keeps its damage-trailing bar. The
armor card shows points and an explicit NO ARMOR state; there is no invented
percentage bar because the HUD does not carry the worn plate's maximum.

The existing 50% and 25% health thresholds now also show LOW HEALTH and
CRITICAL · FIND COVER. Health warnings use words, color and a local pulse;
reduced-motion preferences suppress animation. Mouse capture status has its
own quiet position rather than occupying the vital signs.

Phone readouts stack together, above the trigger pad in landscape and under
the weapon selector in portrait. The short-screen belt retains its bottom
dock. Mounted weapons include the operator's vital signs beside their vehicle
readout; passengers using personal weapons retain the infantry cluster.

## Recommended next changes

These are design recommendations from the current implementation, rather than
features added in this change.

| Priority | Current shortfall | Proposed improvement and FPS reference |
| --- | --- | --- |
| 1 | The ammo panel mixes essential counts with several lines of 7–9px controls, movement statistics and accessory instructions. | Keep magazine, reserve, weapon and current action prominent. Move persistent instructions and carry details to pause/inspection; briefly reveal changed accessory state. Call of Duty's HUD documentation separates immediate ammunition and damage feedback from other information. |
| 1 | The new health warning explains danger, but still requires finding the right supply. Low/empty ammo prompts stay in the corner until a reload starts. | Show a small contextual heal/reload prompt beneath the reticle when action is possible. Use the actual carried healing slot/key and available reserve; suppress it during supply use, reload, death and unrelated interactions. Keep this below sights and use a quiet transition cue rather than constant alarms. |
| 2 | Grenade, combat-event, incoming-fire, supply, interaction and elimination overlays can compete. | Give threats priority, keep an action-progress lane beneath the reticle, and send lower-priority rewards/news to the feed. Existing hit-direction and grenade indicators are useful foundations. |
| 2 | The top-center “compass” is fixed district/setting text rather than a heading. The minimap already has real facing information. | Replace the decorative compass with live heading ticks and bearing markers for relevant danger/objectives. A bearing turns an audio callout into a direction the player can use. |
| 2 | HUD text, inset and opacity are largely fixed, so readability depends on screen size and scene brightness. | Add HUD scale, horizontal inset and opacity settings, with a preview over bright and dark scenes. Halo Infinite explicitly exposes HUD opacity and full-screen-effect intensity. |
| 3 | Empty utility slots and static state labels can occupy space that carried items and timed effects need, especially in training/open world. | Extend the public-arena phone behavior that hides empty supplies to other small-screen modes, while keeping slot order stable. Differentiate active, unavailable and ready states; Halo uses dimmed equipment and a visible cooldown fill. |

## References

- [Halo Infinite settings and HUD opacity](https://support.halowaypoint.com/hc/en-us/articles/4407649252116-Guide-to-Halo-Infinite-Game-Settings)
- [Halo Infinite equipment readiness and cooldown cues](https://support.halowaypoint.com/hc/en-us/articles/26608497528596-Equipment-in-Halo-Infinite)
- [Call of Duty: Black Ops HUD manual](https://cdn2.callofduty.com/assets/codbo/pdf/COD_PS3_OMAN_US_v2.pdf)

## Verification

Type checking and a production build pass, along with the eight existing
health-band and HUD-motion tests. The build retains its bundle-size advisory.
The local preview uses the real HUD, minimap, weapon selector, touch controls
and range renderer with explicit vital-state inputs. Desktop 1280×720,
landscape 844×390 and portrait 390×844 were visually reviewed, including
critical health and mounted readouts. This verifies presentation; it is not
an end-to-end multiplayer playtest. The in-app browser blocks mouse capture
when entering the actual training session.

Preview and screenshots are in `.cache/hud-layout/` (local, ignored artifacts).
