import type { WorldZoneId } from '../game/world-zones';
import type { ZoneSector } from '../game/zone-sectors';

/**
 * Sector data for every district. Bounds and anchors are transcribed from the
 * scenes rather than imported from them, the way the zone spawns and the stamp
 * lists are: this module and `world-zones.ts` stay free of three.js, and
 * `zone-sectors.test.ts` builds the real scene so a later geometry change
 * cannot silently wall a sector off or leave an anchor inside a building.
 *
 * Anchors were placed by `pnpm sector:anchors`, which seeds each sector from
 * the district's own stamps and encounter spawns and fills the rest by
 * farthest-point sampling over the reachable set. Hand-picking five hundred
 * positions across nineteen districts would not have been reliable, and the
 * tool measures the cover band at the same time so no label is a guess.
 *
 * Most sectors read `open`. Only HarbourFront has had a cover pass, so that is
 * the honest state of the maps rather than a miscalibration of the bands.
 */

const HARBOURFRONT_SECTORS: readonly ZoneSector[] = [
  // The promenade strip you spawn on: twelve metres of paving between the
  // frontage and the basin wall, running most of the district's width. It is
  // the fastest way east or west and there is nothing on it to hide behind.
  { id: 'quay', name: 'HarbourFront quay', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1.5,
    bounds: { minX: -232, maxX: 146, minZ: 122, maxZ: 140 },
    anchors: [{ x: 20, z: 134 }, { x: -75, z: 134 }, { x: -200, z: 132 }, { x: -140, z: 132 }, { x: 75, z: 132 }, { x: 122, z: 132 }] },
  // The mall is one solid stepped mass, so its sector is the ring of ten- to
  // fourteen-metre lanes around it, plus the amphitheatre and the station
  // entrance at its quay corner. Central, so everyone passes through it.
  { id: 'vivocity', name: 'VivoCity waterfront', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: 0, maxX: 124, minZ: -14, maxZ: 114 },
    anchors: [{ x: 60, z: -6 }, { x: 60, z: 108 }, { x: 117, z: 40 }, { x: 117, z: 86 }, { x: 117, z: -6 }] },
  // The cruise hall and its two boarding gangways, west of the quay street.
  // Same shape as VivoCity — a big mass with lanes round it — one street over.
  { id: 'cruise-centre', name: 'Cruise Centre', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -130, maxX: -20, minZ: -14, maxZ: 114 },
    anchors: [{ x: -75, z: -6 }, { x: -25, z: 50 }, { x: -75, z: 108 }, { x: -124, z: 50 }, { x: -25, z: -6 }] },
  // The furthest ground from the spawn, so it carries the reward — and since
  // the container rows were laid out properly it is also the only ground in the
  // district with cover worth the name: 4.5 m to the nearest hard edge, against
  // 8 m at the malls and nothing at all on the quay. That is what the zone
  // description always promised by "the wharf end has cover, the water end has
  // none", and it is now true rather than aspirational.
  { id: 'keppel-wharf', name: 'Keppel wharf', cover: 'dense', lootWeight: 3, tierBias: 1, botWeight: 2,
    bounds: { minX: 146, maxX: 218, minZ: 132, maxZ: 188 },
    anchors: [{ x: 180, z: 134 }, { x: 180, z: 160 }, { x: 155, z: 155 }, { x: 155, z: 175 }, { x: 180, z: 178 }] },
  // Eleven metres wide, fifty-six long, water on both sides and the Sentosa
  // checkpoint at the far end. A crate here is a dare rather than a supply.
  { id: 'boardwalk', name: 'Sentosa boardwalk', cover: 'dense', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: 100, maxX: 120, minZ: 132, maxZ: 196 },
    anchors: [{ x: 109, z: 165 }, { x: 109, z: 145 }, { x: 109, z: 180 }] },
  // Terraces stacked to a lookout. They are impassable, so the fighting is in
  // the lanes between their skirts and the perimeter: short sightlines, and the
  // one place in the district that is not overlooked by something else.
  { id: 'faber-ridge', name: 'Mount Faber ridge', cover: 'broken', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -226, maxX: -150, minZ: -146, maxZ: -30 },
    anchors: [{ x: -185, z: -140 }, { x: -152, z: -85 }, { x: -218, z: -85 }, { x: -185, z: -35 }] },
  // The green continuing north off the ridge, and the ground the Queenstown
  // checkpoint lands you on. Four tree trunks and nothing else wide enough to
  // hide behind, so arriving here means arriving in the open.
  { id: 'telok-blangah', name: 'Telok Blangah green', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 0.5,
    bounds: { minX: -226, maxX: -150, minZ: -25, maxZ: 110 },
    anchors: [{ x: -185, z: 50 }, { x: -185, z: -10 }, { x: -218, z: -20 }, { x: -185, z: 20 }, { x: -152, z: 50 }] },
  // Annexe, car-park deck and depot along the inland edge, with a gap at the
  // quay street between the first two. Furthest from the water, least reason to
  // be there, so the trek is worth a couple of crates.
  { id: 'harbour-depot', name: 'Harbour depot row', cover: 'broken', lootWeight: 2, botWeight: 1,
    bounds: { minX: -130, maxX: 218, minZ: -142, maxZ: -52 },
    anchors: [{ x: 180, z: -60 }, { x: 60, z: -60 }, { x: -75, z: -60 }, { x: 0, z: -70 }, { x: 130, z: -70 }, { x: -10, z: -105 }] },
  // Open lawn between the depot row and the wharf: the eastern approach, and
  // the ground the practice range is laid out on. Four trees and two benches.
  { id: 'gateway-lawn', name: 'Gateway lawn', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 146, maxX: 218, minZ: -10, maxZ: 110 },
    anchors: [{ x: 180, z: 50 }, { x: 180, z: 88 }, { x: 155, z: 20 }, { x: 205, z: 70 }] },
];

/**
 * Waterfront approaches: the bayfront podium and the gardens carry the
 * weight, the bay crossing and the promenades are what you cross to reach them.
 */
const MARINA_BAY_SECTORS: readonly ZoneSector[] = [
  { id: 'bayfront', name: 'Bayfront podium', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: 20, maxX: 180, minZ: 20, maxZ: 110 },
    anchors: [{ x: 45, z: 65 }, { x: 126, z: 65 }, { x: 172, z: 101 }, { x: 172, z: 29 }, { x: 86, z: 101 }] },
  { id: 'city-skyline', name: 'Skyline frontage', cover: 'open', lootWeight: 2, botWeight: 2,
    bounds: { minX: -180, maxX: -40, minZ: -40, maxZ: 70 },
    anchors: [{ x: -103, z: 15 }, { x: -70, z: 65 }, { x: -172, z: 61 }, { x: -172, z: -31 }, { x: -82, z: -31 }] },
  { id: 'bay-crossing', name: 'Bay crossing', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -90, maxX: 40, minZ: -160, maxZ: -70 },
    anchors: [{ x: -20, z: -112 }, { x: -80, z: -151 }, { x: -82, z: -79 }, { x: 32, z: -151 }, { x: 32, z: -93 }] },
  { id: 'artscience', name: 'ArtScience forecourt', cover: 'broken', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: 50, maxX: 170, minZ: -130, maxZ: -30 },
    anchors: [{ x: 103, z: -77 }, { x: 162, z: -121 }, { x: 162, z: -39 }, { x: 58, z: -121 }, { x: 110, z: -121 }] },
  { id: 'esplanade', name: 'Esplanade gardens', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -100, maxX: 50, minZ: -240, maxZ: -150 },
    anchors: [{ x: -25, z: -185 }, { x: -92, z: -231 }, { x: 42, z: -231 }, { x: 36, z: -159 }, { x: -88, z: -165 }] },
  { id: 'gardens-bay', name: 'Gardens by the Bay', cover: 'open', lootWeight: 2.5, tierBias: 1, botWeight: 1.5,
    bounds: { minX: 240, maxX: 386, minZ: -190, maxZ: 190 },
    anchors: [{ x: 320, z: 135 }, { x: 326, z: -130 }, { x: 248, z: 1 }, { x: 378, z: 17 }, { x: 248, z: -181 }] },
  { id: 'marina-barrage', name: 'Barrage lawns', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -30, maxX: 160, minZ: 100, maxZ: 270 },
    anchors: [{ x: 25, z: 140 }, { x: 85, z: 228 }, { x: 152, z: 109 }, { x: -22, z: 261 }, { x: 152, z: 187 }] },
  { id: 'civic-district', name: 'Civic district', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -336, maxX: -130, minZ: 60, maxZ: 190 },
    anchors: [{ x: -191, z: 95 }, { x: -280, z: 130 }, { x: -138, z: 181 }, { x: -218, z: 181 }, { x: -328, z: 75 }] },
  { id: 'flyer', name: 'Observation wheel', cover: 'open', lootWeight: 1, tierBias: 1, botWeight: 0.5,
    bounds: { minX: 180, maxX: 320, minZ: -320, maxZ: -200 },
    anchors: [{ x: 246, z: -265 }, { x: 312, z: -209 }, { x: 188, z: -209 }, { x: 312, z: -311 }, { x: 188, z: -311 }] },
];

/**
 * The CBD, and the densest sectoring in the set. The square and the two
 * arcades are the traffic; the river frontages hold the better supplies.
 */
