# PC keybinding audit — 29 October 2026

## Recommendation

Use an Apex-inspired common-action layout, with this game's dedicated prone
and vehicle controls. Prioritize G for grenades, one contextual interaction key,
mouse-wheel weapon cycling and a useful Tab action. Keep an optional keyboard
ADS toggle for trackpad users. A familiar foundation should reduce the amount
of permanent HUD instruction needed.

This is a proposal. The inspect/hints UI release keeps existing gameplay binds.
The current K inspect binding is now a compact text hint on PC; touch retains
the Inspect button. The HUD hints preference hides PC instructions without
hiding combat state, threats, objectives or action progress.

## Current bindings and proposed defaults

Current behavior comes from `fps-engine.ts`, `utility-belt.ts` and
`armory-slots.ts`, rather than the older control summaries.

| Action | Current | Proposed | Assessment |
| --- | --- | --- | --- |
| Move, sprint, jump | WASD, hold Shift, Space | Keep | Familiar foundation. |
| Fire / aim | LMB / hold RMB; Q toggles aim | Keep RMB; expose toggle ADS as a separate bind/behavior | Q remains an accessibility-friendly legacy shortcut, rather than implying it is universal. |
| Reload | R | Keep | Familiar. |
| Crouch | Hold C; Ctrl only descends helicopters | C toggle, Ctrl hold on foot | Ctrl currently looks bound but does not crouch infantry. Both behaviors should be explicit. |
| Prone / support mount | Z toggles prone; support deploys automatically | Keep Z | Fits this game's support weapons; Apex has no prone action to copy. |
| Draw weapons | 1 main; 2 extra main if carried; pistol is last (2 or 3) | Keep the displayed 1–3 order; add scroll cycling | Document the shifting pistol slot clearly. Do not label 2 as a permanently fixed sidearm key. |
| Grenades | Tap 9 to ready; hold 9 to choose; LMB cooks/releases, RMB lobs | Tap G to ready, hold G to choose; keep cook/lob behavior | Highest-priority remap: G currently repeats any selected utility, including food or a dressing. Keep 9 as an optional legacy alias. |
| Healing | 4 food (hold for food picker), 5 dressing, 6 first aid | 4 selected healing item; hold 4 for a combined healing picker | Keep 5/6 as optional direct shortcuts. This requires extending the picker beyond food. |
| Armor / ammo supplies | 7 / 8; G repeats last utility | Retain 7/8 as direct advanced shortcuts | G should no longer change meaning with utility history. |
| Pick up / enter / exit | E; loot takes precedence on foot | E contextual use | Retain loot-before-vehicle priority when the player is aiming at loot. |
| Talk / checkpoint travel | N / T | E contextual use; hold E to confirm travel | Three interaction keys create avoidable memory load. Resolve the target by aim, distance and context; show the target before an irreversible purchase or zone transition. |
| Alternate armor pickup | I | Retain I initially; later offer an alternate-use binding | Keep the comparison card and explicit swap choice. Avoid making a normal pickup silently replace worn inserts. |
| Inspect | K | N, after NPC interaction moves to E | Familiar to Apex players; an optional secondary K binding avoids breaking existing habits. |
| Callouts / orders | Hold Y; wheel numbers select, Tab/scroll change pages | MMB tap Contact, hold for wheel; retain Y as secondary | A proposed convenience, not a claim that all games use identical order wheels. It requires handling the tap/hold distinction. |
| Map | M | Keep | Familiar. |
| Scoreboard | Available in the arena pause menu; Tab is swallowed outside callouts | Hold Tab for arena scores | Keep Tab/Shift+Tab paging while the callout wheel is open. No inventory exists, so don't label Tab as inventory. |
| Vision / palette | H / J | Keep as equipment-specific binds | Show state even with hints off. These are specialized features rather than universal FPS defaults. |
| Rail laser/light / offset optic | B / X | Keep until rebinding exists | B often suggests a fire-mode control, but this game currently has fixed per-weapon fire modes. Avoid inventing a fire-mode action. |
| Vehicle seat / view | V / L | Retain V for seat; consider C for vehicle camera | Context separation lets C remain infantry crouch. Helicopter descent should then use Ctrl, not C, with Space climb and Shift boost. |
| Fullscreen / menu | F / Escape | Fullscreen menu button or native browser shortcut; keep Escape menu | F consumes a prominent gameplay key. Browser fullscreen shortcuts differ by platform, so the visible button remains the dependable option. |

## Input and documentation issues

1. Input is matched with `event.key.toLowerCase()`. Shift+number produces a
   symbol on common layouts, so weapon/supply shortcuts can fail while holding
   sprint. Non-QWERTY layouts also change the physical movement positions.
   Move to an action registry keyed by `KeyboardEvent.code`, then expose
   rebinding and layout-aware labels rather than hard-coding more strings.
2. Ctrl is accepted by the handler but only used for helicopter descent.
   On-foot crouch reads C. Treat this as a real behavior mismatch, not a label
   problem.
3. The wheel consumes 1–8 and Tab while open; scroll currently changes only
   callout pages. New wheel/scoreboard bindings must respect that priority and
   must not switch guns or spend supplies behind a picker.
4. The guides still said 4–8 despite grenade slot 9. This UI release corrects
   the training guides and clarifies hold C. A future remap should generate
   the guides, belt keys, prompts and accessibility labels from the same action
   definitions as the handler.
5. Inspection keys differ across popular games. Don't chase a supposed single
   industry standard: adopt one coherent default and provide a legacy preset
   plus per-action rebinding, duplicate-binding checks and reset controls.

## Delivery order

First add the shared action registry and tests for keydown/keyup, repeat,
modifier keys, lost focus and menu/picker priority. Then add G grenade, wheel
cycling, Ctrl crouch and Tab scores. Unify interaction targeting before moving
inspect to N. Finally add the combined healing selector and rebinding UI.
Keep touch and pilot actions calling semantic engine methods; a PC rebind
must not change host authority, grenade commit rules or multiplayer messages.

## Current FPS references

- [EA: Apex Legends PC and controller controls](https://help.ea.com/en/articles/apex-legends/pc-and-controller-settings/)
  supplies the current interaction/grenade/healing/inspect/cycling baseline.
  It also exposes player rebinding. Its numbered weapon/ability arrangement
  is not copied wholesale because this game has three possible carried guns,
  no hero abilities, and a prone mechanic.
- [EA: Battlefield 6 mouse/keyboard and controller settings](https://help.ea.com/en/articles/battlefield/battlefield-6/pc-and-controller-settings-guide/)
  supports the approach of configurable controls, testing in the firing range,
  and consistent controls across gameplay categories. Its page is not treated
  as evidence for exact PC defaults it does not enumerate.

Recommendations in the table are design judgments for this game; they are not
assertions that the reference games all use the same keys.
