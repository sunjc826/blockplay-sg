import type { VerticalPlace } from './vertical-places';

/** Authored residential landscape, not surveyed present-day terrain. */
export const QUEENSTOWN_PATHS = [
  // Pavements on both sides of the inner estate road were missing entirely.
  ...[-149, -131, 131, 149].map(x => ({ x, z: -3, width: 3, depth: 238 })),
  // Links from the outer sidewalks to the estate: deliberate junctions, not a
  // uniform paved grid. Existing roads supply the pedestrian crossings.
  ...[-104, -4, 84].map(z => ({ x: -188, z, width: 75, depth: 3.2 })),
  ...[-102, -6, 94].map(z => ({ x: 188, z, width: 75, depth: 3.2 })),
  { x: -139, z: -137, width: 80, depth: 3.2 },
  { x: -164, z: 145, width: 60, depth: 3.2 },
  ...[-119, -32].map(x => ({ x, z: -52, width: 3.2, depth: 120 })),
  ...[37, 120].map(x => ({ x, z: -40, width: 3.2, depth: 96 })),
  ...[-119, -32, 37, 120].map(x => ({ x, z: 109, width: 3.2, depth: 142 })),
  ...[-34, -73].map(z => ({ x: -75, z, width: 88, depth: 3.2 })),
  { x: -91, z: -143, width: 76, depth: 3.2 },
  { x: 78, z: 161, width: 84, depth: 3.2 },
  // East/west paths join the station, deck paths and civic court.
  { x: 0, z: -88, width: 240, depth: 3.2 },
  { x: 0, z: 58, width: 240, depth: 3.2 },
] as const;

export const QUEENSTOWN_BANKS = [
  { id: 'west-common', x: -197, z: -26, width: 42, depth: 36, height: 2.8 },
  { id: 'west-garden', x: -194, z: 110, width: 42, depth: 40, height: 3.2 },
  { id: 'east-library', x: 184, z: -133, width: 42, depth: 44, height: 3 },
  { id: 'east-common', x: 188, z: -32, width: 42, depth: 36, height: 2.8 },
  { id: 'dawson-green', x: 174, z: 72, width: 30, depth: 32, height: 2.6 },
  { id: 'gateway-west', x: -31, z: -157, width: 26, depth: 32, height: 2.4 },
  { id: 'gateway-east', x: 145, z: -156, width: 30, depth: 34, height: 2.8 },
  { id: 'court-garden', x: 51, z: -42, width: 20, depth: 22, height: 2.1 },
  { id: 'estate-courtyard', x: -74, z: -63, width: 42, depth: 16, height: 1.6 },
] as const;

export function queenstownTerrainHeight(x: number, z: number) {
  let height = 0;
  for (const b of QUEENSTOWN_BANKS) {
    const hx=b.width/2,hz=b.depth/2,cx=Math.min(4,hx*.25),cz=Math.min(5,hz*.25);
    const rise=Math.max(0,Math.min(1,(hx-Math.abs(x-b.x))/(hx-cx),(hz-Math.abs(z-b.z))/(hz-cz)));
    height=Math.max(height,b.height*rise);
  }
  return height;
}

export const QUEENSTOWN_BANK_PATHS = [
  {axis:'x',x:-187,z:-26,length:76}, {axis:'x',x:-187,z:110,length:76},
  {axis:'x',x:187,z:-133,length:76}, {axis:'x',x:187,z:-32,length:76},
  {axis:'z',x:174,z:71,length:46}, {axis:'z',x:-31,z:-150,length:70},
  {axis:'z',x:145,z:-156,length:40}, {axis:'x',x:-75.5,z:-63,length:87},
  {axis:'x',x:50,z:-42,length:26},
] as const;

/** Four broad, continuous earth slopes and a small crest, all traversable.
 * Trapezoids meet along their diagonal seams: no empty bounding-box corners,
 * floating terrain tops, stairs, rails or vertical cliff perimeter. */