const RAFFLES_PLACE_SECTORS: readonly ZoneSector[] = [
  { id: 'raffles-square', name: 'Raffles square', cover: 'open', lootWeight: 2.5, botWeight: 2.5,
    bounds: { minX: -50, maxX: 70, minZ: -60, maxZ: 40 },
    anchors: [{ x: 0, z: -20 }, { x: 34, z: 12 }, { x: 62, z: -52 }, { x: -42, z: 32 }, { x: -42, z: -52 }] },
  { id: 'boat-quay', name: 'Boat Quay lane', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: -200, maxX: -80, minZ: -132, maxZ: -70 },
    anchors: [{ x: -140, z: -113 }, { x: -88, z: -78 }, { x: -192, z: -80 }, { x: -94, z: -124 }, { x: -184, z: -124 }] },
  { id: 'river-lookout', name: 'River lookout', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -70, maxX: 70, minZ: -132, maxZ: -80 },
    anchors: [{ x: 0, z: -122 }, { x: 0, z: -115 }, { x: 62, z: -88 }, { x: -62, z: -88 }, { x: 42, z: -124 }] },
  { id: 'battery-road', name: 'Battery promenade', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: 90, maxX: 210, minZ: -132, maxZ: -70 },
    anchors: [{ x: 145, z: -117 }, { x: 202, z: -80 }, { x: 98, z: -82 }, { x: 190, z: -124 }, { x: 102, z: -124 }] },
  { id: 'market-street', name: 'Market arcade', cover: 'open', lootWeight: 2, botWeight: 2,
    bounds: { minX: 60, maxX: 170, minZ: 10, maxZ: 90 },
    foodAnchors: [{ x: 80, z: 45 }, { x: 107, z: 45 }],
    anchors: [{ x: 107, z: 45 }, { x: 80, z: 45 }, { x: 162, z: 82 }, { x: 162, z: 18 }, { x: 68, z: 82 }] },
  { id: 'cecil-street', name: 'Cecil Street', cover: 'broken', lootWeight: 2, botWeight: 2,
    bounds: { minX: -140, maxX: -20, minZ: 55, maxZ: 140 },
    anchors: [{ x: -75, z: 96 }, { x: -132, z: 132 }, { x: -28, z: 132 }, { x: -28, z: 64 }, { x: -92, z: 132 }] },
  { id: 'cross-street', name: 'Cross Street arcade', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -288, maxX: -180, minZ: 30, maxZ: 140 },
    anchors: [{ x: -242, z: 85 }, { x: -188, z: 38 }, { x: -188, z: 132 }, { x: -280, z: 38 }, { x: -278, z: 132 }] },
  { id: 'telok-ayer', name: 'Telok Ayer green', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -180, maxX: -50, minZ: 165, maxZ: 263 },
    anchors: [{ x: -112, z: 214 }, { x: -172, z: 174 }, { x: -172, z: 254 }, { x: -58, z: 174 }, { x: -58, z: 254 }] },
  { id: 'robinson-road', name: 'Robinson colonnade', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 40, maxX: 170, minZ: 170, maxZ: 263 },
    anchors: [{ x: 100, z: 222 }, { x: 162, z: 178 }, { x: 162, z: 254 }, { x: 48, z: 178 }, { x: 48, z: 254 }] },
  { id: 'collyer-quay', name: 'Collyer boulevard', cover: 'open', lootWeight: 1.5, tierBias: -1, botWeight: 1,
    bounds: { minX: 190, maxX: 288, minZ: -40, maxZ: 80 },
    anchors: [{ x: 247, z: 16 }, { x: 198, z: 62 }, { x: 280, z: 72 }, { x: 280, z: -32 }, { x: 198, z: 2 }] },
];

/**
 * A housing estate, so the courtyards and void decks are the substance
 * and the corridor and gateway are the open ground between them.
 */
const QUEENSTOWN_SECTORS: readonly ZoneSector[] = [
  { id: 'station', name: 'Queenstown station', cover: 'open', lootWeight: 2, botWeight: 2,
    bounds: { minX: -60, maxX: 60, minZ: 0, maxZ: 90 },
    anchors: [{ x: 0, z: 41 }, { x: -52, z: 81 }, { x: 52, z: 79 }, { x: -52, z: 9 }, { x: 52, z: 9 }] },
  { id: 'void-decks', name: 'Void decks', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -130, maxX: -20, minZ: -90, maxZ: 0 },
    anchors: [{ x: -73, z: -44 }, { x: -122, z: -81 }, { x: -122, z: -9 }, { x: -28, z: -81 }, { x: -28, z: -9 }] },
  { id: 'community-court', name: 'Community court', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 40, maxX: 150, minZ: -70, maxZ: 20 },
    anchors: [{ x: 85, z: -40 }, { x: 142, z: 11 }, { x: 48, z: 11 }, { x: 142, z: -61 }, { x: 96, z: 5 }] },
  { id: 'library-garden', name: 'Library garden', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -20, maxX: 90, minZ: -140, maxZ: -60 },
    anchors: [{ x: 34, z: -88 }, { x: 82, z: -131 }, { x: -12, z: -131 }, { x: 82, z: -69 }, { x: -12, z: -69 }] },
  { id: 'green-corridor', name: 'Green corridor', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -220, maxX: -100, minZ: 10, maxZ: 120 },
    anchors: [{ x: -157, z: 65 }, { x: -140, z: 116 }, { x: -212, z: 111 }, { x: -212, z: 19 }, { x: -108, z: 19 }] },
  { id: 'commonwealth', name: 'Commonwealth gardens', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -255, maxX: -130, minZ: -200, maxZ: -80 },
    anchors: [{ x: -193, z: -135 }, { x: -138, z: -191 }, { x: -246, z: -191 }, { x: -138, z: -89 }, { x: -246, z: -89 }] },
  { id: 'dawson', name: 'Dawson courtyard', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1,
    bounds: { minX: 120, maxX: 250, minZ: 80, maxZ: 200 },
    anchors: [{ x: 182, z: 139 }, { x: 140, z: 116 }, { x: 242, z: 191 }, { x: 242, z: 89 }, { x: 128, z: 191 }] },
  { id: 'gateway', name: 'Neighbourhood gateway', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -70, maxX: 70, minZ: -205, maxZ: -120 },
    anchors: [{ x: 0, z: -162 }, { x: -62, z: -197 }, { x: 62, z: -197 }, { x: -60, z: -129 }, { x: 60, z: -129 }] },
];

/**
 * Market lanes and temple forecourts. Short sightlines nearly everywhere,
 * which is why so much of it bands tighter than the rest of the set.
 */
const CHINATOWN_SECTORS: readonly ZoneSector[] = [
  { id: 'smith-street', name: 'Smith Street', cover: 'dense', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -60, maxX: 60, minZ: 40, maxZ: 120 },
    anchors: [{ x: 0, z: 80 }, { x: -51, z: 112 }, { x: -51, z: 48 }, { x: 51, z: 112 }, { x: 51, z: 48 }] },   // median 6.0m
  { id: 'pagoda-street', name: 'Pagoda Street market', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -70, maxX: 50, minZ: -60, maxZ: 30 },
    anchors: [{ x: -15, z: -15 }, { x: 41, z: 22 }, { x: 41, z: -52 }, { x: -61, z: 22 }, { x: -61, z: -52 }] },   // median 10.0m
  { id: 'buddha-tooth', name: 'Buddha Tooth temple', cover: 'broken', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: 45, maxX: 150, minZ: -25, maxZ: 60 },
    anchors: [{ x: 95, z: 20 }, { x: 141, z: -16 }, { x: 141, z: 52 }, { x: 53, z: -16 }, { x: 53, z: 52 }] },   // median 12.0m
  { id: 'sri-mariamman', name: 'Sri Mariamman gopuram', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: 80, maxX: 195, minZ: -140, maxZ: -40 },
    anchors: [{ x: 134, z: -92 }, { x: 187, z: -48 }, { x: 187, z: -132 }, { x: 89, z: -48 }, { x: 89, z: -132 }] },   // median 26.0m
  { id: 'peoples-park', name: 'People’s Park Complex', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -180, maxX: -70, minZ: -120, maxZ: -35 },
    anchors: [{ x: -120, z: -70 }, { x: -171, z: -112 }, { x: -79, z: -112 }, { x: -171, z: -44 }, { x: -79, z: -44 }] },   // median 10.0m
  { id: 'chinatown-complex', name: 'Chinatown Complex', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -175, maxX: -70, minZ: -30, maxZ: 40 },
    anchors: [{ x: -120, z: 14 }, { x: -167, z: -22 }, { x: -79, z: -22 }, { x: -167, z: 32 }, { x: -79, z: 32 }] },   // median 14.0m
  { id: 'kreta-ayer', name: 'Kreta Ayer square', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -180, maxX: -70, minZ: 48, maxZ: 130 },
    anchors: [{ x: -124, z: 78 }, { x: -90, z: 88 }, { x: -171, z: 122 }, { x: -171, z: 56 }, { x: -119, z: 122 }] },   // median 18.0m
  { id: 'club-street', name: 'Club Street terraces', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 85, maxX: 195, minZ: 35, maxZ: 125 },
    anchors: [{ x: 134, z: 74 }, { x: 187, z: 116 }, { x: 187, z: 44 }, { x: 93, z: 116 }, { x: 143, z: 116 }] },   // median 24.1m
  { id: 'telok-ayer-green', name: 'Telok Ayer green', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 150, maxX: 248, minZ: -40, maxZ: 40 },
    anchors: [{ x: 192, z: 0 }, { x: 239, z: 32 }, { x: 239, z: -32 }, { x: 159, z: 32 }, { x: 159, z: -32 }] },   // median 36.1m
  { id: 'bukit-pasoh', name: 'Bukit Pasoh lane', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -248, maxX: -150, minZ: -160, maxZ: -60 },
    anchors: [{ x: -196, z: -104 }, { x: -239, z: -152 }, { x: -159, z: -152 }, { x: -239, z: -68 }, { x: -159, z: -68 }] },   // median 14.0m
];

