import type { VerticalPlace, PlaceConnection, PlaceFixture, PlaceFloor } from './vertical-places';
import { MARINA_BRIDGE_PIERS } from './marina-water';

/**
 * Stairs here rise no steeper than 3 in 8: a wide walker stepping between a
 * flight and its landing has to stay within the 0.35 m step height.
 */
const STAIR_RUN = 8 / 3;

/**
 * Ground-level routes with a change of height, in game metres. The district's
 * base ground is flat; these are the places where a walk round the bay climbs,
 * crosses or looks down. Authored gameplay geometry inspired by the waterfront,
 * not surveyed levels.
 */

/** A footbridge over the bay's northern third, between the west quay and the museum side. */
export const MARINA_HELIX = { z: -36, deck: 3.6, halfSpan: 55, width: 5, stairX: 52, stairWidth: 4, stairRun: 3.6 * STAIR_RUN };
const helix = MARINA_HELIX, deckColor = '#b9b5a8', steel = '#8f999c';
const helixBridge: VerticalPlace = {
  id: 'helix-bridge', name: 'Helix Bridge',
  note: 'Raised crossing over the bay with two viewing pods; stairs climb to it from the quay on both shores, north and south of each landing.',
  floors: [
    // Five bays rather than one long floor: each bay carries its own route samples,
    // so bots find the pod openings and stair heads along the span.
    ...[-2, -1, 0, 1, 2].map((bay): PlaceFloor => ({ id: `span-${bay + 2}`, x: bay * helix.halfSpan * .4, z: helix.z, y: helix.deck, width: helix.halfSpan * .4, depth: helix.width, color: deckColor, supports: false })),
    ...[-20, 20].map((x, i): PlaceFloor => ({ id: `pod-${i}`, x, z: helix.z + helix.width / 2 + 1.5, y: helix.deck, width: 7, depth: 3, color: deckColor, supports: false })),
  ],
  connections: [-1, 1].flatMap(side => [-1, 1].map((dir): PlaceConnection => ({
    id: `${side < 0 ? 'west' : 'east'}-${dir < 0 ? 'north' : 'south'}-stair`, width: helix.stairWidth, stairs: true, color: '#aeb0aa',
    from: { x: side * helix.stairX, y: helix.deck, z: helix.z + dir * helix.width / 2 },
    to: { x: side * helix.stairX, y: 0, z: helix.z + dir * (helix.width / 2 + helix.stairRun) },
  }))),
  fixtures: [
    // Quay abutments and landing posts; the shore walk continues beneath the landing.
    ...[-1, 1].flatMap((side): PlaceFixture[] => [
      { x: side * 49.3, y: (helix.deck - .26) / 2, z: helix.z, width: 1, height: helix.deck - .26, depth: helix.width, color: '#a9a69b' },
      ...[-1, 1].map(end => ({ x: side * 54.6, y: (helix.deck - .26) / 2, z: helix.z + end * (helix.width / 2 - .3), width: .4, height: helix.deck - .26, depth: .4, color: steel })),
    ]),
    // Piers stand in the water; boats steer round them (see `canPaddle`).
    ...MARINA_BRIDGE_PIERS.map((p): PlaceFixture => ({ x: (p.minX + p.maxX) / 2, y: (helix.deck - .26 - 1.9) / 2, z: (p.minZ + p.maxZ) / 2,
      width: p.maxX - p.minX, height: helix.deck - .26 + 1.9, depth: p.maxZ - p.minZ, color: '#a9a69b' })),
    // Pod benches: low cover facing the bay.
    ...[-20, 20].map((x): PlaceFixture => ({ x, y: helix.deck + .25, z: helix.z + helix.width / 2 + 2.2, width: 4, height: .5, depth: .6, color: '#766257' })),
  ],
};

/**
 * The theatres stand on a concourse 2.4 m above the waterfront road, reached by
 * two tiers of steps broken by planted blocks, with side and rear stairs.
 */
export const MARINA_ESPLANADE = {
  minX: -52, maxX: 22, plazaZ: -72.2, foot: -82, terrace: { y: 1.2, minZ: -85.2, maxZ: -91 }, concourse: { y: 2.4, minZ: -94.2, maxZ: -118.2 },
  lowerFlights: [[-52, -32], [-26, -4], [2, 22]], lowerBlocks: [[-32, -26], [-4, 2]],
  upperFlights: [[-50, -40], [-25, -5], [10, 20]], upperBlocks: [[-52, -50], [-40, -25], [-5, 10], [20, 22]],
  seatWalls: [-33, 2.5],
} as const;
const esp = MARINA_ESPLANADE, stone = '#c6c2b5', paving = '#bcb8ab';
const terrace = (id: string, y: number, minZ: number, maxZ: number, color: string): PlaceFloor =>
  ({ id, x: (esp.minX + esp.maxX) / 2, z: (minZ + maxZ) / 2, y, width: esp.maxX - esp.minX, depth: Math.abs(maxZ - minZ), color, foundation: 'solid', rails: false, supports: false });
const flight = (id: string, [from, to]: readonly [number, number], y0: number, z0: number, y1: number, z1: number): PlaceConnection =>
  ({ id, from: { x: (from + to) / 2, y: y0, z: z0 }, to: { x: (from + to) / 2, y: y1, z: z1 }, width: to - from, stairs: true, rails: false, color: stone });
