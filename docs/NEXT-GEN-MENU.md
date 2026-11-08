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
Panel labels stay clear of these controls. The two play panels expand gently
on hover/focus; the equipment column keeps its width and equal-height tiles.
Back from either mode selector returns to the main menu. Classic retains its
Play → Single Player / Multiplayer hierarchy, and `/play` remains accessible.

Next-gen also covers the Play, Single Player, Multiplayer and Training
selectors. Native links retain Tab, Enter and modified clicks. Arrow keys,
Home and End move between panels. Phone home layouts stack the play panels
over side-by-side Store/Inventory tiles. Reduced motion removes zoom,
expansion and animation. Installation is available in the footer; manual
installation help floats above the bottom controls on request. No new artwork, audio or gameplay
changes in the three-column revision.

Verification: `pnpm test:menu-design` with Vite and Chrome CDP at the same
FPS_APP_ORIGIN / FPS_CHROME_ORIGIN used by `test:menu-navigation`. Screenshots
are written to `.cache/next-gen-menu/`.

## Artwork provenance

`public/images/menu/operations.jpg` is original concept artwork generated with
the built-in image_gen tool, then encoded as JPEG for delivery. It is decorative
menu art, not a gameplay screenshot or geographic reference. The existing
armory equipment renders supply the Inventory and Store panel artwork.

Final generation prompt:

> Use case: stylized-concept. Asset type: original cinematic game menu background for blockplaySG, a stylized Singapore tactical sandbox game. Create a wide 1536x1024 landscape key art image: two anonymous angular low-poly tactical operators in helmets and muted olive equipment on a Singapore rooftop, one large foreground operator holding a lowered rifle on the right third, a smaller teammate at center, Marina Bay inspired three-tower skyline and tropical high-rise city on the left, dramatic amber sunset cutting through cool graphite mist. Sophisticated premium game art, crisp faceted 3D forms, atmospheric depth, restrained detail, pale gold rim lighting. The left third should be mostly atmospheric skyline, the middle an urban rooftop and smaller teammate, the right the heroic foreground operator. Keep the upper and lower edges dark enough for interface overlays. Artwork only, no UI, no words, no logos, no watermark, no brands, no gore. Cinematic landscape composition with generous headroom; not photorealistic, not a screenshot of an existing game.
