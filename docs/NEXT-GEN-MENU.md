# Menu design comparison

Settings → Video → Menu design switches between Classic (the default) and
Next-gen. The choice is local to the browser and survives reloads. Both designs
use the same routes, saved profile and game setup. The setting is also available
in the existing in-game Settings overlay.

Next-gen puts Single Player and Multiplayer directly on the home screen in
full-viewport-height panels, alongside a narrower column split into Store and
Inventory. Profile/level and Settings float over the top of the artwork, with
Install and Debug together at the bottom right. The keyboard hint and edition
caption are omitted on Next-gen home; keyboard navigation still works.
One continuous panorama runs behind all four actions: Singapore city at the
left, teammates in the middle, a rooftop armory counter behind Store, and a
personal field kit and loadout bench behind Inventory. Phone screens use a
portrait composition with the armory and personal kit side by side at the
bottom. Hover/focus gently moves the shared scene, including equipment actions;
no individual image crops break continuity at pane boundaries.
Dark gutters separate the panes (12px on desktop, 8px in the stacked layout)
so hover expansion is more apparent; the panorama assets remain unchanged.
Panel labels stay clear of these controls. The two play panels expand gently
on hover/focus. In the wide layout, Store and Inventory widen their column
from 28% to 38%; Store grows downward to 58% of its height, and Inventory
grows upward to 62%, revealing more of the shelf or loadout bench. Keyboard
focus does the same; pointer hover takes precedence. The shared scene gently
reframes toward its right edge to reveal the full shelf/kit on narrower desktops.
Touch layouts stay steady.
Back from either mode selector returns to the main menu. Classic retains its
Play → Single Player / Multiplayer hierarchy, and `/play` remains accessible.

Next-gen also covers the Play, Single Player, Multiplayer and Training
selectors. Their panes fill the viewport vertically, separated by 12px gaps,
with Back, screen title and Settings floating over the artwork. Desktop hover
and keyboard focus expand panes with the same 1.2 flex growth as the home menu.
At 900px and below, full-height panes form a horizontally swipeable row with
8px gaps and a visible next pane; keyboard focus scrolls offscreen modes into
view. The old heading block and keyboard-hint footer no longer take space.
Their cards have seven independent mode-specific illustrations:
Open World, Training/Live-fire Range, Tutorial, Team Deathmatch, Hardpoint,
Free-for-All and Find a Room. Solo and hosted matches share their mode image;
these illustrations do not form a panorama. Assets and exact generation
prompts are recorded in [MODE-ARTWORK.md](MODE-ARTWORK.md).
Native links retain Tab, Enter and modified clicks. Arrow keys,
Home and End move between panels. Phone home layouts stack the play panels
over side-by-side Store/Inventory tiles. Reduced motion removes zoom,
expansion and animation. Installation is available in the footer; manual
installation help floats above the bottom controls on request.

Verification: `pnpm test:menu-design` with Vite and Chrome CDP at the same
FPS_APP_ORIGIN / FPS_CHROME_ORIGIN used by `test:menu-navigation`. Screenshots
are written to `.cache/next-gen-menu/`.

## Artwork provenance

Home landscape edit prompt:

> Use case: stylized-concept / compositing edit. Edit the supplied original blockplaySG artwork into ONE continuous wide landscape rooftop panorama for a game menu. Preserve the beautiful faceted low-poly 3D style, amber sunset, graphite mist, Singapore Marina Bay inspired skyline on the left, cinematic warm rim light, and overall visual identity. Recompose subjects to support menu regions with absolutely no drawn panel borders: LEFT 0–36% is the city skyline and open-world vista; MIDDLE 36–72% is two tactical teammates together, one prominent helmeted operator with lowered rifle centered around x=57%, the second behind, their bodies staying mostly within that middle region. RIGHTMOST 28% is a coherent rooftop quartermaster station connected to the same scene, with two distinct elevations: its UPPER half (x=74–98%, y=12–38%) has a clearly readable armory shop wall displaying several different rifles and boxed supplies above a small requisition counter, warm task lighting; its LOWER half (x=74–98%, y=56–80%) has an open personal field kit on a nearer workbench, an olive backpack, plate carrier, folded tactical gloves, neatly organized magazines and helmet, unmistakably a personal loadout laid out for inspection. The two right-hand work surfaces share the same perspective, architecture and light, not two separate pictures. Foreground operators must not obscure the armory or personal kit. Preserve depth, roof railings and flowing skyline; give each subject room, restrained believable details. Keep y=38–48% and y=83–98% on right relatively dark and uncluttered for later UI labels. Wide landscape composition, 1536x1024 or similar. No text, no lettering, no UI, no labels, no logos, no visible panel divisions, no watermark, no photorealism. Keep original scene's cinematic lighting and quiet atmosphere.

