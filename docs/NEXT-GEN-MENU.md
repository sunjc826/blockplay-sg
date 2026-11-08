# Menu design comparison

Settings → Video → Menu design switches between Classic (the default) and
Next-gen. The choice is local to the browser and survives reloads. Both designs
use the same routes, saved profile and game setup. The setting is also available
in the existing in-game Settings overlay.

Next-gen covers the home screen and the Play, Single Player, Multiplayer and
Training selectors. Tall panels expand on desktop hover and keyboard focus;
native links retain Tab, Enter and modified clicks. Arrow keys, Home and End
move between activity panels. Phone panels stack, and reduced motion removes
zoom, expansion and animation. No new audio generation or gameplay changes.

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
