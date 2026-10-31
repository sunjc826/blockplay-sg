# Recruit field school

Open **Tutorial** from the main menu, or visit `/tutorial`. The course uses the
same FPS engine, keyboard bindings, weapon handling and touch controls as play.
Its 150 × 210 m training compound stays sunny at midday without changing saved weather
or display preferences. It uses a fresh issued loadout and no incoming fire.
Course hits, supplies and completion never change the player's armory profile.

The eleven lessons teach looking, walking, sprinting, jumping a low hurdle,
crouching under a beam, crawling beneath low mesh, aiming, hitting a target, finishing a reload,
switching carried weapons, and opening then closing a map. Side-mounted numbered station boards and glowing ground rings mark movement
destinations. A 20 m approach leads to a marked 50 m sprint track; at least
35 m of actual forward sprinting is required. The hurdle, covered crouch
passage and low crawl have separate run-up and recovery areas. After the crawl,
the route turns right to a separate firing bay with benches and a backstop. A lesson advances only after
its action and location requirements are met. The 50 cm hurdle exceeds the
engine's 35 cm automatic step height; the tunnel's 1.3 m underside clears a
crouched body and blocks a standing one. The 8 m mesh lane has an 80 cm
underside: standing and crouching are blocked, while the prone body fits. The
lesson requires entering and exiting the mesh prone; lying down at the finish
ring or walking around the obstacle does not count. Standing after clearing the
mesh is allowed. Targets do not end the course when
cleared, so players can still learn the reload and weapon controls.

Escape or the Menu button pauses. The pause card offers a lesson skip and a full
restart. Skipping places the player at the next lesson’s approach, beyond the
skipped obstacle; there is no timer requirement or failure penalty. Progress is kept
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
