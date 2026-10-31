import { queenstownTerrainHeight } from './queenstown-terrain';
import type { PlaceFixture, VerticalPlace } from './vertical-places';

import { QUEENSTOWN_HDB_BLOCKS, HDB_GALLERY_LEVELS, HDB_WIDTH, HDB_CORE_OFFSET, queenstownGroundFloors } from './queenstown-housing-layout';
export { QUEENSTOWN_HDB_BLOCKS, HDB_GALLERY_LEVELS, HDB_WIDTH, HDB_CORE_OFFSET } from './queenstown-housing-layout';

/** Structure and collision have one source. Decorative facades live in the scene. */
export const QUEENSTOWN_HOUSING_PLACES: VerticalPlace[] = QUEENSTOWN_HDB_BLOCKS.map(block => {
  const { x, z, color } = block, top = block.storeys * 2.8 + 3.4;
  const fixtures: PlaceFixture[] = [];
  const fixture = (px: number, py: number, pz: number, width: number, height: number, depth: number, tint = '#ece7d6') =>
    fixtures.push({ x: px, y: py, z: pz, width, height, depth, color: tint });
  // The apartment mass starts above the deck and ends behind a genuine external
  // access corridor. A floor plate inside a sealed housing mass is not a room.
  fixture(x, (3.4 + top) / 2, z - 1.5, HDB_WIDTH, top - 3.4, 12);
  // The gallery floors themselves supply the remaining ceiling strip. Do not
  // stack identical slabs there: coincident faces flicker at walking height.
  fixture(x, 3.27, z - 1.5, HDB_WIDTH, .26, 12, '#b6b5a7');
  fixture(x, 8.87, z + 6.5, HDB_WIDTH, .26, 4, '#b6b5a7');
  // Ground piers stop at the deck soffit; the lobby and seats have finite
  // height, so their old infinite columns cannot block the galleries above.
  for (const dx of [-25, -13, 0, 13, 25]) {
    for (const dz of [-5.8, 5.8]) fixture(x + dx, 1.42, z + dz, .85, 2.84, .85);
    fixture(x + dx, 2.99, z + .5, .85, .3, 16, '#b6b5a7');
  }
  fixture(x + 19, 1.57, z - .6, 5.6, 3.14, 4.8, color);
  fixture(x - 13, .28, z - 4.5, 4, .56, 1.2, '#b6b5a7');
  fixture(x - 13, .86, z - 4.95, 4, .6, .2, '#b3816c');
  for (let floor = 0; floor < block.storeys; floor++) {
    const y = 3.4 + floor * 2.8;
    if (floor > 2) fixture(x, y - .13, z + 6.5, HDB_WIDTH, .26, 4, '#b6b5a7');
    const parapet = block.id === 'commonwealth' && floor % 3 === 0 ? '#c58c77' : color;
    fixture(x, y + .525, z + 8.4, HDB_WIDTH, 1.05, .2, parapet);
    for (const dx of [-25, -13, 0, 13, 25]) fixture(x + dx, y + 1.4, z + 8.35, .3, 2.8, .3);
  }
  const place: VerticalPlace = {
    id: `queenstown-${block.id}-housing`, name: `${block.label} void deck and access galleries`,
    note: 'Open ground deck, private apartment fronts and two accessible residential corridors with sheltered return stairs; compressed gameplay adaptation.',
    floors: [
      ...queenstownGroundFloors(block),
      ...HDB_GALLERY_LEVELS.map(y => ({ id: `access-gallery-${y}`, x, z: z + 6.5, y, width: HDB_WIDTH, depth: 4, rails: false, supports: false, color: '#c5c8c3' })),
    ], connections: [], fixtures,
  };
  for (const side of [-1, 1]) {
    const cx = x + side * HDB_CORE_OFFSET, core = side < 0 ? 'west' : 'east';
    place.floors = [...place.floors,
      ...HDB_GALLERY_LEVELS.flatMap((y, i) => {
        const base = i ? HDB_GALLERY_LEVELS[i - 1] : 0;
        return [
          { id: `${core}-turn-${y}`, x: cx, z: z - 1.25, y: (base + y) / 2, width: 8.4, depth: 2.5, supports: false, color: '#c5c8c3' },
          { id: `${core}-landing-${y}`, x: cx, z: z + 6.5, y, width: 8.4, depth: 4, supports: false, color: '#c5c8c3' },
        ];
      }),
    ];
    for (const [i, y] of HDB_GALLERY_LEVELS.entries()) {
      const base = i ? HDB_GALLERY_LEVELS[i - 1] : 0, mid = (base + y) / 2;
      place.connections = [...place.connections,
        { id: `${core}-out-${y}`, from: { x: cx - 2.1, y: base, z: z + 4.5 }, to: { x: cx - 2.1, y: mid, z }, width: 3.2, stairs: true },
        { id: `${core}-return-${y}`, from: { x: cx + 2.1, y: mid, z }, to: { x: cx + 2.1, y, z: z + 4.5 }, width: 3.2, stairs: true },
      ];
    }
    // Enclosed back/party wall, ventilated outer side and a real overhead slab.
    // The side adjoining the block is open at the gallery landings.
    fixture(cx, 4.37, z - 2.65, 8.8, 8.74, .3);
    fixture(cx - side * 4.2, 4.37, z + .85, .25, 8.74, 7);
    fixture(cx, 4.37, z + 2.25, .24, 8.74, 3.9, '#b6b5a7');
    for (const dz of [-2.4, 2.5, 8.35]) fixture(cx + side * 4.2, 4.37, z + dz, .35, 8.74, .35);
    for (const y of [0, ...HDB_GALLERY_LEVELS]) fixture(cx + side * 4.2, y + .5, z + 3, .25, 1, 11, color);
    fixture(cx, 8.87, z + 3, 8.8, .26, 11.6, '#b6b5a7');
    // The stair tower continues visually to the block roof. Access above the
    // first two housing storeys is deliberately not inferred by the walker.
    fixture(cx, (9 + top) / 2, z + 3, 8.4, top - 9, 11, color);
    fixture(cx, top + .3, z + 3, 9, .6, 11.6, '#b6b5a7');
  }
  const base = queenstownTerrainHeight(x,z);
  return { ...place,
    floors: place.floors.map(f=>({...f,y:f.y+base})),
    connections: place.connections.map(c=>({...c,from:{...c.from,y:c.from.y+base},to:{...c.to,y:c.to.y+base}})),
    fixtures: place.fixtures?.map(f=>({...f,y:f.y+base})),
  };
});
