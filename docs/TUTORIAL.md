# Recruit field school

Open **Tutorial** from the main menu, or visit `/tutorial`. The course uses the
same FPS engine, keyboard bindings, weapon handling and touch controls as play.
Its compact training yard stays sunny at midday without changing saved weather
or display preferences. It uses a fresh issued loadout and no incoming fire.
Course hits, supplies and completion never change the player's armory profile.

The eleven lessons teach looking, walking, sprinting, jumping a low hurdle,
crouching under a beam, going prone, aiming, hitting a target, finishing a reload,
switching carried weapons, and opening then closing a map. Numbered gates and a
glowing ground ring mark movement destinations. A lesson advances only after
its action and location requirements are met. The 50 cm hurdle exceeds the
engine's 35 cm automatic step height; the tunnel's 1.3 m underside clears a
crouched body and blocks a standing one. Targets do not end the course when
cleared, so players can still learn the reload and weapon controls.

Escape or the Menu button pauses. The pause card offers a lesson skip and a full
restart; there is no timer requirement or failure penalty. Progress is kept
while the course remains mounted; leaving or reloading starts a new run. Players
can go directly to the store tour from the briefing or pause card.

The store orientation uses the actual armory, with six stops covering currency
and progression, categories, carried weapon slots, equipment comparisons,
consumable supplies and deployment. It highlights the relevant area and asks the
player to open Armor, Weapons and Utilities. The player can go back or close the
tour. No purchase is required. **Tour store** in the Store header reopens it.
Normal purchases remain available during the tour and use the player's wallet.

Implementation: `tutorial-course.ts` owns the progression rules;
`tutorial-world.ts` builds the collision geometry; `TutorialGame.tsx` presents the
lesson and existing game HUD; `StoreTutorial.tsx` guides the armory. The ordinary
district and arena flows do not enable the engine's tutorial option.