/**
 * Mosque forecourt at the centre with the lanes and textile rows around
 * it; the Beach Road edge provides a long sightline.
 */
const KAMPONG_GLAM_SECTORS: readonly ZoneSector[] = [
  { id: 'mosque-forecourt', name: 'Mosque forecourt', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -40, maxX: 60, minZ: -50, maxZ: 25 },
    anchors: [{ x: 10, z: -14 }, { x: 52, z: 17 }, { x: -32, z: 17 }, { x: 52, z: -41 }, { x: -32, z: -41 }] },   // median 11.7m
  { id: 'bussorah-mall', name: 'Bussorah mall', cover: 'broken', lootWeight: 1.5, tierBias: -1, botWeight: 1.5,
    bounds: { minX: -40, maxX: 60, minZ: -118, maxZ: -45 },
    anchors: [{ x: 10, z: -75 }, { x: 52, z: -109 }, { x: -32, z: -109 }, { x: 52, z: -53 }, { x: -32, z: -53 }] },   // median 10.0m
  { id: 'haji-lane', name: 'Haji Lane', cover: 'broken', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: -148, maxX: -40, minZ: -120, maxZ: -30 },
    anchors: [{ x: -90, z: -75 }, { x: -140, z: -111 }, { x: -140, z: -39 }, { x: -48, z: -111 }, { x: -48, z: -39 }] },   // median 10.8m
  { id: 'arab-street', name: 'Arab Street textiles', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 60, maxX: 168, minZ: -140, maxZ: -45 },
    anchors: [{ x: 110, z: -92 }, { x: 160, z: -131 }, { x: 160, z: -53 }, { x: 68, z: -131 }, { x: 68, z: -53 }] },   // median 21.5m
  { id: 'heritage-lawn', name: 'Heritage Centre lawn', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -150, maxX: -45, minZ: -45, maxZ: 25 },
    anchors: [{ x: -90, z: -20 }, { x: -142, z: 17 }, { x: -142, z: -37 }, { x: -54, z: 17 }, { x: -54, z: -37 }] },   // median 20.0m
  { id: 'bugis-plaza', name: 'Beach Road shops', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 55, maxX: 168, minZ: 5, maxZ: 90 },
    anchors: [{ x: 110, z: 50 }, { x: 160, z: 13 }, { x: 64, z: 13 }, { x: 160, z: 81 }, { x: 64, z: 81 }] },   // median 10.2m
  { id: 'sultan-gate', name: 'Sultan Gate', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 60, maxX: 168, minZ: 70, maxZ: 148 },
    anchors: [{ x: 110, z: 98 }, { x: 160, z: 139 }, { x: 68, z: 139 }, { x: 160, z: 79 }, { x: 68, z: 79 }] },   // median 8.2m
  { id: 'baghdad-street', name: 'Baghdad Street', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -45, maxX: 60, minZ: 68, maxZ: 152 },
    anchors: [{ x: 10, z: 110 }, { x: -36, z: 77 }, { x: -36, z: 143 }, { x: 52, z: 77 }, { x: 52, z: 143 }] },   // median 8.0m
  { id: 'kandahar-park', name: 'Kandahar pocket park', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -142, maxX: -42, minZ: 68, maxZ: 152 },
    anchors: [{ x: -82, z: 110 }, { x: -134, z: 77 }, { x: -134, z: 143 }, { x: -50, z: 77 }, { x: -50, z: 143 }] },   // median 8.0m
  { id: 'rochor-canal', name: 'Beach Road edge', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 140, maxX: 228, minZ: -40, maxZ: 60 },
    anchors: [{ x: 173, z: 12 }, { x: 220, z: -31 }, { x: 220, z: 51 }, { x: 148, z: -31 }, { x: 148, z: 51 }] },   // median 28.6m
  { id: 'jalan-pisang', name: 'Jalan Pisang green', cover: 'open', lootWeight: 1, botWeight: 1,
    bounds: { minX: -228, maxX: -142, minZ: -20, maxZ: 92 },
    anchors: [{ x: -180, z: 30 }, { x: -220, z: 83 }, { x: -150, z: 83 }, { x: -220, z: -11 }, { x: -150, z: -11 }] },   // median 40.0m

];

/**
 * A lake with one causeway. The causeway is deliberately the thinnest
 * sector in the district: little lands there, and what does is worth crossing for.
 */
const JURONG_LAKE_SECTORS: readonly ZoneSector[] = [
  { id: 'pagoda-island', name: 'Cloud Pagoda gardens', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -200, maxX: -90, minZ: 10, maxZ: 95 },
    anchors: [{ x: -142, z: 50 }, { x: -98, z: 18 }, { x: -172, z: 18 }, { x: -112, z: 62 }, { x: -172, z: 62 }] },
  { id: 'causeway', name: 'Lake causeway', cover: 'dense', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: -105, maxX: -35, minZ: -15, maxZ: 55 },
    anchors: [{ x: -70, z: 20 }, { x: -44, z: 26 }, { x: -96, z: 26 }, { x: -54, z: 14 }, { x: -86, z: 14 }] },
  { id: 'lakeside-promenade', name: 'Lakeside promenade', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -60, maxX: 30, minZ: 20, maxZ: 100 },
    anchors: [{ x: -18, z: 60 }, { x: 22, z: 28 }, { x: 22, z: 92 }, { x: -28, z: 28 }, { x: -28, z: 92 }] },
  { id: 'science-centre', name: 'Science Centre plaza', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 115, maxX: 230, minZ: -70, maxZ: 30 },
    anchors: [{ x: 170, z: -20 }, { x: 222, z: 22 }, { x: 222, z: -62 }, { x: 124, z: 22 }, { x: 124, z: -62 }] },
  { id: 'jem-concourse', name: 'JEM concourse', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: 15, maxX: 115, minZ: -60, maxZ: 35 },
    anchors: [{ x: 65, z: -10 }, { x: 24, z: 22 }, { x: 106, z: 22 }, { x: 24, z: -22 }, { x: 106, z: -22 }] },
  { id: 'westgate', name: 'Westgate atrium', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 15, maxX: 115, minZ: 70, maxZ: 135 },
    anchors: [{ x: 65, z: 110 }, { x: 24, z: 126 }, { x: 106, z: 126 }, { x: 36, z: 98 }, { x: 94, z: 98 }] },
  { id: 'imm', name: 'IMM service court', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 120, maxX: 235, minZ: 90, maxZ: 180 },
    anchors: [{ x: 172, z: 135 }, { x: 226, z: 98 }, { x: 226, z: 172 }, { x: 128, z: 98 }, { x: 128, z: 172 }] },
  { id: 'lakeside-station', name: 'Jurong East station forecourt', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 20, maxX: 110, minZ: 140, maxZ: 200 },
    anchors: [{ x: 65, z: 158 }, { x: 28, z: 192 }, { x: 102, z: 192 }, { x: 28, z: 148 }, { x: 102, z: 148 }] },
  { id: 'bus-interchange', name: 'Bus interchange', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 120, maxX: 190, minZ: 155, maxZ: 225 },
    anchors: [{ x: 182, z: 216 }, { x: 128, z: 164 }, { x: 180, z: 164 }, { x: 128, z: 216 }, { x: 154, z: 190 }] },
  { id: 'japanese-garden', name: 'Japanese garden', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -265, maxX: -145, minZ: 100, maxZ: 205 },
    anchors: [{ x: -200, z: 152 }, { x: -256, z: 108 }, { x: -256, z: 196 }, { x: -154, z: 196 }, { x: -154, z: 122 }] },
  { id: 'jurong-green', name: 'Lone Tree grassland', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -130, maxX: 10, minZ: -220, maxZ: -105 },
    anchors: [{ x: -60, z: -160 }, { x: 2, z: -212 }, { x: -122, z: -212 }, { x: 2, z: -114 }, { x: -122, z: -114 }] },
];

/**
 * Terminal halls inside, apron outside. The viaduct and runway threshold
 * are the exposed ends; the vortex and hotel court are where the cover is.
 */