Home portrait adaptation prompt:

> Use case: stylized-concept / responsive compositing edit. Adapt the supplied wide blockplaySG rooftop panorama into ONE continuous PORTRAIT illustration, 1024x1536, for a narrow phone menu. Preserve exactly the same faceted low-poly game art, Singapore skyline identity, quiet amber sunset, graphite clouds, tactical operators and warm armory lighting. Recompose for these phone menu regions, without drawing frames or UI: UPPER 0–36% height is an airy dramatic Singapore Marina Bay city vista with the three-tower skyline and warm sunset, no giant foreground operator blocking this upper vista. MIDDLE 36–72% height is a nearby rooftop landing with two helmeted teammates, one prominent with lowered rifle, as part of the same city and rooftop perspective. BOTTOM 72–100% height is a single foreground rooftop equipment station viewed slightly from above, spanning the width: LEFT half has a compact quartermaster shop counter with several rifles displayed on a pegboard, stacked sealed supply boxes and a small requisition terminal; RIGHT half has a personal loadout bench with an open field-kit case, olive backpack, plate carrier, gloves, helmet and organized magazines. Make the bottom equipment large enough to read at phone scale and clearly different on the left vs right. Keep the bottom scene connected via one continuous counter/bench, matching perspective and lighting. All four regions must belong to one coherent scene, no collage, no hard horizon resets, no separate panels. Reserve gentle dark space around y=29–35%, y=62–70%, and y=91–100% for future text. Portrait composition, 1024x1536. No words, letters, logos, watermarks, UI or drawn dividers. Do not output a landscape image.

`public/images/menu/operations.jpg` is original concept artwork generated with
the built-in image_gen tool, then encoded as JPEG for delivery. It remains on
the activity selectors. It is decorative menu art, not a gameplay screenshot
or geographic reference.

The home panorama uses `public/images/menu/operations-hub.jpg` and, on phones
up to 700px wide or portrait tablets up to 1000px wide,
`public/images/menu/operations-hub-portrait.jpg`. Both were made
with the built-in image_gen edit tool from the original artwork (the portrait
uses the edited landscape as its reference). They were encoded as JPEG for
delivery; original assets were preserved. These replace the separate armory
product renders on the home menu with equipment integrated into the scene.

Original generation prompt:

> Use case: stylized-concept. Asset type: original cinematic game menu background for blockplaySG, a stylized Singapore tactical sandbox game. Create a wide 1536x1024 landscape key art image: two anonymous angular low-poly tactical operators in helmets and muted olive equipment on a Singapore rooftop, one large foreground operator holding a lowered rifle on the right third, a smaller teammate at center, Marina Bay inspired three-tower skyline and tropical high-rise city on the left, dramatic amber sunset cutting through cool graphite mist. Sophisticated premium game art, crisp faceted 3D forms, atmospheric depth, restrained detail, pale gold rim lighting. The left third should be mostly atmospheric skyline, the middle an urban rooftop and smaller teammate, the right the heroic foreground operator. Keep the upper and lower edges dark enough for interface overlays. Artwork only, no UI, no words, no logos, no watermark, no brands, no gore. Cinematic landscape composition with generous headroom; not photorealistic, not a screenshot of an existing game.