const esplanadeTerraces: VerticalPlace = {
  id: 'esplanade-terraces', name: 'Esplanade waterfront steps and theatre concourse',
  note: 'Stepped forecourt from the waterfront road up to the theatres. Planted blocks split the steps into separate flights and give cover on the way up.',
  floors: [
    terrace('terrace', esp.terrace.y, esp.terrace.minZ, esp.terrace.maxZ, paving),
    terrace('concourse', esp.concourse.y, esp.concourse.minZ, esp.concourse.maxZ, stone),
  ],
  connections: [
    ...esp.lowerFlights.map((span, i) => flight(`lower-steps-${i}`, span, 0, esp.foot, esp.terrace.y, esp.terrace.minZ)),
    ...esp.upperFlights.map((span, i) => flight(`upper-steps-${i}`, span, esp.terrace.y, esp.terrace.maxZ, esp.concourse.y, esp.concourse.minZ)),
    { id: 'west-stair', from: { x: esp.minX, y: esp.concourse.y, z: -108 }, to: { x: esp.minX - 2.4 * STAIR_RUN, y: 0, z: -108 }, width: 6, stairs: true, color: stone },
    { id: 'east-stair', from: { x: esp.maxX, y: esp.concourse.y, z: -108 }, to: { x: esp.maxX + 2.4 * STAIR_RUN, y: 0, z: -108 }, width: 6, stairs: true, color: stone },
    // Between the two shells, down to the ring road behind.
    { id: 'north-stair', from: { x: -15, y: esp.concourse.y, z: esp.concourse.maxZ }, to: { x: -15, y: 0, z: esp.concourse.maxZ - 2.4 * STAIR_RUN }, width: 8, stairs: true, color: stone },
  ],
  fixtures: [
    ...esp.lowerBlocks.map(([from, to]): PlaceFixture => ({ x: (from + to) / 2, y: esp.terrace.y / 2, z: (esp.foot + esp.terrace.minZ) / 2,
      width: to - from, height: esp.terrace.y, depth: esp.foot - esp.terrace.minZ, color: stone, supportsTop: true })),
    ...esp.upperBlocks.map(([from, to]): PlaceFixture => ({ x: (from + to) / 2, y: esp.concourse.y / 2, z: (esp.terrace.maxZ + esp.concourse.minZ) / 2,
      width: to - from, height: esp.concourse.y, depth: esp.terrace.maxZ - esp.concourse.minZ, color: stone, supportsTop: true })),
    // Seat walls on the middle terrace, off the axes of the flights: crouch-height cover halfway up.
    ...esp.seatWalls.map((x): PlaceFixture => ({ x, y: esp.terrace.y + .45, z: -88.5, width: 8, height: .9, depth: .8, color: '#a9a69b', supportsTop: true })),
  ],
};

/**
 * The east half of the south promenade steps up to a planted lawn between the
 * boardwalk and the road: high ground over the bay, a wall to the road, ramps at
 * both ends. The west half stays level for the firing range and vehicle bays.
 */
export const MARINA_LAWN = { minX: 22.4, maxX: 52, minZ: 42.8, maxZ: 47.6, y: 1.2, foot: 39.6, flights: [[22.4, 35], [39, 52]], block: [35, 39], ramp: 4.8 } as const;
const lawn = MARINA_LAWN, lawnZ = (lawn.minZ + lawn.maxZ) / 2, lawnDepth = lawn.maxZ - lawn.minZ;
const promenadeLawn: VerticalPlace = {
  id: 'promenade-lawn', name: 'Promenade lawn terrace',
  note: 'Raised lawn with bay-side steps and a ramp at each end.',
  floors: [{ id: 'lawn', x: (lawn.minX + lawn.maxX) / 2, z: lawnZ, y: lawn.y, width: lawn.maxX - lawn.minX, depth: lawnDepth, color: '#7c8f5c', foundation: 'solid', rails: false, supports: false }],
  connections: [
    ...lawn.flights.map((span, i) => flight(`bay-steps-${i}`, span, 0, lawn.foot, lawn.y, lawn.minZ)),
    { id: 'west-ramp', from: { x: lawn.minX - lawn.ramp, y: 0, z: lawnZ }, to: { x: lawn.minX, y: lawn.y, z: lawnZ }, width: lawnDepth, foundation: 'solid', rails: false, color: paving },
    { id: 'east-ramp', from: { x: lawn.maxX, y: lawn.y, z: lawnZ }, to: { x: lawn.maxX + lawn.ramp, y: 0, z: lawnZ }, width: lawnDepth, foundation: 'solid', rails: false, color: paving },
  ],
  fixtures: [{ x: (lawn.block[0] + lawn.block[1]) / 2, y: lawn.y / 2, z: (lawn.foot + lawn.minZ) / 2, width: lawn.block[1] - lawn.block[0], height: lawn.y, depth: lawn.minZ - lawn.foot, color: stone, supportsTop: true }],
};

export const MARINA_ROUTE_PLACES: readonly VerticalPlace[] = [helixBridge, esplanadeTerraces, promenadeLawn];