const CHANGI_SECTORS: readonly ZoneSector[] = [
  { id: 'vortex', name: 'Vortex basin walk', cover: 'dense', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -110, maxX: 0, minZ: -30, maxZ: 60 },
    anchors: [{ x: -55, z: 14 }, { x: -8, z: 51 }, { x: -102, z: 51 }, { x: -8, z: -21 }, { x: -102, z: -21 }] },
  { id: 'canopy-park', name: 'Canopy park', cover: 'dense', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -45, maxX: 55, minZ: -80, maxZ: 15 },
    anchors: [{ x: 4, z: -30 }, { x: 46, z: -71 }, { x: -36, z: -71 }, { x: 46, z: 7 }, { x: -36, z: 7 }] },
  { id: 'terminal-kerb', name: 'Terminal kerbside', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -140, maxX: -10, minZ: -215, maxZ: -120 },
    anchors: [{ x: -75, z: -166 }, { x: -18, z: -207 }, { x: -132, z: -207 }, { x: -18, z: -129 }, { x: -132, z: -129 }] },
  { id: 'departure-viaduct', name: 'Departure viaduct', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 35, maxX: 155, minZ: -205, maxZ: -100 },
    anchors: [{ x: 93, z: -150 }, { x: 146, z: -109 }, { x: 44, z: -109 }, { x: 146, z: -167 }, { x: 68, z: -197 }] },
  { id: 'control-tower', name: 'Control tower apron', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: 135, maxX: 250, minZ: -70, maxZ: 30 },
    anchors: [{ x: 190, z: -20 }, { x: 242, z: 21 }, { x: 242, z: -61 }, { x: 144, z: -61 }, { x: 144, z: 7 }] },
  { id: 'aircraft-stand', name: 'Aircraft stand', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: 0, maxX: 125, minZ: 125, maxZ: 220 },
    anchors: [{ x: 60, z: 170 }, { x: 8, z: 211 }, { x: 110, z: 211 }, { x: 8, z: 133 }, { x: 110, z: 133 }] },
  { id: 'runway-threshold', name: 'Runway threshold', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 0.5,
    bounds: { minX: -265, maxX: -140, minZ: 125, maxZ: 225 },
    anchors: [{ x: -200, z: 175 }, { x: -256, z: 133 }, { x: -256, z: 217 }, { x: -148, z: 133 }, { x: -148, z: 217 }] },
  { id: 'airport-station', name: 'Airport station', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -275, maxX: -155, minZ: -60, maxZ: 40 },
    anchors: [{ x: -215, z: -10 }, { x: -164, z: 31 }, { x: -164, z: -51 }, { x: -266, z: 31 }, { x: -266, z: -51 }] },
  { id: 'hotel-court', name: 'Hotel court', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 70, maxX: 175, minZ: -15, maxZ: 80 },
    anchors: [{ x: 120, z: 30 }, { x: 166, z: 71 }, { x: 166, z: -7 }, { x: 78, z: 71 }, { x: 78, z: -7 }] },
  { id: 'coastal-palms', name: 'Coastal palms', cover: 'open', lootWeight: 1, botWeight: 1,
    bounds: { minX: 180, maxX: 278, minZ: 70, maxZ: 175 },
    anchors: [{ x: 234, z: 120 }, { x: 188, z: 167 }, { x: 188, z: 79 }, { x: 270, z: 167 }, { x: 270, z: 79 }] },
  { id: 'arrival-garden', name: 'Arrival garden', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -278, maxX: -180, minZ: 55, maxZ: 150 },
    anchors: [{ x: -232, z: 100 }, { x: -188, z: 141 }, { x: -188, z: 63 }, { x: -270, z: 141 }, { x: -270, z: 63 }] },
];

/**
 * A thin eating strip with reservoir forest behind. The causeway is the
 * committed crossing and the forest trail is the ground worth holding.
 */
const UPPER_THOMSON_SECTORS: readonly ZoneSector[] = [
  { id: 'shop-row', name: 'Thomson shop row', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -100, maxX: 0, minZ: -50, maxZ: 25 },
    anchors: [{ x: -50, z: -14 }, { x: -92, z: -46 }, { x: -8, z: 16 }, { x: -92, z: 16 }, { x: -8, z: -42 }] },
  { id: 'coffee-corner', name: 'Coffee shop corner', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -140, maxX: -50, minZ: -85, maxZ: -15 },
    foodAnchors: [{ x: -108, z: -61 }, { x: -96, z: -61 }, { x: -84, z: -61 }],
    anchors: [{ x: -92, z: -46 }, { x: -132, z: -76 }, { x: -58, z: -76 }, { x: -132, z: -26 }, { x: -58, z: -42 }] },
  { id: 'thomson-plaza', name: 'Thomson Plaza forecourt', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 35, maxX: 135, minZ: -55, maxZ: 30 },
    anchors: [{ x: 85, z: -14 }, { x: 44, z: 22 }, { x: 126, z: 22 }, { x: 44, z: -20 }, { x: 126, z: -20 }] },
  { id: 'reservoir-causeway', name: 'Reservoir causeway', cover: 'open', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: -240, maxX: -150, minZ: -30, maxZ: 45 },
    anchors: [{ x: -190, z: 5 }, { x: -232, z: 36 }, { x: -232, z: -22 }, { x: -158, z: 34 }, { x: -158, z: -22 }] },
  { id: 'boardwalk-jetty', name: 'Boardwalk jetty', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -210, maxX: -115, minZ: -105, maxZ: -30 },
    anchors: [{ x: -162, z: -64 }, { x: -146, z: -40 }, { x: -124, z: -96 }, { x: -160, z: -96 }, { x: -124, z: -64 }] },
  { id: 'forest-trail', name: 'Forest trailhead', cover: 'broken', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -180, maxX: -90, minZ: 0, maxZ: 85 },
    anchors: [{ x: -128, z: 40 }, { x: -172, z: 8 }, { x: -164, z: 76 }, { x: -98, z: 76 }, { x: -98, z: 8 }] },
  { id: 'thomson-station', name: 'Upper Thomson station', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 40, maxX: 135, minZ: 35, maxZ: 110 },
    foodAnchors: [{ x: 94, z: 66 }, { x: 110, z: 62 }, { x: 126, z: 66 }],
    anchors: [{ x: 85, z: 36 }, { x: 48, z: 102 }, { x: 126, z: 66 }, { x: 48, z: 58 }, { x: 94, z: 66 }] },
  { id: 'landed-terrace', name: 'Landed terrace', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -100, maxX: 0, minZ: 30, maxZ: 100 },
    anchors: [{ x: -8, z: 92 }, { x: -92, z: 52 }, { x: -22, z: 38 }, { x: -58, z: 88 }, { x: -56, z: 52 }] },
  { id: 'bus-bay', name: 'Thomson bus bay', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 105, maxX: 200, minZ: -80, maxZ: -5 },
    anchors: [{ x: 150, z: -40 }, { x: 192, z: -72 }, { x: 192, z: -14 }, { x: 114, z: -14 }, { x: 132, z: -72 }] },
  { id: 'springleaf', name: 'Thomson neighbourhood green', cover: 'open', lootWeight: 1, botWeight: 1,
    bounds: { minX: 145, maxX: 250, minZ: 20, maxZ: 110 },
    anchors: [{ x: 192, z: 60 }, { x: 242, z: 102 }, { x: 242, z: 28 }, { x: 154, z: 102 }, { x: 154, z: 28 }] },
];

/**
 * A town built around water. The arch bridge is the watched crossing, the
 * promenades are exposed, and the precincts inland are where the cover is.
 */
const PUNGGOL_SECTORS: readonly ZoneSector[] = [
  { id: 'waterway-promenade', name: 'Waterway promenade', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1.5,
    bounds: { minX: -35, maxX: 75, minZ: -80, maxZ: -30 },
    anchors: [{ x: 20, z: -60 }, { x: 66, z: -38 }, { x: -26, z: -38 }, { x: 54, z: -72 }, { x: -14, z: -72 }] },
  { id: 'arch-bridge', name: 'Arch bridge', cover: 'dense', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: -25, maxX: 65, minZ: -118, maxZ: -82 },
    anchors: [{ x: 20, z: -90 }, { x: 56, z: -110 }, { x: -16, z: -110 }, { x: 32, z: -110 }, { x: 8, z: -110 }] },
  { id: 'waterway-point', name: 'Waterway Point approach', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -35, maxX: 75, minZ: -5, maxZ: 80 },
    anchors: [{ x: 20, z: 36 }, { x: 66, z: 72 }, { x: -26, z: 72 }, { x: 66, z: 4 }, { x: -26, z: 4 }] },
  { id: 'precinct-court', name: 'Precinct court', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -155, maxX: -45, minZ: -10, maxZ: 75 },
    anchors: [{ x: -100, z: 30 }, { x: -54, z: 66 }, { x: -146, z: 66 }, { x: -54, z: -2 }, { x: -146, z: -2 }] },
  { id: 'lrt-line', name: 'Punggol LRT line', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 165, maxX: 265, minZ: 25, maxZ: 125 },
    anchors: [{ x: 215, z: 75 }, { x: 174, z: 34 }, { x: 256, z: 34 }, { x: 174, z: 116 }, { x: 256, z: 116 }] },
  { id: 'punggol-point', name: 'Punggol Point jetty', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: 160, maxX: 265, minZ: 130, maxZ: 225 },
    anchors: [{ x: 215, z: 180 }, { x: 168, z: 138 }, { x: 168, z: 216 }, { x: 256, z: 138 }, { x: 256, z: 216 }] },
  { id: 'waterfront-lawn', name: 'Waterfront lawn', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 90, maxX: 195, minZ: -65, maxZ: 25 },
    anchors: [{ x: 139, z: -20 }, { x: 186, z: -56 }, { x: 186, z: 16 }, { x: 98, z: -56 }, { x: 98, z: 16 }] },
  { id: 'community-club', name: 'Community club', cover: 'dense', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -155, maxX: -45, minZ: -170, maxZ: -80 },
    anchors: [{ x: -100, z: -122 }, { x: -54, z: -162 }, { x: -146, z: -162 }, { x: -56, z: -108 }, { x: -144, z: -108 }] },
  { id: 'reed-bank', name: 'Reed bank', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -160, maxX: -50, minZ: -95, maxZ: -30 },
    anchors: [{ x: -100, z: -60 }, { x: -152, z: -86 }, { x: -144, z: -38 }, { x: -58, z: -38 }, { x: -66, z: -72 }] },
  { id: 'park-connector', name: 'Park connector', cover: 'open', lootWeight: 1, botWeight: 1,
    bounds: { minX: -265, maxX: -160, minZ: -10, maxZ: 95 },
    anchors: [{ x: -212, z: 40 }, { x: -168, z: 86 }, { x: -256, z: 86 }, { x: -168, z: -2 }, { x: -256, z: -2 }] },
];

