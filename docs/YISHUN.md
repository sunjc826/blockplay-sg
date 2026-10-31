# Yishun: final boss of the heartlands

Yishun is the twentieth playable district. Its danger is a deliberately
exaggerated game joke. Real residents and real-world safety are not the subject
of the combat rating. The familiar town remains a warm, leafy heartland; the
fictional combat factions supply the chaos.

## Playable layout

The compressed map has Northpoint-inspired twin retail wings and a public
terrace with two working stair approaches, a north-south elevated MRT and
moving train, a Chong Pang-inspired market with an open central aisle, nine
housing slabs with passable void decks, sheltered linkways, a pond-side path
loop and a neighbourhood pavilion. Eleven stamps connect these places.

All road loops, collectible positions, ground anchors and checkpoint arrivals
are authored for gameplay. They do not represent surveyed distances or access
plans. The pond is impassable water; paths run around all four banks. The
separate east field holds the eight-target FPS range and vehicle spawns.

Yishun connects reversibly to Woodlands and Upper Thomson. It participates in
the existing walking/driving, FPS practice, supplies, NPC/vendor, capture-site,
minimap, route planning and open-world systems. The market vendor sells the
existing kaya-toast item; the local guide delivers the tongue-in-cheek briefing.
No new voice or sound generation is required.

## Fictional combat tuning

- High risk and tier 3 loot; eight mixed-role bots in its district patrol preset,
  the largest preset at introduction. The current open world uses a shared,
  bounded battlefield roster instead of increasing its size per district.
- Nine sectors with mercenary heat floors of .75–.9, ceilings of 1 and
  hair-trigger curves. Allied bands remain .1–.45. Heat raises enemy kit and
  reinforcement pressure within the existing roster; no new AI rules or
  unlimited population are introduced.
- At rest the actual district heat field has about .988 enemy strength and a
  12.3-second heat-based top-up interval, versus about .732 and 19.5 seconds for
  the existing Raffles Place, Changi and Tuas presets. Other transport budgets,
  protected spawn rules and event cooldowns still apply.
- Thirteen tactical supplies: five weapon, four ammunition, two medical and
  two armour crates. Base weapon probabilities are 55% elite, 35% field and
  10% issued, with normal sector bias. Food is handled separately.
- Chong Pang has measured `broken` cover; the remaining sectors measure `open`
  under the existing crouching cover metric. Market stalls shelter players;
  water and planted crowns do not become bulletproof walls.

The picker says “Final boss of the heartlands”; the road sign says “WELCOME TO
YISHUN — GOOD LUCK”. The briefing explicitly calls this fictional combat.

## Research and provenance

Landmark selection was checked against these public sources on 31 October 2026:

- [HDB: Yishun town](https://www.hdb.gov.sg/about-us/our-towns-and-estates/yishun).
- [HDB: Yishun Town Design Guide](https://www.hdb.gov.sg/-/media/doc/DDG-UPG/TDGs/Yishun-Town-Design-Guide.pdf),
  identifying the MRT, Northpoint and town/park nodes. No PDF geometry was copied.
- [NParks: Yishun Park](https://www.nparks.gov.sg/visit/parks/park-detail/yishun-park).
- [PUB: Yishun Pond](https://www.pub.gov.sg/Public/Places-of-Interest/Our-Reservoirs-and-Waterways/Yishun-Pond).

This addition has schematic geometry and an empty `referenceFeatures` list.
It has no accepted photographic-reference claim, no reviewed learning catalog,
and was not part of the September correction pass for the original nineteen
districts. No paid Google captures, model or audio requests were made.

## Validation

Shared district checks exercise car-width spawn/anchor/stamp reachability,
every displayed road, all checkpoint arrivals, FPS targets, motor-pool clearances,
capture-site placement, upper-floor access, supply placement and disposal.
The Yishun-specific regression checks the shipped district adapter's higher
heat pressure, quiet-time floor, physical passages, pond exclusion and direct
reversible connections. Browser review covers the rendered landmarks and actual
game entry; run evidence is retained locally in `.cache/yishun/`.
