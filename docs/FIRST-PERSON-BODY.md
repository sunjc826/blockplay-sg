# First person body

Looking down while on foot shows the local player's uniform, articulated legs,
boots, carrying rig and equipped inserts. The body follows world position and
yaw; walking, turning, crouching, jumping and crawling use the existing character
rig. First person weapons and supply hands retain their handling animations.
The local head and duplicate arms are hidden. Vehicles and defeat hide this body.

Resolved loadouts retain `rigId` and `plateId`. Changing either rebuilds worn
equipment. Insert color, thickness and fruit spikes follow the equipped catalog
item; depleting protection does not remove the worn inserts.

Carrying rigs have six base pouches plus one per 30 additional reserve rounds:
ILBV has **6**, Enhanced **8**, Sentinel **9**. Inserts do not add carrying capacity.
Pouches fill from live reserves, so pickups, ammo supplies, reloads and reset
change their contents. Loaded rounds remain on the weapon. A partial reserve
magazine occupies one slot; a shared calibre is counted once. Different carried
calibres share the visible slots in round-robin order. Shared calibres use the
active matching weapon’s capacity and feed type, falling back to the first carried
weapon. Pistol magazines are smaller, drum-fed weapons show cylindrical drums,
and belt-fed MGs show ammunition boxes with lids, latches, carry handles and a
short visible linked belt. Pouches expand in depth for drums and boxes. These are a visual summary, not additional inventory
limits: overflow ammunition remains available under the existing ammo rules.

The body draws with world depth and lighting, and is excluded from gameplay rays.
Its resources are released on teardown and equipment replacement.

Validation:

- `pnpm test -- src/game/fps-body.test.ts` covers capacity, live reserves, shared
  calibres, equipment replacement, spent inserts, poses and disposal.
- With Vite and isolated Chrome running, `node scripts/fps-body-smoke.mjs` checks
  equipment variants, ammo resupply/reload/reset and crouch/prone in the engine.
  Set `FPS_APP_ORIGIN` and `FPS_CHROME_ORIGIN` for different ports (defaults 5175
  and 9231). Screenshots and a report go to `.cache/fps-body/`.