/**
 * One way on and one way off. The battery holds the high ground, the
 * beach and lagoon are open, and the boardwalk landing is the only entrance.
 */
const SENTOSA_SECTORS: readonly ZoneSector[] = [
  { id: 'boardwalk-landing', name: 'Boardwalk landing', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 55, maxX: 160, minZ: -200, maxZ: -105 },
    anchors: [{ x: 108, z: -150 }, { x: 60, z: -130 }, { x: 152, z: -188 }, { x: 64, z: -188 }, { x: 152, z: -114 }] },
  { id: 'monorail', name: 'Sentosa monorail', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 5, maxX: 105, minZ: -175, maxZ: -95 },
    anchors: [{ x: 60, z: -130 }, { x: 14, z: -166 }, { x: 14, z: -104 }, { x: 96, z: -166 }, { x: 96, z: -104 }] },
  { id: 'fort-ramparts', name: 'Fort ramparts', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: -145, maxX: -35, minZ: -35, maxZ: 50 },
    anchors: [{ x: -90, z: 8 }, { x: -90, z: 32 }, { x: -44, z: -26 }, { x: -136, z: -26 }, { x: -44, z: 22 }] },
  { id: 'resort-forecourt', name: 'Resort forecourt', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -20, maxX: 85, minZ: -30, maxZ: 50 },
    anchors: [{ x: 30, z: 8 }, { x: 30, z: 32 }, { x: 76, z: -22 }, { x: -12, z: -22 }, { x: 76, z: 42 }] },
  { id: 'hotel-podium', name: 'Hotel podium', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 110, maxX: 220, minZ: -35, maxZ: 50 },
    anchors: [{ x: 165, z: 8 }, { x: 118, z: -26 }, { x: 118, z: 42 }, { x: 212, z: -26 }, { x: 212, z: 42 }] },
  { id: 'lagoon-shore', name: 'Palawan bridge and shore', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -150, maxX: -45, minZ: 55, maxZ: 130 },
    anchors: [{ x: -54, z: 122 }, { x: -142, z: 64 }, { x: -118, z: 122 }, { x: -56, z: 64 }, { x: -90, z: 75 }] },
  { id: 'beach-club', name: 'Beach club deck', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 0, maxX: 90, minZ: 55, maxZ: 130 },
    anchors: [{ x: 82, z: 122 }, { x: 8, z: 68 }, { x: 68, z: 64 }, { x: 24, z: 122 }, { x: 52, z: 98 }] },
  { id: 'palm-grove', name: 'Fort Siloso Skywalk approach', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -245, maxX: -150, minZ: -70, maxZ: 70 },
    anchors: [{ x: -187, z: 8 }, { x: -187, z: -20 }, { x: -236, z: 62 }, { x: -236, z: -62 }, { x: -158, z: 62 }] },
  { id: 'siloso-beach', name: 'Siloso beach', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -70, maxX: 70, minZ: 150, maxZ: 205 },
    anchors: [{ x: 0, z: 192 }, { x: 62, z: 158 }, { x: -62, z: 158 }, { x: 42, z: 194 }, { x: -42, z: 194 }] },
  { id: 'island-spine', name: 'Island spine', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -90, maxX: -10, minZ: 75, maxZ: 150 },
    anchors: [{ x: -30, z: 100 }, { x: -82, z: 142 }, { x: -18, z: 142 }, { x: -74, z: 100 }, { x: -50, z: 128 }] },
];

/**
 * The lorongs are the district: five narrow sectors in a row across the
 * middle, with the canal crossing to the south and the bend out west.
 */
const GEYLANG_SECTORS: readonly ZoneSector[] = [
  { id: 'geylang-road', name: 'Geylang Road', cover: 'open', lootWeight: 2, tierBias: -1, botWeight: 2,
    bounds: { minX: -60, maxX: 40, minZ: -40, maxZ: 5 },
    anchors: [{ x: -14, z: -10 }, { x: 32, z: -32 }, { x: -52, z: -20 }, { x: 18, z: -4 }, { x: -28, z: -32 }] },
  { id: 'back-lanes', name: 'Lorong back lanes', cover: 'broken', lootWeight: 2.5, tierBias: 1, botWeight: 1.5,
    bounds: { minX: -60, maxX: 60, minZ: -80, maxZ: -25 },
    anchors: [{ x: 0, z: -45 }, { x: -52, z: -72 }, { x: 52, z: -72 }, { x: -40, z: -34 }, { x: 40, z: -34 }] },
  { id: 'serai-market', name: 'Geylang Serai market', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -160, maxX: -80, minZ: -20, maxZ: 55 },
    foodAnchors: [{ x: -128, z: 20 }, { x: -112, z: 20 }, { x: -96, z: 20 }],
    anchors: [{ x: -112, z: 14 }, { x: -152, z: 46 }, { x: -152, z: -12 }, { x: -88, z: 46 }, { x: -88, z: -12 }] },
  { id: 'masjid', name: 'Masjid forecourt', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -85, maxX: -25, minZ: -20, maxZ: 55 },
    anchors: [{ x: -56, z: 14 }, { x: -34, z: 46 }, { x: -76, z: 46 }, { x: -34, z: -12 }, { x: -76, z: -12 }] },
  { id: 'kopitiam', name: 'Kopitiam corner', cover: 'broken', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: -25, maxX: 30, minZ: -20, maxZ: 55 },
    foodAnchors: [{ x: -14, z: 35 }, { x: -3, z: 35 }, { x: 14, z: 35 }],
    anchors: [{ x: -14, z: -10 }, { x: 0, z: 14 }, { x: 22, z: 46 }, { x: -16, z: 46 }, { x: 22, z: -12 }] },
  { id: 'temple-court', name: 'Temple courtyard', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 28, maxX: 90, minZ: -20, maxZ: 55 },
    anchors: [{ x: 56, z: 14 }, { x: 82, z: 46 }, { x: 36, z: 46 }, { x: 82, z: -12 }, { x: 36, z: -12 }] },
  { id: 'aljunied', name: 'Aljunied blocks', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 85, maxX: 160, minZ: -20, maxZ: 55 },
    anchors: [{ x: 112, z: 14 }, { x: 152, z: 46 }, { x: 152, z: -12 }, { x: 94, z: 46 }, { x: 94, z: -12 }] },
  { id: 'guillemard', name: 'Guillemard bend', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -250, maxX: -155, minZ: -30, maxZ: 60 },
    anchors: [{ x: -185, z: 14 }, { x: -242, z: 52 }, { x: -242, z: -22 }, { x: -164, z: 52 }, { x: -164, z: -22 }] },
  { id: 'canal-bridge', name: 'Canal bridge', cover: 'dense', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: -55, maxX: 20, minZ: -175, maxZ: -110 },
    anchors: [{ x: -28, z: -136 }, { x: 12, z: -166 }, { x: 12, z: -118 }, { x: -38, z: -166 }, { x: -12, z: -156 }] },
  { id: 'quay-stalls', name: 'Quay stalls', cover: 'dense', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -120, maxX: -60, minZ: -155, maxZ: -90 },
    foodAnchors: [{ x: -94, z: -146 }, { x: -74, z: -126 }, { x: -100, z: -122 }],
    anchors: [{ x: -68, z: -98 }, { x: -94, z: -146 }, { x: -112, z: -102 }, { x: -74, z: -126 }, { x: -100, z: -122 }] },
  { id: 'paya-lebar-park', name: 'Paya Lebar park', cover: 'open', lootWeight: 1, botWeight: 1,
    bounds: { minX: 130, maxX: 250, minZ: -110, maxZ: -10 },
    anchors: [{ x: 185, z: -60 }, { x: 242, z: -18 }, { x: 242, z: -102 }, { x: 138, z: -18 }, { x: 138, z: -102 }] },
];

/**
 * Industrial hardstanding. Long aisles and almost no soft cover, so the
 * dock, stacks and laydown yards are the only places with anything to stand behind.
 */