export const QUEENSTOWN_LANDSCAPE_PLACES: VerticalPlace[] = QUEENSTOWN_BANKS.map(bank => {
  const { id, x, z, width, depth, height } = bank;
  const halfX = width / 2, halfZ = depth / 2;
  const crestX = Math.min(4, halfX * .25), crestZ = Math.min(5, halfZ * .25);
  const color = '#7f9863';
  return {
    id: `queenstown-${id}-terrain`, name: `${id.replaceAll('-', ' ')} planted earth bank`,
    note: 'Authored gentle residential earthwork with four-sided walkable slopes; interrupts low sightlines without changing the street datum.',
    floors: [{ id: 'crest', x, z, y: height, width: crestX * 2, depth: crestZ * 2,
      foundation: 'solid', rails: false, color,
      outline: [{ x: x - crestX, z: z - crestZ }, { x: x + crestX, z: z - crestZ }, { x: x + crestX, z: z + crestZ }, { x: x - crestX, z: z + crestZ }] }],
    connections: [
      // Connection width is the narrowest usable crossing at the crest; the
      // outline still renders/supports the entire flared earth slope.
      ...([-1, 1] as const).map(side => ({ id: `slope-x-${side}`, width: crestZ * 2,
        from: { x: x + side * halfX, y: 0, z }, to: { x: x + side * crestX, y: height, z },
        foundation: 'solid' as const, rails: false, color,
        outline: [{ x: x + side * halfX, z: z - halfZ }, { x: x + side * crestX, z: z - crestZ }, { x: x + side * crestX, z: z + crestZ }, { x: x + side * halfX, z: z + halfZ }],
      })),
      ...([-1, 1] as const).map(side => ({ id: `slope-z-${side}`, width: crestX * 2,
        from: { x, y: 0, z: z + side * halfZ }, to: { x, y: height, z: z + side * crestZ },
        foundation: 'solid' as const, rails: false, color,
        outline: [{ x: x - halfX, z: z + side * halfZ }, { x: x - crestX, z: z + side * crestZ }, { x: x + crestX, z: z + side * crestZ }, { x: x + halfX, z: z + side * halfZ }],
      })),
    ],
  };
});

// Supplemental shade trees at path junctions and the edges of large lawns.
// Mature trunks offer local cover; high crowns leave the walking view open.
export const QUEENSTOWN_SHADE_TREES = [
  [-218,-109],[-176,-109],[-218,-6],[-174,-6],[-218,80],[-173,80],
  [160,-106],[210,-106],[160,-6],[216,-6],[156,94],[216,94],
  [-126,-102],[-39,-101],[-126,-16],[-39,-16],[-126,53],[-39,53],
  [44,-84],[127,-84],[44,5],[127,5],[44,97],[127,97],[44,171],[127,171],
  [-220,159],[-166,159],[156,167],[218,167],[-50,-177],[47,-177],
  [-225,-157],[-164,-155],[172,-176],[216,-176],
  [-97,-25],[-65,-25],[62,61],[94,61],
] as const;

/** Broken beds, 0.85–1.5m high, deliberately below standing eye height.
 * Keep several metres between beds so paths have frequent lateral exits. */
export const QUEENSTOWN_SHRUB_BEDS = [
  ...[-104, -4, 84].flatMap(z => [-212,-196,-180].map((x, i) => ({ x, z: z + 3.6, width: 7, depth: 2.2, height: i % 2 ? 1.4 : .9 }))),
  ...[-102, -6, 94].flatMap(z => [168,184,200,216].map((x, i) => ({ x, z: z + 3.6, width: 7, depth: 2.2, height: i % 2 ? 1.45 : .85 }))),
  ...[-108,-92,-60,-28,4,44,60,100,132,172].flatMap((z, i) => [-124,125].map(x => ({ x, z, width: 2.2, depth: 7, height: i % 3 ? 1.35 : .9 }))),
  ...[-104,-84,-64,-44,48,68,88,108].map((x, i) => ({ x, z: 62, width: 7, depth: 2.2, height: i % 2 ? 1.4 : .9 })),
  ...[-106,-90,-74,-58,-42].map((x,i) => ({x,z:-28,width:7,depth:2.2,height:i%2?1.35:.85})),
  ...[-103,-87,-71,-55].map((x,i) => ({x,z:-69,width:6,depth:1.8,height:i%2?.9:1.35})),
] as const;
