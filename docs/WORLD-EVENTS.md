# World events and Singapore weather

Open **World conditions** below the walk/drive scene, or inside the FPS/expedition
start and pause menus. Pick weather and a celebration independently, or leave
both on automatic. Preferences persist locally and survive district travel.

The shared atmosphere runs in all 19 authored walk/drive districts, range,
solo arena, LAN arena and expedition. It does not alter Street View photographs,
the legacy reconstructed panorama, or the generic Joyride scene.

## Celebrations

| Event | Automatic window, Singapore time | Appearance |
| --- | --- | --- |
| Christmas | December 1–30 | Red/gold light strings and hanging stars |
| New Year | December 31–January 2 | Gold/cyan lights and aerial firework particles |
| Lunar New Year | First 15 days, dates supplied for 2025–2034 | Red/gold lights and lanterns |
| National Day | August 1–9 | Red/white lights and aerial firework particles |

These are game event windows, not public-holiday claims or real event schedules.
Decorations hang around up to eight existing landmark/stamp anchors per district.
They are visual only: no collision, rewards, modified loot or vendor prices.
Christmas does not produce snow. “No celebration” disables decorations.

Lunar start dates come from [Hong Kong Observatory Table 1](https://www.hko.gov.hk/en/Observatorys-Blog/109092/).
The explicit UTC+8 date table avoids an observed ICU Chinese-calendar discrepancy
on 6 February 2027. Extend `LUNAR_NEW_YEAR_STARTS` for years after 2034; unlisted
years have no automatic lunar event, but the manual selection always works.

## Weather

Sunny/humid, overcast, passing showers, afternoon thunderstorm, monsoon rain,
Sumatra squall and haze change sky/fog colour, visibility, sunlight and rain.
Squalls have stronger slanted rain. Thunderstorms add a gentle cloud-light glow.
Weather is a game simulation; it makes no forecast, Google, or air-quality API
requests. There is no simulated snow, cyclone, flood, heat damage or PSI reading.

Automatic mode chooses deterministic ten-minute UTC slots with game-tuned
season/time weights: more monsoon rain November–January, afternoon storms,
early-day squalls April–November, and occasional July–October haze. These weights
are atmosphere choices, not calibrated meteorology or predictions. Transitions
blend over several seconds. Calendar events use Singapore dates regardless of
the device timezone. Both systems continue while a menu is open.

LAN always uses automatic conditions and ignores private overrides, so presets
cannot be changed independently during a match. Devices need reasonably correct
system clocks; there is no host clock synchronization in this version. Reduced
effects remain a local accessibility option. Bot perception, damage, movement,
water shaders and sound are unchanged; fog affects rendered visibility only.

## Rendering and extension

`world-events.ts` owns catalogs, calendar and automatic selection;
`environment-settings.ts` owns validated saved preferences;
`world-atmosphere.ts` owns the scene effect and disposal;
`EnvironmentControls.tsx` is shared by the walk/drive and FPS menus.

Rain is one line draw capped at 900 drops. A spatial grid of the district's
static collider footprints provides approximate shelter (12 m fallback roof
height where absent); this is not an indoor or architectural roof solver.
Festival bulbs use two instanced draws, fireworks one fixed 120-point pool.
All effect objects are explicitly excluded from raycasts, including host bot
sight lines. Disposal restores the original sky, fog and light intensities.

Reduced effects and the system reduced-motion preference cut rain to 225 drops
and disable fireworks and lightning. Steady decorations and visibility remain.
Add a catalog entry plus its calendar rule/visual style to extend events;
add a weather profile and automatic weighting to extend weather.

Regression coverage: Singapore midnight/year boundaries, lunar boundaries,
manual/off overrides, corrupt saves, deterministic slots, all weather presets,
fixed pools, shelter, non-collision, LAN override isolation, reduced effects,
and exact restoration on disposal.