const TUAS_SECTORS: readonly ZoneSector[] = [
  { id: 'tank-farm', name: 'Tank farm', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -100, maxX: 10, minZ: -25, maxZ: 65 },
    anchors: [{ x: -45, z: 18 }, { x: -96, z: 60 }, { x: 2, z: 56 }, { x: 2, z: -16 }, { x: -92, z: -6 }] },
  { id: 'dry-dock', name: 'Dry dock', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: -240, maxX: -125, minZ: -30, maxZ: 70 },
    anchors: [{ x: -182, z: 18 }, { x: -232, z: 62 }, { x: -134, z: 62 }, { x: -232, z: -22 }, { x: -134, z: -22 }] },
  { id: 'container-stacks', name: 'Container stacks', cover: 'open', lootWeight: 2.5, tierBias: 1, botWeight: 2,
    bounds: { minX: 85, maxX: 195, minZ: -30, maxZ: 70 },
    anchors: [{ x: 137, z: 18 }, { x: 186, z: 62 }, { x: 186, z: -22 }, { x: 94, z: 62 }, { x: 94, z: -22 }] },
  { id: 'flare-stack', name: 'Flare stack', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -145, maxX: -55, minZ: 70, maxZ: 140 },
    anchors: [{ x: -64, z: 132 }, { x: -136, z: 78 }, { x: -80, z: 78 }, { x: -120, z: 132 }, { x: -92, z: 112 }] },
  { id: 'pipe-rack', name: 'Pipe rack crossing', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -105, maxX: 15, minZ: 100, maxZ: 185 },
    anchors: [{ x: -45, z: 140 }, { x: -96, z: 176 }, { x: 6, z: 176 }, { x: -96, z: 108 }, { x: 6, z: 108 }] },
  { id: 'laydown-yard', name: 'Laydown yard', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 85, maxX: 195, minZ: 75, maxZ: 165 },
    anchors: [{ x: 137, z: 115 }, { x: 186, z: 156 }, { x: 94, z: 156 }, { x: 186, z: 84 }, { x: 94, z: 84 }] },
  { id: 'coast-road', name: 'Coast road', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -278, maxX: -190, minZ: -95, maxZ: 15 },
    anchors: [{ x: -235, z: -40 }, { x: -212, z: 6 }, { x: -212, z: -86 }, { x: -246, z: -6 }, { x: -246, z: -74 }] },
  { id: 'benoi-truck-park', name: 'Benoi truck park', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -60, maxX: 60, minZ: -210, maxZ: -125 },
    anchors: [{ x: 0, z: -168 }, { x: -52, z: -134 }, { x: -52, z: -202 }, { x: 52, z: -134 }, { x: 52, z: -202 }] },
  { id: 'workers-quarters', name: 'Industrial workshop apron', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 80, maxX: 195, minZ: -212, maxZ: -130 },
    anchors: [{ x: 137, z: -180 }, { x: 88, z: -138 }, { x: 186, z: -138 }, { x: 88, z: -204 }, { x: 186, z: -204 }] },
  { id: 'tuas-link', name: 'Tuas Link station approach', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 190, maxX: 256, minZ: 0, maxZ: 95 },
    anchors: [{ x: 200, z: 18 }, { x: 235, z: 44 }, { x: 198, z: 86 }, { x: 248, z: 86 }, { x: 248, z: 8 }] },
];

/**
 * The causeway is a single long approach with no cover, and it is weighted
 * accordingly; the precincts behind it carry the supplies.
 */
const WOODLANDS_SECTORS: readonly ZoneSector[] = [
  { id: 'causeway', name: 'Causeway checkpoint', cover: 'dense', lootWeight: 0.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -30, maxX: 30, minZ: -120, maxZ: -62 },
    anchors: [{ x: 0, z: -110 }, { x: 0, z: -90 }, { x: 0, z: -70 }, { x: 14, z: -110 }, { x: 14, z: -80 }] },
  { id: 'waterfront-promenade', name: 'Waterfront promenade', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -110, maxX: -32, minZ: -135, maxZ: -65 },
    anchors: [{ x: -70, z: -112 }, { x: -100, z: -122 }, { x: -40, z: -122 }, { x: -90, z: -74 }, { x: -40, z: -74 }] },
  { id: 'woodlands-jetty', name: 'Woodlands jetty', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: 60, maxX: 180, minZ: -215, maxZ: -130 },
    anchors: [{ x: 120, z: -170 }, { x: 68, z: -206 }, { x: 172, z: -206 }, { x: 68, z: -138 }, { x: 172, z: -138 }] },
  { id: 'rail-embankment', name: 'Rail embankment', cover: 'open', lootWeight: 1, botWeight: 1,
    bounds: { minX: -90, maxX: -30, minZ: -180, maxZ: -105 },
    anchors: [{ x: -38, z: -114 }, { x: -82, z: -142 }, { x: -70, z: -114 }, { x: -50, z: -142 }, { x: -54, z: -124 }] },
  { id: 'causeway-point', name: 'Causeway Point forecourt', cover: 'broken', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -100, maxX: 10, minZ: -10, maxZ: 75 },
    anchors: [{ x: -45, z: 32 }, { x: -25, z: 52 }, { x: -92, z: 66 }, { x: -84, z: 28 }, { x: 2, z: 28 }] },
  { id: 'civic-square', name: 'Civic square', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -70, maxX: 25, minZ: 78, maxZ: 150 },
    anchors: [{ x: 16, z: 142 }, { x: -62, z: 110 }, { x: -6, z: 86 }, { x: -30, z: 142 }, { x: -8, z: 118 }] },
  { id: 'marsiling', name: 'Marsiling precinct', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -240, maxX: -125, minZ: -35, maxZ: 60 },
    anchors: [{ x: -182, z: 12 }, { x: -232, z: 52 }, { x: -232, z: -26 }, { x: -134, z: 52 }, { x: -134, z: -26 }] },
  { id: 'admiralty-woods', name: 'Admiralty woods', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -245, maxX: -120, minZ: -145, maxZ: -40 },
    anchors: [{ x: -182, z: -90 }, { x: -128, z: -136 }, { x: -236, z: -136 }, { x: -128, z: -48 }, { x: -236, z: -48 }] },
  { id: 'woodlands-station', name: 'Woodlands station', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 150, maxX: 255, minZ: -10, maxZ: 80 },
    anchors: [{ x: 200, z: 34 }, { x: 246, z: 72 }, { x: 246, z: -2 }, { x: 158, z: 72 }, { x: 158, z: -2 }] },
  { id: 'interchange', name: 'Woodlands interchange', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 90, maxX: 148, minZ: -10, maxZ: 80 },
    anchors: [{ x: 137, z: 32 }, { x: 98, z: 72 }, { x: 98, z: 6 }, { x: 140, z: 72 }, { x: 132, z: -2 }] },
  { id: 'northpoint-green', name: 'Woodlands town green', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 85, maxX: 195, minZ: 90, maxZ: 168 },
    anchors: [{ x: 137, z: 130 }, { x: 186, z: 98 }, { x: 186, z: 160 }, { x: 94, z: 98 }, { x: 94, z: 160 }] },
];

/**
 * A wide town centre where the round market and the stadium are the hard
 * cover, and the quarry edge is the ground with none.
 */
const TAMPINES_SECTORS: readonly ZoneSector[] = [
  { id: 'round-market', name: 'Round Market', cover: 'open', lootWeight: 2.5, tierBias: 1, botWeight: 2,
    bounds: { minX: -130, maxX: -30, minZ: -30, maxZ: 50 },
    foodAnchors: [{ x: -49, z: 8 }, { x: -111, z: 8 }, { x: -80, z: 39 }],
    anchors: [{ x: -80, z: 8 }, { x: -52, z: 50 }, { x: -122, z: 42 }, { x: -38, z: -22 }, { x: -122, z: -22 }] },
  { id: 'hub-stadium', name: 'Our Tampines Hub forecourt', cover: 'open', lootWeight: 2.5, tierBias: 1, botWeight: 2,
    bounds: { minX: 5, maxX: 105, minZ: 1, maxZ: 50 },
    anchors: [{ x: 55, z: 8 }, { x: 40, z: 44 }, { x: 96, z: 42 }, { x: 14, z: 2 }, { x: 96, z: 2 }] },
  { id: 'mall-concourse', name: 'Mall concourse', cover: 'dense', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 0, maxX: 90, minZ: 55, maxZ: 100 },
    anchors: [{ x: 76, z: 92 }, { x: 30, z: 64 }, { x: 36, z: 92 }, { x: 72, z: 64 }, { x: 32, z: 78 }] },
  { id: 'bus-interchange', name: 'Bus interchange', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: -5, maxX: 90, minZ: 105, maxZ: 160 },
    anchors: [{ x: 40, z: 105 }, { x: 82, z: 152 }, { x: 4, z: 152 }, { x: 42, z: 144 }, { x: 6, z: 116 }] },
  { id: 'quarry-pond', name: 'Quarry pond', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 120, maxX: 230, minZ: -15, maxZ: 85 },
    anchors: [{ x: 172, z: 32 }, { x: 172, z: 0 }, { x: 222, z: 76 }, { x: 128, z: 76 }, { x: 222, z: 16 }] },
  { id: 'eco-green', name: 'Tampines housing courts', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -245, maxX: -140, minZ: 0, maxZ: 90 },
    anchors: [{ x: -188, z: 32 }, { x: -188, z: 0 }, { x: -236, z: 82 }, { x: -148, z: 82 }, { x: -236, z: 16 }] },
  { id: 'tampines-north', name: 'Tampines North precinct', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -245, maxX: -140, minZ: -90, maxZ: -10 },
    anchors: [{ x: -148, z: -18 }, { x: -236, z: -82 }, { x: -168, z: -82 }, { x: -228, z: -18 }, { x: -188, z: -40 }] },
  { id: 'simei', name: 'Simei precinct', cover: 'broken', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 125, maxX: 230, minZ: -90, maxZ: -10 },
    anchors: [{ x: 222, z: -18 }, { x: 134, z: -82 }, { x: 202, z: -82 }, { x: 162, z: -28 }, { x: 196, z: -44 }] },
  { id: 'cycle-path', name: 'Cycle path', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -100, maxX: -10, minZ: 55, maxZ: 100 },
    anchors: [{ x: -18, z: 92 }, { x: -92, z: 64 }, { x: -50, z: 64 }, { x: -70, z: 92 }, { x: -20, z: 64 }] },
  { id: 'town-green', name: 'Town green', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -140, maxX: -20, minZ: 110, maxZ: 200 },
    anchors: [{ x: -80, z: 158 }, { x: -28, z: 118 }, { x: -132, z: 118 }, { x: -28, z: 192 }, { x: -132, z: 192 }] },
  { id: 'tampines-station', name: 'Tampines station', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 95, maxX: 170, minZ: 5, maxZ: 90 },
    anchors: [{ x: 110, z: 44 }, { x: 162, z: 14 }, { x: 134, z: 82 }, { x: 146, z: 46 }, { x: 126, z: 14 }] },
];

/**
 * Void decks and balcony runs throughout, which makes the town park and
 * the flyover the two open crossings worth watching.
 */
const TOA_PAYOH_SECTORS: readonly ZoneSector[] = [
  { id: 'dragon-playground', name: 'Dragon playground', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 0, maxX: 100, minZ: -75, maxZ: 0 },
    anchors: [{ x: 50, z: -36 }, { x: 92, z: -66 }, { x: 8, z: -66 }, { x: 92, z: -8 }, { x: 8, z: -8 }] },
  { id: 'town-park', name: 'Town park', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -240, maxX: -120, minZ: -45, maxZ: 45 },
    anchors: [{ x: -180, z: -4 }, { x: -128, z: 36 }, { x: -232, z: 36 }, { x: -128, z: -36 }, { x: -232, z: -36 }] },
  { id: 'park-pond', name: 'Park pond', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -190, maxX: -90, minZ: -110, maxZ: -50 },
    anchors: [{ x: -140, z: -66 }, { x: -98, z: -102 }, { x: -182, z: -102 }, { x: -98, z: -58 }, { x: -136, z: -102 }] },
  { id: 'y-block', name: 'Y-block courtyard', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -120, maxX: -20, minZ: -15, maxZ: 65 },
    anchors: [{ x: -70, z: 24 }, { x: -28, z: 56 }, { x: -112, z: 56 }, { x: -28, z: -6 }, { x: -112, z: -6 }] },
  { id: 'town-hub', name: 'Town hub plaza', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: 5, maxX: 100, minZ: -10, maxZ: 70 },
    anchors: [{ x: 50, z: 24 }, { x: 92, z: -2 }, { x: 14, z: -2 }, { x: 84, z: 32 }, { x: 16, z: 32 }] },
  { id: 'bus-berths', name: 'Bus berths', cover: 'broken', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 0, maxX: 100, minZ: 75, maxZ: 140 },
    anchors: [{ x: 50, z: 100 }, { x: 50, z: 132 }, { x: 92, z: 116 }, { x: 8, z: 116 }, { x: 78, z: 92 }] },
  { id: 'lorong-hawker', name: 'Lorong hawker centre', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 125, maxX: 225, minZ: -60, maxZ: 15 },
    foodAnchors: [{ x: 155, z: -26 }, { x: 170, z: -26 }, { x: 185, z: -26 }],
    anchors: [{ x: 170, z: -16 }, { x: 216, z: -52 }, { x: 216, z: 6 }, { x: 134, z: -52 }, { x: 134, z: 6 }] },
  { id: 'braddell-precinct', name: 'Braddell precinct', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 130, maxX: 225, minZ: 25, maxZ: 105 },
    anchors: [{ x: 216, z: 96 }, { x: 138, z: 34 }, { x: 202, z: 34 }, { x: 152, z: 96 }, { x: 170, z: 60 }] },
  { id: 'toa-payoh-station', name: 'Toa Payoh station', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 85, maxX: 150, minZ: -10, maxZ: 70 },
    anchors: [{ x: 110, z: 24 }, { x: 142, z: 62 }, { x: 142, z: -2 }, { x: 96, z: 62 }, { x: 142, z: 30 }] },
  { id: 'lorong-8', name: 'Lorong 8 blocks', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 0, maxX: 105, minZ: 100, maxZ: 180 },
    anchors: [{ x: 50, z: 100 }, { x: 50, z: 132 }, { x: 96, z: 172 }, { x: 8, z: 172 }, { x: 96, z: 116 }] },
  { id: 'braddell-flyover', name: 'Northern approach', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -70, maxX: 50, minZ: -195, maxZ: -110 },
    anchors: [{ x: -10, z: -150 }, { x: 42, z: -186 }, { x: -62, z: -186 }, { x: 42, z: -118 }, { x: -62, z: -118 }] },
];

/**
 * The ridge overlooks everything and is weighted for it; the rail corridor
 * is a long straight run with nowhere to break, and is weighted for that.
 */
const BUKIT_TIMAH_SECTORS: readonly ZoneSector[] = [
  { id: 'rail-corridor', name: 'Rail corridor', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 25, maxX: 95, minZ: 0, maxZ: 85 },
    anchors: [{ x: 60, z: 40 }, { x: 86, z: 76 }, { x: 34, z: 76 }, { x: 86, z: 8 }, { x: 34, z: 8 }] },
  { id: 'summit', name: 'Bukit Timah hill foot', cover: 'open', lootWeight: 2, tierBias: 1, botWeight: 1.5,
    bounds: { minX: -180, maxX: -80, minZ: -70, maxZ: 25 },
    anchors: [{ x: -130, z: -25 }, { x: -88, z: 16 }, { x: -88, z: -62 }, { x: -138, z: 16 }, { x: -92, z: -22 }] },
  { id: 'nature-reserve', name: 'Nature reserve trail', cover: 'open', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: -245, maxX: -135, minZ: -145, maxZ: -50 },
    anchors: [{ x: -187, z: -96 }, { x: -236, z: -136 }, { x: -236, z: -58 }, { x: -144, z: -136 }, { x: -144, z: -72 }] },
  { id: 'beauty-world', name: 'Beauty World market', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -105, maxX: -10, minZ: -15, maxZ: 45 },
    foodAnchors: [{ x: -75, z: 2 }, { x: -55, z: 2 }, { x: -35, z: 2 }],
    anchors: [{ x: -55, z: 28 }, { x: -96, z: -6 }, { x: -18, z: -6 }, { x: -96, z: 36 }, { x: -18, z: 36 }] },
  { id: 'bungalows', name: 'Black-and-white bungalows', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -100, maxX: -5, minZ: 48, maxZ: 110 },
    anchors: [{ x: -52, z: 60 }, { x: -92, z: 102 }, { x: -14, z: 102 }, { x: -92, z: 56 }, { x: -14, z: 56 }] },
  { id: 'canal-bridge', name: 'Canal bridge', cover: 'broken', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 110, maxX: 180, minZ: -85, maxZ: -10 },
    anchors: [{ x: 130, z: -44 }, { x: 172, z: -76 }, { x: 118, z: -76 }, { x: 118, z: -18 }, { x: 146, z: -66 }] },
  { id: 'canal-walk', name: 'Canal walk', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 35, maxX: 105, minZ: -105, maxZ: -35 },
    anchors: [{ x: 80, z: -66 }, { x: 44, z: -96 }, { x: 44, z: -58 }, { x: 96, z: -96 }, { x: 70, z: -92 }] },
  { id: 'dunearn', name: 'Dunearn shophouses', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 135, maxX: 235, minZ: -45, maxZ: 40 },
    anchors: [{ x: 175, z: -6 }, { x: 226, z: 32 }, { x: 226, z: -36 }, { x: 144, z: 32 }, { x: 186, z: 32 }] },
  { id: 'sixth-avenue', name: 'Sixth Avenue green', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 125, maxX: 235, minZ: 90, maxZ: 180 },
    anchors: [{ x: 175, z: 130 }, { x: 226, z: 172 }, { x: 226, z: 98 }, { x: 134, z: 172 }, { x: 134, z: 98 }] },
  { id: 'corridor-north', name: 'Railway station heritage node', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 20, maxX: 100, minZ: 95, maxZ: 185 },
    anchors: [{ x: 60, z: 130 }, { x: 92, z: 176 }, { x: 28, z: 176 }, { x: 92, z: 104 }, { x: 28, z: 104 }] },
  { id: 'upper-bt-shops', name: 'Upper Bukit Timah shops', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -110, maxX: -5, minZ: 95, maxZ: 180 },
    anchors: [{ x: -55, z: 130 }, { x: -102, z: 172 }, { x: -14, z: 172 }, { x: -102, z: 104 }, { x: -14, z: 104 }] },
];

/**
 * A park that is one long open crossing with a river in it, and dense
 * precincts either side. The stepping stones are the thinnest sector in the set.
 */
const BISHAN_SECTORS: readonly ZoneSector[] = [
  { id: 'meander-bend', name: 'Meander bend', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: 25, maxX: 130, minZ: -105, maxZ: -40 },
    anchors: [{ x: 75, z: -74 }, { x: 122, z: -48 }, { x: 34, z: -48 }, { x: 118, z: -96 }, { x: 34, z: -96 }] },
  { id: 'stepping-stones', name: 'Stepping stones', cover: 'open', lootWeight: 0.5, tierBias: 1, botWeight: 0.5,
    bounds: { minX: -30, maxX: 50, minZ: -60, maxZ: -10 },
    anchors: [{ x: 10, z: -35 }, { x: 42, z: -52 }, { x: -22, z: -18 }, { x: -16, z: -52 }, { x: 32, z: -34 }] },
  { id: 'river-park-path', name: 'River park path', cover: 'open', lootWeight: 1, tierBias: -1, botWeight: 1,
    bounds: { minX: -205, maxX: -95, minZ: -105, maxZ: -40 },
    anchors: [{ x: -150, z: -74 }, { x: -196, z: -48 }, { x: -104, z: -96 }, { x: -194, z: -96 }, { x: -114, z: -48 }] },
  { id: 'town-centre', name: 'Junction 8 forecourt', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: 25, maxX: 130, minZ: 0, maxZ: 85 },
    anchors: [{ x: 75, z: 40 }, { x: 122, z: 76 }, { x: 122, z: 8 }, { x: 34, z: 8 }, { x: 34, z: 68 }] },
  { id: 'bus-berths', name: 'Bus berths', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 20, maxX: 130, minZ: 130, maxZ: 205 },
    anchors: [{ x: 75, z: 170 }, { x: 28, z: 138 }, { x: 122, z: 138 }, { x: 28, z: 196 }, { x: 122, z: 196 }] },
  { id: 'bishan-precinct', name: 'Bishan precinct', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -110, maxX: -10, minZ: 0, maxZ: 85 },
    anchors: [{ x: -60, z: 40 }, { x: -102, z: 76 }, { x: -18, z: 76 }, { x: -102, z: 8 }, { x: -18, z: 8 }] },
  { id: 'sin-ming', name: 'Sin Ming slabs', cover: 'open', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -235, maxX: -120, minZ: 0, maxZ: 85 },
    anchors: [{ x: -175, z: 40 }, { x: -190, z: 0 }, { x: -226, z: 76 }, { x: -128, z: 76 }, { x: -128, z: 8 }] },
  { id: 'amk-field', name: 'Bishan station approach', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 180, maxX: 245, minZ: -5, maxZ: 90 },
    anchors: [{ x: 185, z: 40 }, { x: 236, z: 82 }, { x: 236, z: 4 }, { x: 218, z: 82 }, { x: 226, z: 42 }] },
  { id: 'braddell-court', name: 'Braddell court', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -115, maxX: -5, minZ: -150, maxZ: -75 },
    anchors: [{ x: -60, z: -110 }, { x: -14, z: -142 }, { x: -106, z: -142 }, { x: -14, z: -84 }, { x: -106, z: -84 }] },
  { id: 'upper-river', name: 'Upper river', cover: 'open', lootWeight: 1, tierBias: 1, botWeight: 1,
    bounds: { minX: -245, maxX: -140, minZ: -50, maxZ: -5 },
    anchors: [{ x: -148, z: -14 }, { x: -236, z: -42 }, { x: -188, z: -42 }, { x: -202, z: -14 }, { x: -232, z: -14 }] },
  { id: 'bishan-station', name: 'Bishan station', cover: 'open', lootWeight: 1.5, botWeight: 1.5,
    bounds: { minX: 145, maxX: 225, minZ: 5, maxZ: 95 },
    anchors: [{ x: 176, z: 40 }, { x: 166, z: 72 }, { x: 166, z: 14 }, { x: 214, z: 24 }, { x: 214, z: 88 }] },
];

/**
 * A shopping belt: mall forecourts nearly all the way across, which is why
 * this is the best-covered district that has not had a cover pass.
 */
const ORCHARD_SECTORS: readonly ZoneSector[] = [
  { id: 'orchard-crossing', name: 'Orchard crossing', cover: 'open', lootWeight: 1.5, tierBias: -1, botWeight: 2,
    bounds: { minX: -50, maxX: 35, minZ: -10, maxZ: 40 },
    anchors: [{ x: -8, z: 5 }, { x: 0, z: 22 }, { x: -42, z: 31 }, { x: 26, z: -1 }, { x: -40, z: -1 }] },   // median 20.0m
  { id: 'ion-frontage', name: 'ION frontage', cover: 'open', lootWeight: 2.5, botWeight: 2,
    bounds: { minX: -160, maxX: -70, minZ: -55, maxZ: 15 },
    anchors: [{ x: -115, z: -18 }, { x: -78, z: -47 }, { x: -152, z: -47 }, { x: -78, z: 7 }, { x: -152, z: 7 }] },   // median 18.0m
  { id: 'orchard-terraces', name: 'Wisma Atria', cover: 'dense', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -45, maxX: 40, minZ: -55, maxZ: -15 },
    anchors: [{ x: 0, z: -19 }, { x: -33, z: -24 }, { x: 32, z: -25 }, { x: -36, z: -47 }, { x: -16, z: -25 }] },   // median 6.0m
  { id: 'tangs-rotunda', name: 'TANGS frontage', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -165, maxX: -70, minZ: 5, maxZ: 70 },
    anchors: [{ x: -107, z: 22 }, { x: -156, z: 61 }, { x: -78, z: 61 }, { x: -156, z: 13 }, { x: -78, z: 31 }] },   // median 12.0m
  { id: 'ngee-ann', name: 'Ngee Ann forecourt', cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: 70, maxX: 170, minZ: -55, maxZ: 0 },
    anchors: [{ x: 117, z: -12 }, { x: 117, z: -20 }, { x: 162, z: -47 }, { x: 78, z: -9 }, { x: 156, z: -9 }] },   // median 8.2m
  { id: 'somerset-plaza', name: 'Somerset plaza', foodAnchors: [{ x: 0, z: 22 }, { x: -36, z: 9 }, { x: 42, z: 9 }], cover: 'broken', lootWeight: 2, botWeight: 1.5,
    bounds: { minX: -45, maxX: 50, minZ: 0, maxZ: 90 },
    anchors: [{ x: -8, z: 5 }, { x: 0, z: 22 }, { x: 42, z: 81 }, { x: -36, z: 81 }, { x: 42, z: 37 }] },   // median 10.0m
  { id: 'emerald-hill', name: 'Emerald Hill terrace', cover: 'broken', lootWeight: 1.5, tierBias: 1, botWeight: 1,
    bounds: { minX: 70, maxX: 165, minZ: 20, maxZ: 110 },
    anchors: [{ x: 117, z: 36 }, { x: 156, z: 101 }, { x: 78, z: 85 }, { x: 156, z: 57 }, { x: 120, z: 79 }] },   // median 10.0m
  { id: 'scotts-junction', name: 'Scotts junction', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: -225, maxX: -140, minZ: -35, maxZ: 50 },
    anchors: [{ x: -170, z: 5 }, { x: -216, z: 41 }, { x: -216, z: -27 }, { x: -152, z: 41 }, { x: -150, z: -27 }] },   // median 12.6m
  { id: 'orchard-underpass', name: 'Orchard underpass', cover: 'broken', lootWeight: 1, tierBias: 1, botWeight: 1,
    bounds: { minX: 20, maxX: 105, minZ: -80, maxZ: -15 },
    anchors: [{ x: 60, z: -40 }, { x: 36, z: -71 }, { x: 94, z: -23 }, { x: 76, z: -71 }, { x: 30, z: -23 }] },   // median 10.0m
  { id: 'dhoby-ghaut', name: 'Dhoby Ghaut green', cover: 'open', lootWeight: 1.5, botWeight: 1,
    bounds: { minX: 150, maxX: 255, minZ: 10, maxZ: 110 },
    anchors: [{ x: 205, z: 60 }, { x: 158, z: 19 }, { x: 158, z: 101 }, { x: 246, z: 19 }, { x: 246, z: 101 }] },   // median 34.1m
];

/** Every district is sectored. HarbourFront's were written by hand as the pilot. */
export const REGION_SECTORS: Record<WorldZoneId, readonly ZoneSector[]> = {
  'marina-bay': MARINA_BAY_SECTORS,
  'raffles-place': RAFFLES_PLACE_SECTORS,
  'queenstown': QUEENSTOWN_SECTORS,
  'chinatown': CHINATOWN_SECTORS,
  'kampong-glam': KAMPONG_GLAM_SECTORS,
  'jurong-lake': JURONG_LAKE_SECTORS,
  'changi': CHANGI_SECTORS,
  'upper-thomson': UPPER_THOMSON_SECTORS,
  'punggol': PUNGGOL_SECTORS,
  'sentosa': SENTOSA_SECTORS,
  'geylang': GEYLANG_SECTORS,
  'tuas': TUAS_SECTORS,
  'woodlands': WOODLANDS_SECTORS,
  'tampines': TAMPINES_SECTORS,
  'toa-payoh': TOA_PAYOH_SECTORS,
  'bukit-timah': BUKIT_TIMAH_SECTORS,
  'bishan': BISHAN_SECTORS,
  'orchard': ORCHARD_SECTORS,
  harbourfront: HARBOURFRONT_SECTORS,
};
